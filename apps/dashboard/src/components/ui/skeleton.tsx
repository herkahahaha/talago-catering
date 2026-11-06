import type { ComponentProps } from 'solid-js';
import { splitProps } from 'solid-js';
import { cn } from '~/lib/cn';

export function Skeleton(props: ComponentProps<'div'>) {
  const [local, rest] = splitProps(props, ['class']);
  return <div data-slot="skeleton" class={cn('bg-muted animate-pulse rounded-md', local.class)} {...rest} />;
}
