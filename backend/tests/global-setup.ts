import { MongoMemoryReplSet } from 'mongodb-memory-server';
import type { TestProject } from 'vitest/node';

// A real single-node replica set: transactions and change streams behave exactly as in production.
let replSet: MongoMemoryReplSet | undefined;

export async function setup(project: TestProject) {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  project.provide('mongoUri', replSet.getUri('opshub-test'));
}

export async function teardown() {
  await replSet?.stop();
}

declare module 'vitest' {
  export interface ProvidedContext {
    mongoUri: string;
  }
}
