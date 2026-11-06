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
    server: { allowedHosts: true },
  },
});
