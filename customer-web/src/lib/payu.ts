import { api, ApiError } from './api';

/**
 * PayU Hosted Checkout (https://docs.payu.in/docs/prebuilt-checkout-page-integration). The backend builds
 * and signs the form (amount from the database, hash with the server-only salt); the browser only posts it
 * to PayU. PayU then posts the result to /payment/success|failure, where the backend verifies it.
 */

/** Which kind of online payment the customer picked; PayU's page offers every enabled method either way. */
export type PreferredMethod = 'upi' | 'card' | 'other';

/** Why the redirect to PayU could not start; shown on the order page, which offers a retry. */
export type StartFailure = 'init_failed' | 'closed' | 'already_paid';

/** Posts the signed form to PayU. Resolves only when the redirect could not start. */
export async function redirectToPayu(orderId: string): Promise<StartFailure> {
  let checkout;
  try {
    checkout = await api.startPayuPayment(orderId);
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('[PayU] Payment initialization failed', err instanceof ApiError ? { status: err.status, code: err.code, message: err.message, details: err.details } : err);
    }
    if (err instanceof ApiError) {
      if (err.code === 'ALREADY_PAID') return 'already_paid';
      if (['PAYMENT_CLOSED', 'PAYMENT_WINDOW_EXPIRED', 'NOT_AN_ONLINE_ORDER'].includes(err.code)) return 'closed';
    }
    return 'init_failed';
  }

  const form = document.createElement('form');
  form.method = 'POST';
  form.action = checkout.action;
  form.style.display = 'none';
  for (const [name, value] of Object.entries(checkout.fields)) {
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = name;
    input.value = value;
    form.appendChild(input);
  }
  document.body.appendChild(form);
  form.submit();
  // The page is navigating away to PayU; never resolve.
  return new Promise<StartFailure>(() => undefined);
}
