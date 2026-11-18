import { For, Show, createSignal } from 'solid-js';
import { createFileRoute } from '@tanstack/solid-router';
import { useQuery, useQueryClient } from '@tanstack/solid-query';
import type { QuoteRequestDto } from '@catering/contracts';
import { FileText } from 'lucide-solid';
import { AppShell } from '~/components/AppShell';
import { api, ApiError } from '~/lib/api';
import { formatDate, formatDateTime } from '~/lib/format';
import { Alert, AlertDescription } from '~/components/ui/alert';
import { Badge, type BadgeProps } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Card } from '~/components/ui/card';
import { EmptyState } from '~/components/ui/empty-state';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/components/ui/table';
import { Toast } from '~/components/ui/toast';

export const Route = createFileRoute('/quotations')({
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
  const quotes = useQuery(() => ({
    queryKey: ['quotations'],
    queryFn: () => api.get<QuoteRequestDto[]>('/admin/quotations'),
  }));
  const [busyId, setBusyId] = createSignal<string | null>(null);
  const [error, setError] = createSignal<string | null>(null);
  const [toast, setToast] = createSignal<string | null>(null);

  async function changeStatus(quote: QuoteRequestDto, status: 'contacted' | 'lost') {
    setBusyId(quote.id);
    setError(null);
    try {
      await api.patch(`/admin/quotations/${quote.id}/status`, { status });
      await queryClient.invalidateQueries({ queryKey: ['quotations'] });
      setToast(`Status ${quote.name} diubah jadi "${status}".`);
      window.setTimeout(() => setToast(null), 2500);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Gagal mengubah status quotation.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <AppShell
      title="Permintaan penawaran"
      subtitle="Pesanan di atas 50 porsi masuk ke jalur ini. Tindak lanjuti lewat WhatsApp."
    >
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

        <Table class="min-w-[1000px] md:min-w-0">
          <TableHeader>
            <TableRow class="hover:bg-transparent">
              <TableHead>Masuk</TableHead>
              <TableHead>Nama</TableHead>
              <TableHead>Kontak</TableHead>
              <TableHead>Tanggal acara</TableHead>
              <TableHead>Porsi</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <Show
              when={quotes.data?.length}
              fallback={
                <TableRow class="hover:bg-transparent">
                  <TableCell colspan={7} class="p-0">
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
                    <TableCell>
                      <Show
                        when={quote.status === 'new' || quote.status === 'contacted'}
                        fallback={<span class="text-muted-foreground text-xs">—</span>}
                      >
                        <div class="flex flex-wrap gap-1.5">
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
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={busyId() === quote.id}
                            onClick={() => changeStatus(quote, 'lost')}
                          >
                            Batalkan
                          </Button>
                        </div>
                      </Show>
                    </TableCell>
                  </TableRow>
                )}
              </For>
            </Show>
          </TableBody>
        </Table>
      </Card>

      <Toast message={toast()} variant="success" />
    </AppShell>
  );
}
