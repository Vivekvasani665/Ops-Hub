import { api, ApiError } from './api';
import type { Order } from './types';

/**
 * Razorpay Checkout (https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/).
 * The browser only opens the gateway: the amount comes from the backend's Razorpay order, and the order is
 * marked paid only after the backend verifies the signature and re-reads the payment from Razorpay.
 */

const CHECKOUT_SRC = 'https://checkout.razorpay.com/v1/checkout.js';

/** Which block Razorpay Checkout shows first; every other method stays available below it. */
export type PreferredMethod = 'upi' | 'card' | 'other';

export type PaymentStage = 'starting' | 'awaiting' | 'verifying';

export type PaymentOutcome =
  | { kind: 'paid'; order: Order }
  | { kind: 'cancelled' }
  | { kind: 'failed'; message: string }
  | { kind: 'verification_failed'; message: string }
  | { kind: 'timeout' }
  | { kind: 'closed'; message: string }
  | { kind: 'network'; message: string; maybePaid: boolean };

interface RazorpaySuccess {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

interface RazorpayInstance {
  open(): void;
  on(event: 'payment.failed', cb: (res: { error: { description?: string; reason?: string } }) => void): void;
}

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => RazorpayInstance;
  }
}

let loading: Promise<void> | null = null;

function loadCheckout(): Promise<void> {
  if (typeof window !== 'undefined' && window.Razorpay) return Promise.resolve();
  loading ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = CHECKOUT_SRC;
    script.async = true;
    script.onload = () => (window.Razorpay ? resolve() : reject(new Error('Razorpay unavailable')));
    script.onerror = () => reject(new Error('Could not load Razorpay'));
    document.body.appendChild(script);
  }).catch((err) => {
    loading = null; // allow a retry after a network blip
    throw err;
  });
  return loading;
}

const BLOCKS: Record<PreferredMethod, { name: string; instruments: { method: string }[] }> = {
  upi: { name: 'Pay using UPI', instruments: [{ method: 'upi' }] },
  card: { name: 'Pay using card', instruments: [{ method: 'card' }] },
  other: { name: 'Wallets & net banking', instruments: [{ method: 'wallet' }, { method: 'netbanking' }] },
};

/** Opens Razorpay Checkout for one of the customer's unpaid orders and resolves with what happened. */
export async function payWithRazorpay(
  orderId: string,
  preferred: PreferredMethod,
  onStage: (stage: PaymentStage) => void = () => undefined,
): Promise<PaymentOutcome> {
  onStage('starting');
  let checkout;
  try {
    [checkout] = await Promise.all([api.startRazorpayPayment(orderId), loadCheckout()]);
  } catch (err) {
    if (err instanceof ApiError) {
      if (err.code === 'ALREADY_PAID') {
        return { kind: 'paid', order: await api.order(orderId) };
      }
      if (['PAYMENT_CLOSED', 'PAYMENT_WINDOW_EXPIRED', 'PAYMENTS_UNAVAILABLE'].includes(err.code)) {
        return { kind: 'closed', message: err.message };
      }
      return { kind: 'network', message: err.message, maybePaid: false };
    }
    return { kind: 'network', message: 'Could not reach the payment gateway. Check your connection and try again.', maybePaid: false };
  }

  const Razorpay = window.Razorpay!;
  // Checkout closes itself when the order's payment window ends, so a late payment cannot start.
  const timeoutSeconds = Math.max(60, Math.min(checkout.expiresInSeconds - 15, 15 * 60));
  const deadline = Date.now() + timeoutSeconds * 1000;

  return new Promise<PaymentOutcome>((resolve) => {
    let lastFailure: string | null = null;
    let settled = false;
    const finish = (outcome: PaymentOutcome) => {
      if (settled) return;
      settled = true;
      resolve(outcome);
    };

    const rzp = new Razorpay({
      key: checkout.keyId,
      order_id: checkout.razorpayOrderId,
      amount: checkout.amount,
      currency: checkout.currency,
      name: checkout.storeName,
      description: `Order #${checkout.orderNumber}`,
      prefill: { ...checkout.prefill, ...(preferred === 'upi' || preferred === 'card' ? { method: preferred } : {}) },
      notes: { orderId },
      timeout: timeoutSeconds,
      retry: { enabled: true },
      theme: { color: '#0f172a' },
      config: {
        display: {
          blocks: { preferred: BLOCKS[preferred] },
          sequence: ['block.preferred'],
          preferences: { show_default_blocks: true },
        },
      },
      modal: {
        confirm_close: true,
        ondismiss: () => {
          if (Date.now() >= deadline - 1000) finish({ kind: 'timeout' });
          else if (lastFailure) finish({ kind: 'failed', message: lastFailure });
          else finish({ kind: 'cancelled' });
        },
      },
      handler: async (res: RazorpaySuccess) => {
        onStage('verifying');
        try {
          const order = await api.verifyRazorpayPayment({ orderId, ...res });
          finish({ kind: 'paid', order });
        } catch (err) {
          if (err instanceof ApiError && err.status < 500) {
            finish({ kind: 'verification_failed', message: err.message });
          } else {
            // Razorpay took the money but we could not confirm it; the backend reconciles it via webhook/sweep.
            finish({
              kind: 'network',
              message: 'Your payment went through but we could not confirm it yet. We will update your order automatically.',
              maybePaid: true,
            });
          }
        }
      },
    });

    // Razorpay keeps the modal open so the customer can retry with another method.
    rzp.on('payment.failed', (res) => {
      lastFailure = res.error.description || 'Payment failed';
    });

    onStage('awaiting');
    rzp.open();
  });
}
