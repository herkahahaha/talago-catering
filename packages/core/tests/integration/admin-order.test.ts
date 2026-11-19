import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { configureDay, useTestOrderLimit } from '../helpers';
import { addDays, todayWib } from '../../src/lib/time';
import { setupTestDatabase, teardownTestDatabase, type TestContext } from '../../src/testing';
import { createAdminOrder, ensureDay, getDayRow } from '../../src/index';

let ctx: TestContext;

beforeAll(async () => {
  ctx = await setupTestDatabase();
  await useTestOrderLimit(ctx);
});

afterAll(async () => {
  await teardownTestDatabase(ctx);
});

describe('order manual/PO dari admin', () => {
  it('PO besar dengan QRIS memakai plafon partisi PO, bukan plafon hold reguler', async () => {
    const date = addDays(todayWib(), 32);
    await ensureDay(ctx.db, date);
    await configureDay(ctx, date, { maxRegular: 200, maxPo: 500, holdCeiling: 100 });

    const created = await createAdminOrder(
      ctx.db,
      {
        source: 'po',
        serviceDate: date,
        customerName: 'PT Pelanggan Tes',
        customerPhone: '081234560032',
        items: [{ menuItemId: ctx.menu.ayam.id, portions: 300 }],
        addressLine: 'Ambil di tempat',
        district: 'Pontianak Kota',
        paymentMethod: 'qris',
      },
      { id: ctx.adminId, label: 'Admin Test' },
    );

    expect(created.order.source).toBe('po');
    expect(created.order.portions).toBe(300);
    expect(created.order.status).toBe('pending_payment');

    const day = await getDayRow(ctx.db, date);
    expect(day?.reservedPo).toBe(300);
    expect(day?.heldPo).toBe(300);
    expect(day?.heldRegular).toBe(0);
  });
});
