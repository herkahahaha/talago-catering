import { AppError } from './ids';

export interface PricedItem {
  unitPrice: number;
  portions: number;
}

export function lineTotal(item: PricedItem): number {
  return item.unitPrice * item.portions;
}

export function sumPortions(items: ReadonlyArray<{ portions: number }>): number {
  return items.reduce((total, item) => total + item.portions, 0);
}

export function sumSubtotal(items: ReadonlyArray<PricedItem>): number {
  return items.reduce((total, item) => total + lineTotal(item), 0);
}

export function assertRupiah(amount: number, label = 'Nominal'): void {
  if (!Number.isInteger(amount) || amount < 0) {
    throw new AppError('VALIDATION_ERROR', `${label} harus bilangan bulat rupiah >= 0`);
  }
}
