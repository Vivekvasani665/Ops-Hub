import type { OrderPayment, OrderStatus, PaymentStatus } from './types';

const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 });

/** Prices are stored in minor units (paise). */
export function money(minor: number) {
  return inr.format(minor / 100);
}

export function dateTime(iso: string) {
  return new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
}

export const STATUS_LABEL: Record<OrderStatus, string> = {
  PENDING: 'Order placed',
  CONFIRMED: 'Confirmed',
  PROCESSING: 'Processing',
  SHIPPED: 'Shipped',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
};

export const STATUS_STYLE: Record<OrderStatus, string> = {
  PENDING: 'bg-warning-soft text-warning ring-warning/25',
  CONFIRMED: 'bg-info-soft text-info ring-info/25',
  PROCESSING: 'bg-primary-soft text-primary-soft-fg ring-primary/25',
  SHIPPED: 'bg-violet-50 text-violet-700 ring-violet-200 dark:bg-violet-500/15 dark:text-violet-300 dark:ring-violet-500/30',
  DELIVERED: 'bg-success-soft text-success ring-success/25',
  CANCELLED: 'bg-danger-soft text-danger ring-danger/25',
};

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  PENDING: 'Payment pending',
  PAID: 'Paid',
  FAILED: 'Payment failed',
  REFUNDED: 'Refunded',
};

const INSTRUMENT_LABEL: Record<string, string> = {
  upi: 'UPI',
  card: 'Card',
  wallet: 'Wallet',
  netbanking: 'Net banking',
  emi: 'EMI',
  paylater: 'Pay later',
};

export function paymentMethodLabel(p: OrderPayment) {
  if (p.method === 'COD') return 'Cash on delivery';
  const instrument = p.instrument ? (INSTRUMENT_LABEL[p.instrument] ?? p.instrument) : 'Online payment';
  return p.instrumentDetail && p.instrumentDetail !== instrument ? `${instrument} · ${p.instrumentDetail}` : instrument;
}

export function newIdempotencyKey() {
  return crypto.randomUUID();
}
