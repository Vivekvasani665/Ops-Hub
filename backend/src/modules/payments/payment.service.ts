import crypto from 'node:crypto';
import { Types } from 'mongoose';
import { env, payuEnabled, payuUrls } from '../../config/env';
import { Errors } from '../../utils/errors';
import { logger } from '../../utils/logger';
import { withTransaction } from '../../utils/transaction';
import { emitToOrg } from '../../realtime/emitter';
import { recordAudit, toAuditDto } from '../audit/audit.service';
import { enqueueJob } from '../jobs/job.service';
import { Order } from '../orders/order.model';
import { toOrderListItemDto } from '../orders/order.mapper';
import { updateOrderStatus } from '../orders/order.service';
import {
  describeInstrument,
  fromPayuAmount,
  hashSafe,
  isValidResponseHash,
  payu,
  payuUnavailable,
  requestHash,
  toPayuAmount,
  type PayuRequestFields,
} from './payu.client';

/**
 * Online payment lifecycle of storefront orders (PayU Hosted Checkout).
 *
 *   checkout → order PENDING / payment PENDING (stock reserved)
 *            → POST /payments/payu/create: new txnid, amount = order.totalAmount from the DB, hash signed here
 *            → browser posts the form to PayU, customer pays on PayU's page
 *            → PayU posts the result to the storefront's /payment/success|failure, which forwards it here
 *            → reverse hash verified + transaction re-read from PayU's Verify API   (callback, reconcile or sweep)
 *            → order PROCESSING / payment PAID
 *
 * Every path that can mark an order paid ends in `applyCapturedPayment`, whose write is conditional on the
 * order still awaiting payment, so a duplicate callback, a reconcile and the sweep can all race on the same
 * transaction and it is applied exactly once.
 */

/** Actor recorded on status changes caused by the payment gateway rather than a person. */
export const PAYMENT_ACTOR = { id: new Types.ObjectId('000000000000000000000001'), name: 'PayU' };
const TIMEOUT_ACTOR = { id: new Types.ObjectId('000000000000000000000002'), name: 'System (payment timeout)' };

/** An online order can be (re)paid while it is PENDING and no payment has succeeded; a failed attempt can be retried. */
const UNPAID = ['PENDING', 'FAILED'];

type OrderLean = NonNullable<Awaited<ReturnType<typeof findOrder>>>;

function findOrder(filter: Record<string, unknown>) {
  return Order.findOne(filter).lean();
}

function assertAwaitingPayment(order: OrderLean) {
  if (order.paymentMethod !== 'ONLINE') throw Errors.conflict('NOT_AN_ONLINE_ORDER', 'This order is not paid online');
  if (order.paymentStatus === 'PAID') throw Errors.conflict('ALREADY_PAID', 'This order is already paid');
  if (order.status !== 'PENDING' || !UNPAID.includes(order.paymentStatus ?? '')) {
    throw Errors.conflict('PAYMENT_CLOSED', 'This order can no longer be paid');
  }
}

/** Payment window left for an order, in seconds; no new attempt starts once it runs out. */
export function paymentSecondsLeft(createdAt: Date, now = Date.now()) {
  return Math.max(0, Math.floor((createdAt.getTime() + env.PAYMENT_TIMEOUT_MINUTES * 60_000 - now) / 1000));
}

/** Unique per attempt (PayU rejects a reused txnid), alphanumeric, ≤ 25 chars. */
function newTxnId(orderNumber: number) {
  return `OH${orderNumber}T${Date.now().toString(36)}${crypto.randomBytes(3).toString('hex')}`.toUpperCase().slice(0, 25);
}

/** The checkout form requires a phone: the customer's profile phone, else the one given for shipping. */
function phoneFor(profilePhone: string | null | undefined, notes: string | null | undefined) {
  const raw = profilePhone || notes?.match(/Phone: ([0-9+\-\s()]+)/)?.[1] || '';
  const digits = raw.replace(/\D/g, '');
  return digits.length > 10 ? digits.slice(-10) : digits;
}

// ---------- checkout ----------

/**
 * Signed PayU Hosted Checkout form for one of the customer's unpaid orders. Every call (first attempt or
 * retry) starts a new txnid; all of them are remembered so a payment on any attempt is found and applied once.
 */
