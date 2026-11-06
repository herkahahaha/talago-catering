import { Hono } from 'hono';
import { getCookie } from 'hono/cookie';
import {
  adminCompleteRefundSchema,
  adminCreateOrderSchema,
  adminMenuAvailabilitySchema,
  adminMenuCreateSchema,
  adminMenuUpdateSchema,
  adminDayUpdateSchema,
  adminOrderSettingsSchema,
  adminLoginSchema,
  adminNoteSchema,
  adminOrdersQuerySchema,
  adminUpdateOrderStatusSchema,
  dateSchema,
  monthQuerySchema,
  productionQuerySchema,
  refundStatusSchema,
} from '@catering/contracts';
import {
  AppError,
  addInternalNote,
  archiveMenuItem,
  assertRateLimit,
  assertRole,
  cancelOrder,
  completeRefund,
  createAdminOrder,
  createMenuItem,
  ensureMinimumHoldCeiling,
  getAdminOrderDetail,
  getAdminStats,
  getDaySettings,
  getMonthOverview,
  getOrderConfig,
  getOrderDtoById,
  getMenuAvailabilityForDate,
  getProductionSummary,
  getRefundDtosForOrder,
  setMenuAvailabilityForDate,
  listAdminMenuItems,
  listAdminOrders,
  listAudit,
  listQuotations,
  listRefunds,
  loginStaff,
  logoutStaff,
  startOfWibDay,
  endOfWibDay,
  todayWib,
  updateDay,
  updateMenuItem,
  updateOrderSettings,
  updateOrderStatusAdmin,
  updateWeek,
} from '@catering/core';
import type { AppEnv } from '../types';
import { clearStaffCookie, requireStaff, setStaffCookie } from '../lib/session';
import { ok, parseBody, parseQuery, requestId, requestIp } from '../lib/http';

