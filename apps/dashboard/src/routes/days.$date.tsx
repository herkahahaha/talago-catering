import { For, Show, createEffect, createSignal } from 'solid-js';
import { Link, createFileRoute, useNavigate } from '@tanstack/solid-router';
import { useQuery, useQueryClient } from '@tanstack/solid-query';
import type { DaySettingsDto, MenuAvailabilityItemDto, OrderSettingsDto } from '@catering/contracts';
import { ArrowLeft, CalendarDays, CircleAlert, Info, Plus, Save, Trash2, TriangleAlert } from 'lucide-solid';
import { AppShell } from '~/components/AppShell';
import { api, ApiError } from '~/lib/api';
import {
  formatDate,
  formatShortDate,
  fromWibInputValue,
  todayWib,
  toWibInputValue,
  weekRange,
} from '~/lib/format';
import { Alert, AlertDescription, AlertTitle } from '~/components/ui/alert';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '~/components/ui/alert-dialog';
import { Badge } from '~/components/ui/badge';
import { Button, buttonVariants } from '~/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card';
import { Checkbox } from '~/components/ui/checkbox';
import { EmptyState } from '~/components/ui/empty-state';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import { Progress } from '~/components/ui/progress';

export const Route = createFileRoute('/days/$date')({
  component: DaySettingsPage,
});

interface WindowDraft {
  id?: string;
  label: string;
  startTime: string;
  endTime: string;
  maxStops: number;
}

function DaySettingsPage() {
  const params = Route.useParams();
  const date = () => params().date;
  const navigate = useNavigate();
  const day = useQuery(() => ({
    queryKey: ['admin-day', date()],
    queryFn: () => api.get<DaySettingsDto>(`/admin/days/${date()}`),
  }));

  return (
    <AppShell
      title="Pengaturan hari"
      subtitle={formatDate(date())}
      actions={
        <div class='flex items-end align-bottom gap-4'>
          <div class="grid gap-1.5">
            <Label for="day-date" class="text-xs">
              Tanggal
            </Label>
            <Input
              id="day-date"
              type="date"
              class="w-40"
              value={date()}
              onChange={(event) => {
                if (event.currentTarget.value) {
                  void navigate({ to: '/days/$date', params: { date: event.currentTarget.value } });
                }
              }}
            />
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => void navigate({ to: '/days/$date', params: { date: todayWib() } })}
          >
            Hari ini
          </Button>
          <Link class={buttonVariants({ variant: 'outline' })} to="/">
            <ArrowLeft />
            Semua pesanan
          </Link>
        </div>
      }
    >
      <Show
        when={day.data}
        fallback={
          <Card class="py-0">
            <EmptyState
              icon={<CalendarDays />}
              title={day.isLoading ? 'Memuat pengaturan…' : 'Gagal memuat pengaturan'}
              description={day.isLoading ? undefined : 'Coba muat ulang halaman atau pilih tanggal lain.'}
            />
          </Card>
        }
      >
        {(data) => <DayForm day={data()} date={date()} />}
      </Show>
    </AppShell>
  );
}

