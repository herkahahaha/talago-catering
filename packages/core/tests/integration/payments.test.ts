import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createAdminOrder, listPaymentsForOrder, recordPartialPayment } from '../../src/index';
import { setupTestDatabase, teardownTestDatabase, type TestContext } from '../../src/testing';
import { configureDay } from '../helpers';

let ctx: TestContext;

beforeAll(async () => {
  ctx = await setupTestDatabase();
  await configureDay(ctx, ctx.date, { maxRegular: 200, maxPo: 500, holdCeiling: 200 });
});

afterAll(async () => {
  await teardownTestDatabase(ctx);
});

async function newPoOrder() {
  return createAdminOrder(
    ctx.db,
    {
      source: 'po',
      serviceDate: ctx.date,
      customerName: 'Kantor Tes',
      customerPhone: '081234567890',
      items: [{ menuItemId: ctx.menu.ayam.id, portions: 50 }],
      addressLine: 'Ambil di tempat',
      district: 'Pontianak Kota',
      paymentMethod: 'cash',
    },
    { id: ctx.adminId, label: 'Admin Tes' },
  );
}

const partialRows = (rows: Awaited<ReturnType<typeof listPaymentsForOrder>>) =>
  rows.filter((row) => (row.payload as { kind?: unknown } | null)?.kind === 'partial');

describe('recordPartialPayment', () => {
  it('mencatat pembayaran parsial beserta buktinya', async () => {
    const order = await newPoOrder();
    const paidAt = new Date('2026-11-20T10:00:00+07:00');

    const row = await recordPartialPayment(ctx.db, {
      orderId: order.order.id,
      amount: 500_000,
      proof: 'bukti-transfer-1',
      paidAt,
    });

    expect(row.orderId).toBe(order.order.id);
    expect(row.amount).toBe(500_000);
    expect(row.status).toBe('paid');
    expect(row.paidAt?.toISOString()).toBe(paidAt.toISOString());
    expect(row.payload).toMatchObject({ kind: 'partial', proof: 'bukti-transfer-1' });
  });

  it('mengizinkan dua pembayaran parsial lalu menolak yang ketiga', async () => {
    const order = await newPoOrder();

    await recordPartialPayment(ctx.db, {
      orderId: order.order.id,
      amount: 400_000,
      proof: 'bukti-1',
    });
    await recordPartialPayment(ctx.db, {
      orderId: order.order.id,
      amount: 400_000,
      proof: 'bukti-2',
    });

    // Tagihan penuh dari createAdminOrder tidak dihitung sebagai pembayaran parsial.
    expect(partialRows(await listPaymentsForOrder(ctx.db, order.order.id))).toHaveLength(2);

    await expect(
      recordPartialPayment(ctx.db, {
        orderId: order.order.id,
        amount: 400_000,
        proof: 'bukti-3',
      }),
    ).rejects.toMatchObject({ code: 'INVALID_STATE' });
  });

  it('tidak meloloskan pembayaran ke-3 walau dicatat bersamaan', async () => {
    const order = await newPoOrder();

    const results = await Promise.allSettled(
      [1, 2, 3].map((n) =>
        recordPartialPayment(ctx.db, {
          orderId: order.order.id,
          amount: 100_000,
          proof: `bukti-paralel-${n}`,
        }),
      ),
    );

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(2);
    expect(partialRows(await listPaymentsForOrder(ctx.db, order.order.id))).toHaveLength(2);
  });

  it('menolak nominal selain bilangan bulat positif', async () => {
    const order = await newPoOrder();

    for (const amount of [0, -1, 1.5]) {
      await expect(
        recordPartialPayment(ctx.db, { orderId: order.order.id, amount, proof: 'bukti' }),
      ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    }
  });

  it('menolak pembayaran parsial tanpa bukti', async () => {
    const order = await newPoOrder();

    await expect(
      recordPartialPayment(ctx.db, { orderId: order.order.id, amount: 500_000, proof: '   ' }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });
});
