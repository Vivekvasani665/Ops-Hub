import type { StockStatus } from '@/shared';

/** Mirrors the API's rule so lists without a computed status can still show a badge. */
export function stockStatusOf(available: number, reorderLevel: number): StockStatus {
  if (available <= 0) return 'OUT_OF_STOCK';
  if (available <= reorderLevel) return 'LOW_STOCK';
  return 'IN_STOCK';
}
