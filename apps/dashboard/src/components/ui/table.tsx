import type { ComponentProps } from 'solid-js';
import { splitProps } from 'solid-js';
import { cn } from '~/lib/cn';

export function Table(props: ComponentProps<'table'>) {
  const [local, rest] = splitProps(props, ['class']);
  return (
    <div data-slot="table-container" class="relative w-full overflow-x-auto">
      <table data-slot="table" class={cn('w-full caption-bottom text-sm', local.class)} {...rest} />
    </div>
  );
}

export function TableHeader(props: ComponentProps<'thead'>) {
  const [local, rest] = splitProps(props, ['class']);
  return <thead data-slot="table-header" class={cn('bg-muted/40 [&_tr]:border-b', local.class)} {...rest} />;
}

export function TableBody(props: ComponentProps<'tbody'>) {
  const [local, rest] = splitProps(props, ['class']);
  return <tbody data-slot="table-body" class={cn('[&_tr:last-child]:border-0', local.class)} {...rest} />;
}

export function TableFooter(props: ComponentProps<'tfoot'>) {
  const [local, rest] = splitProps(props, ['class']);
  return (
    <tfoot
      data-slot="table-footer"
      class={cn('bg-muted/50 border-t font-medium [&>tr]:last:border-b-0', local.class)}
      {...rest}
    />
  );
}

export function TableRow(props: ComponentProps<'tr'>) {
  const [local, rest] = splitProps(props, ['class']);
  return (
    <tr
      data-slot="table-row"
      class={cn('hover:bg-muted/50 data-[state=selected]:bg-muted border-b transition-colors', local.class)}
      {...rest}
    />
  );
}

export function TableHead(props: ComponentProps<'th'>) {
  const [local, rest] = splitProps(props, ['class']);
  return (
    <th
      data-slot="table-head"
      class={cn(
        'text-muted-foreground h-10 px-4 text-left align-middle text-xs font-medium whitespace-nowrap',
        local.class,
      )}
      {...rest}
    />
  );
}

export function TableCell(props: ComponentProps<'td'>) {
  const [local, rest] = splitProps(props, ['class']);
  return <td data-slot="table-cell" class={cn('px-4 py-3 align-middle', local.class)} {...rest} />;
}

export function TableCaption(props: ComponentProps<'caption'>) {
  const [local, rest] = splitProps(props, ['class']);
  return (
    <caption
      data-slot="table-caption"
      class={cn('text-muted-foreground mt-4 text-sm', local.class)}
      {...rest}
    />
  );
}
