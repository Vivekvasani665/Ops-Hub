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
  PENDING: 'bg-amber-50 text-amber-700 ring-amber-200',
  CONFIRMED: 'bg-sky-50 text-sky-700 ring-sky-200',
  PROCESSING: 'bg-indigo-50 text-indigo-700 ring-indigo-200',
  SHIPPED: 'bg-violet-50 text-violet-700 ring-violet-200',
  DELIVERED: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  CANCELLED: 'bg-rose-50 text-rose-700 ring-rose-200',
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
