import type {
  DeliveryStatus,
  MenuCategory,
  OrderSource,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  RefundChannel,
  RefundStatus,
  StaffRole,
} from './enums';

/** Amplop sukses API v1: `{ data: ... }`. */
export interface ApiSuccess<T> {
  data: T;
}

export interface Paginated<T> {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
}

/* ── katalog ─────────────────────────────────────────────────────────── */

export interface MenuItemDto {
  id: string;
  slug: string;
  name: string;
  description: string;
  category: MenuCategory;
  unitLabel: string;
  price: number;
  imageUrl: string | null;
  isAvailable: boolean;
  /** Sisa porsi partisi reguler pada tanggal ini (indikator, bukan janji). */
  portionsRemaining: number | null;
}

export interface AdminMenuItemDto extends MenuItemDto {
  isActive: boolean;
  /** Jumlah tanggal dalam jadwal aktif untuk hidangan ini. */
  scheduleCount: number;
}

export interface MenuAvailabilityItemDto extends MenuItemDto {
  /** true bila menu dijadwalkan (boleh tampil) pada tanggal ini. */
  isScheduled: boolean;
}

export interface MenuDayDto {
  date: string;
  isOpen: boolean;
  cutoffAt: string;
  cutoffPassed: boolean;
  targetMin: number;
  items: MenuItemDto[];
}

/* ── ketersediaan ────────────────────────────────────────────────────── */

export interface DeliveryWindowDto {
  id: string | null;
  label: string;
  startTime: string;
  endTime: string;
  maxStops: number;
  stopsUsed: number;
  remainingStops: number;
}

export interface DayAvailabilityDto {
  date: string;
  isOpen: boolean;
  cutoffAt: string;
  cutoffPassed: boolean;
  remainingRegular: number;
  remainingPo: number;
  orderedPortions: number;
  targetMin: number;
  maxRegular: number;
  maxPo: number;
  windows: DeliveryWindowDto[];
}

export interface AvailabilityDto {
  today: string;
  minPortions: number;
  maxPortionsPerOrder: number;
  holdMinutes: number;
  deliveryFee: number;
  days: DayAvailabilityDto[];
}

/* ── sesi tamu & zona ────────────────────────────────────────────────── */

export interface CustomerDto {
  id: string;
  name: string;
  phone: string;
  email: string | null;
}

export interface SessionDto {
  customer: CustomerDto;
  expiresAt: string;
  location: { address?: string; district?: string; lat?: number; lng?: number } | null;
}

export interface ServiceZoneDto {
  id: string;
  name: string;
  city: string;
  fee: number;
  freeDelivery: boolean;
  etaNote: string | null;
}

export interface ServiceAreaDto {
  inZone: boolean;
  zone: ServiceZoneDto | null;
  deliveryFee: number;
  message: string;
}

/* ── order ───────────────────────────────────────────────────────────── */

export interface OrderItemDto {
  menuItemId: string;
  name: string;
  portions: number;
  unitPrice: number;
  lineTotal: number;
}

export interface PaymentInstructionsDto {
  gatewayRef: string;
  method: PaymentMethod;
  amount: number;
  expiresAt: string;
  /** QRIS payload / nomor VA / kode bayar. */
  reference: string;
  instructions: string;
}

export interface PaymentDto {
  id: string;
  gatewayRef: string;
  method: PaymentMethod;
  status: PaymentStatus;
  amount: number;
  paidAt: string | null;
  expiresAt: string;
  reference: string | null;
}

export interface OrderTimelineEntryDto {
  status: OrderStatus | 'note';
  at: string;
  note: string | null;
}

export interface OrderDto {
  id: string;
  orderNo: string;
  status: OrderStatus;
  source: OrderSource;
  serviceDate: string;
  portions: number;
  subtotal: number;
  deliveryFee: number;
  total: number;
  holdExpiresAt: string | null;
  createdAt: string;
  paidAt: string | null;
  customer: CustomerDto;
  items: OrderItemDto[];
  delivery: {
    windowLabel: string | null;
    addressLine: string;
    district: string | null;
    status: DeliveryStatus | null;
  };
  payment: PaymentDto | null;
  notes: string | null;
  timeline: OrderTimelineEntryDto[];
}

export interface CreatedOrderDto {
  order: OrderDto;
  /** Hanya dikembalikan sekali; server menyimpan hash-nya. */
  statusToken: string;
  statusUrl: string;
  paymentInstructions: PaymentInstructionsDto | null;
}

/* ── refund ──────────────────────────────────────────────────────────── */

export interface RefundDto {
  id: string;
  orderNo: string;
  amount: number;
  channel: RefundChannel;
  status: RefundStatus;
  reason: string;
  createdAt: string;
  completedAt: string | null;
}

