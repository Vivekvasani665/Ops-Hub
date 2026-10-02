import type { Types } from 'mongoose';
import { env } from '../config/env';
import { Job } from '../modules/jobs/job.model';

export const BASE_BACKOFF_MS = 1000;

/** 1s, 2s, 4s, ... after the 1st, 2nd, 3rd failed attempt. */
export function backoffMs(attempt: number, base = BASE_BACKOFF_MS): number {
  return base * 2 ** Math.max(0, attempt - 1);
}

/**
 * Atomically claims ONE runnable job for `workerId`.
 *
 * A single findOneAndUpdate both selects and locks the job, so two workers can never claim the
 * same job: whichever update MongoDB applies first flips the status/lease, and the other worker's
 * filter no longer matches that document.
 *
 * Runnable = PENDING whose backoff has elapsed, or PROCESSING whose lease expired (the worker that
 * held it crashed or hung). Leases are what make crash recovery possible without a coordinator.
 */
export async function claimNextJob(workerId: string, leaseMs = env.WORKER_LEASE_MS, now = new Date()) {
  await failExhaustedAbandonedJobs(now);
  return Job.findOneAndUpdate(
    {
      $or: [
        { status: 'PENDING', availableAt: { $lte: now } },
        { status: 'PROCESSING', lockedUntil: { $lt: now } },
      ],
    },
    {
      $set: { status: 'PROCESSING', lockedBy: workerId, lockedUntil: new Date(now.getTime() + leaseMs) },
      $inc: { attempts: 1 },
    },
    { sort: { availableAt: 1 }, new: true },
  ).lean();
}

/**
 * A job whose worker crashed on its final attempt has no attempts left; reclaiming it would exceed
 * maxAttempts, so it is marked FAILED instead.
 */
async function failExhaustedAbandonedJobs(now: Date) {
  await Job.updateMany(
    { status: 'PROCESSING', lockedUntil: { $lt: now }, $expr: { $gte: ['$attempts', '$maxAttempts'] } },
    {
      $set: { status: 'FAILED', lastError: 'Worker lease expired on final attempt', lockedBy: null, lockedUntil: null },
    },
  );
}

/** Heartbeat for long jobs. Returns false if the lease was lost (another worker took over). */
export async function extendLease(jobId: Types.ObjectId, workerId: string, leaseMs = env.WORKER_LEASE_MS) {
  const res = await Job.updateOne(
    { _id: jobId, status: 'PROCESSING', lockedBy: workerId },
    { $set: { lockedUntil: new Date(Date.now() + leaseMs) } },
  );
  return res.modifiedCount === 1;
}

/** Every terminal write is fenced on `lockedBy`, so a worker that lost its lease cannot clobber the new owner. */
export async function completeJob(jobId: Types.ObjectId, workerId: string, result: Record<string, unknown> | null) {
  const res = await Job.updateOne(
    { _id: jobId, status: 'PROCESSING', lockedBy: workerId },
    { $set: { status: 'COMPLETED', result, completedAt: new Date(), lockedBy: null, lockedUntil: null, lastError: null } },
  );
  return res.modifiedCount === 1;
}

export async function failJob(
  job: { _id: Types.ObjectId; attempts: number; maxAttempts: number },
  workerId: string,
  error: unknown,
  base = BASE_BACKOFF_MS,
) {
  const message = error instanceof Error ? error.message : String(error);
  const exhausted = job.attempts >= job.maxAttempts;
  const res = await Job.updateOne(
    { _id: job._id, status: 'PROCESSING', lockedBy: workerId },
    {
      $set: exhausted
        ? { status: 'FAILED', lastError: message, lockedBy: null, lockedUntil: null }
        : {
            status: 'PENDING',
            lastError: message,
            lockedBy: null,
            lockedUntil: null,
            availableAt: new Date(Date.now() + backoffMs(job.attempts, base)),
          },
    },
  );
  return { updated: res.modifiedCount === 1, exhausted };
}
