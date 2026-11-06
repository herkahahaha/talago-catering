import type { ComponentProps, ParentProps } from 'solid-js';
import { splitProps } from 'solid-js';
import { Dialog as KDialog } from '@kobalte/core/dialog';
import { X } from 'lucide-solid';
import { cn } from '~/lib/cn';

const Dialog = KDialog;

function DialogTrigger(props: ComponentProps<typeof KDialog.Trigger>) {
  return <KDialog.Trigger data-slot="dialog-trigger" {...props} />;
}

function DialogContent(props: ParentProps<{ class?: string }>) {
  return (
    <KDialog.Portal>
      <KDialog.Overlay class="data-[expanded]:animate-in data-[closed]:animate-out data-[closed]:fade-out-0 data-[expanded]:fade-in-0 fixed inset-0 z-50 bg-black/50" />
      <KDialog.Content
        data-slot="dialog-content"
        class={cn(
          'bg-background data-[expanded]:animate-in data-[closed]:animate-out data-[closed]:fade-out-0 data-[expanded]:fade-in-0 data-[closed]:zoom-out-95 data-[expanded]:zoom-in-95 fixed top-1/2 left-1/2 z-50 grid w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 gap-4 rounded-xl border p-6 shadow-lg sm:max-w-lg',
          props.class,
        )}
      >
        {props.children}
        <KDialog.CloseButton
          data-slot="dialog-close"
          class="ring-offset-background focus:ring-ring absolute top-4 right-4 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-none disabled:pointer-events-none"
        >
          <X class="size-4" />
          <span class="sr-only">Tutup</span>
        </KDialog.CloseButton>
      </KDialog.Content>
    </KDialog.Portal>
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

function DialogTitle(props: ComponentProps<typeof KDialog.Title>) {
  return (
    <KDialog.Title
      data-slot="dialog-title"
      class="text-lg leading-none font-semibold tracking-tight"
      {...props}
    />
  );
}

function DialogDescription(props: ComponentProps<typeof KDialog.Description>) {
  return (
    <KDialog.Description data-slot="dialog-description" class="text-muted-foreground text-sm" {...props} />
  );
}

function DialogClose(props: ComponentProps<typeof KDialog.CloseButton>) {
  return <KDialog.CloseButton data-slot="dialog-close" {...props} />;
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
