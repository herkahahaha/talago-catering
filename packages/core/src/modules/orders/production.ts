import { and, eq, inArray, sql } from 'drizzle-orm';
import type {
  AdminStatsDto,
  MenuCategory,
  OrderStatus,
  ProductionItemDto,
  ProductionNoteDto,
  ProductionSummaryDto,
  DeliverableWindowDto,
} from '@catering/contracts';
import { orderItems, orderNotesInternal, orders } from './schema';
import type { Executor } from '../../db/client';
import { getDayRow, toDaySummary } from '../capacity/index';
import { getWindows } from '../delivery/index';
import { getMenuItemsByIds } from '../catalog/index';

export const PRODUCTION_STATUSES: readonly OrderStatus[] = [
  'paid',
  'paid_after_expiry',
  'in_production',
  'out_for_delivery',
  'delivered',
];

export async function getProductionSummary(exec: Executor, date: string): Promise<ProductionSummaryDto> {
  const day = await getDayRow(exec, date);
  const orderRows = await exec
    .select()
    .from(orders)
    .where(and(eq(orders.serviceDate, date), inArray(orders.status, [...PRODUCTION_STATUSES])))
    .orderBy(orders.createdAt);

  const orderIds = orderRows.map((row) => row.id);
  const items = orderIds.length
    ? await exec.select().from(orderItems).where(inArray(orderItems.orderId, orderIds))
    : [];

  const aggregated = new Map<string, ProductionItemDto>();
  for (const item of items) {
    const existing = aggregated.get(item.menuItemId);
    if (existing) existing.portions += item.portions;
    else {
      aggregated.set(item.menuItemId, {
        menuItemId: item.menuItemId,
        name: item.nameSnapshot,
        category: 'main' as MenuCategory,
        portions: item.portions,
      });
    }
  }

  const catalog = await getMenuItemsByIds(exec, [...aggregated.keys()]);
  const categoryById = new Map(catalog.map((item) => [item.id, item.category]));
  for (const [id, item] of aggregated) {
    item.category = categoryById.get(id) ?? 'main';
  }

  const windows = await getWindows(exec, date);
  const windowStats = new Map<string, DeliverableWindowDto>();
  for (const window of windows) {
    windowStats.set(window.id ?? window.label, {
      label: window.label,
      startTime: window.startTime,
      endTime: window.endTime,
      orderCount: 0,
      portions: 0,
    });
  }
  for (const order of orderRows) {
    if (!order.deliveryWindowId) continue;
    const stat = windowStats.get(order.deliveryWindowId);
    if (stat) {
      stat.orderCount += 1;
      stat.portions += order.portions;
    }
  }

  const notes: ProductionNoteDto[] = [];
  for (const order of orderRows) {
    if (order.notes) notes.push({ orderNo: order.orderNo, note: order.notes });
  }
  if (orderIds.length > 0) {
    const internalNotes = await exec
      .select()
      .from(orderNotesInternal)
      .where(inArray(orderNotesInternal.orderId, orderIds));
    const orderNoById = new Map(orderRows.map((row) => [row.id, row.orderNo]));
    for (const note of internalNotes) {
      notes.push({ orderNo: orderNoById.get(note.orderId) ?? '—', note: `${note.staffName}: ${note.body}` });
    }
  }

  const totalPortions = orderRows.reduce((sum, row) => sum + row.portions, 0);
  const lockedAt = day?.productionLockedAt ?? null;

  return {
    date,
    locked: Boolean(lockedAt) || Boolean(day && day.cutOffAt.getTime() <= Date.now()),
    lockedAt: lockedAt ? lockedAt.toISOString() : null,
    targetMin: day?.targetMin ?? 0,
    totalPortions,
    items: [...aggregated.values()].sort((a, b) => b.portions - a.portions),
    windows: [...windowStats.values()],
    notes,
  };
}

export async function getAdminStats(exec: Executor, date: string): Promise<AdminStatsDto> {
  const day = await getDayRow(exec, date);
  if (!day) {
    throw new Error(`Kapasitas tanggal ${date} belum disiapkan.`);
  }

  const statusCounts = await exec
    .select({ status: orders.status, count: sql<number>`count(*)::int` })
    .from(orders)
    .where(eq(orders.serviceDate, date))
    .groupBy(orders.status);

  const counts = new Map<string, number>();
  for (const row of statusCounts) counts.set(row.status, Number(row.count));

  const revenueResult = await exec
    .select({ value: sql<number>`COALESCE(SUM(total), 0)::int` })
    .from(orders)
    .where(and(eq(orders.serviceDate, date), inArray(orders.status, [...PRODUCTION_STATUSES])));
  const revenue = Number(revenueResult[0]?.value ?? 0);

  const windows = await getWindows(exec, date);
  const deliveryStops = windows.reduce((sum, window) => sum + window.stopsUsed, 0);

  const orderCount = [...counts.values()].reduce((sum, value) => sum + value, 0);

  return {
    date,
    capacity: toDaySummary(day),
    orderCount,
    paidCount: PRODUCTION_STATUSES.reduce((sum, status) => sum + (counts.get(status) ?? 0), 0),
    expiredCount: counts.get('expired') ?? 0,
    pendingCount: counts.get('pending_payment') ?? 0,
    revenue,
    activeHolds: day.heldRegular + day.heldPo,
    deliveryStops,
  };
}
