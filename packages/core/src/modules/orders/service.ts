import { and, eq, inArray, lt, sql } from 'drizzle-orm';
import type { OrderSource } from '@catering/contracts';
import { idempotencyKeys, orderItems, orders } from './schema';
import type { Executor } from '../../db/client';
import { AppError, hashToken, makeOrderNo } from '../../lib/ids';
import { getDayRow } from '../capacity/index';
import {
  expireStaleHolds,
  releasePortions,
  reservePortions,
  settleHeldPortions,
  type Partition,
} from '../capacity/index';
import { createDeliveryForOrder, reserveStop, releaseStop } from '../delivery/index';
import { partitionForSource } from './state';
import { recordAudit } from '../audit/index';
import { enqueueNotification } from '../notifications/index';
import { getCustomerById } from '../customers/index';
import type { OrderStatus } from '@catering/contracts';

export type OrderRow = typeof orders.$inferSelect;
export type OrderItemRow = typeof orderItems.$inferSelect;

export interface PricedOrderItem {
  menuItemId: string;
  nameSnapshot: string;
  unitPrice: number;
  portions: number;
  lineTotal: number;
}

export interface CreatePendingOrderInput {
  customerId: string;
  serviceDate: string;
  source: OrderSource;
  /** Token mentah; hanya hash yang disimpan. */
  statusToken: string;
  items: PricedOrderItem[];
  portions: number;
  subtotal: number;
  deliveryFee: number;
  total: number;
  deliveryWindowId: string | null;
  addressLine: string;
  district: string | null;
  recipientName: string | null;
  recipientPhone: string | null;
  notes: string | null;
  consentAt: Date;
  createdIp: string | null;
  hold: boolean;
  partition: Partition;
  holdMinutes: number;
  ignoreCutoff?: boolean;
}

export interface OrderActionActor {
  type: 'staff' | 'customer' | 'system' | 'webhook';
  id?: string | null;
  label: string;
  requestId?: string | null;
}

function mapReserveFailure(reason: string, remaining: number | undefined, date: string): AppError {
  switch (reason) {
    case 'cutoff_passed':
      return new AppError('CUTOFF_PASSED', `Pemesanan untuk ${date} sudah ditutup.`, {
        hint: 'Pilih tanggal lain yang masih dibuka.',
      });
    case 'day_closed':
      return new AppError('DAY_CLOSED', `Dapur tutup untuk ${date}.`, { hint: 'Pilih tanggal lain.' });
    case 'hold_ceiling':
      return new AppError('HOLD_LIMIT', 'Slot yang sedang ditahan sudah mencapai plafon.', {
        hint: 'Selesaikan pembayaran yang tertunda atau coba beberapa saat lagi.',
      });
    case 'capacity_full':
      return new AppError('CAPACITY_FULL', `Kapasitas ${date} sudah penuh.`, {
        hint:
          remaining !== undefined
            ? `Sisa ${remaining} porsi untuk tanggal tersebut.`
            : 'Pilih tanggal lain atau kurangi jumlah porsi.',
        details: remaining !== undefined ? { remaining } : undefined,
      });
    default:
      return new AppError('CAPACITY_FULL', `Kapasitas ${date} tidak tersedia.`);
  }
}

/**
 * Membuat order + reservasi atomik dalam satu transaksi:
 * lepas hold kedaluwarsa → reservasi partisi → reservasi stop → insert order.
 * Semua atau tidak sama sekali.
 */
