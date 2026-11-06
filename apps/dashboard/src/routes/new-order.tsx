import { For, Show, createMemo, createSignal } from 'solid-js';
import { Link, createFileRoute } from '@tanstack/solid-router';
import { useQuery } from '@tanstack/solid-query';
import type { AdminMenuItemDto, CreatedOrderDto } from '@catering/contracts';
import { ArrowLeft, CircleAlert, CircleCheck, Plus, Trash2 } from 'lucide-solid';
import { AppShell } from '~/components/AppShell';
import { StatusBadge } from '~/components/StatusBadge';
import { api, ApiError } from '~/lib/api';
import { addDays, rp, todayWib } from '~/lib/format';
import { Alert, AlertDescription, AlertTitle } from '~/components/ui/alert';
import { Button, buttonVariants } from '~/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import { Select } from '~/components/ui/select';
import { Separator } from '~/components/ui/separator';
import { Textarea } from '~/components/ui/textarea';

export const Route = createFileRoute('/new-order')({
  component: NewOrderPage,
});

interface ItemRow {
  menuItemId: string;
  portions: number;
}

const SOURCE_OPTIONS = [
  { value: 'manual', label: 'Manual (reguler)' },
  { value: 'po', label: 'PO (partisi PO)' },
];

const METHOD_OPTIONS = [
  { value: 'cash', label: 'Tunai (langsung lunas)' },
  { value: 'qris', label: 'QRIS (menunggu bayar)' },
  { value: 'va', label: 'Virtual Account (menunggu bayar)' },
];

