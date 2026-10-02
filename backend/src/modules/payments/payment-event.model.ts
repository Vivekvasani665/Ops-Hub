import { Schema, model } from 'mongoose';

/** Razorpay webhook deliveries already handled (X-Razorpay-Event-Id); Razorpay retries until it gets a 2xx. */
const paymentEventSchema = new Schema(
  {
    eventId: { type: String, required: true },
    event: { type: String, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

paymentEventSchema.index({ eventId: 1 }, { unique: true });
paymentEventSchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 86_400 });

export const PaymentEvent = model('PaymentEvent', paymentEventSchema, 'payment_events');
