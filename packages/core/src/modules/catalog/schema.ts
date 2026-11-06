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

/* ── catalog ───────────────────────────────────────────────────────── */

export const menuItems = pgTable(
  'menu_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    category: text('category').notNull(),
    unitLabel: text('unit_label').notNull().default('porsi'),
    price: integer('price').notNull(),
    imageUrl: text('image_url'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('menu_items_slug_uq').on(t.slug)],
);

export const menuSchedule = pgTable(
  'menu_schedule',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    menuItemId: uuid('menu_item_id').notNull(),
    serviceDate: date('service_date', { mode: 'string' }).notNull(),
    isAvailable: boolean('is_available').notNull().default(true),
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('menu_schedule_item_date_uq').on(t.menuItemId, t.serviceDate),
    index('menu_schedule_date_idx').on(t.serviceDate),
  ],
);