export async function startPayuPayment(
  orgId: Types.ObjectId,
  customer: { id: Types.ObjectId; name: string; email: string; phone?: string | null },
  orderId: Types.ObjectId,
): Promise<{ action: string; fields: PayuRequestFields }> {
  if (!payuEnabled) throw payuUnavailable();
  const order = await findOrder({ _id: orderId, organizationId: orgId, 'createdBy.id': customer.id });
  if (!order) throw Errors.notFound('Order');
  assertAwaitingPayment(order);
  if (paymentSecondsLeft(order.createdAt) < 60) {
    throw Errors.conflict('PAYMENT_WINDOW_EXPIRED', 'The payment window for this order has closed');
  }

  const txnid = newTxnId(order.orderNumber);
  const recorded = await Order.updateOne(
    { _id: order._id, status: 'PENDING', paymentMethod: 'ONLINE', paymentStatus: { $in: UNPAID } },
    { $set: { 'payment.gateway': 'PAYU', 'payment.gatewayOrderId': txnid }, $push: { 'payment.txnIds': txnid } },
  );
  if (!recorded.modifiedCount) throw Errors.conflict('PAYMENT_CLOSED', 'This order can no longer be paid');

  const base = {
    key: env.PAYU_MERCHANT_KEY!,
    txnid,
    // Always the database total: the browser never supplies an amount.
    amount: toPayuAmount(order.totalAmount),
    productinfo: `Order ${order.orderNumber}`,
    firstname: hashSafe(customer.name, 60).replace(/[^\p{L}\p{N} .'-]/gu, '') || 'Customer',
    email: hashSafe(customer.email),
    udf1: String(order._id),
    udf2: String(orgId),
    udf3: '',
    udf4: '',
    udf5: '',
  };
  const hash = requestHash(base);
  if (env.NODE_ENV === 'development') {
    // Never the salt, key or hash itself: only what helps match an attempt against PayU's dashboard.
    logger.info(
      `[PayU] txnid: ${txnid} · amount: ${base.amount} · productinfo: ${base.productinfo} · environment: ${env.PAYU_ENV} · action: ${payuUrls.payment} · hash generated: ${hash.length === 128}`,
    );
  }
  return {
    action: payuUrls.payment,
    fields: {
      ...base,
      phone: phoneFor(customer.phone, order.notes),
      surl: env.PAYU_SUCCESS_URL!,
      furl: env.PAYU_FAILURE_URL!,
      hash,
    },
  };
}

// ---------- PayU callback (surl / furl) ----------

export type CallbackOutcome = 'paid' | 'failed' | 'cancelled' | 'pending' | 'invalid';

/**
 * Result PayU posted back through the customer's browser. Nothing in it is trusted until the reverse hash
 * matches; a success is additionally re-read from PayU's Verify API before the order is marked paid.
 */
export async function handlePayuCallback(r: Record<string, string | undefined>): Promise<{ outcome: CallbackOutcome; orderId: string | null }> {
  const txnid = r.txnid ?? '';
  if (!payuEnabled || !txnid || r.key !== env.PAYU_MERCHANT_KEY || !isValidResponseHash(r)) {
    logger.warn(`Rejected PayU callback with an invalid hash or key (txnid ${txnid.slice(0, 40) || 'missing'})`);
    return { outcome: 'invalid', orderId: null };
  }

  const order = await findOrder({ 'payment.txnIds': txnid });
  if (!order || r.udf1 !== String(order._id)) {
    logger.warn(`PayU callback for unknown txnid ${txnid}`);
    return { outcome: 'invalid', orderId: null };
  }
  const orderId = String(order._id);
  const status = (r.status ?? '').toLowerCase();

  if (status === 'success') {
    let confirmed;
    try {
      [confirmed] = (await payu.verifyPayments([txnid])).filter((t) => t.txnid === txnid);
    } catch (err) {
      // Could not ask PayU right now: keep the order pending, the reconcile / sweep will confirm it.
      logger.error(`PayU verify failed for txnid ${txnid}`, err);
      return { outcome: 'pending', orderId };
    }
    if (!confirmed || confirmed.status !== 'success') {
      return { outcome: confirmed?.status === 'failure' ? 'failed' : 'pending', orderId };
    }
    if (confirmed.mihpayid !== r.mihpayid) {
      logger.error(`PayU txnid ${txnid}: callback mihpayid ${r.mihpayid} ≠ verified ${confirmed.mihpayid}`);
      return { outcome: 'invalid', orderId };
    }
    const ok = await applyCapturedPayment({
      txnid,
      mihpayid: confirmed.mihpayid,
      amountPaise: fromPayuAmount(confirmed.amt),
      ...describeInstrument({ mode: r.mode ?? confirmed.mode, bankcode: r.bankcode ?? confirmed.bankcode, cardnum: r.cardnum }),
    });
    return { outcome: ok ? 'paid' : 'invalid', orderId };
  }

  if (status === 'pending') return { outcome: 'pending', orderId };

  // failure (including the customer cancelling on PayU's page)
  const cancelled = (r.unmappedstatus ?? '').toLowerCase() === 'usercancelled';
  await recordFailedAttempt(order._id, txnid, cancelled ? 'Payment was cancelled' : hashSafe(r.error_Message || r.field9 || 'Payment failed', 200));
  return { outcome: cancelled ? 'cancelled' : 'failed', orderId };
}

/** "Did my payment go through?" — asks PayU about every attempt of the order; used by the customer and the sweep. */
export async function reconcileOrderPayment(order: OrderLean) {
  const txnIds = order.payment?.txnIds ?? [];
  if (order.paymentMethod !== 'ONLINE' || order.status !== 'PENDING' || !UNPAID.includes(order.paymentStatus ?? '') || !txnIds.length) {
    return false;
  }
  const paid = (await payu.verifyPayments(txnIds)).find((t) => t.status === 'success' && txnIds.includes(t.txnid));
  if (!paid) return false;
  return applyCapturedPayment({
    txnid: paid.txnid,
    mihpayid: paid.mihpayid,
    amountPaise: fromPayuAmount(paid.amt),
    ...describeInstrument(paid),
  });
}

// ---------- applying gateway results ----------

interface CapturedPayment {
  txnid: string;
  mihpayid: string;
  amountPaise: number;
  instrument: string | null;
  instrumentDetail: string | null;
}

/**
 * Marks the order paid (→ PROCESSING) for a verified successful transaction. Idempotent: a second call with
 * the same transaction is a no-op. A payment for an order that can no longer take it (cancelled after the
 * payment window closed, or already paid by another attempt) or for the wrong amount is refunded.
 */
export async function applyCapturedPayment(p: CapturedPayment): Promise<boolean> {
  const order = await findOrder({ 'payment.txnIds': p.txnid });
  if (!order) {
    logger.warn(`PayU transaction ${p.mihpayid} for unknown txnid ${p.txnid}`);
    return false;
  }
  if (order.payment?.gatewayTransactionId === p.mihpayid && order.paymentStatus === 'PAID') return true;

  if (p.amountPaise !== order.totalAmount) {
    // Cannot happen with an untampered checkout (the amount is hashed server-side); never accept it.
    logger.error(`PayU transaction ${p.mihpayid} amount ${p.amountPaise} ≠ order total ${order.totalAmount}`);
    await Order.updateOne({ _id: order._id }, { $set: { 'payment.lastError': 'Amount mismatch, payment not accepted' } });
    await refundUnusablePayment(order, p, 'amount mismatch');
    return false;
  }

  const now = new Date();
  const label = p.instrumentDetail ?? p.instrument ?? 'online';

  const applied = await withTransaction(async (session) => {
    const updated = await Order.findOneAndUpdate(
      { _id: order._id, status: 'PENDING', paymentMethod: 'ONLINE', paymentStatus: { $in: UNPAID } },
      {
        $set: {
          status: 'PROCESSING',
          paymentStatus: 'PAID',
          'payment.gateway': 'PAYU',
          'payment.gatewayOrderId': p.txnid,
          'payment.gatewayTransactionId': p.mihpayid,
          'payment.instrument': p.instrument,
          'payment.instrumentDetail': p.instrumentDetail,
          'payment.paidAt': now,
          'payment.lastError': null,
        },
        $push: {
          statusHistory: {
            $each: [
              { from: 'PENDING', to: 'CONFIRMED', changedBy: PAYMENT_ACTOR, reason: `Paid online via PayU (${label}) · ${p.mihpayid}`, at: now },
              { from: 'CONFIRMED', to: 'PROCESSING', changedBy: PAYMENT_ACTOR, reason: 'Payment verified', at: now },
            ],
          },
        },
      },
      { new: true, session },
    );
    if (!updated) return null;

    const meta = { orderNumber: updated.orderNumber, customerName: updated.customer.name, from: 'PENDING', to: 'PROCESSING' };
    const audit = await recordAudit(
      {
        organizationId: updated.organizationId,
        actor: PAYMENT_ACTOR,
        action: 'ORDER_STATUS_CHANGED',
        entityType: 'ORDER',
        entityId: updated._id,
        metadata: { ...meta, payment: { gateway: 'PAYU', txnid: p.txnid, mihpayid: p.mihpayid, instrument: p.instrument, amount: p.amountPaise } },
        dedupeKey: `payment-captured:${p.mihpayid}`,
      },
      session,
    );
    await enqueueJob(
      {
        type: 'SEND_ORDER_NOTIFICATION',
        organizationId: updated.organizationId,
        payload: { event: 'status_changed', orderId: String(updated._id), ...meta, totalAmount: updated.totalAmount },
        dedupeKey: `payment-notification:${p.mihpayid}`,
      },
      session,
    );
    return { updated, audit };
  });

  if (applied) {
    const orgId = applied.updated.organizationId;
    if (applied.audit) emitToOrg(orgId, 'audit:created', { log: toAuditDto(applied.audit) });
    emitToOrg(orgId, 'order:updated', { order: toOrderListItemDto(applied.updated), from: 'PENDING', to: 'PROCESSING' });
    return true;
  }

  const current = (await findOrder({ _id: order._id }))!;
  if (current.payment?.gatewayTransactionId === p.mihpayid) return true; // already applied by a concurrent path
  await refundUnusablePayment(current, p, current.status === 'CANCELLED' ? 'order cancelled before payment completed' : 'duplicate payment');
  return false;
}

async function refundUnusablePayment(order: OrderLean, p: CapturedPayment, why: string) {
  try {
    // The refund token is fixed per PayU transaction, so PayU rejects a second refund of the same payment.
    const refund = await payu.refund(p.mihpayid, p.amountPaise, `RF${p.mihpayid}`.slice(0, 23));
    logger.warn(`Refunded PayU transaction ${p.mihpayid} for order #${order.orderNumber}: ${why}`);
    if (order.paymentStatus !== 'PAID') {
      await Order.updateOne(
        { _id: order._id, paymentStatus: { $ne: 'PAID' } },
        {
          $set: {
            paymentStatus: 'REFUNDED',
            'payment.gateway': 'PAYU',
            'payment.gatewayTransactionId': p.mihpayid,
            'payment.instrument': p.instrument,
            'payment.instrumentDetail': p.instrumentDetail,
            'payment.refundId': refund.requestId,
            'payment.refundedAt': new Date(),
            'payment.lastError': `Payment refunded automatically: ${why}`,
          },
        },
      );
    }
  } catch (err) {
    logger.error(`Automatic refund of PayU transaction ${p.mihpayid} (order #${order.orderNumber}) failed — refund it manually`, err);
    await Order.updateOne({ _id: order._id }, { $set: { 'payment.lastError': `Payment ${p.mihpayid} needs a manual refund (${why})` } });
  }
}

/**
 * A failed or cancelled attempt marks the payment FAILED but keeps the order open: the customer can retry
 * until the payment window ends. Only the latest attempt counts, so a stale failure cannot mask a newer one.
 */
export async function recordFailedAttempt(orderId: Types.ObjectId, txnid: string, message: string) {
  await Order.updateOne(
    { _id: orderId, status: 'PENDING', paymentStatus: { $in: UNPAID }, 'payment.gatewayOrderId': txnid },
    { $set: { paymentStatus: 'FAILED', 'payment.lastError': message } },
  );
}

// ---------- payment window sweep (worker) ----------

/**
 * Online orders still unpaid after PAYMENT_TIMEOUT_MINUTES: ask PayU once more (the customer may have paid
 * while the callback was lost), otherwise cancel the order so its reserved stock is released.
 */
export async function expireUnpaidOrders(now = new Date()) {
  const cutoff = new Date(now.getTime() - env.PAYMENT_TIMEOUT_MINUTES * 60_000);
  const stale = await Order.find({ paymentMethod: 'ONLINE', status: 'PENDING', paymentStatus: { $in: UNPAID }, createdAt: { $lt: cutoff } })
    .sort({ createdAt: 1 })
    .limit(100)
    .lean();

  let cancelled = 0;
  for (const order of stale) {
    try {
      if (payuEnabled && order.payment?.txnIds?.length && (await reconcileOrderPayment(order))) continue;
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
