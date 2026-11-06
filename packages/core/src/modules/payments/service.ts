import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { desc, eq } from 'drizzle-orm';
import type { PaymentDto, PaymentInstructionsDto, PaymentMethod } from '@catering/contracts';
import { payments, webhookEvents } from './schema';
import type { Executor } from '../../db/client';
import { AppError, randomToken } from '../../lib/ids';
import { getEnv } from '../../env';
/** Bentuk minimal order yang dibutuhkan modul payment (tanpa impor modul order). */
export interface PayableOrder {
  id: string;
  orderNo: string;
  total: number;
  holdExpiresAt: Date | null;
}

export type PaymentRow = typeof payments.$inferSelect;

export interface ChargeInput {
  orderId: string;
  orderNo: string;
  amount: number;
  method: PaymentMethod;
  expiresAt: Date;
  customerName: string;
}

export interface ChargeResult {
  gatewayRef: string;
  reference: string;
  instructions: string;
  expiresAt: Date;
  payload: Record<string, unknown>;
}

export interface PaymentGateway {
  readonly name: string;
  createCharge(input: ChargeInput): Promise<ChargeResult>;
  verifyWebhook(rawBody: string, signature: string | null): boolean;
}

/**
 * Gateway simulasi untuk pengembangan. Kontraknya sengaja sama dengan
 * gateway asli sehingga Midtrans/Xendit cukup mengganti implementasi.
 */
export class MockPaymentGateway implements PaymentGateway {
  readonly name = 'mock';

  async createCharge(input: ChargeInput): Promise<ChargeResult> {
    const gatewayRef = `MOCK-${input.orderNo}-${randomToken(6)}`;
    const suffix = randomBytes(4).toString('hex').toUpperCase();
    if (input.method === 'qris') {
      return {
        gatewayRef,
        reference: `QRIS-SIM-${suffix}`,
        instructions:
          `Mode simulasi: QRIS ${gatewayRef}. Pindai di aplikasi pembayaran, ` +
          `atau tekan "Simulasikan pembayaran" di halaman status untuk melunasi.`,
        expiresAt: input.expiresAt,
        payload: { simulated: true, method: 'qris' },
      };
    }
    if (input.method === 'va') {
      const vaNumber = `8808${randomBytes(5)
        .toString('hex')
        .replace(/[a-f]/g, (c) => String(c.charCodeAt(0) % 10))}`;
      return {
        gatewayRef,
        reference: vaNumber,
        instructions:
          `Transfer ke nomor VA ${vaNumber} sebesar Rp ${input.amount.toLocaleString('id-ID')}. ` +
          `Mode simulasi: tekan "Simulasikan pembayaran" di halaman status.`,
        expiresAt: input.expiresAt,
        payload: { simulated: true, method: 'va', vaNumber },
      };
    }
    return {
      gatewayRef,
      reference: gatewayRef,
      instructions: 'Pembayaran tunai dicatat oleh admin. Order akan ditandai lunas setelah kas diterima.',
      expiresAt: input.expiresAt,
      payload: { simulated: true, method: 'cash' },
    };
  }

  verifyWebhook(rawBody: string, signature: string | null): boolean {
    return verifyHmacSignature(rawBody, signature, getEnv().PAYMENT_WEBHOOK_SECRET);
  }
}

