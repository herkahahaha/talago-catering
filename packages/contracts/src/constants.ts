import type { OrderStatus } from './enums';

/**
 * Nilai awal dari PRD §2 dan §5. Semua nilai di sini hanyalah *default
 * tampilan*; server selalu membaca nilai efektif dari tabel `settings`
 * dan `daily_capacity` lalu mengirimkannya ke klien.
 */
export const DEFAULTS = {
  maxRegular: 200,
  maxPo: 500,
  kitchenMaxTotal: 1000,
  targetMin: 50,
  minOrderPortions: 50,
  maxOrderPortions: 50,
  holdMinutes: 10,
  holdCeilingRatio: 0.5,
  cutoffHourWib: 18,
  deliveryFee: 0,
  currency: 'IDR',
  timezone: 'Asia/Jakarta',
} as const;

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending_payment: 'Menunggu pembayaran',
  paid: 'Dibayar',
  paid_after_expiry: 'Dibayar setelah kedaluwarsa',
  in_production: 'Diproduksi',
  out_for_delivery: 'Diantar',
  delivered: 'Selesai',
  expired: 'Kedaluwarsa',
  cancelled_refunded: 'Dibatalkan & refund',
};

export const ORDER_STATUS_TONES: Record<OrderStatus, 'amber' | 'blue' | 'green' | 'slate' | 'red'> = {
  pending_payment: 'amber',
  paid: 'blue',
  paid_after_expiry: 'amber',
  in_production: 'blue',
  out_for_delivery: 'blue',
  delivered: 'green',
  expired: 'slate',
  cancelled_refunded: 'red',
};

export const REFUND_STATUS_LABELS = {
  queued: 'Menunggu antrean',
  processing: 'Diproses',
  completed: 'Selesai',
  failed: 'Gagal',
} as const;

export const PAYMENT_STATUS_LABELS = {
  pending: 'Menunggu',
  paid: 'Lunas',
  failed: 'Gagal',
  expired: 'Kedaluwarsa',
  refunded: 'Direfund',
  partially_refunded: 'Direfund sebagian',
} as const;

export const MENU_CATEGORY_LABELS = {
  main: 'Hidangan utama',
  side: 'Pelengkap',
  drink: 'Minuman',
  dessert: 'Pencuci mulut',
  package: 'Paket',
} as const;

export function formatRupiah(amount: number): string {
  const sign = amount < 0 ? '-' : '';
  const abs = Math.abs(Math.trunc(amount));
  const grouped = abs.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${sign}Rp ${grouped}`;
}

export function formatPortions(portions: number): string {
  return `${portions} porsi`;
}
