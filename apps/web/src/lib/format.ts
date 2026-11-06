const rupiah = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  maximumFractionDigits: 0,
});

const shortDate = new Intl.DateTimeFormat('id-ID', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
});

const longDate = new Intl.DateTimeFormat('id-ID', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

const timeFormat = new Intl.DateTimeFormat('id-ID', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'Asia/Jakarta',
});

export function rp(value: number): string {
  return rupiah.format(value).replace(/\u00a0/g, ' ');
}

export function formatDate(dateIso: string): string {
  return longDate.format(new Date(`${dateIso}T12:00:00+07:00`));
}

export function formatShortDate(dateIso: string): string {
  return shortDate.format(new Date(`${dateIso}T12:00:00+07:00`));
}

export function formatTime(iso: string): string {
  return `${timeFormat.format(new Date(iso))} WIB`;
}

export function countdown(targetIso: string | null): string {
  if (!targetIso) return '—';
  const remaining = new Date(targetIso).getTime() - Date.now();
  if (remaining <= 0) return 'kedaluwarsa';
  const minutes = Math.floor(remaining / 60_000);
  const seconds = Math.floor((remaining % 60_000) / 1000);
  return `${minutes}m ${String(seconds).padStart(2, '0')}d`;
}