export async function createPendingOrder(exec: Executor, input: CreatePendingOrderInput): Promise<OrderRow> {
  // Pemanggil WAJIB membungkus dengan transaksi (checkout facade).
  const tx = exec;
  // 1. Lepas hold kedaluwarsa tanggal ini (lazy expiry, PRD §4.2).
  const expired = await expireStaleHolds(tx, input.serviceDate);
  if (expired.orders.length > 0) {
    await notifyExpiredOrders(tx, expired.orders, input.serviceDate);
  }

  // 2. Reservasi partisi: satu UPDATE bersyarat yang tidak pernah
  //    melewati max maupun plafon hold.
  const outcome = await reservePortions(tx, {
    date: input.serviceDate,
    portions: input.portions,
    partition: input.partition,
    hold: input.hold,
    ...(input.ignoreCutoff ? { ignoreCutoff: true } : {}),
  });
  if (!outcome.ok) {
    throw mapReserveFailure(outcome.reason ?? 'capacity_full', outcome.remaining, input.serviceDate);
  }

  // 3. Reservasi stop jendela antar (bila dipilih).
  if (input.deliveryWindowId) {
    const reserved = await reserveStop(tx, input.deliveryWindowId);
    if (!reserved) {
      throw new AppError('CAPACITY_FULL', 'Jendela antar yang dipilih sudah penuh.', {
        hint: 'Pilih jendela antar lain.',
      });
    }
  }

  // 4. Header + item.
  const now = new Date();
  const holdExpiresAt = input.hold ? new Date(now.getTime() + input.holdMinutes * 60_000) : null;
  const order = await insertOrderWithRetry(tx, {
    ...input,
    status: input.hold ? 'pending_payment' : 'paid',
    holdExpiresAt,
    paidAt: input.hold ? null : now,
  });

  await createDeliveryForOrder(tx, {
    orderId: order.id,
    windowId: input.deliveryWindowId,
  });

  await tx.insert(orderItems).values(
    input.items.map((item) => ({
      orderId: order.id,
      menuItemId: item.menuItemId,
      nameSnapshot: item.nameSnapshot,
      unitPrice: item.unitPrice,
      portions: item.portions,
      lineTotal: item.lineTotal,
    })),
  );

  await recordAudit(tx, {
    actor: { type: 'customer', id: input.customerId, label: 'Pelanggan' },
    entity: 'order',
    entityId: order.id,
    action: 'order_created',
    after: {
      orderNo: order.orderNo,
      status: order.status,
      source: order.source,
      serviceDate: order.serviceDate,
      portions: order.portions,
      total: order.total,
    },
  });

  return order;
}

async function insertOrderWithRetry(
  tx: Executor,
  input: CreatePendingOrderInput & { status: OrderStatus; holdExpiresAt: Date | null; paidAt: Date | null },
): Promise<OrderRow> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const inserted = await tx
        .insert(orders)
        .values({
          orderNo: makeOrderNo(input.serviceDate),
          customerId: input.customerId,
          serviceDate: input.serviceDate,
          source: input.source,
          status: input.status,
          portions: input.portions,
          subtotal: input.subtotal,
          deliveryFee: input.deliveryFee,
          total: input.total,
          holdExpiresAt: input.holdExpiresAt,
          statusTokenHash: hashToken(input.statusToken),
          deliveryWindowId: input.deliveryWindowId,
          addressLine: input.addressLine,
          district: input.district,
          recipientName: input.recipientName,
          recipientPhone: input.recipientPhone,
          notes: input.notes,
          consentAt: input.consentAt,
          createdIp: input.createdIp,
          paidAt: input.paidAt,
        })
        .returning();
      if (inserted[0]) return inserted[0];
      throw new AppError('INTERNAL_ERROR', 'Gagal menyimpan order.');
    } catch (error) {
      lastError = error;
      // 23505 = unique_violation pada order_no; coba nomor lain.
      if ((error as { code?: string }).code !== '23505') throw error;
    }
  }
  throw lastError ?? new AppError('INTERNAL_ERROR', 'Gagal membuat nomor order.');
}

async function notifyExpiredOrders(
  exec: Executor,
  expired: Array<{ id: string; orderNo: string; customerId: string; portions: number }>,
  serviceDate: string,
): Promise<void> {
  for (const order of expired) {
    const customer = await getCustomerById(exec, order.customerId);
    if (!customer) continue;
    const payload = {
      orderNo: order.orderNo,
      serviceDate,
      portions: order.portions,
      customerName: customer.name,
    };
    if (customer.email) {
      await enqueueNotification(exec, {
        channel: 'email',
        recipient: customer.email,
        template: 'order_expired',
        payload,
      });
    }
    await enqueueNotification(exec, {
      channel: 'whatsapp',
      recipient: customer.phone,
      template: 'order_expired',
      payload,
    });
  }
}

