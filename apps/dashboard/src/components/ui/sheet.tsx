import type { JSX } from 'solid-js';
import { Portal } from 'solid-js/web';
import { Dialog as ArkDialog } from '@ark-ui/solid/dialog';
import { X } from 'lucide-solid';
import { cn } from '~/lib/cn';

export function Sheet(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  side?: 'left' | 'right';
  class?: string;
  children: JSX.Element;
}) {
  const side = () => props.side ?? 'left';

  return (
    <ArkDialog.Root
      open={props.open}
      onOpenChange={(details) => props.onOpenChange(details.open)}
      lazyMount
      unmountOnExit
    >
      <Portal>
        <ArkDialog.Backdrop class="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/50" />
        <ArkDialog.Positioner class="fixed inset-0 z-50">
          <ArkDialog.Content
            class={cn(
              'bg-sidebar data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-y-0 flex h-full w-72 flex-col shadow-xl outline-none',
              side() === 'left'
                ? 'data-[state=open]:slide-in-from-left data-[state=closed]:slide-out-to-left left-0 border-r'
                : 'data-[state=open]:slide-in-from-right data-[state=closed]:slide-out-to-right right-0 border-l',
              props.class,
            )}
          >
            {props.children}
            <ArkDialog.CloseTrigger class="ring-offset-background focus:ring-ring absolute top-3 right-3 rounded-xs opacity-60 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-none">
              <X class="size-4" />
              <span class="sr-only">Tutup menu</span>
            </ArkDialog.CloseTrigger>
          </ArkDialog.Content>
        </ArkDialog.Positioner>
      </Portal>
    </ArkDialog.Root>
  );
}