function NewOrderPage() {
  const [source, setSource] = createSignal<'po' | 'manual'>('manual');
  const [serviceDate, setServiceDate] = createSignal(addDays(todayWib(), 2));
  const [name, setName] = createSignal('');
  const [phone, setPhone] = createSignal('');
  const [email, setEmail] = createSignal('');
  const [addressLine, setAddressLine] = createSignal('Ambil di tempat');
  const [district, setDistrict] = createSignal('Pontianak Kota');
  const [method, setMethod] = createSignal<'cash' | 'qris' | 'va'>('cash');
  const [notes, setNotes] = createSignal('');
  const [rows, setRows] = createSignal<ItemRow[]>([]);
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal<{ message: string; hint?: string } | null>(null);
  const [created, setCreated] = createSignal<CreatedOrderDto | null>(null);

  const catalog = useQuery(() => ({
    queryKey: ['admin-catalog'],
    queryFn: () => api.get<AdminMenuItemDto[]>('/admin/catalog'),
  }));

  const activeItems = createMemo(() => (catalog.data ?? []).filter((item) => item.isActive));

  const itemsById = createMemo(() => {
    const map = new Map<string, AdminMenuItemDto>();
    for (const item of catalog.data ?? []) map.set(item.id, item);
    return map;
  });

  const itemOptions = createMemo(() =>
    activeItems().map((item) => ({ value: item.id, label: `${item.name} — ${rp(item.price)}` })),
  );

  const portions = createMemo(() => rows().reduce((sum, row) => sum + row.portions, 0));
  const total = createMemo(() =>
    rows().reduce((sum, row) => sum + (itemsById().get(row.menuItemId)?.price ?? 0) * row.portions, 0),
  );

  function addRow() {
    const first = activeItems()[0];
    if (!first) return;
    setRows((current) => [...current, { menuItemId: first.id, portions: 50 }]);
  }

  function updateRow(index: number, patch: Partial<ItemRow>) {
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    setError(null);
    if (rows().length === 0) {
      setError({ message: 'Tambahkan minimal satu hidangan.' });
      return;
    }
    setBusy(true);
    try {
      const result = await api.post<CreatedOrderDto>('/admin/orders', {
        source: source(),
        serviceDate: serviceDate(),
        customerName: name().trim(),
        customerPhone: phone().trim(),
        ...(email().trim() ? { customerEmail: email().trim() } : {}),
        items: rows().map((row) => ({ menuItemId: row.menuItemId, portions: row.portions })),
        addressLine: addressLine().trim(),
        district: district().trim(),
        paymentMethod: method(),
        ...(notes().trim() ? { notes: notes().trim() } : {}),
      });
      setCreated(result);
    } catch (err) {
      if (err instanceof ApiError) {
        setError({ message: err.message, ...(err.hint ? { hint: err.hint } : {}) });
      } else {
        setError({ message: 'Gagal membuat order.' });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell
      title="Order manual / PO"
      subtitle="Untuk pesanan telepon, PO korporat, dan pesanan setelah cut-off (dengan audit log)."
      actions={
        <Link class={buttonVariants({ variant: 'outline' })} to="/">
          <ArrowLeft />
          Semua pesanan
        </Link>
      }
    >
      <Show
        when={!created()}
        fallback={
          <Card class="mx-auto max-w-xl">
            <CardHeader>
              <div class="mb-2 flex size-10 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                <CircleCheck class="size-5" />
              </div>
              <CardTitle class="text-xl">Order berhasil dibuat</CardTitle>
              <CardDescription>
                Pesanan manual/PO langsung tercatat dan masuk ke rekap produksi.
              </CardDescription>
            </CardHeader>
            <CardContent class="grid gap-4">
              <dl class="grid gap-3 rounded-lg border p-4 text-sm">
                <div class="flex items-center justify-between gap-4">
                  <dt class="text-muted-foreground">Nomor order</dt>
                  <dd class="font-mono font-medium">{created()!.order.orderNo}</dd>
                </div>
                <div class="flex items-center justify-between gap-4">
                  <dt class="text-muted-foreground">Total</dt>
                  <dd class="font-medium tabular-nums">{rp(created()!.order.total)}</dd>
                </div>
                <div class="flex items-center justify-between gap-4">
                  <dt class="text-muted-foreground">Status</dt>
                  <dd>
                    <StatusBadge status={created()!.order.status} />
                  </dd>
                </div>
              </dl>
              <div class="grid gap-2">
                <p class="text-muted-foreground text-xs">Tautan status untuk pelanggan:</p>
                <code class="bg-muted block overflow-x-auto rounded-md p-2 text-xs">
                  {created()!.statusUrl}
                </code>
              </div>
              <div class="flex flex-wrap gap-2">
                <Link
                  class={buttonVariants()}
                  to="/orders/$orderId"
                  params={{ orderId: created()!.order.id }}
                >
                  Buka detail
                </Link>
                <Link class={buttonVariants({ variant: 'outline' })} to="/">
                  Kembali ke daftar
                </Link>
              </div>
            </CardContent>
          </Card>
        }
      >
        <form onSubmit={submit} class="grid items-start gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <div class="grid gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Sumber &amp; pelanggan</CardTitle>
                <CardDescription>Data kontak dipakai untuk notifikasi status pesanan.</CardDescription>
              </CardHeader>
              <CardContent class="grid gap-4">
                <div class="grid gap-4 sm:grid-cols-2">
                  <div class="grid gap-2">
                    <Label for="source">Sumber</Label>
                    <Select
                      id="source"
                      value={source()}
                      onChange={(value) => setSource(value as 'po' | 'manual')}
                      options={SOURCE_OPTIONS}
                      aria-label="Sumber order"
                    />
                  </div>
                  <div class="grid gap-2">
                    <Label for="date">Tanggal layanan</Label>
                    <Input
                      id="date"
                      type="date"
                      required
                      value={serviceDate()}
                      onInput={(event) => setServiceDate(event.currentTarget.value)}
                    />
                  </div>
                </div>

                <div class="grid gap-4 sm:grid-cols-2">
                  <div class="grid gap-2">
                    <Label for="name">Nama pelanggan</Label>
                    <Input
                      id="name"
                      required
                      value={name()}
                      onInput={(event) => setName(event.currentTarget.value)}
                    />
                  </div>
                  <div class="grid gap-2">
                    <Label for="phone">Nomor HP</Label>
                    <Input
                      id="phone"
                      required
                      placeholder="0812xxxxxxx"
                      value={phone()}
                      onInput={(event) => setPhone(event.currentTarget.value)}
                    />
                  </div>
                </div>

                <div class="grid gap-4 sm:grid-cols-2">
                  <div class="grid gap-2">
                    <Label for="email">Email (opsional)</Label>
                    <Input
                      id="email"
                      type="email"
                      value={email()}
                      onInput={(event) => setEmail(event.currentTarget.value)}
                    />
                  </div>
                  <div class="grid gap-2">
                    <Label for="method">Pembayaran</Label>
                    <Select
                      id="method"
                      value={method()}
                      onChange={(value) => setMethod(value as 'cash' | 'qris' | 'va')}
                      options={METHOD_OPTIONS}
                      aria-label="Metode pembayaran"
                    />
                  </div>
                </div>

                <div class="grid gap-2">
                  <Label for="address">Alamat</Label>
                  <Input
                    id="address"
                    required
                    value={addressLine()}
                    onInput={(event) => setAddressLine(event.currentTarget.value)}
                  />
                </div>

                <div class="grid gap-4 sm:grid-cols-2">
                  <div class="grid gap-2">
                    <Label for="district">Kecamatan</Label>
                    <Input
                      id="district"
                      value={district()}
                      onInput={(event) => setDistrict(event.currentTarget.value)}
                    />
                  </div>
                </div>

                <div class="grid gap-2">
                  <Label for="notes">Catatan</Label>
                  <Textarea
                    id="notes"
                    rows={2}
                    value={notes()}
                    onInput={(event) => setNotes(event.currentTarget.value)}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div class="flex flex-wrap items-start justify-between gap-2">
                  <div class="grid gap-1.5">
                    <CardTitle>Hidangan</CardTitle>
                    <CardDescription>Minimal 1 hidangan, maksimal 200 porsi per order.</CardDescription>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addRow}
                    disabled={!catalog.data?.length}
                  >
                    <Plus />
                    Hidangan
                  </Button>
                </div>
              </CardHeader>
              <CardContent class="grid gap-3">
                <Show when={rows().length === 0}>
                  <div class="text-muted-foreground rounded-lg border border-dashed p-4 text-center text-xs">
                    Belum ada hidangan. Tambahkan baris lalu pilih hidangannya.
                  </div>
                </Show>
                <For each={rows()}>
                  {(row, index) => (
                    <div class="grid items-end gap-2 sm:grid-cols-[minmax(0,1fr)_7rem_auto]">
                      <div class="grid gap-2">
                        <Label>Hidangan</Label>
                        <Select
                          value={row.menuItemId}
                          onChange={(value) => updateRow(index(), { menuItemId: value })}
                          options={itemOptions()}
                          aria-label="Pilih hidangan"
                        />
                      </div>
                      <div class="grid gap-2">
                        <Label>Porsi</Label>
                        <Input
                          type="number"
                          min={1}
                          value={row.portions}
                          onInput={(event) =>
                            updateRow(index(), { portions: Number(event.currentTarget.value) })
                          }
                        />
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label="Hapus hidangan"
                        onClick={() => setRows((current) => current.filter((_, i) => i !== index()))}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  )}
                </For>
              </CardContent>
            </Card>
          </div>

          <aside class="grid gap-4 lg:sticky lg:top-20">
            <Card>
              <CardHeader>
                <CardTitle>Ringkasan</CardTitle>
                <CardDescription>Periksa total sebelum menyimpan.</CardDescription>
              </CardHeader>
              <CardContent class="grid gap-3">
                <div class="flex items-center justify-between text-sm">
                  <span class="text-muted-foreground">Total porsi</span>
                  <strong class="tabular-nums">{portions()}</strong>
                </div>
                <div class="flex items-center justify-between text-sm">
                  <span class="text-muted-foreground">Total harga</span>
                  <strong class="tabular-nums">{rp(total())}</strong>
                </div>
                <Separator />
                <p class="text-muted-foreground text-xs leading-relaxed">
                  Order manual/PO dapat menembus cut-off dan tidak memerlukan CAPTCHA, tetapi tetap tercatat
                  di audit log.
                </p>
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

            <Button type="submit" size="lg" class="w-full" disabled={busy()}>
              {busy() ? 'Membuat order…' : 'Buat order'}
            </Button>
          </aside>
        </form>
      </Show>
    </AppShell>
  );
}
