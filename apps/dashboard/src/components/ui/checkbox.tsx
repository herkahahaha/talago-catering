import type { JSX } from 'solid-js';
import { Show, splitProps } from 'solid-js';
import { Checkbox as KCheckbox } from '@kobalte/core/checkbox';
import { Check } from 'lucide-solid';
import { cn } from '~/lib/cn';

export interface CheckboxProps {
  id?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  class?: string;
  'aria-label'?: string;
  children?: JSX.Element;
}

export function Checkbox(props: CheckboxProps) {
  const [local, rest] = splitProps(props, ['class', 'children', 'checked', 'onChange']);

  return (
    <KCheckbox
      checked={local.checked}
      onChange={local.onChange}
      disabled={rest.disabled}
      aria-label={rest['aria-label']}
      class={cn('group flex items-center gap-2.5 text-sm', local.class)}
    >
      <KCheckbox.Input class="sr-only" />
      <KCheckbox.Control class="border-input flex size-4 shrink-0 items-center justify-center rounded-[4px] border bg-transparent shadow-xs outline-none transition-colors group-data-[checked]:border-primary group-data-[checked]:bg-primary focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50">
        <KCheckbox.Indicator class="flex items-center justify-center">
          <Check class="text-primary-foreground size-3" stroke-width={3} />
        </KCheckbox.Indicator>
      </KCheckbox.Control>
      <Show when={local.children}>
        <KCheckbox.Label class="text-sm leading-snug font-medium select-none">
          {local.children}
        </KCheckbox.Label>
      </Show>
    </KCheckbox>
  );
}
