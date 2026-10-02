import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import type { Role } from '@shared';
import { env } from '../../config/env';

export interface AccessTokenPayload {
  sub: string;
  org: string;
  role: Role;
  name: string;
}

export const ACCESS_COOKIE = 'opshub_at';
export const REFRESH_COOKIE = 'opshub_rt';

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.ACCESS_TOKEN_TTL_SECONDS,
    issuer: 'opshub',
    audience: 'opshub-api',
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, env.JWT_ACCESS_SECRET, {
    issuer: 'opshub',
    audience: 'opshub-api',
  }) as AccessTokenPayload;
}

/** Refresh tokens are opaque random strings; only their hash is stored server-side. */
export function generateRefreshToken(): string {
  return crypto.randomBytes(48).toString('base64url');
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}
