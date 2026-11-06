import type { Context } from 'hono';
import type { z } from 'zod';
import { AppError } from '@catering/core';
import type { AppEnv } from '../types';

export function ok<T>(c: Context<AppEnv>, data: T, status: 200 | 201 = 200) {
  return c.json({ data }, status);
}

export function requestIp(c: Context<AppEnv>): string {
  const forwarded = c.req.header('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]!.trim();
  const real = c.req.header('x-real-ip');
  if (real) return real.trim();
  return '127.0.0.1';
}

export function requestId(c: Context<AppEnv>): string {
  return c.get('requestId');
}

/** Parse & validasi body JSON; ZodError ditangani middleware error global. */
export async function parseBody<S extends z.ZodType>(c: Context<AppEnv>, schema: S): Promise<z.infer<S>> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    throw new AppError('VALIDATION_ERROR', 'Body harus JSON yang valid.');
  }
  return schema.parse(raw) as z.infer<S>;
}

export function parseQuery<S extends z.ZodType>(c: Context<AppEnv>, schema: S): z.infer<S> {
  return schema.parse(c.req.query()) as z.infer<S>;
}

export function requireIdempotencyKey(c: Context<AppEnv>): string {
  const key = c.req.header('idempotency-key')?.trim();
  if (!key || key.length < 8 || key.length > 128) {
    throw new AppError('VALIDATION_ERROR', 'Header Idempotency-Key wajib diisi (8–128 karakter).', {
      hint: 'Gunakan UUID acak per percobaan checkout.',
    });
  }
  return key;
}
