import type { ComponentProps } from 'solid-js';
import { splitProps } from 'solid-js';
import { cn } from '~/lib/cn';

export function Card(props: ComponentProps<'div'>) {
  const [local, rest] = splitProps(props, ['class']);
  return (
    <div
      data-slot="card"
      class={cn(
        'bg-card text-card-foreground flex flex-col gap-6 rounded-xl border py-6 shadow-sm',
        local.class,
      )}
      {...rest}
    />
  );
}

export function CardHeader(props: ComponentProps<'div'>) {
  const [local, rest] = splitProps(props, ['class']);
  return (
    <div
      data-slot="card-header"
      class={cn(
        '@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-1.5 px-6 has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-6',
        local.class,
      )}
      {...rest}
    />
  );
}

export function CardTitle(props: ComponentProps<'div'>) {
  const [local, rest] = splitProps(props, ['class']);
  return (
    <div
      data-slot="card-title"
      class={cn('leading-none font-semibold tracking-tight', local.class)}
      {...rest}
    />
  );
}

export function CardDescription(props: ComponentProps<'div'>) {
  const [local, rest] = splitProps(props, ['class']);
  return (
    <div data-slot="card-description" class={cn('text-muted-foreground text-sm', local.class)} {...rest} />
  );
}

export function CardAction(props: ComponentProps<'div'>) {
  const [local, rest] = splitProps(props, ['class']);
  return (
    <div
      data-slot="card-action"
      class={cn('col-start-2 row-span-2 row-start-1 self-start justify-self-end', local.class)}
      {...rest}
    />
  );
}

export function CardContent(props: ComponentProps<'div'>) {
  const [local, rest] = splitProps(props, ['class']);
  return <div data-slot="card-content" class={cn('px-6', local.class)} {...rest} />;
}

export function CardFooter(props: ComponentProps<'div'>) {
  const [local, rest] = splitProps(props, ['class']);
  return (
    <div
      data-slot="card-footer"
      class={cn('flex items-center px-6 [.border-t]:pt-6', local.class)}
      {...rest}
    />
  );
}
