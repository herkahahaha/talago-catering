/** Entry terpisah untuk ROLE=worker (image sama, peran proses berbeda). */
import { getEnv } from '@catering/core';
import { startWorker } from './worker';

if (getEnv().ROLE !== 'worker') {
  console.info('ROLE bukan worker; tetap menjalankan proses worker (dev).');
}

startWorker().catch((error) => {
  console.error('Worker gagal:', error);
  process.exit(1);
});
