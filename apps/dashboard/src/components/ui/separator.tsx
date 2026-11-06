import type { ComponentProps } from 'solid-js';
import { splitProps } from 'solid-js';
import { cn } from '~/lib/cn';

export function Separator(props: ComponentProps<'div'> & { orientation?: 'horizontal' | 'vertical' }) {
  const [local, rest] = splitProps(props, ['class', 'orientation']);
  return (
    <div
      data-slot="separator"
      role="separator"
      aria-orientation={local.orientation ?? 'horizontal'}
      class={cn(
        'bg-border shrink-0',
        (local.orientation ?? 'horizontal') === 'horizontal' ? 'h-px w-full' : 'h-full w-px',
        local.class,
      )}
      {...rest}
    />
  );
}
