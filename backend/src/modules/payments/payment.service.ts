import { Types } from 'mongoose';
import { env } from '../../config/env';
import { AppError, Errors } from '../../utils/errors';
import { logger } from '../../utils/logger';
import { withTransaction } from '../../utils/transaction';
import { emitToOrg } from '../../realtime/emitter';
import { recordAudit, toAuditDto } from '../audit/audit.service';
import { enqueueJob } from '../jobs/job.service';
import { Order } from '../orders/order.model';
import { toOrderListItemDto } from '../orders/order.mapper';
import { updateOrderStatus } from '../orders/order.service';
import { describeInstrument, isValidPaymentSignature, razorpay, type RazorpayPayment } from './razorpay.client';
import { PaymentEvent } from './payment-event.model';

/**
 * Online payment lifecycle of storefront orders.
 *
 *   checkout → order PENDING / payment PENDING (stock reserved)
 *            → Razorpay order (amount = order.totalAmount from the DB)
 *            → customer pays in Razorpay Checkout
 *            → signature verified + payment fetched from Razorpay   (checkout callback, webhook or reconcile)
 *            → order CONFIRMED / payment PAID
 *
 * Every path that can mark an order paid ends in `applyCapturedPayment`, whose write is conditional on the
 * order still awaiting payment, so the checkout callback, the webhook and the reconcile sweep can all race
 * on the same payment and it is applied exactly once.
 */

/** Actor recorded on status changes caused by the payment gateway rather than a person. */
export const PAYMENT_ACTOR = { id: new Types.ObjectId('000000000000000000000001'), name: 'Razorpay' };
const TIMEOUT_ACTOR = { id: new Types.ObjectId('000000000000000000000002'), name: 'System (payment timeout)' };

type OrderLean = NonNullable<Awaited<ReturnType<typeof findOrder>>>;

function findOrder(filter: Record<string, unknown>) {
  return Order.findOne(filter).lean();
}

function assertAwaitingPayment(order: OrderLean) {
  if (order.paymentMethod !== 'RAZORPAY') throw Errors.conflict('NOT_AN_ONLINE_ORDER', 'This order is not paid online');
  if (order.paymentStatus === 'PAID') throw Errors.conflict('ALREADY_PAID', 'This order is already paid');
  if (order.status !== 'PENDING' || order.paymentStatus !== 'PENDING') {
    throw Errors.conflict('PAYMENT_CLOSED', 'This order can no longer be paid');
  }
}

/** Payment window left for an order, in seconds; Razorpay Checkout is closed when it runs out. */
export function paymentSecondsLeft(createdAt: Date, now = Date.now()) {
  return Math.max(0, Math.floor((createdAt.getTime() + env.PAYMENT_TIMEOUT_MINUTES * 60_000 - now) / 1000));
}

// ---------- checkout ----------

/**
 * Razorpay order for one of the customer's unpaid orders; reused on retries so every attempt pays the
 * same Razorpay order (and an order can never be paid twice through two Razorpay orders).
 */
export async function startRazorpayPayment(orgId: Types.ObjectId, customerId: Types.ObjectId, orderId: Types.ObjectId) {
  const order = await findOrder({ _id: orderId, organizationId: orgId, 'createdBy.id': customerId });
  if (!order) throw Errors.notFound('Order');
  assertAwaitingPayment(order);
  const secondsLeft = paymentSecondsLeft(order.createdAt);
  if (secondsLeft < 30) throw Errors.conflict('PAYMENT_WINDOW_EXPIRED', 'The payment window for this order has closed');

  let razorpayOrderId = order.payment?.razorpayOrderId ?? null;
  if (!razorpayOrderId) {
    const created = await razorpay.createOrder({
      amount: order.totalAmount,
      currency: 'INR',
      receipt: `order_${order.orderNumber}`,
      notes: { orderId: String(order._id), organizationId: String(orgId), orderNumber: String(order.orderNumber) },
    });
    // Two concurrent starts: the first stored id wins and the other Razorpay order is simply never used.
    await Order.updateOne(
      { _id: order._id, 'payment.razorpayOrderId': { $in: [null, undefined] } },
      { $set: { 'payment.razorpayOrderId': created.id } },
    );
    razorpayOrderId = (await Order.findById(order._id, { 'payment.razorpayOrderId': 1 }).lean())!.payment!.razorpayOrderId!;
  }

  return {
    keyId: env.RAZORPAY_KEY_ID!,
    razorpayOrderId,
    amount: order.totalAmount,
    currency: 'INR',
    orderNumber: order.orderNumber,
    expiresInSeconds: secondsLeft,
  };
}

