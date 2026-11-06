import { sql } from 'drizzle-orm';
import { AppError } from '../../lib/ids';
import { rateLimits } from './schema';
import type { Executor } from '../../db/client';

export interface RateLimitOptions {
  /** Kunci stabil: `ip:1.2.3.4`, `phone:+62...`, `session:<id>`, `staff:<id>`. */
  key: string;
  limit: number;
  windowSeconds: number;
}

export interface RateLimitState {
  allowed: boolean;
  count: number;
  limit: number;
  windowStart: Date;
  resetAt: Date;
}

/**
 * Hitungan rate limit disimpan di PostgreSQL agar konsisten di semua
 * instance dan tidak reset saat deploy (PRD §5). Satu UPSERT atomik.
 */
export async function hitRateLimit(exec: Executor, options: RateLimitOptions): Promise<RateLimitState> {
  const bucketMs = options.windowSeconds * 1000;
  const windowStart = new Date(Math.floor(Date.now() / bucketMs) * bucketMs);
  const resetAt = new Date(windowStart.getTime() + bucketMs);

  const result = await exec.execute(sql`
    INSERT INTO rate_limits (key, window_start, count)
    VALUES (${options.key}, ${windowStart.toISOString()}, 1)
    ON CONFLICT (key, window_start)
    DO UPDATE SET count = rate_limits.count + 1
    RETURNING count
  `);

  const raw = (result.rows[0] as { count?: number | string } | undefined)?.count ?? 1;
  const count = Number(raw);
  return {
    allowed: count <= options.limit,
    count,
    limit: options.limit,
    windowStart,
    resetAt,
  };
}

export async function assertRateLimit(
  exec: Executor,
  options: RateLimitOptions,
  message = 'Terlalu banyak permintaan. Coba lagi beberapa saat lagi.',
): Promise<RateLimitState> {
  const state = await hitRateLimit(exec, options);
  if (!state.allowed) {
    throw new AppError('RATE_LIMITED', message, {
      hint: `Batas ${options.limit} percobaan per ${Math.round(options.windowSeconds / 60)} menit.`,
      details: { resetAt: state.resetAt.toISOString() },
    });
  }
  return state;
}

/** Pembersihan murah; dipanggil worker sekali sehari. */
export async function pruneRateLimits(exec: Executor, olderThanHours = 48): Promise<number> {
  const result = await exec.execute(
    sql`DELETE FROM rate_limits WHERE window_start < now() - make_interval(hours => ${olderThanHours})`,
  );
  return result.rowCount ?? 0;
}

export { rateLimits };
