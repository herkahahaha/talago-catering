import { CalendarDate, CalendarDateTime, type DateValue } from '@internationalized/date';
import { For, Show, splitProps } from 'solid-js';
import { Portal } from 'solid-js/web';
import { DatePicker as ArkDatePicker } from '@ark-ui/solid/date-picker';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-solid';
import { cn } from '~/lib/cn';
import {
  formatDateValue,
  formatLocalDateTimeValue,
  formatMonthValue,
  parseDateValue,
  parseLocalDateTimeValue,
  parseMonthValue,
} from '~/lib/date-values';

export type DatePickerKind = 'date' | 'month';

export interface DatePickerProps {
  id?: string;
  /** `YYYY-MM-DD` (kind `date`) atau `YYYY-MM` (kind `month`). Kosong = belum dipilih. */
  value: string;
  onChange: (value: string) => void;
  kind?: DatePickerKind;
  /** Pola "With time" Ark: kalender + field jam di dalam popup. Nilai `YYYY-MM-DDTHH:mm`. Hanya untuk kind `date`. */
  withTime?: boolean;
  /** `false` untuk dipakai di dalam dialog: popup kalender harus tetap di dalam focus trap dialog. */
  portal?: boolean;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  class?: string;
  'aria-label'?: string;
}

const inputClass =
  'border-input placeholder:text-muted-foreground flex h-9 w-full min-w-0 rounded-md border bg-transparent py-1 pr-9 pl-3 text-base shadow-xs transition-[color,box-shadow] outline-none md:text-sm focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20';

const navButtonClass =
  'hover:bg-accent inline-flex size-7 items-center justify-center rounded-md transition-colors disabled:pointer-events-none disabled:opacity-40';

const cellTriggerClass =
  'hover:bg-accent data-[selected]:bg-primary data-[selected]:text-primary-foreground data-[today]:border-border data-[today]:border data-[outside-range]:text-muted-foreground/50 data-[disabled]:text-muted-foreground/40 data-[disabled]:pointer-events-none flex size-8 items-center justify-center rounded-md text-sm transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 cursor-pointer';

