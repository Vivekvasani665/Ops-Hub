import type { RequestHandler } from 'express';
import { Types } from 'mongoose';
import { Organization } from '../modules/organizations/organization.model';
import { Errors } from '../utils/errors';

/**
 * Resolves the tenant for this request. The tenant ALWAYS comes from the verified token,
 * never from the URL/body. Only SUPER_ADMIN may act on another organization via the
 * `X-Organization-Id` header (support/impersonation use-case).
 */
export const resolveTenant: RequestHandler = async (req, _res, next) => {
  if (!req.auth) return next(Errors.unauthenticated());
  const override = req.get('x-organization-id');

  if (override && req.auth.role === 'SUPER_ADMIN') {
    if (!Types.ObjectId.isValid(override)) return next(Errors.notFound('Organization'));
    const exists = await Organization.exists({ _id: override });
    if (!exists) return next(Errors.notFound('Organization'));
    req.tenantId = new Types.ObjectId(override);
  } else {
    req.tenantId = req.auth.organizationId;
  }
  next();
};
