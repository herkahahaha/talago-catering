import type {
  AdminCreateOrderInput,
  CreateOrderInput,
  CreatedOrderDto,
  PaymentMethod,
  WebhookPaymentInput,
} from '@catering/contracts';
import { webhookPaymentSchema } from '@catering/contracts';
import type { Database, Executor } from '../../db/client';
import { withTransaction } from '../../db/client';
import { AppError, deriveStatusToken, randomToken, sha256Hex, stableStringify } from '../../lib/ids';
import { todayWib } from '../../lib/time';
import { getEnv } from '../../env';
import {
  attachOrderToIdempotencyKey,
  buildOrderDto,
  cancelOrderState,
  claimIdempotencyKey,
  countActiveHolds,
  countRecentExpiredHolds,
  createPendingOrder,
  getOrderRowById,
  getOrderRowByToken,
  getIdempotencyRecord,
  markOrderPaid,
  markOrderPaidAfterExpiry,
  storeIdempotencyResponse,
  type OrderRow,
} from '../orders/index';
import {
  createPaymentForOrder,
  getLatestPaymentForOrder,
  getPaymentByGatewayRef,
  getPaymentGateway,
  markPaymentPaid,
  markPaymentStatus,
  markWebhookProcessed,
  recordWebhookEvent,
  signWebhookPayload,
  toInstructionsDto,
} from '../payments/index';
import { ensureDay } from '../capacity/index';
import { expireStaleHolds, releasePortions, reservePortions } from '../capacity/index';
import { getWindowById, reserveStop } from '../delivery/index';
import { ensureCustomer, getCustomerById, resolveServiceArea } from '../customers/index';
import { getMenuItemsByIds, getScheduledMenuIds } from '../catalog/index';
import { getOrderConfig, getSettingsMap } from '../settings/index';
import { createRefund } from '../refunds/index';
import { recordAudit } from '../audit/index';
import { enqueueNotification } from '../notifications/index';

export interface CheckoutContext {
  ip?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
}

export interface GuestSessionLike {
  sessionId: string;
  customer: { id: string; name: string; phone: string; email: string | null };
  otpVerifiedAt: Date | null;
}

function statusUrl(token: string): string {
  return `${getEnv().APP_URL.replace(/\/$/, '')}/order/${token}`;
}

/** Hash hanya berisi field bisnis; token CAPTCHA & consent tidak memengaruhi idempotensi. */
function requestHashOf(input: CreateOrderInput): string {
  return sha256Hex(
    stableStringify({
      serviceDate: input.serviceDate,
      items: input.items,
      delivery: input.delivery,
      paymentMethod: input.paymentMethod,
      notes: input.notes ?? null,
    }),
  );
}

export interface CreateGuestOrderParams {
  input: CreateOrderInput;
  session: GuestSessionLike;
  idempotencyKey: string;
  ctx: CheckoutContext;
}

/**
 * Alur checkout tamu (PRD §4):
 * validasi → idempotensi → reservasi atomik → order → tagihan.
 * Semua langkah DB yang saling bergantung berada dalam satu transaksi.
 */
