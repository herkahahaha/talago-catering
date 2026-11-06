import { Hono } from 'hono';
import {
  availabilityQuerySchema,
  cancelOrderSchema,
  createOrderSchema,
  createSessionSchema,
  menuQuerySchema,
  orderLookupSchema,
  paymentRetrySchema,
  quotationRequestSchema,
  requestOtpSchema,
  serviceAreaQuerySchema,
  verifyOtpSchema,
} from '@catering/contracts';
import {
  AppError,
  assertRateLimit,
  cancelOrder,
  countActiveHolds,
  createCaptchaChallenge,
  createGuestOrder,
  createGuestSession,
  createQuotationRequest,
  ensureDay,
  getAvailability,
  getEnv,
  getOrderDtoById,
  getOrderDtoByToken,
  getOrderRowByToken,
  getSettingsMap,
  handlePaymentWebhook,
  listCustomerOrders,
  listMenuForDate,
  lookupCustomerOrders,
  markSessionOtpVerified,
  requestOtp,
  resolveServiceArea,
  replayIdempotentOrder,
  retryOrderPayment,
  settleMockPayment,
  toPaymentDto,
  todayWib,
  verifyCaptchaToken,
  verifyOtp,
} from '@catering/core';
import type { AppEnv } from '../types';
import { currentGuest, requireGuest, setGuestCookie } from '../lib/session';
import { ok, parseBody, parseQuery, requestId, requestIp } from '../lib/http';

