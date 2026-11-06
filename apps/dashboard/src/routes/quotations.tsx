import { For, Show } from 'solid-js';
import { createFileRoute } from '@tanstack/solid-router';
import { useQuery } from '@tanstack/solid-query';
import type { QuoteRequestDto } from '@catering/contracts';
import { FileText } from 'lucide-solid';
import { AppShell } from '~/components/AppShell';
import { api } from '~/lib/api';
import { formatDate, formatDateTime } from '~/lib/format';
import { Badge } from '~/components/ui/badge';
import { Card } from '~/components/ui/card';
import { EmptyState } from '~/components/ui/empty-state';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/components/ui/table';

export const Route = createFileRoute('/quotations')({
  component: QuotationsPage,
});

function QuotationsPage() {
  const quotes = useQuery(() => ({
    queryKey: ['quotations'],
    queryFn: () => api.get<QuoteRequestDto[]>('/admin/quotations'),
  }));

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

        <Table class="min-w-[900px] md:min-w-0">
          <TableHeader>
            <TableRow class="hover:bg-transparent">
              <TableHead>Masuk</TableHead>
              <TableHead>Nama</TableHead>
              <TableHead>Kontak</TableHead>
              <TableHead>Tanggal acara</TableHead>
              <TableHead>Porsi</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <Show
              when={quotes.data?.length}
              fallback={
                <TableRow class="hover:bg-transparent">
                  <TableCell colspan={6} class="p-0">
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
                      <Badge variant="warning">{quote.status}</Badge>
                    </TableCell>
                  </TableRow>
                )}
              </For>
            </Show>
          </TableBody>
        </Table>
      </Card>
    </AppShell>
  );
}
