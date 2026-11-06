import { For, Show, createMemo, createSignal } from 'solid-js';
import { Link, createFileRoute, useNavigate } from '@tanstack/solid-router';
import { useQuery } from '@tanstack/solid-query';
import type { AdminOrdersDto, MonthOverviewDto } from '@catering/contracts';
import {
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  CookingPot,
  ReceiptText,
  Search,
  ShoppingCart,
  Wallet,
} from 'lucide-solid';
import { AppShell } from '~/components/AppShell';
import { StatusBadge } from '~/components/StatusBadge';
import { StatCard } from '~/components/stat-card';
import { api } from '~/lib/api';
import { Alert, AlertDescription } from '~/components/ui/alert';
import { Button, buttonVariants } from '~/components/ui/button';
import { Card } from '~/components/ui/card';
import { EmptyState } from '~/components/ui/empty-state';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import { Select } from '~/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/components/ui/table';
import {
  formatDateTime,
  formatMonth,
  formatShortDate,
  monthBounds,
  rp,
  shiftMonth,
  todayWib,
} from '~/lib/format';

export const Route = createFileRoute('/')({
  component: OrdersPage,
});

const STATUS_OPTIONS = [
  { value: '', label: 'Semua status' },
  { value: 'pending_payment', label: 'Menunggu pembayaran' },
  { value: 'paid', label: 'Dibayar' },
  { value: 'paid_after_expiry', label: 'Dibayar setelah kedaluwarsa' },
  { value: 'in_production', label: 'Diproduksi' },
  { value: 'out_for_delivery', label: 'Diantar' },
  { value: 'delivered', label: 'Selesai' },
  { value: 'expired', label: 'Kedaluwarsa' },
  { value: 'cancelled_refunded', label: 'Dibatalkan & refund' },
];

