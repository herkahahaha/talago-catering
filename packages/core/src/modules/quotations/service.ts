import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import type {
  AdminConvertQuotationInput,
  QuotationPurchaseOrderDto,
  QuoteRequestDto,
  QuotationRequestInput,
} from '@catering/contracts';
import { purchaseOrders, quotations } from './schema';
import { withTransaction, type Database, type Executor } from '../../db/client';
import { AppError, makePoNo, makeQuoteNo } from '../../lib/ids';
import { normalizePhone } from '../../lib/phone';
import { enqueueNotification } from '../notifications/index';
import { getOrderNoMap, getOrderRowById } from '../orders/index';
import { getSetting } from '../settings/index';
import { recordAudit } from '../audit/index';

type PurchaseOrderRow = typeof purchaseOrders.$inferSelect;

function toPurchaseOrderDto(row: PurchaseOrderRow, orderNo: string | null): QuotationPurchaseOrderDto {
  return {
    id: row.id,
    poNumber: row.poNumber,
    agreedTotal: row.agreedTotal,
    dueAt: row.dueAt ? row.dueAt.toISOString() : null,
    orderId: row.orderId,
    orderNo,
  };
}

function toQuoteRequestDto(
  row: typeof quotations.$inferSelect,
  purchaseOrder: QuotationPurchaseOrderDto | null = null,
): QuoteRequestDto {
  return {
    id: row.id,
    status: row.status,
    name: row.name,
    phone: row.phone,
    email: row.email,
    company: row.company,
    serviceDate: row.serviceDate,
    portions: row.portions,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    purchaseOrder,
  };
}

/** Ambil PO untuk sekumpulan quotation + nomor order tertaut (bila ada). */
async function loadPurchaseOrders(
  exec: Executor,
  quotationIds: string[],
): Promise<Map<string, QuotationPurchaseOrderDto>> {
  if (quotationIds.length === 0) return new Map();
  const rows = await exec
    .select()
    .from(purchaseOrders)
    .where(inArray(purchaseOrders.quotationId, quotationIds));
  const orderIds = rows.map((row) => row.orderId).filter((id): id is string => Boolean(id));
  const orderNoMap = await getOrderNoMap(exec, orderIds);

  const map = new Map<string, QuotationPurchaseOrderDto>();
  for (const row of rows) {
    if (!row.quotationId) continue;
    map.set(
      row.quotationId,
      toPurchaseOrderDto(row, row.orderId ? (orderNoMap.get(row.orderId) ?? null) : null),
    );
  }
  return map;
}

export async function createQuotationRequest(
  exec: Executor,
  input: QuotationRequestInput,
): Promise<QuoteRequestDto> {
  const phone = normalizePhone(input.phone);
  const [row] = await exec
    .insert(quotations)
    .values({
      code: makeQuoteNo(input.serviceDate),
      name: input.name.trim(),
      phone,
      email: input.email?.trim() || null,
      company: input.company?.trim() || null,
      serviceDate: input.serviceDate,
      portions: input.portions,
      notes: input.notes?.trim() || null,
      status: 'new',
    })
    .returning();

  if (!row) throw new Error('Gagal menyimpan permintaan quotation.');

  await enqueueNotification(exec, {
    channel: 'whatsapp',
    recipient: phone,
    template: 'order_created',
    payload: { quoteCode: row.code, portions: row.portions, serviceDate: row.serviceDate },
  });

  // Notifikasi admin bersifat opsional: bila nomor belum diisi, lewati tanpa error.
  const adminWhatsapp = await getSetting<string>(exec, 'notifications.admin_whatsapp');
  const adminRecipient = typeof adminWhatsapp === 'string' ? adminWhatsapp.trim() : '';
  if (adminRecipient) {
    await enqueueNotification(exec, {
      channel: 'whatsapp',
      recipient: adminRecipient,
      template: 'quotation_requested_admin',
      payload: {
        quoteCode: row.code,
        name: row.name,
        phone: row.phone,
        company: row.company,
        portions: row.portions,
        serviceDate: row.serviceDate,
        notes: row.notes,
      },
    });
  }

  await recordAudit(exec, {
    actor: { type: 'customer', label: input.name },
    entity: 'quotation',
    entityId: row.id,
    action: 'quotation_requested',
    after: { code: row.code, portions: row.portions, serviceDate: row.serviceDate },
  });

  return toQuoteRequestDto(row);
}

