import { desc } from 'drizzle-orm';
import type { QuoteRequestDto, QuotationRequestInput } from '@catering/contracts';
import { quotations } from './schema';
import type { Executor } from '../../db/client';
import { makeQuoteNo } from '../../lib/ids';
import { normalizePhone } from '../../lib/phone';
import { enqueueNotification } from '../notifications/index';
import { recordAudit } from '../audit/index';

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

export async function listQuotations(exec: Executor, limit = 50): Promise<QuoteRequestDto[]> {
  const rows = await exec.select().from(quotations).orderBy(desc(quotations.createdAt)).limit(limit);
  return rows.map((row) => ({
    id: row.id,
    status: row.status,
    name: row.name,
    phone: row.phone,
    company: row.company,
    serviceDate: row.serviceDate,
    portions: row.portions,
    createdAt: row.createdAt.toISOString(),
  }));
}
