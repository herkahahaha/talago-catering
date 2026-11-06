import type { ComponentProps } from 'solid-js';
import { splitProps } from 'solid-js';
import { cn } from '~/lib/cn';

export function Label(props: ComponentProps<'label'>) {
  const [local, rest] = splitProps(props, ['class']);
  return (
    <label
      data-slot="label"
      class={cn(
        'flex items-center gap-2 text-sm leading-none font-medium select-none',
        'group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50',
        local.class,
      )}
      {...rest}
    />
  );
}
