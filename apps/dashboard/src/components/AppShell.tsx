import type { JSX } from 'solid-js';
import { For, Show, createEffect, createMemo, createSignal } from 'solid-js';
import { Link, useLocation, useNavigate } from '@tanstack/solid-router';
import { useQuery, useQueryClient } from '@tanstack/solid-query';
import type { StaffDto } from '@catering/contracts';
import { todayWib } from '~/lib/format';
import {
  CalendarDays,
  ChefHat,
  ClipboardList,
  FileText,
  LoaderCircle,
  LogOut,
  Menu as MenuIcon,
  RotateCcw,
  ScrollText,
  UtensilsCrossed,
} from 'lucide-solid';
import { api, ApiError } from '~/lib/api';
import { cn } from '~/lib/cn';
import { Button } from '~/components/ui/button';
import { Separator } from '~/components/ui/separator';
import { Sheet } from '~/components/ui/sheet';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu';

interface SessionResponse {
  user: StaffDto;
}

export function useSession() {
  return useQuery(() => ({
    queryKey: ['session'],
    queryFn: () => api.get<SessionResponse>('/admin/auth/me'),
    retry: false,
    staleTime: 30_000,
  }));
}

interface NavLink {
  to: string;
  label: string;
  icon: (props: { class?: string }) => JSX.Element;
  match: (path: string) => boolean;
}

const links: NavLink[] = [
  {
    to: '/',
    label: 'Pesanan',
    icon: ClipboardList,
    match: (p) => p === '/' || p.startsWith('/orders') || p.startsWith('/new-order'),
  },
  { to: '/menu', label: 'Menu', icon: UtensilsCrossed, match: (p) => p.startsWith('/menu') },
  { to: '/production', label: 'Rekap produksi', icon: ChefHat, match: (p) => p.startsWith('/production') },
  { to: '/days/$date', label: 'Pengaturan hari', icon: CalendarDays, match: (p) => p.startsWith('/days') },
  { to: '/refunds', label: 'Refund', icon: RotateCcw, match: (p) => p.startsWith('/refunds') },
  { to: '/quotations', label: 'Penawaran', icon: FileText, match: (p) => p.startsWith('/quotations') },
  { to: '/audit', label: 'Audit log', icon: ScrollText, match: (p) => p.startsWith('/audit') },
];

