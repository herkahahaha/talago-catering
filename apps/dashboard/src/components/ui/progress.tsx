import { splitProps } from 'solid-js';
import type { ComponentProps } from 'solid-js';
import { cn } from '~/lib/cn';

export function Progress(
  props: ComponentProps<'div'> & { value?: number; max?: number; indicatorClass?: string },
) {
  const [local, rest] = splitProps(props, ['class', 'value', 'max', 'indicatorClass']);
  const max = () => local.max ?? 100;
  const pct = () => Math.min(100, Math.max(0, ((local.value ?? 0) / max()) * 100));

  return (
    <div
      data-slot="progress"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={max()}
      aria-valuenow={local.value ?? 0}
      class={cn('bg-primary/20 relative h-1.5 w-full overflow-hidden rounded-full', local.class)}
      {...rest}
    >
      <div
        data-slot="progress-indicator"
        class={cn('bg-primary h-full rounded-full transition-all', local.indicatorClass)}
        style={{ width: `${pct()}%` }}
      />
    </div>
  );
}
