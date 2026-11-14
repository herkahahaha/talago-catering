import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

// Muat .env root agar tes integrasi memakai kredensial lokal yang sama.
const envFile = resolve(process.cwd(), '../../.env');
if (existsSync(envFile)) {
  try {
    process.loadEnvFile(envFile);
  } catch {
    // abaikan; env bisa diberikan lewat shell
  }
}

const testDatabaseUrl = process.env.DATABASE_URL_TEST;
if (!testDatabaseUrl) {
  throw new Error('DATABASE_URL_TEST belum diatur. Isi di .env (lihat .env.example).');
}

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    testTimeout: 120_000,
    hookTimeout: 180_000,
    // Tes integrasi berbagi satu database; jangan paralel antar file.
    fileParallelism: false,
    sequence: { concurrent: false },
    reporters: ['default'],
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: testDatabaseUrl,
      DATABASE_URL_TEST: testDatabaseUrl,
    },
  },
});
