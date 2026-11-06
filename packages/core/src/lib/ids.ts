import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import type { ErrorCode } from '@catering/contracts';
import { getEnv } from '../env';

/** Token acak URL-safe. Hanya hash-nya yang disimpan di database. */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function hashToken(token: string): string {
  return sha256Hex(token);
}

export function uuid(): string {
  return randomUUID();
}

const ORDER_NO_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function randomCode(length: number): string {
  const bytes = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += ORDER_NO_ALPHABET[bytes[i]! % ORDER_NO_ALPHABET.length];
  }
  return out;
}

/** Nomor order yang mudah dibaca di WhatsApp: CG-261103-K7QP. */
export function makeOrderNo(serviceDate: string): string {
  return `CG-${serviceDate.slice(2).replace(/-/g, '')}-${randomCode(4)}`;
}

export function makeQuoteNo(serviceDate: string): string {
  return `QT-${serviceDate.slice(2).replace(/-/g, '')}-${randomCode(4)}`;
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '')
    .slice(0, 80);
}

/**
 * Token tautan status order diturunkan dari HMAC, bukan disimpan mentah.
 * Replay idempotensi dan admin bisa merekonstruksinya tanpa menyimpan
 * bearer token di database.
 */
export function deriveStatusToken(seed: string): string {
  return createHmac('sha256', getEnv().SESSION_SECRET).update(`order-status:${seed}`).digest('base64url');
}

/** JSON stabil untuk hash idempotensi (urutan kunci tidak memengaruhi). */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
}

/** Error aplikasi dengan kode publik dari contracts. */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly hint?: string;
  readonly details?: Record<string, unknown>;

  constructor(
    code: ErrorCode,
    message: string,
    options?: { status?: number; hint?: string; details?: Record<string, unknown>; cause?: unknown },
  ) {
    super(message, options?.cause ? { cause: options.cause } : undefined);
    this.name = 'AppError';
    this.code = code;
    this.status = options?.status ?? statusForCode(code);
    this.hint = options?.hint;
    this.details = options?.details;
  }
}

export function statusForCode(code: ErrorCode): number {
  switch (code) {
    case 'VALIDATION_ERROR':
      return 400;
    case 'UNAUTHORIZED':
      return 401;
    case 'FORBIDDEN':
    case 'CAPTCHA_REQUIRED':
    case 'OTP_REQUIRED':
      return 403;
    case 'NOT_FOUND':
      return 404;
    case 'INVALID_STATE':
      return 409;
    case 'IDEMPOTENCY_CONFLICT':
      return 409;
    case 'RATE_LIMITED':
    case 'HOLD_LIMIT':
      return 429;
    case 'CAPACITY_FULL':
    case 'DAY_CLOSED':
    case 'CUTOFF_PASSED':
    case 'MIN_ORDER_NOT_MET':
    case 'ORDER_TOO_LARGE':
    case 'CAPACITY_RULE_VIOLATION':
    case 'PAYMENT_ERROR':
      return 422;
    case 'INTERNAL_ERROR':
      return 500;
  }
}

export function isAppError(value: unknown): value is AppError {
  return value instanceof AppError;
}
