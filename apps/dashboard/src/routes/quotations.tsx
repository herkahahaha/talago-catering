import { For, Show, createSignal } from 'solid-js';
import { Link, createFileRoute } from '@tanstack/solid-router';
import { useQuery, useQueryClient } from '@tanstack/solid-query';
import type { QuotationPurchaseOrderDto, QuoteRequestDto } from '@catering/contracts';
import { FileText } from 'lucide-solid';
import { AppShell } from '~/components/AppShell';
import { api, ApiError } from '~/lib/api';
import { formatDate, formatDateTime, fromWibInputValue, rp } from '~/lib/format';
import { Alert, AlertDescription } from '~/components/ui/alert';
import { Badge, type BadgeProps } from '~/components/ui/badge';
import { Button, buttonVariants } from '~/components/ui/button';
import { Card } from '~/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog';
import { EmptyState } from '~/components/ui/empty-state';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/components/ui/table';
import { Toast } from '~/components/ui/toast';
import { DatePicker } from '~/components/ui/date-picker';

export const Route = createFileRoute('/quotations')({
  validateSearch: (search: Record<string, unknown>): { toast?: string } => ({
    toast: typeof search.toast === 'string' ? search.toast : undefined,
  }),
  component: QuotationsPage,
});

const statusVariant: Record<QuoteRequestDto['status'], BadgeProps['variant']> = {
  new: 'warning',
  contacted: 'secondary',
  won: 'success',
  lost: 'destructive',
};

