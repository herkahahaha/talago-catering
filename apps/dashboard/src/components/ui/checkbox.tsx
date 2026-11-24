import type { JSX } from 'solid-js';
import { Show, splitProps } from 'solid-js';
import { Checkbox as ArkCheckbox } from '@ark-ui/solid/checkbox';
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
    <ArkCheckbox.Root
      checked={local.checked}
      onCheckedChange={(details) => local.onChange(details.checked === true)}
      disabled={rest.disabled}
      class={cn('group flex items-center gap-2.5 text-sm', local.class)}
    >
      <ArkCheckbox.HiddenInput aria-label={rest['aria-label']} />
      <ArkCheckbox.Control class="border-input group-data-[state=checked]:border-primary group-data-[state=checked]:bg-primary focus-visible:ring-ring/50 flex size-4 shrink-0 items-center justify-center rounded-[4px] border bg-transparent shadow-xs outline-none transition-colors focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50">
        <ArkCheckbox.Indicator class="flex items-center justify-center">
          <Check class="text-primary-foreground size-3" stroke-width={3} />
        </ArkCheckbox.Indicator>
      </ArkCheckbox.Control>
      <Show when={local.children}>
        <ArkCheckbox.Label class="text-sm leading-snug font-medium select-none">
          {local.children}
        </ArkCheckbox.Label>
      </Show>
    </ArkCheckbox.Root>
  );
}
