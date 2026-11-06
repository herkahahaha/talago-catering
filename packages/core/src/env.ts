import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { z } from 'zod';

/**
 * Memuat .env terdekat (root monorepo) tanpa dependensi tambahan.
 * Node >= 22 menyediakan process.loadEnvFile.
 */
function findEnvFile(start: string): string | null {
  let dir = resolve(start);
  for (let depth = 0; depth < 6; depth += 1) {
    const candidate = resolve(dir, '.env');
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

let loaded = false;

export function loadEnv(): void {
  if (loaded) return;
  loaded = true;
  if (process.env.NODE_ENV === 'test') return;
  const file = findEnvFile(process.cwd());
  if (file && typeof process.loadEnvFile === 'function') {
    try {
      process.loadEnvFile(file);
    } catch {
      // .env opsional; variabel bisa datang dari environment proses.
    }
  }
}

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  ROLE: z.enum(['web', 'worker']).default('web'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  TZ: z.string().default('Asia/Jakarta'),
  DATABASE_URL: z.string().min(1),
  DATABASE_URL_TEST: z.string().optional(),
  DB_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
  APP_URL: z.string().default('http://127.0.0.1:4321'),
  DASHBOARD_URL: z.string().default('http://127.0.0.1:3001'),
  API_BASE_URL: z.string().default('http://127.0.0.1:3000'),
  SESSION_SECRET: z.string().min(16).default('dev-session-secret-change-me-please-32b'),
  CAPTCHA_SECRET: z.string().min(16).default('dev-captcha-secret-change-me-32b'),
  CAPTCHA_PROVIDER: z.enum(['challenge', 'turnstile']).default('challenge'),
  PAYMENT_GATEWAY: z.enum(['mock', 'midtrans', 'xendit']).default('mock'),
  PAYMENT_WEBHOOK_SECRET: z.string().min(8).default('dev-webhook-secret'),
  ADMIN_EMAIL: z.string().default('admin@catering.local'),
  ADMIN_PASSWORD: z.string().min(8).default('admin12345'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

export function getEnv(): Env {
  loadEnv();
  if (!cached) {
    const parsed = envSchema.safeParse(process.env);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
      throw new Error(`Konfigurasi environment tidak valid: ${issues}`);
    }
    cached = parsed.data;
  }
  return cached;
}

/** Dipakai tes yang mengganti DATABASE_URL antar suite. */
export function resetEnvCache(): void {
  cached = null;
  loaded = false;
}

export function isProduction(): boolean {
  return getEnv().NODE_ENV === 'production';
}

export function isTest(): boolean {
  return (process.env.NODE_ENV ?? 'development') === 'test';
}