/** Checkout success callback: never trusted until the signature checks out and Razorpay confirms the payment. */
export async function verifyCheckoutPayment(
  orgId: Types.ObjectId,
  customerId: Types.ObjectId,
  input: { orderId: string; razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string },
) {
  const order = await findOrder({ _id: new Types.ObjectId(input.orderId), organizationId: orgId, 'createdBy.id': customerId });
  if (!order) throw Errors.notFound('Order');
  const fail = () =>
    new AppError(400, 'PAYMENT_VERIFICATION_FAILED', 'We could not verify this payment. If money was deducted it will be confirmed or refunded automatically.');

  if (!order.payment?.razorpayOrderId || order.payment.razorpayOrderId !== input.razorpay_order_id) throw fail();
  if (!isValidPaymentSignature(input.razorpay_order_id, input.razorpay_payment_id, input.razorpay_signature)) throw fail();

  const payment = await razorpay.fetchPayment(input.razorpay_payment_id);
  if (payment.order_id !== order.payment.razorpayOrderId) throw fail();
  await applyCapturedPayment(payment);
  return Order.findById(order._id).lean();
}

/** Asks Razorpay what happened to an order's payment; used when the browser lost the checkout result. */
export async function reconcileOrderPayment(order: OrderLean) {
  const razorpayOrderId = order.payment?.razorpayOrderId;
  if (order.paymentMethod !== 'RAZORPAY' || order.paymentStatus !== 'PENDING' || !razorpayOrderId) return false;
  const payments = await razorpay.fetchOrderPayments(razorpayOrderId);
  const usable = payments.find((p) => p.status === 'captured') ?? payments.find((p) => p.status === 'authorized');
  if (!usable) return false;
  return applyCapturedPayment(usable);
}

// ---------- applying gateway results ----------

/**
 * Marks the order paid for a captured payment (capturing an authorised one first). Idempotent: a second call
 * with the same payment is a no-op. A payment that arrives for an order that can no longer take it (cancelled
 * after the payment window closed, or already paid by another payment) is refunded.
 */
export async function applyCapturedPayment(input: RazorpayPayment): Promise<boolean> {
  if (!input.order_id) return false;
  const order = await findOrder({ 'payment.razorpayOrderId': input.order_id });
  if (!order) {
    logger.warn(`Razorpay payment ${input.id} for unknown order ${input.order_id}`);
    return false;
  }
  const payable = order.status === 'PENDING' && order.paymentStatus === 'PENDING';

  let payment = input;
  if (payment.status === 'authorized') {
    // An authorisation we will not use is reversed by Razorpay on its own; only capture what we can fulfil.
    if (!payable) return false;
    payment = await razorpay.capturePayment(payment.id, order.totalAmount, 'INR');
  }
  if (payment.status !== 'captured') return false;

  if (payment.amount !== order.totalAmount || payment.currency !== 'INR') {
    // Cannot happen with an untampered Razorpay order (its amount is fixed server-side); never accept it.
    logger.error(`Razorpay payment ${payment.id} amount ${payment.amount} ≠ order total ${order.totalAmount}`);
    await Order.updateOne({ _id: order._id }, { $set: { 'payment.lastError': 'Amount mismatch, payment not accepted' } });
    await refundUnusablePayment(order, payment, 'amount mismatch');
    return false;
  }

  const instrument = payment.method;
  const instrumentDetail = describeInstrument(payment);
  const now = new Date();

  const applied = await withTransaction(async (session) => {
    const updated = await Order.findOneAndUpdate(
      { _id: order._id, status: 'PENDING', paymentStatus: 'PENDING' },
      {
        $set: {
          status: 'CONFIRMED',
          paymentStatus: 'PAID',
          'payment.razorpayPaymentId': payment.id,
          'payment.instrument': instrument,
          'payment.instrumentDetail': instrumentDetail,
          'payment.paidAt': now,
          'payment.lastError': null,
        },
        $push: {
          statusHistory: {
            from: 'PENDING',
            to: 'CONFIRMED',
            changedBy: PAYMENT_ACTOR,
            reason: `Paid online (${instrumentDetail ?? instrument}) · ${payment.id}`,
            at: now,
          },
        },
      },
      { new: true, session },
    );
    if (!updated) return null;

    const meta = { orderNumber: updated.orderNumber, customerName: updated.customer.name, from: 'PENDING', to: 'CONFIRMED' };
    const audit = await recordAudit(
      {
        organizationId: updated.organizationId,
        actor: PAYMENT_ACTOR,
        action: 'ORDER_STATUS_CHANGED',
        entityType: 'ORDER',
        entityId: updated._id,
        metadata: { ...meta, payment: { razorpayPaymentId: payment.id, razorpayOrderId: payment.order_id, instrument, amount: payment.amount } },
        dedupeKey: `payment-captured:${payment.id}`,
      },
      session,
    );
    await enqueueJob(
      {
        type: 'SEND_ORDER_NOTIFICATION',
        organizationId: updated.organizationId,
        payload: { event: 'status_changed', orderId: String(updated._id), ...meta, totalAmount: updated.totalAmount },
        dedupeKey: `payment-notification:${payment.id}`,
      },
      session,
    );
    return { updated, audit };
  });

  if (applied) {
    const orgId = applied.updated.organizationId;
    if (applied.audit) emitToOrg(orgId, 'audit:created', { log: toAuditDto(applied.audit) });
    emitToOrg(orgId, 'order:updated', { order: toOrderListItemDto(applied.updated), from: 'PENDING', to: 'CONFIRMED' });
    return true;
  }

  const current = (await findOrder({ _id: order._id }))!;
  if (current.payment?.razorpayPaymentId === payment.id) return true; // already applied by a concurrent path
  await refundUnusablePayment(current, payment, current.status === 'CANCELLED' ? 'order cancelled before payment completed' : 'duplicate payment');
  return false;
}

