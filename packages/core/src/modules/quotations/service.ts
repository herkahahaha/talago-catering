import { desc, eq } from 'drizzle-orm';
import type { QuoteRequestDto, QuotationRequestInput } from '@catering/contracts';
import { quotations } from './schema';
import type { Executor } from '../../db/client';
import { AppError, makeQuoteNo } from '../../lib/ids';
import { normalizePhone } from '../../lib/phone';
import { enqueueNotification } from '../notifications/index';
import { recordAudit } from '../audit/index';

function toQuoteRequestDto(row: typeof quotations.$inferSelect): QuoteRequestDto {
  return {
    id: row.id,
    status: row.status,
    name: row.name,
    phone: row.phone,
    company: row.company,
    serviceDate: row.serviceDate,
    portions: row.portions,
    createdAt: row.createdAt.toISOString(),
  };
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
  return rows.map(toQuoteRequestDto);
}

/** Status final (PRD §2 butir 9 jalur eskalasi): tidak bisa diubah lagi setelah tercapai. */
const FINAL_QUOTATION_STATUSES = new Set<QuoteRequestDto['status']>(['won', 'lost']);

/**
 * Admin menandai quotation sebagai sudah dihubungi atau batal. Transisi dari status
 * final (`won`/`lost`) ditolak — perubahan lebih lanjut harus lewat jalur PO (fase berikut).
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
