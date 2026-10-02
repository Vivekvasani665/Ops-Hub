import { canTransition, nextStatuses, type OrderPaymentDto, type OrderStatus, type Permission } from '@shared';
import { AppError } from '../../utils/errors';

/**
 * Server-side guard around the shared transition table. The UI uses the same table only to
 * decide which buttons to render; this function is the authority.
 */
export function assertTransition(from: OrderStatus, to: OrderStatus) {
  if (!canTransition(from, to)) {
    throw new AppError(409, 'INVALID_STATUS_TRANSITION', `Cannot move an order from ${from} to ${to}`, {
      from,
      to,
      allowed: nextStatuses(from),
    });
  }
}

/** An online order only moves forward once the backend has verified its payment. */
export function assertPaymentAllowsTransition(to: OrderStatus, payment: OrderPaymentDto | null) {
  if (payment?.method === 'RAZORPAY' && payment.status !== 'PAID' && to !== 'CANCELLED') {
    throw new AppError(409, 'PAYMENT_NOT_COMPLETED', 'This order is awaiting online payment and can only be cancelled', {
      paymentStatus: payment.status,
    });
  }
}

/** Cancelling is a stronger permission than progressing an order. */
export function permissionForTransition(to: OrderStatus): Permission {
  return to === 'CANCELLED' ? 'orders:cancel' : 'orders:update_status';
}

/** Inventory side effect of entering a status. */
export function inventoryEffect(to: OrderStatus): 'release' | 'consume' | null {
  if (to === 'CANCELLED') return 'release';
  if (to === 'SHIPPED') return 'consume';
  return null;
}
