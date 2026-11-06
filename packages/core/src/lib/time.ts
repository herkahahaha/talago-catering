/** Tanggal layanan selalu "tanggal kalender WIB" (YYYY-MM-DD), bukan instant. */

export const WIB_TZ = 'Asia/Jakarta';
export const WIB_OFFSET = '+07:00'; // WIB tidak memakai DST.

const dateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: WIB_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Tanggal kalender WIB untuk instant tertentu. */
export function todayWib(now: Date = new Date()): string {
  return dateFormatter.format(now);
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function diffDays(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

export function isDateString(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

/**
 * Cut-off default: H-1 pukul 18.00 WIB (PRD §2 butir 5).
 * Dikembalikan sebagai instant dengan offset +07:00 agar PostgreSQL
 * menyimpannya sebagai timestamptz yang tepat.
 */
export function defaultCutoffAt(serviceDate: string, hour = 18, minute = 0): Date {
  const previousDay = addDays(serviceDate, -1);
  const hh = String(hour).padStart(2, '0');
  const mm = String(minute).padStart(2, '0');
  return new Date(`${previousDay}T${hh}:${mm}:00${WIB_OFFSET}`);
}

export function cutoffAtFromParts(serviceDate: string, time: string): Date {
  const [hh = '18', mm = '00'] = time.split(':');
  return defaultCutoffAt(serviceDate, Number(hh), Number(mm));
}

export function startOfWibDay(date: string): Date {
  return new Date(`${date}T00:00:00${WIB_OFFSET}`);
}

export function endOfWibDay(date: string): Date {
  return new Date(`${date}T23:59:59.999${WIB_OFFSET}`);
}

const dateTimeFormatter = new Intl.DateTimeFormat('id-ID', {
  timeZone: WIB_TZ,
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

export function formatWibDateTime(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return null;
  return `${dateTimeFormatter.format(d)} WIB`;
}

export function formatWibDate(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: WIB_TZ,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(d);
}

export function isBefore(instant: Date, reference: Date = new Date()): boolean {
  return instant.getTime() < reference.getTime();
}

export function minutesBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / 60_000);
}

/** Senin sebagai awal minggu (kalender WIB). */
export function startOfWeek(date: string): string {
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay(); // 0 = Minggu
  const offset = (weekday + 6) % 7;
  return addDays(date, -offset);
}

/** Tujuh tanggal Senin–Minggu yang memuat tanggal acuan. */
export function weekDates(date: string): string[] {
  const start = startOfWeek(date);
  return Array.from({ length: 7 }, (_, index) => addDays(start, index));
}

export function dateRange(from: string, days: number): string[] {
  return Array.from({ length: days }, (_, i) => addDays(from, i));
}

export function toDateOnlyWib(instant: Date): string {
  return dateFormatter.format(instant);
}
