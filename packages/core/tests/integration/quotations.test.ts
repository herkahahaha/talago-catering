import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppError, createQuotationRequest, listAudit, updateQuotationStatus } from '../../src/index';
import { setupTestDatabase, teardownTestDatabase, type TestContext } from '../../src/testing';

let ctx: TestContext;

beforeAll(async () => {
  ctx = await setupTestDatabase();
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
