import { index, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * Outbox notifikasi. Worker mengambil baris `queued`, mengirim (mock/SMTP/WA),
 * lalu menandai `sent`/`failed`. Web TIDAK boleh mengirim email langsung.
 */
export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    channel: text('channel').$type<'email' | 'whatsapp' | 'sms'>().notNull(),
    recipient: text('recipient').notNull(),
    template: text('template').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    status: text('status').$type<'queued' | 'sent' | 'failed'>().notNull().default('queued'),
    attempts: integer('attempts').notNull().default(0),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    error: text('error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('notifications_status_idx').on(t.status, t.createdAt)],
);
