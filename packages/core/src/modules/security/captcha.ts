import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import type { CaptchaChallenge } from '@catering/contracts';
import { AppError, hashToken, uuid } from '../../lib/ids';
import { getEnv } from '../../env';
import { captchaChallenges } from './schema';
import type { Executor } from '../../db/client';

const ANSWER_TTL_MINUTES = 10;

function signAnswer(challengeId: string, answer: string): string {
  return createHmac('sha256', getEnv().CAPTCHA_SECRET)
    .update(`${challengeId}:${answer.trim()}`)
    .digest('hex');
}

function safeEqualHex(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * CAPTCHA pengganti sementara (PRD §5: "CAPTCHA sebelum hold dibuat").
 * Provider `challenge` menghasilkan soal aritmetika bertanda tangan HMAC
 * di server; jawaban tidak pernah dikirim ke klien. Untuk production,
 * ganti CAPTCHA_PROVIDER=turnstile dan verifikasi token Cloudflare.
 */
export async function createCaptchaChallenge(exec: Executor, ip?: string | null): Promise<CaptchaChallenge> {
  const provider = getEnv().CAPTCHA_PROVIDER;
  if (provider === 'turnstile') {
    throw new AppError('CAPTCHA_REQUIRED', 'CAPTCHA Turnstile harus diselesaikan di klien.', {
      hint: 'Sertakan token Turnstile pada langkah konfirmasi.',
    });
  }

  const a = randomInt(2, 10);
  const b = randomInt(2, 10);
  const useSum = randomInt(0, 2) === 0;
  const answer = useSum ? a + b : a * b;
  const question = useSum ? `Berapa ${a} + ${b}?` : `Berapa ${a} × ${b}?`;
  const id = uuid();
  const expiresAt = new Date(Date.now() + ANSWER_TTL_MINUTES * 60_000);

  await exec.insert(captchaChallenges).values({
    id,
    question,
    answerHash: signAnswer(id, String(answer)),
    ip: ip ?? null,
    expiresAt,
  });

  return {
    challengeId: id,
    question,
    expiresAt: expiresAt.toISOString(),
    provider: 'challenge',
  };
}

async function verifyTurnstile(token: string): Promise<void> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    throw new AppError('CAPTCHA_REQUIRED', 'CAPTCHA belum dikonfigurasi di server.');
  }
  const body = new URLSearchParams({ secret, response: token });
  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    body,
    signal: AbortSignal.timeout(5_000),
  }).catch(() => null);
  if (!res?.ok) {
    throw new AppError('CAPTCHA_REQUIRED', 'Verifikasi CAPTCHA gagal. Coba lagi.');
  }
  const data = (await res.json()) as { success?: boolean };
  if (!data.success) {
    throw new AppError('CAPTCHA_REQUIRED', 'Verifikasi CAPTCHA gagal. Coba lagi.');
  }
}

/**
 * Token dari klien berbentuk `<challengeId>.<jawaban>` untuk provider
 * challenge, atau token Turnstile mentah untuk provider turnstile.
 */
export async function verifyCaptchaToken(exec: Executor, token: string): Promise<void> {
  if (getEnv().CAPTCHA_PROVIDER === 'turnstile') {
    await verifyTurnstile(token);
    return;
  }

  const separator = token.lastIndexOf('.');
  if (separator <= 0) {
    throw new AppError('CAPTCHA_REQUIRED', 'Token CAPTCHA tidak valid.');
  }
  const challengeId = token.slice(0, separator);
  const answer = token.slice(separator + 1);

  const [challenge] = await exec
    .select()
    .from(captchaChallenges)
    .where(eq(captchaChallenges.id, challengeId))
    .limit(1);

  if (!challenge) throw new AppError('CAPTCHA_REQUIRED', 'CAPTCHA tidak ditemukan atau sudah kedaluwarsa.');
  if (challenge.consumedAt)
    throw new AppError('CAPTCHA_REQUIRED', 'CAPTCHA sudah dipakai. Muat ulang halaman.');
  if (challenge.expiresAt.getTime() < Date.now()) {
    throw new AppError('CAPTCHA_REQUIRED', 'CAPTCHA kedaluwarsa. Muat ulang halaman.');
  }

  const expected = signAnswer(challengeId, answer);
  if (!safeEqualHex(expected, challenge.answerHash)) {
    throw new AppError('CAPTCHA_REQUIRED', 'Jawaban CAPTCHA salah. Coba lagi.', {
      hint: 'Muat ulang halaman untuk soal baru.',
    });
  }

  await exec
    .update(captchaChallenges)
    .set({ consumedAt: new Date() })
    .where(eq(captchaChallenges.id, challengeId));
}

/** Membersihkan CAPTCHA kedaluwarsa; dipanggil worker. */
export async function pruneCaptchaChallenges(exec: Executor): Promise<number> {
  const result = await exec.execute(
    sql`DELETE FROM captcha_challenges WHERE expires_at < now() - interval '1 hour'`,
  );
  return result.rowCount ?? 0;
}

export { hashToken };
