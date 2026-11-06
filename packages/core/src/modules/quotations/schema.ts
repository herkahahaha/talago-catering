import { date, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

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
  (t) => [uniqueIndex('purchase_orders_number_uq').on(t.poNumber)],
);
