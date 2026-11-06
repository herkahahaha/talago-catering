import { z } from 'zod';

/** Kode error publik. Klien boleh bergantung pada nilai ini, bukan pada pesan. */
export const ERROR_CODES = [
  'VALIDATION_ERROR',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CAPACITY_FULL',
  'CUTOFF_PASSED',
  'DAY_CLOSED',
  'MIN_ORDER_NOT_MET',
  'ORDER_TOO_LARGE',
  'HOLD_LIMIT',
  'CAPTCHA_REQUIRED',
  'OTP_REQUIRED',
  'RATE_LIMITED',
  'IDEMPOTENCY_CONFLICT',
  'INVALID_STATE',
  'CAPACITY_RULE_VIOLATION',
  'PAYMENT_ERROR',
  'INTERNAL_ERROR',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export const errorCodeSchema = z.enum(ERROR_CODES);

/** Bentuk amplop error API v1. */
export const apiErrorSchema = z.object({
  error: z.object({
    code: errorCodeSchema,
    message: z.string(),
    /** Saran tindakan untuk UI, mis. "Sisa 12 porsi untuk 3 Nov". */
    hint: z.string().optional(),
    details: z.record(z.string(), z.unknown()).optional(),
    requestId: z.string().optional(),
  }),
});

export type ApiError = z.infer<typeof apiErrorSchema>;

export function apiError(
  code: ErrorCode,
  message: string,
  extra?: { hint?: string; details?: Record<string, unknown> },
): ApiError {
  return {
    error: {
      code,
      message,
      ...(extra?.hint ? { hint: extra.hint } : {}),
      ...(extra?.details ? { details: extra.details } : {}),
    },
  };
}
