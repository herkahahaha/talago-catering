import { index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import type { RefundChannel, RefundStatus } from '@catering/contracts';

export const refunds = pgTable(
  'refunds',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderId: uuid('order_id').notNull(),
    paymentId: uuid('payment_id').notNull(),
    amount: integer('amount').notNull(),
    channel: text('channel').$type<RefundChannel>().notNull().default('gateway_manual'),
    status: text('status').$type<RefundStatus>().notNull().default('queued'),
    reason: text('reason').notNull(),
    reference: text('reference'),
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (t) => [index('refunds_status_idx').on(t.status), index('refunds_order_idx').on(t.orderId)],
);
