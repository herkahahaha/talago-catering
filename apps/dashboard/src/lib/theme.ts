import { createSignal } from 'solid-js';

export type Theme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'dashboard-theme';

/**
 * Script inline untuk <head>: memasang class `dark` sebelum halaman dirender
 * supaya tidak ada kilatan tema terang saat memuat ulang dalam mode gelap.
 * Urutan prioritas: pilihan tersimpan → preferensi sistem → terang.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var s=localStorage.getItem('${THEME_STORAGE_KEY}');var d=s?s==='dark':window.matchMedia('(prefers-color-scheme: dark)').matches;if(d)document.documentElement.classList.add('dark');}catch(e){}})();`;

const [theme, setThemeSignal] = createSignal<Theme>('light');

export { theme };

function readCurrentTheme(): Theme {
  if (typeof document === 'undefined') return 'light';
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}

/** Sinkronkan signal dengan kondisi DOM saat ini (dipanggil di client setelah mount). */
export function syncThemeFromDocument(): void {
  setThemeSignal(readCurrentTheme());
}

export function setTheme(next: Theme): void {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.toggle('dark', next === 'dark');
  document.documentElement.style.colorScheme = next;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, next);
  } catch {
    // Penyimpanan diblokir (mode privat/kebijakan browser): tema tetap berlaku untuk sesi ini.
  }
  setThemeSignal(next);
}

export function toggleTheme(): void {
  setTheme(theme() === 'dark' ? 'light' : 'dark');
}
