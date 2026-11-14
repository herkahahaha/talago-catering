import { sql } from 'drizzle-orm';
import type { AdminOrderSettingsInput } from '@catering/contracts';
import { settings } from './schema';
import { recordAudit } from '../audit/index';
import { AppError } from '../../lib/ids';
import type { Executor } from '../../db/client';

/**
 * Default desain dari PRD §2/§5. Nilai efektif selalu dibaca dari tabel
 * `settings`; default hanya dipakai bila baris belum ada.
 */
export const SETTING_DEFAULTS = {
  'capacity.max_regular': 200,
  'capacity.max_po': 500,
  'capacity.kitchen_max_total': 1000,
  'capacity.target_min': 50,
  'capacity.hold_ceiling_ratio': 0.5,
  'order.min_portions': 50,
  // Permintaan bisnis: order reguler boleh sampai 200 porsi (dapat diturunkan admin).
  'order.max_portions_per_order': 200,
  'order.hold_minutes': 10,
  'order.hold_ttl_minutes': 10,
  'cutoff.hour': 18,
  'cutoff.minute': 0,
  'delivery.fee': 0,
  'delivery.default_window_max_stops': 20,
  'captcha.required': true,
  'captcha.provider': 'challenge',
  'ratelimit.active_holds_per_phone': 1,
  'ratelimit.holds_per_ip_per_hour': 3,
  'ratelimit.otp_per_phone_per_hour': 3,
  'ratelimit.checkout_per_session_per_10min': 5,
  'otp.adaptive_expiry_threshold': 2,
  'otp.code_ttl_minutes': 5,
  'payment.gateway': 'mock',
  'privacy.consent_version': '2026-10-01',
  'zone.default_name': 'Pontianak',
  'catalog.days_ahead': 14,
} as const;

export type SettingKey = keyof typeof SETTING_DEFAULTS;
export type SettingsMap = Record<string, unknown>;

export async function getSettingsMap(exec: Executor): Promise<SettingsMap> {
  const rows = await exec.select().from(settings);
  const map: SettingsMap = { ...SETTING_DEFAULTS };
  for (const row of rows) map[row.key] = row.value;
  return map;
}

export async function getSetting<T = unknown>(exec: Executor, key: SettingKey): Promise<T> {
  const [row] = await exec
    .select()
    .from(settings)
    .where(sql`${settings.key} = ${key}`)
    .limit(1);
  if (row) return row.value as T;
  return SETTING_DEFAULTS[key] as T;
}

export async function setSetting(
  exec: Executor,
  key: SettingKey,
  value: unknown,
  updatedBy = 'system',
): Promise<void> {
  await exec
    .insert(settings)
    .values({ key, value: value as never, updatedAt: new Date(), updatedBy })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value: value as never, updatedAt: new Date(), updatedBy },
    });
}

export async function ensureDefaultSettings(exec: Executor, updatedBy = 'seed'): Promise<void> {
  const entries = Object.entries(SETTING_DEFAULTS);
  for (const [key, value] of entries) {
    await exec
      .insert(settings)
      .values({ key, value: value as never, updatedAt: new Date(), updatedBy })
      .onConflictDoNothing();
  }
}

export interface CapacityConfig {
  maxRegular: number;
  maxPo: number;
  kitchenMaxTotal: number;
  targetMin: number;
  holdCeilingRatio: number;
  cutoffHour: number;
  cutoffMinute: number;
}

export async function getCapacityConfig(exec: Executor): Promise<CapacityConfig> {
  const map = await getSettingsMap(exec);
  const num = (key: SettingKey, fallback: number) => {
    const value = map[key];
    const parsed = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  return {
    maxRegular: num('capacity.max_regular', 200),
    maxPo: num('capacity.max_po', 500),
    kitchenMaxTotal: num('capacity.kitchen_max_total', 1000),
    targetMin: num('capacity.target_min', 50),
    holdCeilingRatio: num('capacity.hold_ceiling_ratio', 0.5),
    cutoffHour: num('cutoff.hour', 18),
    cutoffMinute: num('cutoff.minute', 0),
  };
}

export interface OrderConfig {
  minPortions: number;
  maxPortionsPerOrder: number;
  holdMinutes: number;
}

export async function getOrderConfig(exec: Executor): Promise<OrderConfig> {
  const map = await getSettingsMap(exec);
  const num = (key: SettingKey, fallback: number) => {
    const value = map[key];
    const parsed = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  return {
    minPortions: num('order.min_portions', 50),
    maxPortionsPerOrder: num('order.max_portions_per_order', 200),
    holdMinutes: num('order.hold_minutes', 10),
  };
}

/**
 * Ubah aturan checkout global. Perubahan batas maksimum tidak otomatis
 * menurunkan plafon hold; API memanggil capacity.ensureMinimumHoldCeiling
 * agar order sebesar batas baru tetap bisa ditahan.
 */
export async function updateOrderSettings(
  exec: Executor,
  input: AdminOrderSettingsInput,
  actor: { id?: string | null; label: string },
): Promise<OrderConfig> {
  if (input.minPortions > input.maxPortionsPerOrder) {
    throw new AppError('VALIDATION_ERROR', 'Minimal porsi tidak boleh melebihi batas maksimal per order.');
  }
  const before = await getOrderConfig(exec);

  await setSetting(exec, 'order.min_portions', input.minPortions, actor.label);
  await setSetting(exec, 'order.max_portions_per_order', input.maxPortionsPerOrder, actor.label);
  await setSetting(exec, 'order.hold_minutes', input.holdMinutes, actor.label);

  const after = await getOrderConfig(exec);

  await recordAudit(exec, {
    actor: { type: 'staff', id: actor.id ?? null, label: actor.label },
    entity: 'settings',
    entityId: 'order',
    action: 'order_settings_updated',
    before: { ...before },
    after: { ...after },
  });

  return after;
}

export async function getBooleanSetting(exec: Executor, key: SettingKey): Promise<boolean> {
  const value = await getSetting(exec, key);
  return Boolean(value);
}