function DayForm(props: { day: DaySettingsDto; date: string }) {
  const queryClient = useQueryClient();
  const [maxRegular, setMaxRegular] = createSignal(props.day.maxRegular);
  const [maxPo, setMaxPo] = createSignal(props.day.maxPo);
  const [kitchenMaxTotal, setKitchenMaxTotal] = createSignal(props.day.kitchenMaxTotal);
  const [targetMin, setTargetMin] = createSignal(props.day.targetMin);
  const [holdCeiling, setHoldCeiling] = createSignal(props.day.holdCeiling);
  const [cutOffAt, setCutOffAt] = createSignal(toWibInputValue(props.day.cutoffAt));
  const [isOpen, setIsOpen] = createSignal(props.day.isOpen);
  const [windows, setWindows] = createSignal<WindowDraft[]>(
    props.day.windows.map((window) => ({
      ...(window.id ? { id: window.id } : {}),
      label: window.label,
      startTime: window.startTime,
      endTime: window.endTime,
      maxStops: window.maxStops,
    })),
  );
  const menu = useQuery(() => ({
    queryKey: ['admin-menu', props.date],
    queryFn: () => api.get<MenuAvailabilityItemDto[]>(`/admin/days/${props.date}/menu`),
  }));
  const [menuState, setMenuState] = createSignal<Record<string, boolean>>({});
  const [menuSaving, setMenuSaving] = createSignal(false);
  const [menuSaved, setMenuSaved] = createSignal(false);
  const [saving, setSaving] = createSignal(false);
  const [error, setError] = createSignal<{ message: string; hint?: string } | null>(null);
  const [saved, setSaved] = createSignal(false);
  const [notice, setNotice] = createSignal<string | null>(null);
  const [weekSaving, setWeekSaving] = createSignal(false);
  const [weekConfirmOpen, setWeekConfirmOpen] = createSignal(false);
  const [settingsSaving, setSettingsSaving] = createSignal(false);
  const [minPortions, setMinPortions] = createSignal(50);
  const [maxPortions, setMaxPortions] = createSignal(200);
  const [holdMinutes, setHoldMinutes] = createSignal(10);

  const orderSettings = useQuery(() => ({
    queryKey: ['order-settings'],
    queryFn: () => api.get<OrderSettingsDto>('/admin/settings/order'),
  }));

  createEffect(() => {
    const data = orderSettings.data;
    if (data) {
      setMinPortions(data.minPortions);
      setMaxPortions(data.maxPortionsPerOrder);
      setHoldMinutes(data.holdMinutes);
    }
  });

  createEffect(() => {
    setMaxRegular(props.day.maxRegular);
    setMaxPo(props.day.maxPo);
    setKitchenMaxTotal(props.day.kitchenMaxTotal);
    setTargetMin(props.day.targetMin);
    setHoldCeiling(props.day.holdCeiling);
    setCutOffAt(toWibInputValue(props.day.cutoffAt));
    setIsOpen(props.day.isOpen);
    setWindows(
      props.day.windows.map((window) => ({
        ...(window.id ? { id: window.id } : {}),
        label: window.label,
        startTime: window.startTime,
        endTime: window.endTime,
        maxStops: window.maxStops,
      })),
    );
  });

  createEffect(() => {
    if (menu.data) {
      setMenuState(Object.fromEntries(menu.data.map((item) => [item.id, item.isAvailable])));
    }
  });

  async function saveMenu() {
    if (!menu.data) return;
    setMenuSaving(true);
    setError(null);
    try {
      await api.put(`/admin/days/${props.date}/menu`, {
        items: menu.data.map((item) => ({
          menuItemId: item.id,
          isAvailable: menuState()[item.id] ?? false,
        })),
      });
      setMenuSaved(true);
      window.setTimeout(() => setMenuSaved(false), 2500);
    } catch (err) {
      if (err instanceof ApiError) {
        setError({ message: err.message, ...(err.hint ? { hint: err.hint } : {}) });
      } else {
        setError({ message: 'Gagal menyimpan menu.' });
      }
    } finally {
      setMenuSaving(false);
    }
  }

  const ruleBreached = () => maxRegular() + maxPo() > kitchenMaxTotal();
  const week = () => weekRange(props.date);
  const reservedRatio = () =>
    props.day.maxRegular > 0 ? Math.min(100, (props.day.reservedRegular / props.day.maxRegular) * 100) : 0;
  const reservedPoRatio = () =>
    props.day.maxPo > 0 ? Math.min(100, (props.day.reservedPo / props.day.maxPo) * 100) : 0;

  function dayPayload() {
    return {
      maxRegular: maxRegular(),
      maxPo: maxPo(),
      kitchenMaxTotal: kitchenMaxTotal(),
      targetMin: targetMin(),
      holdCeiling: holdCeiling(),
      cutOffAt: fromWibInputValue(cutOffAt()),
      isOpen: isOpen(),
      windows: windows().map((window) => ({
        ...(window.id ? { id: window.id } : {}),
        label: window.label,
        startTime: window.startTime,
        endTime: window.endTime,
        maxStops: window.maxStops,
      })),
    };
  }

  async function saveOrderSettings() {
    setSettingsSaving(true);
    setError(null);
    try {
      await api.put('/admin/settings/order', {
        minPortions: minPortions(),
        maxPortionsPerOrder: maxPortions(),
        holdMinutes: holdMinutes(),
      });
      await queryClient.invalidateQueries({ queryKey: ['order-settings'] });
      await queryClient.invalidateQueries({ queryKey: ['admin-day', props.date] });
      setNotice('Aturan checkout tersimpan. Plafon hold hari ke depan ikut disesuaikan.');
      window.setTimeout(() => setNotice(null), 4000);
    } catch (err) {
      if (err instanceof ApiError) {
        setError({ message: err.message, ...(err.hint ? { hint: err.hint } : {}) });
      } else {
        setError({ message: 'Gagal menyimpan aturan checkout.' });
      }
    } finally {
      setSettingsSaving(false);
    }
  }

  async function applyWeek() {
    setWeekConfirmOpen(false);
    setWeekSaving(true);
    setError(null);
    try {
      await api.put(`/admin/days/week/${props.date}`, dayPayload());
      await queryClient.invalidateQueries({ queryKey: ['admin-day', props.date] });
      setNotice('Pengaturan diterapkan ke 7 hari dalam minggu ini.');
      window.setTimeout(() => setNotice(null), 4000);
    } catch (err) {
      if (err instanceof ApiError) {
        setError({ message: err.message, ...(err.hint ? { hint: err.hint } : {}) });
      } else {
        setError({ message: 'Gagal menerapkan pengaturan mingguan.' });
      }
    } finally {
      setWeekSaving(false);
    }
  }

  function updateWindow(index: number, patch: Partial<WindowDraft>) {
    setWindows((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function addWindow() {
    setWindows((rows) => [
      ...rows,
      { label: 'Jendela baru', startTime: '11:00', endTime: '13:00', maxStops: 10 },
    ]);
  }

  function removeWindow(index: number) {
    setWindows((rows) => rows.filter((_, i) => i !== index));
  }

  async function save(event: SubmitEvent) {
    event.preventDefault();
    if (ruleBreached()) {
      setError({
        message: `max_regular (${maxRegular()}) + max_po (${maxPo()}) melebihi kapasitas dapur (${kitchenMaxTotal()}).`,
      });
      return;
    }
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await api.put(`/admin/days/${props.date}`, dayPayload());
      await queryClient.invalidateQueries({ queryKey: ['admin-day', props.date] });
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      if (err instanceof ApiError) {
        setError({ message: err.message, ...(err.hint ? { hint: err.hint } : {}) });
      } else {
        setError({ message: 'Gagal menyimpan pengaturan.' });
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} class="grid items-start gap-6 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
      <div class="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Kapasitas</CardTitle>
            <CardDescription>
              max_regular + max_po tidak boleh melebihi kapasitas dapur. Nilai di bawah porsi terpesan akan
              ditolak sistem.
            </CardDescription>
          </CardHeader>
          <CardContent class="grid gap-4">
            <div class="grid gap-4 sm:grid-cols-2">
              <div class="grid gap-2">
                <Label for="maxRegular">Kapasitas reguler (porsi)</Label>
                <Input
                  id="maxRegular"
                  type="number"
                  min={0}
                  max={5000}
                  value={maxRegular()}
                  onInput={(event) => setMaxRegular(Number(event.currentTarget.value))}
                />
                <p class="text-muted-foreground text-xs">
                  Terpesan saat ini: {props.day.reservedRegular} porsi
                </p>
              </div>
              <div class="grid gap-2">
                <Label for="maxPo">Kapasitas PO (porsi)</Label>
                <Input
                  id="maxPo"
                  type="number"
                  min={0}
                  max={5000}
                  value={maxPo()}
                  onInput={(event) => setMaxPo(Number(event.currentTarget.value))}
                />
                <p class="text-muted-foreground text-xs">PO terpesan: {props.day.reservedPo} porsi</p>
              </div>
            </div>

            <div class="grid gap-4 sm:grid-cols-2">
              <div class="grid gap-2">
                <Label for="kitchenMaxTotal">Kapasitas dapur total</Label>
                <Input
                  id="kitchenMaxTotal"
                  type="number"
                  min={1}
                  max={10000}
                  value={kitchenMaxTotal()}
                  onInput={(event) => setKitchenMaxTotal(Number(event.currentTarget.value))}
                />
              </div>
              <div class="grid gap-2">
                <Label for="targetMin">Target minimum produksi</Label>
                <Input
                  id="targetMin"
                  type="number"
                  min={0}
                  max={5000}
                  value={targetMin()}
                  onInput={(event) => setTargetMin(Number(event.currentTarget.value))}
                />
                <p class="text-muted-foreground text-xs">
                  Target produksi harian — bukan batas porsi per pesanan.
                </p>
              </div>
            </div>

            <div class="grid gap-4 sm:grid-cols-2">
              <div class="grid gap-2">
                <Label for="holdCeiling">Plafon hold (porsi)</Label>
                <Input
                  id="holdCeiling"
                  type="number"
                  min={0}
                  max={5000}
                  value={holdCeiling()}
                  onInput={(event) => setHoldCeiling(Number(event.currentTarget.value))}
                />
                <p class="text-muted-foreground text-xs">Hold aktif: {props.day.heldRegular} porsi</p>
              </div>
              <div class="grid gap-2">
                <Label for="cutOffAt">Cut-off (WIB)</Label>
                <Input
                  id="cutOffAt"
                  type="datetime-local"
                  value={cutOffAt()}
                  onInput={(event) => setCutOffAt(event.currentTarget.value)}
                />
              </div>
            </div>

            <div class="bg-muted/40 flex items-start justify-between gap-3 rounded-lg border p-3">
              <Checkbox
                checked={isOpen()}
                onChange={setIsOpen}
                aria-label="Hari layanan dibuka untuk pemesanan"
              >
                Hari layanan dibuka untuk pemesanan
              </Checkbox>
              <Badge variant={isOpen() ? 'success' : 'neutral'}>{isOpen() ? 'Buka' : 'Tutup'}</Badge>
            </div>

            <Show when={ruleBreached()}>
              <Alert variant="destructive">
                <TriangleAlert />
                <AlertTitle>Aturan kapasitas dilanggar</AlertTitle>
                <AlertDescription>
                  {maxRegular()} + {maxPo()} &gt; {kitchenMaxTotal()}. Kurangi kapasitas reguler atau PO
                  sebelum menyimpan.
                </AlertDescription>
              </Alert>
            </Show>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Aturan checkout (global)</CardTitle>
            <CardDescription>
              Berlaku untuk semua tanggal. Target minimum produksi di atas adalah target dapur, bukan batas
              porsi yang bisa dipesan pelanggan.
            </CardDescription>
          </CardHeader>
          <CardContent class="grid gap-4">
            <div class="grid gap-4 sm:grid-cols-2">
              <div class="grid gap-2">
                <Label for="minPortions">Minimal porsi per order</Label>
                <Input
                  id="minPortions"
                  type="number"
                  min={1}
                  max={5000}
                  value={minPortions()}
                  onInput={(event) => setMinPortions(Number(event.currentTarget.value))}
                />
              </div>
              <div class="grid gap-2">
                <Label for="maxPortions">Maksimal porsi per order</Label>
                <Input
                  id="maxPortions"
                  type="number"
                  min={1}
                  max={5000}
                  value={maxPortions()}
                  onInput={(event) => setMaxPortions(Number(event.currentTarget.value))}
                />
                <p class="text-muted-foreground text-xs">
                  Saat ini: {orderSettings.data?.maxPortionsPerOrder ?? '—'} porsi per order
                </p>
              </div>
            </div>
            <div class="grid max-w-40 gap-2">
              <Label for="holdMinutes">Hold pembayaran (menit)</Label>
              <Input
                id="holdMinutes"
                type="number"
                min={1}
                max={120}
                value={holdMinutes()}
                onInput={(event) => setHoldMinutes(Number(event.currentTarget.value))}
              />
            </div>

            <Show when={orderSettings.data && holdCeiling() < orderSettings.data!.maxPortionsPerOrder}>
              <Alert variant="warning">
                <TriangleAlert />
                <AlertTitle>Plafon hold lebih kecil dari batas maksimal order</AlertTitle>
                <AlertDescription>
                  Plafon hold hari ini ({holdCeiling()} porsi) lebih kecil dari batas maksimal per order (
                  {orderSettings.data!.maxPortionsPerOrder} porsi). Order sebesar batas tersebut akan ditolak{' '}
                  <code>HOLD_LIMIT</code>. Naikkan plafon hold minimal sama.
                </AlertDescription>
              </Alert>
            </Show>

            <div class="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void saveOrderSettings()}
                disabled={settingsSaving()}
              >
                <Save />
                {settingsSaving() ? 'Menyimpan…' : 'Simpan aturan checkout'}
              </Button>
              <span class="text-muted-foreground text-xs">Perubahan berlaku untuk pesanan baru.</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div class="flex flex-wrap items-start justify-between gap-2">
              <div class="grid gap-1.5">
                <CardTitle>Jendela antar</CardTitle>
                <CardDescription>Kosongkan bila pengaturan jam antar diserahkan ke admin.</CardDescription>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={addWindow}>
                <Plus />
                Jendela
              </Button>
            </div>
          </CardHeader>
          <CardContent class="grid gap-3">
            <Show when={windows().length === 0}>
              <div class="text-muted-foreground rounded-lg border border-dashed p-4 text-center text-xs">
                Belum ada jendela antar untuk tanggal ini.
              </div>
            </Show>
            <For each={windows()}>
              {(window, index) => (
                <div class="grid grid-cols-2 items-end gap-2 sm:grid-cols-[minmax(0,1.4fr)_7rem_7rem_6rem_auto]">
                  <div class="col-span-2 grid gap-2 sm:col-span-1">
                    <Label>Label</Label>
                    <Input
                      value={window.label}
                      onInput={(event) => updateWindow(index(), { label: event.currentTarget.value })}
                    />
                  </div>
                  <div class="grid gap-2">
                    <Label>Mulai</Label>
                    <Input
                      type="time"
                      value={window.startTime}
                      onInput={(event) => updateWindow(index(), { startTime: event.currentTarget.value })}
                    />
                  </div>
                  <div class="grid gap-2">
                    <Label>Selesai</Label>
                    <Input
                      type="time"
                      value={window.endTime}
                      onInput={(event) => updateWindow(index(), { endTime: event.currentTarget.value })}
                    />
                  </div>
                  <div class="grid gap-2">
                    <Label>Max stop</Label>
                    <Input
                      type="number"
                      min={0}
                      value={window.maxStops}
                      onInput={(event) =>
                        updateWindow(index(), { maxStops: Number(event.currentTarget.value) })
                      }
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Hapus jendela antar"
                    onClick={() => removeWindow(index())}
                  >
                    <Trash2 />
                  </Button>
                </div>
              )}
            </For>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div class="flex flex-wrap items-start justify-between gap-2">
              <div class="grid gap-1.5">
                <CardTitle>Menu tanggal ini</CardTitle>
                <CardDescription>
                  Hidangan yang tidak dicentang tidak tampil di storefront untuk tanggal ini.
                </CardDescription>
              </div>
              <div class="flex items-center gap-2">
                <Show when={menuSaved()}>
                  <Badge variant="success">Tersimpan</Badge>
                </Show>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void saveMenu()}
                  disabled={menuSaving() || !menu.data}
                >
                  {menuSaving() ? 'Menyimpan…' : 'Simpan menu'}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Show
              when={menu.data?.length}
              fallback={<p class="text-muted-foreground text-sm">Katalog hidangan belum tersedia.</p>}
            >
              <div class="divide-y rounded-lg border">
                <For each={menu.data ?? []}>
                  {(item) => (
                    <div class="hover:bg-muted/40 flex items-center gap-3 px-3 py-2.5 transition-colors">
                      <Checkbox
                        checked={menuState()[item.id] ?? false}
                        onChange={(checked) =>
                          setMenuState((current) => ({ ...current, [item.id]: checked }))
                        }
                        aria-label={`Ketersediaan ${item.name}`}
                      />
                      <span class="min-w-0 flex-1 truncate text-sm">{item.name}</span>
                      <span class="text-muted-foreground text-xs">{item.category}</span>
                      <span class="text-muted-foreground w-20 text-right text-xs tabular-nums">
                        {item.price.toLocaleString('id-ID')}
                      </span>
                    </div>
                  )}
                </For>
              </div>
            </Show>
          </CardContent>
        </Card>

        <Show when={error()}>
          <Alert variant="destructive">
            <CircleAlert />
            <AlertTitle>{error()!.message}</AlertTitle>
            <Show when={error()!.hint}>
              <AlertDescription>{error()!.hint}</AlertDescription>
            </Show>
          </Alert>
        </Show>
      </div>

      <aside class="grid gap-4 xl:sticky xl:top-20">
        <Card>
          <CardHeader>
            <CardTitle>Ringkasan</CardTitle>
            <CardDescription>Kondisi kapasitas tanggal ini.</CardDescription>
          </CardHeader>
          <CardContent class="grid gap-4">
            <div class="grid gap-2">
              <div class="flex items-center justify-between text-sm">
                <span class="text-muted-foreground">Reguler</span>
                <span class="tabular-nums">
                  {props.day.reservedRegular} / {props.day.maxRegular} porsi
                </span>
              </div>
              <Progress value={reservedRatio()} indicatorClass="bg-primary" />
            </div>
            <div class="grid gap-2">
              <div class="flex items-center justify-between text-sm">
                <span class="text-muted-foreground">PO terpesan</span>
                <span class="tabular-nums">
                  {props.day.reservedPo} / {props.day.maxPo} porsi
                </span>
              </div>
              <Progress value={reservedPoRatio()} indicatorClass="bg-sky-500" />
            </div>
            <div class="flex items-center justify-between text-sm">
              <span class="text-muted-foreground">Status</span>
              <Badge
                variant={
                  props.day.cutoffPassed
                    ? 'neutral'
                    : props.day.maxRegular > 0 && props.day.reservedRegular >= props.day.maxRegular
                      ? 'warning'
                      : 'success'
                }
              >
                {props.day.cutoffPassed
                  ? 'Cut-off lewat'
                  : props.day.maxRegular > 0 && props.day.reservedRegular >= props.day.maxRegular
                    ? 'Kapasitas penuh'
                    : 'Menerima pesanan'}
              </Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Aksi</CardTitle>
            <CardDescription>Simpan perubahan atau terapkan ke seluruh minggu.</CardDescription>
          </CardHeader>
          <CardContent class="grid gap-2">
            <Button type="submit" class="w-full" disabled={saving() || ruleBreached()}>
              <Save />
              {saving() ? 'Menyimpan…' : 'Simpan pengaturan'}
            </Button>
            <Button
              type="button"
              variant="outline"
              class="w-full"
              onClick={() => setWeekConfirmOpen(true)}
              disabled={weekSaving() || ruleBreached()}
            >
              {weekSaving() ? 'Menerapkan…' : 'Terapkan ke minggu ini'}
            </Button>
            <p class="text-muted-foreground text-center text-xs">
              {formatShortDate(week().start)} – {formatShortDate(week().end)}
            </p>
            <Show when={saved()}>
              <Badge variant="success" class="mx-auto">
                Tersimpan
              </Badge>
            </Show>
          </CardContent>
        </Card>

        <Show when={notice()}>
          <Alert variant="info">
            <Info />
            <AlertDescription>{notice()}</AlertDescription>
          </Alert>
        </Show>

        <Alert variant="info">
          <Info />
          <AlertTitle>Perubahan tetap diaudit</AlertTitle>
          <AlertDescription>
            Perubahan setelah cut-off tetap dicatat di audit log. Menurunkan kapasitas di bawah porsi yang
            sudah terpesan akan ditolak.
          </AlertDescription>
        </Alert>
      </aside>

      <AlertDialog open={weekConfirmOpen()} onOpenChange={setWeekConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Terapkan ke 7 hari?</AlertDialogTitle>
            <AlertDialogDescription>
              Kapasitas, cut-off, dan jendela antar yang sama akan diterapkan ke 7 hari (
              {formatShortDate(week().start)} – {formatShortDate(week().end)}). Target minimum produksi juga
              ikut. Menu per tanggal tidak berubah.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel class={buttonVariants({ variant: 'outline' })}>Batal</AlertDialogCancel>
            <Button type="button" onClick={() => void applyWeek()}>
              Terapkan
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </form>
  );
}
