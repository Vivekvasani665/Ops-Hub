/**
 * Zero-install local MongoDB for development: a single-node replica set (transactions and change
 * streams need one) on port 27027, with data persisted in ./.data/db between runs.
 * Use docker-compose instead if you prefer a real mongod.
 */
import fs from 'node:fs';
import path from 'node:path';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

const PORT = Number(process.env.DEV_DB_PORT ?? 27027);
const dbPath = path.resolve(process.cwd(), '.data/db');
fs.mkdirSync(dbPath, { recursive: true });

const replSet = await MongoMemoryReplSet.create({
  replSet: { name: 'rs0', count: 1, storageEngine: 'wiredTiger' },
  instanceOpts: [{ port: PORT, dbPath }],
});

console.log(`MongoDB replica set ready: mongodb://127.0.0.1:${PORT}/opshub?replicaSet=rs0  (data: ${dbPath})`);

const stop = async () => {
  await replSet.stop({ doCleanup: false, force: false });
  process.exit(0);
};
process.on('SIGINT', () => void stop());
process.on('SIGTERM', () => void stop());