export async function createGuestOrder(
  exec: Database,
  params: CreateGuestOrderParams,
): Promise<CreatedOrderDto> {
  const { input, session, idempotencyKey } = params;
  const today = todayWib();
  if (input.serviceDate < today) {
    throw new AppError('VALIDATION_ERROR', 'Tanggal layanan sudah lewat.', {
      hint: 'Pilih tanggal hari ini atau setelahnya.',
    });
  }

  const orderConfig = await getOrderConfig(exec);
  await ensureDay(exec, input.serviceDate);

  const menuIds = [...new Set(input.items.map((item) => item.menuItemId))];
  const catalog = await getMenuItemsByIds(exec, menuIds);
  const catalogById = new Map(catalog.map((item) => [item.id, item]));
  const scheduled = await getScheduledMenuIds(exec, input.serviceDate);

  const lines = input.items.map((item) => {
    const product = catalogById.get(item.menuItemId);
    if (!product || !product.isActive) {
      throw new AppError('VALIDATION_ERROR', 'Salah satu hidangan tidak tersedia.');
    }
    if (!scheduled.has(item.menuItemId)) {
      throw new AppError('VALIDATION_ERROR', `${product.name} tidak dijadwalkan pada ${input.serviceDate}.`, {
        hint: 'Pilih tanggal lain atau hapus hidangan tersebut.',
      });
    }
    return {
      menuItemId: product.id,
      nameSnapshot: product.name,
      unitPrice: product.price,
      portions: item.portions,
      lineTotal: product.price * item.portions,
    };
  });

  const totalPortions = lines.reduce((sum, line) => sum + line.portions, 0);
  if (totalPortions < orderConfig.minPortions) {
    throw new AppError(
      'MIN_ORDER_NOT_MET',
      `Minimal pemesanan ${orderConfig.minPortions} porsi untuk tanggal ini.`,
      { hint: `Tambah ${orderConfig.minPortions - totalPortions} porsi lagi.` },
    );
  }
  if (totalPortions > orderConfig.maxPortionsPerOrder) {
    throw new AppError('ORDER_TOO_LARGE', `Satu order maksimal ${orderConfig.maxPortionsPerOrder} porsi.`, {
      hint: 'Pesanan lebih besar silakan minta quotation agar harga & jadwal disepakati.',
    });
  }

  if (session.otpVerifiedAt === null) {
    const settings = await getSettingsMap(exec);
    const threshold = Number(settings['otp.adaptive_expiry_threshold'] ?? 2);
    const recentExpired = await countRecentExpiredHolds(exec, session.customer.id);
    const activeHolds = await countActiveHolds(exec, session.customer.id);
    const maxActiveHolds = Number(settings['ratelimit.active_holds_per_phone'] ?? 1);
    if (recentExpired >= threshold || activeHolds >= maxActiveHolds + 1) {
      throw new AppError('OTP_REQUIRED', 'Verifikasi nomor HP diperlukan untuk melanjutkan.', {
        hint: 'Kami mengirim kode OTP ke WhatsApp/SMS nomor Anda.',
      });
    }
  }

  if (input.delivery.windowId) {
    const window = await getWindowById(exec, input.delivery.windowId);
    if (!window || window.remainingStops <= 0) {
      throw new AppError('CAPACITY_FULL', 'Jendela antar yang dipilih sudah penuh.', {
        hint: 'Pilih jendela antar lain.',
      });
    }
  }

  // Ongkir mengikuti zona tunggal (PRD §2 butir 8): default gratis.
  const settings = await getSettingsMap(exec);
  const zoneFee = Number(settings['delivery.fee'] ?? 0);
  const area = input.delivery.address.district
    ? await resolveServiceArea(exec, { district: input.delivery.address.district })
    : null;
  const deliveryFee = area?.inZone === false ? 0 : zoneFee;
  if (area?.inZone === false) {
    throw new AppError('VALIDATION_ERROR', area.message, {
      hint: 'Ubah alamat ke area layanan, atau hubungi admin.',
    });
  }

  const subtotal = lines.reduce((sum, line) => sum + line.lineTotal, 0);
  const total = subtotal + deliveryFee;
  const statusToken = deriveStatusToken(idempotencyKey);
  const requestHash = requestHashOf(input);

  type TxResult = { kind: 'created'; order: OrderRow } | { kind: 'replay'; orderId: string };

  const result = await withTransaction(exec, async (tx): Promise<TxResult> => {
    const claim = await claimIdempotencyKey(tx, { key: idempotencyKey, requestHash });
    if (claim.state === 'conflict') {
      throw new AppError(
        'IDEMPOTENCY_CONFLICT',
        'Kunci idempotensi ini sudah dipakai untuk permintaan yang berbeda.',
        { hint: 'Gunakan Idempotency-Key baru untuk pemesanan baru.' },
      );
    }
    if (claim.state === 'in_progress') {
      throw new AppError('IDEMPOTENCY_CONFLICT', 'Permintaan dengan kunci ini sedang diproses.', {
        hint: 'Tunggu sebentar lalu cek status pesanan Anda.',
      });
    }
    if (claim.state === 'replay') {
      return { kind: 'replay', orderId: claim.orderId };
    }

    const order = await createPendingOrder(tx, {
      customerId: session.customer.id,
      serviceDate: input.serviceDate,
      source: 'web',
      statusToken,
      items: lines,
      portions: totalPortions,
      subtotal,
      deliveryFee,
      total,
      deliveryWindowId: input.delivery.windowId ?? null,
      addressLine: input.delivery.address.line,
      district: input.delivery.address.district ?? null,
      recipientName: input.delivery.recipientName ?? session.customer.name,
      recipientPhone: input.delivery.recipientPhone ?? session.customer.phone,
      notes: input.notes ?? null,
      consentAt: new Date(),
      createdIp: params.ctx.ip ?? null,
      hold: true,
      partition: 'regular',
      holdMinutes: orderConfig.holdMinutes,
    });

    await attachOrderToIdempotencyKey(tx, idempotencyKey, order.id);

    return { kind: 'created', order };
  });

  if (result.kind === 'replay') {
    const order = await getOrderRowById(exec, result.orderId);
    if (!order) throw new AppError('NOT_FOUND', 'Order untuk kunci idempotensi ini tidak ditemukan.');
    const payment = await getLatestPaymentForOrder(exec, order.id);
    return {
      order: await buildOrderDto(exec, order),
      statusToken,
      statusUrl: statusUrl(statusToken),
      paymentInstructions: payment ? toInstructionsDto(payment) : null,
    };
  }

  const order = result.order;

  let instructions = null;
  try {
    const created = await createPaymentForOrder(exec, order, { method: input.paymentMethod });
    instructions = created.instructions;
  } catch (error) {
    // Order tetap sah; pelanggan bisa membuat ulang tagihan dari halaman status.
    console.error('[checkout] gagal membuat tagihan', error);
    await recordAudit(exec, {
      actor: { type: 'system', label: 'payment-gateway' },
      entity: 'order',
      entityId: order.id,
      action: 'payment_creation_failed',
      after: { orderNo: order.orderNo, message: (error as Error).message },
      requestId: params.ctx.requestId ?? null,
    });
  }

  if (session.customer.email) {
    await enqueueNotification(exec, {
      channel: 'email',
      recipient: session.customer.email,
      template: 'order_created',
      payload: {
        orderNo: order.orderNo,
        serviceDate: order.serviceDate,
        portions: order.portions,
        total: order.total,
        holdExpiresAt: order.holdExpiresAt?.toISOString() ?? null,
      },
    });
  }

  const dto: CreatedOrderDto = {
    order: await buildOrderDto(exec, order),
    statusToken,
    statusUrl: statusUrl(statusToken),
    paymentInstructions: instructions,
  };

  await storeIdempotencyResponse(exec, idempotencyKey, dto as unknown as Record<string, unknown>);

  return dto;
}

