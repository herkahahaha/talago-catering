import { index, integer, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * Rate limit terhitung, disimpan di PostgreSQL (PRD §5) agar konsisten
 * di semua instance tanpa Redis. Kunci: `ip:...`, `phone:...`, `session:...`.
 */
export const rateLimits = pgTable(
  'rate_limits',
  {
    key: text('key').notNull(),
    windowStart: timestamp('window_start', { withTimezone: true }).notNull(),
    count: integer('count').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.key, t.windowStart] }), index('rate_limits_window_idx').on(t.windowStart)],
);

/** CAPTCHA tantangan aritmetika bertanda tangan HMAC (pengganti sementara Turnstile). */
export const captchaChallenges = pgTable('captcha_challenges', {
  id: uuid('id').primaryKey().defaultRandom(),
  question: text('question').notNull(),
  answerHash: text('answer_hash').notNull(),
  ip: text('ip'),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  consumedAt: timestamp('consumed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
