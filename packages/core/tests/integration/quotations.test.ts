import { afterAll, afterEach, beforeEach, beforeAll, describe, expect, it } from 'vitest';
import {
  AppError,
  convertQuotationToPO,
  createAdminOrder,
  createQuotationRequest,
  getQuotationById,
  linkPurchaseOrderToOrder,
  listAudit,
  listQueuedNotifications,
  listQuotations,
  setSetting,
  sql,
  updateQuotationStatus,
} from '../../src/index';
import { setupTestDatabase, teardownTestDatabase, type TestContext } from '../../src/testing';
import { configureDay } from '../helpers';

let ctx: TestContext;

beforeAll(async () => {
  ctx = await setupTestDatabase();
  // Jalur PO butuh partisi PO dibuka (default ensureDay: maxPo = 0).
  await configureDay(ctx, ctx.date, { maxRegular: 200, maxPo: 500, holdCeiling: 200 });
});

afterAll(async () => {
  await teardownTestDatabase(ctx);
});

async function newQuotation(ctx: TestContext) {
  return createQuotationRequest(ctx.db, {
    name: 'Kantor Tes',
    phone: '081234567890',
    serviceDate: ctx.date,
    portions: 300,
    consent: true,
  });
}

describe('updateQuotationStatus', () => {
  it('mengubah status dari new ke contacted dan mencatat audit', async () => {
    const quote = await newQuotation(ctx);
    expect(quote.status).toBe('new');

    const updated = await updateQuotationStatus(ctx.db, quote.id, 'contacted', {
      id: ctx.adminId,
      label: 'Admin Tes',
    });
    expect(updated.status).toBe('contacted');

    const entries = await listAudit(ctx.db, { entity: 'quotation', entityId: quote.id });
    const entry = entries.find((e) => e.action === 'quotation_status_changed');
    expect(entry).toBeDefined();
    expect(entry?.before).toMatchObject({ status: 'new' });
    expect(entry?.after).toMatchObject({ status: 'contacted' });
  });

  it('mengubah status dari contacted ke lost', async () => {
    const quote = await newQuotation(ctx);
    await updateQuotationStatus(ctx.db, quote.id, 'contacted', { id: ctx.adminId, label: 'Admin Tes' });

    const updated = await updateQuotationStatus(ctx.db, quote.id, 'lost', {
      id: ctx.adminId,
      label: 'Admin Tes',
    });
    expect(updated.status).toBe('lost');
  });

  it('menolak mengubah status quotation yang sudah won', async () => {
    const quote = await newQuotation(ctx);
    // Tidak ada jalur publik untuk mencapai 'won' di task ini; set langsung lewat helper
    // di task berikutnya akan memakai convertQuotationToPO. Untuk sekarang, pastikan
    // transisi dari status final manapun ditolak dengan menandai lost dua kali — lost
    // juga harus final (tidak bisa diubah lagi).
    await updateQuotationStatus(ctx.db, quote.id, 'lost', { id: ctx.adminId, label: 'Admin Tes' });

    await expect(
      updateQuotationStatus(ctx.db, quote.id, 'contacted', { id: ctx.adminId, label: 'Admin Tes' }),
    ).rejects.toBeInstanceOf(AppError);
  });

  it('menolak quotation yang tidak ditemukan', async () => {
    await expect(
      updateQuotationStatus(ctx.db, '00000000-0000-0000-0000-000000000000', 'contacted', {
        id: ctx.adminId,
        label: 'Admin Tes',
      }),
    ).rejects.toThrow('Quotation tidak ditemukan.');
  });
});

const actor = () => ({ id: ctx.adminId, label: 'Admin Tes' });

async function newOrder(ctx: TestContext, customerPhone = '081234567890') {
  return createAdminOrder(
    ctx.db,
    {
      source: 'po',
      serviceDate: ctx.date,
      customerName: 'Kantor Tes',
      customerPhone,
      items: [{ menuItemId: ctx.menu.ayam.id, portions: 50 }],
      addressLine: 'Ambil di tempat',
      district: 'Pontianak Kota',
      paymentMethod: 'cash',
    },
    actor(),
  );
}

