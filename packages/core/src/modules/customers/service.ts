import { and, eq, gt, ilike, inArray, or } from 'drizzle-orm';
import type { CustomerDto, ServiceAreaDto, ServiceZoneDto, SessionDto } from '@catering/contracts';
import { addresses, customers, guestSessions, serviceZones } from './schema';
import type { Executor } from '../../db/client';
import { AppError, hashToken, randomToken } from '../../lib/ids';
import { normalizePhone } from '../../lib/phone';

const SESSION_TTL_DAYS = 7;

export interface GuestSessionContext {
  sessionId: string;
  customer: CustomerDto;
  expiresAt: Date;
  otpVerifiedAt: Date | null;
}

export interface CreateSessionResult {
  token: string;
  session: SessionDto;
}

interface SessionInput {
  name: string;
  phone: string;
  email?: string;
  consent: true;
  location?: { address?: string; district?: string; lat?: number; lng?: number };
}

export async function createGuestSession(
  exec: Executor,
  input: SessionInput,
  meta: { ip?: string | null; userAgent?: string | null } = {},
): Promise<CreateSessionResult> {
  const phone = normalizePhone(input.phone);
  const email = input.email?.trim() ? input.email.trim().toLowerCase() : null;

  const [customer] = await exec
    .insert(customers)
    .values({
      name: input.name.trim(),
      phone,
      email,
      consentAt: new Date(),
    })
    .onConflictDoUpdate({
      target: customers.phone,
      set: {
        name: input.name.trim(),
        ...(email ? { email } : {}),
        consentAt: new Date(),
        updatedAt: new Date(),
      },
    })
    .returning();

  if (!customer) throw new AppError('INTERNAL_ERROR', 'Gagal menyimpan data pelanggan.');

  if (input.location?.address) {
    await exec.insert(addresses).values({
      customerId: customer.id,
      line: input.location.address,
      district: input.location.district ?? null,
      lat: input.location.lat ?? null,
      lng: input.location.lng ?? null,
    });
  }

  const token = randomToken(32);
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 86_400_000);
  await exec.insert(guestSessions).values({
    customerId: customer.id,
    tokenHash: hashToken(token),
    ip: meta.ip ?? null,
    userAgent: meta.userAgent ?? null,
    expiresAt,
  });

  return {
    token,
    session: {
      customer: toCustomerDto(customer),
      expiresAt: expiresAt.toISOString(),
      location: input.location ?? null,
    },
  };
}

export function toCustomerDto(row: typeof customers.$inferSelect): CustomerDto {
  return { id: row.id, name: row.name, phone: row.phone, email: row.email };
}

export async function findGuestSession(exec: Executor, token: string): Promise<GuestSessionContext | null> {
  const tokenHash = hashToken(token);
  const [row] = await exec
    .select({
      sessionId: guestSessions.id,
      expiresAt: guestSessions.expiresAt,
      otpVerifiedAt: guestSessions.otpVerifiedAt,
      customer: customers,
    })
    .from(guestSessions)
    .innerJoin(customers, eq(customers.id, guestSessions.customerId))
    .where(and(eq(guestSessions.tokenHash, tokenHash), gt(guestSessions.expiresAt, new Date())))
    .limit(1);

  if (!row) return null;

  await exec.update(guestSessions).set({ lastSeenAt: new Date() }).where(eq(guestSessions.id, row.sessionId));

  return {
    sessionId: row.sessionId,
    customer: toCustomerDto(row.customer),
    expiresAt: row.expiresAt,
    otpVerifiedAt: row.otpVerifiedAt,
  };
}

export async function requireGuestSession(
  exec: Executor,
  token: string | undefined,
): Promise<GuestSessionContext> {
  if (!token) {
    throw new AppError('UNAUTHORIZED', 'Sesi tamu tidak ditemukan. Mulai ulang dari halaman menu.', {
      hint: 'Isi nama dan nomor HP terlebih dahulu.',
    });
  }
  const session = await findGuestSession(exec, token);
  if (!session) {
    throw new AppError('UNAUTHORIZED', 'Sesi tamu kedaluwarsa. Silakan mulai lagi.', {
      hint: 'Sesi berlaku 7 hari.',
    });
  }
  return session;
}

export async function markSessionOtpVerified(exec: Executor, sessionId: string): Promise<void> {
  await exec.update(guestSessions).set({ otpVerifiedAt: new Date() }).where(eq(guestSessions.id, sessionId));
}

export async function getCustomersByIds(exec: Executor, ids: string[]): Promise<Map<string, CustomerDto>> {
  if (ids.length === 0) return new Map();
  const rows = await exec.select().from(customers).where(inArray(customers.id, ids));
  return new Map(rows.map((row) => [row.id, toCustomerDto(row)]));
}

