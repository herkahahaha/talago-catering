import { createHmac, timingSafeEqual } from 'node:crypto';
import { getEnv } from '../env';

interface ViewPayload {
  orderId: string;
  exp: number;
}

const PREFIX = 'v1';

function signature(payload: string): string {
  return createHmac('sha256', getEnv().SESSION_SECRET).update(`order-view:${payload}`).digest('base64url');
}

/**
 * Token tampilan order bertanda tangan untuk halaman lacak pesanan.
 * Tidak disimpan di database; kedaluwarsa pendek (default 30 menit) dan
 * hanya bisa dibuat setelah pemilik order terverifikasi (sesi atau nomor HP).
 */
export function signOrderViewToken(orderId: string, ttlMinutes = 30): string {
  const payload = Buffer.from(
    JSON.stringify({ orderId, exp: Date.now() + ttlMinutes * 60_000 } satisfies ViewPayload),
  ).toString('base64url');
  return `${PREFIX}.${payload}.${signature(payload)}`;
}

export function verifyOrderViewToken(token: string): string | null {
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== PREFIX) return null;
  const [, payload, given] = parts;
  if (!payload || !given) return null;

  const expected = signature(payload);
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(given, 'utf8');
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as ViewPayload;
    if (typeof parsed.orderId !== 'string' || typeof parsed.exp !== 'number') return null;
    if (parsed.exp < Date.now()) return null;
    return parsed.orderId;
  } catch {
    return null;
  }
}
