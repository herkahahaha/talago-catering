import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { useTestOrderLimit } from '../helpers';
import { sql } from 'drizzle-orm';
import { addDays, defaultCutoffAt, todayWib } from '../../src/lib/time';
import { scheduleMenuForDate } from '../../src/modules/catalog/index';
import { AppError } from '../../src/lib/ids';
import { setupTestDatabase, teardownTestDatabase, type TestContext } from '../../src/testing';
import {
  ensureDay,
  expireStaleHolds,
  getDayRow,
  getWindows,
  replaceWindows,
  reservePortions,
  updateDay,
  withTransaction,
} from '../../src/index';
import { createGuestSession, findGuestSession } from '../../src/modules/customers/index';
import { createGuestOrder } from '../../src/modules/checkout/index';
import { getOrderRowById } from '../../src/modules/orders/index';

let ctx: TestContext;

beforeAll(async () => {
  ctx = await setupTestDatabase();
  await useTestOrderLimit(ctx);
});

afterAll(async () => {
  await teardownTestDatabase(ctx);
});

async function configureDay(
  date: string,
  overrides: {
    maxRegular?: number;
    maxPo?: number;
    holdCeiling?: number;
    cutOffAt?: string;
    isOpen?: boolean;
  } = {},
): Promise<void> {
  const current = await ensureDay(ctx.db, date);
  await scheduleMenuForDate(ctx.db, date, [ctx.menu.ayam.id, ctx.menu.nasi.id]);
  const windows = await getWindows(ctx.db, date);
  await updateDay(
    ctx.db,
    date,
    {
      maxRegular: overrides.maxRegular ?? current.maxRegular,
      maxPo: overrides.maxPo ?? current.maxPo,
      kitchenMaxTotal: Math.max(
        current.kitchenMaxTotal,
        (overrides.maxRegular ?? current.maxRegular) + (overrides.maxPo ?? current.maxPo),
      ),
      targetMin: current.targetMin,
      cutOffAt: overrides.cutOffAt ?? defaultCutoffAt(date).toISOString(),
      isOpen: overrides.isOpen ?? true,
      holdCeiling: overrides.holdCeiling ?? Math.floor((overrides.maxRegular ?? current.maxRegular) / 2),
      windows: windows.map((window) => ({
        ...(window.id ? { id: window.id } : {}),
        label: window.label,
        startTime: window.startTime,
        endTime: window.endTime,
        maxStops: window.maxStops,
      })),
    },
    { label: 'Tes' },
  );
}

async function guestSession(phone: string) {
  const { token } = await createGuestSession(ctx.db, {
    name: 'Pelanggan Tes',
    phone,
    consent: true,
    location: { address: 'Jl. Tes No. 1', district: 'Pontianak Kota' },
  });
  const session = await findGuestSession(ctx.db, token);
  if (!session) throw new Error('Sesi tes gagal dibuat');
  return session;
}

async function placeOrder(
  date: string,
  session: Awaited<ReturnType<typeof guestSession>>,
  key = `idem-${crypto.randomUUID()}`,
) {
  return createGuestOrder(ctx.db, {
    input: {
      serviceDate: date,
      items: [
        { menuItemId: ctx.menu.ayam.id, portions: 30 },
        { menuItemId: ctx.menu.nasi.id, portions: 20 },
      ],
      delivery: { address: { line: 'Jl. Tes No. 1', district: 'Pontianak Kota' } },
      paymentMethod: 'qris',
      captchaToken: 'token-captcha-tes',
      consent: true,
    },
    session,
    idempotencyKey: key,
    ctx: {},
  });
}

async function runConcurrent(attempts: number, worker: () => Promise<unknown>, batchSize = 100) {
  const results: Array<{ ok: boolean }> = [];
  for (let index = 0; index < attempts; index += batchSize) {
    const size = Math.min(batchSize, attempts - index);
    const chunk = await Promise.all(Array.from({ length: size }, worker));
    results.push(...(chunk as Array<{ ok: boolean }>));
  }
  return results;
}

