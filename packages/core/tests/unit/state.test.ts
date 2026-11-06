import { describe, expect, it } from 'vitest';
import { AppError } from '../../src/lib/ids';
import {
  assertForwardTransition,
  canCancel,
  isHolding,
  partitionForSource,
} from '../../src/modules/orders/state';

describe('aturan status order', () => {
  it('hanya mengizinkan transisi maju satu arah', () => {
    expect(() => assertForwardTransition('paid', 'in_production')).not.toThrow();
    expect(() => assertForwardTransition('in_production', 'out_for_delivery')).not.toThrow();
    expect(() => assertForwardTransition('out_for_delivery', 'delivered')).not.toThrow();
    expect(() => assertForwardTransition('delivered', 'in_production')).toThrow(AppError);
    expect(() => assertForwardTransition('pending_payment', 'delivered')).toThrow(AppError);
  });

  it('order pending dianggap hold; order terminal tidak bisa dibatalkan', () => {
    expect(isHolding('pending_payment')).toBe(true);
    expect(isHolding('paid')).toBe(false);
    expect(canCancel('paid')).toBe(true);
    expect(canCancel('cancelled_refunded')).toBe(false);
    expect(canCancel('delivered')).toBe(false);
  });

  it('partisi PO hanya untuk source po', () => {
    expect(partitionForSource('po')).toBe('po');
    expect(partitionForSource('web')).toBe('regular');
    expect(partitionForSource('manual')).toBe('regular');
  });
});