describe('convertQuotationToPO', () => {
  it('mengubah quotation contacted menjadi won + satu PO, lalu bisa ditautkan ke order', async () => {
    const quote = await newQuotation(ctx);
    await updateQuotationStatus(ctx.db, quote.id, 'contacted', actor());

    const result = await convertQuotationToPO(
      ctx.db,
      quote.id,
      { agreedTotal: 12_500_000, dueAt: `${ctx.date}T17:00:00+07:00` },
      actor(),
    );

    expect(result.quotation.status).toBe('won');
    expect(result.purchaseOrder.poNumber).toMatch(/^PO-[0-9]{6}-[A-Z0-9]{4}$/);
    expect(result.purchaseOrder.agreedTotal).toBe(12_500_000);
    expect(result.purchaseOrder.dueAt).toBeTruthy();
    expect(result.purchaseOrder.orderId).toBeNull();

    const auditEntries = await listAudit(ctx.db, { entity: 'quotation', entityId: quote.id });
    expect(auditEntries.some((entry) => entry.action === 'quotation_converted_to_po')).toBe(true);

    const order = await newOrder(ctx);
    const linked = await linkPurchaseOrderToOrder(ctx.db, result.purchaseOrder.id, order.order.id, actor());
    expect(linked.orderId).toBe(order.order.id);
    expect(linked.orderNo).toBe(order.order.orderNo);

    const listed = (await listQuotations(ctx.db)).find((row) => row.id === quote.id);
    expect(listed?.purchaseOrder?.orderNo).toBe(order.order.orderNo);
    expect((await getQuotationById(ctx.db, quote.id)).purchaseOrder?.orderId).toBe(order.order.id);
  });

  it('menolak konversi quotation lost', async () => {
    const quote = await newQuotation(ctx);
    await updateQuotationStatus(ctx.db, quote.id, 'lost', actor());

    await expect(
      convertQuotationToPO(ctx.db, quote.id, { agreedTotal: 1_000_000 }, actor()),
    ).rejects.toMatchObject({ code: 'INVALID_STATE' });
  });

  it('menolak konversi kedua untuk quotation yang sudah punya PO', async () => {
    const quote = await newQuotation(ctx);
    await convertQuotationToPO(ctx.db, quote.id, { agreedTotal: 5_000_000 }, actor());

    await expect(
      convertQuotationToPO(ctx.db, quote.id, { agreedTotal: 6_000_000 }, actor()),
    ).rejects.toMatchObject({ code: 'INVALID_STATE' });
  });
});

describe('linkPurchaseOrderToOrder', () => {
  it('menolak overwrite tautan ke order lain', async () => {
    const quote = await newQuotation(ctx);
    const { purchaseOrder } = await convertQuotationToPO(
      ctx.db,
      quote.id,
      { agreedTotal: 5_000_000 },
      actor(),
    );
    const first = await newOrder(ctx, '081234567891');
    const second = await newOrder(ctx, '081234567892');

    await linkPurchaseOrderToOrder(ctx.db, purchaseOrder.id, first.order.id, actor());

    await expect(
      linkPurchaseOrderToOrder(ctx.db, purchaseOrder.id, second.order.id, actor()),
    ).rejects.toMatchObject({ code: 'INVALID_STATE' });
  });

  it('idempoten saat menautkan ke order yang sama', async () => {
    const quote = await newQuotation(ctx);
    const { purchaseOrder } = await convertQuotationToPO(
      ctx.db,
      quote.id,
      { agreedTotal: 5_000_000 },
      actor(),
    );
    const order = await newOrder(ctx, '081234567893');

    const first = await linkPurchaseOrderToOrder(ctx.db, purchaseOrder.id, order.order.id, actor());
    const second = await linkPurchaseOrderToOrder(ctx.db, purchaseOrder.id, order.order.id, actor());
    expect(second.orderId).toBe(first.orderId);
  });

  it('menolak dua PO tertaut ke order yang sama (index unik)', async () => {
    const firstQuote = await newQuotation(ctx);
    const secondQuote = await newQuotation(ctx);
    const first = await convertQuotationToPO(ctx.db, firstQuote.id, { agreedTotal: 5_000_000 }, actor());
    const second = await convertQuotationToPO(ctx.db, secondQuote.id, { agreedTotal: 5_000_000 }, actor());
    const order = await newOrder(ctx, '081234567894');

    await linkPurchaseOrderToOrder(ctx.db, first.purchaseOrder.id, order.order.id, actor());

    await expect(
      linkPurchaseOrderToOrder(ctx.db, second.purchaseOrder.id, order.order.id, actor()),
    ).rejects.toMatchObject({ code: 'INVALID_STATE' });
  });
});

describe('notifikasi admin saat quotation baru', () => {
  beforeEach(async () => {
    await ctx.db.execute(sql`DELETE FROM notifications`);
  });

  afterEach(async () => {
    await setSetting(ctx.db, 'notifications.admin_whatsapp', '', 'Tes');
  });

  it('meng-enqueue notifikasi WhatsApp admin bila nomor diisi', async () => {
    await setSetting(ctx.db, 'notifications.admin_whatsapp', '081298765432', 'Tes');
    await newQuotation(ctx);

    const queued = await listQueuedNotifications(ctx.db, 100);
    const adminNotification = queued.find(
      (row) =>
        row.template === 'quotation_requested_admin' &&
        row.recipient === '081298765432' &&
        row.channel === 'whatsapp' &&
        row.status === 'queued',
    );
    expect(adminNotification).toBeDefined();
    expect(adminNotification?.payload).toMatchObject({
      portions: 300,
      serviceDate: ctx.date,
    });
  });

  it('tidak membuat notifikasi admin bila nomor kosong', async () => {
    await newQuotation(ctx);
    const queued = await listQueuedNotifications(ctx.db, 100);
    expect(queued.some((row) => row.template === 'quotation_requested_admin')).toBe(false);
  });
});
