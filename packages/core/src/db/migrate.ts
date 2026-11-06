import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { loadEnv } from '../env';
import { createDatabase } from './client';

export async function runMigrations(connectionString?: string): Promise<void> {
  loadEnv();
  const handle = createDatabase(connectionString);
  const folder = resolve(import.meta.dirname, '../../drizzle');
  if (!existsSync(folder)) {
    throw new Error(`Folder migrasi tidak ditemukan: ${folder}. Jalankan "pnpm db:generate" dulu.`);
  }
  try {
    await migrate(handle.db, { migrationsFolder: folder });
  } finally {
    await handle.close();
  }
}

const isDirectRun = Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]!).href;

if (isDirectRun) {
  runMigrations()
    .then(() => {
      console.log('Migrasi selesai.');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migrasi gagal:', error);
      process.exit(1);
    });
}
