import crypto from 'node:crypto';
import type { RequestHandler } from 'express';
import { IdempotencyKey } from '../modules/idempotency/idempotency.model';
import { AppError, Errors } from '../utils/errors';

const KEY_TTL_MS = 24 * 60 * 60 * 1000;
const LOCK_MS = 60 * 1000;

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value as object)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

/**
 * Idempotency-Key handling (Stripe-style):
 *  1. INSERT {org, key, IN_PROGRESS}. The unique index makes this an atomic lock.
 *  2. On duplicate: same body + COMPLETED  → replay stored response.
 *                   same body + IN_PROGRESS → 409 (client should retry later).
 *                   different body          → 422 (key misuse).
 *  3. After the handler: 2xx and deterministic 4xx results are stored and replayed.
 *     5xx and 409 (e.g. INSUFFICIENT_STOCK, which may change) release the key so the
 *     client can safely retry with the same key.
 */
export function idempotency({ required = true } = {}): RequestHandler {
  return async (req, res, next) => {
    const key = req.get('idempotency-key')?.trim();
    if (!key) {
      if (required) return next(new AppError(400, 'IDEMPOTENCY_KEY_REQUIRED', 'Idempotency-Key header is required'));
      return next();
    }
    if (key.length > 128) return next(Errors.validation({ idempotencyKey: 'Too long' }));

    const organizationId = req.tenantId!;
    const requestHash = crypto
      .createHash('sha256')
      .update(`${req.method}:${req.baseUrl}${req.path}:${stableStringify(req.body ?? {})}`)
      .digest('hex');

    try {
      await IdempotencyKey.create({
        organizationId,
        userId: req.auth?.userId ?? req.customer!.id,
        key,
        method: req.method,
        path: `${req.baseUrl}${req.path}`,
        requestHash,
        status: 'IN_PROGRESS',
        lockedUntil: new Date(Date.now() + LOCK_MS),
        expiresAt: new Date(Date.now() + KEY_TTL_MS),
      });
    } catch (err) {
      if ((err as { code?: number }).code !== 11000) return next(err);

      const existing = await IdempotencyKey.findOne({ organizationId, key }).lean();
      if (!existing) return next(Errors.conflict('IDEMPOTENCY_IN_PROGRESS', 'Request is being processed, retry shortly'));
      if (existing.requestHash !== requestHash) {
        return next(
          new AppError(422, 'IDEMPOTENCY_KEY_MISMATCH', 'Idempotency-Key was already used with a different request'),
        );
      }
      if (existing.status === 'COMPLETED') {
        res.setHeader('Idempotent-Replayed', 'true');
        res.status(existing.responseStatus ?? 200).json(existing.responseBody);
        return;
      }
      // IN_PROGRESS: if the original holder crashed, its lock expires and we take over.
      const takeover = await IdempotencyKey.findOneAndUpdate(
        { _id: existing._id, status: 'IN_PROGRESS', lockedUntil: { $lt: new Date() } },
        { $set: { lockedUntil: new Date(Date.now() + LOCK_MS) } },
      );
      if (!takeover) {
        return next(Errors.conflict('IDEMPOTENCY_IN_PROGRESS', 'A request with this Idempotency-Key is in progress'));
      }
    }

    const originalJson = res.json.bind(res);
    res.json = (body: unknown) => {
      const status = res.statusCode;
      const persist =
        status >= 500 || status === 409
          ? IdempotencyKey.deleteOne({ organizationId, key })
          : IdempotencyKey.updateOne(
              { organizationId, key },
              { $set: { status: 'COMPLETED', responseStatus: status, responseBody: body } },
            );
      // Store the outcome before the client sees it, so an immediate retry replays it.
      persist.then(
        () => originalJson(body),
        () => originalJson(body),
      );
      return res;
    };
    next();
  };
}