/* ── pembatalan ──────────────────────────────────────────────────────── */

export interface CancelOrderParams {
  token?: string;
  orderId?: string;
  sessionCustomerId?: string;
  actor: { type: 'staff' | 'customer'; id?: string | null; label: string };
  reason: string;
  byAdmin?: boolean;
  requestId?: string | null;
}

export async function cancelOrder(exec: Database, params: CancelOrderParams): Promise<OrderRow> {
  const order = params.orderId
    ? await getOrderRowById(exec, params.orderId)
    : params.token
      ? await getOrderRowByToken(exec, params.token)
      : null;

  if (!order) throw new AppError('NOT_FOUND', 'Order tidak ditemukan.');
  if (params.sessionCustomerId && order.customerId !== params.sessionCustomerId) {
    throw new AppError('NOT_FOUND', 'Order tidak ditemukan pada sesi ini.');
  }

  const previousStatus = order.status;
  const updated = await withTransaction(exec, async (tx) => {
    const cancelled = await cancelOrderState(tx, order, {
      actor: {
        type: params.actor.type,
        id: params.actor.id ?? null,
        label: params.actor.label,
        requestId: params.requestId ?? null,
      },
      reason: params.reason,
      byAdmin: params.byAdmin ?? false,
    });

    if (previousStatus === 'paid' || previousStatus === 'paid_after_expiry') {
      const payment = await getLatestPaymentForOrder(tx, order.id);
      if (payment && payment.status === 'paid') {
        await createRefund(tx, {
          orderId: order.id,
          paymentId: payment.id,
          amount: payment.amount,
          reason: `Pembatalan: ${params.reason}`,
        });
        await markPaymentStatus(tx, payment.id, 'refunded');
      }
    }
    return cancelled;
  });

  if (updated.status === 'cancelled_refunded') {
    const customer = await getCustomerById(exec, updated.customerId);
    if (customer) {
      const payload = { orderNo: updated.orderNo, reason: params.reason };
      if (customer.email) {
        await enqueueNotification(exec, {
          channel: 'email',
          recipient: customer.email,
          template: 'order_cancelled',
          payload,
        });
      }
      await enqueueNotification(exec, {
        channel: 'whatsapp',
        recipient: customer.phone,
        template: 'order_cancelled',
        payload,
      });
    }
  }
  return updated;
}

