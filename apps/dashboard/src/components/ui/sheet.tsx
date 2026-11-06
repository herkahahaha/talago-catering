import type { JSX } from 'solid-js';
import { Dialog as KDialog } from '@kobalte/core/dialog';
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
    <KDialog open={props.open} onOpenChange={props.onOpenChange}>
      <KDialog.Portal>
        <KDialog.Overlay class="data-[expanded]:animate-in data-[closed]:animate-out data-[closed]:fade-out-0 data-[expanded]:fade-in-0 fixed inset-0 z-50 bg-black/50" />
        <KDialog.Content
          class={cn(
            'bg-sidebar data-[expanded]:animate-in data-[closed]:animate-out data-[closed]:fade-out-0 data-[expanded]:fade-in-0 fixed inset-y-0 z-50 flex h-full w-72 flex-col shadow-xl outline-none',
            side() === 'left'
              ? 'data-[expanded]:slide-in-from-left data-[closed]:slide-out-to-left left-0 border-r'
              : 'data-[expanded]:slide-in-from-right data-[closed]:slide-out-to-right right-0 border-l',
            props.class,
          )}
        >
          {props.children}
          <KDialog.CloseButton class="ring-offset-background focus:ring-ring absolute top-3 right-3 rounded-xs opacity-60 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-none">
            <X class="size-4" />
            <span class="sr-only">Tutup menu</span>
          </KDialog.CloseButton>
        </KDialog.Content>
      </KDialog.Portal>
    </KDialog>
  );
}
