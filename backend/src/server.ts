import http from 'node:http';
import { env, payuEnabled, payuMissing, payuUrls } from './config/env';
import { connectDatabase, disconnectDatabase } from './config/database';
import { createApp } from './app';
import { createSocketServer } from './realtime/socket';
import { seedDatabase } from './seed/seed';
import { logger } from './utils/logger';

async function main() {
  await connectDatabase();
  if (env.AUTO_SEED) await seedDatabase();

  const server = http.createServer(createApp());
  const io = createSocketServer(server);

  server.listen(env.API_PORT, () => logger.info(`OpsHub API listening on http://localhost:${env.API_PORT}`));
  if (payuEnabled) {
    logger.info(`[PayU] online payments enabled · environment: ${env.PAYU_ENV} · checkout: ${payuUrls.payment}`);
  } else {
    // Names only: the key and salt are never logged.
    logger.warn(`[PayU] online payments DISABLED (COD only) — set ${payuMissing.join(', ')} in backend/.env`);
  }
  if (env.PAYU_ENV === 'test' && payuUrls.payment.includes('secure.payu.in')) {
    logger.warn('[PayU] PAYU_ENV=test but PAYU_PAYMENT_URL points at production (secure.payu.in)');
  }

  const shutdown = (signal: string) => {
    logger.info(`${signal} received, shutting down`);
    io.close();
    server.close(() => {
      void disconnectDatabase().finally(() => process.exit(0));
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  logger.error('API failed to start', err);
  process.exit(1);
});
