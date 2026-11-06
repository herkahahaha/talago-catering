import { Hono } from 'hono';
import { sql, type Database, getEnv } from '@catering/core';
import type { AppEnv } from '../types';
import type { HealthDto } from '@catering/contracts';

export function createHealthRoutes(db: Database): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();

  routes.get('/', async (c) => {
    const env = getEnv();
    let dbStatus: 'ok' | 'down' = 'ok';
    try {
      await db.execute(sql`select 1`);
    } catch {
      dbStatus = 'down';
    }
    const body: HealthDto = {
      status: dbStatus === 'ok' ? 'ok' : 'degraded',
      role: env.ROLE,
      db: dbStatus,
      time: new Date().toISOString(),
      version: '0.1.0',
    };
    return c.json(body, dbStatus === 'ok' ? 200 : 503);
  });

  return routes;
}
