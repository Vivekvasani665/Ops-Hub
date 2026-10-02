import crypto from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { Order } from '../src/modules/orders/order.model';
import { razorpay, type RazorpayPayment } from '../src/modules/payments/razorpay.client';
import { expireUnpaidOrders } from '../src/modules/payments/payment.service';
import { createTenant, key, loginAs, resetDb, stockOf, testServer } from './helpers';

const KEY_SECRET = 'test_key_secret';
const WEBHOOK_SECRET = 'test_webhook_secret';

const shipping = {
  fullName: 'Asha Shopper',
  phone: '+91 98765 43210',
  line1: '12 MG Road',
  city: 'Bengaluru',
  state: 'Karnataka',
  postalCode: '560001',
};

let rzpOrderSeq = 0;

function payment(overrides: Partial<RazorpayPayment> & { order_id: string; amount: number }): RazorpayPayment {
  return { id: `pay_${crypto.randomUUID().slice(0, 12)}`, currency: 'INR', status: 'captured', method: 'upi', vpa: 'asha@okhdfc', ...overrides };
}

const sign = (orderId: string, paymentId: string) =>
  crypto.createHmac('sha256', KEY_SECRET).update(`${orderId}|${paymentId}`).digest('hex');

function webhook(body: unknown, eventId = `evt_${crypto.randomUUID()}`) {
  const raw = JSON.stringify(body);
  const signature = crypto.createHmac('sha256', WEBHOOK_SECRET).update(raw).digest('hex');
  return request(testServer())
    .post('/api/payments/razorpay/webhook')
    .set('Content-Type', 'application/json')
    .set('X-Razorpay-Signature', signature)
    .set('X-Razorpay-Event-Id', eventId)
    .send(raw);
}

async function setup(stock = 5, price = 24_900) {
  const { products } = await createTenant('acme', { products: [{ sku: 'PAY', stock, price }] });
  const productId = String(products[0]!._id);
  const shopper = request.agent(testServer());
  await shopper.post('/api/storefront/auth/register').send({ name: 'Asha Shopper', email: 'asha@example.com', password: 'Secret123' }).expect(201);
  return { productId, shopper };
}

async function placeOnline(shopper: request.Agent, productId: string, quantity = 2, extra: Record<string, unknown> = {}) {
  const res = await shopper
    .post('/api/storefront/orders')
    .set('Idempotency-Key', key())
    .send({ items: [{ productId, quantity }], shipping, paymentMethod: 'RAZORPAY', ...extra });
  expect(res.status).toBe(201);
  return res.body.data as { id: string; orderNumber: number; totalAmount: number; status: string; payment: Record<string, unknown> };
}

