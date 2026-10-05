import express, { Router } from 'express';
import { handlePayuCallback } from './payment.service';

/**
 * PayU transaction response, mounted at /api/payments/payu/callback. PayU posts it (form-encoded) through the
 * customer's browser to the storefront's /payment/success|failure, which forwards the body here and redirects
 * the customer by the outcome. Authenticated by PayU's reverse hash, not a session, so it is mounted ahead of
 * the Origin guard (PayU's own pages may post it directly).
 */
export const paymentCallbackRouter = Router();

paymentCallbackRouter.post('/payu/callback', express.urlencoded({ extended: false, limit: '64kb' }), async (req, res) => {
  const fields: Record<string, string> = {};
  for (const [k, v] of Object.entries((req.body ?? {}) as Record<string, unknown>)) {
    if (typeof v === 'string') fields[k] = v;
  }
  res.json({ data: await handlePayuCallback(fields) });
});
