import { sql } from 'drizzle-orm';
import { createDatabase, withTransaction } from '../src/db/client';
import { createGuestSession, findGuestSession } from '../src/modules/customers/index';
import { createGuestOrder } from '../src/modules/checkout/index';
import { defaultCutoffAt, ensureDay, getDayRow, getWindows, updateDay } from '../src/index';
import { getOrderRowById } from '../src/modules/orders/index';
import { scheduleMenuForDate } from '../src/modules/catalog/index';
import type { TestContext } from '../src/testing';

export async function configureDay(
  ctx: TestContext,
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
  const maxRegular = overrides.maxRegular ?? current.maxRegular;
  await updateDay(
    ctx.db,
    date,
    {
      maxRegular,
      maxPo: overrides.maxPo ?? current.maxPo,
      kitchenMaxTotal: Math.max(current.kitchenMaxTotal, maxRegular + (overrides.maxPo ?? current.maxPo)),
      targetMin: current.targetMin,
      cutOffAt: overrides.cutOffAt ?? defaultCutoffAt(date).toISOString(),
      isOpen: overrides.isOpen ?? true,
      holdCeiling: overrides.holdCeiling ?? Math.floor(maxRegular / 2),
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

export async function guestSession(ctx: TestContext, phone: string) {
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

export async function placeOrder(
  ctx: TestContext,
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

export async function expireHold(ctx: TestContext, orderId: string): Promise<void> {
  await ctx.db.execute(
    sql`UPDATE orders SET hold_expires_at = now() - interval '1 minute' WHERE id = ${orderId}`,
  );
}

export async function dayState(ctx: TestContext, date: string) {
  return getDayRow(ctx.db, date);
}

export async function orderState(ctx: TestContext, orderId: string) {
  return getOrderRowById(ctx.db, orderId);
}

export { withTransaction, createDatabase };
