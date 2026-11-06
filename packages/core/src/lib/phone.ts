/** Normalisasi nomor HP Indonesia ke bentuk E.164 (+62...). */
export function normalizePhone(raw: string): string {
  let digits = raw.replace(/[^\d+]/g, '');
  if (digits.startsWith('+62')) digits = digits.slice(3);
  else if (digits.startsWith('62')) digits = digits.slice(2);
  else if (digits.startsWith('0')) digits = digits.slice(1);
  else if (digits.startsWith('8')) {
    // sudah tanpa awalan
  } else {
    throw new Error(`Nomor HP tidak dikenali: ${raw}`);
  }
  if (!/^8[1-9][0-9]{6,11}$/.test(digits)) {
    throw new Error(`Nomor HP tidak dikenali: ${raw}`);
  }
  return `+62${digits}`;
}

/** Bentuk tampilan lokal: 0812-3456-7890. */
export function displayPhone(e164: string): string {
  const digits = e164.replace(/^\+62/, '0');
  return digits.replace(/(\d{4})(\d{4})(\d+)/, '$1-$2-$3');
}

export function maskPhone(e164: string): string {
  const digits = e164.replace(/^\+62/, '0');
  if (digits.length <= 8) return digits;
  return `${digits.slice(0, 4)}****${digits.slice(-3)}`;
}

/** Kunci rate limit yang stabil untuk nomor HP. */
export function phoneKey(e164: string): string {
  return `phone:${e164}`;
}
