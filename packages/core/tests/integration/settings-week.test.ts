import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addDays, defaultCutoffAt, diffDays, todayWib, weekDates } from '../../src/lib/time';
import { setupTestDatabase, teardownTestDatabase, type TestContext } from '../../src/testing';
import {
  AppError,
  ensureDay,
  ensureMinimumHoldCeiling,
  getDayRow,
  getOrderConfig,
  getSettingsMap,
  updateOrderSettings,
  updateWeek,
  getWindows,
} from '../../src/index';

let ctx: TestContext;

beforeAll(async () => {
  ctx = await setupTestDatabase();
});

afterAll(async () => {
  await teardownTestDatabase(ctx);
});

describe('aturan checkout global', () => {
  it('default baru mengizinkan 200 porsi dan dapat diubah admin', async () => {
    const before = await getOrderConfig(ctx.db);
    expect(before.maxPortionsPerOrder).toBe(200);

    const updated = await updateOrderSettings(
      ctx.db,
      { minPortions: 50, maxPortionsPerOrder: 120, holdMinutes: 15 },
      { label: 'Admin Tes' },
    );
    expect(updated.maxPortionsPerOrder).toBe(120);
    expect(updated.holdMinutes).toBe(15);

    const settings = await getSettingsMap(ctx.db);
    expect(settings['order.max_portions_per_order']).toBe(120);
  });

  it('menolak konfigurasi minimal di atas maksimal', async () => {
    await expect(
      updateOrderSettings(
        ctx.db,
        { minPortions: 150, maxPortionsPerOrder: 100, holdMinutes: 10 },
        { label: 'Admin Tes' },
      ),
    ).rejects.toBeInstanceOf(AppError);
  });

  it('menaikkan plafon hold hari ke depan agar order sebesar batas maksimal bisa ditahan', async () => {
    const date = addDays(todayWib(), 30);
    await ensureDay(ctx.db, date);
    // Turunkan plafon hold secara langsung untuk mensimulasikan konfigurasi lama.
    await ctx.db.execute(`UPDATE daily_capacity SET hold_ceiling = 100 WHERE service_date = '${date}'`);

    const adjusted = await ensureMinimumHoldCeiling(ctx.db, 150);
    expect(adjusted).toBeGreaterThanOrEqual(1);
    expect((await getDayRow(ctx.db, date))?.holdCeiling).toBe(150);
  });
});

describe('pengaturan mingguan', () => {
  it('menerapkan kapasitas & cut-off ke Senin–Minggu dalam satu transaksi', async () => {
    const anchor = addDays(todayWib(), 60);
    const dates = weekDates(anchor);
    const startCutoff = defaultCutoffAt(anchor).toISOString();

    const days = await updateWeek(
      ctx.db,
      anchor,
      {
        maxRegular: 222,
        maxPo: 0,
        kitchenMaxTotal: 1000,
        targetMin: 70,
        holdCeiling: 150,
        cutOffAt: startCutoff,
        isOpen: true,
        windows: [{ label: 'Siang', startTime: '11:00', endTime: '13:00', maxStops: 8 }],
      },
      { label: 'Admin Tes' },
    );

    expect(days).toHaveLength(7);
    expect(days.map((day) => day.date)).toEqual(dates);

    const anchorRow = await getDayRow(ctx.db, anchor);
    expect(anchorRow?.targetMin).toBe(70);
    expect(anchorRow?.maxRegular).toBe(222);
    expect(anchorRow?.cutOffAt.toISOString()).toBe(startCutoff);

    const lastDay = dates[6]!;
    const lastRow = await getDayRow(ctx.db, lastDay);
    expect(lastRow?.cutOffAt.toISOString()).toBe(
      new Date(new Date(startCutoff).getTime() + diffDays(anchor, lastDay) * 86_400_000).toISOString(),
    );
    expect(await getWindows(ctx.db, lastDay)).toHaveLength(1);
  });

  it('membatalkan seluruh minggu bila salah satu hari melanggar aturan kapasitas', async () => {
    const anchor = addDays(todayWib(), 90);
    const attempt = updateWeek(
      ctx.db,
      anchor,
      {
        maxRegular: 500,
        maxPo: 500,
        kitchenMaxTotal: 500,
        targetMin: 50,
        holdCeiling: 200,
        cutOffAt: defaultCutoffAt(anchor).toISOString(),
        isOpen: true,
        windows: [],
      },
      { label: 'Admin Tes' },
    );

    await expect(attempt).rejects.toMatchObject({ code: 'CAPACITY_RULE_VIOLATION' });
    expect(await getDayRow(ctx.db, anchor)).toBeNull();
  });
});
