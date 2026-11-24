import type { ComponentProps, JSX, ParentProps } from 'solid-js';
import { splitProps } from 'solid-js';
import { Portal } from 'solid-js/web';
import { Dialog as ArkDialog } from '@ark-ui/solid/dialog';
import { cn } from '~/lib/cn';

export interface AlertDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children?: JSX.Element;
}

/** Dialog konfirmasi: sama seperti Dialog, tetapi kontennya berperan sebagai `alertdialog`. */
function AlertDialog(props: AlertDialogProps) {
  return (
    <ArkDialog.Root
      role="alertdialog"
      open={props.open}
      onOpenChange={(details) => props.onOpenChange(details.open)}
      lazyMount
      unmountOnExit
    >
      {props.children}
    </ArkDialog.Root>
  );
}

function AlertDialogContent(props: ParentProps<{ class?: string }>) {
  return (
    <Portal>
      <ArkDialog.Backdrop class="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/50" />
      <ArkDialog.Positioner class="fixed inset-0 z-50 flex items-center justify-center">
        <ArkDialog.Content
          data-slot="alert-dialog-content"
          class={cn(
            'bg-background data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 relative grid w-[calc(100%-2rem)] max-w-lg gap-4 rounded-xl border p-6 shadow-lg',
            props.class,
          )}
        >
          {props.children}
        </ArkDialog.Content>
      </ArkDialog.Positioner>
    </Portal>
  );
}

function AlertDialogHeader(props: ComponentProps<'div'>) {
  const [local, rest] = splitProps(props, ['class']);
  return (
    <div
      data-slot="alert-dialog-header"
      class={cn('flex flex-col gap-1.5 text-left', local.class)}
      {...rest}
    />
  );
}

function AlertDialogFooter(props: ComponentProps<'div'>) {
  const [local, rest] = splitProps(props, ['class']);
  return (
    <div
      data-slot="alert-dialog-footer"
      class={cn('flex flex-col-reverse gap-2 sm:flex-row sm:justify-end', local.class)}
      {...rest}
    />
  );
}

function AlertDialogTitle(props: ComponentProps<typeof ArkDialog.Title>) {
  const [local, rest] = splitProps(props, ['class']);
  return (
    <ArkDialog.Title
      data-slot="alert-dialog-title"
      class={cn('text-lg leading-none font-semibold tracking-tight', local.class)}
      {...rest}
    />
  );
}

function AlertDialogDescription(props: ComponentProps<typeof ArkDialog.Description>) {
  const [local, rest] = splitProps(props, ['class']);
  return (
    <ArkDialog.Description
      data-slot="alert-dialog-description"
      class={cn('text-muted-foreground text-sm', local.class)}
      {...rest}
    />
  );
}

function AlertDialogCancel(props: ComponentProps<typeof ArkDialog.CloseTrigger>) {
  return <ArkDialog.CloseTrigger data-slot="alert-dialog-cancel" {...props} />;
}

export {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogCancel,
};
