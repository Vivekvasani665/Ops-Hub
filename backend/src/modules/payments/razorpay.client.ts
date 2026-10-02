import crypto from 'node:crypto';
import { env, razorpayEnabled } from '../../config/env';
import { AppError } from '../../utils/errors';

/**
 * Thin client for the Razorpay REST API (https://razorpay.com/docs/api/) plus the official signature checks.
 * Server-side only: it is the only place RAZORPAY_KEY_SECRET is read.
 */

export interface RazorpayOrder {
  id: string;
  amount: number;
  currency: string;
  receipt: string | null;
  status: 'created' | 'attempted' | 'paid';
}

export interface RazorpayPayment {
  id: string;
  order_id: string | null;
  amount: number;
  currency: string;
  status: 'created' | 'authorized' | 'captured' | 'refunded' | 'failed';
  method: string;
  vpa?: string | null;
  wallet?: string | null;
  bank?: string | null;
  card?: { network?: string | null; last4?: string | null; type?: string | null } | null;
  error_description?: string | null;
}

export interface RazorpayRefund {
  id: string;
  payment_id: string;
  amount: number;
  status: string;
}

const unavailable = () => new AppError(503, 'PAYMENTS_UNAVAILABLE', 'Online payments are not available right now');

async function call<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  if (!razorpayEnabled) throw unavailable();
  const auth = Buffer.from(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`).toString('base64');
  let res: Response;
  try {
    res = await fetch(`${env.RAZORPAY_API_URL}${path}`, {
      method,
      headers: { Authorization: `Basic ${auth}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new AppError(502, 'PAYMENT_GATEWAY_ERROR', 'Could not reach the payment gateway, please retry');
  }
  const json = (await res.json().catch(() => null)) as (T & { error?: { description?: string } }) | null;
  if (!res.ok || !json) {
    throw new AppError(502, 'PAYMENT_GATEWAY_ERROR', json?.error?.description ?? `Payment gateway error (${res.status})`);
  }
  return json;
}

export const razorpay = {
  createOrder: (input: { amount: number; currency: string; receipt: string; notes: Record<string, string> }) =>
    call<RazorpayOrder>('POST', '/orders', input),
  fetchPayment: (paymentId: string) => call<RazorpayPayment>('GET', `/payments/${encodeURIComponent(paymentId)}`),
  fetchOrderPayments: (orderId: string) =>
    call<{ items: RazorpayPayment[] }>('GET', `/orders/${encodeURIComponent(orderId)}/payments`).then((r) => r.items),
  /** Only needed when the account is not set to auto-capture. */
  capturePayment: (paymentId: string, amount: number, currency: string) =>
    call<RazorpayPayment>('POST', `/payments/${encodeURIComponent(paymentId)}/capture`, { amount, currency }),
  refundPayment: (paymentId: string, notes: Record<string, string>) =>
    call<RazorpayRefund>('POST', `/payments/${encodeURIComponent(paymentId)}/refund`, { notes }),
};

function safeEqualHex(expected: string, actual: string) {
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(actual, 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Checkout callback signature: HMAC-SHA256(`order_id|payment_id`, key secret). */
export function isValidPaymentSignature(razorpayOrderId: string, razorpayPaymentId: string, signature: string) {
  if (!env.RAZORPAY_KEY_SECRET) return false;
  const expected = crypto
    .createHmac('sha256', env.RAZORPAY_KEY_SECRET)
    .update(`${razorpayOrderId}|${razorpayPaymentId}`)
    .digest('hex');
  return safeEqualHex(expected, signature);
}

/** Webhook signature: HMAC-SHA256(raw request body, webhook secret), sent as X-Razorpay-Signature. */
export function isValidWebhookSignature(rawBody: Buffer, signature: string) {
  if (!env.RAZORPAY_WEBHOOK_SECRET) return false;
  const expected = crypto.createHmac('sha256', env.RAZORPAY_WEBHOOK_SECRET).update(rawBody).digest('hex');
  return safeEqualHex(expected, signature);
}

/** Human label of the instrument, e.g. "Visa •••• 1111", "PhonePe", "asha@okhdfc". */
export function describeInstrument(p: RazorpayPayment): string | null {
  switch (p.method) {
    case 'upi':
      return p.vpa ?? 'UPI';
    case 'card':
      return [p.card?.network, p.card?.type, p.card?.last4 ? `•••• ${p.card.last4}` : null].filter(Boolean).join(' ') || 'Card';
    case 'wallet':
      return p.wallet ?? 'Wallet';
    case 'netbanking':
      return p.bank ?? 'Net banking';
    default:
      return null;
  }
}
