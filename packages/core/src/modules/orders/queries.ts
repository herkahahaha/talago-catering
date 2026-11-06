import { and, asc, desc, eq, gte, ilike, inArray, lte, or, sql } from 'drizzle-orm';
import type {
  AdminOrderDetailDto,
  AdminOrdersDto,
  AdminOrderRowDto,
  CustomerOrderSummaryDto,
  InternalNoteDto,
  OrderDto,
  OrderItemDto,
  OrderTimelineEntryDto,
} from '@catering/contracts';
import type { OrderStatus } from '@catering/contracts';
import { orderItems, orderNotesInternal, orders } from './schema';
import type { Executor } from '../../db/client';
import { AppError, hashToken } from '../../lib/ids';
import { todayWib } from '../../lib/time';
import {
  findCustomerByPhone,
  getCustomerById,
  getCustomersByIds,
  searchCustomerIds,
} from '../customers/index';
import { getLatestPaymentForOrder, toPaymentDto } from '../payments/index';
import { getDeliveryByOrderId, getWindowById, getWindowsByDates } from '../delivery/index';
import { listAudit } from '../audit/index';
import { getDayRow, toDaySummary } from '../capacity/index';
import { signOrderViewToken, verifyOrderViewToken } from '../../lib/view-token';
import type { OrderRow } from './service';

const TIMELINE_ACTIONS = new Set([
  'order_created',
  'order_paid',
  'order_paid_after_expiry',
  'order_cancelled',
  'status_changed',
  'reservation_released',
  'order_expired',
]);

export async function buildOrderDto(exec: Executor, order: OrderRow): Promise<OrderDto> {
  const customer = await getCustomerById(exec, order.customerId);
  if (!customer) throw new AppError('NOT_FOUND', 'Pelanggan order tidak ditemukan.');

  const itemRows = await exec
    .select()
    .from(orderItems)
    .where(eq(orderItems.orderId, order.id))
    .orderBy(asc(orderItems.createdAt));

  const payment = await getLatestPaymentForOrder(exec, order.id);
  const window = order.deliveryWindowId ? await getWindowById(exec, order.deliveryWindowId) : null;
  const delivery = await getDeliveryByOrderId(exec, order.id);
  const audit = await listAudit(exec, { entity: 'order', entityId: order.id, limit: 100 });
  const noteRows = await exec
    .select()
    .from(orderNotesInternal)
    .where(eq(orderNotesInternal.orderId, order.id))
    .orderBy(asc(orderNotesInternal.createdAt));

  const items: OrderItemDto[] = itemRows.map((row) => ({
    menuItemId: row.menuItemId,
    name: row.nameSnapshot,
    portions: row.portions,
    unitPrice: row.unitPrice,
    lineTotal: row.lineTotal,
  }));

  const timeline: OrderTimelineEntryDto[] = [
    ...audit
      .filter((entry) => TIMELINE_ACTIONS.has(entry.action) && typeof entry.after?.status === 'string')
      .map((entry) => ({
        status: entry.after!.status as OrderStatus,
        at: entry.at,
        note: null,
      })),
    ...noteRows.map((row) => ({
      status: 'note' as const,
      at: row.createdAt.toISOString(),
      note: `${row.staffName}: ${row.body}`,
    })),
  ].sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));

  return {
    id: order.id,
    orderNo: order.orderNo,
    status: order.status,
    source: order.source,
    serviceDate: order.serviceDate,
    portions: order.portions,
    subtotal: order.subtotal,
    deliveryFee: order.deliveryFee,
    total: order.total,
    holdExpiresAt: order.holdExpiresAt ? order.holdExpiresAt.toISOString() : null,
    createdAt: order.createdAt.toISOString(),
    paidAt: order.paidAt ? order.paidAt.toISOString() : null,
    customer,
    items,
    delivery: {
      windowLabel: window?.label ?? null,
      addressLine: order.addressLine,
      district: order.district,
      status: delivery ? (delivery.status as OrderDto['delivery']['status']) : null,
    },
    payment: payment ? toPaymentDto(payment) : null,
    notes: order.notes,
    timeline,
  };
}

export async function getOrderDtoById(exec: Executor, id: string): Promise<OrderDto> {
  const [row] = await exec.select().from(orders).where(eq(orders.id, id)).limit(1);
  if (!row) throw new AppError('NOT_FOUND', 'Order tidak ditemukan.');
  return buildOrderDto(exec, row);
}

export async function getOrderRowByToken(exec: Executor, token: string): Promise<OrderRow | null> {
  const [row] = await exec
    .select()
    .from(orders)
    .where(eq(orders.statusTokenHash, hashToken(token)))
    .limit(1);
  if (row) return row;

  // Token tampilan bertanda tangan dari halaman "Pesanan" (berlaku 30 menit).
  const orderId = verifyOrderViewToken(token);
  if (!orderId) return null;
  const [fallback] = await exec.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  return fallback ?? null;
}

export async function getOrderDtoByToken(exec: Executor, token: string): Promise<OrderDto> {
  const row = await getOrderRowByToken(exec, token);
  if (!row) {
    throw new AppError('NOT_FOUND', 'Tautan status order tidak valid atau sudah diganti.', {
      hint: 'Periksa kembali tautan dari pesan konfirmasi Anda.',
    });
  }
  return buildOrderDto(exec, row);
}

