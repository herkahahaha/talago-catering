import { For, Show, createSignal } from 'solid-js';
import { createFileRoute } from '@tanstack/solid-router';
import { useQuery } from '@tanstack/solid-query';
import type { AuditEntryDto } from '@catering/contracts';
import { ScrollText } from 'lucide-solid';
import { AppShell } from '~/components/AppShell';
import { api } from '~/lib/api';
import { formatDateTime, todayWib } from '~/lib/format';
import { Badge } from '~/components/ui/badge';
import { Card } from '~/components/ui/card';
import { EmptyState } from '~/components/ui/empty-state';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import { Select } from '~/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/components/ui/table';

export const Route = createFileRoute('/audit')({
  component: AuditPage,
});

const ENTITY_OPTIONS = [
  { value: '', label: 'Semua' },
  { value: 'order', label: 'Order' },
  { value: 'daily_capacity', label: 'Kapasitas hari' },
  { value: 'refund', label: 'Refund' },
  { value: 'payment', label: 'Pembayaran' },
  { value: 'menu_item', label: 'Menu hidangan' },
  { value: 'menu_schedule', label: 'Jadwal menu' },
  { value: 'settings', label: 'Pengaturan global' },
  { value: 'staff_auth', label: 'Login staf' },
  { value: 'quotation', label: 'Penawaran' },
];

function AuditPage() {
  const [date, setDate] = createSignal(todayWib());
  const [entity, setEntity] = createSignal('');

  const entries = useQuery(() => ({
    queryKey: ['audit', date(), entity()],
    queryFn: () => {
      const params = new URLSearchParams({ date: date(), limit: '300' });
      if (entity()) params.set('entity', entity());
      return api.get<AuditEntryDto[]>(`/admin/audit?${params.toString()}`);
    },
  }));

  const changeSummary = (entry: AuditEntryDto) =>
    [
      entry.before ? `sebelum: ${JSON.stringify(entry.before)}` : '',
      entry.after ? `sesudah: ${JSON.stringify(entry.after)}` : '',
    ]
      .filter(Boolean)
      .join('\n');

  return (
    <AppShell
      title="Audit log"
      subtitle="Semua transisi status, perubahan kapasitas, refund, dan login staf tercatat di sini."
      actions={
        <>
          <div class="grid gap-1.5">
            <Label for="audit-date" class="text-xs">
              Tanggal
            </Label>
            <Input
              id="audit-date"
              type="date"
              class="w-40"
              value={date()}
              onInput={(event) => setDate(event.currentTarget.value)}
            />
          </div>
          <div class="grid gap-1.5">
            <Label for="audit-entity" class="text-xs">
              Entitas
            </Label>
            <Select
              id="audit-entity"
              class="w-52"
              value={entity()}
              onChange={setEntity}
              options={ENTITY_OPTIONS}
              aria-label="Filter entitas audit"
            />
          </div>
        </>
      }
    >
      <Card class="gap-0 overflow-hidden py-0">
        <div class="flex flex-wrap items-center justify-between gap-2 border-b p-4">
          <div>
            <p class="font-medium">Jejak aktivitas</p>
            <p class="text-muted-foreground text-xs">Maksimal 300 entri per tanggal.</p>
          </div>
          <Badge variant="secondary">{entries.data?.length ?? 0} entri</Badge>
        </div>

        <Table class="min-w-[980px] md:min-w-0">
          <TableHeader>
            <TableRow class="hover:bg-transparent">
              <TableHead>Waktu</TableHead>
              <TableHead>Aktor</TableHead>
              <TableHead>Aksi</TableHead>
              <TableHead>Entitas</TableHead>
              <TableHead>Perubahan</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <Show
              when={entries.data?.length}
              fallback={
                <TableRow class="hover:bg-transparent">
                  <TableCell colspan={5} class="p-0">
                    <EmptyState
                      icon={<ScrollText />}
                      title={entries.isLoading ? 'Memuat aktivitas…' : 'Tidak ada aktivitas'}
                      description={
                        entries.isLoading ? undefined : 'Tidak ada aktivitas pada tanggal dan filter ini.'
                      }
                    />
                  </TableCell>
                </TableRow>
              }
            >
              <For each={entries.data ?? []}>
                {(entry) => (
                  <TableRow>
                    <TableCell class="text-muted-foreground text-xs whitespace-nowrap tabular-nums">
                      {formatDateTime(entry.at)}
                    </TableCell>
                    <TableCell>
                      <span class="text-sm">{entry.actorLabel}</span>
                      <div class="text-muted-foreground text-xs">{entry.actorType}</div>
                    </TableCell>
                    <TableCell>
                      <code class="bg-muted rounded px-1.5 py-0.5 text-xs">{entry.action}</code>
                      <Show when={entry.orderNo}>
                        <div class="text-muted-foreground mt-1 font-mono text-xs">{entry.orderNo}</div>
                      </Show>
                    </TableCell>
                    <TableCell>
                      <span class="text-sm">{entry.entity}</span>
                      <div class="text-muted-foreground font-mono text-xs">{entry.entityId.slice(0, 18)}</div>
                    </TableCell>
                    <TableCell class="max-w-[420px]">
                      <Show when={changeSummary(entry)} fallback={<span class="text-xs">—</span>}>
                        <pre class="text-muted-foreground overflow-x-auto font-mono text-xs whitespace-pre-wrap">
                          {changeSummary(entry)}
                        </pre>
                      </Show>
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
