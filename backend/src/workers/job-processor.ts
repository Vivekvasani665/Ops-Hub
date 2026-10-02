import { Types } from 'mongoose';
import type { JobType, OrderStatus } from '@shared';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { isoDateInTz, startOfDayInTz } from '../utils/time';
import { formatInr } from '../utils/money';
import { recordAudit } from '../modules/audit/audit.service';
import { createNotification } from '../modules/notifications/notification.service';
import { enqueueJob } from '../modules/jobs/job.service';
import { Order } from '../modules/orders/order.model';
import { Organization } from '../modules/organizations/organization.model';
import type { JobDoc } from '../modules/jobs/job.model';
import { claimNextJob, completeJob, extendLease, failJob, BASE_BACKOFF_MS } from './job-lock';

export type ClaimedJob = JobDoc & { _id: Types.ObjectId };
export type JobHandler = (job: ClaimedJob) => Promise<Record<string, unknown> | null>;

const STATUS_WORD: Record<OrderStatus, string> = {
  PENDING: 'is pending',
  CONFIRMED: 'confirmed',
  PROCESSING: 'is being processed',
  SHIPPED: 'shipped',
  DELIVERED: 'delivered',
  CANCELLED: 'cancelled',
};

/**
 * Handlers must be idempotent: a job can run more than once (retry after a failure, or a crashed
 * worker whose lease expired after the side effect but before COMPLETED was written). Every write
 * below carries a dedupe key backed by a unique index, so a re-run is a no-op.
 */
export const HANDLERS: Record<JobType, JobHandler> = {
  async SEND_ORDER_NOTIFICATION(job) {
    const p = job.payload as {
      event: 'created' | 'status_changed';
      orderId: string;
      orderNumber: number;
      customerName: string;
      totalAmount: number;
      to?: OrderStatus;
      lowStock?: { productId: string; name: string; sku: string; available: number }[];
    };
    const orgId = job.organizationId as Types.ObjectId;
    let created = 0;

    if (p.event === 'created') {
      const n = await createNotification({
        organizationId: orgId,
        type: 'ORDER_CREATED',
        severity: 'info',
        title: `New order #${p.orderNumber}`,
        message: `${p.customerName} · ${formatInr(p.totalAmount)}`,
        entityType: 'ORDER',
        entityId: p.orderId,
        dedupeKey: `job:${job._id}:order`,
      });
      if (n) created++;
    } else if (p.to) {
      const n = await createNotification({
        organizationId: orgId,
        type: 'ORDER_STATUS_CHANGED',
        severity: p.to === 'CANCELLED' ? 'error' : p.to === 'DELIVERED' || p.to === 'SHIPPED' ? 'success' : 'info',
        title: `Order #${p.orderNumber} ${STATUS_WORD[p.to]}`,
        message: p.customerName,
        entityType: 'ORDER',
        entityId: p.orderId,
        dedupeKey: `job:${job._id}:order`,
      });
      if (n) created++;
    }

    const today = isoDateInTz(new Date(), env.ORG_TIMEZONE);
    for (const item of p.lowStock ?? []) {
      const n = await createNotification({
        organizationId: orgId,
        type: 'LOW_STOCK',
        severity: item.available === 0 ? 'error' : 'warning',
        title: item.available === 0 ? `Out of stock: ${item.name}` : `Low stock: ${item.name}`,
        message: `${item.sku} · ${item.available} left`,
        entityType: 'PRODUCT',
        entityId: item.productId,
        // At most one alert per product per day, no matter how many orders hit it.
        dedupeKey: `low-stock:${orgId}:${item.productId}:${item.available === 0 ? 'out' : 'low'}:${today}`,
      });
      if (n) created++;
    }
    // A real deployment would hand off to email/SMS/webhook here, passing job._id as the provider idempotency key.
    return { notificationsCreated: created };
  },

  async CREATE_ORDER_AUDIT(job) {
    const p = job.payload as {
      orderId: string;
      orderNumber: number;
      customerName: string;
      totalAmount: number;
      itemCount: number;
      actor: { id: string; name: string };
      ip?: string;
    };
    const doc = await recordAudit({
      organizationId: job.organizationId as Types.ObjectId,
      actor: { id: new Types.ObjectId(p.actor.id), name: p.actor.name },
      action: 'ORDER_CREATED',
      entityType: 'ORDER',
      entityId: new Types.ObjectId(p.orderId),
      metadata: {
        orderNumber: p.orderNumber,
        customerName: p.customerName,
        totalAmount: p.totalAmount,
        itemCount: p.itemCount,
      },
      ip: p.ip,
      dedupeKey: `order-created:${p.orderId}`,
    });
    return { auditLogId: doc ? String(doc._id) : null, deduplicated: !doc };
  },

  async GENERATE_DAILY_REPORT(job) {
    const orgId = job.organizationId as Types.ObjectId;
    const { date } = job.payload as { date: string };
    const org = await Organization.findById(orgId).lean();
    const tz = org?.timezone ?? env.ORG_TIMEZONE;
    // `date` is a local calendar day; resolve its bounds in the org timezone.
    const anchor = new Date(`${date}T12:00:00Z`);
    const from = startOfDayInTz(anchor, tz);
    const to = startOfDayInTz(new Date(anchor.getTime() + 86_400_000), tz);

    const rows = await Order.aggregate<{ _id: OrderStatus; n: number; revenue: number }>([
      { $match: { organizationId: orgId, createdAt: { $gte: from, $lt: to } } },
      { $group: { _id: '$status', n: { $sum: 1 }, revenue: { $sum: '$totalAmount' } } },
    ]);
    const byStatus = Object.fromEntries(rows.map((r) => [r._id, r.n]));
    const orders = rows.reduce((n, r) => n + r.n, 0);
    const revenue = rows.filter((r) => r._id !== 'CANCELLED').reduce((n, r) => n + r.revenue, 0);

    await createNotification({
      organizationId: orgId,
      type: 'DAILY_REPORT',
      severity: 'info',
      title: `Daily report for ${date}`,
      message: `${orders} orders · ${formatInr(revenue)} revenue`,
      entityType: 'ORGANIZATION',
      entityId: orgId,
      dedupeKey: `daily-report:${orgId}:${date}`,
    });
    return { date, orders, revenue, byStatus };
  },
};