export async function listQuotations(exec: Executor, limit = 50): Promise<QuoteRequestDto[]> {
  const rows = await exec.select().from(quotations).orderBy(desc(quotations.createdAt)).limit(limit);
  const purchaseOrderMap = await loadPurchaseOrders(
    exec,
    rows.map((row) => row.id),
  );
  return rows.map((row) => toQuoteRequestDto(row, purchaseOrderMap.get(row.id) ?? null));
}

export async function getQuotationById(exec: Executor, quotationId: string): Promise<QuoteRequestDto> {
  const [row] = await exec.select().from(quotations).where(eq(quotations.id, quotationId)).limit(1);
  if (!row) throw new AppError('NOT_FOUND', 'Quotation tidak ditemukan.');
  const purchaseOrderMap = await loadPurchaseOrders(exec, [row.id]);
  return toQuoteRequestDto(row, purchaseOrderMap.get(row.id) ?? null);
}

/** Status final (PRD §2 butir 9 jalur eskalasi): tidak bisa diubah lagi setelah tercapai. */
const FINAL_QUOTATION_STATUSES = new Set<QuoteRequestDto['status']>(['won', 'lost']);

/**
 * Admin menandai quotation sebagai sudah dihubungi atau batal. Transisi dari status
 * final (`won`/`lost`) ditolak — perubahan lebih lanjut harus lewat jalur PO.
 */
export async function updateQuotationStatus(
  exec: Executor,
  quotationId: string,
  status: 'contacted' | 'lost',
  actor: { id: string; label: string },
): Promise<QuoteRequestDto> {
  const [current] = await exec.select().from(quotations).where(eq(quotations.id, quotationId)).limit(1);
  if (!current) throw new AppError('NOT_FOUND', 'Quotation tidak ditemukan.');
  if (FINAL_QUOTATION_STATUSES.has(current.status)) {
    throw new AppError('INVALID_STATE', 'Status quotation ini sudah final dan tidak bisa diubah.');
  }

  const [row] = await exec
    .update(quotations)
    .set({ status })
    .where(eq(quotations.id, quotationId))
    .returning();
  if (!row) throw new AppError('NOT_FOUND', 'Quotation tidak ditemukan.');

  await recordAudit(exec, {
    actor: { type: 'staff', id: actor.id, label: actor.label },
    entity: 'quotation',
    entityId: row.id,
    action: 'quotation_status_changed',
    before: { status: current.status },
    after: { status: row.status },
  });

  return toQuoteRequestDto(row);
}

function isUniqueViolation(error: unknown): boolean {
  for (let current: unknown = error; current;) {
    if (typeof current === 'object' && current !== null && 'code' in current) {
      if ((current as { code?: unknown }).code === '23505') return true;
    }
    current =
      typeof current === 'object' && current !== null && 'cause' in current
        ? (current as { cause?: unknown }).cause
        : undefined;
  }
  return false;
}

/**
 * Ubah quotation jadi `won` dan buat satu baris PO dalam transaksi tunggal.
 * Quotation `lost` tidak bisa dikonversi, dan satu quotation hanya boleh punya satu PO.
 */
