import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { getEnv } from '../env';
import * as schema from './schema';

export type Database = NodePgDatabase<typeof schema>;

/** Transaksi Drizzle; fungsi domain menerima Database maupun Transaction. */
export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
export type Executor = Database | Transaction;

export interface DbHandle {
  db: Database;
  pool: Pool;
  url: string;
  close: () => Promise<void>;
}

export function createDatabase(connectionString?: string, options?: { max?: number }): DbHandle {
  const env = getEnv();
  const url = connectionString ?? env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL wajib diisi');
  const pool = new Pool({
    connectionString: url,
    max: options?.max ?? env.DB_POOL_MAX,
    application_name: `catering-${env.ROLE}`,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 5_000,
  });
  // Jangan biarkan error idle mematikan proses tanpa jejak.
  pool.on('error', (error) => {
    console.error('[db] idle client error', error.message);
  });
  const db = drizzle(pool, { schema });
  return {
    db,
    pool,
    url,
    close: async () => {
      await pool.end();
    },
  };
}

let shared: DbHandle | null = null;

export function getDatabase(): DbHandle {
  if (!shared) shared = createDatabase();
  return shared;
}

export function db(): Database {
  return getDatabase().db;
}

export async function closeDatabase(): Promise<void> {
  if (!shared) return;
  await shared.close();
  shared = null;
}

/** Menjalankan fn di dalam transaksi; melempar ulang error agar domain bisa memetakan. */
export async function withTransaction<T>(
  executor: Database,
  fn: (tx: Transaction) => Promise<T>,
): Promise<T> {
  return executor.transaction(async (tx) => fn(tx));
}

export { schema };
