import crypto from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { Order } from '../src/modules/orders/order.model';
import { payu, type PayuTransaction } from '../src/modules/payments/payu.client';
import { expireUnpaidOrders } from '../src/modules/payments/payment.service';
import { createTenant, key, loginAs, resetDb, stockOf, testServer } from './helpers';

const MERCHANT_KEY = 'testkey';
const SALT = 'test_salt';

const shipping = {
  fullName: 'Asha Shopper',
  phone: '+91 98765 43210',
  line1: '12 MG Road',
  city: 'Bengaluru',
  state: 'Karnataka',
  postalCode: '560001',
};

const sha512 = (s: string) => crypto.createHash('sha512').update(s).digest('hex');

/** What PayU posts back to surl/furl, signed with the documented reverse hash. */
function payuResponse(form: Record<string, string>, overrides: Record<string, string> = {}) {
  const r: Record<string, string> = {
    mihpayid: `40399${crypto.randomInt(1e6, 9e6)}`,
    mode: 'UPI',
    status: 'success',
    unmappedstatus: 'captured',
    key: form.key!,
    txnid: form.txnid!,
    amount: form.amount!,
    productinfo: form.productinfo!,
    firstname: form.firstname!,
    email: form.email!,
    udf1: form.udf1!,
    udf2: form.udf2!,
    udf3: '',
    udf4: '',
    udf5: '',
    ...overrides,
  };
  const v = (k: string) => r[k] ?? '';
  r.hash = sha512(
    [SALT, v('status'), '', '', '', '', '', v('udf5'), v('udf4'), v('udf3'), v('udf2'), v('udf1'), v('email'), v('firstname'), v('productinfo'), v('amount'), v('txnid'), v('key')].join('|'),
  );
  return r;
}

function callback(fields: Record<string, string>) {
  return request(testServer()).post('/api/payments/payu/callback').type('form').send(fields);
}

function verified(r: Record<string, string>, overrides: Partial<PayuTransaction> = {}): PayuTransaction {
  return { txnid: r.txnid!, mihpayid: r.mihpayid!, status: r.status!, amt: r.amount!, mode: r.mode, ...overrides };
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
    .send({ items: [{ productId, quantity }], shipping, paymentMethod: 'ONLINE', ...extra });
  expect(res.status).toBe(201);
  return res.body.data as { id: string; orderNumber: number; totalAmount: number; status: string; payment: Record<string, unknown> };
}

async function startPayment(shopper: request.Agent, orderId: string) {
  const res = await shopper.post('/api/storefront/payments/payu/create').send({ orderId });
  expect(res.status).toBe(200);
  return res.body.data as { action: string; fields: Record<string, string> };
}

beforeEach(async () => {
  await resetDb();
  vi.spyOn(payu, 'verifyPayments').mockResolvedValue([]);
  vi.spyOn(payu, 'refund').mockImplementation(async (mihpayid) => ({ requestId: `rf_${mihpayid}` }));
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
    expect(placed.body.data).toMatchObject({ status: 'PENDING', payment: { method: 'COD', status: 'PENDING', gateway: null, payableForSeconds: 0 } });

    // COD orders never go to PayU.
    const notOnline = await shopper.post('/api/storefront/payments/payu/create').send({ orderId: placed.body.data.id });
    expect(notOnline.body.error.code).toBe('NOT_AN_ONLINE_ORDER');

    const admin = await loginAs('org_admin@acme.test');
    const list = await admin.get('/api/orders');
    expect(list.body.data[0]).toMatchObject({ status: 'PENDING', payment: { method: 'COD', status: 'PENDING', gateway: null } });

    const id = placed.body.data.id;
    for (const status of ['CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED']) {
      expect((await admin.patch(`/api/orders/${id}/status`).send({ status })).status).toBe(200);
    }
    const detail = await admin.get(`/api/orders/${id}`);
    expect(detail.body.data.payment).toMatchObject({ method: 'COD', status: 'PAID' });
  });
});