/** Pembayaran lunas: porsi pindah dari held ke reserved (PRD §4.3 butir 3). */
export async function markOrderPaid(
  exec: Executor,
  orderId: string,
  options: { paidAt?: Date; actor?: OrderActionActor } = {},
): Promise<OrderRow> {
  const tx = exec;
  const [before] = await tx.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!before) throw new AppError('NOT_FOUND', 'Order tidak ditemukan.');
  if (before.status === 'paid') return before;

  const paidAt = options.paidAt ?? new Date();
  const [updated] = await tx
    .update(orders)
    .set({ status: 'paid', paidAt, updatedAt: new Date() })
    .where(eq(orders.id, orderId))
    .returning();
  if (!updated) throw new AppError('INTERNAL_ERROR', 'Gagal memperbarui order.');

  if (before.status === 'pending_payment') {
    await settleHeldPortions(tx, {
      date: before.serviceDate,
      portions: before.portions,
      partition: partitionForSource(before.source),
    });
  }

  await recordAudit(tx, {
    actor: options.actor ?? { type: 'webhook', label: 'payment-webhook' },
    entity: 'order',
    entityId: orderId,
    action: 'order_paid',
    before: { status: before.status },
    after: { status: 'paid', orderNo: before.orderNo, paidAt: paidAt.toISOString() },
  });

  await notifyOrderPaid(tx, updated);
  return updated;
}

export async function markOrderPaidAfterExpiry(
  exec: Executor,
  orderId: string,
  options: { paidAt?: Date } = {},
): Promise<OrderRow> {
  const [before] = await exec.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!before) throw new AppError('NOT_FOUND', 'Order tidak ditemukan.');
  const paidAt = options.paidAt ?? new Date();
  const [updated] = await exec
    .update(orders)
    .set({ status: 'paid_after_expiry', paidAt, updatedAt: new Date() })
    .where(eq(orders.id, orderId))
    .returning();
  if (!updated) throw new AppError('INTERNAL_ERROR', 'Gagal memperbarui order.');

  await recordAudit(exec, {
    actor: { type: 'webhook', label: 'payment-webhook' },
    entity: 'order',
    entityId: orderId,
    action: 'order_paid_after_expiry',
    before: { status: before.status },
    after: { status: 'paid_after_expiry', orderNo: before.orderNo, paidAt: paidAt.toISOString() },
  });

  await notifyPaidAfterExpiry(exec, updated);
  return updated;
}

async function notifyOrderPaid(exec: Executor, order: OrderRow): Promise<void> {
  const customer = await getCustomerById(exec, order.customerId);
  if (!customer) return;
  const payload = { orderNo: order.orderNo, total: order.total, serviceDate: order.serviceDate };
  if (customer.email) {
    await enqueueNotification(exec, {
      channel: 'email',
      recipient: customer.email,
      template: 'order_paid',
      payload,
    });
  }
  await enqueueNotification(exec, {
    channel: 'whatsapp',
    recipient: customer.phone,
    template: 'order_paid',
    payload,
  });
}

async function notifyPaidAfterExpiry(exec: Executor, order: OrderRow): Promise<void> {
  const customer = await getCustomerById(exec, order.customerId);
  if (!customer) return;
  const payload = { orderNo: order.orderNo, total: order.total, serviceDate: order.serviceDate };
  if (customer.email) {
    await enqueueNotification(exec, {
      channel: 'email',
      recipient: customer.email,
      template: 'order_paid_after_expiry',
      payload,
    });
  }
  await enqueueNotification(exec, {
    channel: 'whatsapp',
    recipient: customer.phone,
    template: 'order_paid_after_expiry',
    payload,
  });
}

/** Melepas porsi + stop ketika order dibatalkan/kedaluwarsa. Idempoten. */
export async function releaseOrderReservation(
  exec: Executor,
  order: OrderRow,
  actor: OrderActionActor,
  reason: string,
): Promise<void> {
  await releaseReservationInternal(exec, order, actor, reason);
}

