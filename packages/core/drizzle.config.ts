import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'drizzle-kit';

// drizzle-kit hanya butuh DATABASE_URL; muat .env root monorepo bila ada.
const envFile = resolve(process.cwd(), '../../.env');
if (existsSync(envFile)) {
  process.loadEnvFile(envFile);
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} belum diatur. Isi di .env (lihat .env.example).`);
  return value;
}

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/modules/*/schema.ts',
  out: './drizzle',
  dbCredentials: {
    url: requireEnv('DATABASE_URL'),
  },
  verbose: true,
  strict: true,
});