function OrdersPage() {
  const navigate = useNavigate();
  const [month, setMonth] = createSignal(todayWib().slice(0, 7));
  const [status, setStatus] = createSignal('');
  const [search, setSearch] = createSignal('');
  const [page, setPage] = createSignal(1);

  const bounds = createMemo(() => monthBounds(month()));

  const overview = useQuery(() => ({
    queryKey: ['admin-overview', month()],
    queryFn: () => api.get<MonthOverviewDto>(`/admin/overview?month=${month()}`),
  }));

  const orders = useQuery(() => ({
    queryKey: ['admin-orders', month(), status(), search(), page()],
    queryFn: () => {
      const params = new URLSearchParams({
        from: bounds().from,
        to: bounds().to,
        page: String(page()),
        pageSize: '25',
      });
      if (status()) params.set('status', status());
      if (search().trim()) params.set('q', search().trim());
      return api.get<AdminOrdersDto>(`/admin/orders?${params.toString()}`);
    },

  }));

  const totalPages = () => Math.max(Math.ceil((orders.data?.total ?? 0) / (orders.data?.pageSize ?? 25)), 1);
  const averagePortions = () => {
    const data = overview.data;
    if (!data || data.totalOrders === 0) return 0;
    return Math.round(data.totalPortions / data.totalOrders);
  };

  return (
    <AppShell
      title="Pesanan"
      subtitle={`Rekap satu bulan penuh — ${formatMonth(month())}. Total pesanan & pendapatan dihitung dari seluruh order bulan ini.`}
      actions={
        <>
          <Link class={buttonVariants({ variant: 'outline' })} to="/days/$date" params={{ date: todayWib() }}>
            Pengaturan hari
          </Link>
          <Link class={buttonVariants()} to="/new-order">
            Order manual / PO
          </Link>
        </>
      }
    >
      <div class="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total pesanan"
          value={String(overview.data?.totalOrders ?? '—')}
          meta={`${overview.data?.paidOrders ?? 0} terkonfirmasi · ${overview.data?.pendingOrders ?? 0} menunggu · ${overview.data?.cancelledOrders ?? 0} batal/kedaluwarsa`}
          icon={<ShoppingCart />}
        />
        <StatCard
          label="Pendapatan bulan ini"
          value={overview.data ? rp(overview.data.totalRevenue) : '—'}
          meta="dari order lunas/diproses"
          icon={<Wallet />}
        />
        <StatCard
          label="Nilai seluruh pesanan"
          value={overview.data ? rp(overview.data.grossOrderValue) : '—'}
          meta="termasuk yang belum dibayar & batal"
          icon={<ReceiptText />}
        />
        <StatCard
          label="Total porsi"
          value={String(overview.data?.totalPortions ?? '—')}
          meta={`rata-rata ${averagePortions()} porsi per order`}
          icon={<CookingPot />}
        />
      </div>

      <Card class="gap-0 overflow-hidden py-0">
        <div class="flex flex-wrap items-start gap-3 border-b p-4">
          <div class="grid gap-1.5">
            <Label for="month">Bulan</Label>
            <div class="flex items-center gap-1.5">
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                aria-label="Bulan sebelumnya"
                onClick={() => {
                  setMonth(shiftMonth(month(), -1));
                  setPage(1);
                }}
              >
                <ChevronLeft />
              </Button>
              <Input
                id="month"
                class="w-36"
                type="month"
                value={month()}
                onInput={(event) => {
                  if (event.currentTarget.value) setMonth(event.currentTarget.value);
                  setPage(1);
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                aria-label="Bulan berikutnya"
                onClick={() => {
                  setMonth(shiftMonth(month(), 1));
                  setPage(1);
                }}
              >
                <ChevronRight />
              </Button>
            </div>
            <span class="m-auto text-muted-foreground text-xs">
              {formatShortDate(bounds().from)} – {formatShortDate(bounds().to)}
            </span>
          </div>

          <div class="grid w-48 gap-1.5">
            <Label for="status">Status</Label>
            <Select
              id="status"
              value={status()}
              onChange={(value) => {
                setStatus(value);
                setPage(1);
              }}
              options={STATUS_OPTIONS}
              aria-label="Filter status pesanan"
            />
          </div>

          <div class="grid min-w-48 flex-1 gap-1.5">
            <Label for="q">Cari nomor order / pelanggan</Label>
            <div class="relative">
              <Search class="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
              <Input
                id="q"
                class="pl-8"
                placeholder="CG-… atau nama / nomor HP"
                value={search()}
                onInput={(event) => {
                  setSearch(event.currentTarget.value);
                  setPage(1);
                }}
              />
            </div>
          </div>
        </div>

        <Show when={orders.isError || overview.isError}>
          <div class="p-4 pb-0">
            <Alert variant="destructive">
              <CircleAlert />
              <AlertDescription>
                Gagal memuat data. Pastikan API berjalan dan Anda masih login.
              </AlertDescription>
            </Alert>
          </div>
        </Show>

        <Table class="min-w-270 md:min-w-0">
          <TableHeader>
            <TableRow class="hover:bg-transparent">
              <TableHead>Dibuat</TableHead>
              <TableHead>Layanan</TableHead>
              <TableHead>Order</TableHead>
              <TableHead>Pelanggan</TableHead>
              <TableHead>Porsi</TableHead>
              <TableHead>Total</TableHead>
              <TableHead>Status</TableHead>
              <TableHead class="text-right">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <Show
              when={orders.data?.rows.length}
              fallback={
                <TableRow class="hover:bg-transparent">
                  <TableCell colspan={8} class="p-0">
                    <EmptyState
                      icon={<ShoppingCart />}
                      title={orders.isLoading ? 'Memuat pesanan…' : 'Belum ada pesanan'}
                      description={
                        orders.isLoading
                          ? undefined
                          : 'Pesanan pada bulan ini akan muncul di sini begitu pelanggan checkout.'
                      }
                    />
                  </TableCell>
                </TableRow>
              }
            >
              <For each={orders.data?.rows ?? []}>
                {(row) => (
                  <TableRow
                    class="cursor-pointer"
                    onClick={() => void navigate({ to: '/orders/$orderId', params: { orderId: row.id } })}
                  >
                    <TableCell class="text-muted-foreground text-xs whitespace-nowrap tabular-nums">
                      {formatDateTime(row.createdAt)}
                    </TableCell>
                    <TableCell class="text-xs whitespace-nowrap tabular-nums">
                      {formatShortDate(row.serviceDate)}
                    </TableCell>
                    <TableCell class="whitespace-nowrap">
                      <span class="font-medium">{row.orderNo}</span>
                      <div class="text-muted-foreground text-xs">
                        {row.source === 'po' ? 'PO' : row.source === 'manual' ? 'Manual' : 'Web'}
                      </div>
                    </TableCell>
                    <TableCell class="whitespace-nowrap">
                      {row.customerName}
                      <div class="text-muted-foreground font-mono text-xs">{row.customerPhone}</div>
                    </TableCell>
                    <TableCell class="tabular-nums">{row.portions}</TableCell>
                    <TableCell class="tabular-nums">{rp(row.total)}</TableCell>
                    <TableCell>
                      <StatusBadge status={row.status} />
                    </TableCell>
                    <TableCell class="text-right">
                      <Link
                        class={buttonVariants({ variant: 'outline', size: 'sm' })}
                        to="/orders/$orderId"
                        params={{ orderId: row.id }}
                        onClick={(event) => event.stopPropagation()}
                      >
                        Detail
                      </Link>
                    </TableCell>
                  </TableRow>
                )}
              </For>
            </Show>
          </TableBody>
        </Table>

        <div class="flex items-center justify-between gap-3 border-t px-4 py-3">
          <p class="text-muted-foreground text-xs">
            {orders.data?.total ?? 0} pesanan · halaman {page()} dari {totalPages()}
          </p>
          <div class="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page() <= 1}
              onClick={() => setPage((value) => Math.max(value - 1, 1))}
            >
              <ChevronLeft />
              Sebelumnya
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page() >= totalPages()}
              onClick={() => setPage((value) => value + 1)}
            >
              Berikutnya
              <ChevronRight />
            </Button>
          </div>
        </div>
      </Card>
    </AppShell>
  );
}
