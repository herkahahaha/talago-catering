import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

/* ── customers ─────────────────────────────────────────────────────── */

export const customers = pgTable(
  'customers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    phone: text('phone').notNull(),
    email: text('email'),
    accountId: uuid('account_id'),
    consentAt: timestamp('consent_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('customers_phone_uq').on(t.phone)],
);

export const addresses = pgTable(
  'addresses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    customerId: uuid('customer_id').notNull(),
    line: text('line').notNull(),
    district: text('district'),
    lat: doublePrecision('lat'),
    lng: doublePrecision('lng'),
    zoneId: uuid('zone_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('addresses_customer_idx').on(t.customerId)],
);

/** Sesi tamu: cookie httpOnly menyimpan token mentah; DB hanya hash. */
export const guestSessions = pgTable(
  'guest_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    customerId: uuid('customer_id').notNull(),
    tokenHash: text('token_hash').notNull(),
    ip: text('ip'),
    userAgent: text('user_agent'),
    otpVerifiedAt: timestamp('otp_verified_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('guest_sessions_token_uq').on(t.tokenHash),
    index('guest_sessions_customer_idx').on(t.customerId),
  ],
);

/* ── zones ─────────────────────────────────────────────────────────── */

export const serviceZones = pgTable(
  'service_zones',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    city: text('city').notNull(),
    fee: integer('fee').notNull().default(0),
    freeDelivery: boolean('free_delivery').notNull().default(true),
    etaNote: text('eta_note'),
    centerLat: doublePrecision('center_lat'),
    centerLng: doublePrecision('center_lng'),
    radiusKm: doublePrecision('radius_km'),
    districts: jsonb('districts').$type<string[]>().notNull().default([]),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('service_zones_name_uq').on(t.name)],
);
