import { For, Show, createSignal } from 'solid-js';
import { createFileRoute } from '@tanstack/solid-router';
import { useQuery, useQueryClient } from '@tanstack/solid-query';
import type { RefundDto } from '@catering/contracts';
import { CircleAlert, RotateCcw } from 'lucide-solid';
import { AppShell } from '~/components/AppShell';
import { api, ApiError } from '~/lib/api';
import { formatDateTime, rp } from '~/lib/format';
import { Alert, AlertDescription } from '~/components/ui/alert';
import { Badge, type BadgeProps } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Card } from '~/components/ui/card';
import { EmptyState } from '~/components/ui/empty-state';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import { Select } from '~/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/components/ui/table';
import { Toast } from '~/components/ui/toast';

export const Route = createFileRoute('/refunds')({
  component: RefundsPage,
});

const STATUS_OPTIONS = [
  { value: 'queued', label: 'Menunggu antrean' },
  { value: 'completed', label: 'Selesai' },
  { value: 'failed', label: 'Gagal' },
  { value: '', label: 'Semua' },
];

const CHANNEL_OPTIONS = [
  { value: 'gateway_manual', label: 'Gateway (manual)' },
  { value: 'bank_transfer', label: 'Transfer bank' },
  { value: 'qris', label: 'QRIS' },
];

const statusVariant: Record<string, BadgeProps['variant']> = {
  queued: 'warning',
  completed: 'success',
  failed: 'destructive',
};

function RefundsPage() {
  const queryClient = useQueryClient();
  const [status, setStatus] = createSignal('queued');
  const [channel, setChannel] = createSignal('gateway_manual');
  const [reference, setReference] = createSignal('');
  const [busy, setBusy] = createSignal<string | null>(null);
  const [error, setError] = createSignal<string | null>(null);
  const [toast, setToast] = createSignal<string | null>(null);

  const refunds = useQuery(() => ({
    queryKey: ['refunds', status()],
    queryFn: () => api.get<RefundDto[]>(`/admin/refunds${status() ? `?status=${status()}` : ''}`),
  }));

  async function complete(refund: RefundDto) {
    setBusy(refund.id);
    setError(null);
    try {
      await api.post(`/admin/refunds/${refund.id}/complete`, {
        channel: channel(),
        ...(reference().trim() ? { reference: reference().trim() } : {}),
      });
      await queryClient.invalidateQueries({ queryKey: ['refunds'] });
      setToast(`Refund ${refund.orderNo} selesai dicatat.`);
      setReference('');
      window.setTimeout(() => setToast(null), 2500);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Gagal menyelesaikan refund.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <AppShell
      title="Refund manual"
      subtitle="Soft launch: dana dikembalikan manual lewat dashboard gateway, lalu dicatat di sini."
      actions={
        <div class="grid gap-1.5">
          <Label for="refund-status" class="text-xs">
            Status
          </Label>
          <Select
            id="refund-status"
            class="w-52"
            value={status()}
            onChange={setStatus}
            options={STATUS_OPTIONS}
            aria-label="Filter status refund"
          />
        </div>
      }
    >
      <Show when={error()}>
        <Alert variant="destructive" class="mb-4">
          <CircleAlert />
          <AlertDescription>{error()}</AlertDescription>
        </Alert>
      </Show>

      <Card class="gap-0 overflow-hidden py-0">
        <div class="flex flex-wrap items-center justify-between gap-2 border-b p-4">
          <div>
            <p class="font-medium">Antrean refund</p>
            <p class="text-muted-foreground text-xs">
              Catat kanal dan nomor referensi setelah dana dikembalikan.
            </p>
          </div>
          <Badge variant="secondary">{refunds.data?.length ?? 0} refund</Badge>
        </div>

        <Table class="min-w-[1180px] md:min-w-0">
          <TableHeader>
            <TableRow class="hover:bg-transparent">
              <TableHead>Dibuat</TableHead>
              <TableHead>Order</TableHead>
              <TableHead>Nominal</TableHead>
              <TableHead>Alasan</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Kanal</TableHead>
              <TableHead class="text-right">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <Show
              when={refunds.data?.length}
              fallback={
                <TableRow class="hover:bg-transparent">
                  <TableCell colspan={7} class="p-0">
                    <EmptyState
                      icon={<RotateCcw />}
                      title={refunds.isLoading ? 'Memuat refund…' : 'Tidak ada refund'}
                      description={refunds.isLoading ? undefined : 'Tidak ada refund pada filter status ini.'}
                    />
                  </TableCell>
                </TableRow>
              }
            >
              <For each={refunds.data ?? []}>
                {(refund) => (
                  <TableRow>
                    <TableCell class="text-muted-foreground text-xs whitespace-nowrap tabular-nums">
                      {formatDateTime(refund.createdAt)}
                    </TableCell>
                    <TableCell class="font-medium whitespace-nowrap">{refund.orderNo}</TableCell>
                    <TableCell class="whitespace-nowrap tabular-nums">{rp(refund.amount)}</TableCell>
                    <TableCell class="text-muted-foreground max-w-[220px] text-xs">{refund.reason}</TableCell>
                    <TableCell>
                      <Badge variant={statusVariant[refund.status] ?? 'neutral'}>{refund.status}</Badge>
                    </TableCell>
                    <TableCell class="text-muted-foreground text-xs">{refund.channel}</TableCell>
                    <TableCell>
                      <Show when={refund.status !== 'completed'}>
                        <div class="flex flex-wrap items-center justify-end gap-2">
                          <Select
                            class="w-36"
                            value={channel()}
                            onChange={setChannel}
                            options={CHANNEL_OPTIONS}
                            aria-label="Kanal refund"
                          />
                          <Input
                            class="w-32"
                            placeholder="Referensi"
                            value={reference()}
                            onInput={(event) => setReference(event.currentTarget.value)}
                          />
                          <Button
                            size="sm"
                            disabled={busy() === refund.id}
                            onClick={() => void complete(refund)}
                          >
                            {busy() === refund.id ? 'Menyimpan…' : 'Selesaikan'}
                          </Button>
                        </div>
                      </Show>
                      <Show when={refund.status === 'completed'}>
                        <span class="text-muted-foreground block text-right text-xs">
                          {formatDateTime(refund.completedAt)}
                        </span>
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