export function verifyHmacSignature(rawBody: string, signature: string | null, secret: string): boolean {
  if (!signature) return false;
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(signature.replace(/^sha256=/, ''), 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

export function signWebhookPayload(rawBody: string, secret = getEnv().PAYMENT_WEBHOOK_SECRET): string {
  return createHmac('sha256', secret).update(rawBody).digest('hex');
}

let gateway: PaymentGateway | null = null;

export function getPaymentGateway(): PaymentGateway {
  if (gateway) return gateway;
  const configured = getEnv().PAYMENT_GATEWAY;
  if (configured !== 'mock') {
    throw new AppError(
      'PAYMENT_ERROR',
      `Gateway "${configured}" belum diimplementasikan. Gunakan PAYMENT_GATEWAY=mock.`,
    );
  }
  gateway = new MockPaymentGateway();
  return gateway;
}

export function toPaymentDto(row: PaymentRow): PaymentDto {
  return {
    id: row.id,
    gatewayRef: row.gatewayRef,
    method: row.method,
    status: row.status,
    amount: row.amount,
    paidAt: row.paidAt ? row.paidAt.toISOString() : null,
    expiresAt: row.expiresAt.toISOString(),
    reference: row.reference,
  };
}

export function toInstructionsDto(row: PaymentRow): PaymentInstructionsDto {
  return {
    gatewayRef: row.gatewayRef,
    method: row.method,
    amount: row.amount,
    expiresAt: row.expiresAt.toISOString(),
    reference: row.reference ?? row.gatewayRef,
    instructions: row.instructions ?? '',
  };
}

export async function getLatestPaymentForOrder(exec: Executor, orderId: string): Promise<PaymentRow | null> {
  const [row] = await exec
    .select()
    .from(payments)
    .where(eq(payments.orderId, orderId))
    .orderBy(desc(payments.createdAt))
    .limit(1);
  return row ?? null;
}

export async function getPaymentByGatewayRef(exec: Executor, gatewayRef: string): Promise<PaymentRow | null> {
  const [row] = await exec.select().from(payments).where(eq(payments.gatewayRef, gatewayRef)).limit(1);
  return row ?? null;
}

export async function listPaymentsForOrder(exec: Executor, orderId: string): Promise<PaymentRow[]> {
  return exec.select().from(payments).where(eq(payments.orderId, orderId)).orderBy(desc(payments.createdAt));
}

/**
 * Membuat tagihan. Bila sudah ada tagihan pending yang masih berlaku,
 * tagihan itu dikembalikan (idempoten) — tidak menumpuk tagihan ganda.
 */
export async function createPaymentForOrder(
  exec: Executor,
  order: PayableOrder,
  options: { method?: PaymentMethod } = {},
): Promise<{ payment: PaymentRow; instructions: PaymentInstructionsDto }> {
  const existing = await getLatestPaymentForOrder(exec, order.id);
  if (existing && existing.status === 'pending' && existing.expiresAt.getTime() > Date.now()) {
    return { payment: existing, instructions: toInstructionsDto(existing) };
  }

  const method = options.method ?? existing?.method ?? 'qris';
  const expiresAt = order.holdExpiresAt ?? new Date(Date.now() + 10 * 60_000);
  const charge = await getPaymentGateway().createCharge({
    orderId: order.id,
    orderNo: order.orderNo,
    amount: order.total,
    method,
    expiresAt,
    customerName: '',
  });

  const [payment] = await exec
    .insert(payments)
    .values({
      orderId: order.id,
      gatewayRef: charge.gatewayRef,
      method,
      status: 'pending',
      amount: order.total,
      reference: charge.reference,
      instructions: charge.instructions,
      payload: charge.payload,
      expiresAt: charge.expiresAt,
    })
    .returning();

  if (!payment) throw new AppError('PAYMENT_ERROR', 'Gagal membuat tagihan pembayaran.');
  return { payment, instructions: toInstructionsDto(payment) };
}

export async function markPaymentPaid(
  exec: Executor,
  paymentId: string,
  options: { paidAt?: Date; payload?: Record<string, unknown> } = {},
): Promise<void> {
  await exec
    .update(payments)
    .set({
      status: 'paid',
      paidAt: options.paidAt ?? new Date(),
      updatedAt: new Date(),
      ...(options.payload ? { payload: options.payload } : {}),
    })
    .where(eq(payments.id, paymentId));
}

export async function markPaymentStatus(
  exec: Executor,
  paymentId: string,
  status: PaymentRow['status'],
): Promise<void> {
  await exec.update(payments).set({ status, updatedAt: new Date() }).where(eq(payments.id, paymentId));
}

/** true bila event ini belum pernah diproses (insert berhasil). */
export async function recordWebhookEvent(
  exec: Executor,
  input: { eventId: string; gatewayRef: string; eventType: string; payload: Record<string, unknown> | null },
): Promise<boolean> {
  const inserted = await exec
    .insert(webhookEvents)
    .values({
      eventId: input.eventId,
      gatewayRef: input.gatewayRef,
      eventType: input.eventType,
      payload: input.payload,
    })
    .onConflictDoNothing({ target: webhookEvents.eventId })
    .returning({ id: webhookEvents.id });
  return inserted.length > 0;
}

export async function markWebhookProcessed(exec: Executor, eventId: string): Promise<void> {
  await exec.update(webhookEvents).set({ processedAt: new Date() }).where(eq(webhookEvents.eventId, eventId));
}

export async function listWebhookEvents(
  exec: Executor,
  limit = 50,
): Promise<Array<typeof webhookEvents.$inferSelect>> {
  return exec.select().from(webhookEvents).orderBy(desc(webhookEvents.createdAt)).limit(limit);
}