/* ── webhook pembayaran (PRD §4.3) ───────────────────────────────────── */

export type WebhookOutcome = 'processed' | 'duplicate' | 'ignored' | 'late_paid' | 'late_unavailable';

export interface WebhookResult {
  outcome: WebhookOutcome;
  orderId?: string;
}

export async function handlePaymentWebhook(
  exec: Database,
  input: { rawBody: string; signature: string | null },
): Promise<WebhookResult> {
  const gateway = getPaymentGateway();
  if (!gateway.verifyWebhook(input.rawBody, input.signature)) {
    await recordAudit(exec, {
      actor: { type: 'system', label: 'webhook' },
      entity: 'payment_webhook',
      entityId: 'invalid-signature',
      action: 'webhook_rejected',
      after: { reason: 'invalid_signature' },
    });
    throw new AppError('UNAUTHORIZED', 'Signature webhook tidak valid.');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(input.rawBody);
  } catch {
    throw new AppError('VALIDATION_ERROR', 'Body webhook bukan JSON valid.');
  }

  const parsedBody = webhookPaymentSchema.safeParse(parsed);
  if (!parsedBody.success) {
    throw new AppError('VALIDATION_ERROR', 'Payload webhook tidak sesuai kontrak.', {
      details: { issues: parsedBody.error.issues.map((issue) => issue.message) },
    });
  }
  const data: WebhookPaymentInput = parsedBody.data;

  const isNew = await recordWebhookEvent(exec, {
    eventId: data.eventId,
    gatewayRef: data.gatewayRef,
    eventType: data.status,
    payload: data as unknown as Record<string, unknown>,
  });
  if (!isNew) return { outcome: 'duplicate' };

  const payment = await getPaymentByGatewayRef(exec, data.gatewayRef);
  if (!payment) {
    await markWebhookProcessed(exec, data.eventId);
    return { outcome: 'ignored' };
  }
  if (payment.amount !== data.amount) {
    await recordAudit(exec, {
      actor: { type: 'webhook', label: 'payment-webhook' },
      entity: 'payment',
      entityId: payment.id,
      action: 'webhook_amount_mismatch',
      after: { expected: payment.amount, received: data.amount, gatewayRef: payment.gatewayRef },
    });
    await markWebhookProcessed(exec, data.eventId);
    return { outcome: 'ignored', orderId: payment.orderId };
  }

  const order = await getOrderRowById(exec, payment.orderId);
  if (!order) {
    await markWebhookProcessed(exec, data.eventId);
    return { outcome: 'ignored' };
  }

  if (data.status === 'failed' || data.status === 'expired') {
    // Event datang tidak berurutan: jangan menurunkan pembayaran yang sudah lunas.
    const alreadySettled =
      payment.status === 'paid' ||
      ['paid', 'paid_after_expiry', 'in_production', 'out_for_delivery', 'delivered'].includes(order.status);
    if (alreadySettled) {
      await markWebhookProcessed(exec, data.eventId);
      return { outcome: 'ignored', orderId: order.id };
    }
    await markPaymentStatus(exec, payment.id, data.status === 'failed' ? 'failed' : 'expired');
    await recordAudit(exec, {
      actor: { type: 'webhook', label: 'payment-webhook' },
      entity: 'payment',
      entityId: payment.id,
      action: `payment_${data.status}`,
      after: { orderNo: order.orderNo, gatewayRef: payment.gatewayRef },
    });
    await markWebhookProcessed(exec, data.eventId);
    return { outcome: 'processed', orderId: order.id };
  }

  const paidAt = data.paidAt ? new Date(data.paidAt) : new Date();

  if (order.status === 'paid' || order.status === 'paid_after_expiry') {
    await markWebhookProcessed(exec, data.eventId);
    return { outcome: 'duplicate', orderId: order.id };
  }

  if (order.status === 'cancelled_refunded') {
    await withTransaction(exec, async (tx) => {
      await markPaymentPaid(tx, payment.id, { paidAt, payload: data as unknown as Record<string, unknown> });
      await createRefund(tx, {
        orderId: order.id,
        paymentId: payment.id,
        amount: payment.amount,
        reason: 'Pembayaran masuk setelah order dibatalkan',
      });
    });
    await markWebhookProcessed(exec, data.eventId);
    return { outcome: 'processed', orderId: order.id };
  }

  const holdValid =
    order.status === 'pending_payment' &&
    order.holdExpiresAt !== null &&
    order.holdExpiresAt.getTime() > Date.now();

  if (holdValid) {
    await withTransaction(exec, async (tx) => {
      await markPaymentPaid(tx, payment.id, { paidAt, payload: data as unknown as Record<string, unknown> });
      await markOrderPaid(tx, order.id, { paidAt });
    });
    await markWebhookProcessed(exec, data.eventId);
    return { outcome: 'processed', orderId: order.id };
  }

  // Pembayaran telat: lepas hold kedaluwarsa lalu coba reservasi ulang atomik.
  const late = await withTransaction(exec, async (tx) => {
    await expireStaleHolds(tx, order.serviceDate);
    const fresh = await getOrderRowById(tx, order.id);
    if (!fresh) throw new AppError('NOT_FOUND', 'Order tidak ditemukan.');

    if (fresh.status === 'paid' || fresh.status === 'paid_after_expiry') {
      return { outcome: 'duplicate' as WebhookOutcome };
    }
    if (fresh.status === 'cancelled_refunded') {
      await markPaymentPaid(tx, payment.id, { paidAt });
      await createRefund(tx, {
        orderId: order.id,
        paymentId: payment.id,
        amount: payment.amount,
        reason: 'Pembayaran masuk setelah order dibatalkan',
      });
      return { outcome: 'processed' as WebhookOutcome };
    }

    const partition = order.source === 'po' ? 'po' : 'regular';
    const reserved = await reservePortions(tx, {
      date: order.serviceDate,
      portions: order.portions,
      partition,
      hold: false,
      ignoreCutoff: true,
    });

    if (reserved.ok) {
      if (order.deliveryWindowId) {
        const stop = await reserveStop(tx, order.deliveryWindowId);
        if (!stop) {
          await releasePortions(tx, {
            date: order.serviceDate,
            portions: order.portions,
            partition,
            held: false,
          });
          await markPaymentPaid(tx, payment.id, { paidAt });
          await markOrderPaidAfterExpiry(tx, order.id, { paidAt });
          await createRefund(tx, {
            orderId: order.id,
            paymentId: payment.id,
            amount: payment.amount,
            reason: 'Pembayaran telat: jendela antar penuh',
          });
          return { outcome: 'late_unavailable' as WebhookOutcome };
        }
      }
      await markPaymentPaid(tx, payment.id, { paidAt });
      await markOrderPaid(tx, order.id, { paidAt });
      return { outcome: 'late_paid' as WebhookOutcome };
    }

    await markPaymentPaid(tx, payment.id, { paidAt });
    await markOrderPaidAfterExpiry(tx, order.id, { paidAt });
    await createRefund(tx, {
      orderId: order.id,
      paymentId: payment.id,
      amount: payment.amount,
      reason: 'Pembayaran telat: kapasitas tanggal sudah penuh',
    });
    return { outcome: 'late_unavailable' as WebhookOutcome };
  });

  await markWebhookProcessed(exec, data.eventId);
  return { outcome: late.outcome, orderId: order.id };
}

