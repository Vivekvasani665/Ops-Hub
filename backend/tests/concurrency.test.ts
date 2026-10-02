import { beforeEach, describe, expect, it } from 'vitest';
import { Order } from '../src/modules/orders/order.model';
import { createTenant, key, loginAs, orderBody, resetDb, stockOf } from './helpers';

beforeEach(resetDb);

describe('inventory concurrency', () => {
  it('100 concurrent orders for 10 units: exactly 10 succeed, 90 are rejected, stock ends at 0', async () => {
    const { products } = await createTenant('acme', { products: [{ sku: 'HOT', stock: 10 }] });
    const productId = String(products[0]!._id);
    const agent = await loginAs('operator@acme.test');

    const responses = await Promise.all(
      Array.from({ length: 100 }, () =>
        agent.post('/api/orders').set('Idempotency-Key', key()).send(orderBody(productId, 1)),
      ),
    );

    const created = responses.filter((r) => r.status === 201);
    const rejected = responses.filter((r) => r.status === 409);
    expect(created).toHaveLength(10);
    expect(rejected).toHaveLength(90);
    expect(rejected.every((r) => r.body.error.code === 'INSUFFICIENT_STOCK')).toBe(true);

    expect(await stockOf(productId)).toEqual({ available: 0, reserved: 10 });
    expect(await Order.countDocuments()).toBe(10);
    // Order numbers are allocated inside the same transaction: unique and gapless.
    const numbers = created.map((r) => r.body.data.orderNumber).sort();
    expect(new Set(numbers).size).toBe(10);
    expect(Math.max(...numbers) - Math.min(...numbers)).toBe(9);
  });

  it('mixed quantities never oversell', async () => {
    const { products } = await createTenant('acme', { products: [{ sku: 'MIX', stock: 25 }] });
    const productId = String(products[0]!._id);
    const agent = await loginAs('operator@acme.test');

    const quantities = Array.from({ length: 40 }, (_, i) => (i % 3) + 1); // 1,2,3,...
    const responses = await Promise.all(
      quantities.map((q) => agent.post('/api/orders').set('Idempotency-Key', key()).send(orderBody(productId, q))),
    );
    const sold = responses.reduce((sum, r, i) => sum + (r.status === 201 ? quantities[i]! : 0), 0);
    const stock = await stockOf(productId);

    expect(sold).toBeLessThanOrEqual(25);
    expect(stock.available).toBe(25 - sold);
    expect(stock.reserved).toBe(sold);
    expect(stock.available).toBeGreaterThanOrEqual(0);
  });

  it('multi-item orders are all-or-nothing', async () => {
    const { products } = await createTenant('acme', {
      products: [
        { sku: 'PLENTY', stock: 50 },
        { sku: 'SCARCE', stock: 1 },
      ],
    });
    const [plenty, scarce] = products.map((p) => String(p._id));
    const agent = await loginAs('operator@acme.test');

    const res = await agent
      .post('/api/orders')
      .set('Idempotency-Key', key())
      .send({
        customer: { name: 'Bulk Buyer', email: 'bulk@example.com' },
        items: [
          { productId: plenty, quantity: 5 },
          { productId: scarce, quantity: 2 },
        ],
      });

    expect(res.status).toBe(409);
    expect(res.body.error.details).toMatchObject({ sku: 'SCARCE', requested: 2, available: 1 });
    // The PLENTY reservation was rolled back with the transaction.
    expect(await stockOf(plenty)).toEqual({ available: 50, reserved: 0 });
    expect(await stockOf(scarce)).toEqual({ available: 1, reserved: 0 });
    expect(await Order.countDocuments()).toBe(0);
  });

  it('concurrent cancellations of the same order release stock exactly once', async () => {
    const { products } = await createTenant('acme', { products: [{ sku: 'ONCE', stock: 5 }] });
    const productId = String(products[0]!._id);
    const agent = await loginAs('manager@acme.test');
    const order = await agent.post('/api/orders').set('Idempotency-Key', key()).send(orderBody(productId, 3));
    expect(await stockOf(productId)).toEqual({ available: 2, reserved: 3 });

    const responses = await Promise.all(
      Array.from({ length: 10 }, () =>
        agent.patch(`/api/orders/${order.body.data.id}/status`).send({ status: 'CANCELLED', reason: 'race' }),
      ),
    );
    expect(responses.filter((r) => r.status === 200)).toHaveLength(1);
    expect(responses.filter((r) => r.status === 409)).toHaveLength(9);
    expect(await stockOf(productId)).toEqual({ available: 5, reserved: 0 });
  });

  it('concurrent conflicting transitions: only one wins', async () => {
    const { products } = await createTenant('acme', { products: [{ sku: 'RACE', stock: 5 }] });
    const productId = String(products[0]!._id);
    const agent = await loginAs('manager@acme.test');
    const order = await agent.post('/api/orders').set('Idempotency-Key', key()).send(orderBody(productId, 1));
    const id = order.body.data.id;

    const [confirm, cancel] = await Promise.all([
      agent.patch(`/api/orders/${id}/status`).send({ status: 'CONFIRMED' }),
      agent.patch(`/api/orders/${id}/status`).send({ status: 'CANCELLED' }),
    ]);
    const statuses = [confirm.status, cancel.status].sort();
    // Either both apply in sequence (PENDING→CONFIRMED→CANCELLED is legal) or one loses; never a torn state.
    const final = await Order.findById(id).lean();
    const stock = await stockOf(productId);
    if (final!.status === 'CANCELLED') expect(stock).toEqual({ available: 5, reserved: 0 });
    else expect(stock).toEqual({ available: 4, reserved: 1 });
    expect(statuses.every((s) => s === 200 || s === 409)).toBe(true);
    expect(final!.statusHistory.length).toBe(1 + statuses.filter((s) => s === 200).length);
  });
});
