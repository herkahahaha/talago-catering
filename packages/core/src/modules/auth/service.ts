import { createHmac, randomInt, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { and, desc, eq, gt } from 'drizzle-orm';
import type { OtpRequestDto, StaffDto, StaffRole } from '@catering/contracts';
import { otpChallenges, staffSessions, staffUsers } from './schema';
import type { Executor } from '../../db/client';
import { AppError, hashToken, randomToken } from '../../lib/ids';
import { normalizePhone } from '../../lib/phone';
import { getEnv, isProduction } from '../../env';
import { recordAudit } from '../audit/index';
import { enqueueNotification } from '../notifications/index';
import { assertRateLimit } from '../security/index';
import { getSetting } from '../settings/index';

const scrypt = promisify(scryptCallback) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number },
) => Promise<Buffer>;

const SCRYPT_PARAMS = { N: 16_384, r: 8, p: 1 } as const;

/** Format: scrypt$N$r$p$salt$hash (salt & hash base64url). */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomToken(16);
  const key = await scrypt(password, Buffer.from(salt, 'base64url'), 64, SCRYPT_PARAMS);
  return `scrypt$${SCRYPT_PARAMS.N}$${SCRYPT_PARAMS.r}$${SCRYPT_PARAMS.p}$${salt}$${key.toString('base64url')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, N, r, p, salt, hash] = parts;
  try {
    const key = await scrypt(password, Buffer.from(salt!, 'base64url'), 64, {
      N: Number(N),
      r: Number(r),
      p: Number(p),
    });
    const expected = Buffer.from(hash!, 'base64url');
    return key.length === expected.length && timingSafeEqual(key, expected);
  } catch {
    return false;
  }
}

export function toStaffDto(row: typeof staffUsers.$inferSelect): StaffDto {
  return { id: row.id, name: row.name, email: row.email, role: row.role };
}

export async function createStaffUser(
  exec: Executor,
  input: { name: string; email: string; password: string; role: StaffRole },
): Promise<StaffDto> {
  const [row] = await exec
    .insert(staffUsers)
    .values({
      name: input.name,
      email: input.email.toLowerCase(),
      passwordHash: await hashPassword(input.password),
      role: input.role,
    })
    .onConflictDoNothing({ target: staffUsers.email })
    .returning();
  if (row) return toStaffDto(row);
  const [existing] = await exec
    .select()
    .from(staffUsers)
    .where(eq(staffUsers.email, input.email.toLowerCase()))
    .limit(1);
  if (!existing) throw new AppError('INTERNAL_ERROR', 'Gagal membuat user staf.');
  return toStaffDto(existing);
}

export interface StaffSessionContext {
  sessionId: string;
  user: StaffDto;
  expiresAt: Date;
}

const STAFF_SESSION_HOURS = 8;

export async function loginStaff(
  exec: Executor,
  input: { email: string; password: string },
  meta: { ip?: string | null; userAgent?: string | null } = {},
): Promise<{ token: string; session: StaffSessionContext }> {
  const [user] = await exec
    .select()
    .from(staffUsers)
    .where(eq(staffUsers.email, input.email.toLowerCase()))
    .limit(1);

  if (!user || !user.isActive || !(await verifyPassword(input.password, user.passwordHash))) {
    await recordAudit(exec, {
      actor: { type: 'system', label: 'auth' },
      entity: 'staff_auth',
      entityId: input.email.toLowerCase(),
      action: 'login_failed',
      after: { email: input.email.toLowerCase() },
    });
    throw new AppError('UNAUTHORIZED', 'Email atau password salah.');
  }

  const token = randomToken(32);
  const expiresAt = new Date(Date.now() + STAFF_SESSION_HOURS * 3_600_000);
  const sessionId = hashToken(token);
  await exec.insert(staffSessions).values({
    id: sessionId,
    staffId: user.id,
    expiresAt,
    ip: meta.ip ?? null,
    userAgent: meta.userAgent ?? null,
  });
  await exec.update(staffUsers).set({ lastLoginAt: new Date() }).where(eq(staffUsers.id, user.id));

  await recordAudit(exec, {
    actor: { type: 'staff', id: user.id, label: user.name },
    entity: 'staff_auth',
    entityId: user.id,
    action: 'login_success',
    after: { email: user.email, role: user.role },
  });

  return { token, session: { sessionId, user: toStaffDto(user), expiresAt } };
}

export async function getStaffSession(
  exec: Executor,
  token: string | undefined,
): Promise<StaffSessionContext | null> {
  if (!token) return null;
  const sessionId = hashToken(token);
  const [row] = await exec
    .select({ session: staffSessions, user: staffUsers })
    .from(staffSessions)
    .innerJoin(staffUsers, eq(staffUsers.id, staffSessions.staffId))
    .where(and(eq(staffSessions.id, sessionId), gt(staffSessions.expiresAt, new Date())))
    .limit(1);

  if (!row || !row.user.isActive) return null;
  return { sessionId, user: toStaffDto(row.user), expiresAt: row.session.expiresAt };
}

export async function requireStaffSession(
  exec: Executor,
  token: string | undefined,
): Promise<StaffSessionContext> {
  const session = await getStaffSession(exec, token);
  if (!session) throw new AppError('UNAUTHORIZED', 'Sesi dashboard tidak valid. Silakan masuk lagi.');
  return session;
}

export async function logoutStaff(exec: Executor, token: string | undefined): Promise<void> {
  if (!token) return;
  await exec.delete(staffSessions).where(eq(staffSessions.id, hashToken(token)));
}

export function assertRole(user: StaffDto, roles: StaffRole[]): void {
  if (!roles.includes(user.role)) {
    throw new AppError('FORBIDDEN', 'Peran Anda tidak diizinkan untuk aksi ini.', {
      details: { requiredRoles: roles, role: user.role },
    });
  }
}

/* ── OTP adaptif ─────────────────────────────────────────────────────── */

function signOtp(phone: string, code: string): string {
  return createHmac('sha256', getEnv().SESSION_SECRET).update(`otp:${phone}:${code}`).digest('hex');
}

function safeEqualHex(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

export async function requestOtp(
  exec: Executor,
  input: { phone: string; purpose: 'account_activation' | 'adaptive' },
  _meta: { ip?: string | null } = {},
): Promise<OtpRequestDto> {
  const phone = normalizePhone(input.phone);
  const perHour = Number(await getSetting(exec, 'ratelimit.otp_per_phone_per_hour')) || 3;
  await assertRateLimit(
    exec,
    { key: `otp:${phone}`, limit: perHour, windowSeconds: 3_600 },
    'Terlalu banyak permintaan OTP untuk nomor ini. Coba lagi nanti.',
  );

  const ttlMinutes = Number(await getSetting(exec, 'otp.code_ttl_minutes')) || 5;
  const code = String(randomInt(100_000, 1_000_000));
  const expiresAt = new Date(Date.now() + ttlMinutes * 60_000);

  await exec.insert(otpChallenges).values({
    phone,
    codeHash: signOtp(phone, code),
    purpose: input.purpose,
    expiresAt,
  });

  await enqueueNotification(exec, {
    channel: 'whatsapp',
    recipient: phone,
    template: 'otp_code',
    payload: { code, purpose: input.purpose, expiresInMinutes: ttlMinutes },
  });

  const response: OtpRequestDto = { channel: 'whatsapp', expiresAt: expiresAt.toISOString() };
  if (!isProduction()) response.devCode = code;
  return response;
}

export async function verifyOtp(
  exec: Executor,
  input: { phone: string; code: string; purpose: 'account_activation' | 'adaptive' },
): Promise<void> {
  const phone = normalizePhone(input.phone);
  const [challenge] = await exec
    .select()
    .from(otpChallenges)
    .where(and(eq(otpChallenges.phone, phone), eq(otpChallenges.purpose, input.purpose)))
    .orderBy(desc(otpChallenges.createdAt))
    .limit(1);

  if (!challenge) throw new AppError('UNAUTHORIZED', 'Kode OTP tidak ditemukan. Minta kode baru.');
  if (challenge.consumedAt) throw new AppError('UNAUTHORIZED', 'Kode OTP sudah dipakai. Minta kode baru.');
  if (challenge.expiresAt.getTime() < Date.now()) {
    throw new AppError('UNAUTHORIZED', 'Kode OTP kedaluwarsa. Minta kode baru.');
  }
  if (challenge.attempts >= 5) {
    throw new AppError('RATE_LIMITED', 'Terlalu banyak percobaan OTP. Minta kode baru.');
  }

  if (!safeEqualHex(signOtp(phone, input.code), challenge.codeHash)) {
    await exec
      .update(otpChallenges)
      .set({ attempts: challenge.attempts + 1 })
      .where(eq(otpChallenges.id, challenge.id));
    throw new AppError('UNAUTHORIZED', 'Kode OTP salah.');
  }

  await exec.update(otpChallenges).set({ consumedAt: new Date() }).where(eq(otpChallenges.id, challenge.id));
}
