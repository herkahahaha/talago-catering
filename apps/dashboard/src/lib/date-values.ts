import { CalendarDate, CalendarDateTime } from '@internationalized/date';

type YearMonthDay = { year: number; month: number; day: number };

// Konversi antara nilai string yang sudah dipakai route (format sama seperti input native)
// dan objek @internationalized/date yang dipakai Ark UI. Nilai kosong / tidak valid → undefined.

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTH_RE = /^(\d{4})-(\d{2})$/;
const LOCAL_DATETIME_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;
const TIME_RE = /^(\d{2}):(\d{2})(?::(\d{2}))?$/;

// Tanggal placeholder untuk input jam saja (Ark tidak punya komponen time-only).
const TIME_ONLY_ANCHOR = { year: 2000, month: 1, day: 1 } as const;

const pad = (n: number, width = 2) => String(n).padStart(width, '0');

/** Nilai grup regex selalu ada karena pola mewajibkannya; `Number` dipakai agar aman di bawah noUncheckedIndexedAccess. */
const num = (group: string | undefined) => Number(group);

const formatYmd = (d: YearMonthDay) => `${pad(d.year, 4)}-${pad(d.month)}-${pad(d.day)}`;

export function parseDateValue(value: string): CalendarDate | undefined {
  const m = DATE_RE.exec(value);
  return m ? new CalendarDate(num(m[1]), num(m[2]), num(m[3])) : undefined;
}

export function formatDateValue(date: CalendarDate | undefined): string {
  return date ? formatYmd(date) : '';
}

/** Input bulan: `YYYY-MM` → tanggal 1 pada bulan tersebut. */
export function parseMonthValue(value: string): CalendarDate | undefined {
  const m = MONTH_RE.exec(value);
  return m ? new CalendarDate(num(m[1]), num(m[2]), 1) : undefined;
}

export function formatMonthValue(date: CalendarDate | undefined): string {
  return date ? `${pad(date.year, 4)}-${pad(date.month)}` : '';
}

/** Input datetime-local: `YYYY-MM-DDTHH:mm` (detik opsional). */
export function parseLocalDateTimeValue(value: string): CalendarDateTime | undefined {
  const m = LOCAL_DATETIME_RE.exec(value);
  if (!m) return undefined;
  return new CalendarDateTime(num(m[1]), num(m[2]), num(m[3]), num(m[4]), num(m[5]), m[6] ? num(m[6]) : 0);
}

export function formatLocalDateTimeValue(value: CalendarDateTime | undefined): string {
  if (!value) return '';
  return `${formatYmd(value)}T${pad(value.hour)}:${pad(value.minute)}`;
}

/** Input time: `HH:mm` (detik opsional). Tanggal diisi jangkar tetap, hanya jam yang dipakai. */
export function parseTimeValue(value: string): CalendarDateTime | undefined {
  const m = TIME_RE.exec(value);
  if (!m) return undefined;
  return new CalendarDateTime(
    TIME_ONLY_ANCHOR.year,
    TIME_ONLY_ANCHOR.month,
    TIME_ONLY_ANCHOR.day,
    num(m[1]),
    num(m[2]),
    m[3] ? num(m[3]) : 0,
  );
}

export function formatTimeValue(value: CalendarDateTime | undefined): string {
  return value ? `${pad(value.hour)}:${pad(value.minute)}` : '';
}
