import type { ComponentProps } from 'solid-js';
import { splitProps } from 'solid-js';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '~/lib/cn';

const alertVariants = cva(
  'relative grid w-full grid-cols-[0_1fr] items-start gap-y-0.5 rounded-lg border px-4 py-3 text-sm has-[>svg]:grid-cols-[calc(var(--spacing)*4)_1fr] has-[>svg]:gap-x-3 [&>svg]:size-4 [&>svg]:translate-y-0.5 [&>svg]:text-current',
  {
    variants: {
      variant: {
        default: 'bg-card text-card-foreground',
        destructive: 'text-destructive border-destructive/30 bg-destructive/5 [&>svg]:text-destructive',
        success: 'border-emerald-200 bg-emerald-50 text-emerald-800 [&>svg]:text-emerald-600',
        warning: 'border-amber-200 bg-amber-50 text-amber-900 [&>svg]:text-amber-600',
        info: 'border-sky-200 bg-sky-50 text-sky-800 [&>svg]:text-sky-600',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

export type AlertProps = ComponentProps<'div'> & VariantProps<typeof alertVariants>;

export function Alert(props: AlertProps) {
  const [local, rest] = splitProps(props, ['class', 'variant']);
  return (
    <div
      data-slot="alert"
      role="alert"
      class={cn(alertVariants({ variant: local.variant }), local.class)}
      {...rest}
    />
  );
}

export function AlertTitle(props: ComponentProps<'div'>) {
  const [local, rest] = splitProps(props, ['class']);
  return (
    <div
      data-slot="alert-title"
      class={cn('col-start-2 line-clamp-1 min-h-4 font-medium tracking-tight', local.class)}
      {...rest}
    />
  );
}

export function AlertDescription(props: ComponentProps<'div'>) {
  const [local, rest] = splitProps(props, ['class']);
  return (
    <div
      data-slot="alert-description"
      class={cn('col-start-2 text-sm [&_p]:leading-relaxed', local.class)}
      {...rest}
    />
  );
}
