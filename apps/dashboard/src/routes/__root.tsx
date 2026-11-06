/// <reference types="vite/client" />
import type { JSX } from 'solid-js';
import { HydrationScript } from 'solid-js/web';
import { HeadContent, Outlet, Scripts, createRootRoute } from '@tanstack/solid-router';
import { QueryClient, QueryClientProvider } from '@tanstack/solid-query';
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
});

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
