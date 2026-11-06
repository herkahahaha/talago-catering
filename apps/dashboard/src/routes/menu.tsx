import { For, Show, createSignal } from 'solid-js';
import { createFileRoute } from '@tanstack/solid-router';
import { useQuery, useQueryClient } from '@tanstack/solid-query';
import type { AdminMenuItemDto, MenuCategory } from '@catering/contracts';
import { MENU_CATEGORY_LABELS } from '@catering/contracts';
import { CircleAlert, Info, MoreHorizontal, Pencil, Plus, Power, UtensilsCrossed } from 'lucide-solid';
import { AppShell } from '~/components/AppShell';
import { api, ApiError } from '~/lib/api';
import { rp } from '~/lib/format';
import { Alert, AlertDescription, AlertTitle } from '~/components/ui/alert';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Card } from '~/components/ui/card';
import { Checkbox } from '~/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu';
import { EmptyState } from '~/components/ui/empty-state';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import { Select } from '~/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/components/ui/table';
import { Textarea } from '~/components/ui/textarea';
import { Toast } from '~/components/ui/toast';

export const Route = createFileRoute('/menu')({
  component: MenuPage,
});

const CATEGORIES: MenuCategory[] = ['main', 'side', 'drink', 'dessert', 'package'];
const CATEGORY_OPTIONS = CATEGORIES.map((value) => ({ value, label: MENU_CATEGORY_LABELS[value] }));

