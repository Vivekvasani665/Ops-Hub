import { Schema, model } from 'mongoose';

const idempotencyKeySchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, required: true },
    userId: { type: Schema.Types.ObjectId, required: true },
    key: { type: String, required: true },
    method: { type: String, required: true },
    path: { type: String, required: true },
    requestHash: { type: String, required: true },
    status: { type: String, enum: ['IN_PROGRESS', 'COMPLETED'], required: true },
    responseStatus: Number,
    responseBody: Schema.Types.Mixed,
    lockedUntil: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

// The unique index *is* the lock: only one request can insert a given key per tenant.
idempotencyKeySchema.index({ organizationId: 1, key: 1 }, { unique: true });
idempotencyKeySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const IdempotencyKey = model('IdempotencyKey', idempotencyKeySchema, 'idempotency_keys');
