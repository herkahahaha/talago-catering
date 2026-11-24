import type { CalendarDateTime, DateValue } from '@internationalized/date';
import { For, splitProps } from 'solid-js';
import { DateInput as ArkDateInput } from '@ark-ui/solid/date-input';
import { cn } from '~/lib/cn';
import {
  formatLocalDateTimeValue,
  formatTimeValue,
  parseLocalDateTimeValue,
  parseTimeValue,
} from '~/lib/date-values';

export type DateTimeKind = 'datetime' | 'time';

export interface DateTimeInputProps {
  id?: string;
  /** `YYYY-MM-DDTHH:mm` (kind `datetime`) atau `HH:mm` (kind `time`). Kosong = belum diisi. */
  value: string;
  onChange: (value: string) => void;
  kind?: DateTimeKind;
  disabled?: boolean;
  class?: string;
  'aria-label'?: string;
}

const fieldClass =
  'border-input focus-within:border-ring focus-within:ring-ring/50 flex h-9 w-full min-w-0 items-center gap-0.5 rounded-md border bg-transparent px-3 text-base shadow-xs transition-[color,box-shadow] outline-none focus-within:ring-[3px] md:text-sm aria-disabled:cursor-not-allowed aria-disabled:opacity-50';

const segmentClass =
  'rounded-xs px-0.5 tabular-nums outline-none focus:bg-accent focus:text-accent-foreground data-[placeholder-shown]:text-muted-foreground';

const TIME_TYPES = new Set(['hour', 'minute', 'dayPeriod']);

/** Input tanggal+jam atau jam saja, berbasis Ark UI DateInput. Nilai tetap berupa string. */
export function DateTimeInput(props: DateTimeInputProps) {
  const [local] = splitProps(props, ['id', 'value', 'onChange', 'kind', 'disabled', 'class', 'aria-label']);

  const isTime = () => local.kind === 'time';
  const parsed = (): DateValue[] => {
    const v = isTime() ? parseTimeValue(local.value) : parseLocalDateTimeValue(local.value);
    return v ? [v] : [];
  };

  return (
    <ArkDateInput.Root
      value={parsed()}
      onValueChange={(details) => {
        // Nilai selalu CalendarDateTime (tanpa zona waktu), jadi aman di-cast.
        const picked = details.value[0] as CalendarDateTime | undefined;
        if (!picked) {
          local.onChange('');
          return;
        }
        local.onChange(isTime() ? formatTimeValue(picked) : formatLocalDateTimeValue(picked));
      }}
      locale="id-ID"
      granularity="minute"
      hourCycle={24}
      disabled={local.disabled}
      class={cn('w-full', local.class)}
    >
      <ArkDateInput.Control class={fieldClass} aria-label={local['aria-label']}>
        <ArkDateInput.Context>
          {(api) => {
            const all = () => api().getSegments({ index: 0 });
            // Untuk `time`, tampilkan hanya rentang jam–menit (dan AM/PM bila ada); tanggal disembunyikan.
            const visible = () => {
              const segs = all();
              if (!isTime()) return segs;
              let start = -1;
              let end = -1;
              segs.forEach((seg, i) => {
                if (TIME_TYPES.has(seg.type)) {
                  if (start === -1) start = i;
                  end = i;
                }
              });
              return start === -1 ? [] : segs.slice(start, end + 1);
            };
            const firstEditable = () => visible().findIndex((seg) => seg.type !== 'literal');
            return (
              <ArkDateInput.SegmentGroup index={0} class="flex items-center gap-0.5">
                <For each={visible()}>
                  {(segment, i) =>
                    segment.type === 'literal' ? (
                      <span aria-hidden="true" class="text-muted-foreground px-px select-none">
                        {segment.text}
                      </span>
                    ) : (
                      <ArkDateInput.Segment
                        segment={segment}
                        id={i() === firstEditable() ? local.id : undefined}
                        class={segmentClass}
                      />
                    )
                  }
                </For>
              </ArkDateInput.SegmentGroup>
            );
          }}
        </ArkDateInput.Context>
      </ArkDateInput.Control>
    </ArkDateInput.Root>
  );
}