function QuotationsPage() {
  const queryClient = useQueryClient();
  const search = Route.useSearch();
  const quotes = useQuery(() => ({
    queryKey: ['quotations'],
    queryFn: () => api.get<QuoteRequestDto[]>('/admin/quotations'),
  }));
  const notificationSettings = useQuery(() => ({
    queryKey: ['admin-notification-settings'],
    queryFn: () => api.get<{ adminWhatsapp: string }>('/admin/settings/notifications'),
  }));

  const [busyId, setBusyId] = createSignal<string | null>(null);
  const [error, setError] = createSignal<string | null>(null);
  const [toast, setToast] = createSignal<string | null>(
    search().toast === 'order-linked' ? 'Order berhasil dibuat dan ditautkan ke PO.' : null,
  );

  // ── pengaturan nomor WhatsApp admin ───────────────────────────────────
  const [adminWhatsapp, setAdminWhatsapp] = createSignal<string | null>(null);
  const [savingWhatsapp, setSavingWhatsapp] = createSignal(false);
  const whatsappValue = () => adminWhatsapp() ?? notificationSettings.data?.adminWhatsapp ?? '';

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(null), 2500);
  }

  async function saveWhatsapp(event: SubmitEvent) {
    event.preventDefault();
    setSavingWhatsapp(true);
    setError(null);
    try {
      const saved = await api.put<{ adminWhatsapp: string }>('/admin/settings/notifications', {
        adminWhatsapp: whatsappValue().trim(),
      });
      setAdminWhatsapp(saved.adminWhatsapp);
      await queryClient.invalidateQueries({ queryKey: ['admin-notification-settings'] });
      showToast(
        saved.adminWhatsapp ? 'Nomor WhatsApp admin disimpan.' : 'Notifikasi admin dimatikan (nomor kosong).',
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Gagal menyimpan nomor WhatsApp admin.');
    } finally {
      setSavingWhatsapp(false);
    }
  }

  // ── ubah status ───────────────────────────────────────────────────────
  async function changeStatus(quote: QuoteRequestDto, status: 'contacted' | 'lost') {
    setBusyId(quote.id);
    setError(null);
    try {
      await api.patch(`/admin/quotations/${quote.id}/status`, { status });
      await queryClient.invalidateQueries({ queryKey: ['quotations'] });
      showToast(`Status ${quote.name} diubah jadi "${status}".`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Gagal mengubah status quotation.');
    } finally {
      setBusyId(null);
    }
  }

  // ── konversi ke PO ────────────────────────────────────────────────────
  const [converting, setConverting] = createSignal<QuoteRequestDto | null>(null);
  const [agreedTotal, setAgreedTotal] = createSignal('');
  const [dueAt, setDueAt] = createSignal('');
  const [convertError, setConvertError] = createSignal<string | null>(null);
  const [convertingBusy, setConvertingBusy] = createSignal(false);

  function openConvert(quote: QuoteRequestDto) {
    setConverting(quote);
    setAgreedTotal('');
    setDueAt('');
    setConvertError(null);
  }

  function closeConvert() {
    if (convertingBusy()) return;
    setConverting(null);
  }

  async function submitConvert(event: SubmitEvent) {
    event.preventDefault();
    const quote = converting();
    if (!quote) return;
    const total = Number(agreedTotal());
    if (!Number.isFinite(total) || total <= 0) {
      setConvertError('Nilai PO harus lebih dari 0.');
      return;
    }
    setConvertingBusy(true);
    setConvertError(null);
    try {
      await api.post<QuotationPurchaseOrderDto>(`/admin/quotations/${quote.id}/convert`, {
        agreedTotal: total,
        ...(dueAt() ? { dueAt: fromWibInputValue(dueAt()) } : {}),
      });
      await queryClient.invalidateQueries({ queryKey: ['quotations'] });
      setConverting(null);
      showToast(`${quote.name} dikonversi ke PO.`);
    } catch (err) {
      setConvertError(err instanceof ApiError ? err.message : 'Gagal mengonversi quotation ke PO.');
    } finally {
      setConvertingBusy(false);
    }
  }

  return (
    <AppShell
      title="Permintaan penawaran"
      subtitle="Pesanan di atas 50 porsi masuk ke jalur ini. Tindak lanjuti lewat WhatsApp."
    >
      <div class="grid gap-4">
        <Card class="p-4">
          <form onSubmit={saveWhatsapp} class="flex flex-wrap items-end gap-3">
            <div class="grid flex-1 gap-2 sm:max-w-xs">
              <Label for="admin-whatsapp">Nomor WhatsApp admin</Label>
              <Input
                id="admin-whatsapp"
                type="tel"
                inputmode="tel"
                placeholder="0812xxxxxxx"
                value={whatsappValue()}
                onInput={(event) => setAdminWhatsapp(event.currentTarget.value)}
              />
            </div>
            <Button type="submit" variant="outline" disabled={savingWhatsapp()}>
              {savingWhatsapp() ? 'Menyimpan…' : 'Simpan nomor'}
            </Button>
            <p class="text-muted-foreground w-full text-xs sm:w-auto sm:flex-1">
              Notifikasi quotation baru dikirim ke nomor ini. Kosongkan untuk mematikan.
            </p>
          </form>
        </Card>

        <Card class="gap-0 overflow-hidden py-0">
          <div class="flex flex-wrap items-center justify-between gap-2 border-b p-4">
            <div>
              <p class="font-medium">Antrean penawaran</p>
              <p class="text-muted-foreground text-xs">
                Hubungi pelanggan untuk menyepakati harga &amp; jadwal.
              </p>
            </div>
            <Badge variant="secondary">{quotes.data?.length ?? 0} permintaan</Badge>
          </div>

          <Show when={error()}>
            <Alert variant="destructive" class="m-4 mb-0">
              <AlertDescription>{error()}</AlertDescription>
            </Alert>
          </Show>

          <Table class="min-w-[1100px] md:min-w-0">
            <TableHeader>
              <TableRow class="hover:bg-transparent">
                <TableHead>Masuk</TableHead>
                <TableHead>Nama</TableHead>
                <TableHead>Kontak</TableHead>
                <TableHead>Tanggal acara</TableHead>
                <TableHead>Porsi</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>PO</TableHead>
                <TableHead>Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <Show
                when={quotes.data?.length}
                fallback={
                  <TableRow class="hover:bg-transparent">
                    <TableCell colspan={8} class="p-0">
                      <EmptyState
                        icon={<FileText />}
                        title={quotes.isLoading ? 'Memuat penawaran…' : 'Belum ada permintaan penawaran'}
                        description={
                          quotes.isLoading ? undefined : 'Permintaan di atas 50 porsi akan muncul di sini.'
                        }
                      />
                    </TableCell>
                  </TableRow>
                }
              >
                <For each={quotes.data ?? []}>
                  {(quote) => (
                    <TableRow>
                      <TableCell class="text-muted-foreground text-xs whitespace-nowrap tabular-nums">
                        {formatDateTime(quote.createdAt)}
                      </TableCell>
                      <TableCell>
                        <span class="font-medium">{quote.name}</span>
                        <Show when={quote.company}>
                          <div class="text-muted-foreground text-xs">{quote.company}</div>
                        </Show>
                      </TableCell>
                      <TableCell class="font-mono text-xs">{quote.phone}</TableCell>
                      <TableCell class="whitespace-nowrap">{formatDate(quote.serviceDate)}</TableCell>
                      <TableCell class="tabular-nums">{quote.portions}</TableCell>
                      <TableCell>
                        <Badge variant={statusVariant[quote.status]}>{quote.status}</Badge>
                      </TableCell>
                      <TableCell class="text-xs">
                        <Show
                          when={quote.purchaseOrder}
                          fallback={<span class="text-muted-foreground">—</span>}
                        >
                          {(po) => (
                            <div class="grid gap-1">
                              <span class="font-mono font-medium">{po().poNumber}</span>
                              <span class="text-muted-foreground tabular-nums">{rp(po().agreedTotal)}</span>
                              <Show
                                when={po().orderNo}
                                fallback={<Badge variant="warning">Belum ada order</Badge>}
                              >
                                {(orderNo) => (
                                  <span class="text-muted-foreground">
                                    Order <span class="font-mono">{orderNo()}</span>
                                  </span>
                                )}
                              </Show>
                            </div>
                          )}
                        </Show>
                      </TableCell>
                      <TableCell>
                        <div class="flex flex-wrap items-center gap-1.5">
                          <Show when={quote.status === 'new'}>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={busyId() === quote.id}
                              onClick={() => changeStatus(quote, 'contacted')}
                            >
                              Tandai dihubungi
                            </Button>
                          </Show>
                          <Show when={quote.status === 'new' || quote.status === 'contacted'}>
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={busyId() === quote.id}
                              onClick={() => changeStatus(quote, 'lost')}
                            >
                              Batalkan
                            </Button>
                          </Show>
                          <Show when={quote.status === 'contacted' && !quote.purchaseOrder}>
                            <Button size="sm" variant="default" onClick={() => openConvert(quote)}>
                              Konversi ke PO
                            </Button>
                          </Show>
                          <Show when={quote.purchaseOrder && !quote.purchaseOrder!.orderId}>
                            <Link
                              class={buttonVariants({ variant: 'outline', size: 'sm' })}
                              to="/new-order"
                              search={{ quotationId: quote.id }}
                            >
                              Buat order
                            </Link>
                          </Show>
                          <Show when={quote.purchaseOrder?.orderId}>
                            <Link
                              class={buttonVariants({ variant: 'outline', size: 'sm' })}
                              to="/orders/$orderId"
                              params={{ orderId: quote.purchaseOrder!.orderId! }}
                            >
                              Buka order
                            </Link>
                          </Show>
                          <Show
                            when={quote.status === 'lost' || (quote.status === 'won' && !quote.purchaseOrder)}
                          >
                            <span class="text-muted-foreground text-xs">—</span>
                          </Show>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </For>
              </Show>
            </TableBody>
          </Table>
        </Card>
      </div>

      <Dialog
        open={converting() !== null}
        onOpenChange={(open) => {
          if (!open) closeConvert();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Konversi ke PO</DialogTitle>
            <DialogDescription>
              {converting()?.name} · {converting()?.portions} porsi ·{' '}
              {converting() ? formatDate(converting()!.serviceDate) : ''}
            </DialogDescription>
          </DialogHeader>

          <form id="convert-form" onSubmit={submitConvert} class="grid gap-4">
            <div class="grid gap-2">
              <Label for="agreed-total">Harga disepakati (Rp)</Label>
              <Input
                id="agreed-total"
                type="number"
                min={1}
                required
                placeholder="15000000"
                value={agreedTotal()}
                onInput={(event) => setAgreedTotal(event.currentTarget.value)}
              />
            </div>
            <div class="grid gap-2">
              <Label for="due-at">Jatuh tempo pembayaran (opsional)</Label>
              <DatePicker
                id="due-at"
                kind="date"
                withTime
                portal={false}
                aria-label="Jatuh tempo pembayaran"
                value={dueAt()}
                onChange={setDueAt}
              />
            </div>
            <Show when={convertError()}>
              <Alert variant="destructive">
                <AlertDescription>{convertError()}</AlertDescription>
              </Alert>
            </Show>
            <p class="text-muted-foreground text-xs leading-relaxed">
              Konversi menandai quotation sebagai <strong>won</strong> dan membuat satu nomor PO. Setelah itu
              buat order nyata lewat tombol “Buat order”.
            </p>
          </form>

          <DialogFooter>
            <Button variant="outline" onClick={closeConvert} disabled={convertingBusy()}>
              Batal
            </Button>
            <Button type="submit" form="convert-form" disabled={convertingBusy()}>
              {convertingBusy() ? 'Mengonversi…' : 'Konversi ke PO'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Toast message={toast()} variant="success" />
    </AppShell>
  );
}
