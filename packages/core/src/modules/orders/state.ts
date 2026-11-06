import { FORWARD_TRANSITIONS, type OrderStatus } from '@catering/contracts';
import { AppError } from '../../lib/ids';

export function isHolding(status: OrderStatus): boolean {
  return status === 'pending_payment';
}

export function isLive(status: OrderStatus): boolean {
  return status !== 'expired' && status !== 'cancelled_refunded';
}

export function canCancel(status: OrderStatus): boolean {
  return status === 'pending_payment' || status === 'paid' || status === 'paid_after_expiry';
}

export function assertForwardTransition(from: OrderStatus, to: OrderStatus): void {
  const allowed = FORWARD_TRANSITIONS[from] ?? [];
  if (!allowed.includes(to)) {
    throw new AppError('INVALID_STATE', `Status tidak bisa berpindah dari "${from}" ke "${to}".`, {
      hint: 'Gunakan aksi yang tersedia pada status saat ini.',
    });
  }
}

/** Porsi masuk partisi PO hanya untuk order bersumber `po`. */
export function partitionForSource(source: string): 'regular' | 'po' {
  return source === 'po' ? 'po' : 'regular';
}
