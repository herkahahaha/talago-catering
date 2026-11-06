import type { Context } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import {
  AppError,
  getEnv,
  getStaffSession,
  requireGuestSession,
  type Database,
  type GuestSessionContext,
  type StaffSessionContext,
} from '@catering/core';
import type { AppEnv } from '../types';

export const GUEST_COOKIE = 'cg_session';
export const STAFF_COOKIE = 'cg_staff';

const isProduction = () => getEnv().NODE_ENV === 'production';

export function setGuestCookie(c: Context<AppEnv>, token: string): void {
  setCookie(c, GUEST_COOKIE, token, {
    httpOnly: true,
    sameSite: 'Lax',
    path: '/',
    maxAge: 7 * 86_400,
    secure: isProduction(),
  });
}

export function clearGuestCookie(c: Context<AppEnv>): void {
  deleteCookie(c, GUEST_COOKIE, { path: '/', httpOnly: true, sameSite: 'Lax' });
}

export function setStaffCookie(c: Context<AppEnv>, token: string): void {
  setCookie(c, STAFF_COOKIE, token, {
    httpOnly: true,
    sameSite: 'Lax',
    path: '/',
    maxAge: 8 * 3_600,
    secure: isProduction(),
  });
}

export function clearStaffCookie(c: Context<AppEnv>): void {
  deleteCookie(c, STAFF_COOKIE, { path: '/', httpOnly: true, sameSite: 'Lax' });
}

export function guestCookie(c: Context<AppEnv>): string | undefined {
  return getCookie(c, GUEST_COOKIE);
}

export async function currentGuest(c: Context<AppEnv>, db: Database): Promise<GuestSessionContext | null> {
  const cached = c.get('guestSession');
  if (cached) return cached;
  const token = guestCookie(c);
  if (!token) return null;
  const session = await requireGuestSession(db, token).catch(() => null);
  if (session) c.set('guestSession', session);
  return session;
}

export async function requireGuest(c: Context<AppEnv>, db: Database): Promise<GuestSessionContext> {
  const session = await currentGuest(c, db);
  if (!session) {
    throw new AppError('UNAUTHORIZED', 'Sesi tamu tidak ditemukan. Mulai lagi dari halaman menu.', {
      hint: 'Isi nama dan nomor HP terlebih dahulu.',
    });
  }
  return session;
}

export async function requireStaff(c: Context<AppEnv>, db: Database): Promise<StaffSessionContext> {
  const cached = c.get('staffSession');
  if (cached) return cached;
  const token = getCookie(c, STAFF_COOKIE);
  const session = await getStaffSession(db, token);
  if (!session) {
    throw new AppError('UNAUTHORIZED', 'Sesi dashboard tidak valid. Silakan masuk lagi.');
  }
  c.set('staffSession', session);
  return session;
}
