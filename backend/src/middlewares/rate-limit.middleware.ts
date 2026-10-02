import rateLimit from 'express-rate-limit';
import { env } from '../config/env';

const handler = (_req: unknown, res: { status: (n: number) => { json: (b: unknown) => void } }) =>
  res.status(429).json({ error: { code: 'RATE_LIMITED', message: 'Too many requests, please slow down' } });

/** Per-IP limit on login attempts (account lockout in auth.service covers per-account brute force). */
export const loginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: env.NODE_ENV === 'test' ? 10_000 : env.LOGIN_RATE_LIMIT,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler,
});

export const apiRateLimit = rateLimit({
  windowMs: 60 * 1000,
  limit: env.NODE_ENV === 'production' ? 600 : 100_000,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler,
});
