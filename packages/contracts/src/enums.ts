/**
 * Enum domain yang dipakai bersama oleh API, storefront, dan dashboard.
 * Nilai ini juga menjadi nilai kolom di PostgreSQL, jadi jangan diubah
 * tanpa migrasi data.
 */

export const ORDER_STATUSES = [
  'pending_payment',
  'paid',
  'paid_after_expiry',
  'in_production',
  'out_for_delivery',
  'delivered',
  'expired',
  'cancelled_refunded',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** Status yang masih menahan porsi di partisi tanggalnya. */
export const HOLDING_STATUSES: readonly OrderStatus[] = ['pending_payment'];

/** Status terminal yang sudah melepas porsi. */
export const RESTOCKED_STATUSES: readonly OrderStatus[] = ['expired', 'cancelled_refunded'];

export const ORDER_SOURCES = ['web', 'po', 'manual'] as const;
export type OrderSource = (typeof ORDER_SOURCES)[number];

export const PAYMENT_METHODS = ['qris', 'va', 'cash'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_STATUSES = [
  'pending',
  'paid',
  'failed',
  'expired',
  'refunded',
  'partially_refunded',
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const REFUND_STATUSES = ['queued', 'processing', 'completed', 'failed'] as const;
export type RefundStatus = (typeof REFUND_STATUSES)[number];

export const REFUND_CHANNELS = ['gateway_manual', 'bank_transfer', 'qris'] as const;
export type RefundChannel = (typeof REFUND_CHANNELS)[number];

export const DELIVERY_STATUSES = ['scheduled', 'out_for_delivery', 'delivered', 'failed'] as const;
export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];

export const STAFF_ROLES = ['admin', 'kitchen', 'courier'] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

/** Urutan maju status operasional; koreksi mundur hanya lewat admin + audit. */
export const FORWARD_TRANSITIONS: Record<string, readonly OrderStatus[]> = {
  paid: ['in_production'],
  paid_after_expiry: ['in_production'],
  in_production: ['out_for_delivery'],
  out_for_delivery: ['delivered'],
};

export const MENU_CATEGORIES = ['main', 'side', 'drink', 'dessert', 'package'] as const;
export type MenuCategory = (typeof MENU_CATEGORIES)[number];