/** Test/demo hook: `payload.simulateFailures = n` makes the first n attempts throw (never in production). */
function maybeSimulateFailure(job: ClaimedJob) {
  const n = Number((job.payload as { simulateFailures?: number })?.simulateFailures ?? 0);
  if (env.NODE_ENV !== 'production' && job.attempts <= n) {
    throw new Error(`Simulated failure (attempt ${job.attempts}/${n})`);
  }
}

export async function processJob(
  job: ClaimedJob,
  workerId: string,
  opts: { handlers?: Record<JobType, JobHandler>; backoffBaseMs?: number; leaseMs?: number } = {},
) {
  const handlers = opts.handlers ?? HANDLERS;
  const leaseMs = opts.leaseMs ?? env.WORKER_LEASE_MS;
  const heartbeat = setInterval(() => {
    void extendLease(job._id, workerId, leaseMs).catch(() => undefined);
  }, Math.max(1000, leaseMs / 3));

  try {
    maybeSimulateFailure(job);
    const handler = handlers[job.type as JobType];
    if (!handler) throw new Error(`No handler for job type ${job.type}`);
    const result = await handler(job);
    const ok = await completeJob(job._id, workerId, result);
    if (!ok) logger.warn(`Job ${job._id} lease was lost before completion; result discarded`);
    return { status: 'COMPLETED' as const, result };
  } catch (err) {
    const { exhausted } = await failJob(job, workerId, err, opts.backoffBaseMs ?? BASE_BACKOFF_MS);
    logger.warn(`Job ${job._id} (${job.type}) attempt ${job.attempts}/${job.maxAttempts} failed`, err);
    return { status: exhausted ? ('FAILED' as const) : ('RETRY' as const), error: err };
  } finally {
    clearInterval(heartbeat);
  }
}

/** Claim and run one job. Returns null when nothing is runnable. */
export async function processNextJob(
  workerId: string,
  opts: Parameters<typeof processJob>[2] & { leaseMs?: number } = {},
) {
  const job = await claimNextJob(workerId, opts.leaseMs);
  if (!job) return null;
  const outcome = await processJob(job as ClaimedJob, workerId, opts);
  return { job, ...outcome };
}

/** Enqueue yesterday's report for every active org. The dedupe key makes this safe to call from every worker, every hour. */
export async function scheduleDailyReports(now = new Date()) {
  const orgs = await Organization.find({ status: 'ACTIVE' }).select({ timezone: 1 }).lean();
  let enqueued = 0;
  for (const org of orgs) {
    const tz = org.timezone ?? env.ORG_TIMEZONE;
    const date = isoDateInTz(new Date(startOfDayInTz(now, tz).getTime() - 1), tz);
    const job = await enqueueJob({
      type: 'GENERATE_DAILY_REPORT',
      organizationId: org._id,
      payload: { date },
      dedupeKey: `daily-report:${org._id}:${date}`,
    });
    if (job) enqueued++;
  }
  return enqueued;
}
