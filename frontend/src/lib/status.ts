import type { JobStatus, OrderPaymentDto, OrderStatus, PaymentGateway, PaymentStatus, StockStatus } from '@/shared';
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

export const PAYMENT_STATUS_META: Record<PaymentStatus, { label: string; tone: Tone }> = {
  PENDING: { label: 'Pending', tone: 'amber' },
  PAID: { label: 'Paid', tone: 'green' },
  FAILED: { label: 'Failed', tone: 'red' },
  REFUNDED: { label: 'Refunded', tone: 'gray' },
};

const INSTRUMENT_LABEL: Record<string, string> = {
  upi: 'UPI',
  card: 'Card',
  wallet: 'Wallet',
  netbanking: 'Net banking',
  emi: 'EMI',
  paylater: 'Pay later',
};

/** "COD", "Online", or "Online · UPI" once the gateway reported the instrument used. */
export function paymentMethodLabel(payment: Pick<OrderPaymentDto, 'method' | 'instrument'>): string {
  if (payment.method === 'COD') return 'COD';
  const instrument = payment.instrument && (INSTRUMENT_LABEL[payment.instrument] ?? payment.instrument);
  return instrument ? `Online · ${instrument}` : 'Online';
}

const GATEWAY_LABEL: Record<PaymentGateway, string> = { PAYU: 'PayU' };

/** "PayU" for online orders, "None" for COD. */
export function paymentGatewayLabel(payment: Pick<OrderPaymentDto, 'method' | 'gateway'>): string {
  if (payment.gateway) return GATEWAY_LABEL[payment.gateway];
  return payment.method === 'ONLINE' ? 'PayU' : 'None';
}
