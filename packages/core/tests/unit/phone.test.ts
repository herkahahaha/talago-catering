import { describe, expect, it } from 'vitest';
import { displayPhone, maskPhone, normalizePhone } from '../../src/lib/phone';

describe('nomor HP Indonesia', () => {
  it.each([
    ['081234567890', '+6281234567890'],
    ['+62 812-3456-7890', '+6281234567890'],
    ['6281234567890', '+6281234567890'],
    ['81234567890', '+6281234567890'],
  ])('menormalisasi %s', (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });

  it('menolak nomor yang bukan seluler Indonesia', () => {
    expect(() => normalizePhone('0215551234')).toThrow();
    expect(() => normalizePhone('12345')).toThrow();
  });

  it('menampilkan bentuk lokal dan masking', () => {
    expect(displayPhone('+6281234567890')).toBe('0812-3456-7890');
    expect(maskPhone('+6281234567890')).toBe('0812****890');
  });
});
