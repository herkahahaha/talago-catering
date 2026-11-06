import { sql } from 'drizzle-orm';
import type { Executor } from '../../db/client';
import { recordAudit } from '../audit/index';

export type Partition = 'regular' | 'po';

export interface ExpiredOrder {
  id: string;
  orderNo: string;
  customerId: string;
  portions: number;
  source: string;
  deliveryWindowId: string | null;
}

export interface ExpireResult {
  orders: ExpiredOrder[];
  regularReleased: number;
  poReleased: number;
}

const PARTITION_COLUMNS = {
  regular: { reserved: 'reserved_regular', held: 'held_regular', max: 'max_regular' },
  po: { reserved: 'reserved_po', held: 'held_po', max: 'max_po' },
} as const;

export type ReserveFailure = 'not_found' | 'day_closed' | 'cutoff_passed' | 'capacity_full' | 'hold_ceiling';

export interface ReserveOutcome {
  ok: boolean;
  reason?: ReserveFailure;
  reserved?: number;
  max?: number;
  remaining?: number;
}

export interface ReserveOptions {
  date: string;
  portions: number;
  partition: Partition;
  /** true untuk alur web (slot ditahan); false untuk PO/manual yang langsung lunas. */
  hold: boolean;
  /** Admin boleh menembus cut-off dengan konfirmasi + audit. */
  ignoreCutoff?: boolean;
}

/**
 * Melepas semua hold kedaluwarsa pada satu tanggal, lalu mengembalikan
 * porsinya ke partisi. Dijalankan di dalam transaksi reservasi yang sama
 * (PRD §4.2): kebenaran tidak bergantung pada job pembersih.
 *
 * `UPDATE ... WHERE status = 'pending_payment'` membuat pelepasan ini
 * idempoten walau dua transaksi berjalan bersamaan: baris yang sudah
 * diubah transaksi lain tidak lagi memenuhi predikat setelah lock dilepas.
 */
export async function expireStaleHolds(exec: Executor, date: string): Promise<ExpireResult> {
  const result = await exec.execute(sql`
    UPDATE orders
    SET status = 'expired', updated_at = now()
    WHERE service_date = ${date}
      AND status = 'pending_payment'
      AND hold_expires_at IS NOT NULL
      AND hold_expires_at < now()
    RETURNING id, order_no, customer_id, portions, source, delivery_window_id
  `);

  const orders: ExpiredOrder[] = (result.rows as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id),
    orderNo: String(row.order_no),
    customerId: String(row.customer_id),
    portions: Number(row.portions),
    source: String(row.source),
    deliveryWindowId: (row.delivery_window_id as string | null) ?? null,
  }));

  if (orders.length === 0) {
    return { orders, regularReleased: 0, poReleased: 0 };
  }

  const regularReleased = orders.filter((o) => o.source !== 'po').reduce((sum, o) => sum + o.portions, 0);
  const poReleased = orders.filter((o) => o.source === 'po').reduce((sum, o) => sum + o.portions, 0);

  if (regularReleased > 0) {
    await exec.execute(sql`
      UPDATE daily_capacity
      SET reserved_regular = GREATEST(reserved_regular - ${regularReleased}, 0),
          held_regular = GREATEST(held_regular - ${regularReleased}, 0),
          updated_at = now()
      WHERE service_date = ${date}
    `);
  }
  if (poReleased > 0) {
    await exec.execute(sql`
      UPDATE daily_capacity
      SET reserved_po = GREATEST(reserved_po - ${poReleased}, 0),
          held_po = GREATEST(held_po - ${poReleased}, 0),
          updated_at = now()
      WHERE service_date = ${date}
    `);
  }

  const windowCounts = new Map<string, number>();
  for (const order of orders) {
    if (!order.deliveryWindowId) continue;
    windowCounts.set(order.deliveryWindowId, (windowCounts.get(order.deliveryWindowId) ?? 0) + 1);
  }
  for (const [windowId, count] of windowCounts) {
    await exec.execute(sql`
      UPDATE delivery_windows
      SET stops_used = GREATEST(stops_used - ${count}, 0)
      WHERE id = ${windowId}
    `);
  }

  for (const order of orders) {
    await recordAudit(exec, {
      actor: { type: 'system', label: 'hold-expiry' },
      entity: 'order',
      entityId: order.id,
      action: 'status_expired',
      before: { status: 'pending_payment' },
      after: { status: 'expired', orderNo: order.orderNo, portions: order.portions },
    });
  }

  return { orders, regularReleased, poReleased };
}

/**
 * Reservasi atomik. Satu-satunya jalan menambah reserved/held.
 * 0 baris = partisi penuh / tutup / lewat cut-off / plafon hold.
 */
