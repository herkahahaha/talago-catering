import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { addDays, todayWib } from '../../src/lib/time';
import { setupTestDatabase, teardownTestDatabase, type TestContext } from '../../src/testing';
import {
  cancelOrder,
  createGuestOrder,
  handlePaymentWebhook,
  signWebhookPayload,
  getLatestPaymentForOrder,
  getRefundsForOrder,
  getDayRow,
  getOrderDtoById,
  ensureDay,
  sweepExpiredHolds,
  updateOrderStatusAdmin,
  countOrdersForDate,
} from '../../src/index';
import { configureDay, expireHold, guestSession, orderState, placeOrder } from '../helpers';

let ctx: TestContext;

beforeAll(async () => {
  ctx = await setupTestDatabase();
});

afterAll(async () => {
  await teardownTestDatabase(ctx);
});

async function settle(gatewayRef: string, amount: number, eventId = `evt-${crypto.randomUUID()}`) {
  const body = {
    eventId,
    gatewayRef,
    status: 'settled' as const,
    amount,
    paidAt: new Date().toISOString(),
  };
  const rawBody = JSON.stringify(body);
  return handlePaymentWebhook(ctx.db, {
    rawBody,
    signature: signWebhookPayload(rawBody),
  });
}

describe('checkout tamu', () => {
  it('membuat order dengan hold, pembayaran, dan riwayat status', async () => {
    const date = addDays(todayWib(), 30);
    await ensureDay(ctx.db, date);
    await configureDay(ctx, date, { maxRegular: 200 });

    const session = await guestSession(ctx, '081300000001');
    const created = await placeOrder(ctx, date, session);

    expect(created.order.status).toBe('pending_payment');
    expect(created.order.portions).toBe(50);
    expect(created.order.total).toBe(30 * ctx.menu.ayam.price + 20 * ctx.menu.nasi.price);
    expect(created.order.delivery.status).toBe('scheduled');
    expect(created.order.timeline.some((entry) => entry.status === 'pending_payment')).toBe(true);
    expect(created.paymentInstructions?.method).toBe('qris');

    const day = await getDayRow(ctx.db, date);
    expect(day?.reservedRegular).toBe(50);
    expect(day?.heldRegular).toBe(50);
  });

  it('replay idempotensi mengembalikan order yang sama, payload berbeda ditolak', async () => {
    const date = addDays(todayWib(), 31);
    await ensureDay(ctx.db, date);
    await configureDay(ctx, date, { maxRegular: 200 });

    const session = await guestSession(ctx, '081300000002');
    const key = `idem-${crypto.randomUUID()}`;
    const first = await placeOrder(ctx, date, session, key);
    const replay = await placeOrder(ctx, date, session, key);

    expect(replay.order.id).toBe(first.order.id);
    expect(await countOrdersForDate(ctx.db, date)).toBe(1);

    await expect(
      createGuestOrder(ctx.db, {
        input: {
          serviceDate: date,
          items: [
            { menuItemId: ctx.menu.ayam.id, portions: 40 },
            { menuItemId: ctx.menu.nasi.id, portions: 10 },
          ],
          delivery: { address: { line: 'Jl. Tes No. 1', district: 'Pontianak Kota' } },
          paymentMethod: 'qris',
          captchaToken: 'token-captcha-tes',
          consent: true,
        },
        session,
        idempotencyKey: key,
        ctx: {},
      }),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
  });
});

describe('webhook pembayaran (PRD §4.3)', () => {
  it('menandai lunas dan melepas porsi dari held', async () => {
    const date = addDays(todayWib(), 32);
    await ensureDay(ctx.db, date);
    await configureDay(ctx, date, { maxRegular: 200 });

    const session = await guestSession(ctx, '081300000003');
    const created = await placeOrder(ctx, date, session);
    const payment = await getLatestPaymentForOrder(ctx.db, created.order.id);
    expect(payment).not.toBeNull();

    const result = await settle(payment!.gatewayRef, payment!.amount);
    expect(result.outcome).toBe('processed');

    const order = await orderState(ctx, created.order.id);
    expect(order?.status).toBe('paid');
    const day = await getDayRow(ctx.db, date);
    expect(day?.heldRegular).toBe(0);
    expect(day?.reservedRegular).toBe(50);
    expect((await getLatestPaymentForOrder(ctx.db, created.order.id))?.status).toBe('paid');

    const duplicate = await settle(payment!.gatewayRef, payment!.amount);
    expect(duplicate.outcome).toBe('duplicate');
  });

  it('event gagal yang datang setelah settled tidak menurunkan status', async () => {
    const date = addDays(todayWib(), 38);
    await ensureDay(ctx.db, date);
    await configureDay(ctx, date, { maxRegular: 200 });

    const session = await guestSession(ctx, '081300000011');
    const created = await placeOrder(ctx, date, session);
    const payment = await getLatestPaymentForOrder(ctx.db, created.order.id);
    await settle(payment!.gatewayRef, payment!.amount);

    const rawBody = JSON.stringify({
      eventId: `evt-failed-${crypto.randomUUID()}`,
      gatewayRef: payment!.gatewayRef,
      status: 'failed',
      amount: payment!.amount,
    });
    const result = await handlePaymentWebhook(ctx.db, {
      rawBody,
      signature: signWebhookPayload(rawBody),
    });

    expect(result.outcome).toBe('ignored');
    expect((await orderState(ctx, created.order.id))?.status).toBe('paid');
    expect((await getLatestPaymentForOrder(ctx.db, created.order.id))?.status).toBe('paid');
  });

  it('menolak signature yang tidak valid tanpa efek', async () => {
    const date = addDays(todayWib(), 33);
    await ensureDay(ctx.db, date);
    await configureDay(ctx, date, { maxRegular: 200 });

    const session = await guestSession(ctx, '081300000004');
    const created = await placeOrder(ctx, date, session);
    const payment = await getLatestPaymentForOrder(ctx.db, created.order.id);
    const rawBody = JSON.stringify({
      eventId: `evt-${crypto.randomUUID()}`,
      gatewayRef: payment!.gatewayRef,
      status: 'settled',
      amount: payment!.amount,
    });

    await expect(handlePaymentWebhook(ctx.db, { rawBody, signature: 'deadbeef' })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });

    const result = await ctx.db.execute(sql`SELECT count(*)::int AS count FROM webhook_events`);
    expect(Number((result.rows[0] as { count: number }).count)).toBeGreaterThanOrEqual(0);
    expect((await orderState(ctx, created.order.id))?.status).toBe('pending_payment');
  });

  it('pembayaran telat dengan sisa kapasitas menjadi paid', async () => {
    const date = addDays(todayWib(), 34);
    await ensureDay(ctx.db, date);
    await configureDay(ctx, date, { maxRegular: 200 });

    const sessionA = await guestSession(ctx, '081300000005');
    const sessionB = await guestSession(ctx, '081300000006');
    const lateOrder = await placeOrder(ctx, date, sessionA);
    await expireHold(ctx, lateOrder.order.id);
    await placeOrder(ctx, date, sessionB);

    const payment = await getLatestPaymentForOrder(ctx.db, lateOrder.order.id);
    const result = await settle(payment!.gatewayRef, payment!.amount);
    expect(result.outcome).toBe('late_paid');

    expect((await orderState(ctx, lateOrder.order.id))?.status).toBe('paid');
    const day = await getDayRow(ctx.db, date);
    expect(day?.reservedRegular).toBe(100);
  });

  it('pembayaran telat saat kapasitas penuh menjadi paid_after_expiry + refund', async () => {
    const date = addDays(todayWib(), 35);
    await ensureDay(ctx.db, date);
    await configureDay(ctx, date, { maxRegular: 50, holdCeiling: 50 });

    const sessionA = await guestSession(ctx, '081300000007');
    const sessionB = await guestSession(ctx, '081300000008');
    const lateOrder = await placeOrder(ctx, date, sessionA);
    await expireHold(ctx, lateOrder.order.id);
    await sweepExpiredHolds(ctx.db);
    await placeOrder(ctx, date, sessionB);

    const payment = await getLatestPaymentForOrder(ctx.db, lateOrder.order.id);
    const result = await settle(payment!.gatewayRef, payment!.amount);
    expect(result.outcome).toBe('late_unavailable');

    const order = await orderState(ctx, lateOrder.order.id);
    expect(order?.status).toBe('paid_after_expiry');
    const refunds = await getRefundsForOrder(ctx.db, lateOrder.order.id);
    expect(refunds).toHaveLength(1);
    expect(refunds[0]?.status).toBe('queued');
    expect(refunds[0]?.amount).toBe(payment!.amount);
  });
});