async function releaseReservationInternal(
  exec: Executor,
  order: OrderRow,
  actor: OrderActionActor,
  reason: string,
): Promise<void> {
  await releasePortions(exec, {
    date: order.serviceDate,
    portions: order.portions,
    partition: partitionForSource(order.source),
    held: order.status === 'pending_payment',
  });
  if (order.deliveryWindowId) {
    await releaseStop(exec, order.deliveryWindowId);
  }
  await recordAudit(exec, {
    actor: { type: actor.type, id: actor.id ?? null, label: actor.label },
    entity: 'order',
    entityId: order.id,
    action: 'reservation_released',
    after: { orderNo: order.orderNo, portions: order.portions, reason },
  });
}

/** Membatalkan order sebelum cut-off; refund ditangani facade checkout. */
export async function cancelOrderState(
  exec: Executor,
  order: OrderRow,
  options: {
    actor: OrderActionActor;
    reason: string;
    byAdmin?: boolean;
    requestId?: string | null;
  },
): Promise<OrderRow> {
  const tx = exec;
  const [fresh] = await tx.select().from(orders).where(eq(orders.id, order.id)).limit(1);
  if (!fresh) throw new AppError('NOT_FOUND', 'Order tidak ditemukan.');

  if (fresh.status === 'cancelled_refunded') return fresh;
  if (fresh.status === 'expired') {
    throw new AppError('INVALID_STATE', 'Order sudah kedaluwarsa dan tidak bisa dibatalkan.', {
      hint: 'Porsi sudah dilepas kembali ke kapasitas.',
    });
  }

  const day = await getDayRow(tx, fresh.serviceDate);
  const cutoffPassed = day ? day.cutOffAt.getTime() <= Date.now() : false;
  if (cutoffPassed && !options.byAdmin) {
    throw new AppError('CUTOFF_PASSED', 'Cut-off sudah lewat; hubungi admin untuk membatalkan.', {
      hint: 'Admin dapat membatalkan dengan audit log.',
    });
  }

  const [updated] = await tx
    .update(orders)
    .set({
      status: 'cancelled_refunded',
      cancelledAt: new Date(),
      cancellationReason: options.reason,
      updatedAt: new Date(),
    })
    .where(eq(orders.id, fresh.id))
    .returning();
  if (!updated) throw new AppError('INTERNAL_ERROR', 'Gagal membatalkan order.');

  await releaseReservationInternal(tx, fresh, options.actor, options.reason);

  await recordAudit(tx, {
    actor: { type: options.actor.type, id: options.actor.id ?? null, label: options.actor.label },
    entity: 'order',
    entityId: fresh.id,
    action: 'order_cancelled',
    before: { status: fresh.status },
    after: { status: 'cancelled_refunded', orderNo: fresh.orderNo, reason: options.reason },
    requestId: options.requestId ?? options.actor.requestId ?? null,
  });

  return updated;
}

/** Worker: lepas semua hold kedaluwarsa (jaring pengaman; bukan sumber kebenaran). */
export async function sweepExpiredHolds(exec: Executor): Promise<number> {
  const due = await exec
    .selectDistinct({ serviceDate: orders.serviceDate })
    .from(orders)
    .where(and(eq(orders.status, 'pending_payment'), lt(orders.holdExpiresAt, new Date())))
    .limit(50);

  let count = 0;
  for (const row of due) {
    const result = await expireStaleHolds(exec, row.serviceDate);
    count += result.orders.length;
    if (result.orders.length > 0) {
      await notifyExpiredOrders(exec, result.orders, row.serviceDate);
    }
  }
  return count;
}

export async function getOrderRowById(exec: Executor, id: string): Promise<OrderRow | null> {
  const [row] = await exec.select().from(orders).where(eq(orders.id, id)).limit(1);
  return row ?? null;
}

export async function getOrderRowsByIds(exec: Executor, ids: string[]): Promise<OrderRow[]> {
  if (ids.length === 0) return [];
  return exec.select().from(orders).where(inArray(orders.id, ids));
}

