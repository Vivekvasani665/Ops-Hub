import type { JobStatus, OrderStatus, StockStatus } from '@/shared';
import type { Tone } from '@/components/ui/Badge';

export const ORDER_STATUS_META: Record<OrderStatus, { label: string; tone: Tone; color: string }> = {
  PENDING: { label: 'Pending', tone: 'amber', color: '#f59e0b' },
  CONFIRMED: { label: 'Confirmed', tone: 'blue', color: '#3b82f6' },
  PROCESSING: { label: 'Processing', tone: 'purple', color: '#8b5cf6' },
  SHIPPED: { label: 'Shipped', tone: 'orange', color: '#f97316' },
  DELIVERED: { label: 'Delivered', tone: 'green', color: '#16a34a' },
  CANCELLED: { label: 'Cancelled', tone: 'red', color: '#ef4444' },
};

export const STOCK_STATUS_META: Record<StockStatus, { label: string; tone: Tone }> = {
  IN_STOCK: { label: 'In stock', tone: 'green' },
  LOW_STOCK: { label: 'Low stock', tone: 'amber' },
  OUT_OF_STOCK: { label: 'Out of stock', tone: 'red' },
};

export const JOB_STATUS_META: Record<JobStatus, { label: string; tone: Tone }> = {
  PENDING: { label: 'Pending', tone: 'amber' },
  PROCESSING: { label: 'Processing', tone: 'blue' },
  COMPLETED: { label: 'Completed', tone: 'green' },
  FAILED: { label: 'Failed', tone: 'red' },
};

/** Verb shown on the button that moves an order into `status`. */
export const TRANSITION_LABEL: Record<OrderStatus, string> = {
  PENDING: 'Mark pending',
  CONFIRMED: 'Confirm order',
  PROCESSING: 'Start processing',
  SHIPPED: 'Mark shipped',
  DELIVERED: 'Mark delivered',
  CANCELLED: 'Cancel order',
};