/* ── admin ───────────────────────────────────────────────────────────── */

export interface StaffDto {
  id: string;
  name: string;
  email: string;
  role: StaffRole;
}

export interface AdminSessionDto {
  user: StaffDto;
}

export interface AdminOrderRowDto {
  id: string;
  orderNo: string;
  status: OrderStatus;
  source: OrderSource;
  serviceDate: string;
  customerName: string;
  customerPhone: string;
  portions: number;
  total: number;
  windowLabel: string | null;
  createdAt: string;
  holdExpiresAt: string | null;
  paidAt: string | null;
}

export interface DaySummaryDto {
  date: string;
  maxRegular: number;
  maxPo: number;
  reservedRegular: number;
  reservedPo: number;
  heldRegular: number;
  heldPo: number;
  orderedPortions: number;
  targetMin: number;
  kitchenMaxTotal: number;
  holdCeiling: number;
  isOpen: boolean;
  cutoffAt: string;
  cutoffPassed: boolean;
}

export interface AdminOrdersDto extends Paginated<AdminOrderRowDto> {
  capacity: DaySummaryDto | null;
}

export interface DaySettingsDto extends DaySummaryDto {
  windows: DeliveryWindowDto[];
}

export interface ProductionItemDto {
  menuItemId: string;
  name: string;
  category: MenuCategory;
  portions: number;
}

export interface ProductionSummaryDto {
  date: string;
  locked: boolean;
  lockedAt: string | null;
  targetMin: number;
  totalPortions: number;
  items: ProductionItemDto[];
  windows: DeliverableWindowDto[];
  notes: ProductionNoteDto[];
}

export interface DeliverableWindowDto {
  label: string;
  startTime: string;
  endTime: string;
  orderCount: number;
  portions: number;
}

export interface ProductionNoteDto {
  orderNo: string;
  note: string;
}

export interface AuditEntryDto {
  id: string;
  at: string;
  actorType: 'staff' | 'customer' | 'system' | 'webhook';
  actorLabel: string;
  entity: string;
  entityId: string;
  action: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  orderNo: string | null;
}

export interface InternalNoteDto {
  id: string;
  staffName: string;
  body: string;
  createdAt: string;
}

export interface AdminOrderDetailDto {
  order: OrderDto;
  internalNotes: InternalNoteDto[];
  refunds: RefundDto[];
}

export interface DailyOverviewDto {
  date: string;
  orders: number;
  portions: number;
  revenue: number;
}

/** Ringkasan satu bulan penuh untuk dashboard (default: bulan berjalan). */
export interface MonthOverviewDto {
  month: string;
  from: string;
  to: string;
  totalOrders: number;
  totalPortions: number;
  /** Pendapatan dari order yang sudah dibayar/diproses (bukan pending/batal). */
  totalRevenue: number;
  /** Nilai seluruh order pada bulan tersebut, termasuk yang belum dibayar. */
  grossOrderValue: number;
  paidOrders: number;
  pendingOrders: number;
  cancelledOrders: number;
  statusCounts: Partial<Record<OrderStatus, number>>;
  daily: DailyOverviewDto[];
}

export interface CustomerOrderSummaryDto {
  orderNo: string;
  serviceDate: string;
  status: OrderStatus;
  portions: number;
  total: number;
  createdAt: string;
  holdExpiresAt: string | null;
  /** Token bertanda tangan (berlaku 30 menit) untuk membuka halaman status. */
  viewToken: string;
}

export interface CustomerOrdersDto {
  orders: CustomerOrderSummaryDto[];
}

export interface OrderSettingsDto {
  minPortions: number;
  maxPortionsPerOrder: number;
  holdMinutes: number;
}

export interface AdminStatsDto {
  date: string;
  capacity: DaySummaryDto;
  orderCount: number;
  paidCount: number;
  expiredCount: number;
  pendingCount: number;
  revenue: number;
  activeHolds: number;
  deliveryStops: number;
}

export interface QuoteRequestDto {
  id: string;
  status: 'new' | 'contacted' | 'won' | 'lost';
  name: string;
  phone: string;
  company: string | null;
  serviceDate: string;
  portions: number;
  createdAt: string;
}

export interface HealthDto {
  status: 'ok' | 'degraded';
  role: 'web' | 'worker';
  db: 'ok' | 'down';
  time: string;
  version: string;
}

export interface OrderStatusLookupDto {
  order: OrderDto;
  statusUrl: string | null;
}

export interface OtpRequestDto {
  channel: 'whatsapp' | 'sms';
  expiresAt: string;
  /** Hanya pada non-production agar QA bisa menguji tanpa WA. */
  devCode?: string;
}

export interface CaptchaVerifiedDto {
  token: string;
  expiresAt: string;
}
