import { z } from 'zod';
import {
  DELIVERY_STATUSES,
  MENU_CATEGORIES,
  ORDER_SOURCES,
  ORDER_STATUSES,
  PAYMENT_METHODS,
  PAYMENT_STATUSES,
  REFUND_CHANNELS,
  REFUND_STATUSES,
  STAFF_ROLES,
} from './enums';

/* ─────────────────────────── primitives ─────────────────────────── */

export const phoneSchema = z
  .string()
  .trim()
  .regex(/^(?:\+62|62|0)8[1-9][0-9]{6,11}$/, 'Nomor HP tidak valid (contoh: 0812xxxxxxx)');

export const dateSchema = z.iso.date(); // YYYY-MM-DD (tanggal layanan, WIB)
export const isoDateTimeSchema = z.iso.datetime({ offset: true });
export const idSchema = z.uuid();

export const orderStatusSchema = z.enum(ORDER_STATUSES);
export const orderSourceSchema = z.enum(ORDER_SOURCES);
export const paymentMethodSchema = z.enum(PAYMENT_METHODS);
export const paymentStatusSchema = z.enum(PAYMENT_STATUSES);
export const refundStatusSchema = z.enum(REFUND_STATUSES);
export const refundChannelSchema = z.enum(REFUND_CHANNELS);
export const deliveryStatusSchema = z.enum(DELIVERY_STATUSES);
export const staffRoleSchema = z.enum(STAFF_ROLES);
export const menuCategorySchema = z.enum(MENU_CATEGORIES);

/* ─────────────────────────── public: sesi & zona ─────────────────────────── */

export const createSessionSchema = z.object({
  name: z.string().trim().min(2).max(120),
  phone: phoneSchema,
  email: z.union([z.email().max(160), z.literal('')]).optional(),
  consent: z.literal(true),
  location: z
    .object({
      address: z.string().trim().max(500).optional(),
      district: z.string().trim().max(120).optional(),
      lat: z.number().min(-90).max(90).optional(),
      lng: z.number().min(-180).max(180).optional(),
    })
    .optional(),
});
export type CreateSessionInput = z.infer<typeof createSessionSchema>;

export const serviceAreaQuerySchema = z
  .object({
    lat: z.coerce.number().min(-90).max(90).optional(),
    lng: z.coerce.number().min(-180).max(180).optional(),
    district: z.string().trim().max(120).optional(),
  })
  .refine((v) => (v.lat !== undefined && v.lng !== undefined) || !!v.district, {
    message: 'Sertakan lat & lng, atau district',
  });

export const menuQuerySchema = z.object({
  date: dateSchema.optional(),
});

export const availabilityQuerySchema = z.object({
  from: dateSchema.optional(),
  days: z.coerce.number().int().min(1).max(30).default(14),
});

/* ─────────────────────────── CAPTCHA ─────────────────────────── */

export const captchaChallengeResponseSchema = z.object({
  challengeId: z.string(),
  question: z.string(),
  expiresAt: isoDateTimeSchema,
  provider: z.string(),
});
export type CaptchaChallenge = z.infer<typeof captchaChallengeResponseSchema>;

export const captchaVerifySchema = z.object({
  challengeId: z.string().min(8),
  answer: z.string().min(1).max(64),
});

/* ─────────────────────────── order tamu ─────────────────────────── */

export const orderItemInputSchema = z.object({
  menuItemId: idSchema,
  portions: z.number().int().min(1).max(1000),
});

export const deliveryAddressInputSchema = z.object({
  line: z.string().trim().min(5).max(300),
  district: z.string().trim().max(120).optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
});

export const createOrderSchema = z.object({
  serviceDate: dateSchema,
  items: z.array(orderItemInputSchema).min(1).max(30),
  delivery: z.object({
    windowId: idSchema.optional(),
    address: deliveryAddressInputSchema,
    recipientName: z.string().trim().min(2).max(120).optional(),
    recipientPhone: phoneSchema.optional(),
  }),
  paymentMethod: paymentMethodSchema,
  captchaToken: z.string().min(10).max(200),
  notes: z.string().trim().max(500).optional(),
  consent: z.literal(true),
});
export type CreateOrderInput = z.infer<typeof createOrderSchema>;

