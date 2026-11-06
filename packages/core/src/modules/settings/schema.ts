import { jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

/** Konfigurasi runtime (PRD §2: semua nilai disimpan sebagai konfigurasi). */
export const settings = pgTable('settings', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  updatedBy: text('updated_by'),
});
