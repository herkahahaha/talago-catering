import type { OrderStatus } from '@catering/contracts';
import { ORDER_STATUS_LABELS, ORDER_STATUS_TONES } from '@catering/contracts';
import { Badge, type BadgeProps } from '~/components/ui/badge';

const toneVariant: Record<string, BadgeProps['variant']> = {
  amber: 'warning',
  blue: 'info',
  green: 'success',
  slate: 'neutral',
  red: 'destructive',
};

export function StatusBadge(props: { status: OrderStatus }) {
  const tone = ORDER_STATUS_TONES[props.status];
  return <Badge variant={toneVariant[tone] ?? 'neutral'}>{ORDER_STATUS_LABELS[props.status]}</Badge>;
}
