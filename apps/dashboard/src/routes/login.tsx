import { Show, createEffect, createSignal } from 'solid-js';
import { createFileRoute, useNavigate } from '@tanstack/solid-router';
import { useQueryClient } from '@tanstack/solid-query';
import { CircleAlert, LoaderCircle, LockKeyhole } from 'lucide-solid';
import type { StaffDto } from '@catering/contracts';
import { useSession } from '~/components/AppShell';
import { api, ApiError } from '~/lib/api';
import { Alert, AlertDescription } from '~/components/ui/alert';
import { Button } from '~/components/ui/button';
import { Card, CardContent } from '~/components/ui/card';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';

export const Route = createFileRoute('/login')({
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const session = useSession();
  const [email, setEmail] = createSignal('admin@catering.local');
  const [password, setPassword] = createSignal('');
  const [error, setError] = createSignal<string | null>(null);
  const [busy, setBusy] = createSignal(false);

  createEffect(() => {
    if (session.data?.user) void navigate({ to: '/', replace: true });
  });

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await api.post<{ user: StaffDto }>('/admin/auth/login', {
        email: email().trim(),
        password: password(),
      });
      // Isi cache sesi langsung agar tidak ada balapan redirect 401 sebelum refetch selesai.
      queryClient.setQueryData(['session'], result);
      void navigate({ to: '/', replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Gagal masuk.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div class="bg-muted/40 flex min-h-svh flex-col items-center justify-center gap-6 p-4">
      <div class="flex flex-col items-center gap-3 text-center">
        <span class="bg-primary text-primary-foreground grid size-11 place-items-center rounded-xl text-sm font-bold shadow-sm">
          SK
        </span>
        <div class="space-y-1">
          <h1 class="text-xl font-semibold tracking-tight">Masuk ke Sajian Kita</h1>
          <p class="text-muted-foreground text-sm">
            Dashboard internal dapur, kurir, dan admin. Akses dibatasi per peran.
          </p>
        </div>
      </div>

      <Card class="w-full max-w-sm gap-0 py-6 shadow-sm">
        <CardContent class="px-6">
          <form onSubmit={submit} class="grid gap-4">
            <div class="grid gap-2">
              <Label for="email">Email</Label>
              <Input
                id="email"
                type="email"
                autocomplete="username"
                required
                placeholder="nama@catering.local"
                value={email()}
                onInput={(event) => setEmail(event.currentTarget.value)}
              />
            </div>

            <div class="grid gap-2">
              <Label for="password">Password</Label>
              <Input
                id="password"
                type="password"
                required
                minLength={8}
                autocomplete="current-password"
                placeholder="••••••••"
                value={password()}
                onInput={(event) => setPassword(event.currentTarget.value)}
              />
            </div>

            <Show when={error()}>
              <Alert variant="destructive">
                <CircleAlert />
                <AlertDescription>{error()}</AlertDescription>
              </Alert>
            </Show>

            <Button type="submit" class="mt-1 w-full" disabled={busy()}>
              {busy() ? (
                <>
                  <LoaderCircle class="animate-spin" />
                  Masuk…
                </>
              ) : (
                <>
                  <LockKeyhole />
                  Masuk
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Show when={import.meta.env.DEV}>
        <div class="bg-background w-full max-w-sm rounded-lg border border-dashed p-3 text-center">
          <p class="text-muted-foreground text-xs leading-relaxed">
            Akun demo: <span class="text-foreground font-medium">admin@catering.local</span> / admin12345 ·
            dapur@catering.local / dapur12345 · kurir@catering.local / kurir12345
          </p>
        </div>
      </Show>

      <p class="text-muted-foreground text-xs">Portal operasional · waktu WIB (UTC+7)</p>
    </div>
  );
}
