import { and, desc, eq, gte, inArray, lte } from 'drizzle-orm';
import type { RefundDto } from '@catering/contracts';
import { refunds } from './schema';
import type { Executor } from '../../db/client';
import { AppError } from '../../lib/ids';
import { getOrderNoMap } from '../orders/index';
import { getOrderRowById } from '../orders/index';
import { recordAudit } from '../audit/index';
import { enqueueNotification } from '../notifications/index';
import { getCustomerById } from '../customers/index';

export type RefundRow = typeof refunds.$inferSelect;

export interface CreateRefundInput {
  orderId: string;
  paymentId: string;
  amount: number;
  reason: string;
  channel?: RefundRow['channel'];
  note?: string;
}

/**
 * Kebijakan soft launch (PRD §2 butir 7): refund manual lewat dashboard
 * gateway. Baris refund dibuat otomatis & berstatus queued; penyelesaian
 * dicatat admin setelah dana dikembalikan.
 */
export async function createRefund(exec: Executor, input: CreateRefundInput): Promise<RefundRow> {
  const [row] = await exec
    .insert(refunds)
    .values({
      orderId: input.orderId,
      paymentId: input.paymentId,
      amount: input.amount,
      reason: input.reason,
      channel: input.channel ?? 'gateway_manual',
      note: input.note ?? null,
      status: 'queued',
    })
    .returning();
  if (!row) throw new AppError('INTERNAL_ERROR', 'Gagal membuat catatan refund.');

  const order = await getOrderRowById(exec, input.orderId);
  const customer = order ? await getCustomerById(exec, order.customerId) : null;
  if (customer) {
    const payload = { orderNo: order?.orderNo ?? '', amount: input.amount, reason: input.reason };
    if (customer.email) {
      await enqueueNotification(exec, {
        channel: 'email',
        recipient: customer.email,
        template: 'refund_queued',
        payload,
      });
    }
    await enqueueNotification(exec, {
      channel: 'whatsapp',
      recipient: customer.phone,
      template: 'refund_queued',
      payload,
    });
  }

  await recordAudit(exec, {
    actor: { type: 'system', label: 'refund-policy' },
    entity: 'refund',
    entityId: row.id,
    action: 'refund_queued',
    after: { orderId: input.orderId, amount: input.amount, reason: input.reason },
  });

  return row;
}

export async function listRefunds(
  exec: Executor,
  filter: { status?: RefundRow['status']; from?: Date; to?: Date; limit?: number } = {},
): Promise<RefundDto[]> {
  const conditions = [];
  if (filter.status) conditions.push(eq(refunds.status, filter.status));
  if (filter.from) conditions.push(gte(refunds.createdAt, filter.from));
  if (filter.to) conditions.push(lte(refunds.createdAt, filter.to));

  const rows = await exec
    .select()
    .from(refunds)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(refunds.createdAt))
    .limit(filter.limit ?? 100);

  const orderNoMap = await getOrderNoMap(exec, [...new Set(rows.map((row) => row.orderId))]);

  return rows.map((row) => ({
    id: row.id,
    orderNo: orderNoMap.get(row.orderId) ?? '—',
    amount: row.amount,
    channel: row.channel,
    status: row.status,
    reason: row.reason,
    createdAt: row.createdAt.toISOString(),
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
  }));
}

export async function completeRefund(
  exec: Executor,
  id: string,
  options: { channel: RefundRow['channel']; reference?: string; note?: string },
  actor: { id: string; label: string },
): Promise<RefundRow> {
  const [refund] = await exec.select().from(refunds).where(eq(refunds.id, id)).limit(1);
  if (!refund) throw new AppError('NOT_FOUND', 'Refund tidak ditemukan.');
  if (refund.status === 'completed') return refund;

  const [updated] = await exec
    .update(refunds)
    .set({
      status: 'completed',
      channel: options.channel,
      reference: options.reference ?? refund.reference,
      note: options.note ?? refund.note,
      completedAt: new Date(),
    })
    .where(eq(refunds.id, id))
    .returning();
  if (!updated) throw new AppError('INTERNAL_ERROR', 'Gagal menyelesaikan refund.');

  await recordAudit(exec, {
    actor: { type: 'staff', id: actor.id, label: actor.label },
    entity: 'refund',
    entityId: id,
    action: 'refund_completed',
    before: { status: refund.status },
    after: {
      status: 'completed',
      channel: options.channel,
      reference: options.reference ?? null,
      amount: refund.amount,
    },
  });

  const order = await getOrderRowById(exec, refund.orderId);
  const customer = order ? await getCustomerById(exec, order.customerId) : null;
  if (customer && order) {
    const payload = { orderNo: order.orderNo, amount: refund.amount };
    if (customer.email) {
      await enqueueNotification(exec, {
        channel: 'email',
        recipient: customer.email,
        template: 'refund_completed',
        payload,
      });
    }
    await enqueueNotification(exec, {
      channel: 'whatsapp',
      recipient: customer.phone,
      template: 'refund_completed',
      payload,
    });
  }

  return updated;
}

export async function getRefundsForOrder(exec: Executor, orderId: string): Promise<RefundRow[]> {
  return exec.select().from(refunds).where(eq(refunds.orderId, orderId)).orderBy(desc(refunds.createdAt));
}

export async function getRefundsByOrderIds(exec: Executor, orderIds: string[]): Promise<RefundRow[]> {
  if (orderIds.length === 0) return [];
  return exec.select().from(refunds).where(inArray(refunds.orderId, orderIds));
}

export async function getRefundDtosForOrder(exec: Executor, orderId: string): Promise<RefundDto[]> {
  const rows = await getRefundsForOrder(exec, orderId);
  if (rows.length === 0) return [];
  const orderNoMap = await getOrderNoMap(exec, [orderId]);
  return rows.map((row) => ({
    id: row.id,
    orderNo: orderNoMap.get(orderId) ?? '—',
    amount: row.amount,
    channel: row.channel,
    status: row.status,
    reason: row.reason,
    createdAt: row.createdAt.toISOString(),
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
  }));
}
