import {
  boolean,
  date,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import type { DeliveryStatus } from '@catering/contracts';

export const deliveryWindows = pgTable(
  'delivery_windows',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    serviceDate: date('service_date', { mode: 'string' }).notNull(),
    label: text('label').notNull(),
    startTime: text('start_time').notNull(),
    endTime: text('end_time').notNull(),
    maxStops: integer('max_stops').notNull(),
    stopsUsed: integer('stops_used').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('delivery_windows_date_label_uq').on(t.serviceDate, t.label),
    index('delivery_windows_date_idx').on(t.serviceDate),
  ],
);

export const deliveries = pgTable(
  'deliveries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderId: uuid('order_id').notNull(),
    windowId: uuid('window_id'),
    courierId: uuid('courier_id'),
    status: text('status').$type<DeliveryStatus>().notNull().default('scheduled'),
    proofUrl: text('proof_url'),
    notes: text('notes'),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('deliveries_order_uq').on(t.orderId)],
);
