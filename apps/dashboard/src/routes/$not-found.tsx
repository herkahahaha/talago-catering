import { Link } from '@tanstack/solid-router';
import { Home } from 'lucide-solid';
import { cn } from '~/lib/cn';

export function NotFound() {
  return (
    <div class="flex min-h-svh items-center justify-center bg-muted/40 p-4">
      <div class="grid w-full max-w-sm place-items-center text-center">
        <div class="bg-primary text-primary-foreground grid size-20 place-items-center rounded-2xl text-3xl font-bold shadow-lg mb-6">
          404
        </div>
        <h1 class="text-2xl font-semibold tracking-tight mb-2">Halaman tidak ditemukan</h1>
        <p class="text-muted-foreground text-sm mb-6">
          Maaf, halaman yang Anda cari tidak tersedia.
        </p>
        <div class="flex flex-wrap items-center justify-center gap-3">
          <Link to="/" class={cn('flex items-center gap-2')}>
            <Home class="size-4" />
            Kembali ke dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}