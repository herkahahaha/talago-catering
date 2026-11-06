/// <reference types="vite/client" />
import type { JSX } from 'solid-js';
import { HydrationScript } from 'solid-js/web';
import { Link, HeadContent, Outlet, Scripts, createRootRoute } from '@tanstack/solid-router';
import { QueryClient, QueryClientProvider } from '@tanstack/solid-query';
import { Home, TriangleAlert } from 'lucide-solid';
import { cn } from '~/lib/cn';
import '~/styles/app.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 0, staleTime: 10_000, refetchOnWindowFocus: false },
  },
});

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charset: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'Dapur · Sajian Kita' },
      { name: 'robots', content: 'noindex, nofollow' },
    ],
  }),
  shellComponent: RootDocument,
  component: RootComponent,
  notFoundComponent: NotFound as unknown as never,
  errorComponent: ErrorBoundary,
});

function ErrorBoundary(props: { error: Error }) {
  return (
    <div class="flex min-h-svh items-center justify-center bg-muted/40 p-4">
      <div class="grid w-full max-w-sm place-items-center text-center">
        <div class="bg-destructive text-destructive-foreground grid size-20 place-items-center rounded-2xl text-3xl font-bold shadow-lg mb-6">
          <TriangleAlert class="size-10" />
        </div>
        <h1 class="text-2xl font-semibold tracking-tight mb-2">Terjadi kesalahan</h1>
        <p class="text-muted-foreground text-sm mb-6">
          {props.error?.message || 'Maaf, terjadi kesalahan yang tidak terduga.'}
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

function NotFound() {
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

function RootComponent() {
  return (
    <QueryClientProvider client={queryClient}>
      <Outlet />
    </QueryClientProvider>
  );
}

function RootDocument(props: { children: JSX.Element }) {
  return (
    <html lang="id">
      <head>
        <HeadContent />
        <HydrationScript />
      </head>
      <body>
        {props.children}
        <Scripts />
      </body>
    </html>
  );
}
