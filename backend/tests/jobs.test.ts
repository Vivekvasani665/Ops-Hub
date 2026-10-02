import { beforeEach, describe, expect, it } from 'vitest';
import type { JobType } from '@shared';
import { Job } from '../src/modules/jobs/job.model';
import { AuditLog } from '../src/modules/audit/audit.model';
import { Notification } from '../src/modules/notifications/notification.model';
import { enqueueJob } from '../src/modules/jobs/job.service';
import { HANDLERS, processNextJob, scheduleDailyReports, type JobHandler } from '../src/workers/job-processor';
import { backoffMs, claimNextJob, completeJob } from '../src/workers/job-lock';
import { createTenant, key, loginAs, orderBody, resetDb } from './helpers';

beforeEach(resetDb);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function drain(workerId = 'test-worker', opts: Parameters<typeof processNextJob>[1] = {}) {
  const results = [];
  for (;;) {
    const r = await processNextJob(workerId, opts);
    if (!r) return results;
    results.push(r);
  }
}

describe('background jobs', () => {
  it('order creation jobs run to completion and produce idempotent side effects', async () => {
    const { products } = await createTenant('acme', { products: [{ sku: 'JOB', stock: 3, reorderLevel: 2 }] });
    const agent = await loginAs('operator@acme.test');
    const order = await agent.post('/api/orders').set('Idempotency-Key', key()).send(orderBody(String(products[0]!._id), 2));

    const results = await drain();
    expect(results.map((r) => r.status)).toEqual(['COMPLETED', 'COMPLETED']);
    expect(await Job.countDocuments({ status: 'COMPLETED' })).toBe(2);
    expect(await AuditLog.countDocuments({ action: 'ORDER_CREATED', entityId: order.body.data.id })).toBe(1);
    // New-order notification + low-stock alert (1 left ≤ reorder level 2).
    const types = (await Notification.find().lean()).map((n) => n.type).sort();
    expect(types).toEqual(['LOW_STOCK', 'ORDER_CREATED']);
  });

  it('handlers are idempotent when a job is executed twice', async () => {
    const { org, users } = await createTenant('acme');
    const job = await enqueueJob({
      type: 'CREATE_ORDER_AUDIT',
      organizationId: org._id,
      payload: { orderId: String(org._id), orderNumber: 1001, customerName: 'X', totalAmount: 1, itemCount: 1, actor: { id: String(users.ORG_ADMIN._id), name: 'A' } },
    });
    await HANDLERS.CREATE_ORDER_AUDIT(job!.toObject() as never);
    const second = await HANDLERS.CREATE_ORDER_AUDIT(job!.toObject() as never);
    expect(second).toMatchObject({ deduplicated: true });
    expect(await AuditLog.countDocuments({ action: 'ORDER_CREATED' })).toBe(1);
  });

  it('retries with exponential backoff, then succeeds', async () => {
    const { org } = await createTenant('acme');
    await enqueueJob({
      type: 'GENERATE_DAILY_REPORT',
      organizationId: org._id,
      payload: { date: '2026-10-01', simulateFailures: 2 },
    });

    const first = await processNextJob('w', { backoffBaseMs: 200 });
    expect(first?.status).toBe('RETRY');
    let job = await Job.findOne().lean();
    expect(job).toMatchObject({ status: 'PENDING', attempts: 1, lockedBy: null });
    expect(job!.lastError).toMatch(/Simulated failure/);
    const delay1 = job!.availableAt.getTime() - Date.now();
    expect(delay1).toBeGreaterThan(100);
    expect(delay1).toBeLessThanOrEqual(200);

    // Not runnable until the backoff elapses.
    expect(await processNextJob('w', { backoffBaseMs: 200 })).toBeNull();
    await sleep(220);
    expect((await processNextJob('w', { backoffBaseMs: 200 }))?.status).toBe('RETRY');
    job = await Job.findOne().lean();
    const delay2 = job!.availableAt.getTime() - Date.now();
    expect(delay2).toBeGreaterThan(250); // 400ms for attempt 2
    await sleep(420);
    expect((await processNextJob('w', { backoffBaseMs: 200 }))?.status).toBe('COMPLETED');
    job = await Job.findOne().lean();
    expect(job).toMatchObject({ status: 'COMPLETED', attempts: 3 });
    expect(job!.result).toMatchObject({ date: '2026-10-01', orders: 0 });
  });

  it('marks a job FAILED after maxAttempts', async () => {
    const { org } = await createTenant('acme');
    await enqueueJob({ type: 'GENERATE_DAILY_REPORT', organizationId: org._id, payload: { date: '2026-10-01', simulateFailures: 99 }, maxAttempts: 2 });
    expect((await processNextJob('w', { backoffBaseMs: 1 }))?.status).toBe('RETRY');
    await sleep(5);
    expect((await processNextJob('w', { backoffBaseMs: 1 }))?.status).toBe('FAILED');
    expect(await Job.findOne().lean()).toMatchObject({ status: 'FAILED', attempts: 2 });
    expect(await processNextJob('w')).toBeNull();
  });

  it('recovers a job from a crashed worker after its lease expires, and fences the stale worker', async () => {
    const { org } = await createTenant('acme');
    await enqueueJob({ type: 'GENERATE_DAILY_REPORT', organizationId: org._id, payload: { date: '2026-10-01' } });

    // Worker A claims the job with a short lease, then "crashes" (never completes).
    const claimed = await claimNextJob('worker-A', 100);
    expect(claimed).toMatchObject({ status: 'PROCESSING', lockedBy: 'worker-A' });
    expect(await claimNextJob('worker-B', 100)).toBeNull(); // lease still held

    await sleep(150);
    const recovered = await processNextJob('worker-B');
    expect(recovered?.status).toBe('COMPLETED');
    expect(recovered?.job.attempts).toBe(2);

    // Worker A comes back to life: its write is rejected because it no longer holds the lease.
    expect(await completeJob(claimed!._id, 'worker-A', { stale: true })).toBe(false);
    expect((await Job.findOne().lean())!.result).not.toMatchObject({ stale: true });
  });

  it('fails a job whose worker crashed on its final attempt instead of exceeding maxAttempts', async () => {
    const { org } = await createTenant('acme');
    await enqueueJob({ type: 'GENERATE_DAILY_REPORT', organizationId: org._id, payload: { date: '2026-10-01' }, maxAttempts: 1 });
    await claimNextJob('worker-A', 50);
    await sleep(80);
    expect(await claimNextJob('worker-B', 50)).toBeNull();
    expect(await Job.findOne().lean()).toMatchObject({ status: 'FAILED', attempts: 1 });
  });

  it('multiple concurrent workers process each job exactly once', async () => {
    const { org } = await createTenant('acme');
    for (let i = 0; i < 30; i++) {
      await enqueueJob({ type: 'GENERATE_DAILY_REPORT', organizationId: org._id, payload: { date: `2026-09-${String(i + 1).padStart(2, '0')}` } });
    }
    const seen: string[] = [];
    const counting: JobHandler = async (job) => {
      seen.push(String(job._id));
      await sleep(5);
      return null;
    };
    const handlers = { ...HANDLERS, GENERATE_DAILY_REPORT: counting } as Record<JobType, JobHandler>;

    await Promise.all(Array.from({ length: 6 }, (_, i) => drain(`worker-${i}`, { handlers })));

    expect(seen).toHaveLength(30);
    expect(new Set(seen).size).toBe(30);
    expect(await Job.countDocuments({ status: 'COMPLETED' })).toBe(30);
  });

  it('daily report scheduling is deduplicated across workers', async () => {
    await createTenant('acme');
    await createTenant('globex');
    const counts = await Promise.all([scheduleDailyReports(), scheduleDailyReports(), scheduleDailyReports()]);
    expect(counts.reduce((a, b) => a + b, 0)).toBe(2);
    expect(await Job.countDocuments({ type: 'GENERATE_DAILY_REPORT' })).toBe(2);
  });

  it('only FAILED jobs can be retried via the API', async () => {
    const { org } = await createTenant('acme');
    const job = await enqueueJob({ type: 'GENERATE_DAILY_REPORT', organizationId: org._id, payload: { date: '2026-10-01' } });
    const admin = await loginAs('org_admin@acme.test');
    expect((await admin.post(`/api/jobs/${job!._id}/retry`)).status).toBe(409);

    await Job.updateOne({ _id: job!._id }, { $set: { status: 'FAILED', attempts: 3 } });
    const retried = await admin.post(`/api/jobs/${job!._id}/retry`);
    expect(retried.status).toBe(200);
    expect(retried.body.data).toMatchObject({ status: 'PENDING', attempts: 0 });
  });

  it('backoff doubles per attempt', () => {
    expect([1, 2, 3, 4].map((a) => backoffMs(a))).toEqual([1000, 2000, 4000, 8000]);
  });
});
