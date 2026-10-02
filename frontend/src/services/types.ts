import type { PageMeta, CursorMeta } from '@/shared';

export interface Envelope<T> {
  data: T;
}
export interface Paged<T> {
  data: T[];
  meta: PageMeta;
}
export interface CursorPaged<T> {
  data: T[];
  meta: CursorMeta;
}

/** Drops empty values so they never reach the query string. */
export function cleanParams<T extends object>(params: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ''),
  ) as Partial<T>;
}
