import type { RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import { Types } from 'mongoose';
import { hasPermission, type Permission } from '@shared';
import { ACCESS_COOKIE, verifyAccessToken } from '../modules/auth/token.service';
import { Errors } from '../utils/errors';

export const authenticate: RequestHandler = (req, _res, next) => {
  const token = req.cookies?.[ACCESS_COOKIE];
  if (!token) return next(Errors.unauthenticated());
  try {
    const p = verifyAccessToken(token);
    req.auth = {
      userId: new Types.ObjectId(p.sub),
      organizationId: new Types.ObjectId(p.org),
      role: p.role,
      name: p.name,
    };
    next();
  } catch (err) {
    next(err instanceof jwt.TokenExpiredError ? Errors.tokenExpired() : Errors.unauthenticated('Invalid token'));
  }
};

/** RBAC gate. Always runs on the server, regardless of what the UI shows. */
export function requirePermission(permission: Permission): RequestHandler {
  return (req, _res, next) => {
    if (!req.auth) return next(Errors.unauthenticated());
    if (!hasPermission(req.auth.role, permission)) return next(Errors.forbidden());
    next();
  };
}
