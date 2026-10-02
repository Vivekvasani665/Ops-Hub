import os from 'node:os';
import crypto from 'node:crypto';
import { env } from '../config/env';
import { connectDatabase, disconnectDatabase } from '../config/database';
import { logger } from '../utils/logger';
import { processNextJob, scheduleDailyReports } from './job-processor';

/**
 * Standalone worker process. Run as many copies as you like: job claiming is an atomic
 * findOneAndUpdate with a lease, so no two workers ever process the same job concurrently,
 * and a crashed worker's job is picked up by another once its lease expires.
 */
const workerId = `${os.hostname()}:${process.pid}:${crypto.randomUUID().slice(0, 8)}`;
let stopping = false;

async function loop(slot: number) {
  while (!stopping) {
    try {
      const ran = await processNextJob(`${workerId}#${slot}`);
      if (ran) {
        logger.info(`[${slot}] ${ran.job.type} ${ran.job._id} → ${ran.status} (attempt ${ran.job.attempts})`);
        continue; // drain the queue without sleeping
      }
    } catch (err) {
      logger.error('Worker loop error', err);
    }
    await new Promise((r) => setTimeout(r, env.WORKER_POLL_MS));
  }
}

async function main() {
  await connectDatabase();
  logger.info(`Worker ${workerId} started (concurrency ${env.WORKER_CONCURRENCY}, lease ${env.WORKER_LEASE_MS}ms)`);

  const schedule = () =>
    scheduleDailyReports()
      .then((n) => n && logger.info(`Scheduled ${n} daily report job(s)`))
      .catch((err) => logger.error('Failed to schedule daily reports', err));
  await schedule();
  const timer = setInterval(schedule, 60 * 60 * 1000);

  const loops = Array.from({ length: env.WORKER_CONCURRENCY }, (_, i) => loop(i));

  const shutdown = async (signal: string) => {
    if (stopping) return;
    stopping = true;
    logger.info(`${signal} received, finishing in-flight jobs...`);
    clearInterval(timer);
    // In-flight jobs finish; anything interrupted is recovered via lease expiry by another worker.
    await Promise.race([Promise.all(loops), new Promise((r) => setTimeout(r, 10_000))]);
    await disconnectDatabase();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  logger.error('Worker failed to start', err);
  process.exit(1);
});
