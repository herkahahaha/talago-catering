import http from 'node:http';
import { defineConfig, type Connect, type Plugin } from 'vite';
import { tanstackStart } from '@tanstack/solid-start/plugin/vite';
import tailwindcss from '@tailwindcss/vite';
import viteSolid from 'vite-plugin-solid';
import { nitro } from 'nitro/vite';

// Target API untuk proxy /api se-origin di development (lihat compose.dev.yml:
// API_BASE_URL=http://api:3000 di dalam jaringan compose).
const apiTarget = process.env.API_BASE_URL ?? 'http://127.0.0.1:3000';

/**
 * Proxy /api se-origin khusus dev server, agar cookie staf (httpOnly, SameSite=Lax)
 * selalu first-party baik dibuka via localhost maupun 127.0.0.1.
 * `apply: 'serve'` = tidak terbawa ke build production.
 * (vite `server.proxy` / nitro `devProxy` tidak diteruskan oleh dev server TanStack Start,
 * sehingga proxy dipasang eksplisit sebagai middleware pertama.)
 */
function devApiProxy(target: string): Plugin {
  const base = new URL(target);
  return {
    name: 'dev-api-proxy',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/api', (req, res) => {
        const originalUrl = (req as Connect.IncomingMessage).originalUrl ?? req.url ?? '/';
        const body: Buffer[] = [];
        req.on('data', (chunk) => body.push(chunk as Buffer));
        req.on('end', () => {
          const proxyReq = http.request(
            {
              protocol: base.protocol,
              hostname: base.hostname,
              port: base.port || (base.protocol === 'https:' ? 443 : 80),
              method: req.method,
              path: originalUrl,
              headers: { ...req.headers, host: base.host },
            },
            (proxyRes) => {
              res.statusCode = proxyRes.statusCode ?? 502;
              for (const [key, value] of Object.entries(proxyRes.headers)) {
                if (value === undefined) continue;
                if (key === 'transfer-encoding' || key === 'connection') continue;
                res.setHeader(key, value);
              }
              proxyRes.pipe(res);
            },
          );
          proxyReq.on('error', () => {
            if (!res.headersSent) {
              res.statusCode = 502;
              res.setHeader('content-type', 'application/json');
            }
            res.end(JSON.stringify({ error: { code: 'BAD_GATEWAY', message: 'API dev tidak terjangkau' } }));
          });
          for (const chunk of body) proxyReq.write(chunk);
          proxyReq.end();
        });
      });
    },
  };
}

export default defineConfig({
  server: { port: 3001, host: true },
  resolve: { tsconfigPaths: true },
  plugins: [devApiProxy(apiTarget), tailwindcss(), tanstackStart(), viteSolid({ ssr: true }), nitro()],
});
