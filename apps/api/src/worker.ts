import { PgBoss } from 'pg-boss';
import {
  closeDatabase,
  getDatabase,
  getEnv,
  listQueuedNotifications,
  lockProductionIfDue,
  markNotificationFailed,
  markNotificationSent,
  pruneCaptchaChallenges,
  pruneRateLimits,
  sql,
  sweepExpiredHolds,
} from '@catering/core';

const log = (message: string, extra: Record<string, unknown> = {}) => {
  console.info(JSON.stringify({ level: 'info', scope: 'worker', message, ...extra }));
};

/**
 * Peran proses terpisah dari image yang sama (PRD §6.1). Semua job aman
 * dijalankan lebih dari satu container: pekerjaan bersifat idempoten dan
 * kebenaran kapasitas tetap dijaga lazy expiry di jalur request.
 */
export async function startWorker(): Promise<void> {
  const env = getEnv();
  const dbHandle = getDatabase();
  const db = dbHandle.db;

  const boss = new PgBoss({
    connectionString: env.DATABASE_URL,
    schema: 'pgboss',
    max: 3,
    application_name: 'catering-worker',
  });

  boss.on('error', (error: unknown) => {
    console.error(JSON.stringify({ level: 'error', scope: 'worker', error: String(error) }));
  });

  await boss.start();

  for (const queue of ['hold-sweep', 'notifications', 'production-lock', 'cleanup']) {
    await boss.createQueue(queue);
  }

  await boss.work('hold-sweep', async (jobs) => {
    void jobs;
    const expired = await sweepExpiredHolds(db);
    if (expired > 0) log('hold kedaluwarsa dilepas', { expired });
  });

  await boss.work('notifications', async (jobs) => {
    void jobs;
    const queued = await listQueuedNotifications(db, 30);
    for (const notification of queued) {
      try {
        // Kanal nyata (SMTP/WhatsApp API) dipasang di fase 2. Saat ini outbox
        // ditandai terkirim agar alur tetap teruji end-to-end.
        log('notifikasi terkirim (mock)', {
          channel: notification.channel,
          recipient: notification.recipient,
          template: notification.template,
          payload: notification.payload,
        });
        await markNotificationSent(db, notification.id);
      } catch (error) {
        await markNotificationFailed(db, notification.id, String(error));
      }
    }
  });

  await boss.work('production-lock', async (jobs) => {
    void jobs;
    const locked = await lockProductionIfDue(db);
    if (locked.length > 0) log('rekap produksi dikunci', { dates: locked });
  });

  await boss.work('cleanup', async (jobs) => {
    void jobs;
    const [rateLimits, captcha] = await Promise.all([pruneRateLimits(db), pruneCaptchaChallenges(db)]);
    await db.execute(sql`DELETE FROM idempotency_keys WHERE expires_at < now() - interval '1 day'`);
    log('pembersihan selesai', { rateLimits, captcha });
  });

  // Jadwal WIB; pg-boss menyimpan jadwal di database sehingga aman multi-worker.
  const tz = 'Asia/Jakarta';
  await boss.schedule('hold-sweep', '* * * * *', {}, { tz });
  await boss.schedule('notifications', '* * * * *', {}, { tz });
  await boss.schedule('production-lock', '*/5 * * * *', {}, { tz });
  await boss.schedule('cleanup', '0 3 * * *', {}, { tz });

  log('worker siap', { queues: ['hold-sweep', 'notifications', 'production-lock', 'cleanup'] });

  const shutdown = async (signal: string) => {
    log(`menerima ${signal}, menghentikan worker`, {});
    await boss.stop({ graceful: true });
    await closeDatabase();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}