export async function convertQuotationToPO(
  exec: Database,
  quotationId: string,
  input: AdminConvertQuotationInput,
  actor: { id: string; label: string },
): Promise<{ quotation: QuoteRequestDto; purchaseOrder: QuotationPurchaseOrderDto }> {
  if (input.agreedTotal <= 0) {
    throw new AppError('VALIDATION_ERROR', 'Nilai PO harus lebih dari 0.');
  }

  const [current] = await exec.select().from(quotations).where(eq(quotations.id, quotationId)).limit(1);
  if (!current) throw new AppError('NOT_FOUND', 'Quotation tidak ditemukan.');
  if (current.status === 'lost') {
    throw new AppError('INVALID_STATE', 'Quotation yang sudah batal tidak bisa dikonversi ke PO.');
  }

  const [existingPo] = await exec
    .select()
    .from(purchaseOrders)
    .where(eq(purchaseOrders.quotationId, quotationId))
    .limit(1);
  if (existingPo) {
    throw new AppError('INVALID_STATE', 'Quotation ini sudah punya PO.');
  }

  try {
    const result = await withTransaction(exec, async (tx) => {
      const [po] = await tx
        .insert(purchaseOrders)
        .values({
          quotationId,
          poNumber: makePoNo(current.serviceDate),
          agreedTotal: input.agreedTotal,
          dueAt: input.dueAt ? new Date(input.dueAt) : null,
        })
        .returning();
      if (!po) throw new Error('Gagal menyimpan PO.');

      const [row] = await tx
        .update(quotations)
        .set({ status: 'won' })
        .where(eq(quotations.id, quotationId))
        .returning();
      if (!row) throw new AppError('NOT_FOUND', 'Quotation tidak ditemukan.');

      await recordAudit(tx, {
        actor: { type: 'staff', id: actor.id, label: actor.label },
        entity: 'quotation',
        entityId: row.id,
        action: 'quotation_converted_to_po',
        before: { status: current.status },
        after: { status: row.status, poNumber: po.poNumber, agreedTotal: po.agreedTotal },
      });

      return { row, po };
    });

    return {
      quotation: toQuoteRequestDto(result.row, toPurchaseOrderDto(result.po, null)),
      purchaseOrder: toPurchaseOrderDto(result.po, null),
    };
  } catch (error) {
    // Dua request konversi bersamaan: indeks unik quotation_id menangkap yang kedua.
    if (isUniqueViolation(error)) {
      throw new AppError('INVALID_STATE', 'Quotation ini sudah punya PO.');
    }
    throw error;
  }
}

/**
 * Tautkan PO ke order nyata. Penautan ulang ke order lain ditolak agar tidak
 * menimpa tautan secara diam-diam; tautan ke order yang sama idempoten.
 */
export async function linkPurchaseOrderToOrder(
  exec: Executor,
  purchaseOrderId: string,
  orderId: string,
  actor: { id: string; label: string },
): Promise<QuotationPurchaseOrderDto> {
  const [po] = await exec
    .select()
    .from(purchaseOrders)
    .where(eq(purchaseOrders.id, purchaseOrderId))
    .limit(1);
  if (!po) throw new AppError('NOT_FOUND', 'PO tidak ditemukan.');

  const order = await getOrderRowById(exec, orderId);
  if (!order) throw new AppError('NOT_FOUND', 'Order tidak ditemukan.');

  if (po.orderId) {
    if (po.orderId === orderId) return toPurchaseOrderDto(po, order.orderNo);
    throw new AppError('INVALID_STATE', 'PO ini sudah tertaut ke order lain.');
  }

  const [updated] = await exec
    .update(purchaseOrders)
    .set({ orderId })
    .where(and(eq(purchaseOrders.id, purchaseOrderId), isNull(purchaseOrders.orderId)))
    .returning();
  if (!updated) {
    throw new AppError('INVALID_STATE', 'PO ini sudah tertaut ke order lain.');
  }

  await recordAudit(exec, {
    actor: { type: 'staff', id: actor.id, label: actor.label },
    entity: 'purchase_order',
    entityId: updated.id,
    action: 'purchase_order_linked_to_order',
    before: { orderId: null },
    after: { orderId, orderNo: order.orderNo, poNumber: updated.poNumber },
  });

  return toPurchaseOrderDto(updated, order.orderNo);
}
