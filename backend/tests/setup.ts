import { afterAll, beforeAll, inject } from 'vitest';
import mongoose from 'mongoose';
import { ALL_MODELS } from './helpers';

beforeAll(async () => {
  await mongoose.connect(inject('mongoUri'), { maxPoolSize: 120 });
  // Unique indexes are part of the correctness story (idempotency keys, order numbers, dedupe keys),
  // so make sure they exist before any test runs.
  for (const model of ALL_MODELS) await model.createIndexes();
});

afterAll(async () => {
  await mongoose.disconnect();
});
