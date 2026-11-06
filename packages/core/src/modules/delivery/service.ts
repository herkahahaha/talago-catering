import { and, eq, inArray, sql } from 'drizzle-orm';
import type { DeliveryWindowDto } from '@catering/contracts';
import { deliveries, deliveryWindows } from './schema';
import type { Executor } from '../../db/client';

export interface WindowInput {
  id?: string;
  label: string;
  startTime: string;
  endTime: string;
  maxStops: number;
}

export function toWindowDto(row: typeof deliveryWindows.$inferSelect): DeliveryWindowDto {
  return {
    id: row.id,
    label: row.label,
    startTime: row.startTime,
    endTime: row.endTime,
    maxStops: row.maxStops,
    stopsUsed: row.stopsUsed,
    remainingStops: Math.max(row.maxStops - row.stopsUsed, 0),
  };
}

export async function getWindows(exec: Executor, date: string): Promise<DeliveryWindowDto[]> {
  const rows = await exec
    .select()
    .from(deliveryWindows)
    .where(and(eq(deliveryWindows.serviceDate, date), eq(deliveryWindows.isActive, true)))
    .orderBy(deliveryWindows.startTime);
  return rows.map(toWindowDto);
}

export async function getWindowsByDates(
  exec: Executor,
  dates: string[],
): Promise<Map<string, DeliveryWindowDto[]>> {
  const map = new Map<string, DeliveryWindowDto[]>();
  if (dates.length === 0) return map;
  const rows = await exec
    .select()
    .from(deliveryWindows)
    .where(and(inArray(deliveryWindows.serviceDate, dates), eq(deliveryWindows.isActive, true)))
    .orderBy(deliveryWindows.startTime);
  for (const date of dates) map.set(date, []);
  for (const row of rows) map.get(row.serviceDate)?.push(toWindowDto(row));
  return map;
}

/**
 * Ganti jendela antar sebuah tanggal. Jendela yang dihapus ditandai
 * nonaktif (bukan DELETE) agar order lama tetap punya referensi.
 */
export async function replaceWindows(
  exec: Executor,
  date: string,
  input: WindowInput[],
): Promise<DeliveryWindowDto[]> {
  const existing = await exec.select().from(deliveryWindows).where(eq(deliveryWindows.serviceDate, date));
  const byId = new Map(existing.map((row) => [row.id, row]));
  const keepIds = new Set<string>();

  for (const window of input) {
    if (window.id && byId.has(window.id)) {
      keepIds.add(window.id);
      await exec
        .update(deliveryWindows)
        .set({
          label: window.label,
          startTime: window.startTime,
          endTime: window.endTime,
          maxStops: window.maxStops,
          isActive: true,
        })
        .where(eq(deliveryWindows.id, window.id));
    } else {
      const [inserted] = await exec
        .insert(deliveryWindows)
        .values({
          serviceDate: date,
          label: window.label,
          startTime: window.startTime,
          endTime: window.endTime,
          maxStops: window.maxStops,
        })
        .onConflictDoUpdate({
          target: [deliveryWindows.serviceDate, deliveryWindows.label],
          set: {
            startTime: window.startTime,
            endTime: window.endTime,
            maxStops: window.maxStops,
            isActive: true,
          },
        })
        .returning({ id: deliveryWindows.id });
      if (inserted) keepIds.add(inserted.id);
    }
  }

  for (const row of existing) {
    if (!keepIds.has(row.id)) {
      await exec.update(deliveryWindows).set({ isActive: false }).where(eq(deliveryWindows.id, row.id));
    }
  }

  return getWindows(exec, date);
}

/** Reservasi satu stop secara atomik; false bila jendela penuh/nonaktif. */
export async function reserveStop(exec: Executor, windowId: string): Promise<boolean> {
  const rows = await exec
    .update(deliveryWindows)
    .set({ stopsUsed: sql`stops_used + 1` })
    .where(
      and(eq(deliveryWindows.id, windowId), eq(deliveryWindows.isActive, true), sql`stops_used < max_stops`),
    )
    .returning({ id: deliveryWindows.id });
  return rows.length > 0;
}

/** Lepas stop saat order batal/kedaluwarsa; aman terhadap double release. */
export async function releaseStop(exec: Executor, windowId: string, count = 1): Promise<void> {
  await exec
    .update(deliveryWindows)
    .set({ stopsUsed: sql`GREATEST(stops_used - ${count}, 0)` })
    .where(eq(deliveryWindows.id, windowId));
}

export async function getWindowById(exec: Executor, id: string): Promise<DeliveryWindowDto | null> {
  const [row] = await exec.select().from(deliveryWindows).where(eq(deliveryWindows.id, id)).limit(1);
  return row ? toWindowDto(row) : null;
}

export interface DeliveryRow {
  id: string;
  orderId: string;
  windowId: string | null;
  status: string;
  proofUrl: string | null;
  deliveredAt: Date | null;
}

export async function getDeliveryByOrderId(exec: Executor, orderId: string): Promise<DeliveryRow | null> {
  const [row] = await exec.select().from(deliveries).where(eq(deliveries.orderId, orderId)).limit(1);
  if (!row) return null;
  return {
    id: row.id,
    orderId: row.orderId,
    windowId: row.windowId,
    status: row.status,
    proofUrl: row.proofUrl,
    deliveredAt: row.deliveredAt,
  };
}

export async function createDeliveryForOrder(
  exec: Executor,
  input: { orderId: string; windowId?: string | null },
): Promise<void> {
  await exec
    .insert(deliveries)
    .values({ orderId: input.orderId, windowId: input.windowId ?? null, status: 'scheduled' })
    .onConflictDoNothing();
}

export async function setDeliveryStatus(
  exec: Executor,
  orderId: string,
  status: 'scheduled' | 'out_for_delivery' | 'delivered' | 'failed',
): Promise<void> {
  await exec
    .update(deliveries)
    .set({
      status,
      updatedAt: new Date(),
      ...(status === 'delivered' ? { deliveredAt: new Date() } : {}),
    })
    .where(eq(deliveries.orderId, orderId));
}
