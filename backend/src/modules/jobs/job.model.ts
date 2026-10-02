import { Schema, model, type InferSchemaType } from 'mongoose';
import { JOB_STATUSES, JOB_TYPES } from '@shared';

const jobSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, default: null },
    type: { type: String, enum: JOB_TYPES, required: true },
    payload: { type: Schema.Types.Mixed, default: {} },
    status: { type: String, enum: JOB_STATUSES, default: 'PENDING' },
    attempts: { type: Number, default: 0 },
    maxAttempts: { type: Number, default: 3 },
    /** earliest time a worker may pick the job (used for exponential backoff) */
    availableAt: { type: Date, default: () => new Date() },
    /** lease: a PROCESSING job whose lease expired is considered abandoned (crashed worker) */
    lockedBy: { type: String, default: null },
    lockedUntil: { type: Date, default: null },
    lastError: { type: String, default: null },
    result: { type: Schema.Types.Mixed, default: null },
    completedAt: { type: Date, default: null },
    /** optional uniqueness (e.g. one daily report per org per day) */
    dedupeKey: { type: String },
  },
  { timestamps: true },
);

// Worker claim query: ready PENDING jobs ordered by availableAt.
jobSchema.index({ status: 1, availableAt: 1 });
// Crash recovery: PROCESSING jobs whose lease expired.
jobSchema.index({ status: 1, lockedUntil: 1 });
// Jobs page per tenant.
jobSchema.index({ organizationId: 1, createdAt: -1 });
jobSchema.index({ organizationId: 1, status: 1, createdAt: -1 });
jobSchema.index({ dedupeKey: 1 }, { unique: true, partialFilterExpression: { dedupeKey: { $type: 'string' } } });

export type JobDoc = InferSchemaType<typeof jobSchema>;
export const Job = model('Job', jobSchema, 'jobs');