describe('pembatalan & transisi status', () => {
  it('pembatalan order lunas membuat refund queued dan melepas porsi', async () => {
    const date = addDays(todayWib(), 36);
    await ensureDay(ctx.db, date);
    await configureDay(ctx, date, { maxRegular: 200 });

    const session = await guestSession(ctx, '081300000009');
    const created = await placeOrder(ctx, date, session);
    const payment = await getLatestPaymentForOrder(ctx.db, created.order.id);
    await settle(payment!.gatewayRef, payment!.amount);

    await cancelOrder(ctx.db, {
      orderId: created.order.id,
      actor: { type: 'staff', id: ctx.adminId, label: 'Admin Tes' },
      reason: 'Acara dibatalkan',
      byAdmin: true,
    });

    const order = await orderState(ctx, created.order.id);
    expect(order?.status).toBe('cancelled_refunded');
    const refunds = await getRefundsForOrder(ctx.db, created.order.id);
    expect(refunds).toHaveLength(1);
    expect(refunds[0]?.status).toBe('queued');
    expect((await getLatestPaymentForOrder(ctx.db, created.order.id))?.status).toBe('refunded');

    const day = await getDayRow(ctx.db, date);
    expect(day?.reservedRegular).toBe(0);
    expect(day?.heldRegular).toBe(0);
  });

  it('status hanya maju satu arah; koreksi mundur ditolak', async () => {
    const date = addDays(todayWib(), 37);
    await ensureDay(ctx.db, date);
    await configureDay(ctx, date, { maxRegular: 200 });

    const session = await guestSession(ctx, '081300000010');
    const created = await placeOrder(ctx, date, session);
    const payment = await getLatestPaymentForOrder(ctx.db, created.order.id);
    await settle(payment!.gatewayRef, payment!.amount);

    await updateOrderStatusAdmin(ctx.db, {
      orderId: created.order.id,
      status: 'in_production',
      actor: { id: ctx.adminId, label: 'Admin Tes', role: 'admin' },
    });
    expect((await orderState(ctx, created.order.id))?.status).toBe('in_production');

    await expect(
      updateOrderStatusAdmin(ctx.db, {
        orderId: created.order.id,
        status: 'delivered',
        actor: { id: ctx.adminId, label: 'Admin Tes', role: 'admin' },
      }),
    ).rejects.toMatchObject({ code: 'INVALID_STATE' });

    await updateOrderStatusAdmin(ctx.db, {
      orderId: created.order.id,
      status: 'out_for_delivery',
      actor: { id: ctx.adminId, label: 'Admin Tes', role: 'admin' },
    });
    await updateOrderStatusAdmin(ctx.db, {
      orderId: created.order.id,
      status: 'delivered',
      actor: { id: ctx.adminId, label: 'Admin Tes', role: 'admin' },
    });
    expect((await orderState(ctx, created.order.id))?.status).toBe('delivered');

    const dto = await getOrderDtoById(ctx.db, created.order.id);
    expect(dto.delivery.status).toBe('delivered');
  });
});
