import { beforeEach, describe, expect, it } from 'vitest';
import { Order } from '../src/modules/orders/order.model';
import { Inventory } from '../src/modules/inventory/inventory.model';
import { createTenant, key, loginAs, orderBody, resetDb, stockOf } from './helpers';

beforeEach(resetDb);

describe('idempotent order creation', () => {
  it('a retried request with the same key returns the original order and reserves stock once', async () => {
    const { products } = await createTenant('acme', { products: [{ sku: 'IDEM', stock: 10 }] });
    const productId = String(products[0]!._id);
    const agent = await loginAs('operator@acme.test');
    const k = key();

    const first = await agent.post('/api/orders').set('Idempotency-Key', k).send(orderBody(productId, 2));
    const retry = await agent.post('/api/orders').set('Idempotency-Key', k).send(orderBody(productId, 2));

    expect(first.status).toBe(201);
    expect(retry.status).toBe(201);
    expect(retry.headers['idempotent-replayed']).toBe('true');
    expect(retry.body.data.id).toBe(first.body.data.id);
    expect(await Order.countDocuments()).toBe(1);
    expect(await stockOf(productId)).toEqual({ available: 8, reserved: 2 });
  });

  it('concurrent duplicates with one key create exactly one order', async () => {
    const { products } = await createTenant('acme', { products: [{ sku: 'DUP', stock: 10 }] });
    const productId = String(products[0]!._id);
    const agent = await loginAs('operator@acme.test');
    const k = key();

    const responses = await Promise.all(
      Array.from({ length: 15 }, () => agent.post('/api/orders').set('Idempotency-Key', k).send(orderBody(productId, 1))),
    );

    expect(await Order.countDocuments()).toBe(1);
    expect(await stockOf(productId)).toEqual({ available: 9, reserved: 1 });
    const ids = new Set(responses.filter((r) => r.status === 201).map((r) => r.body.data.id));
    expect(ids.size).toBe(1);
    // Losers either replayed the stored result or were told the original is still in flight.
    for (const r of responses) {
      expect([201, 409]).toContain(r.status);
      if (r.status === 409) expect(r.body.error.code).toBe('IDEMPOTENCY_IN_PROGRESS');
    }
  });

  it('reusing a key with a different body is rejected', async () => {
    const { products } = await createTenant('acme', { products: [{ sku: 'MISMATCH', stock: 10 }] });
    const productId = String(products[0]!._id);
    const agent = await loginAs('operator@acme.test');
    const k = key();

    await agent.post('/api/orders').set('Idempotency-Key', k).send(orderBody(productId, 1));
    const res = await agent.post('/api/orders').set('Idempotency-Key', k).send(orderBody(productId, 5));

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('IDEMPOTENCY_KEY_MISMATCH');
    expect(await Order.countDocuments()).toBe(1);
  });

  it('requires the Idempotency-Key header', async () => {
    const { products } = await createTenant('acme');
    const agent = await loginAs('operator@acme.test');
    const res = await agent.post('/api/orders').send(orderBody(String(products[0]!._id)));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
  });

  it('does not cache a retryable failure: same key succeeds after restock', async () => {
    const { products } = await createTenant('acme', { products: [{ sku: 'RESTOCK', stock: 0 }] });
    const productId = String(products[0]!._id);
    const agent = await loginAs('operator@acme.test');
    const k = key();

    const fail = await agent.post('/api/orders').set('Idempotency-Key', k).send(orderBody(productId, 1));
    expect(fail.status).toBe(409);

    await Inventory.updateOne({ productId }, { $set: { available: 3 } });
    const ok = await agent.post('/api/orders').set('Idempotency-Key', k).send(orderBody(productId, 1));
    expect(ok.status).toBe(201);
    expect(ok.headers['idempotent-replayed']).toBeUndefined();
  });

  it('keys are scoped per tenant', async () => {
    const a = await createTenant('acme', { products: [{ sku: 'A1', stock: 5 }] });
    const b = await createTenant('globex', { products: [{ sku: 'B1', stock: 5 }] });
    const k = key();

    const ra = await (await loginAs('operator@acme.test'))
      .post('/api/orders')
      .set('Idempotency-Key', k)
      .send(orderBody(String(a.products[0]!._id)));
    const rb = await (await loginAs('operator@globex.test'))
      .post('/api/orders')
      .set('Idempotency-Key', k)
      .send(orderBody(String(b.products[0]!._id)));

    expect(ra.status).toBe(201);
    expect(rb.status).toBe(201);
    expect(rb.body.data.id).not.toBe(ra.body.data.id);
  });
});