/**
 * Simulasi pembayaran untuk mode mock (hanya di luar production).
 * Membentuk body webhook yang ditandatangani server sendiri.
 */
export async function settleMockPayment(exec: Database, gatewayRef: string): Promise<WebhookResult> {
  if (getEnv().NODE_ENV === 'production') {
    throw new AppError('FORBIDDEN', 'Simulasi pembayaran tidak tersedia di production.');
  }
  const payment = await getPaymentByGatewayRef(exec, gatewayRef);
  if (!payment) throw new AppError('NOT_FOUND', 'Tagihan tidak ditemukan.');
  if (payment.status === 'paid') return { outcome: 'duplicate', orderId: payment.orderId };

  const body: WebhookPaymentInput = {
    eventId: `mock-${Date.now()}-${randomToken(6)}`,
    gatewayRef,
    status: 'settled',
    amount: payment.amount,
    method: payment.method,
    paidAt: new Date().toISOString(),
  };
  const rawBody = JSON.stringify(body);
  return handlePaymentWebhook(exec, { rawBody, signature: signWebhookPayload(rawBody) });
}

/* ── pembuatan tagihan ulang ─────────────────────────────────────────── */

export async function retryOrderPayment(
  exec: Database,
  input: { orderId: string; token?: string; sessionCustomerId?: string; method?: PaymentMethod },
) {
  const order = input.token
    ? await getOrderRowByToken(exec, input.token)
    : await getOrderRowById(exec, input.orderId);
  if (!order) throw new AppError('NOT_FOUND', 'Order tidak ditemukan.');
  if (input.sessionCustomerId && order.customerId !== input.sessionCustomerId) {
    throw new AppError('NOT_FOUND', 'Order tidak ditemukan pada sesi ini.');
  }
  if (order.status !== 'pending_payment') {
    throw new AppError('INVALID_STATE', 'Tagihan hanya bisa dibuat ulang saat menunggu pembayaran.');
  }
  if (!order.holdExpiresAt || order.holdExpiresAt.getTime() < Date.now()) {
    throw new AppError('INVALID_STATE', 'Hold sudah habis. Silakan buat pesanan baru.', {
      hint: 'Porsi sudah dilepas kembali ke kapasitas.',
    });
  }

  const created = await createPaymentForOrder(exec, order, { method: input.method ?? 'qris' });
  await recordAudit(exec, {
    actor: { type: 'customer', id: order.customerId, label: 'Pelanggan' },
    entity: 'order',
    entityId: order.id,
    action: 'payment_retry',
    after: { orderNo: order.orderNo, gatewayRef: created.payment.gatewayRef, method: created.payment.method },
  });
  return created;
}

