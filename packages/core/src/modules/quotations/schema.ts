import {
  date,
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { ordersTable } from '../orders/index';

/** Permintaan quotation untuk pesanan > cap porsi (jalur eskalasi PRD §3). */
export const quotations = pgTable(
  'quotations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    code: text('code').notNull(),
    name: text('name').notNull(),
    phone: text('phone').notNull(),
    email: text('email'),
    company: text('company'),
    serviceDate: date('service_date', { mode: 'string' }).notNull(),
    portions: integer('portions').notNull(),
    notes: text('notes'),
    status: text('status').$type<'new' | 'contacted' | 'won' | 'lost'>().notNull().default('new'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('quotations_code_uq').on(t.code), index('quotations_created_idx').on(t.createdAt)],
);

/** PO formal (fase 2). Disiapkan agar quotation bisa naik jadi PO tanpa ubah skema. */
export const purchaseOrders = pgTable(
  'purchase_orders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    quotationId: uuid('quotation_id'),
    orderId: uuid('order_id'),
    poNumber: text('po_number').notNull(),
    agreedTotal: integer('agreed_total').notNull(),
    dueAt: timestamp('due_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('purchase_orders_number_uq').on(t.poNumber),
    // Satu quotation hanya boleh naik jadi satu PO (permintaan 'tidak boleh dobel').
    uniqueIndex('purchase_orders_quotation_uq').on(t.quotationId),
    // ADR 0002 O4: satu PO hanya boleh tertaut ke satu order (1 PO = 1 invoice).
    uniqueIndex('purchase_orders_order_uq').on(t.orderId),
    // FK fisik sudah dibuat di 0001_foreign_keys.sql; deklarasi ini menyamakan
    // skema Drizzle dengan database. Nama constraint sengaja sama.
    foreignKey({
      name: 'purchase_orders_quotation_fk',
      columns: [t.quotationId],
      foreignColumns: [quotations.id],
    }).onDelete('set null'),
    foreignKey({
      name: 'purchase_orders_order_fk',
      columns: [t.orderId],
      foreignColumns: [ordersTable.id],
    }).onDelete('set null'),
  ],
);
