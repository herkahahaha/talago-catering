import { sql } from 'drizzle-orm';
import { boolean, check, date, integer, pgTable, timestamp } from 'drizzle-orm/pg-core';

/**
 * Partisi kapasitas per tanggal layanan. Satu baris = satu kunci atomik.
 * Kebenaran utama dijaga oleh UPDATE bersyarat di `reserve.ts`; CHECK di
 * bawah adalah jaring pengaman agar data rusak tidak lolos diam-diam.
 */
export const dailyCapacity = pgTable(
  'daily_capacity',
  {
    serviceDate: date('service_date', { mode: 'string' }).primaryKey(),
    maxRegular: integer('max_regular').notNull(),
    maxPo: integer('max_po').notNull().default(0),
    kitchenMaxTotal: integer('kitchen_max_total').notNull(),
    reservedRegular: integer('reserved_regular').notNull().default(0),
    reservedPo: integer('reserved_po').notNull().default(0),
    heldRegular: integer('held_regular').notNull().default(0),
    heldPo: integer('held_po').notNull().default(0),
    holdCeiling: integer('hold_ceiling').notNull(),
    targetMin: integer('target_min').notNull(),
    cutOffAt: timestamp('cut_off_at', { withTimezone: true }).notNull(),
    isOpen: boolean('is_open').notNull().default(true),
    productionLockedAt: timestamp('production_locked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('daily_capacity_partition_rule', sql`${t.maxRegular} + ${t.maxPo} <= ${t.kitchenMaxTotal}`),
    check(
      'daily_capacity_regular_rule',
      sql`${t.reservedRegular} >= 0 AND ${t.heldRegular} >= 0 AND ${t.heldRegular} <= ${t.reservedRegular}`,
    ),
    check(
      'daily_capacity_po_rule',
      sql`${t.reservedPo} >= 0 AND ${t.heldPo} >= 0 AND ${t.heldPo} <= ${t.reservedPo}`,
    ),
  ],
);