/** Pencarian pelanggan untuk filter dashboard (nama atau nomor HP). */
export async function searchCustomerIds(exec: Executor, query: string, limit = 50): Promise<string[]> {
  const term = `%${query.trim()}%`;
  const rows = await exec
    .select({ id: customers.id })
    .from(customers)
    .where(or(ilike(customers.name, term), ilike(customers.phone, term)))
    .limit(limit);
  return rows.map((row) => row.id);
}

export async function getCustomerById(exec: Executor, id: string): Promise<CustomerDto | null> {
  const [row] = await exec.select().from(customers).where(eq(customers.id, id)).limit(1);
  return row ? toCustomerDto(row) : null;
}

/* ── zona layanan ────────────────────────────────────────────────────── */

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function normalizeArea(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function toZoneDto(row: typeof serviceZones.$inferSelect): ServiceZoneDto {
  return {
    id: row.id,
    name: row.name,
    city: row.city,
    fee: row.fee,
    freeDelivery: row.freeDelivery,
    etaNote: row.etaNote,
  };
}

export async function getActiveZone(exec: Executor): Promise<ServiceZoneDto | null> {
  const [row] = await exec
    .select()
    .from(serviceZones)
    .where(eq(serviceZones.isActive, true))
    .orderBy(serviceZones.createdAt)
    .limit(1);
  return row ? toZoneDto(row) : null;
}

export interface ServiceAreaQuery {
  lat?: number;
  lng?: number;
  district?: string;
}

/**
 * Zona tunggal (PRD §2 butir 8): satu kota, ongkir gratis. Titik koordinat
 * opsional; kecamatan/daerah adalah jalur utama.
 */
export async function resolveServiceArea(exec: Executor, query: ServiceAreaQuery): Promise<ServiceAreaDto> {
  const [zoneRow] = await exec
    .select()
    .from(serviceZones)
    .where(eq(serviceZones.isActive, true))
    .orderBy(serviceZones.createdAt)
    .limit(1);

  if (!zoneRow) {
    return {
      inZone: false,
      zone: null,
      deliveryFee: 0,
      message: 'Zona layanan belum diatur. Hubungi admin.',
    };
  }

  const zone = toZoneDto(zoneRow);
  const fee = zone.freeDelivery ? 0 : zone.fee;
  const district = query.district ? normalizeArea(query.district) : null;

  let inZone: boolean | null = null;

  if (
    typeof query.lat === 'number' &&
    typeof query.lng === 'number' &&
    zoneRow.centerLat &&
    zoneRow.centerLng
  ) {
    const distance = haversineKm(query.lat, query.lng, zoneRow.centerLat, zoneRow.centerLng);
    inZone = distance <= (zoneRow.radiusKm ?? 15);
  }

  if (district) {
    const candidates = [zoneRow.city, zoneRow.name, ...(zoneRow.districts ?? [])].map(normalizeArea);
    const matches = candidates.some(
      (candidate) => candidate.includes(district) || district.includes(candidate),
    );
    inZone = matches || (inZone ?? false);
  }

  if (inZone === null) {
    return {
      inZone: true,
      zone,
      deliveryFee: fee,
      message: `Kami mengantar ke area ${zone.city}. Ongkir ${fee === 0 ? 'gratis' : 'dihitung saat checkout'}.`,
    };
  }

  return {
    inZone,
    zone: inZone ? zone : null,
    deliveryFee: inZone ? fee : 0,
    message: inZone
      ? `Alamat Anda masuk area ${zone.name}. ${fee === 0 ? 'Ongkir gratis.' : ''}`
      : `Alamat di luar area layanan ${zone.city}. Kami belum bisa mengantar ke sana.`,
  };
}

/** Upsert pelanggan berdasarkan nomor HP; dipakai order manual admin. */
export async function ensureCustomer(
  exec: Executor,
  input: { name: string; phone: string; email?: string | null; consentAt?: Date },
): Promise<CustomerDto> {
  const phone = normalizePhone(input.phone);
  const email = input.email?.trim() ? input.email.trim().toLowerCase() : null;
  const [row] = await exec
    .insert(customers)
    .values({
      name: input.name.trim(),
      phone,
      email,
      consentAt: input.consentAt ?? new Date(),
    })
    .onConflictDoUpdate({
      target: customers.phone,
      set: { name: input.name.trim(), ...(email ? { email } : {}), updatedAt: new Date() },
    })
    .returning();
  if (!row) throw new AppError('INTERNAL_ERROR', 'Gagal menyimpan pelanggan.');
  return toCustomerDto(row);
}

export async function findCustomerByPhone(exec: Executor, phone: string): Promise<CustomerDto | null> {
  const normalized = normalizePhone(phone);
  const [row] = await exec.select().from(customers).where(eq(customers.phone, normalized)).limit(1);
  return row ? toCustomerDto(row) : null;
}
