import { For, Show, createSignal } from 'solid-js';
import { Link, createFileRoute } from '@tanstack/solid-router';
import { useQuery, useQueryClient } from '@tanstack/solid-query';
import type { AdminOrderDetailDto, OrderStatus } from '@catering/contracts';
import { ORDER_STATUS_LABELS } from '@catering/contracts';
import { ArrowLeft, CircleAlert, ReceiptText, StickyNote, UserRound } from 'lucide-solid';
import { AppShell } from '~/components/AppShell';
import { StatusBadge } from '~/components/StatusBadge';
import { api, ApiError } from '~/lib/api';
import { formatDate, formatDateTime, rp } from '~/lib/format';
import { Alert, AlertDescription } from '~/components/ui/alert';
import { Badge } from '~/components/ui/badge';
import { Button, buttonVariants } from '~/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog';
import { EmptyState } from '~/components/ui/empty-state';
import { Label } from '~/components/ui/label';
import { Separator } from '~/components/ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/components/ui/table';
import { Textarea } from '~/components/ui/textarea';
import { Toast } from '~/components/ui/toast';

export const Route = createFileRoute('/orders/$orderId')({
  component: OrderDetailPage,
});

const nextActions: Partial<Record<OrderStatus, { status: OrderStatus; label: string }>> = {
  paid: { status: 'in_production', label: 'Mulai produksi' },
  paid_after_expiry: { status: 'in_production', label: 'Mulai produksi' },
  in_production: { status: 'out_for_delivery', label: 'Kirim pesanan' },
  out_for_delivery: { status: 'delivered', label: 'Tandai selesai' },
};

