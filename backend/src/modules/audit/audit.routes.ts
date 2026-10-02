import { Router, type Request, type Response } from 'express';
import { AUDIT_ACTIONS, ENTITY_TYPES } from '@shared';
import { Types, type FilterQuery } from 'mongoose';
import { requirePermission } from '../../middlewares/auth.middleware';
import { Errors } from '../../utils/errors';
import { parseDate, queryString } from '../../utils/http';
import { AuditLog, type AuditLogDoc } from './audit.model';
import { toAuditDto } from './audit.service';

export const auditRouter = Router();

function encodeCursor(doc: { createdAt: Date; _id: unknown }) {
  return Buffer.from(`${doc.createdAt.getTime()}:${String(doc._id)}`).toString('base64url');
}

function decodeCursor(cursor: string) {
  const [ts, id] = Buffer.from(cursor, 'base64url').toString().split(':');
  if (!ts || !id || !Types.ObjectId.isValid(id)) throw Errors.validation({ cursor: 'Invalid cursor' });
  return { createdAt: new Date(Number(ts)), id: new Types.ObjectId(id) };
}

/**
 * Keyset (cursor) pagination: stable under concurrent inserts and O(limit) regardless of depth,
 * unlike skip/limit which degrades on 100k+ rows.
 */
auditRouter.get('/', requirePermission('audit:read'), async (req: Request, res: Response) => {
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
  const filter: FilterQuery<AuditLogDoc> = { organizationId: req.tenantId };

  const action = queryString(req, 'action');
  if (action) {
    if (!(AUDIT_ACTIONS as readonly string[]).includes(action)) throw Errors.validation({ action: 'Unknown action' });
    filter.action = action;
  }
  const entityType = queryString(req, 'entityType');
  if (entityType) {
    if (!(ENTITY_TYPES as readonly string[]).includes(entityType)) throw Errors.validation({ entityType: 'Unknown' });
    filter.entityType = entityType;
  }
  const entityId = queryString(req, 'entityId');
  if (entityId && Types.ObjectId.isValid(entityId)) filter.entityId = new Types.ObjectId(entityId);
  const actorId = queryString(req, 'actorId');
  if (actorId && Types.ObjectId.isValid(actorId)) filter['actor.id'] = new Types.ObjectId(actorId);

  const from = parseDate(queryString(req, 'from'));
  const to = parseDate(queryString(req, 'to'), true);
  if (from || to) filter.createdAt = { ...(from && { $gte: from }), ...(to && { $lte: to }) };

  const cursor = queryString(req, 'cursor');
  if (cursor) {
    const c = decodeCursor(cursor);
    // The explicit `$lte` gives the planner an index bound on createdAt; without it the $or alone
    // made MongoDB scan from the newest entry down to the cursor (50k keys at row 50,000).
    filter.createdAt = { ...(from && { $gte: from }), $lte: to && to < c.createdAt ? to : c.createdAt };
    filter.$or = [{ createdAt: { $lt: c.createdAt } }, { createdAt: c.createdAt, _id: { $lt: c.id } }];
  }

  const docs = await AuditLog.find(filter)
    .sort({ createdAt: -1, _id: -1 })
    .limit(limit + 1)
    .lean();
  const hasMore = docs.length > limit;
  const page = hasMore ? docs.slice(0, limit) : docs;

  res.json({
    data: page.map((d) => toAuditDto(d as never)),
    meta: { limit, nextCursor: hasMore ? encodeCursor(page[page.length - 1] as never) : null },
  });
});
