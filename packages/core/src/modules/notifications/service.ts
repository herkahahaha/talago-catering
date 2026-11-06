import { and, asc, eq, lt } from 'drizzle-orm';
import { notifications } from './schema';
import type { Executor } from '../../db/client';

export type NotificationTemplate =
  | 'order_created'
  | 'order_paid'
  | 'order_expired'
  | 'order_paid_after_expiry'
  | 'order_cancelled'
  | 'refund_queued'
  | 'refund_completed'
  | 'otp_code';

export interface EnqueueInput {
  channel: 'email' | 'whatsapp' | 'sms';
  recipient: string;
  template: NotificationTemplate;
  payload: Record<string, unknown>;
}

/** Tulis ke outbox; worker yang mengirim. Tidak ada I/O jaringan di request web. */
export async function enqueueNotification(exec: Executor, input: EnqueueInput): Promise<void> {
  await exec.insert(notifications).values({
    channel: input.channel,
    recipient: input.recipient,
    template: input.template,
    payload: input.payload,
  });
}

export async function listQueuedNotifications(
  exec: Executor,
  limit = 30,
): Promise<Array<typeof notifications.$inferSelect>> {
  return exec
    .select()
    .from(notifications)
    .where(eq(notifications.status, 'queued'))
    .orderBy(asc(notifications.createdAt))
    .limit(limit);
}

export async function markNotificationSent(exec: Executor, id: string): Promise<void> {
  await exec
    .update(notifications)
    .set({ status: 'sent', sentAt: new Date(), attempts: 1 })
    .where(eq(notifications.id, id));
}

export async function markNotificationFailed(exec: Executor, id: string, error: string): Promise<void> {
  await exec
    .update(notifications)
    .set({ status: 'failed', error: error.slice(0, 500), attempts: 1 })
    .where(eq(notifications.id, id));
}

export async function requeueStaleNotifications(exec: Executor): Promise<number> {
  const result = await exec
    .update(notifications)
    .set({ status: 'queued' })
    .where(and(eq(notifications.status, 'failed'), lt(notifications.attempts, 3)));
  return result.rowCount ?? 0;
}

export async function listNotificationsByOrder(
  exec: Executor,
  orderNos: string[],
): Promise<Array<typeof notifications.$inferSelect>> {
  if (orderNos.length === 0) return [];
  const rows = await exec.select().from(notifications).limit(200);
  return rows.filter((row) => orderNos.includes(String(row.payload.orderNo ?? '')));
}
