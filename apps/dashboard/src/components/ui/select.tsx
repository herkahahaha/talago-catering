import { For, Show, createMemo, splitProps } from 'solid-js';
import { Portal } from 'solid-js/web';
import { Select as ArkSelect, createListCollection } from '@ark-ui/solid/select';
import { Check, ChevronDown } from 'lucide-solid';
import { cn } from '~/lib/cn';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  class?: string;
  disabled?: boolean;
  'aria-label'?: string;
}

export function Select(props: SelectProps) {
  const [local, rest] = splitProps(props, ['class', 'value', 'onChange', 'options', 'placeholder']);

  const collection = createMemo(() =>
    createListCollection<SelectOption>({
      items: local.options,
      itemToValue: (option) => option.value,
      itemToString: (option) => option.label,
      isItemDisabled: (option) => !!option.disabled,
    }),
  );

  return (
    <ArkSelect.Root
      collection={collection()}
      value={local.value === '' ? [] : [local.value]}
      onValueChange={(details) => local.onChange(details.value[0] ?? '')}
      disabled={rest.disabled}
      positioning={{ sameWidth: true, gutter: 4 }}
      lazyMount
      unmountOnExit
    >
      <ArkSelect.Control class="w-full min-w-0">
        <ArkSelect.Trigger
          id={rest.id}
          aria-label={rest['aria-label']}
          class={cn(
            'border-input data-[placeholder-shown]:text-muted-foreground flex h-9 w-full min-w-0 items-center justify-between gap-2 rounded-md border bg-transparent px-3 py-2 text-sm whitespace-nowrap shadow-xs transition-[color,box-shadow] outline-none',
            'focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]',
            'data-[state=open]:border-ring data-[state=open]:ring-ring/50 data-[state=open]:ring-[3px]',
            'disabled:cursor-not-allowed disabled:opacity-50',
            local.class,
          )}
        >
          <ArkSelect.ValueText class="truncate" placeholder={local.placeholder ?? 'Pilih…'} />
          <ArkSelect.Indicator class="shrink-0">
            <ChevronDown class="size-4 opacity-50" />
          </ArkSelect.Indicator>
        </ArkSelect.Trigger>
      </ArkSelect.Control>
      <Show when={local.options.length > 0}>
        <Portal>
          <ArkSelect.Positioner class="z-50">
            <ArkSelect.Content class="bg-popover text-popover-foreground data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 max-h-72 min-w-32 overflow-y-auto rounded-md border p-1 shadow-md outline-none">
              <For each={local.options}>
                {(option) => (
                  <ArkSelect.Item
                    item={option}
                    class="data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground relative flex w-full cursor-default items-center gap-2 rounded-sm py-1.5 pr-8 pl-2 text-sm outline-none select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
                  >
                    <ArkSelect.ItemText class="truncate">{option.label}</ArkSelect.ItemText>
                    <ArkSelect.ItemIndicator class="absolute right-2 flex size-3.5 items-center justify-center">
                      <Check class="size-4" />
                    </ArkSelect.ItemIndicator>
                  </ArkSelect.Item>
                )}
              </For>
            </ArkSelect.Content>
          </ArkSelect.Positioner>
        </Portal>
      </Show>
    </ArkSelect.Root>
  );
}