export async function reservePortions(exec: Executor, options: ReserveOptions): Promise<ReserveOutcome> {
  const columns = PARTITION_COLUMNS[options.partition];
  const portions = options.portions;
  const holdIncrement = options.hold ? portions : 0;
  const cutoffClause = options.ignoreCutoff ? sql`` : sql`AND now() < cut_off_at`;

  const result = await exec.execute(sql`
    UPDATE daily_capacity
    SET ${sql.raw(columns.reserved)} = ${sql.raw(columns.reserved)} + ${portions},
        ${sql.raw(columns.held)} = ${sql.raw(columns.held)} + ${holdIncrement},
        updated_at = now()
    WHERE service_date = ${options.date}
      AND is_open = true
      ${cutoffClause}
      AND ${sql.raw(columns.reserved)} + ${portions} <= ${sql.raw(columns.max)}
      AND ${sql.raw(columns.held)} + ${holdIncrement} <= hold_ceiling
    RETURNING ${sql.raw(columns.reserved)} AS reserved, ${sql.raw(columns.max)} AS max
  `);

  const row = result.rows[0] as { reserved?: number | string; max?: number | string } | undefined;
  if (row) {
    const reserved = Number(row.reserved);
    const max = Number(row.max);
    return { ok: true, reserved, max, remaining: max - reserved };
  }

  return { ok: false, ...(await diagnoseReserveFailure(exec, options)) };
}

async function diagnoseReserveFailure(
  exec: Executor,
  options: ReserveOptions,
): Promise<{ reason: ReserveFailure; remaining?: number }> {
  const columns = PARTITION_COLUMNS[options.partition];
  const result = await exec.execute(sql`
    SELECT is_open,
           cut_off_at,
           ${sql.raw(columns.reserved)} AS reserved,
           ${sql.raw(columns.max)} AS max,
           ${sql.raw(columns.held)} AS held,
           hold_ceiling
    FROM daily_capacity
    WHERE service_date = ${options.date}
  `);
  const row = result.rows[0] as
    | {
        is_open: boolean;
        cut_off_at: string;
        reserved: number | string;
        max: number | string;
        held: number | string;
        hold_ceiling: number | string;
      }
    | undefined;

  if (!row) return { reason: 'not_found' };
  if (!row.is_open) return { reason: 'day_closed' };

  const cutoffAt = new Date(row.cut_off_at);
  if (!options.ignoreCutoff && cutoffAt.getTime() <= Date.now()) {
    return { reason: 'cutoff_passed' };
  }

  const reserved = Number(row.reserved);
  const max = Number(row.max);
  if (reserved + options.portions > max) {
    return { reason: 'capacity_full', remaining: Math.max(max - reserved, 0) };
  }

  const held = Number(row.held);
  const holdIncrement = options.hold ? options.portions : 0;
  if (held + holdIncrement > Number(row.hold_ceiling)) {
    return { reason: 'hold_ceiling', remaining: Math.max(Number(row.hold_ceiling) - held, 0) };
  }

  return { reason: 'capacity_full', remaining: Math.max(max - reserved, 0) };
}

export interface ReleaseOptions {
  date: string;
  portions: number;
  partition: Partition;
  /** true bila order masih berstatus hold (porsi ada di held_*). */
  held: boolean;
}

/** Melepas porsi saat order batal/kedaluwarsa. Idempoten terhadap status order. */
export async function releasePortions(exec: Executor, options: ReleaseOptions): Promise<void> {
  const columns = PARTITION_COLUMNS[options.partition];
  const heldDecrement = options.held ? options.portions : 0;
  await exec.execute(sql`
    UPDATE daily_capacity
    SET ${sql.raw(columns.reserved)} = GREATEST(${sql.raw(columns.reserved)} - ${options.portions}, 0),
        ${sql.raw(columns.held)} = GREATEST(${sql.raw(columns.held)} - ${heldDecrement}, 0),
        updated_at = now()
    WHERE service_date = ${options.date}
  `);
}

/** Dipakai setelah pembayaran sukses: porsi pindah dari "held" ke "reserved". */
export async function settleHeldPortions(
  exec: Executor,
  options: {
    date: string;
    portions: number;
    partition: Partition;
  },
): Promise<void> {
  const columns = PARTITION_COLUMNS[options.partition];
  await exec.execute(sql`
    UPDATE daily_capacity
    SET ${sql.raw(columns.held)} = GREATEST(${sql.raw(columns.held)} - ${options.portions}, 0),
        updated_at = now()
    WHERE service_date = ${options.date}
  `);
}
