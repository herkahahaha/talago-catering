import type { JSX } from 'solid-js';
import { Show } from 'solid-js';
import { cn } from '~/lib/cn';

export function EmptyState(props: {
  icon?: JSX.Element;
  title: string;
  description?: string;
  action?: JSX.Element;
  class?: string;
}) {
  return (
    <div
      data-slot="empty-state"
      class={cn('flex flex-col items-center justify-center gap-2 px-6 py-14 text-center', props.class)}
    >
      <Show when={props.icon}>
        <div class="bg-muted text-muted-foreground mb-1 flex size-10 items-center justify-center rounded-full [&_svg]:size-5">
          {props.icon}
        </div>
      </Show>
      <p class="text-sm font-medium">{props.title}</p>
      <Show when={props.description}>
        <p class="text-muted-foreground max-w-sm text-sm">{props.description}</p>
      </Show>
      <Show when={props.action}>
        <div class="mt-2">{props.action}</div>
      </Show>
    </div>
  );
}
