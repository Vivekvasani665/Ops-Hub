import mongoose from 'mongoose';
import { env } from './env';
import { logger } from '../utils/logger';

mongoose.set('strictQuery', true);

export async function connectDatabase(uri = env.MONGODB_URI, attempts = 30): Promise<typeof mongoose> {
  for (let i = 1; i <= attempts; i++) {
    try {
      await mongoose.connect(uri, { serverSelectionTimeoutMS: 3000, maxPoolSize: 50 });
      logger.info(`MongoDB connected (${mongoose.connection.host}:${mongoose.connection.port})`);
      return mongoose;
    } catch (err) {
      if (i === attempts) throw err;
      logger.warn(`MongoDB not reachable yet (attempt ${i}/${attempts}), retrying...`);
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  throw new Error('unreachable');
}

export async function disconnectDatabase() {
  await mongoose.disconnect();
}
