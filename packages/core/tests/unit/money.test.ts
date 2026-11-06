import { describe, expect, it } from 'vitest';
import { assertRupiah, sumPortions, sumSubtotal } from '../../src/lib/money';

describe('perhitungan uang & porsi', () => {
  it('menjumlahkan porsi lintas hidangan', () => {
    expect(sumPortions([{ portions: 50 }, { portions: 25 }])).toBe(75);
  });

  it('subtotal memakai harga satuan rupiah bulat', () => {
    expect(
      sumSubtotal([
        { unitPrice: 25_000, portions: 30 },
        { unitPrice: 8_000, portions: 20 },
      ]),
    ).toBe(910_000);
  });

  it('menolak nominal negatif atau pecahan', () => {
    expect(() => assertRupiah(-1)).toThrow();
    expect(() => assertRupiah(10.5)).toThrow();
    expect(() => assertRupiah(0)).not.toThrow();
  });
});