export function AppShell(props: {
  title: string;
  subtitle?: string;
  actions?: JSX.Element;
  children: JSX.Element;
}) {
  const session = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [mobileOpen, setMobileOpen] = createSignal(false);

  createEffect(() => {
    const error = session.error;
    if (error instanceof ApiError && error.status === 401 && !session.isFetching) {
      void navigate({ to: '/login', replace: true });
    }
  });

  const user = createMemo(() => session.data?.user ?? null);
  const initials = createMemo(() =>
    (user()?.name ?? '?')
      .split(/\s+/)
      .slice(0, 2)
      .map((word) => word[0]?.toUpperCase() ?? '')
      .join(''),
  );
  const path = createMemo(() => location().pathname);
  const current = createMemo(() => links.find((link) => link.match(path())));

  async function logout() {
    await api.post('/admin/auth/logout').catch(() => undefined);
    queryClient.clear();
    void navigate({ to: '/login', replace: true });
  }

  const SidebarContent = () => (
    <>
      <div class="flex flex-col gap-1 p-4">
        <Link to="/" class="flex items-center gap-2.5" onClick={() => setMobileOpen(false)}>
          <span class="bg-primary text-primary-foreground grid size-9 place-items-center rounded-lg text-sm font-bold">
            SK
          </span>
          <span class="flex flex-col leading-tight">
            <span class="text-sm font-semibold tracking-tight">Sajian Kita</span>
            <span class="text-muted-foreground text-xs">Dapur &amp; operasional</span>
          </span>
        </Link>
      </div>

      <div class="flex flex-1 flex-col gap-6 overflow-y-auto px-3 pb-4">
        <nav aria-label="Navigasi dashboard" class="flex flex-col gap-1">
          <p class="text-muted-foreground px-2 pb-1 text-xs font-medium">Operasional</p>
          <For each={links}>
            {(link) => {
              const active = () => link.match(path());
              const Icon = link.icon;
              return (
                <Link
                  to={link.to}
                  params={link.to.startsWith('/days') ? { date: todayWib() } : undefined}
                  onClick={() => setMobileOpen(false)}
                  class={cn(
                    'flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors',
                    active()
                      ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                      : 'text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground',
                  )}
                  aria-current={active() ? 'page' : undefined}
                >
                  <Icon class="size-4 shrink-0" />
                  {link.label}
                </Link>
              );
            }}
          </For>
        </nav>

        <div class="bg-background/60 rounded-lg border p-3">
          <p class="text-xs font-medium">Storefront</p>
          <p class="text-muted-foreground mt-1 text-xs leading-relaxed">
            Pesanan pelanggan masuk otomatis. Pantau kapasitas lewat Pengaturan hari.
          </p>
        </div>
      </div>

      <div class="mt-auto border-t p-3">
        <Show when={user()} keyed fallback={<div class="flex items-center gap-2.5 rounded-md p-2 text-sm text-muted-foreground">
          <span class="bg-secondary text-secondary-foreground grid size-8 shrink-0 place-items-center rounded-full text-xs font-semibold">
            ?
          </span>
          <span class="min-w-0 flex-1">Memuat sesi...</span>
        </div>}>
          {(currentUser) => (
            <DropdownMenu>
              <DropdownMenuTrigger
                class="hover:bg-sidebar-accent flex w-full items-center gap-2.5 rounded-md p-2 text-left transition-colors"
                aria-label="Menu pengguna"
              >
                <span class="bg-secondary text-secondary-foreground grid size-8 shrink-0 place-items-center rounded-full text-xs font-semibold">
                  {initials()}
                </span>
                <span class="min-w-0 flex-1 leading-tight">
                  <span class="block truncate text-sm font-medium">{currentUser.name}</span>
                  <span class="text-muted-foreground block truncate text-xs capitalize">
                    {currentUser.role}
                  </span>
                </span>
              </DropdownMenuTrigger>
              <DropdownMenuContent class="w-56">
                <DropdownMenuLabel class="flex flex-col gap-0.5">
                  <span class="text-foreground text-sm font-medium">{currentUser.name}</span>
                  <span class="text-muted-foreground text-xs">{currentUser.email}</span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => void logout()} class="text-destructive">
                  <LogOut class="size-4" />
                  Keluar
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </Show>
      </div>
    </>
  );

  return (
    <Show
      when={user()}
      fallback={
        <div class="grid min-h-svh place-items-center">
          <div class="text-muted-foreground flex items-center gap-2 text-sm">
            <LoaderCircle class="size-4 animate-spin" />
            Memeriksa sesi…
          </div>
        </div>
      }
    >
      <div class="bg-muted/40 min-h-svh">
        <aside
          data-slot="sidebar"
          class="bg-sidebar fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r md:flex"
        >
          <SidebarContent />
        </aside>

        <Sheet open={mobileOpen()} onOpenChange={setMobileOpen}>
          <SidebarContent />
        </Sheet>

        <div data-slot="app-wrapper" class="flex min-h-svh flex-col md:pl-64">
          <header
            data-slot="header"
            class="bg-background/95 supports-backdrop-filter:bg-background/80 sticky top-0 z-20 flex h-14 shrink-0 items-center gap-3 border-b px-4 backdrop-blur md:px-6"
          >
            <Button
              variant="ghost"
              size="icon-sm"
              class="-ml-1 md:hidden"
              aria-label="Buka navigasi"
              onClick={() => setMobileOpen(true)}
            >
              <MenuIcon class="size-5" />
            </Button>
            <Separator orientation="vertical" class="hidden h-5 md:block" />
            <nav aria-label="Breadcrumb" class="flex min-w-0 items-center gap-1.5 text-sm">
              <span class="text-muted-foreground hidden sm:inline">Operasional</span>
              <span class="text-muted-foreground hidden sm:inline">/</span>
              <span class="truncate font-medium">{current()?.label ?? props.title}</span>
            </nav>
            <Show when={user()} keyed>
              {(currentUser) => (
                <DropdownMenu>
                  <DropdownMenuTrigger
                    class="border-border hover:bg-accent grid size-8 place-items-center rounded-full border text-xs font-semibold md:hidden"
                    aria-label="Menu pengguna"
                  >
                    {initials()}
                  </DropdownMenuTrigger>
                  <DropdownMenuContent class="w-56">
                    <DropdownMenuLabel class="flex flex-col gap-0.5">
                      <span class="text-foreground text-sm font-medium">{currentUser.name}</span>
                      <span class="text-muted-foreground text-xs">{currentUser.email}</span>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={() => void logout()} class="text-destructive">
                      <LogOut class="size-4" />
                      Keluar
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </Show>
          </header>

          <main data-slot="app-main" class="mx-auto w-full max-w-360 flex-1 px-4 py-6 md:px-6 lg:px-8">
            <div class="no-print mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div class="min-w-0">
                <h1 class="text-2xl font-semibold tracking-tight">{props.title}</h1>
                <Show when={props.subtitle}>
                  <p class="text-muted-foreground mt-1 text-sm">{props.subtitle}</p>
                </Show>
              </div>
              <Show when={props.actions}>
                <div class="no-print flex flex-wrap items-center gap-2">{props.actions}</div>
              </Show>
            </div>
            {props.children}
          </main>
        </div>
      </div>
    </Show>
  );
}
