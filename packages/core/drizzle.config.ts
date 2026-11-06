import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'drizzle-kit';

// drizzle-kit hanya butuh DATABASE_URL; muat .env root monorepo bila ada.
const envFile = resolve(process.cwd(), '../../.env');
if (existsSync(envFile)) {
  process.loadEnvFile(envFile);
}

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/modules/*/schema.ts',
  out: './drizzle',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://catering:catering_dev_pw@127.0.0.1:5432/catering_dev',
  },
  verbose: true,
  strict: true,
});
