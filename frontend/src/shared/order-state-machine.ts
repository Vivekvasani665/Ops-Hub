import type { OrderStatus, PaymentMethod, PaymentStatus } from './enums';

/**
 * Single source of truth for order lifecycle. The backend enforces it;
 * the frontend only uses it to decide which buttons to render.
 */
export const ORDER_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  PENDING: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['PROCESSING', 'CANCELLED'],
  PROCESSING: ['SHIPPED', 'CANCELLED'],
  SHIPPED: ['DELIVERED'],
  DELIVERED: [],
  CANCELLED: [],
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_TRANSITIONS[from].includes(to);
}

export function nextStatuses(from: OrderStatus): readonly OrderStatus[] {
  return ORDER_TRANSITIONS[from];
}

export function isTerminal(status: OrderStatus): boolean {
  return ORDER_TRANSITIONS[status].length === 0;
}

/**
 * Transitions available for a concrete order: an online (Razorpay) order cannot move forward until its
 * payment has been captured and verified by the backend, but it can always be cancelled.
 */
export function allowedTransitions(
  status: OrderStatus,
  payment?: { method: PaymentMethod; status: PaymentStatus } | null,
): readonly OrderStatus[] {
  const next = ORDER_TRANSITIONS[status];
  if (payment?.method === 'RAZORPAY' && payment.status !== 'PAID') return next.filter((s) => s === 'CANCELLED');
  return next;
}
