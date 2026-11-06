import { describe, expect, it } from 'vitest';
import {
  addDays,
  cutoffAtFromParts,
  dateRange,
  defaultCutoffAt,
  formatWibDateTime,
  todayWib,
} from '../../src/lib/time';

describe('waktu WIB', () => {
  it('cut-off default adalah H-1 pukul 18.00 WIB', () => {
    const cutoff = defaultCutoffAt('2026-11-06', 18, 0);
    expect(cutoff.toISOString()).toBe('2026-11-05T11:00:00.000Z');
  });

  it('cut-off dapat diatur lewat jam:menit', () => {
    expect(cutoffAtFromParts('2026-11-06', '17:30').toISOString()).toBe('2026-11-05T10:30:00.000Z');
  });

  it('todayWib mengikuti kalender Jakarta, bukan UTC', () => {
    // 31 Des 2026 17:30 UTC = 1 Jan 2027 00:30 WIB
    expect(todayWib(new Date('2026-12-31T17:30:00Z'))).toBe('2027-01-01');
    expect(todayWib(new Date('2026-12-31T16:30:00Z'))).toBe('2026-12-31');
  });

  it('addDays melewati batas bulan dan tahun', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('dateRange menghasilkan tanggal berurutan', () => {
    expect(dateRange('2026-11-03', 3)).toEqual(['2026-11-03', '2026-11-04', '2026-11-05']);
  });

  it('formatWibDateTime menampilkan WIB', () => {
    expect(formatWibDateTime('2026-11-05T11:00:00.000Z')).toContain('WIB');
  });
});
