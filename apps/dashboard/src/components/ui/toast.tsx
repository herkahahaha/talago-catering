import { Show } from 'solid-js';
import { CircleAlert, CircleCheck, Info } from 'lucide-solid';
import { cn } from '~/lib/cn';

export type ToastVariant = 'default' | 'success' | 'error';

const icons = {
  default: Info,
  success: CircleCheck,
  error: CircleAlert,
} as const;

export function Toast(props: { message: string | null; variant?: ToastVariant }) {
  return (
    <Show when={props.message}>
      <div
        data-slot="toast"
        role="status"
        aria-live="polite"
        class={cn(
          'animate-in fade-in slide-in-from-bottom-2 fixed right-4 bottom-4 z-50 flex max-w-sm items-start gap-2.5 rounded-lg border px-4 py-3 text-sm shadow-lg',
          (props.variant ?? 'default') === 'error'
            ? 'border-destructive/30 bg-destructive text-destructive-foreground'
            : 'bg-primary text-primary-foreground',
        )}
      >
        {(() => {
          const Icon = icons[props.variant ?? 'default'];
          return <Icon class="mt-0.5 size-4 shrink-0" />;
        })()}
        <span>{props.message}</span>
      </div>
    </Show>
  );
}