export const orderTokenParamSchema = z.object({
  token: z.string().min(20).max(200),
});

export const cancelOrderSchema = z.object({
  reason: z.string().trim().max(300).optional(),
});
export type CancelOrderInput = z.infer<typeof cancelOrderSchema>;

export const paymentRetrySchema = z.object({
  method: paymentMethodSchema.optional(),
});

/* ─────────────────────────── webhook pembayaran ─────────────────────────── */

export const webhookPaymentSchema = z.object({
  eventId: z.string().min(6).max(120),
  gatewayRef: z.string().min(6).max(120),
  status: z.enum(['settled', 'failed', 'expired']),
  amount: z.number().int().nonnegative(),
  method: paymentMethodSchema.optional(),
  paidAt: isoDateTimeSchema.optional(),
});
export type WebhookPaymentInput = z.infer<typeof webhookPaymentSchema>;

/* ─────────────────────────── OTP adaptif ─────────────────────────── */

export const otpPurposeSchema = z.enum(['account_activation', 'adaptive']);

export const requestOtpSchema = z.object({
  phone: phoneSchema,
  purpose: otpPurposeSchema.default('adaptive'),
});

export const verifyOtpSchema = z.object({
  phone: phoneSchema,
  code: z.string().regex(/^[0-9]{6}$/, 'Kode OTP 6 digit'),
  purpose: otpPurposeSchema.default('adaptive'),
});

/* ─────────────────────────── quotation (fase 2, jalur eskalasi) ─────────────────────────── */

export const quotationRequestSchema = z.object({
  name: z.string().trim().min(2).max(120),
  phone: phoneSchema,
  email: z.union([z.email().max(160), z.literal('')]).optional(),
  company: z.string().trim().max(160).optional(),
  serviceDate: dateSchema,
  portions: z.number().int().min(51).max(2000),
  notes: z.string().trim().max(1000).optional(),
  consent: z.literal(true),
});
export type QuotationRequestInput = z.infer<typeof quotationRequestSchema>;

/* ─────────────────────────── admin: auth ─────────────────────────── */

export const adminLoginSchema = z.object({
  email: z.email().max(160),
  password: z.string().min(8).max(200),
});
export type AdminLoginInput = z.infer<typeof adminLoginSchema>;

/* ─────────────────────────── admin: order ─────────────────────────── */

export const adminOrdersQuerySchema = z
  .object({
    date: dateSchema.optional(),
    /** Rentang tanggal layanan (inklusif). Dipakai dashboard bulanan. */
    from: dateSchema.optional(),
    to: dateSchema.optional(),
    status: orderStatusSchema.optional(),
    source: orderSourceSchema.optional(),
    q: z.string().trim().max(120).optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(25),
  })
  .refine((value) => !(value.date && (value.from || value.to)), {
    message: 'Gunakan date atau from/to, bukan keduanya',
  });

export const monthQuerySchema = z.object({
  month: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Format bulan YYYY-MM')
    .optional(),
});
export type MonthQuery = z.infer<typeof monthQuerySchema>;

/* ─────────────────────────── admin: katalog menu ─────────────────────────── */

export const adminMenuCreateSchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500).default(''),
  category: menuCategorySchema,
  price: z.number().int().min(0).max(10_000_000),
  unitLabel: z.string().trim().min(1).max(20).default('porsi'),
  imageUrl: z.union([z.url().max(500), z.literal('')]).optional(),
  isActive: z.boolean().default(true),
});
export type AdminMenuCreateInput = z.infer<typeof adminMenuCreateSchema>;

export const adminMenuUpdateSchema = adminMenuCreateSchema.partial();
export type AdminMenuUpdateInput = z.infer<typeof adminMenuUpdateSchema>;

