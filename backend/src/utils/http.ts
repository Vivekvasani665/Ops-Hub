import type { Request } from 'express';
import { Types } from 'mongoose';
import { Errors } from './errors';

export function parseObjectId(value: string, entity = 'Resource'): Types.ObjectId {
  // Malformed ids are reported as "not found" so we never leak whether an id exists.
  if (!Types.ObjectId.isValid(value) || String(new Types.ObjectId(value)) !== value.toLowerCase()) {
    throw Errors.notFound(entity);
  }
  return new Types.ObjectId(value);
}

export function pagination(req: Request, defaults = { limit: 10, max: 100 }) {
  const page = Math.max(1, Number.parseInt(String(req.query.page ?? '1'), 10) || 1);
  const limit = Math.min(
    defaults.max,
    Math.max(1, Number.parseInt(String(req.query.limit ?? defaults.limit), 10) || defaults.limit),
  );
  return { page, limit, skip: (page - 1) * limit };
}

export function pageMeta(page: number, limit: number, total: number) {
  return { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) };
}

export function queryString(req: Request, key: string): string | undefined {
  const v = req.query[key];
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined;
}

export function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function parseDate(value: string | undefined, endOfDay = false): Date | undefined {
  if (!value) return undefined;
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00` : value);
  if (Number.isNaN(d.getTime())) throw Errors.validation({ date: `Invalid date: ${value}` });
  if (endOfDay && /^\d{4}-\d{2}-\d{2}$/.test(value)) d.setHours(23, 59, 59, 999);
  return d;
}
