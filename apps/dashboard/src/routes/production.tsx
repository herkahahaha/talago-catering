import { For, Show, createSignal } from 'solid-js';
import { createFileRoute } from '@tanstack/solid-router';
import { useQuery } from '@tanstack/solid-query';
import type { ProductionSummaryDto } from '@catering/contracts';
import { CalendarClock, ChefHat, LockKeyhole, Printer, StickyNote, Truck, TriangleAlert } from 'lucide-solid';
import { AppShell } from '~/components/AppShell';
import { StatCard } from '~/components/stat-card';
import { api } from '~/lib/api';
import { formatDate, todayWib } from '~/lib/format';
import { Alert, AlertDescription, AlertTitle } from '~/components/ui/alert';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Card } from '~/components/ui/card';
import { EmptyState } from '~/components/ui/empty-state';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';

export const Route = createFileRoute('/production')({
  validateSearch: (search: Record<string, unknown>) => ({
    date: typeof search.date === 'string' ? search.date : undefined,
  }),
  component: ProductionPage,
});

function ProductionPage() {
  const search = Route.useSearch();
  const [date, setDate] = createSignal(search().date ?? todayWib());
  const production = useQuery(() => ({
    queryKey: ['production', date()],
    queryFn: () => api.get<ProductionSummaryDto>(`/admin/production?date=${date()}`),
  }));

  const total = () => production.data?.totalPortions ?? 0;
  const target = () => production.data?.targetMin ?? 0;

  return (
    <AppShell
      title="Rekap produksi"
      subtitle="Lembar kerja dapur per tanggal. Rekap terkunci setelah cut-off."
      actions={
        <div class="flex items-end align-bottom gap-4">
          <div class="grid gap-1.5">
            <Label for="production-date" class="text-xs">
              Tanggal
            </Label>
            <Input
              id="production-date"
              type="date"
              class="w-40"
              value={date()}
              onInput={(event) => setDate(event.currentTarget.value)}
            />
          </div>
          <Button variant="outline" onClick={() => window.print()}>
            <Printer />
            Cetak
          </Button>
        </div>
      }
    >
      <Show
        when={production.data}
        fallback={
          <Card class="py-0">
            <EmptyState
              icon={<ChefHat />}
              title={production.isLoading ? 'Memuat rekap…' : 'Rekap belum tersedia'}
              description={production.isLoading ? undefined : 'Pilih tanggal lain atau periksa koneksi API.'}
            />
          </Card>
        }
      >
        {(data) => (
          <>
            <div class="no-print mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard
                label="Total porsi"
                value={String(data().totalPortions)}
                meta={`Target ${data().targetMin} porsi`}
                icon={<ChefHat />}
              />
              <StatCard
                label="Status rekap"
                value={data().locked ? 'Terkunci' : 'Terbuka'}
                meta={
                  data().lockedAt
                    ? `Dikunci ${data().lockedAt}`
                    : data().locked
                      ? 'Cut-off lewat, menunggu job kunci'
                      : 'Masih menerima pesanan'
                }
                icon={<LockKeyhole />}
              />
              <StatCard
                label="Jendela antar"
                value={String(data().windows.length)}
                meta={`${data().windows.reduce((sum, w) => sum + w.orderCount, 0)} order terjadwal`}
                icon={<Truck />}
              />
              <StatCard
                label="Catatan"
                value={String(data().notes.length)}
                meta="termasuk catatan pelanggan"
                icon={<StickyNote />}
              />
            </div>

            <Show when={total() < target()}>
              <Alert variant="warning" class="no-print mb-4">
                <TriangleAlert />
                <AlertTitle>Di bawah target produksi</AlertTitle>
                <AlertDescription>
                  Total porsi ({total()}) masih di bawah target produksi ({target()}). Sesuai keputusan
                  bisnis, produksi tetap berjalan dengan peringatan admin.
                </AlertDescription>
              </Alert>
            </Show>

            <div class="print-sheet">
              <div class="flex flex-wrap items-start justify-between gap-4 border-b pb-4">
                <div class="flex flex-col gap-1">
                  <span class="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                    Sajian Kita · Pontianak
                  </span>
                  <h2 class="text-xl font-semibold tracking-tight">Lembar kerja dapur</h2>
                  <p class="text-muted-foreground flex items-center gap-1.5 text-sm">
                    <CalendarClock class="size-4" />
                    {formatDate(date())}
                  </p>
                </div>
                <div class="grid justify-items-end gap-1 text-right text-xs">
                  <Badge variant={data().locked ? 'neutral' : 'success'}>
                    {data().locked ? 'TERKUNCI' : 'DRAF'}
                  </Badge>
                  <span class="text-muted-foreground tabular-nums">{data().totalPortions} porsi</span>
                </div>
              </div>

              <section class="mt-6">
                <h3 class="mb-2 text-sm font-semibold">Hidangan</h3>
                <table class="w-full text-sm">
                  <thead>
                    <tr class="border-b">
                      <th class="text-muted-foreground px-2 py-2 text-left text-xs font-medium">Hidangan</th>
                      <th class="text-muted-foreground px-2 py-2 text-left text-xs font-medium">Kategori</th>
                      <th class="text-muted-foreground px-2 py-2 text-right text-xs font-medium">Porsi</th>
                    </tr>
                  </thead>
                  <tbody>
                    <For each={data().items}>
                      {(item) => (
                        <tr class="border-b last:border-0">
                          <td class="px-2 py-2">{item.name}</td>
                          <td class="text-muted-foreground px-2 py-2 text-xs">{item.category}</td>
                          <td class="px-2 py-2 text-right tabular-nums">{item.portions}</td>
                        </tr>
                      )}
                    </For>
                    <tr class="font-semibold">
                      <td class="px-2 py-2" colspan={2}>
                        Total
                      </td>
                      <td class="px-2 py-2 text-right tabular-nums">{data().totalPortions}</td>
                    </tr>
                  </tbody>
                </table>
              </section>

              <section class="mt-6">
                <h3 class="mb-2 text-sm font-semibold">Jadwal antar</h3>
                <table class="w-full text-sm">
                  <thead>
                    <tr class="border-b">
                      <th class="text-muted-foreground px-2 py-2 text-left text-xs font-medium">Jendela</th>
                      <th class="text-muted-foreground px-2 py-2 text-left text-xs font-medium">Jam</th>
                      <th class="text-muted-foreground px-2 py-2 text-right text-xs font-medium">Order</th>
                      <th class="text-muted-foreground px-2 py-2 text-right text-xs font-medium">Porsi</th>
                    </tr>
                  </thead>
                  <tbody>
                    <For each={data().windows}>
                      {(window) => (
                        <tr class="border-b last:border-0">
                          <td class="px-2 py-2">{window.label}</td>
                          <td class="px-2 py-2">
                            {window.startTime}–{window.endTime}
                          </td>
                          <td class="px-2 py-2 text-right tabular-nums">{window.orderCount}</td>
                          <td class="px-2 py-2 text-right tabular-nums">{window.portions}</td>
                        </tr>
                      )}
                    </For>
                  </tbody>
                </table>
              </section>

              <section class="mt-6">
                <h3 class="mb-2 text-sm font-semibold">Catatan khusus</h3>
                <Show
                  when={data().notes.length > 0}
                  fallback={<p class="text-muted-foreground text-sm">Tidak ada catatan.</p>}
                >
                  <ul class="grid gap-1.5 text-sm">
                    <For each={data().notes}>
                      {(note) => (
                        <li class="flex gap-2">
                          <span class="text-muted-foreground">•</span>
                          <span>
                            <strong class="font-medium">{note.orderNo}</strong> — {note.note}
                          </span>
                        </li>
                      )}
                    </For>
                  </ul>
                </Show>
              </section>
            </div>
          </>
        )}
      </Show>
    </AppShell>
  );
}