/* ── order manual / PO dari admin ────────────────────────────────────── */

export async function createAdminOrder(
  exec: Database,
  input: AdminCreateOrderInput,
  actor: { id: string; label: string },
): Promise<CreatedOrderDto> {
  const customer = await ensureCustomer(exec, {
    name: input.customerName,
    phone: input.customerPhone,
    email: input.customerEmail || null,
  });

  await ensureDay(exec, input.serviceDate);
  const menuIds = [...new Set(input.items.map((item) => item.menuItemId))];
  const catalog = await getMenuItemsByIds(exec, menuIds);
  const byId = new Map(catalog.map((item) => [item.id, item]));

  const lines = input.items.map((item) => {
    const product = byId.get(item.menuItemId);
    if (!product) throw new AppError('VALIDATION_ERROR', 'Hidangan tidak ditemukan.');
    return {
      menuItemId: product.id,
      nameSnapshot: product.name,
      unitPrice: product.price,
      portions: item.portions,
      lineTotal: product.price * item.portions,
    };
  });

  const portions = lines.reduce((sum, line) => sum + line.portions, 0);
  if (portions <= 0) throw new AppError('VALIDATION_ERROR', 'Jumlah porsi harus lebih dari 0.');
  const subtotal = lines.reduce((sum, line) => sum + line.lineTotal, 0);
  const hold = input.paymentMethod !== 'cash';
  const token = deriveStatusToken(`admin:${randomToken(12)}`);

  const order = await withTransaction(exec, async (tx) => {
    return createPendingOrder(tx, {
      customerId: customer.id,
      serviceDate: input.serviceDate,
      source: input.source,
      statusToken: token,
      items: lines,
      portions,
      subtotal,
      deliveryFee: 0,
      total: subtotal,
      deliveryWindowId: input.windowId ?? null,
      addressLine: input.addressLine,
      district: input.district ?? null,
      recipientName: input.customerName,
      recipientPhone: customer.phone,
      notes: input.notes ?? null,
      consentAt: new Date(),
      createdIp: null,
      hold,
      partition: input.source === 'po' ? 'po' : 'regular',
      holdMinutes: 60,
      ignoreCutoff: true,
    });
  });

  if (!hold) {
    const createdPayment = await createPaymentForOrder(exec, order, { method: 'cash' });
    await markPaymentPaid(exec, createdPayment.payment.id, { paidAt: new Date() });
    await recordAudit(exec, {
      actor: { type: 'staff', id: actor.id, label: actor.label },
      entity: 'payment',
      entityId: createdPayment.payment.id,
      action: 'cash_payment_recorded',
      after: { orderNo: order.orderNo, amount: order.total },
    });
  }

  await recordAudit(exec, {
    actor: { type: 'staff', id: actor.id, label: actor.label },
    entity: 'order',
    entityId: order.id,
    action: 'order_created_admin',
    after: { orderNo: order.orderNo, source: input.source, portions, total: order.total },
  });

  const payment = await getLatestPaymentForOrder(exec, order.id);
  return {
    order: await buildOrderDto(exec, order),
    statusToken: token,
    statusUrl: statusUrl(token),
    paymentInstructions: payment ? toInstructionsDto(payment) : null,
  };
}

