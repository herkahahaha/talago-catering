import { and, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import type { AvailabilityDto, DayAvailabilityDto, DaySettingsDto, DaySummaryDto } from '@catering/contracts';
import { dailyCapacity } from './schema';
import type { Database, Executor } from '../../db/client';
import { AppError } from '../../lib/ids';
import { dateRange, defaultCutoffAt, diffDays, todayWib, weekDates } from '../../lib/time';
import { getCapacityConfig, getOrderConfig, getSettingsMap } from '../settings/index';
import { recordAudit } from '../audit/index';
import { getWindows, getWindowsByDates, replaceWindows, type WindowInput } from '../delivery/index';

export type CapacityRow = typeof dailyCapacity.$inferSelect;

const NOT_LOCKED_AND_DUE = sql`cut_off_at <= now() AND production_locked_at IS NULL`;
const NOT_LOCKED = sql`production_locked_at IS NULL`;

export interface EnsureDayOptions {
  /** Hari PO biasanya dibuka admin dengan maxPo eksplisit. */
  maxPo?: number;
  targetMin?: number;
}

export async function ensureDay(
  exec: Executor,
  date: string,
  options: EnsureDayOptions = {},
): Promise<CapacityRow> {
  const existing = await getDayRow(exec, date);
  if (existing) return existing;

  const config = await getCapacityConfig(exec);
  const orderConfig = await getOrderConfig(exec);
  const maxPo = options.maxPo ?? 0;
  // Plafon hold minimal harus cukup untuk satu order sebesar batas maksimum,
  // agar aturan checkout tidak bertabrakan dengan aturan hold.
  const holdCeiling = Math.min(
    config.maxRegular,
    Math.max(Math.floor(config.maxRegular * config.holdCeilingRatio), orderConfig.maxPortionsPerOrder),
  );
  const [row] = await exec
    .insert(dailyCapacity)
    .values({
      serviceDate: date,
      maxRegular: config.maxRegular,
      maxPo,
      kitchenMaxTotal: Math.max(config.kitchenMaxTotal, config.maxRegular + maxPo),
      holdCeiling,
      targetMin: options.targetMin ?? config.targetMin,
      cutOffAt: defaultCutoffAt(date, config.cutoffHour, config.cutoffMinute),
      isOpen: true,
    })
    .onConflictDoNothing()
    .returning();

  if (row) return row;
  const raced = await getDayRow(exec, date);
  if (!raced) throw new AppError('INTERNAL_ERROR', 'Gagal menyiapkan kapasitas hari layanan.');
  return raced;
}

export async function ensureDays(exec: Executor, dates: string[]): Promise<void> {
  for (const date of dates) {
    await ensureDay(exec, date);
  }
}

export async function getDayRow(exec: Executor, date: string): Promise<CapacityRow | null> {
  const [row] = await exec.select().from(dailyCapacity).where(eq(dailyCapacity.serviceDate, date)).limit(1);
  return row ?? null;
}

function isCutoffPassed(row: CapacityRow, now = new Date()): boolean {
  return row.cutOffAt.getTime() <= now.getTime();
}

export function toDaySummary(row: CapacityRow, now = new Date()): DaySummaryDto {
  return {
    date: row.serviceDate,
    maxRegular: row.maxRegular,
    maxPo: row.maxPo,
    reservedRegular: row.reservedRegular,
    reservedPo: row.reservedPo,
    heldRegular: row.heldRegular,
    heldPo: row.heldPo,
    orderedPortions: row.reservedRegular + row.reservedPo,
    targetMin: row.targetMin,
    kitchenMaxTotal: row.kitchenMaxTotal,
    holdCeiling: row.holdCeiling,
    isOpen: row.isOpen,
    cutoffAt: row.cutOffAt.toISOString(),
    cutoffPassed: isCutoffPassed(row, now),
  };
}

export async function getAvailability(
  exec: Executor,
  params: { from?: string; days?: number } = {},
): Promise<AvailabilityDto> {
  const today = todayWib();
  const from = params.from && params.from > today ? params.from : today;
  const days = params.days ?? 14;
  const dates = dateRange(from, days);
  await ensureDays(exec, dates);

  const rows = await exec
    .select()
    .from(dailyCapacity)
    .where(
      and(
        gte(dailyCapacity.serviceDate, dates[0]!),
        lte(dailyCapacity.serviceDate, dates[dates.length - 1]!),
      ),
    )
    .orderBy(dailyCapacity.serviceDate);
  const windows = await getWindowsByDates(exec, dates);
  const orderConfig = await getOrderConfig(exec);
  const settings = await getSettingsMap(exec);
  const deliveryFee = Number(settings['delivery.fee'] ?? 0);

  const now = new Date();
  const mapped: DayAvailabilityDto[] = rows.map((row) => ({
    date: row.serviceDate,
    isOpen: row.isOpen,
    cutoffAt: row.cutOffAt.toISOString(),
    cutoffPassed: isCutoffPassed(row, now),
    remainingRegular: Math.max(row.maxRegular - row.reservedRegular, 0),
    remainingPo: Math.max(row.maxPo - row.reservedPo, 0),
    orderedPortions: row.reservedRegular + row.reservedPo,
    targetMin: row.targetMin,
    maxRegular: row.maxRegular,
    maxPo: row.maxPo,
    windows: windows.get(row.serviceDate) ?? [],
  }));

  return {
    today,
    minPortions: orderConfig.minPortions,
    maxPortionsPerOrder: orderConfig.maxPortionsPerOrder,
    holdMinutes: orderConfig.holdMinutes,
    deliveryFee,
    days: mapped,
  };
}

export interface AdminDayInput {
  maxRegular: number;
  maxPo: number;
  kitchenMaxTotal: number;
  targetMin: number;
  cutOffAt: string;
  isOpen: boolean;
  holdCeiling?: number;
  windows: WindowInput[];
}

/**
 * Aturan konfigurasi PRD §3: max_regular + max_po tidak boleh melebihi
 * kitchen_max_total, dan kapasitas tidak boleh turun di bawah yang sudah
 * terpesan. Admin tidak bisa menyimpan nilai yang melanggar.
 */
export async function updateDay(
  exec: Executor,
  date: string,
  input: AdminDayInput,
  actor: { id?: string | null; label: string },
): Promise<DaySettingsDto> {
  const before = await ensureDay(exec, date);

  if (input.maxRegular + input.maxPo > input.kitchenMaxTotal) {
    throw new AppError(
      'CAPACITY_RULE_VIOLATION',
      `max_regular (${input.maxRegular}) + max_po (${input.maxPo}) melebihi kapasitas dapur (${input.kitchenMaxTotal}).`,
      { hint: 'Kurangi salah satu partisi atau naikkan kapasitas dapur.' },
    );
  }
  if (input.maxRegular < before.reservedRegular) {
    throw new AppError(
      'CAPACITY_RULE_VIOLATION',
      'Kapasitas reguler tidak boleh di bawah porsi yang sudah terpesan.',
      {
        hint: `${before.reservedRegular} porsi reguler sudah terpesan.`,
      },
    );
  }
  if (input.maxPo < before.reservedPo) {
    throw new AppError(
      'CAPACITY_RULE_VIOLATION',
      'Kapasitas PO tidak boleh di bawah porsi PO yang sudah terpesan.',
      {
        hint: `${before.reservedPo} porsi PO sudah terpesan.`,
      },
    );
  }

  const cutOffAt = new Date(input.cutOffAt);
  if (Number.isNaN(cutOffAt.getTime())) {
    throw new AppError('VALIDATION_ERROR', 'cutOffAt bukan tanggal ISO yang valid.');
  }

  // ADR 0001 O3: plafon hold minimal sebesar batas porsi per order, tetapi
  // tidak lebih dari max_regular (order sebesar batas tidak mungkin ditahan melebihi kapasitas).
  const orderConfig = await getOrderConfig(exec);
  const minHoldCeiling = Math.min(input.maxRegular, orderConfig.maxPortionsPerOrder);
  const holdCeiling =
    input.holdCeiling ?? Math.max(Math.floor(input.maxRegular * 0.5), minHoldCeiling);
  if (holdCeiling > input.maxRegular) {
    throw new AppError('VALIDATION_ERROR', 'Plafon hold tidak boleh melebihi kapasitas reguler.');
  }
  if (holdCeiling < minHoldCeiling) {
    throw new AppError(
      'CAPACITY_RULE_VIOLATION',
      'Plafon hold tidak boleh di bawah batas porsi per order.',
      {
        hint: `Batas porsi per order ${orderConfig.maxPortionsPerOrder}; plafon minimal ${minHoldCeiling}.`,
      },
    );
  }
  if (holdCeiling < before.heldRegular) {
    throw new AppError(
      'CAPACITY_RULE_VIOLATION',
      'Plafon hold tidak boleh di bawah porsi yang sedang ditahan.',
      {
        hint: `${before.heldRegular} porsi sedang berstatus hold.`,
      },
    );
  }

  const [updated] = await exec
    .update(dailyCapacity)
    .set({
      maxRegular: input.maxRegular,
      maxPo: input.maxPo,
      kitchenMaxTotal: input.kitchenMaxTotal,
      targetMin: input.targetMin,
      cutOffAt,
      isOpen: input.isOpen,
      holdCeiling,
      updatedAt: new Date(),
    })
    .where(eq(dailyCapacity.serviceDate, date))
    .returning();

  await replaceWindows(exec, date, input.windows);
  const windows = await getWindows(exec, date);

  await recordAudit(exec, {
    actor: { type: 'staff', id: actor.id ?? null, label: actor.label },
    entity: 'daily_capacity',
    entityId: date,
    action: 'day_updated',
    before: {
      maxRegular: before.maxRegular,
      maxPo: before.maxPo,
      kitchenMaxTotal: before.kitchenMaxTotal,
      targetMin: before.targetMin,
      cutOffAt: before.cutOffAt.toISOString(),
      isOpen: before.isOpen,
      holdCeiling: before.holdCeiling,
    },
    after: {
      maxRegular: input.maxRegular,
      maxPo: input.maxPo,
      kitchenMaxTotal: input.kitchenMaxTotal,
      targetMin: input.targetMin,
      cutOffAt: cutOffAt.toISOString(),
      isOpen: input.isOpen,
      holdCeiling,
      windows: windows.length,
    },
  });

  if (!updated) throw new AppError('INTERNAL_ERROR', 'Gagal menyimpan pengaturan hari.');

  return { ...toDaySummary(updated), windows };
}

/** Naikkan plafon hold hari-hari ke depan agar order sebesar `minimum` mungkin ditahan. */
export async function ensureMinimumHoldCeiling(exec: Executor, minimum: number): Promise<number> {
  const result = await exec.execute(sql`
    UPDATE daily_capacity
    SET hold_ceiling = LEAST(max_regular, GREATEST(hold_ceiling, ${minimum})),
        updated_at = now()
    WHERE service_date >= ${todayWib()}
      AND max_regular >= ${minimum}
      AND hold_ceiling < ${minimum}
  `);
  return result.rowCount ?? 0;
}

/**
 * Terapkan konfigurasi yang sama ke tujuh hari Senin–Minggu yang memuat
 * tanggal acuan. Cut-off ikut bergeser per tanggal; semua atau tidak sama
 * sekali (satu transaksi).
 */
export async function updateWeek(
  exec: Database,
  anchorDate: string,
  input: AdminDayInput,
  actor: { id?: string | null; label: string },
): Promise<DaySettingsDto[]> {
  const dates = weekDates(anchorDate);
  const baseCutoff = new Date(input.cutOffAt);
  if (Number.isNaN(baseCutoff.getTime())) {
    throw new AppError('VALIDATION_ERROR', 'cutOffAt bukan tanggal ISO yang valid.');
  }

  return exec.transaction(async (tx) => {
    const results: DaySettingsDto[] = [];
    for (const serviceDate of dates) {
      const offset = diffDays(anchorDate, serviceDate);
      const cutOffAt = new Date(baseCutoff.getTime() + offset * 86_400_000).toISOString();
      results.push(await updateDay(tx, serviceDate, { ...input, cutOffAt }, actor));
    }
    return results;
  });
}

export async function getDaySettings(exec: Executor, date: string): Promise<DaySettingsDto> {
  const row = await ensureDay(exec, date);
  const windows = await getWindows(exec, date);
  return { ...toDaySummary(row), windows };
}

/** Dipanggil worker saat cut-off: rekap produksi terkunci. */
export async function lockProductionIfDue(exec: Executor, now = new Date()): Promise<string[]> {
  const due = await exec.select().from(dailyCapacity).where(NOT_LOCKED_AND_DUE).limit(50);

  const locked: string[] = [];
  for (const row of due) {
    if (row.cutOffAt.getTime() > now.getTime()) continue;
    const result = await exec
      .update(dailyCapacity)
      .set({ productionLockedAt: row.cutOffAt, isOpen: false, updatedAt: now })
      .where(and(eq(dailyCapacity.serviceDate, row.serviceDate), NOT_LOCKED))
      .returning({ date: dailyCapacity.serviceDate });
    if (result.length > 0) {
      locked.push(row.serviceDate);
      await recordAudit(exec, {
        actor: { type: 'system', label: 'cutoff-job' },
        entity: 'daily_capacity',
        entityId: row.serviceDate,
        action: 'production_locked',
        after: { cutOffAt: row.cutOffAt.toISOString() },
      });
    }
  }
  return locked;
}

export async function setProductionLocked(exec: Executor, date: string, locked = true): Promise<void> {
  await exec
    .update(dailyCapacity)
    .set({ productionLockedAt: locked ? new Date() : null, updatedAt: new Date() })
    .where(eq(dailyCapacity.serviceDate, date));
}

export async function remainingRegular(exec: Executor, date: string): Promise<number> {
  const row = await ensureDay(exec, date);
  return Math.max(row.maxRegular - row.reservedRegular, 0);
}

export async function getRowsInRange(exec: Executor, from: string, to: string): Promise<CapacityRow[]> {
  return exec
    .select()
    .from(dailyCapacity)
    .where(and(gte(dailyCapacity.serviceDate, from), lte(dailyCapacity.serviceDate, to)))
    .orderBy(dailyCapacity.serviceDate);
}

export async function getRowsByDates(exec: Executor, dates: string[]): Promise<CapacityRow[]> {
  if (dates.length === 0) return [];
  return exec.select().from(dailyCapacity).where(inArray(dailyCapacity.serviceDate, dates));
}
