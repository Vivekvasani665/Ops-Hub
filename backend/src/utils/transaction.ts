import mongoose, { type ClientSession } from 'mongoose';

/**
 * Runs `fn` inside a MongoDB multi-document transaction. The driver's withTransaction
 * retries automatically on TransientTransactionError (e.g. WriteConflict when many
 * requests reserve the same inventory row) and on UnknownTransactionCommitResult.
 */
export async function withTransaction<T>(fn: (session: ClientSession) => Promise<T>): Promise<T> {
  const session = await mongoose.startSession();
  try {
    let result!: T;
    await session.withTransaction(
      async () => {
        result = await fn(session);
      },
      { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' }, readPreference: 'primary' },
    );
    return result;
  } finally {
    await session.endSession();
  }
}