export function publicRoutes(): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();
  const env = getEnv();

  routes.post('/sessions', async (c) => {
    const db = c.get('db');
    const input = await parseBody(c, createSessionSchema);
    const ip = requestIp(c);
    await assertRateLimit(db, { key: `session:ip:${ip}`, limit: 20, windowSeconds: 600 });
    const result = await createGuestSession(db, input, {
      ip,
      userAgent: c.req.header('user-agent') ?? null,
    });
    setGuestCookie(c, result.token);
    return ok(c, result.session, 201);
  });

  routes.get('/service-area', async (c) => {
    const query = parseQuery(c, serviceAreaQuerySchema);
    const area = await resolveServiceArea(c.get('db'), query);
    return ok(c, area);
  });

  routes.get('/menu', async (c) => {
    const db = c.get('db');
    const { date } = parseQuery(c, menuQuerySchema);
    const serviceDate = date ?? todayWib();
    const day = await ensureDay(db, serviceDate);
    const remaining = Math.max(day.maxRegular - day.reservedRegular, 0);
    const items = await listMenuForDate(db, serviceDate, remaining);
    return ok(c, {
      date: serviceDate,
      isOpen: day.isOpen,
      cutoffAt: day.cutOffAt.toISOString(),
      cutoffPassed: day.cutOffAt.getTime() <= Date.now(),
      targetMin: day.targetMin,
      items,
    });
  });

  routes.get('/availability', async (c) => {
    const db = c.get('db');
    const query = parseQuery(c, availabilityQuerySchema);
    return ok(c, await getAvailability(db, query));
  });

  routes.post('/captcha', async (c) => {
    const challenge = await createCaptchaChallenge(c.get('db'), requestIp(c));
    return ok(c, challenge, 201);
  });

  routes.post('/orders', async (c) => {
    const db = c.get('db');
    const session = await requireGuest(c, db);
    const idempotencyKey = c.req.header('idempotency-key')?.trim();
    if (!idempotencyKey || idempotencyKey.length < 8 || idempotencyKey.length > 128) {
      throw new AppError('VALIDATION_ERROR', 'Header Idempotency-Key wajib diisi (8–128 karakter).', {
        hint: 'Gunakan UUID acak per percobaan checkout.',
      });
    }

    const input = await parseBody(c, createOrderSchema);
    // Replay harus berhasil walau CAPTCHA pada permintaan pertama sudah terpakai.
    const replay = await replayIdempotentOrder(db, input, idempotencyKey);
    if (replay) return ok(c, replay);
    await verifyCaptchaToken(db, input.captchaToken);

    const ip = requestIp(c);
    const settings = await getSettingsMap(db);
    const perIp = Number(settings['ratelimit.holds_per_ip_per_hour'] ?? 3);
    const perSession = Number(settings['ratelimit.checkout_per_session_per_10min'] ?? 5);
    const activeLimit = Number(settings['ratelimit.active_holds_per_phone'] ?? 1);

    await assertRateLimit(
      db,
      { key: `order:ip:${ip}`, limit: perIp, windowSeconds: 3_600 },
      'Terlalu banyak percobaan pemesanan dari jaringan ini. Coba lagi nanti.',
    );
    await assertRateLimit(db, {
      key: `order:session:${session.sessionId}`,
      limit: perSession,
      windowSeconds: 600,
    });

    const active = await countActiveHolds(db, session.customer.id);
    if (active >= activeLimit) {
      throw new AppError('HOLD_LIMIT', 'Masih ada pesanan yang menunggu pembayaran pada nomor ini.', {
        hint: 'Selesaikan pembayaran sebelumnya, atau tunggu hold-nya kedaluwarsa (10 menit).',
      });
    }

    const result = await createGuestOrder(db, {
      input,
      session,
      idempotencyKey,
      ctx: { ip, userAgent: c.req.header('user-agent') ?? null, requestId: requestId(c) },
    });
    return ok(c, result, 201);
  });

  routes.get('/orders/mine', async (c) => {
    const db = c.get('db');
    const guest = await requireGuest(c, db);
    return ok(c, { orders: await listCustomerOrders(db, guest.customer.id) });
  });

  routes.post('/orders/lookup', async (c) => {
    const db = c.get('db');
    const ip = requestIp(c);
    await assertRateLimit(
      db,
      { key: `lookup:ip:${ip}`, limit: 10, windowSeconds: 600 },
      'Terlalu banyak percobaan pencarian pesanan. Coba lagi beberapa menit lagi.',
    );
    const input = await parseBody(c, orderLookupSchema);
    return ok(c, { orders: await lookupCustomerOrders(db, input) });
  });

  routes.get('/orders/:token', async (c) => {
    const db = c.get('db');
    const token = c.req.param('token');
    const order = await getOrderDtoByToken(db, token);
    return ok(c, { order, statusUrl: `${env.APP_URL.replace(/\/$/, '')}/order/${token}` });
  });

  routes.post('/orders/:id/cancel', async (c) => {
    const db = c.get('db');
    const id = c.req.param('id');
    const token = c.req.query('token');
    const body = await c.req.json().catch(() => ({}));
    const input = cancelOrderSchema.parse(body ?? {});
    const reason = input.reason ?? 'Dibatalkan pelanggan';

    const session = await currentGuest(c, db);
    if (token) {
      const order = await getOrderRowByToken(db, token);
      if (!order) throw new AppError('NOT_FOUND', 'Order tidak ditemukan.');
      if (session && order.customerId !== session.customer.id) {
        throw new AppError('NOT_FOUND', 'Order tidak ditemukan pada sesi ini.');
      }
      const updated = await cancelOrder(db, {
        token,
        actor: {
          type: 'customer',
          id: session?.customer.id ?? null,
          label: session?.customer.name ?? 'Pelanggan',
        },
        reason,
        requestId: requestId(c),
      });
      return ok(c, await getOrderDtoById(db, updated.id));
    }

    const guest = await requireGuest(c, db);
    const updated = await cancelOrder(db, {
      orderId: id,
      sessionCustomerId: guest.customer.id,
      actor: { type: 'customer', id: guest.customer.id, label: guest.customer.name },
      reason,
      requestId: requestId(c),
    });
    return ok(c, await getOrderDtoById(db, updated.id));
  });

  routes.post('/orders/:id/payment-retry', async (c) => {
    const db = c.get('db');
    const id = c.req.param('id');
    const token = c.req.query('token');
    const body = await c.req.json().catch(() => ({}));
    const input = paymentRetrySchema.parse(body ?? {});
    const session = await currentGuest(c, db);

    const created = await retryOrderPayment(db, {
      orderId: id,
      ...(token ? { token } : {}),
      ...(session ? { sessionCustomerId: session.customer.id } : {}),
      ...(input.method ? { method: input.method } : {}),
    });

    return ok(c, {
      payment: toPaymentDto(created.payment),
      paymentInstructions: created.instructions,
    });
  });

  routes.post('/auth/otp', async (c) => {
    const db = c.get('db');
    const input = await parseBody(c, requestOtpSchema);
    const ip = requestIp(c);
    const result = await requestOtp(db, input, { ip });
    return ok(c, result, 201);
  });

  routes.post('/auth/verify', async (c) => {
    const db = c.get('db');
    const input = await parseBody(c, verifyOtpSchema);
    await verifyOtp(db, input);
    const session = await currentGuest(c, db);
    if (session) await markSessionOtpVerified(db, session.sessionId);
    return ok(c, { verified: true });
  });

  routes.post('/quotes', async (c) => {
    const db = c.get('db');
    const input = await parseBody(c, quotationRequestSchema);
    const ip = requestIp(c);
    await assertRateLimit(db, { key: `quote:ip:${ip}`, limit: 5, windowSeconds: 3_600 });
    const quote = await createQuotationRequest(db, input);
    return ok(c, quote, 201);
  });

  routes.post('/webhooks/payment', async (c) => {
    const rawBody = await c.req.text();
    const signature = c.req.header('x-payment-signature') ?? null;
    const result = await handlePaymentWebhook(c.get('db'), { rawBody, signature });
    return ok(c, { received: true, outcome: result.outcome });
  });

  // Hanya tersedia di luar production; dipakai halaman status mode mock.
  routes.post('/dev/payments/:gatewayRef/settle', async (c) => {
    if (env.NODE_ENV === 'production') {
      throw new AppError('FORBIDDEN', 'Tidak tersedia di production.');
    }
    const result = await settleMockPayment(c.get('db'), c.req.param('gatewayRef'));
    return ok(c, { received: true, outcome: result.outcome });
  });

  return routes;
}