describe('PayU hosted checkout', () => {
  it('signs the database total server-side, verifies the response and moves the order to PROCESSING exactly once', async () => {
    const { productId, shopper } = await setup(5, 24_900);
    // A client-supplied amount is ignored: the order total comes from product prices in the database.
    const order = await placeOnline(shopper, productId, 2, { totalAmount: 100, amount: 100 });
    expect(order).toMatchObject({ status: 'PENDING', totalAmount: 49_800, payment: { method: 'ONLINE', status: 'PENDING' } });
    expect(await stockOf(productId)).toEqual({ available: 3, reserved: 2 });

    // Admin sees the unpaid order but cannot progress it.
    const admin = await loginAs('org_admin@acme.test');
    expect((await admin.get(`/api/orders/${order.id}`)).body.data.allowedTransitions).toEqual(['CANCELLED']);
    const early = await admin.patch(`/api/orders/${order.id}/status`).send({ status: 'CONFIRMED' });
    expect(early.body.error.code).toBe('PAYMENT_NOT_COMPLETED');

    const { action, fields } = await startPayment(shopper, order.id);
    expect(action).toBe('https://test.payu.in/_payment');
    expect(fields).toMatchObject({
      key: MERCHANT_KEY,
      amount: '498.00',
      email: 'asha@example.com',
      phone: '9876543210',
      surl: 'https://shop.example.com/payment/success',
      furl: 'https://shop.example.com/payment/failure',
      udf1: order.id,
    });
    const f = fields;
    expect(f.hash).toBe(sha512([f.key, f.txnid, f.amount, f.productinfo, f.firstname, f.email, f.udf1, f.udf2, '', '', '', '', '', '', '', '', SALT].join('|')));
    expect(JSON.stringify(fields)).not.toContain(SALT);

    // Each attempt gets its own txnid.
    const retry = await startPayment(shopper, order.id);
    expect(retry.fields.txnid).not.toBe(fields.txnid);

    const response = payuResponse(retry.fields);
    vi.mocked(payu.verifyPayments).mockResolvedValue([verified(response)]);

    // Tampered hash → rejected, order untouched.
    const forged = await callback({ ...response, hash: 'a'.repeat(128) });
    expect(forged.body.data).toEqual({ outcome: 'invalid', orderId: null });
    expect((await Order.findById(order.id).lean())!.paymentStatus).toBe('PENDING');

    const ok = await callback(response);
    expect(ok.body.data).toEqual({ outcome: 'paid', orderId: order.id });
    expect(payu.verifyPayments).toHaveBeenCalledWith([retry.fields.txnid]);

    // Duplicate callback (refresh / replay) changes nothing.
    expect((await callback(response)).body.data.outcome).toBe('paid');
    const stored = await Order.findById(order.id).lean();
    expect(stored).toMatchObject({
      status: 'PROCESSING',
      paymentStatus: 'PAID',
      payment: { gateway: 'PAYU', gatewayOrderId: retry.fields.txnid, gatewayTransactionId: response.mihpayid, instrument: 'upi' },
    });
    expect(stored!.payment!.paidAt).toBeInstanceOf(Date);
    expect(stored!.statusHistory.map((h) => h.to)).toEqual(['PENDING', 'CONFIRMED', 'PROCESSING']);
    expect(payu.refund).not.toHaveBeenCalled();

    const list = await admin.get('/api/orders');
    expect(list.body.data[0]).toMatchObject({ status: 'PROCESSING', payment: { method: 'ONLINE', gateway: 'PAYU', status: 'PAID' } });
    const detail = await admin.get(`/api/orders/${order.id}`);
    expect(detail.body.data.payment).toMatchObject({ gateway: 'PAYU', gatewayTransactionId: response.mihpayid });
    expect(detail.body.data.allowedTransitions).toEqual(['SHIPPED', 'CANCELLED']);

    // Paid orders cannot be paid again.
    expect((await shopper.post('/api/storefront/payments/payu/create').send({ orderId: order.id })).body.error.code).toBe('ALREADY_PAID');
  });

  it("refuses another customer's order", async () => {
    const { productId, shopper } = await setup();
    const order = await placeOnline(shopper, productId, 1);
    const other = request.agent(testServer());
    await other.post('/api/storefront/auth/register').send({ name: 'Eve', email: 'eve@example.com', password: 'Secret123' }).expect(201);
    expect((await other.post('/api/storefront/payments/payu/create').send({ orderId: order.id })).status).toBe(404);
    expect((await request(testServer()).post('/api/storefront/payments/payu/create').send({ orderId: order.id })).status).toBe(401);
  });

  it('never accepts a tampered amount: the hash breaks, and a verified wrong amount is refunded', async () => {
    const { productId, shopper } = await setup();
    const order = await placeOnline(shopper, productId, 1);
    const { fields } = await startPayment(shopper, order.id);

    // Amount edited in the browser after signing: PayU's response hash no longer matches ours.
    const signed = payuResponse(fields);
    expect((await callback({ ...signed, amount: '1.00' })).body.data.outcome).toBe('invalid');

    // Even a correctly signed response is checked against PayU's own record and the order total.
    const cheap = payuResponse({ ...fields, amount: '1.00' });
    vi.mocked(payu.verifyPayments).mockResolvedValue([verified(cheap)]);
    expect((await callback(cheap)).body.data.outcome).toBe('invalid');
    expect(payu.refund).toHaveBeenCalledWith(cheap.mihpayid, 100, expect.any(String));
    expect(await Order.findById(order.id).lean()).toMatchObject({ status: 'PENDING', paymentStatus: 'REFUNDED' });
  });

  it('does not mark paid when PayU does not confirm the success, or cannot be reached', async () => {
    const { productId, shopper } = await setup();
    const order = await placeOnline(shopper, productId, 1);
    const { fields } = await startPayment(shopper, order.id);
    const response = payuResponse(fields);

    vi.mocked(payu.verifyPayments).mockResolvedValue([verified(response, { status: 'pending' })]);
    expect((await callback(response)).body.data.outcome).toBe('pending');
    vi.mocked(payu.verifyPayments).mockRejectedValue(new Error('timeout'));
    expect((await callback(response)).body.data.outcome).toBe('pending');
    expect((await Order.findById(order.id).lean())!.paymentStatus).toBe('PENDING');

    // Later the customer (or the sweep) reconciles and PayU confirms it.
    vi.mocked(payu.verifyPayments).mockResolvedValue([verified(response)]);
    const res = await shopper.post('/api/storefront/payments/payu/reconcile').send({ orderId: order.id });
    expect(res.body.data).toMatchObject({ status: 'PROCESSING', payment: { status: 'PAID', gateway: 'PAYU' } });
  });

  it('records failed and cancelled attempts as FAILED, keeps the order payable, and a retry can succeed', async () => {
    const { productId, shopper } = await setup();
    const order = await placeOnline(shopper, productId, 1);

    const first = await startPayment(shopper, order.id);
    const failed = await callback(payuResponse(first.fields, { status: 'failure', unmappedstatus: 'failed', error_Message: 'Bank declined' }));
    expect(failed.body.data).toEqual({ outcome: 'failed', orderId: order.id });
    let mine = (await shopper.get(`/api/storefront/orders/${order.id}`)).body.data;
    expect(mine).toMatchObject({ status: 'PENDING', payment: { status: 'FAILED', lastError: 'Bank declined' } });
    expect(mine.payment.payableForSeconds).toBeGreaterThan(0);

    const second = await startPayment(shopper, order.id);
    const cancelled = await callback(payuResponse(second.fields, { status: 'failure', unmappedstatus: 'userCancelled' }));
    expect(cancelled.body.data.outcome).toBe('cancelled');

    // A failure for an older attempt does not touch the newer one.
    const third = await startPayment(shopper, order.id);
    await callback(payuResponse(first.fields, { status: 'failure', unmappedstatus: 'failed' }));
    const success = payuResponse(third.fields);
    vi.mocked(payu.verifyPayments).mockResolvedValue([verified(success)]);
    expect((await callback(success)).body.data.outcome).toBe('paid');
    mine = (await shopper.get(`/api/storefront/orders/${order.id}`)).body.data;
    expect(mine).toMatchObject({ status: 'PROCESSING', payment: { status: 'PAID', lastError: null } });

    // A failure arriving after the payment never downgrades it.
    await callback(payuResponse(third.fields, { status: 'failure', unmappedstatus: 'failed' }));
    expect((await Order.findById(order.id).lean())!.paymentStatus).toBe('PAID');
  });

  it('refunds a second successful attempt on an already paid order', async () => {
    const { productId, shopper } = await setup();
    const order = await placeOnline(shopper, productId, 1);
    const a = await startPayment(shopper, order.id);
    const b = await startPayment(shopper, order.id);
    const paidA = payuResponse(a.fields);
    const paidB = payuResponse(b.fields);
    vi.mocked(payu.verifyPayments).mockImplementation(async ([txnid]) => [txnid === a.fields.txnid ? verified(paidA) : verified(paidB)]);

    expect((await callback(paidA)).body.data.outcome).toBe('paid');
    expect((await callback(paidB)).body.data.outcome).toBe('invalid');
    expect(payu.refund).toHaveBeenCalledWith(paidB.mihpayid, order.totalAmount, expect.any(String));
    expect(await Order.findById(order.id).lean()).toMatchObject({ paymentStatus: 'PAID', payment: { gatewayTransactionId: paidA.mihpayid } });
  });

  it('cancels unpaid orders after the payment window, releases stock and refunds a late payment', async () => {
    const { productId, shopper } = await setup(5);
    const order = await placeOnline(shopper, productId, 2);
    const { fields } = await startPayment(shopper, order.id);

    expect(await expireUnpaidOrders()).toBe(0); // still inside the window
    await Order.collection.updateOne({ _id: (await Order.findById(order.id))!._id }, { $set: { createdAt: new Date(Date.now() - 31 * 60_000) } });
    expect(await expireUnpaidOrders()).toBe(1);
    expect(payu.verifyPayments).toHaveBeenCalledWith([fields.txnid]);

    expect(await Order.findById(order.id).lean()).toMatchObject({ status: 'CANCELLED', paymentStatus: 'FAILED' });
    expect(await stockOf(productId)).toEqual({ available: 5, reserved: 0 });
    expect((await shopper.post('/api/storefront/payments/payu/create').send({ orderId: order.id })).body.error.code).toBe('PAYMENT_CLOSED');

    // The customer's payment lands after the order was cancelled: it is refunded, never applied.
    const late = payuResponse(fields);
    vi.mocked(payu.verifyPayments).mockResolvedValue([verified(late)]);
    expect((await callback(late)).body.data.outcome).toBe('invalid');
    expect(payu.refund).toHaveBeenCalledWith(late.mihpayid, order.totalAmount, expect.any(String));
    expect(await Order.findById(order.id).lean()).toMatchObject({ status: 'CANCELLED', paymentStatus: 'REFUNDED' });
  });
});
