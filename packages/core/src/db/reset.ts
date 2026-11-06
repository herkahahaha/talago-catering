import { sql } from 'drizzle-orm';
import { pathToFileURL } from 'node:url';
import { loadEnv } from '../env';
import { createDatabase } from './client';
import { runMigrations } from './migrate';

/**
 * Reset database pengembangan/tes: buang seluruh schema public lalu migrasi ulang.
 * JANGAN dipakai di production — dijaga oleh NODE_ENV.
 */
export async function resetDatabase(connectionString?: string): Promise<void> {
  loadEnv();
  const handle = createDatabase(connectionString);
  try {
    await handle.db.execute(sql`DROP SCHEMA IF EXISTS public CASCADE`);
    await handle.db.execute(sql`CREATE SCHEMA public`);
    await handle.db.execute(sql`DROP SCHEMA IF EXISTS pgboss CASCADE`);
    // drizzle-kit menyimpan jurnal migrasi di schema "drizzle"; tanpa ini
    // migrasi dianggap sudah jalan padahal tabel sudah dibuang.
    await handle.db.execute(sql`DROP SCHEMA IF EXISTS drizzle CASCADE`);
  } finally {
    await handle.close();
  }
  await runMigrations(connectionString);
}

const isDirectRun = Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]!).href;

if (isDirectRun) {
  if (process.env.NODE_ENV === 'production') {
    console.error('db:reset tidak boleh dijalankan saat NODE_ENV=production');
    process.exit(1);
  }
  const { seed } = await import('../seed');
  resetDatabase()
    .then(async () => {
      await seed();
      console.log('Database di-reset dan di-seed.');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Reset gagal:', error);
      process.exit(1);
    });
}
