import { Show, onMount } from 'solid-js';
import { Moon, Sun } from 'lucide-solid';
import { Button } from '~/components/ui/button';
import { syncThemeFromDocument, theme, toggleTheme } from '~/lib/theme';

/** Tombol ganti tema terang/gelap. Pilihan disimpan di localStorage. */
export function ThemeToggle() {
  onMount(() => syncThemeFromDocument());

  const isDark = () => theme() === 'dark';
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label="Mode gelap"
      title={isDark() ? 'Matikan mode gelap' : 'Aktifkan mode gelap'}
      aria-pressed={isDark()}
      onClick={() => toggleTheme()}
    >
      <Show when={isDark()} fallback={<Moon class="size-4" />}>
        <Sun class="size-4" />
      </Show>
    </Button>
  );
}
