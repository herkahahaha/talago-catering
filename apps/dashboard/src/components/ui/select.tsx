import { Show, createMemo, splitProps } from 'solid-js';
import { Select as KSelect } from '@kobalte/core/select';
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

  const labels = createMemo(() => new Map(local.options.map((option) => [option.value, option.label])));
  const values = createMemo(() => local.options.map((option) => option.value));
  const selected = createMemo(() => labels().get(local.value));

  return (
    <KSelect<string>
      options={values()}
      value={local.value === '' ? null : local.value}
      onChange={(value) => local.onChange(value ?? '')}
      placeholder={local.placeholder}
      disabled={rest.disabled}
      sameWidth
      gutter={4}
      itemComponent={(itemProps) => (
        <KSelect.Item
          item={itemProps.item}
          class="data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground relative flex w-full cursor-default items-center gap-2 rounded-sm py-1.5 pr-8 pl-2 text-sm outline-none select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
        >
          <KSelect.ItemLabel class="truncate">
            {labels().get(itemProps.item.rawValue) ?? itemProps.item.rawValue}
          </KSelect.ItemLabel>
          <KSelect.ItemIndicator class="absolute right-2 flex size-3.5 items-center justify-center">
            <Check class="size-4" />
          </KSelect.ItemIndicator>
        </KSelect.Item>
      )}
    >
      <KSelect.Trigger
        id={rest.id}
        aria-label={rest['aria-label']}
        class={cn(
          'border-input flex h-9 w-full min-w-0 items-center justify-between gap-2 rounded-md border bg-transparent px-3 py-2 text-sm whitespace-nowrap shadow-xs transition-[color,box-shadow] outline-none',
          'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50',
          'data-[expanded]:border-ring data-[expanded]:ring-[3px] data-[expanded]:ring-ring/50',
          'disabled:cursor-not-allowed disabled:opacity-50',
          local.class,
        )}
      >
        <span class={cn('truncate', !selected() && 'text-muted-foreground')}>
          {selected() ?? local.placeholder ?? 'Pilih…'}
        </span>
        <KSelect.Icon class="shrink-0">
          <ChevronDown class="size-4 opacity-50" />
        </KSelect.Icon>
      </KSelect.Trigger>
      <Show when={values().length > 0}>
        <KSelect.Portal>
          <KSelect.Content class="bg-popover text-popover-foreground data-[expanded]:animate-in data-[closed]:animate-out data-[closed]:fade-out-0 data-[expanded]:fade-in-0 data-[closed]:zoom-out-95 data-[expanded]:zoom-in-95 z-50 max-h-72 min-w-32 overflow-y-auto rounded-md border p-1 shadow-md">
            <KSelect.Listbox class="outline-none" />
          </KSelect.Content>
        </KSelect.Portal>
      </Show>
    </KSelect>
  );
}