/** Dipakai halaman status: pastikan token hanya mengakses order miliknya. */
export async function requireOrderByTokenForCustomer(
  exec: Executor,
  token: string,
  customerId: string,
): Promise<OrderRow> {
  const order = await getOrderRowByToken(exec, token);
  if (!order || order.customerId !== customerId) {
    throw new AppError('NOT_FOUND', 'Order tidak ditemukan.');
  }
  return order;
}

/**
 * Replay idempotensi tanpa menyentuh CAPTCHA/rate limit: permintaan yang
 * sama persis dengan kunci yang sama harus mengembalikan hasil yang sama,
 * bukan error karena token CAPTCHA sudah terpakai.
 */
export async function replayIdempotentOrder(
  exec: Executor,
  input: CreateOrderInput,
  idempotencyKey: string,
): Promise<CreatedOrderDto | null> {
  const existing = await getIdempotencyRecord(exec, idempotencyKey);
  if (!existing) return null;

  const requestHash = requestHashOf(input);
  if (existing.requestHash !== requestHash) {
    throw new AppError(
      'IDEMPOTENCY_CONFLICT',
      'Kunci idempotensi ini sudah dipakai untuk permintaan yang berbeda.',
      { hint: 'Gunakan Idempotency-Key baru untuk pemesanan baru.' },
    );
  }

  if (existing.response) return existing.response as unknown as CreatedOrderDto;
  if (existing.orderId) {
    const order = await getOrderRowById(exec, existing.orderId);
    if (order) {
      const payment = await getLatestPaymentForOrder(exec, order.id);
      const token = deriveStatusToken(idempotencyKey);
      return {
        order: await buildOrderDto(exec, order),
        statusToken: token,
        statusUrl: statusUrl(token),
        paymentInstructions: payment ? toInstructionsDto(payment) : null,
      };
    }
  }
  throw new AppError('IDEMPOTENCY_CONFLICT', 'Permintaan dengan kunci ini sedang diproses.', {
    hint: 'Tunggu sebentar lalu cek status pesanan Anda.',
  });
}
