import type { ComponentProps, JSX, ParentProps } from 'solid-js';
import { splitProps } from 'solid-js';
import { Portal } from 'solid-js/web';
import { Dialog as ArkDialog } from '@ark-ui/solid/dialog';
import { X } from 'lucide-solid';
import { cn } from '~/lib/cn';

export interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children?: JSX.Element;
}

/** Root dialog terkontrol. Konten di-mount saat dibuka dan dilepas saat ditutup (seperti sebelumnya). */
function Dialog(props: DialogProps) {
  return (
    <ArkDialog.Root
      open={props.open}
      onOpenChange={(details) => props.onOpenChange(details.open)}
      lazyMount
      unmountOnExit
    >
      {props.children}
    </ArkDialog.Root>
  );
}

function DialogTrigger(props: ComponentProps<typeof ArkDialog.Trigger>) {
  return <ArkDialog.Trigger data-slot="dialog-trigger" {...props} />;
}

function DialogContent(props: ParentProps<{ class?: string }>) {
  return (
    <Portal>
      <ArkDialog.Backdrop class="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/50" />
      <ArkDialog.Positioner class="fixed inset-0 z-50 flex items-center justify-center">
        <ArkDialog.Content
          data-slot="dialog-content"
          class={cn(
            'bg-background data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 relative grid w-[calc(100%-2rem)] max-w-lg gap-4 rounded-xl border p-6 shadow-lg sm:max-w-lg',
            props.class,
          )}
        >
          {props.children}
          <ArkDialog.CloseTrigger
            data-slot="dialog-close"
            class="ring-offset-background focus:ring-ring absolute top-4 right-4 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-none disabled:pointer-events-none"
          >
            <X class="size-4" />
            <span class="sr-only">Tutup</span>
          </ArkDialog.CloseTrigger>
        </ArkDialog.Content>
      </ArkDialog.Positioner>
    </Portal>
  );
}

function DialogHeader(props: ComponentProps<'div'>) {
  const [local, rest] = splitProps(props, ['class']);
  return (
    <div
      data-slot="dialog-header"
      class={cn('flex flex-col gap-1.5 text-center sm:text-left', local.class)}
      {...rest}
    />
  );
}

function DialogFooter(props: ComponentProps<'div'>) {
  const [local, rest] = splitProps(props, ['class']);
  return (
    <div
      data-slot="dialog-footer"
      class={cn('flex flex-col-reverse gap-2 sm:flex-row sm:justify-end', local.class)}
      {...rest}
    />
  );
}

function DialogTitle(props: ComponentProps<typeof ArkDialog.Title>) {
  const [local, rest] = splitProps(props, ['class']);
  return (
    <ArkDialog.Title
      data-slot="dialog-title"
      class={cn('text-lg leading-none font-semibold tracking-tight', local.class)}
      {...rest}
    />
  );
}

function DialogDescription(props: ComponentProps<typeof ArkDialog.Description>) {
  const [local, rest] = splitProps(props, ['class']);
  return (
    <ArkDialog.Description
      data-slot="dialog-description"
      class={cn('text-muted-foreground text-sm', local.class)}
      {...rest}
    />
  );
}

function DialogClose(props: ComponentProps<typeof ArkDialog.CloseTrigger>) {
  return <ArkDialog.CloseTrigger data-slot="dialog-close" {...props} />;
}

export {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  DialogClose,
};
