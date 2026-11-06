import { and, gte, lte, sql } from 'drizzle-orm';
import type { DailyOverviewDto, MonthOverviewDto, OrderStatus } from '@catering/contracts';
import { orders } from './schema';
import type { Executor } from '../../db/client';
import { todayWib } from '../../lib/time';
import { PRODUCTION_STATUSES } from './production';

export interface MonthRange {
  month: string;
  from: string;
  to: string;
}

/** Rentang kalender bulan penuh (WIB). */
export function monthRange(month?: string): MonthRange {
  const normalized = month ?? todayWib().slice(0, 7);
  const [year, monthNumber] = normalized.split('-').map(Number);
  const lastDay = new Date(Date.UTC(year!, monthNumber!, 0)).getUTCDate();
  return {
    month: normalized,
    from: `${normalized}-01`,
    to: `${normalized}-${String(lastDay).padStart(2, '0')}`,
  };
}

/**
 * Agregat satu bulan untuk dashboard: jumlah pesanan, nilai seluruh order,
 * pendapatan terkonfirmasi, dan rincian harian. Satu query GROUP BY agar
 * tidak memanggil database per tanggal.
 */
export async function getMonthOverview(exec: Executor, month?: string): Promise<MonthOverviewDto> {
  const range = monthRange(month);

  const rows = await exec
    .select({
      serviceDate: orders.serviceDate,
      status: orders.status,
      count: sql<number>`count(*)::int`,
      portions: sql<number>`COALESCE(SUM(${orders.portions}), 0)::int`,
      total: sql<number>`COALESCE(SUM(${orders.total}), 0)::int`,
    })
    .from(orders)
    .where(and(gte(orders.serviceDate, range.from), lte(orders.serviceDate, range.to)))
    .groupBy(orders.serviceDate, orders.status)
    .orderBy(orders.serviceDate);

  const confirmed = new Set<string>(PRODUCTION_STATUSES);
  const statusCounts: Partial<Record<OrderStatus, number>> = {};
  const dailyMap = new Map<string, DailyOverviewDto>();

  let totalOrders = 0;
  let totalPortions = 0;
  let totalRevenue = 0;
  let grossOrderValue = 0;

  for (const row of rows) {
    const count = Number(row.count);
    const portions = Number(row.portions);
    const total = Number(row.total);
    const isConfirmed = confirmed.has(row.status);

    totalOrders += count;
    totalPortions += portions;
    grossOrderValue += total;
    if (isConfirmed) totalRevenue += total;

    statusCounts[row.status] = (statusCounts[row.status] ?? 0) + count;

    const previous = dailyMap.get(row.serviceDate) ?? {
      date: row.serviceDate,
      orders: 0,
      portions: 0,
      revenue: 0,
    };
    previous.orders += count;
    previous.portions += portions;
    if (isConfirmed) previous.revenue += total;
    dailyMap.set(row.serviceDate, previous);
  }

  const daily = [...dailyMap.values()].sort((a, b) => a.date.localeCompare(b.date));

  return {
    ...range,
    totalOrders,
    totalPortions,
    totalRevenue,
    grossOrderValue,
    paidOrders: PRODUCTION_STATUSES.reduce((sum, status) => sum + (statusCounts[status] ?? 0), 0),
    pendingOrders: statusCounts.pending_payment ?? 0,
    cancelledOrders: (statusCounts.expired ?? 0) + (statusCounts.cancelled_refunded ?? 0),
    statusCounts,
    daily,
  };
}