function MenuPage() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = createSignal<AdminMenuItemDto | 'new' | null>(null);
  const [name, setName] = createSignal('');
  const [description, setDescription] = createSignal('');
  const [category, setCategory] = createSignal<MenuCategory>('main');
  const [price, setPrice] = createSignal(25_000);
  const [unitLabel, setUnitLabel] = createSignal('porsi');
  const [imageUrl, setImageUrl] = createSignal('');
  const [isActive, setIsActive] = createSignal(true);
  const [saving, setSaving] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [toast, setToast] = createSignal<string | null>(null);

  const catalog = useQuery(() => ({
    queryKey: ['admin-catalog'],
    queryFn: () => api.get<AdminMenuItemDto[]>('/admin/catalog'),
  }));

  function resetForm() {
    setName('');
    setDescription('');
    setCategory('main');
    setPrice(25_000);
    setUnitLabel('porsi');
    setImageUrl('');
    setIsActive(true);
    setError(null);
  }

  function openCreate() {
    resetForm();
    setEditing('new');
  }

  function openEdit(item: AdminMenuItemDto) {
    setName(item.name);
    setDescription(item.description);
    setCategory(item.category);
    setPrice(item.price);
    setUnitLabel(item.unitLabel);
    setImageUrl(item.imageUrl ?? '');
    setIsActive(item.isActive);
    setError(null);
    setEditing(item);
  }

  function closeForm() {
    setEditing(null);
    setError(null);
  }

  async function save(event: SubmitEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const payload = {
      name: name().trim(),
      description: description().trim(),
      category: category(),
      price: Number(price()),
      unitLabel: unitLabel().trim() || 'porsi',
      ...(imageUrl().trim() ? { imageUrl: imageUrl().trim() } : {}),
      isActive: isActive(),
    };

    try {
      const current = editing();
      if (current === 'new') {
        await api.post('/admin/menu', payload);
        setToast('Hidangan baru ditambahkan & dijadwalkan 14 hari ke depan.');
      } else if (current) {
        await api.patch(`/admin/menu/${current.id}`, payload);
        setToast('Hidangan diperbarui.');
      }
      await queryClient.invalidateQueries({ queryKey: ['admin-catalog'] });
      await queryClient.invalidateQueries({ queryKey: ['admin-menu'] });
      setEditing(null);
      window.setTimeout(() => setToast(null), 3000);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Gagal menyimpan hidangan.');
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(item: AdminMenuItemDto) {
    setError(null);
    try {
      await api.patch(`/admin/menu/${item.id}`, { isActive: !item.isActive });
      await queryClient.invalidateQueries({ queryKey: ['admin-catalog'] });
      setToast(item.isActive ? `${item.name} dinonaktifkan dari storefront.` : `${item.name} diaktifkan.`);
      window.setTimeout(() => setToast(null), 3000);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Gagal mengubah status hidangan.');
    }
  }

  return (
    <AppShell
      title="Menu hidangan"
      subtitle="Kelola katalog yang tampil di storefront. Hidangan baru otomatis dijadwalkan untuk 14 hari ke depan."
      actions={
        <Button onClick={openCreate}>
          <Plus />
          Tambah hidangan
        </Button>
      }
    >
      <Show when={error()}>
        <Alert variant="destructive" class="mb-4">
          <CircleAlert />
          <AlertDescription>{error()}</AlertDescription>
        </Alert>
      </Show>

      <Dialog
        open={editing() !== null}
        onOpenChange={(open) => {
          if (!open) closeForm();
        }}
      >
        <DialogContent class="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing() === 'new' ? 'Hidangan baru' : `Edit ${name()}`}</DialogTitle>
            <DialogDescription>
              Perubahan katalog berlaku untuk storefront dan jadwal menu tanggal ke depan.
            </DialogDescription>
          </DialogHeader>

          <form id="menu-form" onSubmit={save} class="grid gap-4">
            <div class="grid gap-4 sm:grid-cols-2">
              <div class="grid gap-2">
                <Label for="menu-name">Nama hidangan</Label>
                <Input
                  id="menu-name"
                  required
                  minLength={2}
                  placeholder="Contoh: Ayam Bakar Madu"
                  value={name()}
                  onInput={(event) => setName(event.currentTarget.value)}
                />
              </div>
              <div class="grid gap-2">
                <Label for="menu-category">Kategori</Label>
                <Select
                  id="menu-category"
                  value={category()}
                  onChange={(value) => setCategory(value as MenuCategory)}
                  options={CATEGORY_OPTIONS}
                  aria-label="Kategori hidangan"
                />
              </div>
            </div>

            <div class="grid gap-2">
              <Label for="menu-description">Deskripsi singkat</Label>
              <Textarea
                id="menu-description"
                rows={2}
                placeholder="Bahan utama, cara masak, atau catatan porsi."
                value={description()}
                onInput={(event) => setDescription(event.currentTarget.value)}
              />
            </div>

            <div class="grid gap-4 sm:grid-cols-2">
              <div class="grid gap-2">
                <Label for="menu-price">Harga per porsi (Rp)</Label>
                <Input
                  id="menu-price"
                  type="number"
                  min={0}
                  max={10_000_000}
                  required
                  value={price()}
                  onInput={(event) => setPrice(Number(event.currentTarget.value))}
                />
              </div>
              <div class="grid gap-2">
                <Label for="menu-unit">Satuan</Label>
                <Input
                  id="menu-unit"
                  placeholder="porsi"
                  value={unitLabel()}
                  onInput={(event) => setUnitLabel(event.currentTarget.value)}
                />
              </div>
            </div>

            <div class="grid gap-2">
              <Label for="menu-image">URL gambar (opsional)</Label>
              <Input
                id="menu-image"
                type="url"
                placeholder="https://…"
                value={imageUrl()}
                onInput={(event) => setImageUrl(event.currentTarget.value)}
              />
            </div>

            <div class="bg-muted/40 flex items-center justify-between gap-3 rounded-lg border p-3">
              <div>
                <Checkbox checked={isActive()} onChange={setIsActive} aria-label="Tampilkan di storefront">
                  Tampilkan &amp; bisa dipesan di storefront
                </Checkbox>
                <p class="text-muted-foreground mt-1 pl-6.5 text-xs">
                  Nonaktif menyembunyikan hidangan tanpa menghapus riwayat order.
                </p>
              </div>
            </div>
          </form>

          <DialogFooter>
            <Button variant="outline" onClick={closeForm}>
              Batal
            </Button>
            <Button type="submit" form="menu-form" disabled={saving()}>
              {saving() ? 'Menyimpan…' : editing() === 'new' ? 'Simpan hidangan' : 'Simpan perubahan'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card class="gap-0 overflow-hidden py-0">
        <div class="flex flex-wrap items-center justify-between gap-2 border-b p-4">
          <div>
            <p class="font-medium">Katalog hidangan</p>
            <p class="text-muted-foreground text-xs">Hidangan aktif tampil di storefront.</p>
          </div>
          <Badge variant="secondary">{catalog.data?.length ?? 0} hidangan</Badge>
        </div>

        <Table class="min-w-[860px] md:min-w-0">
          <TableHeader>
            <TableRow class="hover:bg-transparent">
              <TableHead>Hidangan</TableHead>
              <TableHead>Kategori</TableHead>
              <TableHead>Harga</TableHead>
              <TableHead>Jadwal aktif</TableHead>
              <TableHead>Status</TableHead>
              <TableHead class="text-right">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <Show
              when={catalog.data?.length}
              fallback={
                <TableRow class="hover:bg-transparent">
                  <TableCell colspan={6} class="p-0">
                    <EmptyState
                      icon={<UtensilsCrossed />}
                      title={catalog.isLoading ? 'Memuat katalog…' : 'Belum ada hidangan'}
                      description={
                        catalog.isLoading ? undefined : 'Tambahkan hidangan pertama untuk mulai berjualan.'
                      }
                      action={
                        <Button size="sm" onClick={openCreate}>
                          <Plus />
                          Tambah hidangan
                        </Button>
                      }
                    />
                  </TableCell>
                </TableRow>
              }
            >
              <For each={catalog.data ?? []}>
                {(item) => (
                  <TableRow>
                    <TableCell>
                      <span class="font-medium">{item.name}</span>
                      <div class="text-muted-foreground line-clamp-1 text-xs">{item.description || '—'}</div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{MENU_CATEGORY_LABELS[item.category]}</Badge>
                    </TableCell>
                    <TableCell class="whitespace-nowrap tabular-nums">{rp(item.price)}</TableCell>
                    <TableCell class="text-muted-foreground text-xs tabular-nums">
                      {item.scheduleCount} hari
                    </TableCell>
                    <TableCell>
                      <Badge variant={item.isActive ? 'success' : 'neutral'}>
                        {item.isActive ? 'Aktif' : 'Nonaktif'}
                      </Badge>
                    </TableCell>
                    <TableCell class="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          class="hover:bg-accent inline-flex size-8 items-center justify-center rounded-md transition-colors"
                          aria-label={`Aksi untuk ${item.name}`}
                        >
                          <MoreHorizontal class="size-4" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent class="w-44">
                          <DropdownMenuItem onSelect={() => openEdit(item)}>
                            <Pencil class="size-4" />
                            Edit hidangan
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onSelect={() => void toggleActive(item)}>
                            <Power class="size-4" />
                            {item.isActive ? 'Nonaktifkan' : 'Aktifkan'}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                )}
              </For>
            </Show>
          </TableBody>
        </Table>
      </Card>

      <Alert variant="info" class="mt-4">
        <Info />
        <AlertTitle>Nonaktif tanpa menghapus riwayat</AlertTitle>
        <AlertDescription>
          Ketersediaan per tanggal tetap bisa diatur di <strong>Pengaturan hari → Menu tanggal ini</strong>.
        </AlertDescription>
      </Alert>

      <Toast message={toast()} variant="success" />
    </AppShell>
  );
}
