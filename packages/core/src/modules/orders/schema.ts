import { sql } from 'drizzle-orm';
import {
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import type { OrderSource, OrderStatus } from '@catering/contracts';

/**
 * Header order. `portions` adalah total porsi (bukan pax), konsisten
 * dengan PRD §1. `status_token_hash` menyimpan hash tautan status tamu.
 */
export const orders = pgTable(
  'orders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderNo: text('order_no').notNull(),
    customerId: uuid('customer_id').notNull(),
    serviceDate: date('service_date', { mode: 'string' }).notNull(),
    source: text('source').$type<OrderSource>().notNull().default('web'),
    status: text('status').$type<OrderStatus>().notNull().default('pending_payment'),
    portions: integer('portions').notNull(),
    subtotal: integer('subtotal').notNull(),
    deliveryFee: integer('delivery_fee').notNull().default(0),
    total: integer('total').notNull(),
    holdExpiresAt: timestamp('hold_expires_at', { withTimezone: true }),
    statusTokenHash: text('status_token_hash').notNull(),
    deliveryWindowId: uuid('delivery_window_id'),
    addressLine: text('address_line').notNull(),
    district: text('district'),
    recipientName: text('recipient_name'),
    recipientPhone: text('recipient_phone'),
    notes: text('notes'),
    consentAt: timestamp('consent_at', { withTimezone: true }).notNull(),
    createdIp: text('created_ip'),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    cancellationReason: text('cancellation_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('orders_no_uq').on(t.orderNo),
    uniqueIndex('orders_status_token_uq').on(t.statusTokenHash),
    index('orders_date_status_idx').on(t.serviceDate, t.status),
    index('orders_customer_created_idx').on(t.customerId, t.createdAt),
    index('orders_hold_expires_idx')
      .on(t.holdExpiresAt)
      .where(sql`status = 'pending_payment'`),
    index('orders_created_ip_idx').on(t.createdIp, t.createdAt),
  ],
);

export const orderItems = pgTable(
  'order_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderId: uuid('order_id').notNull(),
    menuItemId: uuid('menu_item_id').notNull(),
    nameSnapshot: text('name_snapshot').notNull(),
    unitPrice: integer('unit_price').notNull(),
    portions: integer('portions').notNull(),
    lineTotal: integer('line_total').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('order_items_order_idx').on(t.orderId)],
);

/** Kunci unik pencegah order ganda (header Idempotency-Key). */
export const idempotencyKeys = pgTable(
  'idempotency_keys',
  {
    key: text('key').primaryKey(),
    requestHash: text('request_hash').notNull(),
    orderId: uuid('order_id'),
    response: jsonb('response').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (t) => [index('idempotency_expires_idx').on(t.expiresAt)],
);

export const orderNotesInternal = pgTable(
  'order_notes_internal',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderId: uuid('order_id').notNull(),
    staffId: uuid('staff_id'),
    staffName: text('staff_name').notNull(),
    body: text('body').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('order_notes_order_idx').on(t.orderId)],
);
