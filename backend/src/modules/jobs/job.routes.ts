import { Router, type Request, type Response } from 'express';
import { JOB_STATUSES, JOB_TYPES, type JobStatus } from '@shared';
import type { FilterQuery } from 'mongoose';
import { requirePermission } from '../../middlewares/auth.middleware';
import { Errors } from '../../utils/errors';
import { pageMeta, pagination, parseObjectId, queryString } from '../../utils/http';
import { recordAudit } from '../audit/audit.service';
import { Job, type JobDoc } from './job.model';
import { toJobDto } from './job.service';

export const jobRouter = Router();

jobRouter.get('/', requirePermission('jobs:read'), async (req: Request, res: Response) => {
  const { page, limit, skip } = pagination(req, { limit: 20, max: 100 });
  const filter: FilterQuery<JobDoc> = { organizationId: req.tenantId };
  const status = queryString(req, 'status');
  if (status && (JOB_STATUSES as readonly string[]).includes(status)) filter.status = status;
  const type = queryString(req, 'type');
  if (type && (JOB_TYPES as readonly string[]).includes(type)) filter.type = type;

  const [docs, total, grouped] = await Promise.all([
    Job.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Job.countDocuments(filter),
    Job.aggregate<{ _id: JobStatus; n: number }>([
      { $match: { organizationId: req.tenantId } },
      { $group: { _id: '$status', n: { $sum: 1 } } },
    ]),
  ]);
  const counts = Object.fromEntries(JOB_STATUSES.map((s) => [s, 0])) as Record<JobStatus, number>;
  for (const g of grouped) counts[g._id] = g.n;

  res.json({ data: docs.map((d) => toJobDto(d as never)), meta: { ...pageMeta(page, limit, total), counts } });
});

jobRouter.post('/:id/retry', requirePermission('jobs:retry'), async (req: Request, res: Response) => {
  const id = parseObjectId(String(req.params.id), 'Job');
  const job = await Job.findOneAndUpdate(
    { _id: id, organizationId: req.tenantId, status: 'FAILED' },
    { $set: { status: 'PENDING', attempts: 0, availableAt: new Date(), lastError: null, lockedBy: null, lockedUntil: null } },
    { new: true },
  ).lean();
  if (!job) {
    const exists = await Job.exists({ _id: id, organizationId: req.tenantId });
    if (!exists) throw Errors.notFound('Job');
    throw Errors.conflict('JOB_NOT_RETRYABLE', 'Only FAILED jobs can be retried');
  }
  await recordAudit({
    organizationId: req.tenantId!,
    actor: { id: req.auth!.userId, name: req.auth!.name },
    action: 'JOB_RETRIED',
    entityType: 'JOB',
    entityId: id,
    metadata: { type: job.type },
    ip: req.ip,
  });
  res.json({ data: toJobDto(job as never) });
});