beforeEach(async () => {
  await resetDb();
  vi.spyOn(razorpay, 'createOrder').mockImplementation(async (input) => ({
    id: `order_test${++rzpOrderSeq}`,
    amount: input.amount,
    currency: input.currency,
    receipt: input.receipt,
    status: 'created',
  }));
  vi.spyOn(razorpay, 'refundPayment').mockImplementation(async (paymentId) => ({ id: `rfnd_${paymentId}`, payment_id: paymentId, amount: 0, status: 'processed' }));
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('cash on delivery', () => {
  it('creates a PENDING/PENDING order that the admin sees and that becomes PAID on delivery', async () => {
    const { productId, shopper } = await setup();
    const placed = await shopper
      .post('/api/storefront/orders')
      .set('Idempotency-Key', key())
      .send({ items: [{ productId, quantity: 1 }], shipping, paymentMethod: 'COD' });
    expect(placed.status).toBe(201);
    expect(placed.body.data).toMatchObject({ status: 'PENDING', payment: { method: 'COD', status: 'PENDING', payableForSeconds: 0 } });
    expect(razorpay.createOrder).not.toHaveBeenCalled();

    const admin = await loginAs('org_admin@acme.test');
    const list = await admin.get('/api/orders');
    expect(list.body.data[0]).toMatchObject({ status: 'PENDING', payment: { method: 'COD', status: 'PENDING' } });

    const id = placed.body.data.id;
    for (const status of ['CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED']) {
      expect((await admin.patch(`/api/orders/${id}/status`).send({ status })).status).toBe(200);
    }
    const detail = await admin.get(`/api/orders/${id}`);
    expect(detail.body.data.payment).toMatchObject({ method: 'COD', status: 'PAID' });
  });
});

describe('Razorpay checkout', () => {
  it('charges the database total, verifies the signature server-side and confirms the order exactly once', async () => {
    const { productId, shopper } = await setup(5, 24_900);
    // A client-supplied amount is ignored: the order total comes from product prices in the database.
    const order = await placeOnline(shopper, productId, 2, { totalAmount: 100, amount: 100 });
    expect(order).toMatchObject({ status: 'PENDING', totalAmount: 49_800, payment: { method: 'RAZORPAY', status: 'PENDING' } });
    expect(await stockOf(productId)).toEqual({ available: 3, reserved: 2 });

    // Admin sees the unpaid order but cannot confirm it.
    const admin = await loginAs('org_admin@acme.test');
    const before = await admin.get(`/api/orders/${order.id}`);
    expect(before.body.data.allowedTransitions).toEqual(['CANCELLED']);
    const early = await admin.patch(`/api/orders/${order.id}/status`).send({ status: 'CONFIRMED' });
    expect(early.status).toBe(409);
    expect(early.body.error.code).toBe('PAYMENT_NOT_COMPLETED');

    const start = await shopper.post('/api/storefront/payments/razorpay/order').send({ orderId: order.id });
    expect(start.status).toBe(200);
    expect(start.body.data).toMatchObject({ keyId: 'rzp_test_dummykey', amount: 49_800, currency: 'INR', orderNumber: order.orderNumber });
    expect(JSON.stringify(start.body)).not.toContain(KEY_SECRET);
    expect(razorpay.createOrder).toHaveBeenCalledWith(expect.objectContaining({ amount: 49_800, currency: 'INR' }));
    const rzpOrderId = start.body.data.razorpayOrderId as string;

    // Retry reuses the same Razorpay order.
    const again = await shopper.post('/api/storefront/payments/razorpay/order').send({ orderId: order.id });
    expect(again.body.data.razorpayOrderId).toBe(rzpOrderId);
    expect(razorpay.createOrder).toHaveBeenCalledTimes(1);

    const paid = payment({ order_id: rzpOrderId, amount: 49_800 });
    vi.spyOn(razorpay, 'fetchPayment').mockResolvedValue(paid);

    const forged = await shopper.post('/api/storefront/payments/razorpay/verify').send({
      orderId: order.id,
      razorpay_order_id: rzpOrderId,
      razorpay_payment_id: paid.id,
      razorpay_signature: 'a'.repeat(64),
    });
    expect(forged.status).toBe(400);
    expect(forged.body.error.code).toBe('PAYMENT_VERIFICATION_FAILED');
    expect((await Order.findById(order.id).lean())!.paymentStatus).toBe('PENDING');

    const body = { orderId: order.id, razorpay_order_id: rzpOrderId, razorpay_payment_id: paid.id, razorpay_signature: sign(rzpOrderId, paid.id) };
    const verified = await shopper.post('/api/storefront/payments/razorpay/verify').send(body);
    expect(verified.status).toBe(200);
    expect(verified.body.data).toMatchObject({ status: 'CONFIRMED', payment: { status: 'PAID', instrument: 'upi', instrumentDetail: 'asha@okhdfc' } });

    // Replayed callback and a webhook for the same payment change nothing.
    expect((await shopper.post('/api/storefront/payments/razorpay/verify').send(body)).status).toBe(200);
    expect((await webhook({ event: 'payment.captured', payload: { payment: { entity: paid } } })).status).toBe(200);
    const stored = await Order.findById(order.id).lean();
    expect(stored!.statusHistory.map((h) => h.to)).toEqual(['PENDING', 'CONFIRMED']);
    expect(razorpay.refundPayment).not.toHaveBeenCalled();

    const list = await admin.get('/api/orders');
    expect(list.body.data[0]).toMatchObject({ status: 'CONFIRMED', payment: { method: 'RAZORPAY', status: 'PAID', instrument: 'upi' } });
    const after = await admin.get(`/api/orders/${order.id}`);
    expect(after.body.data.allowedTransitions).toEqual(['PROCESSING', 'CANCELLED']);

    // Paid orders cannot be paid again.
    const closed = await shopper.post('/api/storefront/payments/razorpay/order').send({ orderId: order.id });
    expect(closed.body.error.code).toBe('ALREADY_PAID');
  });

  it("rejects another customer's order and a payment belonging to a different Razorpay order", async () => {
    const { productId, shopper } = await setup();
    const order = await placeOnline(shopper, productId, 1);
    const rzpOrderId = (await shopper.post('/api/storefront/payments/razorpay/order').send({ orderId: order.id })).body.data.razorpayOrderId;

    const other = request.agent(testServer());
    await other.post('/api/storefront/auth/register').send({ name: 'Eve', email: 'eve@example.com', password: 'Secret123' }).expect(201);
    expect((await other.post('/api/storefront/payments/razorpay/order').send({ orderId: order.id })).status).toBe(404);

    // Signed correctly, but the payment was made against some other Razorpay order.
    const foreign = payment({ order_id: 'order_someoneelse', amount: order.totalAmount });
    vi.spyOn(razorpay, 'fetchPayment').mockResolvedValue(foreign);
    const res = await shopper.post('/api/storefront/payments/razorpay/verify').send({
      orderId: order.id,
      razorpay_order_id: rzpOrderId,
      razorpay_payment_id: foreign.id,
      razorpay_signature: sign(rzpOrderId, foreign.id),
    });
    expect(res.status).toBe(400);
    expect((await Order.findById(order.id).lean())!.paymentStatus).toBe('PENDING');
  });

  it('webhook confirms a payment whose browser callback was lost, and ignores bad signatures and duplicates', async () => {
    const { productId, shopper } = await setup();
    const order = await placeOnline(shopper, productId, 1);
    const rzpOrderId = (await shopper.post('/api/storefront/payments/razorpay/order').send({ orderId: order.id })).body.data.razorpayOrderId;
    const paid = payment({ order_id: rzpOrderId, amount: order.totalAmount, method: 'card', vpa: null, card: { network: 'Visa', type: 'credit', last4: '1111' } });
    const fetchPayment = vi.spyOn(razorpay, 'fetchPayment').mockResolvedValue(paid);
    const event = { event: 'payment.captured', payload: { payment: { entity: paid } } };

    const unsigned = await request(testServer())
      .post('/api/payments/razorpay/webhook')
      .set('Content-Type', 'application/json')
      .set('X-Razorpay-Signature', 'deadbeef')
      .send(JSON.stringify(event));
    expect(unsigned.status).toBe(400);
    expect((await Order.findById(order.id).lean())!.paymentStatus).toBe('PENDING');

    expect((await webhook(event, 'evt_1')).status).toBe(200);
    expect((await webhook(event, 'evt_1')).status).toBe(200);
    expect(fetchPayment).toHaveBeenCalledTimes(1);

    const mine = await shopper.get(`/api/storefront/orders/${order.id}`);
    expect(mine.body.data).toMatchObject({ status: 'CONFIRMED', payment: { status: 'PAID', instrument: 'card', instrumentDetail: 'Visa credit •••• 1111' } });
  });

  it('reconcile asks Razorpay and captures an authorised payment', async () => {
    const { productId, shopper } = await setup();
    const order = await placeOnline(shopper, productId, 1);
    const rzpOrderId = (await shopper.post('/api/storefront/payments/razorpay/order').send({ orderId: order.id })).body.data.razorpayOrderId;
    const authorized = payment({ order_id: rzpOrderId, amount: order.totalAmount, status: 'authorized', method: 'wallet', wallet: 'phonepe' });
    vi.spyOn(razorpay, 'fetchOrderPayments').mockResolvedValue([authorized]);
    const capture = vi.spyOn(razorpay, 'capturePayment').mockResolvedValue({ ...authorized, status: 'captured' });

    const res = await shopper.post('/api/storefront/payments/razorpay/reconcile').send({ orderId: order.id });
    expect(res.status).toBe(200);
    expect(capture).toHaveBeenCalledWith(authorized.id, order.totalAmount, 'INR');
    expect(res.body.data).toMatchObject({ status: 'CONFIRMED', payment: { status: 'PAID', instrumentDetail: 'phonepe' } });
  });

  it('cancels unpaid orders after the payment window, releases stock and refunds a late payment', async () => {
    const { productId, shopper } = await setup(5);
    const order = await placeOnline(shopper, productId, 2);
    const rzpOrderId = (await shopper.post('/api/storefront/payments/razorpay/order').send({ orderId: order.id })).body.data.razorpayOrderId;
    vi.spyOn(razorpay, 'fetchOrderPayments').mockResolvedValue([]);

    expect(await expireUnpaidOrders()).toBe(0); // still inside the window
    await Order.collection.updateOne({ _id: (await Order.findById(order.id))!._id }, { $set: { createdAt: new Date(Date.now() - 31 * 60_000) } });
    expect(await expireUnpaidOrders()).toBe(1);

    const expired = await Order.findById(order.id).lean();
    expect(expired).toMatchObject({ status: 'CANCELLED', paymentStatus: 'FAILED' });
    expect(await stockOf(productId)).toEqual({ available: 5, reserved: 0 });
    expect((await shopper.post('/api/storefront/payments/razorpay/order').send({ orderId: order.id })).body.error.code).toBe('PAYMENT_CLOSED');

    // The customer's payment lands after the order was cancelled: it is refunded, never applied.
    const late = payment({ order_id: rzpOrderId, amount: order.totalAmount });
    vi.spyOn(razorpay, 'fetchPayment').mockResolvedValue(late);
    expect((await webhook({ event: 'payment.captured', payload: { payment: { entity: late } } })).status).toBe(200);
    expect(razorpay.refundPayment).toHaveBeenCalledWith(late.id, expect.any(Object));
    expect(await Order.findById(order.id).lean()).toMatchObject({ status: 'CANCELLED', paymentStatus: 'REFUNDED' });
  });
});
