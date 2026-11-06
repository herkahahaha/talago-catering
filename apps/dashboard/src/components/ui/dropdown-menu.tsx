import type { ComponentProps, ParentProps } from 'solid-js';
import { splitProps } from 'solid-js';
import { DropdownMenu as KDropdownMenu } from '@kobalte/core/dropdown-menu';
import { cn } from '~/lib/cn';

const DropdownMenu = KDropdownMenu;

function DropdownMenuTrigger(props: ComponentProps<typeof KDropdownMenu.Trigger>) {
  return <KDropdownMenu.Trigger data-slot="dropdown-menu-trigger" {...props} />;
}

function DropdownMenuContent(props: ParentProps<{ class?: string }>) {
  const [local, rest] = splitProps(props, ['class']);
  return (
    <KDropdownMenu.Portal>
      <KDropdownMenu.Content
        data-slot="dropdown-menu-content"
        class={cn(
          'bg-popover text-popover-foreground data-[expanded]:animate-in data-[closed]:animate-out data-[closed]:fade-out-0 data-[expanded]:fade-in-0 data-[closed]:zoom-out-95 data-[expanded]:zoom-in-95 z-50 max-h-(--kb-popper-content-available-height) min-w-40 overflow-y-auto rounded-md border p-1 shadow-md',
          local.class,
        )}
        {...rest}
      />
    </KDropdownMenu.Portal>
  );
}

function DropdownMenuItem(props: ComponentProps<typeof KDropdownMenu.Item>) {
  const [local, rest] = splitProps(props, ['class']);
  return (
    <KDropdownMenu.Item
      data-slot="dropdown-menu-item"
      class={cn(
        'data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
        local.class,
      )}
      {...rest}
    />
  );
}

function DropdownMenuLabel(props: ComponentProps<'div'>) {
  const [local, rest] = splitProps(props, ['class']);
  return (
    <div
      data-slot="dropdown-menu-label"
      class={cn('px-2 py-1.5 text-xs font-medium text-muted-foreground', local.class)}
      {...rest}
    />
  );
}

function DropdownMenuSeparator(props: ComponentProps<typeof KDropdownMenu.Separator>) {
  const [local, rest] = splitProps(props, ['class']);
  return (
    <KDropdownMenu.Separator
      data-slot="dropdown-menu-separator"
      class={cn('bg-border -mx-1 my-1 h-px', local.class)}
      {...rest}
    />
  );
}

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
};