describe('kapasitas atomik', () => {
  it('5.000 percobaan konkuren tidak pernah melewati max_regular', async () => {
    const date = addDays(todayWib(), 20);
    await ensureDay(ctx.db, date);
    await configureDay(date, { maxRegular: 200, holdCeiling: 100 });

    const attempts = 5_000;
    const portions = 50;

    const results = await runConcurrent(attempts, () =>
      withTransaction(ctx.db, async (tx) => {
        await expireStaleHolds(tx, date);
        const outcome = await reservePortions(tx, {
          date,
          portions,
          partition: 'regular',
          hold: false,
        });
        return { ok: outcome.ok };
      }),
    );

    const successes = results.filter((result) => result.ok).length;
    const day = await getDayRow(ctx.db, date);

    expect(successes).toBe(4);
    expect(day?.reservedRegular).toBe(200);
    expect(day!.reservedRegular).toBeLessThanOrEqual(day!.maxRegular);
  });

  it('plafon hold membatasi porsi yang ditahan bersamaan', async () => {
    const date = addDays(todayWib(), 21);
    await ensureDay(ctx.db, date);
    await configureDay(date, { maxRegular: 200, holdCeiling: 100 });

    const results = await runConcurrent(120, () =>
      withTransaction(ctx.db, async (tx) => {
        const outcome = await reservePortions(tx, {
          date,
          portions: 50,
          partition: 'regular',
          hold: true,
        });
        return { ok: outcome.ok };
      }),
    );

    const successes = results.filter((result) => result.ok).length;
    const day = await getDayRow(ctx.db, date);
    expect(successes).toBe(2);
    expect(day?.heldRegular).toBe(100);
    expect(day!.heldRegular).toBeLessThanOrEqual(day!.holdCeiling);
  });

  it('hold kedaluwarsa dilepas malas saat reservasi baru, tanpa menunggu job', async () => {
    const date = addDays(todayWib(), 22);
    await ensureDay(ctx.db, date);
    await configureDay(date, { maxRegular: 100, holdCeiling: 50 });

    const session = await guestSession('081211110001');
    const created = await placeOrder(date, session);

    // Paksa hold kedaluwarsa tanpa job pembersih.
    await ctx.db.execute(
      sql`UPDATE orders SET hold_expires_at = now() - interval '1 minute' WHERE id = ${created.order.id}`,
    );

    const outcome = await withTransaction(ctx.db, async (tx) => {
      await expireStaleHolds(tx, date);
      return reservePortions(tx, { date, portions: 50, partition: 'regular', hold: false });
    });

    expect(outcome.ok).toBe(true);
    const expiredOrder = await getOrderRowById(ctx.db, created.order.id);
    expect(expiredOrder?.status).toBe('expired');
    const day = await getDayRow(ctx.db, date);
    expect(day?.reservedRegular).toBe(50);
    expect(day?.heldRegular).toBe(0);
  });

  it('menolak order setelah cut-off', async () => {
    const date = addDays(todayWib(), 23);
    await ensureDay(ctx.db, date);
    await configureDay(date, { cutOffAt: new Date(Date.now() - 60_000).toISOString() });

    const session = await guestSession('081211110002');
    await expect(placeOrder(date, session)).rejects.toMatchObject({ code: 'CUTOFF_PASSED' });
  });

  it('menolak konfigurasi yang melanggar kapasitas dapur', async () => {
    const date = addDays(todayWib(), 24);
    await ensureDay(ctx.db, date);

    const attempt = updateDay(
      ctx.db,
      date,
      {
        maxRegular: 300,
        maxPo: 300,
        kitchenMaxTotal: 500,
        targetMin: 50,
        cutOffAt: defaultCutoffAt(date).toISOString(),
        isOpen: true,
        windows: [],
      },
      { label: 'Tes' },
    );

    await expect(attempt).rejects.toBeInstanceOf(AppError);
    await expect(attempt).rejects.toMatchObject({ code: 'CAPACITY_RULE_VIOLATION' });
  });

  it('jendela antar menolak stop melebihi max_stops', async () => {
    const date = addDays(todayWib(), 25);
    await ensureDay(ctx.db, date);
    await replaceWindows(ctx.db, date, [
      { label: 'Siang', startTime: '11:00', endTime: '13:00', maxStops: 1 },
    ]);
    const [window] = await getWindows(ctx.db, date);
    expect(window).toBeDefined();

    const first = await withTransaction(ctx.db, async (tx) => {
      const { reserveStop } = await import('../../src/modules/delivery/index');
      return reserveStop(tx, window!.id!);
    });
    const second = await withTransaction(ctx.db, async (tx) => {
      const { reserveStop } = await import('../../src/modules/delivery/index');
      return reserveStop(tx, window!.id!);
    });

    expect(first).toBe(true);
    expect(second).toBe(false);
  });
});
