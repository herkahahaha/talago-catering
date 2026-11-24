import type { ComponentProps, JSX, ParentProps } from 'solid-js';
import { createContext, createUniqueId, onCleanup, splitProps, useContext } from 'solid-js';
import { Portal } from 'solid-js/web';
import { Menu as ArkMenu } from '@ark-ui/solid/menu';
import { cn } from '~/lib/cn';

type SelectHandlers = Map<string, () => void>;

// Ark mengirim `onSelect` ke root menu, bukan ke tiap item. Setiap item mendaftarkan
// handler-nya di sini (dengan value unik) agar API `onSelect` per item tetap sama.
const DropdownMenuContext = createContext<SelectHandlers>(new Map());

export interface DropdownMenuProps {
  children?: JSX.Element;
}

function DropdownMenu(props: DropdownMenuProps) {
  const handlers: SelectHandlers = new Map();

  return (
    <DropdownMenuContext.Provider value={handlers}>
      <ArkMenu.Root onSelect={(details) => handlers.get(details.value)?.()} lazyMount unmountOnExit>
        {props.children}
      </ArkMenu.Root>
    </DropdownMenuContext.Provider>
  );
}

function DropdownMenuTrigger(props: ComponentProps<typeof ArkMenu.Trigger>) {
  return <ArkMenu.Trigger data-slot="dropdown-menu-trigger" {...props} />;
}

function DropdownMenuContent(props: ParentProps<{ class?: string }>) {
  const [local, rest] = splitProps(props, ['class']);
  return (
    <Portal>
      <ArkMenu.Positioner class="z-50">
        <ArkMenu.Content
          data-slot="dropdown-menu-content"
          class={cn(
            'bg-popover text-popover-foreground data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 max-h-(--available-height) min-w-40 overflow-y-auto rounded-md border p-1 shadow-md outline-none',
            local.class,
          )}
          {...rest}
        />
      </ArkMenu.Positioner>
    </Portal>
  );
}

function DropdownMenuItem(
  props: ParentProps<{
    class?: string;
    disabled?: boolean;
    onSelect?: () => void;
  }>,
) {
  const [local, rest] = splitProps(props, ['class', 'disabled', 'onSelect']);
  const handlers = useContext(DropdownMenuContext);
  const value = createUniqueId();

  handlers.set(value, () => local.onSelect?.());
  onCleanup(() => handlers.delete(value));

  return (
    <ArkMenu.Item
      data-slot="dropdown-menu-item"
      value={value}
      disabled={local.disabled}
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

function DropdownMenuSeparator(props: ComponentProps<typeof ArkMenu.Separator>) {
  const [local, rest] = splitProps(props, ['class']);
  return (
    <ArkMenu.Separator
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