export function adminRoutes(): Hono<AppEnv> {
  const admin = new Hono<AppEnv>();

  // Rate limit login per IP sebelum middleware sesi.
  admin.post('/auth/login', async (c) => {
    const db = c.get('db');
    const ip = requestIp(c);
    await assertRateLimit(
      db,
      { key: `admin:login:${ip}`, limit: 10, windowSeconds: 60 },
      'Terlalu banyak percobaan login. Tunggu satu menit.',
    );
    const input = await parseBody(c, adminLoginSchema);
    const { token, session } = await loginStaff(db, input, {
      ip,
      userAgent: c.req.header('user-agent') ?? null,
    });
    setStaffCookie(c, token);
    return ok(c, { user: session.user });
  });

  admin.post('/auth/logout', async (c) => {
    const token = getCookie(c, 'cg_staff');
    if (token) await logoutStaff(c.get('db'), token);
    clearStaffCookie(c);
    return ok(c, { loggedOut: true });
  });

  admin.use('*', async (c, next) => {
    if (c.req.method === 'OPTIONS') return next();
    const db = c.get('db');
    const staff = await requireStaff(c, db);
    await assertRateLimit(db, { key: `staff:${staff.user.id}`, limit: 300, windowSeconds: 60 });
    await next();
  });

  admin.get('/auth/me', async (c) => {
    const staff = await requireStaff(c, c.get('db'));
    return ok(c, { user: staff.user });
  });

  admin.get('/overview', async (c) => {
    const db = c.get('db');
    await requireStaff(c, db);
    const { month } = parseQuery(c, monthQuerySchema);
    return ok(c, await getMonthOverview(db, month));
  });

  admin.get('/orders', async (c) => {
    const db = c.get('db');
    const query = parseQuery(c, adminOrdersQuerySchema);
    return ok(c, await listAdminOrders(db, query));
  });

  admin.get('/orders/:id', async (c) => {
    const db = c.get('db');
    const id = c.req.param('id');
    const [detail, refunds] = await Promise.all([getAdminOrderDetail(db, id), getRefundDtosForOrder(db, id)]);
    return ok(c, { ...detail, refunds });
  });

  admin.patch('/orders/:id/status', async (c) => {
    const db = c.get('db');
    const staff = await requireStaff(c, db);
    const input = await parseBody(c, adminUpdateOrderStatusSchema);
    const updated = await updateOrderStatusAdmin(db, {
      orderId: c.req.param('id'),
      status: input.status,
      ...(input.note ? { note: input.note } : {}),
      actor: { id: staff.user.id, label: staff.user.name, role: staff.user.role },
      requestId: requestId(c),
    });
    return ok(c, await getOrderDtoById(db, updated.id));
  });

  admin.post('/orders', async (c) => {
    const db = c.get('db');
    const staff = await requireStaff(c, db);
    assertRole(staff.user, ['admin']);
    const input = await parseBody(c, adminCreateOrderSchema);
    const created = await createAdminOrder(db, input, {
      id: staff.user.id,
      label: staff.user.name,
    });
    return ok(c, created, 201);
  });

  admin.post('/orders/:id/notes', async (c) => {
    const db = c.get('db');
    const staff = await requireStaff(c, db);
    const input = await parseBody(c, adminNoteSchema);
    const note = await addInternalNote(
      db,
      c.req.param('id'),
      { id: staff.user.id, label: staff.user.name },
      input.body,
    );
    return ok(c, note, 201);
  });

  admin.post('/orders/:id/cancel', async (c) => {
    const db = c.get('db');
    const staff = await requireStaff(c, db);
    assertRole(staff.user, ['admin']);
    const body = await c.req.json().catch(() => ({}));
    const reason =
      typeof body?.reason === 'string' && body.reason.trim().length > 0
        ? body.reason.trim().slice(0, 300)
        : 'Dibatalkan admin';
    const updated = await cancelOrder(db, {
      orderId: c.req.param('id'),
      actor: { type: 'staff', id: staff.user.id, label: staff.user.name },
      reason,
      byAdmin: true,
      requestId: requestId(c),
    });
    return ok(c, await getOrderDtoById(db, updated.id));
  });

  admin.get('/days/:date', async (c) => {
    const db = c.get('db');
    const date = dateSchema.parse(c.req.param('date'));
    return ok(c, await getDaySettings(db, date));
  });

  admin.put('/days/:date', async (c) => {
    const db = c.get('db');
    const staff = await requireStaff(c, db);
    assertRole(staff.user, ['admin']);
    const date = dateSchema.parse(c.req.param('date'));
    const input = await parseBody(c, adminDayUpdateSchema);
    return ok(c, await updateDay(db, date, input, { id: staff.user.id, label: staff.user.name }));
  });

  admin.get('/settings/order', async (c) => {
    const db = c.get('db');
    await requireStaff(c, db);
    return ok(c, await getOrderConfig(db));
  });

  admin.put('/settings/order', async (c) => {
    const db = c.get('db');
    const staff = await requireStaff(c, db);
    assertRole(staff.user, ['admin']);
    const input = await parseBody(c, adminOrderSettingsSchema);
    const updated = await updateOrderSettings(db, input, {
      id: staff.user.id,
      label: staff.user.name,
    });
    const adjusted = await ensureMinimumHoldCeiling(db, updated.maxPortionsPerOrder);
    return ok(c, { ...updated, adjustedHoldCeilings: adjusted });
  });

  admin.put('/days/week/:date', async (c) => {
    const db = c.get('db');
    const staff = await requireStaff(c, db);
    assertRole(staff.user, ['admin']);
    const date = dateSchema.parse(c.req.param('date'));
    const input = await parseBody(c, adminDayUpdateSchema);
    const days = await updateWeek(db, date, input, { id: staff.user.id, label: staff.user.name });
    return ok(c, days);
  });

  admin.get('/days/:date/menu', async (c) => {
    const db = c.get('db');
    await requireStaff(c, db);
    const date = dateSchema.parse(c.req.param('date'));
    return ok(c, await getMenuAvailabilityForDate(db, date));
  });

  admin.put('/days/:date/menu', async (c) => {
    const db = c.get('db');
    const staff = await requireStaff(c, db);
    assertRole(staff.user, ['admin']);
    const date = dateSchema.parse(c.req.param('date'));
    const input = await parseBody(c, adminMenuAvailabilitySchema);
    const result = await setMenuAvailabilityForDate(db, date, input.items, {
      id: staff.user.id,
      label: staff.user.name,
    });
    return ok(c, result);
  });

  admin.get('/production', async (c) => {
    const db = c.get('db');
    const staff = await requireStaff(c, db);
    assertRole(staff.user, ['admin', 'kitchen']);
    const { date } = parseQuery(c, productionQuerySchema.partial());
    return ok(c, await getProductionSummary(db, date ?? todayWib()));
  });

  admin.get('/stats', async (c) => {
    const db = c.get('db');
    const staff = await requireStaff(c, db);
    assertRole(staff.user, ['admin', 'kitchen']);
    const { date } = parseQuery(c, productionQuerySchema.partial());
    return ok(c, await getAdminStats(db, date ?? todayWib()));
  });

  admin.get('/refunds', async (c) => {
    const db = c.get('db');
    const staff = await requireStaff(c, db);
    assertRole(staff.user, ['admin']);
    const status = c.req.query('status');
    const filter = status ? { status: refundStatusSchema.parse(status) } : {};
    return ok(c, await listRefunds(db, filter));
  });

  admin.post('/refunds/:id/complete', async (c) => {
    const db = c.get('db');
    const staff = await requireStaff(c, db);
    assertRole(staff.user, ['admin']);
    const input = await parseBody(c, adminCompleteRefundSchema);
    const refund = await completeRefund(db, c.req.param('id'), input, {
      id: staff.user.id,
      label: staff.user.name,
    });
    return ok(c, refund);
  });

  admin.get('/audit', async (c) => {
    const db = c.get('db');
    const staff = await requireStaff(c, db);
    assertRole(staff.user, ['admin']);
    const date = c.req.query('date') ?? todayWib();
    const entity = c.req.query('entity');
    const limit = Math.min(Number(c.req.query('limit') ?? 100) || 100, 500);
    const entries = await listAudit(db, {
      fromDate: startOfWibDay(dateSchema.parse(date)),
      toDate: endOfWibDay(dateSchema.parse(date)),
      ...(entity ? { entity } : {}),
      limit,
    });
    return ok(c, entries);
  });

  admin.get('/quotations', async (c) => {
    const db = c.get('db');
    const staff = await requireStaff(c, db);
    assertRole(staff.user, ['admin']);
    return ok(c, await listQuotations(db));
  });

  admin.get('/catalog', async (c) => {
    const db = c.get('db');
    await requireStaff(c, db);
    return ok(c, await listAdminMenuItems(db));
  });

  admin.post('/menu', async (c) => {
    const db = c.get('db');
    const staff = await requireStaff(c, db);
    assertRole(staff.user, ['admin']);
    const input = await parseBody(c, adminMenuCreateSchema);
    const item = await createMenuItem(db, input, { id: staff.user.id, label: staff.user.name });
    return ok(c, item, 201);
  });

  admin.patch('/menu/:id', async (c) => {
    const db = c.get('db');
    const staff = await requireStaff(c, db);
    assertRole(staff.user, ['admin']);
    const input = await parseBody(c, adminMenuUpdateSchema);
    const item = await updateMenuItem(db, c.req.param('id'), input, {
      id: staff.user.id,
      label: staff.user.name,
    });
    return ok(c, item);
  });

  admin.delete('/menu/:id', async (c) => {
    const db = c.get('db');
    const staff = await requireStaff(c, db);
    assertRole(staff.user, ['admin']);
    const item = await archiveMenuItem(db, c.req.param('id'), {
      id: staff.user.id,
      label: staff.user.name,
    });
    return ok(c, item);
  });

  admin.get('/orders/:id/refunds', async (c) => {
    const db = c.get('db');
    const staff = await requireStaff(c, db);
    assertRole(staff.user, ['admin']);
    return ok(c, await getRefundDtosForOrder(db, c.req.param('id')));
  });

  admin.get('/me', async (c) => {
    const staff = await requireStaff(c, c.get('db'));
    return ok(c, { user: staff.user });
  });

  admin.notFound(() => {
    throw new AppError('NOT_FOUND', 'Rute admin tidak ditemukan.');
  });

  return admin;
}