export async function listAdminOrders(
  exec: Executor,
  query: {
    date?: string;
    from?: string;
    to?: string;
    status?: OrderStatus;
    source?: string;
    q?: string;
    page: number;
    pageSize: number;
  },
): Promise<AdminOrdersDto> {
  const rangeMode = Boolean(query.from || query.to);
  const date = query.date ?? todayWib();
  const conditions = [];
  if (rangeMode) {
    if (query.from) conditions.push(gte(orders.serviceDate, query.from));
    if (query.to) conditions.push(lte(orders.serviceDate, query.to));
  } else {
    conditions.push(eq(orders.serviceDate, date));
  }

  if (query.status) conditions.push(eq(orders.status, query.status));
  if (query.source) conditions.push(eq(orders.source, query.source as OrderRow['source']));

  if (query.q?.trim()) {
    const ids = await searchCustomerIds(exec, query.q);
    const term = `%${query.q.trim()}%`;
    const searchCondition = ids.length
      ? or(ilike(orders.orderNo, term), inArray(orders.customerId, ids))
      : ilike(orders.orderNo, term);
    if (searchCondition) conditions.push(searchCondition);
  }

  const where = and(...conditions);
  const totalResult = await exec
    .select({ value: sql<number>`count(*)::int` })
    .from(orders)
    .where(where);
  const total = Number(totalResult[0]?.value ?? 0);

  const rows = await exec
    .select()
    .from(orders)
    .where(where)
    .orderBy(desc(orders.createdAt))
    .limit(query.pageSize)
    .offset((query.page - 1) * query.pageSize);

  const customersMap = await getCustomersByIds(exec, [...new Set(rows.map((row) => row.customerId))]);
  const windowDates = [...new Set(rows.map((row) => row.serviceDate))];
  const windowsMap = await getWindowsByDates(exec, windowDates);

  const mapped: AdminOrderRowDto[] = rows.map((row) => {
    const customer = customersMap.get(row.customerId);
    const window = row.deliveryWindowId
      ? windowsMap.get(row.serviceDate)?.find((w) => w.id === row.deliveryWindowId)
      : null;
    return {
      id: row.id,
      orderNo: row.orderNo,
      status: row.status,
      source: row.source,
      serviceDate: row.serviceDate,
      customerName: customer?.name ?? '—',
      customerPhone: customer?.phone ?? '—',
      portions: row.portions,
      total: row.total,
      windowLabel: window?.label ?? null,
      createdAt: row.createdAt.toISOString(),
      holdExpiresAt: row.holdExpiresAt ? row.holdExpiresAt.toISOString() : null,
      paidAt: row.paidAt ? row.paidAt.toISOString() : null,
    };
  });

  const day = rangeMode ? null : await getDayRow(exec, date);

  return {
    rows: mapped,
    total,
    page: query.page,
    pageSize: query.pageSize,
    capacity: day ? toDaySummary(day) : null,
  };
}

/** Ringkasan pesanan milik satu pelanggan untuk halaman "Pesanan" storefront. */
export async function listCustomerOrders(
  exec: Executor,
  customerId: string,
  limit = 50,
): Promise<CustomerOrderSummaryDto[]> {
  const rows = await exec
    .select()
    .from(orders)
    .where(eq(orders.customerId, customerId))
    .orderBy(desc(orders.createdAt))
    .limit(limit);
  return rows.map(toCustomerOrderSummary);
}

/**
 * Pencarian aman: harus cocok nomor order + nomor HP. Token tampilan
 * berumur pendek sehingga tidak membocorkan tautan permanen.
 */
export async function lookupCustomerOrders(
  exec: Executor,
  input: { orderNo: string; phone: string },
): Promise<CustomerOrderSummaryDto[]> {
  const customer = await findCustomerByPhone(exec, input.phone);
  if (!customer) return [];

  const rows = await exec
    .select()
    .from(orders)
    .where(and(eq(orders.customerId, customer.id), eq(orders.orderNo, input.orderNo.trim().toUpperCase())))
    .orderBy(desc(orders.createdAt))
    .limit(3);

  return rows.map(toCustomerOrderSummary);
}

export function toCustomerOrderSummary(row: OrderRow): CustomerOrderSummaryDto {
  return {
    orderNo: row.orderNo,
    serviceDate: row.serviceDate,
    status: row.status,
    portions: row.portions,
    total: row.total,
    createdAt: row.createdAt.toISOString(),
    holdExpiresAt: row.holdExpiresAt ? row.holdExpiresAt.toISOString() : null,
    viewToken: signOrderViewToken(row.id),
  };
}

export async function getInternalNotes(exec: Executor, orderId: string): Promise<InternalNoteDto[]> {
  const rows = await exec
    .select()
    .from(orderNotesInternal)
    .where(eq(orderNotesInternal.orderId, orderId))
    .orderBy(asc(orderNotesInternal.createdAt));
  return rows.map((row) => ({
    id: row.id,
    staffName: row.staffName,
    body: row.body,
    createdAt: row.createdAt.toISOString(),
  }));
}

export async function addInternalNote(
  exec: Executor,
  orderId: string,
  staff: { id: string; label: string },
  body: string,
): Promise<InternalNoteDto> {
  const [row] = await exec
    .insert(orderNotesInternal)
    .values({ orderId, staffId: staff.id, staffName: staff.label, body })
    .returning();
  if (!row) throw new AppError('INTERNAL_ERROR', 'Gagal menyimpan catatan.');
  return {
    id: row.id,
    staffName: row.staffName,
    body: row.body,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function getAdminOrderDetail(exec: Executor, orderId: string): Promise<AdminOrderDetailDto> {
  const [row] = await exec.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!row) throw new AppError('NOT_FOUND', 'Order tidak ditemukan.');
  const order = await buildOrderDto(exec, row);
  const notes = await getInternalNotes(exec, orderId);
  return { order, internalNotes: notes, refunds: [] };
}

export async function listOrdersByIds(exec: Executor, ids: string[]): Promise<OrderRow[]> {
  if (ids.length === 0) return [];
  return exec.select().from(orders).where(inArray(orders.id, ids));
}
