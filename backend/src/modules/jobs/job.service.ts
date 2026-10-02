import type { ClientSession, Types } from 'mongoose';
import type { JobDto, JobType } from '@shared';
import { Job } from './job.model';

export interface EnqueueInput {
  type: JobType;
  organizationId: Types.ObjectId | null;
  payload?: Record<string, unknown>;
  maxAttempts?: number;
  delayMs?: number;
  dedupeKey?: string;
}

/**
 * Enqueue a job. Passing the business transaction's session gives us a transactional outbox:
 * the job exists if and only if the order/state change that produced it committed.
 */
export async function enqueueJob(input: EnqueueInput, session?: ClientSession) {
  try {
    const [job] = await Job.create(
      [
        {
          type: input.type,
          organizationId: input.organizationId,
          payload: input.payload ?? {},
          maxAttempts: input.maxAttempts ?? 3,
          availableAt: new Date(Date.now() + (input.delayMs ?? 0)),
          dedupeKey: input.dedupeKey,
        },
      ],
      { session },
    );
    return job;
  } catch (err) {
    if (input.dedupeKey && (err as { code?: number }).code === 11000) return null;
    throw err;
  }
}

export function toJobDto(doc: {
  _id: unknown;
  type: string;
  status: string;
  attempts: number;
  maxAttempts: number;
  availableAt: Date;
  lockedBy?: string | null;
  lastError?: string | null;
  payload?: unknown;
  result?: unknown;
  createdAt: Date;
  completedAt?: Date | null;
}): JobDto {
  return {
    id: String(doc._id),
    type: doc.type as JobDto['type'],
    status: doc.status as JobDto['status'],
    attempts: doc.attempts,
    maxAttempts: doc.maxAttempts,
    availableAt: doc.availableAt.toISOString(),
    lockedBy: doc.lockedBy ?? null,
    lastError: doc.lastError ?? null,
    payload: (doc.payload as Record<string, unknown>) ?? {},
    result: (doc.result as Record<string, unknown>) ?? null,
    createdAt: doc.createdAt.toISOString(),
    completedAt: doc.completedAt ? doc.completedAt.toISOString() : null,
  };
}
