import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { ZodError } from 'zod';
import { apiError, type ErrorCode } from '@catering/contracts';
import { AppError, getEnv, type Database } from '@catering/core';
import type { AppEnv } from './types';
import { publicRoutes } from './routes/public';
import { adminRoutes } from './routes/admin';
import { createHealthRoutes } from './routes/health';

function allowedOrigin(origin: string): string | null {
  const env = getEnv();
  const allowed = [env.APP_URL, env.DASHBOARD_URL].map((url) => url.replace(/\/$/, ''));
  if (env.NODE_ENV !== 'production') {
    if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return origin;
  }
  return allowed.includes(origin.replace(/\/$/, '')) ? origin : null;
}

/** Factory app Hono; tes memanggil ini langsung tanpa membuka port. */
export function createApp(db: Database): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  const env = getEnv();

  app.use('*', async (c, next) => {
    const id = c.req.header('x-request-id') ?? randomUUID();
    c.set('requestId', id);
    c.set('db', db);
    c.header('x-request-id', id);
    await next();
  });

  app.use('*', async (c, next) => {
    await next();
    c.header('x-content-type-options', 'nosniff');
    c.header('x-frame-options', 'DENY');
    c.header('referrer-policy', 'strict-origin-when-cross-origin');
    c.header('permissions-policy', 'geolocation=(self)');
  });

  app.use(
    '*',
    cors({
      origin: (origin) => allowedOrigin(origin) ?? undefined,
      credentials: true,
      allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowHeaders: ['Content-Type', 'Idempotency-Key', 'X-Payment-Signature', 'X-Request-Id'],
      exposeHeaders: ['x-request-id'],
      maxAge: 600,
    }),
  );

  app.use('*', async (c, next) => {
    const started = performance.now();
    await next();
    if (env.LOG_LEVEL === 'debug' || c.res.status >= 400) {
      console.info(
        JSON.stringify({
          level: c.res.status >= 500 ? 'error' : 'info',
          requestId: c.get('requestId'),
          method: c.req.method,
          path: new URL(c.req.url).pathname,
          status: c.res.status,
          ms: Math.round(performance.now() - started),
        }),
      );
    }
  });

  const health = createHealthRoutes(db);
  app.route('/health', health);
  app.route('/api/v1/health', health);
  app.route('/api/v1', publicRoutes());
  app.route('/api/v1/admin', adminRoutes());

  app.notFound((c) =>
    c.json(
      apiError('NOT_FOUND', `Rute ${c.req.method} ${new URL(c.req.url).pathname} tidak ditemukan.`),
      404,
    ),
  );

  app.onError((error, c) => {
    const requestId = c.get('requestId');

    if (error instanceof AppError) {
      return c.json(
        {
          ...apiError(error.code, error.message, {
            ...(error.hint ? { hint: error.hint } : {}),
            ...(error.details ? { details: error.details } : {}),
          }),
          requestId,
        },
        error.status as 400,
      );
    }

    if (error instanceof ZodError) {
      return c.json(
        {
          error: {
            code: 'VALIDATION_ERROR' as ErrorCode,
            message: 'Data permintaan tidak valid.',
            details: {
              issues: error.issues.map((issue) => ({
                path: issue.path.join('.'),
                message: issue.message,
              })),
            },
            requestId,
          },
        },
        400,
      );
    }

    console.error(
      JSON.stringify({
        level: 'error',
        requestId,
        message: (error as Error).message,
        stack: (error as Error).stack,
      }),
    );
    return c.json({ ...apiError('INTERNAL_ERROR', 'Terjadi kesalahan pada server.'), requestId }, 500);
  });

  return app;
}
