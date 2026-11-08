import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import solid from '@astrojs/solid-js';

export default defineConfig({
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  integrations: [solid()],
  server: { port: 4321, host: true },
  devToolbar: { enabled: false },
  vite: {
    server: {
      allowedHosts: true,
      // Proxy se-origin agar cookie sesi (httpOnly, SameSite=Lax) selalu first-party:
      // browser memanggil /api/* di origin yang sama, diteruskan ke API.
      // Hanya aktif saat dev server (tidak memengaruhi build production).
      proxy: {
        '/api': {
          target: process.env.API_BASE_URL ?? 'http://127.0.0.1:3000',
          changeOrigin: true,
        },
      },
    },
  },
});
