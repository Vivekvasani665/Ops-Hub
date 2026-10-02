import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { Order } from '../src/modules/orders/order.model';
import { createTenant, key, loginAs, resetDb, stockOf, testServer } from './helpers';

beforeEach(resetDb);

const shipping = {
  fullName: 'Asha Shopper',
  phone: '+91 98765 43210',
  line1: '12 MG Road',
  city: 'Bengaluru',
  state: 'Karnataka',
  postalCode: '560001',
};

async function registerShopper(email = 'asha@example.com') {
  const agent = request.agent(testServer());
  const res = await agent
    .post('/api/storefront/auth/register')
    .send({ name: 'Asha Shopper', email, password: 'Secret123' });
  expect(res.status).toBe(201);
  return agent;
}

describe('customer storefront', () => {
  it('register → browse → checkout creates an order the admin sees, with stock reserved', async () => {
    const { products } = await createTenant('acme', { products: [{ sku: 'SHOP', stock: 5, price: 25_000 }] });
    const productId = String(products[0]!._id);

    const catalog = await request(testServer()).get('/api/storefront/products');
    expect(catalog.status).toBe(200);
    expect(catalog.body.data).toEqual([expect.objectContaining({ id: productId, price: 25_000, available: 5, inStock: true })]);

    const shopper = await registerShopper();
    const placed = await shopper
      .post('/api/storefront/orders')
      .set('Idempotency-Key', key())
      .send({ items: [{ productId, quantity: 2 }], shipping, notes: 'Leave at door' });
    expect(placed.status).toBe(201);
    expect(placed.body.data).toMatchObject({ status: 'PENDING', totalAmount: 50_000, itemCount: 2 });
    expect(await stockOf(productId)).toEqual({ available: 3, reserved: 2 });

    // Existing admin API, untouched, lists the same order.
    const admin = await loginAs('org_admin@acme.test');
    const list = await admin.get('/api/orders');
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0]).toMatchObject({ id: placed.body.data.id, customer: { name: 'Asha Shopper', email: 'asha@example.com' } });
    const detail = await admin.get(`/api/orders/${placed.body.data.id}`);
    expect(detail.body.data.notes).toContain('12 MG Road');
    expect(detail.body.data.notes).toContain('Leave at door');

    const mine = await shopper.get('/api/storefront/orders');
    expect(mine.body.data.map((o: { id: string }) => o.id)).toEqual([placed.body.data.id]);
  });

  it('customers only see their own orders and cannot use the staff API', async () => {
    const { products } = await createTenant('acme', { products: [{ sku: 'OWN', stock: 10 }] });
    const productId = String(products[0]!._id);
    const a = await registerShopper('a@example.com');
    const b = await registerShopper('b@example.com');

    const placed = await a
      .post('/api/storefront/orders')
      .set('Idempotency-Key', key())
      .send({ items: [{ productId, quantity: 1 }], shipping });
    expect(placed.status).toBe(201);

    expect((await b.get('/api/storefront/orders')).body.data).toHaveLength(0);
    expect((await b.get(`/api/storefront/orders/${placed.body.data.id}`)).status).toBe(404);
    expect((await a.get('/api/orders')).status).toBe(401);
  });

  it('rejects unauthenticated checkout, duplicate emails and oversold stock', async () => {
    const { products } = await createTenant('acme', { products: [{ sku: 'LIMIT', stock: 1 }] });
    const productId = String(products[0]!._id);
    const body = { items: [{ productId, quantity: 2 }], shipping };

    const anon = await request(testServer()).post('/api/storefront/orders').set('Idempotency-Key', key()).send(body);
    expect(anon.status).toBe(401);

    const shopper = await registerShopper();
    const dup = await request(testServer())
      .post('/api/storefront/auth/register')
      .send({ name: 'Again', email: 'asha@example.com', password: 'Secret123' });
    expect(dup.status).toBe(409);

    const oversold = await shopper.post('/api/storefront/orders').set('Idempotency-Key', key()).send(body);
    expect(oversold.status).toBe(409);
    expect(oversold.body.error.code).toBe('INSUFFICIENT_STOCK');
    expect(await Order.countDocuments()).toBe(0);
  });

  it('login, me and logout round-trip', async () => {
    await createTenant('acme');
    await registerShopper();
    const agent = request.agent(testServer());
    expect((await agent.post('/api/storefront/auth/login').send({ email: 'asha@example.com', password: 'nope' })).status).toBe(401);
    expect((await agent.post('/api/storefront/auth/login').send({ email: 'asha@example.com', password: 'Secret123' })).status).toBe(200);
    expect((await agent.get('/api/storefront/auth/me')).body.data.customer.email).toBe('asha@example.com');
    expect((await agent.post('/api/storefront/auth/refresh')).status).toBe(200);
    await agent.post('/api/storefront/auth/logout');
    expect((await agent.get('/api/storefront/auth/me')).status).toBe(401);
  });

  it('filters the catalog by categories, price range and stock, and sorts by price', async () => {
    await createTenant('acme', {
      products: [
        { sku: 'CHEAP', stock: 3, price: 50_000 },
        { sku: 'MID', stock: 0, price: 150_000 },
        { sku: 'DEAR', stock: 2, price: 900_000 },
      ],
    });
    const get = (q: string) => request(testServer()).get(`/api/storefront/products?${q}`).then((r) => r.body.data.map((p: { sku: string }) => p.sku));

    expect(await get('sort=price_desc')).toEqual(['DEAR', 'MID', 'CHEAP']);
    expect(await get('minPrice=1000&maxPrice=5000&sort=price_asc')).toEqual(['MID']); // rupees
    expect(await get('inStock=true&sort=price_asc')).toEqual(['CHEAP', 'DEAR']);
    expect(await get('inStock=true&maxPrice=1000')).toEqual(['CHEAP']);
    expect(await get('category=Test,Other&sort=price_asc')).toEqual(['CHEAP', 'MID', 'DEAR']);
    expect(await get('category=Other')).toEqual([]);
  });
});
