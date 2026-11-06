import type { ComponentProps } from 'solid-js';
import { splitProps } from 'solid-js';
import { cn } from '~/lib/cn';

export function Textarea(props: ComponentProps<'textarea'>) {
  const [local, rest] = splitProps(props, ['class']);
  return (
    <textarea
      data-slot="textarea"
      class={cn(
        'border-input placeholder:text-muted-foreground flex field-sizing-content min-h-16 w-full rounded-md border bg-transparent px-3 py-2 text-base shadow-xs transition-[color,box-shadow] outline-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
        'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50',
        'aria-invalid:border-destructive aria-invalid:ring-destructive/20',
        local.class,
      )}
      {...rest}
    />
  );
}
