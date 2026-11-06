import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import type { PaymentMethod, PaymentStatus } from '@catering/contracts';

export const payments = pgTable(
  'payments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderId: uuid('order_id').notNull(),
    gatewayRef: text('gateway_ref').notNull(),
    method: text('method').$type<PaymentMethod>().notNull(),
    status: text('status').$type<PaymentStatus>().notNull().default('pending'),
    amount: integer('amount').notNull(),
    reference: text('reference'),
    instructions: text('instructions'),
    payload: jsonb('payload').$type<Record<string, unknown> | null>(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('payments_gateway_ref_uq').on(t.gatewayRef), index('payments_order_idx').on(t.orderId)],
);

/** Deduplikasi webhook. `event_id` unik membuat retry gateway tidak berefek ganda. */
export const webhookEvents = pgTable(
  'webhook_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    eventId: text('event_id').notNull(),
    gatewayRef: text('gateway_ref').notNull(),
    eventType: text('event_type').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>(),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('webhook_events_event_id_uq').on(t.eventId)],
);