/** Date picker berbasis Ark UI (kalender tanggal atau bulan), menyimpan nilai sebagai string. */
export function DatePicker(props: DatePickerProps) {
  const [local] = splitProps(props, [
    'value',
    'onChange',
    'kind',
    'withTime',
    'portal',
    'placeholder',
    'disabled',
    'required',
    'class',
    'id',
    'aria-label',
  ]);

  const isMonth = () => local.kind === 'month';
  const withTime = () => !isMonth() && local.withTime === true;
  const DEFAULT_TIME = { hour: 0, minute: 0 };

  const parsed = (): DateValue[] => {
    if (withTime()) {
      const dt = parseLocalDateTimeValue(local.value);
      if (dt) return [dt];
      const d = parseDateValue(local.value);
      return d ? [d] : [];
    }
    const v = isMonth() ? parseMonthValue(local.value) : parseDateValue(local.value);
    return v ? [v] : [];
  };

  function emit(picked: DateValue | undefined) {
    if (!picked) return local.onChange('');
    if (isMonth()) return local.onChange(formatMonthValue(picked as CalendarDate));
    if (withTime()) {
      // Pakai jam dari timeText() yang selalu valid (preserve jam user, default 00:00).
      const txt = timeText();
      const [h, m] = txt.split(':').map(Number);
      const hour = Number.isNaN(h) ? DEFAULT_TIME.hour : h;
      const minute = Number.isNaN(m) ? DEFAULT_TIME.minute : m;
      return local.onChange(
        formatLocalDateTimeValue(new CalendarDateTime(picked.year, picked.month, picked.day, hour, minute)),
      );
    }
    return local.onChange(formatDateValue(picked as CalendarDate));
  }

  /** Nilai jam untuk field di popup, `HH:mm`. Selalu ada nilai (default 00:00) agar Ark bisa mengedit. */
  const timeText = () => {
    const dt = parseLocalDateTimeValue(local.value);
    const t = dt ? { hour: dt.hour, minute: dt.minute } : DEFAULT_TIME;
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(t.hour)}:${pad(t.minute)}`;
  };

  /** Ubah jam dari field di popup. Tanpa tanggal dipilih, jam tidak memicu onChange agar state tetap bersih. */
  function changeTime(text: string) {
    const [h, m] = text.split(':').map(Number);
    if (h === undefined || m === undefined || Number.isNaN(h) || Number.isNaN(m)) return;
    // Hanya update jika sudah ada tanggal — kalau tidak ada tanggal, perubahan jam tidak disimpan.
    // Ini mencegah emit nilai tidak lengkap ketika user edit jam sebelum pilih tanggal.
    const base = parseLocalDateTimeValue(local.value) ?? parseDateValue(local.value);
    if (!base) return;
    local.onChange(
      formatLocalDateTimeValue(new CalendarDateTime(base.year, base.month, base.day, h, m)),
    );
  }

  return (
    <ArkDatePicker.Root
      value={parsed()}
      onValueChange={(details) => emit(details.value[0])}
      locale="id-ID"
      selectionMode="single"
      defaultView={isMonth() ? 'month' : 'day'}
      minView={isMonth() ? 'month' : 'day'}
      maxView="year"
      closeOnSelect={!withTime()}
      disabled={local.disabled}
      positioning={{ placement: 'bottom-start', gutter: 4 }}
      format={
        isMonth()
          ? (date, { locale }) =>
              new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
                date.toDate('UTC'),
              )
          : undefined
      }
      class={cn('relative w-full', local.class)}
    >
      <ArkDatePicker.Control class="relative">
        <ArkDatePicker.Input
          id={local.id}
          aria-label={local['aria-label']}
          aria-required={local.required || undefined}
          placeholder={local.placeholder ?? (isMonth() ? 'Pilih bulan' : 'Pilih tanggal')}
          class={inputClass}
        />
        <ArkDatePicker.Trigger
          aria-label={isMonth() ? 'Buka pemilih bulan' : 'Buka kalender'}
          class="text-muted-foreground hover:text-foreground absolute top-1/2 right-1.5 grid size-7 -translate-y-1/2 place-items-center rounded-md transition-colors disabled:pointer-events-none disabled:opacity-50"
        >
          <CalendarDays class="size-4" />
        </ArkDatePicker.Trigger>
      </ArkDatePicker.Control>

      {(() => {
        const positioner = (
        <ArkDatePicker.Positioner class="z-50">
          <ArkDatePicker.Content class="bg-popover text-popover-foreground data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 w-72 rounded-md border p-3 shadow-md outline-none">
            <ArkDatePicker.Context>
              {(api) => (
                <>
                  <ArkDatePicker.View view="day" class="grid gap-3">
                    <DatePickerHeader />
                    <ArkDatePicker.Table class="w-full border-collapse">
                      <ArkDatePicker.TableHead>
                        <ArkDatePicker.TableRow>
                          <For each={api().weekDays}>
                            {(weekDay) => (
                              <ArkDatePicker.TableHeader class="text-muted-foreground w-8 pb-1 text-center text-xs font-medium">
                                {weekDay.short}
                              </ArkDatePicker.TableHeader>
                            )}
                          </For>
                        </ArkDatePicker.TableRow>
                      </ArkDatePicker.TableHead>
                      <ArkDatePicker.TableBody>
                        <For each={api().weeks}>
                          {(week) => (
                            <ArkDatePicker.TableRow>
                              <For each={week}>
                                {(day) => (
                                  <ArkDatePicker.TableCell value={day}>
                                    <ArkDatePicker.TableCellTrigger class={cellTriggerClass}>
                                      {day.day}
                                    </ArkDatePicker.TableCellTrigger>
                                  </ArkDatePicker.TableCell>
                                )}
                              </For>
                            </ArkDatePicker.TableRow>
                          )}
                        </For>
                      </ArkDatePicker.TableBody>
                    </ArkDatePicker.Table>
                  </ArkDatePicker.View>

                  <ArkDatePicker.View view="month" class="grid gap-3">
                    <DatePickerHeader />
                    <ArkDatePicker.Table columns={3} class="w-full border-collapse">
                      <ArkDatePicker.TableBody>
                        <For each={api().getMonthsGrid({ columns: 3, format: 'short' })}>
                          {(months) => (
                            <ArkDatePicker.TableRow>
                              <For each={months}>
                                {(month) => (
                                  <ArkDatePicker.TableCell value={month.value} disabled={month.disabled}>
                                    <ArkDatePicker.TableCellTrigger
                                      class={cn(cellTriggerClass, 'h-9 w-full')}
                                    >
                                      {month.label}
                                    </ArkDatePicker.TableCellTrigger>
                                  </ArkDatePicker.TableCell>
                                )}
                              </For>
                            </ArkDatePicker.TableRow>
                          )}
                        </For>
                      </ArkDatePicker.TableBody>
                    </ArkDatePicker.Table>
                  </ArkDatePicker.View>

                  <ArkDatePicker.View view="year" class="grid gap-3">
                    <DatePickerHeader />
                    <ArkDatePicker.Table columns={4} class="w-full border-collapse">
                      <ArkDatePicker.TableBody>
                        <For each={api().getYearsGrid({ columns: 4 })}>
                          {(years) => (
                            <ArkDatePicker.TableRow>
                              <For each={years}>
                                {(year) => (
                                  <ArkDatePicker.TableCell value={year.value} disabled={year.disabled}>
                                    <ArkDatePicker.TableCellTrigger
                                      class={cn(cellTriggerClass, 'h-9 w-full')}
                                    >
                                      {year.label}
                                    </ArkDatePicker.TableCellTrigger>
                                  </ArkDatePicker.TableCell>
                                )}
                              </For>
                            </ArkDatePicker.TableRow>
                          )}
                        </For>
                      </ArkDatePicker.TableBody>
                    </ArkDatePicker.Table>
                  </ArkDatePicker.View>
                  <Show when={withTime()}>
                    <div class="mt-3 flex items-center justify-between gap-2 border-t pt-3">
                      <span class="text-muted-foreground text-sm">Jam</span>
                      <input
                        type="time"
                        aria-label="Jam"
                        value={timeText()}
                        onInput={(e) => changeTime(e.currentTarget.value)}
                        class="border-input focus-visible:ring-ring/50 h-9 w-28 rounded-md border bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px]"
                      />
                    </div>
                  </Show>
                </>
              )}
            </ArkDatePicker.Context>
          </ArkDatePicker.Content>
        </ArkDatePicker.Positioner>
        );
        return local.portal === false ? positioner : <Portal>{positioner}</Portal>;
      })()}
    </ArkDatePicker.Root>
  );
}

/** Navigasi kalender: panah sebelumnya, judul (klik untuk pindah tampilan), panah berikutnya. */
function DatePickerHeader() {
  return (
    <div class="flex items-center justify-between gap-2">
      <ArkDatePicker.PrevTrigger class={navButtonClass} aria-label="Sebelumnya">
        <ChevronLeft class="size-4" />
      </ArkDatePicker.PrevTrigger>
      <ArkDatePicker.ViewTrigger class="hover:bg-accent rounded-md px-2 py-1 text-sm font-medium transition-colors">
        <ArkDatePicker.RangeText />
      </ArkDatePicker.ViewTrigger>
      <ArkDatePicker.NextTrigger class={navButtonClass} aria-label="Berikutnya">
        <ChevronRight class="size-4" />
      </ArkDatePicker.NextTrigger>
    </div>
  );
}
