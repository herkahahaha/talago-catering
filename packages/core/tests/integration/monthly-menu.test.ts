import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setupTestDatabase, teardownTestDatabase, type TestContext } from '../../src/testing';
import {
  archiveMenuItem,
  createMenuItem,
  ensureDay,
  getLatestPaymentForOrder,
  getMonthOverview,
  getOrderRowByToken,
  handlePaymentWebhook,
  listAdminMenuItems,
  listAdminOrders,
  listCustomerOrders,
  listMenuForDate,
  lookupCustomerOrders,
  monthRange,
  signOrderViewToken,
  signWebhookPayload,
  updateMenuItem,
  verifyOrderViewToken,
} from '../../src/index';
import { configureDay, guestSession, placeOrder, useTestOrderLimit } from '../helpers';

let ctx: TestContext;

beforeAll(async () => {
  ctx = await setupTestDatabase();
  await useTestOrderLimit(ctx);
});

afterAll(async () => {
  await teardownTestDatabase(ctx);
});

async function settle(gatewayRef: string, amount: number) {
  const rawBody = JSON.stringify({
    eventId: `evt-${crypto.randomUUID()}`,
    gatewayRef,
    status: 'settled',
    amount,
    paidAt: new Date().toISOString(),
  });
  return handlePaymentWebhook(ctx.db, { rawBody, signature: signWebhookPayload(rawBody) });
}

describe('CRUD menu', () => {
  it('membuat menu, menjadwalkan otomatis, memperbarui, dan menonaktifkan', async () => {
    const created = await createMenuItem(
      ctx.db,
      {
        name: 'Menu Baru Tes',
        description: 'Hidangan untuk pengujian CRUD',
        category: 'main',
        price: 21_000,
        unitLabel: 'porsi',
        isActive: true,
      },
      { label: 'Admin Tes' },
    );

    expect(created.isActive).toBe(true);
    expect(created.scheduleCount).toBeGreaterThanOrEqual(14);

    const storefrontMenu = await listMenuForDate(ctx.db, ctx.date);
    expect(storefrontMenu.some((item) => item.id === created.id)).toBe(true);

    const updated = await updateMenuItem(
      ctx.db,
      created.id,
      { name: 'Menu Baru Tes Edit', price: 23_000 },
      { label: 'Admin Tes' },
    );
    expect(updated.name).toBe('Menu Baru Tes Edit');
    expect(updated.price).toBe(23_000);

    const refreshed = await listMenuForDate(ctx.db, ctx.date);
    const item = refreshed.find((entry) => entry.id === created.id);
    expect(item?.price).toBe(23_000);
    expect(item?.name).toBe('Menu Baru Tes Edit');

    const archived = await archiveMenuItem(ctx.db, created.id, { label: 'Admin Tes' });
    expect(archived.isActive).toBe(false);

    const afterArchive = await listMenuForDate(ctx.db, ctx.date);
    expect(afterArchive.some((entry) => entry.id === created.id)).toBe(false);

    const adminList = await listAdminMenuItems(ctx.db);
    expect(adminList.find((entry) => entry.id === created.id)?.isActive).toBe(false);
  });

  it('menu nonaktif tidak dijadwalkan dan tidak tampil di storefront', async () => {
    const hidden = await createMenuItem(
      ctx.db,
      {
        name: 'Menu Disembunyikan',
        description: '',
        category: 'side',
        price: 9_000,
        unitLabel: 'porsi',
        isActive: false,
      },
      { label: 'Admin Tes' },
    );
    expect(hidden.scheduleCount).toBe(0);

    const storefrontMenu = await listMenuForDate(ctx.db, ctx.dayAfter);
    expect(storefrontMenu.some((entry) => entry.id === hidden.id)).toBe(false);
  });
});

describe('ringkasan bulanan', () => {
  it('menghitung total pesanan & pendapatan satu bulan penuh', async () => {
    await ensureDay(ctx.db, ctx.date);
    await ensureDay(ctx.db, ctx.dayAfter);
    await configureDay(ctx, ctx.date, { maxRegular: 200 });
    await configureDay(ctx, ctx.dayAfter, { maxRegular: 200 });

    const sessionA = await guestSession(ctx, '081311110001');
    const sessionB = await guestSession(ctx, '081311110002');
    const paidOrder = await placeOrder(ctx, ctx.date, sessionA);
    const pendingOrder = await placeOrder(ctx, ctx.dayAfter, sessionB);

    const payment = await getLatestPaymentForOrder(ctx.db, paidOrder.order.id);
    const result = await settle(payment!.gatewayRef, payment!.amount);
    expect(result.outcome).toBe('processed');

    const month = ctx.date.slice(0, 7);
    const overview = await getMonthOverview(ctx.db, month);

    expect(overview.totalOrders).toBe(2);
    expect(overview.paidOrders).toBe(1);
    expect(overview.pendingOrders).toBe(1);
    expect(overview.totalPortions).toBe(100);
    expect(overview.totalRevenue).toBe(paidOrder.order.total);
    expect(overview.grossOrderValue).toBe(paidOrder.order.total + pendingOrder.order.total);
    expect(overview.daily).toHaveLength(2);
    expect(overview.statusCounts.paid).toBe(1);
    expect(overview.statusCounts.pending_payment).toBe(1);

    const range = monthRange(month);
    const list = await listAdminOrders(ctx.db, {
      from: range.from,
      to: range.to,
      page: 1,
      pageSize: 25,
    });
    expect(list.total).toBe(2);
    expect(list.capacity).toBeNull();
  });

  it('rentang bulan menangani akhir bulan dengan benar', () => {
    expect(monthRange('2026-02')).toEqual({
      month: '2026-02',
      from: '2026-02-01',
      to: '2026-02-28',
    });
    expect(monthRange('2028-02').to).toBe('2028-02-29');
    expect(monthRange('2026-11')).toEqual({
      month: '2026-11',
      from: '2026-11-01',
      to: '2026-11-30',
    });
  });
});

describe('lacak pesanan pelanggan', () => {
  it('token tampilan bertanda tangan dapat membuka order dan kedaluwarsa', async () => {
    const session = await guestSession(ctx, '081311110003');
    const created = await placeOrder(ctx, ctx.date, session);

    const token = signOrderViewToken(created.order.id);
    expect(verifyOrderViewToken(token)).toBe(created.order.id);

    const row = await getOrderRowByToken(ctx.db, token);
    expect(row?.id).toBe(created.order.id);

    const expired = signOrderViewToken(created.order.id, -1);
    expect(verifyOrderViewToken(expired)).toBeNull();
    expect(await getOrderRowByToken(ctx.db, expired)).toBeNull();
  });

  it('mencari pesanan harus cocok nomor order + nomor HP', async () => {
    const session = await guestSession(ctx, '081311110004');
    const created = await placeOrder(ctx, ctx.dayAfter, session);

    const mine = await listCustomerOrders(ctx.db, session.customer.id);
    expect(mine.some((order) => order.orderNo === created.order.orderNo)).toBe(true);
    expect(mine[0]?.viewToken).toBeTruthy();

    const matches = await lookupCustomerOrders(ctx.db, {
      orderNo: created.order.orderNo,
      phone: session.customer.phone,
    });
    expect(matches).toHaveLength(1);
    expect(matches[0]?.orderNo).toBe(created.order.orderNo);

    const wrongPhone = await lookupCustomerOrders(ctx.db, {
      orderNo: created.order.orderNo,
      phone: '081399999999',
    });
    expect(wrongPhone).toHaveLength(0);
  });
});
