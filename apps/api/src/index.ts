import { serve } from '@hono/node-server';
import { closeDatabase, createDatabase, getEnv } from '@catering/core';
import { createApp } from './app';

const env = getEnv();

async function main(): Promise<void> {
  if (env.ROLE === 'worker') {
    const { startWorker } = await import('./worker');
    await startWorker();
    return;
  }

  const handle = createDatabase();
  const app = createApp(handle.db);

  const server = serve({ fetch: app.fetch, port: env.PORT }, (info) => {
    console.info(
      JSON.stringify({
        level: 'info',
        message: 'API siap',
        url: `http://127.0.0.1:${info.port}`,
        role: env.ROLE,
        env: env.NODE_ENV,
      }),
    );
  });

  const shutdown = async (signal: string) => {
    console.info(JSON.stringify({ level: 'info', message: `Menerima ${signal}, mematikan server...` }));
    server.close();
    await closeDatabase();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((error) => {
  console.error(JSON.stringify({ level: 'error', message: 'Gagal menjalankan API', error: String(error) }));
  process.exit(1);
});
