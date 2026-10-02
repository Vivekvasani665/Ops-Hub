import http from 'node:http';
import { env } from './config/env';
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
