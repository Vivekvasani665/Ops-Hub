import type { RequestHandler } from 'express';
import type { ZodTypeAny } from 'zod';
import { Errors } from '../utils/errors';

export function validateBody(schema: ZodTypeAny): RequestHandler {
  return (req, _res, next) => {
    const parsed = schema.safeParse(req.body ?? {});
    if (!parsed.success) return next(Errors.validation(parsed.error.flatten()));
    req.body = parsed.data;
    next();
  };
}