export async function getOrderNoMap(exec: Executor, ids: string[]): Promise<Map<string, string>> {
  const rows = await getOrderRowsByIds(exec, ids);
  return new Map(rows.map((row) => [row.id, row.orderNo]));
}

export async function setOrderStatusRaw(
  exec: Executor,
  orderId: string,
  status: OrderStatus,
  patch: Partial<typeof orders.$inferInsert> = {},
): Promise<void> {
  await exec
    .update(orders)
    .set({ status, updatedAt: new Date(), ...patch })
    .where(eq(orders.id, orderId));
}

export async function countRecentExpiredHolds(exec: Executor, customerId: string): Promise<number> {
  const result = await exec.execute(sqlCountExpired(customerId));
  return Number((result.rows[0] as { count?: number } | undefined)?.count ?? 0);
}

function sqlCountExpired(customerId: string) {
  return sql`
    SELECT COUNT(*)::int AS count
    FROM orders
    WHERE customer_id = ${customerId}
      AND status = 'expired'
      AND created_at > now() - interval '7 days'
  `;
}

export async function countActiveHolds(exec: Executor, customerId: string): Promise<number> {
  const result = await exec.execute(sql`
    SELECT COUNT(*)::int AS count
    FROM orders
    WHERE customer_id = ${customerId}
      AND status = 'pending_payment'
      AND hold_expires_at > now()
  `);
  return Number((result.rows[0] as { count?: number } | undefined)?.count ?? 0);
}

export async function countOrdersForDate(exec: Executor, date: string): Promise<number> {
  const result = await exec.execute(
    sql`SELECT count(*)::int AS count FROM orders WHERE service_date = ${date}`,
  );
  return Number((result.rows[0] as { count?: number } | undefined)?.count ?? 0);
}

/* ── idempotensi (tabel milik modul order) ───────────────────────────── */

export type IdempotencyState =
  | { state: 'claimed' }
  | { state: 'replay'; orderId: string; response: Record<string, unknown> | null }
  | { state: 'conflict' }
  | { state: 'in_progress' };

export interface IdempotencyRecord {
  key: string;
  requestHash: string;
  orderId: string | null;
  response: Record<string, unknown> | null;
}

/** Klaim atomik: INSERT ... ON CONFLICT DO NOTHING lalu baca baris yang ada. */
export async function claimIdempotencyKey(
  exec: Executor,
  input: { key: string; requestHash: string },
): Promise<IdempotencyState> {
  const claimed = await exec
    .insert(idempotencyKeys)
    .values({
      key: input.key,
      requestHash: input.requestHash,
      expiresAt: new Date(Date.now() + 24 * 3_600_000),
    })
    .onConflictDoNothing({ target: idempotencyKeys.key })
    .returning({ key: idempotencyKeys.key });

  if (claimed.length > 0) return { state: 'claimed' };

  const record = await getIdempotencyRecord(exec, input.key);
  if (!record) return { state: 'in_progress' };
  if (record.requestHash !== input.requestHash) return { state: 'conflict' };
  if (!record.orderId) return { state: 'in_progress' };
  return { state: 'replay', orderId: record.orderId, response: record.response };
}

export async function getIdempotencyRecord(exec: Executor, key: string): Promise<IdempotencyRecord | null> {
  const [row] = await exec.select().from(idempotencyKeys).where(eq(idempotencyKeys.key, key)).limit(1);
  if (!row) return null;
  return {
    key: row.key,
    requestHash: row.requestHash,
    orderId: row.orderId,
    response: row.response ?? null,
  };
}

export async function attachOrderToIdempotencyKey(
  exec: Executor,
  key: string,
  orderId: string,
): Promise<void> {
  await exec.update(idempotencyKeys).set({ orderId }).where(eq(idempotencyKeys.key, key));
}

export async function storeIdempotencyResponse(
  exec: Executor,
  key: string,
  response: Record<string, unknown>,
): Promise<void> {
  await exec.update(idempotencyKeys).set({ response }).where(eq(idempotencyKeys.key, key));
}
