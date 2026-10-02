import type { RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import { Types } from 'mongoose';
import { env } from '../../config/env';
import { AppError, Errors } from '../../utils/errors';
import { Organization } from '../organizations/organization.model';
import { CUSTOMER_ACCESS_COOKIE, verifyCustomerToken } from './customer-auth.service';

/**
 * The storefront sells on behalf of one organization (STOREFRONT_ORG_SLUG). The tenant is fixed by
 * server config, never by the client.
 */
export const resolveStore: RequestHandler = async (req, _res, next) => {
  const org = await Organization.findOne({ slug: env.STOREFRONT_ORG_SLUG }).lean();
  if (!org || org.status !== 'ACTIVE') {
    return next(new AppError(503, 'STORE_UNAVAILABLE', 'The store is currently unavailable'));
  }
  req.tenantId = org._id;
  req.store = { id: org._id, name: org.name, currency: org.currency };
  next();
};

export const authenticateCustomer: RequestHandler = (req, _res, next) => {
  const token = req.cookies?.[CUSTOMER_ACCESS_COOKIE];
  if (!token) return next(Errors.unauthenticated());
  try {
    const p = verifyCustomerToken(token);
    // A token minted for another store is not valid here.
    if (!req.tenantId || p.org !== String(req.tenantId)) return next(Errors.unauthenticated('Invalid token'));
    req.customer = { id: new Types.ObjectId(p.sub), name: p.name, email: p.email };
    next();
  } catch (err) {
    next(err instanceof jwt.TokenExpiredError ? Errors.tokenExpired() : Errors.unauthenticated('Invalid token'));
  }
};