/* ─────────────────────────── publik: lacak pesanan ─────────────────────────── */

export const orderLookupSchema = z.object({
  orderNo: z.string().trim().min(6).max(40),
  phone: phoneSchema,
});
export type OrderLookupInput = z.infer<typeof orderLookupSchema>;
export type AdminOrdersQuery = z.infer<typeof adminOrdersQuerySchema>;

export const adminUpdateOrderStatusSchema = z.object({
  status: orderStatusSchema,
  note: z.string().trim().max(300).optional(),
});
export type AdminUpdateOrderStatusInput = z.infer<typeof adminUpdateOrderStatusSchema>;

export const adminCreateOrderSchema = z.object({
  source: z.enum(['po', 'manual']),
  serviceDate: dateSchema,
  customerName: z.string().trim().min(2).max(120),
  customerPhone: phoneSchema,
  customerEmail: z.union([z.email().max(160), z.literal('')]).optional(),
  items: z.array(orderItemInputSchema).min(1).max(30),
  addressLine: z.string().trim().min(5).max(300).default('Ambil di tempat'),
  district: z.string().trim().max(120).optional(),
  windowId: idSchema.optional(),
  notes: z.string().trim().max(1000).optional(),
  paymentMethod: paymentMethodSchema.default('cash'),
});
export type AdminCreateOrderInput = z.infer<typeof adminCreateOrderSchema>;

export const adminNoteSchema = z.object({
  body: z.string().trim().min(2).max(1000),
});

/* ─────────────────────────── admin: aturan checkout (global) ─────────────────────────── */

export const adminOrderSettingsSchema = z
  .object({
    minPortions: z.number().int().min(1).max(5000),
    maxPortionsPerOrder: z.number().int().min(1).max(5000),
    holdMinutes: z.number().int().min(1).max(120),
  })
  .refine((value) => value.minPortions <= value.maxPortionsPerOrder, {
    message: 'Batas maksimal per order tidak boleh lebih kecil dari minimal porsi',
    path: ['maxPortionsPerOrder'],
  });
export type AdminOrderSettingsInput = z.infer<typeof adminOrderSettingsSchema>;

/* ─────────────────────────── admin: pengaturan hari ─────────────────────────── */

export const deliveryWindowInputSchema = z.object({
  id: idSchema.optional(),
  label: z.string().trim().min(2).max(80),
  startTime: z.string().regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/, 'Format HH:mm'),
  endTime: z.string().regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/, 'Format HH:mm'),
  maxStops: z.number().int().min(0).max(1000),
});

export const adminDayUpdateSchema = z.object({
  maxRegular: z.number().int().min(0).max(5000),
  maxPo: z.number().int().min(0).max(5000),
  kitchenMaxTotal: z.number().int().min(1).max(10000),
  targetMin: z.number().int().min(0).max(5000),
  cutOffAt: isoDateTimeSchema,
  isOpen: z.boolean(),
  holdCeiling: z.number().int().min(0).max(5000).optional(),
  windows: z.array(deliveryWindowInputSchema).max(8).default([]),
});
export type AdminDayUpdateInput = z.infer<typeof adminDayUpdateSchema>;

/* ─────────────────────────── admin: refund ─────────────────────────── */

export const adminMenuAvailabilitySchema = z.object({
  items: z
    .array(
      z.object({
        menuItemId: idSchema,
        isAvailable: z.boolean(),
      }),
    )
    .min(1)
    .max(300),
});
export type AdminMenuAvailabilityInput = z.infer<typeof adminMenuAvailabilitySchema>;

export const adminCompleteRefundSchema = z.object({
  channel: refundChannelSchema,
  reference: z.string().trim().max(160).optional(),
  note: z.string().trim().max(500).optional(),
});

/* ─────────────────────────── admin: produksi ─────────────────────────── */

export const productionQuerySchema = z.object({
  date: dateSchema,
});