function OrderDetailPage() {
  const params = Route.useParams();
  const orderId = () => params().orderId;
  const queryClient = useQueryClient();
  const [note, setNote] = createSignal('');
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [toast, setToast] = createSignal<string | null>(null);
  const [cancelOpen, setCancelOpen] = createSignal(false);
  const [cancelReason, setCancelReason] = createSignal('Diminta pelanggan');

  const detail = useQuery(() => ({
    queryKey: ['admin-order', orderId()],
    queryFn: () => api.get<AdminOrderDetailDto>(`/admin/orders/${orderId()}`),
  }));

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ['admin-order', orderId()] });
    await queryClient.invalidateQueries({ queryKey: ['admin-orders'] });
  }

  async function updateStatus(status: OrderStatus) {
    setBusy(true);
    setError(null);
    try {
      await api.patch(`/admin/orders/${orderId()}/status`, { status });
      await refresh();
      setToast('Status diperbarui.');
      window.setTimeout(() => setToast(null), 2500);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Gagal memperbarui status.');
    } finally {
      setBusy(false);
    }
  }

  async function cancelOrder() {
    const reason = cancelReason().trim();
    if (!reason) return;
    setBusy(true);
    setError(null);
    try {
      await api.post(`/admin/orders/${orderId()}/cancel`, { reason });
      await refresh();
      setCancelOpen(false);
      setToast('Pesanan dibatalkan.');
      window.setTimeout(() => setToast(null), 2500);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Gagal membatalkan pesanan.');
    } finally {
      setBusy(false);
    }
  }

  async function addNote(event: SubmitEvent) {
    event.preventDefault();
    if (!note().trim()) return;
    setBusy(true);
    try {
      await api.post(`/admin/orders/${orderId()}/notes`, { body: note().trim() });
      setNote('');
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Gagal menyimpan catatan.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell
      title={detail.data ? detail.data.order.orderNo : 'Detail pesanan'}
      subtitle={
        detail.data
          ? `${formatDate(detail.data.order.serviceDate)} · dibuat ${formatDateTime(detail.data.order.createdAt)}`
          : 'Memuat detail…'
      }
      actions={
        <>
          <Link class={buttonVariants({ variant: 'outline' })} to="/">
            <ArrowLeft />
            Semua pesanan
          </Link>
          <Show when={detail.data && nextActions[detail.data.order.status]}>
            <Button
              type="button"
              disabled={busy()}
              onClick={() => void updateStatus(nextActions[detail.data!.order.status]!.status)}
            >
              {nextActions[detail.data!.order.status]!.label}
            </Button>
          </Show>
          <Show
            when={
              detail.data &&
              ['pending_payment', 'paid', 'paid_after_expiry'].includes(detail.data.order.status)
            }
          >
            <Button variant="destructive" disabled={busy()} onClick={() => setCancelOpen(true)}>
              Batalkan
            </Button>
          </Show>
        </>
      }
    >
      <Show when={error()}>
        <Alert variant="destructive" class="mb-4">
          <CircleAlert />
          <AlertDescription>{error()}</AlertDescription>
        </Alert>
      </Show>

      <Show
        when={detail.data}
        fallback={
          <Card class="py-0">
            <EmptyState
              icon={<ReceiptText />}
              title={detail.isLoading ? 'Memuat pesanan…' : 'Pesanan tidak ditemukan'}
              description={detail.isLoading ? undefined : 'Periksa kembali tautan atau daftar pesanan.'}
              action={
                <Link class={buttonVariants({ variant: 'outline', size: 'sm' })} to="/">
                  Kembali ke daftar
                </Link>
              }
            />
          </Card>
        }
      >
        {(data) => (
          <div class="grid items-start gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            <div class="grid gap-6">
              <Card class="gap-0 overflow-hidden py-0">
                <div class="flex flex-wrap items-center justify-between gap-3 p-5">
                  <div class="flex flex-wrap items-center gap-2">
                    <StatusBadge status={data().order.status} />
                    <Badge variant="outline" class="font-mono">
                      {data().order.orderNo}
                    </Badge>
                    <Badge variant="secondary">
                      {data().order.source === 'po'
                        ? 'PO'
                        : data().order.source === 'manual'
                          ? 'Manual'
                          : 'Web'}
                    </Badge>
                  </div>
                  <div class="text-right">
                    <p class="text-muted-foreground text-xs">Total pesanan</p>
                    <p class="text-lg font-semibold tabular-nums">{rp(data().order.total)}</p>
                  </div>
                </div>

                <Table>
                  <TableHeader>
                    <TableRow class="hover:bg-transparent">
                      <TableHead>Hidangan</TableHead>
                      <TableHead>Porsi</TableHead>
                      <TableHead>Harga/porsi</TableHead>
                      <TableHead class="text-right">Subtotal</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <For each={data().order.items}>
                      {(item) => (
                        <TableRow>
                          <TableCell>{item.name}</TableCell>
                          <TableCell class="tabular-nums">{item.portions}</TableCell>
                          <TableCell class="tabular-nums">{rp(item.unitPrice)}</TableCell>
                          <TableCell class="text-right tabular-nums">{rp(item.lineTotal)}</TableCell>
                        </TableRow>
                      )}
                    </For>
                  </TableBody>
                </Table>

                <div class="grid gap-2 border-t p-5 text-sm">
                  <div class="flex items-center justify-between">
                    <span class="text-muted-foreground">Subtotal</span>
                    <span class="tabular-nums">{rp(data().order.subtotal)}</span>
                  </div>
                  <div class="flex items-center justify-between">
                    <span class="text-muted-foreground">Ongkir</span>
                    <span class="tabular-nums">
                      {data().order.deliveryFee === 0 ? 'Gratis' : rp(data().order.deliveryFee)}
                    </span>
                  </div>
                  <Separator />
                  <div class="flex items-center justify-between font-semibold">
                    <span>Total</span>
                    <span class="tabular-nums">{rp(data().order.total)}</span>
                  </div>
                </div>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Pembayaran</CardTitle>
                  <CardDescription>Tagihan dan status pencairan dari gateway.</CardDescription>
                </CardHeader>
                <CardContent>
                  <Show
                    when={data().order.payment}
                    fallback={
                      <p class="text-muted-foreground text-sm">
                        Belum ada tagihan. Pelanggan dapat membuat tagihan ulang.
                      </p>
                    }
                  >
                    {(payment) => (
                      <dl class="grid gap-4 sm:grid-cols-2">
                        <div class="grid gap-1">
                          <dt class="text-muted-foreground text-xs">Metode &amp; status</dt>
                          <dd class="text-sm">
                            {payment().method.toUpperCase()} · {payment().status}
                          </dd>
                        </div>
                        <div class="grid gap-1">
                          <dt class="text-muted-foreground text-xs">Referensi gateway</dt>
                          <dd class="bg-muted truncate rounded-md px-2 py-1 font-mono text-xs">
                            {payment().gatewayRef}
                          </dd>
                        </div>
                        <div class="grid gap-1">
                          <dt class="text-muted-foreground text-xs">Nominal</dt>
                          <dd class="text-sm tabular-nums">{rp(payment().amount)}</dd>
                        </div>
                        <div class="grid gap-1">
                          <dt class="text-muted-foreground text-xs">Dibayar</dt>
                          <dd class="text-sm">{formatDateTime(payment().paidAt)}</dd>
                        </div>
                      </dl>
                    )}
                  </Show>

                  <Show when={data().refunds.length > 0}>
                    <Separator class="my-4" />
                    <p class="mb-2 text-sm font-medium">Refund</p>
                    <div class="grid gap-2">
                      <For each={data().refunds}>
                        {(refund) => (
                          <div class="bg-muted/40 flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-xs">
                            <span class="tabular-nums">{rp(refund.amount)}</span>
                            <Badge variant="warning">{refund.status}</Badge>
                            <span class="text-muted-foreground">{refund.reason}</span>
                          </div>
                        )}
                      </For>
                    </div>
                  </Show>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Catatan internal</CardTitle>
                  <CardDescription>Hanya terlihat oleh staf dapur dan kurir.</CardDescription>
                </CardHeader>
                <CardContent class="grid gap-4">
                  <form onSubmit={addNote} class="grid gap-2">
                    <Label for="internal-note">Catatan baru</Label>
                    <Textarea
                      id="internal-note"
                      rows={2}
                      placeholder="Catatan untuk dapur/kurir (tidak terlihat pelanggan)"
                      value={note()}
                      onInput={(event) => setNote(event.currentTarget.value)}
                    />
                    <div class="flex justify-end">
                      <Button variant="outline" size="sm" type="submit" disabled={busy() || !note().trim()}>
                        Simpan catatan
                      </Button>
                    </div>
                  </form>

                  <div class="grid gap-2">
                    <For each={data().internalNotes}>
                      {(entry) => (
                        <div class="bg-muted/40 rounded-lg border px-3 py-2 text-sm">
                          <div class="text-muted-foreground mb-1 flex items-center justify-between gap-2 text-xs">
                            <strong class="text-foreground font-medium">{entry.staffName}</strong>
                            <span>{formatDateTime(entry.createdAt)}</span>
                          </div>
                          {entry.body}
                        </div>
                      )}
                    </For>
                    <Show when={data().internalNotes.length === 0}>
                      <div class="text-muted-foreground flex items-center gap-2 rounded-lg border border-dashed px-3 py-4 text-xs">
                        <StickyNote class="size-4" />
                        Belum ada catatan internal.
                      </div>
                    </Show>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div class="grid gap-6">
              <Card>
                <CardHeader>
                  <CardTitle class="flex items-center gap-2">
                    <UserRound class="size-4" />
                    Pelanggan
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <dl class="grid gap-3 text-sm">
                    <div class="grid gap-0.5">
                      <dt class="text-muted-foreground text-xs">Nama</dt>
                      <dd>{data().order.customer.name}</dd>
                    </div>
                    <div class="grid gap-0.5">
                      <dt class="text-muted-foreground text-xs">Nomor HP</dt>
                      <dd class="font-mono">{data().order.customer.phone}</dd>
                    </div>
                    <Show when={data().order.customer.email}>
                      <div class="grid gap-0.5">
                        <dt class="text-muted-foreground text-xs">Email</dt>
                        <dd>{data().order.customer.email}</dd>
                      </div>
                    </Show>
                    <div class="grid gap-0.5">
                      <dt class="text-muted-foreground text-xs">Alamat</dt>
                      <dd>
                        {data().order.delivery.addressLine}
                        {data().order.delivery.district &&
                        !data()
                          .order.delivery.addressLine.toLowerCase()
                          .includes(data().order.delivery.district!.toLowerCase())
                          ? `, ${data().order.delivery.district}`
                          : ''}
                      </dd>
                    </div>
                    <div class="grid gap-0.5">
                      <dt class="text-muted-foreground text-xs">Jendela antar</dt>
                      <dd>{data().order.delivery.windowLabel ?? 'Diatur admin'}</dd>
                    </div>
                    <Show when={data().order.notes}>
                      <div class="grid gap-0.5">
                        <dt class="text-muted-foreground text-xs">Catatan pelanggan</dt>
                        <dd>{data().order.notes}</dd>
                      </div>
                    </Show>
                  </dl>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Riwayat status</CardTitle>
                  <CardDescription>Jejak audit perubahan pesanan.</CardDescription>
                </CardHeader>
                <CardContent>
                  <Show
                    when={data().order.timeline.length > 0}
                    fallback={<p class="text-muted-foreground text-sm">Belum ada riwayat.</p>}
                  >
                    <ol class="grid gap-4">
                      <For each={data().order.timeline}>
                        {(entry, index) => (
                          <li class="relative pl-5">
                            <span class="bg-primary absolute top-1.5 left-0 size-2 rounded-full" />
                            <Show when={index() < data().order.timeline.length - 1}>
                              <span class="bg-border absolute top-4 left-[3.5px] h-full w-px" />
                            </Show>
                            <p class="text-sm font-medium">
                              {entry.status === 'note'
                                ? 'Catatan'
                                : ORDER_STATUS_LABELS[entry.status as keyof typeof ORDER_STATUS_LABELS]}
                            </p>
                            <p class="text-muted-foreground text-xs">
                              {formatDateTime(entry.at)}
                              {entry.note ? ` · ${entry.note}` : ''}
                            </p>
                          </li>
                        )}
                      </For>
                    </ol>
                  </Show>
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </Show>

      <Dialog open={cancelOpen()} onOpenChange={setCancelOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Batalkan pesanan?</DialogTitle>
            <DialogDescription>
              Pembatalan tercatat di audit log. Bila sudah dibayar, refund akan diantrekan untuk diproses
              manual.
            </DialogDescription>
          </DialogHeader>
          <div class="grid gap-2">
            <Label for="cancel-reason">Alasan pembatalan</Label>
            <Textarea
              id="cancel-reason"
              rows={3}
              required
              value={cancelReason()}
              onInput={(event) => setCancelReason(event.currentTarget.value)}
              placeholder="Contoh: pelanggan berubah rencana"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelOpen(false)}>
              Tidak, kembali
            </Button>
            <Button
              variant="destructive"
              disabled={busy() || !cancelReason().trim()}
              onClick={() => void cancelOrder()}
            >
              {busy() ? 'Membatalkan…' : 'Batalkan pesanan'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Toast message={toast()} />
    </AppShell>
  );
}
