import express, { Router } from 'express';
import { AppError } from '../../utils/errors';
import { logger } from '../../utils/logger';
import { isValidWebhookSignature } from './razorpay.client';
import { handleWebhookEvent } from './payment.service';

/**
 * Razorpay → backend server-to-server notifications, mounted at /api/payments/razorpay/webhook before the
 * global JSON parser: the signature is an HMAC of the exact raw body, so it must be read unparsed.
 */
export const paymentWebhookRouter = Router();

paymentWebhookRouter.post('/razorpay/webhook', express.raw({ type: '*/*', limit: '256kb' }), async (req, res) => {
  const signature = req.get('x-razorpay-signature');
  const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  if (!signature || !isValidWebhookSignature(raw, signature)) {
    throw new AppError(400, 'INVALID_SIGNATURE', 'Webhook signature verification failed');
  }

  let event;
  try {
    event = JSON.parse(raw.toString('utf8'));
  } catch {
    throw new AppError(400, 'INVALID_JSON', 'Malformed JSON body');
  }

  // A thrown error answers 5xx, so Razorpay redelivers; handlers are idempotent.
  const result = await handleWebhookEvent(req.get('x-razorpay-event-id') ?? undefined, event);
  logger.info(`Razorpay webhook ${event.event} → ${result}`);
  res.json({ data: { ok: true } });
});
