import type { ComponentProps, ParentProps } from 'solid-js';
import { splitProps } from 'solid-js';
import { AlertDialog as KAlertDialog } from '@kobalte/core/alert-dialog';
import { cn } from '~/lib/cn';

const AlertDialog = KAlertDialog;

function AlertDialogContent(props: ParentProps<{ class?: string }>) {
  return (
    <KAlertDialog.Portal>
      <KAlertDialog.Overlay class="data-[expanded]:animate-in data-[closed]:animate-out data-[closed]:fade-out-0 data-[expanded]:fade-in-0 fixed inset-0 z-50 bg-black/50" />
      <KAlertDialog.Content
        data-slot="alert-dialog-content"
        class={cn(
          'bg-background data-[expanded]:animate-in data-[closed]:animate-out data-[closed]:fade-out-0 data-[expanded]:fade-in-0 data-[closed]:zoom-out-95 data-[expanded]:zoom-in-95 fixed top-1/2 left-1/2 z-50 grid w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 gap-4 rounded-xl border p-6 shadow-lg',
          props.class,
        )}
      >
        {props.children}
      </KAlertDialog.Content>
    </KAlertDialog.Portal>
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

function AlertDialogTitle(props: ComponentProps<typeof KAlertDialog.Title>) {
  const [local, rest] = splitProps(props, ['class']);
  return (
    <KAlertDialog.Title
      data-slot="alert-dialog-title"
      class={cn('text-lg leading-none font-semibold tracking-tight', local.class)}
      {...rest}
    />
  );
}

function AlertDialogDescription(props: ComponentProps<typeof KAlertDialog.Description>) {
  const [local, rest] = splitProps(props, ['class']);
  return (
    <KAlertDialog.Description
      data-slot="alert-dialog-description"
      class={cn('text-muted-foreground text-sm', local.class)}
      {...rest}
    />
  );
}

function AlertDialogCancel(props: ComponentProps<typeof KAlertDialog.CloseButton>) {
  return <KAlertDialog.CloseButton data-slot="alert-dialog-cancel" {...props} />;
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