async function refundUnusablePayment(order: OrderLean, payment: RazorpayPayment, why: string) {
  try {
    // Razorpay rejects a second full refund of the same payment, so concurrent callers cannot double refund.
    const refund = await razorpay.refundPayment(payment.id, { orderId: String(order._id), reason: why });
    logger.warn(`Refunded Razorpay payment ${payment.id} for order #${order.orderNumber}: ${why}`);
    if (order.paymentStatus !== 'PAID') {
      await Order.updateOne(
        { _id: order._id, paymentStatus: { $ne: 'PAID' } },
        {
          $set: {
            paymentStatus: 'REFUNDED',
            'payment.razorpayPaymentId': payment.id,
            'payment.instrument': payment.method,
            'payment.instrumentDetail': describeInstrument(payment),
            'payment.refundId': refund.id,
            'payment.refundedAt': new Date(),
            'payment.lastError': `Payment refunded automatically: ${why}`,
          },
        },
      );
    }
  } catch (err) {
    logger.error(`Automatic refund of Razorpay payment ${payment.id} (order #${order.orderNumber}) failed — refund it manually`, err);
    await Order.updateOne(
      { _id: order._id },
      { $set: { 'payment.lastError': `Payment ${payment.id} needs a manual refund (${why})` } },
    );
  }
}

/** A failed attempt does not close the order: the customer can retry until the payment window ends. */
export async function recordFailedAttempt(payment: RazorpayPayment) {
  if (!payment.order_id) return;
  await Order.updateOne(
    { 'payment.razorpayOrderId': payment.order_id, paymentStatus: 'PENDING' },
    { $set: { 'payment.lastError': payment.error_description ?? 'Payment failed' } },
  );
}

/** Refund issued from the Razorpay dashboard (e.g. after the store cancelled a paid order). */
export async function recordRefund(refund: { id: string; payment_id: string; amount: number }) {
  const order = await findOrder({ 'payment.razorpayPaymentId': refund.payment_id });
  if (!order || refund.amount < order.totalAmount) return; // partial refunds keep the order PAID
  await Order.updateOne(
    { _id: order._id, paymentStatus: 'PAID' },
    { $set: { paymentStatus: 'REFUNDED', 'payment.refundId': refund.id, 'payment.refundedAt': new Date() } },
  );
}

// ---------- webhook ----------

interface WebhookEvent {
  event: string;
  payload: {
    payment?: { entity: RazorpayPayment };
    refund?: { entity: { id: string; payment_id: string; amount: number } };
  };
}

/** Called only after the webhook signature has been verified. Duplicate deliveries are skipped by event id. */
export async function handleWebhookEvent(eventId: string | undefined, event: WebhookEvent) {
  if (eventId && (await PaymentEvent.exists({ eventId }))) return 'duplicate';

  const payment = event.payload.payment?.entity;
  switch (event.event) {
    case 'payment.captured':
    case 'payment.authorized':
    case 'order.paid':
      // Re-read the payment from the API rather than trusting the payload's state.
      if (payment) await applyCapturedPayment(await razorpay.fetchPayment(payment.id));
      break;
    case 'payment.failed':
      if (payment) await recordFailedAttempt(payment);
      break;
    case 'refund.processed':
      if (event.payload.refund) await recordRefund(event.payload.refund.entity);
      break;
    default:
      break;
  }

  if (eventId) await PaymentEvent.create({ eventId, event: event.event }).catch(() => undefined);
  return 'processed';
}

// ---------- payment window sweep (worker) ----------

/**
 * Online orders still unpaid after PAYMENT_TIMEOUT_MINUTES: ask Razorpay once more (the customer may have
 * paid while every callback was lost), otherwise cancel the order so its reserved stock is released.
 */
export async function expireUnpaidOrders(now = new Date()) {
  const cutoff = new Date(now.getTime() - env.PAYMENT_TIMEOUT_MINUTES * 60_000);
  const stale = await Order.find({ paymentMethod: 'RAZORPAY', paymentStatus: 'PENDING', status: 'PENDING', createdAt: { $lt: cutoff } })
    .sort({ createdAt: 1 })
    .limit(100)
    .lean();

  let cancelled = 0;
  for (const order of stale) {
    try {
      if (order.payment?.razorpayOrderId && (await reconcileOrderPayment(order))) continue;
      await updateOrderStatus(
        { organizationId: order.organizationId, actor: TIMEOUT_ACTOR, role: 'ORG_ADMIN' },
        order._id,
        { status: 'CANCELLED', reason: `Payment not completed within ${env.PAYMENT_TIMEOUT_MINUTES} minutes` },
      );
      cancelled++;
    } catch (err) {
      logger.error(`Could not expire unpaid order #${order.orderNumber}`, err);
    }
  }
  return cancelled;
}
