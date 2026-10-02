import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { AuditLog } from '../src/modules/audit/audit.model';
import { Media } from '../src/modules/media/media.model';
import { Product } from '../src/modules/products/product.model';
import { createTenant, key, loginAs, orderBody, resetDb, testServer } from './helpers';

beforeEach(resetDb);

// Smallest valid PNG (1×1, transparent).
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

describe('product management', () => {
  it('creates with image and description, reads, edits and deletes a product', async () => {
    await createTenant('acme');
    const admin = await loginAs('org_admin@acme.test');

    const upload = await admin.post('/api/media').set('Content-Type', 'image/png').send(PNG);
    expect(upload.status).toBe(201);
    expect(upload.body.data.url).toMatch(/^\/api\/storefront\/media\/[a-f0-9]{24}$/);
    const image = await request(testServer()).get(upload.body.data.url);
    expect(image.status).toBe(200);
    expect(image.headers['content-type']).toBe('image/png');
    expect(Buffer.compare(image.body as Buffer, PNG)).toBe(0);

    const created = await admin.post('/api/products').send({
      name: 'Wireless Headphones',
      sku: 'wh-001',
      category: 'Electronics',
      price: 249_900,
      initialStock: 25,
      imageUrl: upload.body.data.url,
      description: 'Deep bass',
    });
    expect(created.status).toBe(201);
    const id = created.body.data.id;
    expect(created.body.data).toMatchObject({ sku: 'WH-001', imageUrl: upload.body.data.url, description: 'Deep bass', isActive: true });

    const read = await admin.get(`/api/products/${id}`);
    expect(read.body.data.inventory).toEqual({ available: 25, reserved: 0, reorderLevel: 5 });

    const edited = await admin.patch(`/api/products/${id}`).send({ name: 'Studio Headphones', price: 199_900, isActive: false, reorderLevel: 3, imageUrl: null });
    expect(edited.status).toBe(200);
    expect(edited.body.data).toMatchObject({ name: 'Studio Headphones', price: 199_900, isActive: false, imageUrl: null });
    expect(edited.body.data.inventory.reorderLevel).toBe(3);
    // The replaced upload is no longer referenced, so it is removed.
    expect(await Media.countDocuments()).toBe(0);
    const audit = await AuditLog.findOne({ action: 'PRODUCT_UPDATED' }).lean();
    expect(audit!.metadata.changed).toEqual(expect.arrayContaining(['name', 'price', 'isActive', 'imageUrl', 'reorderLevel']));

    const removed = await admin.delete(`/api/products/${id}`);
    expect(removed.status).toBe(200);
    expect((await admin.get(`/api/products/${id}`)).status).toBe(404);
  });

  it('filters and sorts the list', async () => {
    await createTenant('acme', { products: [{ sku: 'A', price: 300, stock: 1 }, { sku: 'B', price: 100, stock: 1 }, { sku: 'C', price: 200, stock: 1 }] });
    await Product.updateOne({ sku: 'B' }, { $set: { category: 'Shoes', isActive: false } });
    const admin = await loginAs('viewer@acme.test');
    const byPrice = await admin.get('/api/products?sort=price_desc');
    expect(byPrice.body.data.map((p: { sku: string }) => p.sku)).toEqual(['A', 'C', 'B']);
    const shoes = await admin.get('/api/products?category=shoes');
    expect(shoes.body.data.map((p: { sku: string }) => p.sku)).toEqual(['B']);
    const active = await admin.get('/api/products?status=active');
    expect(active.body.meta.total).toBe(2);
  });

  it('refuses to delete a product with reserved stock, and blocks viewers from writing', async () => {
    const { products } = await createTenant('acme');
    const productId = String(products[0]!._id);
    const manager = await loginAs('manager@acme.test');
    await manager.post('/api/orders').set('Idempotency-Key', key()).send(orderBody(productId, 2));
    const res = await manager.delete(`/api/products/${productId}`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('PRODUCT_HAS_RESERVATIONS');

    const viewer = await loginAs('viewer@acme.test');
    expect((await viewer.patch(`/api/products/${productId}`).send({ price: 1 })).status).toBe(403);
    expect((await viewer.post('/api/media').set('Content-Type', 'image/png').send(PNG)).status).toBe(403);
  });

  it('rejects uploads that are not images and image URLs that are not ours or http(s)', async () => {
    await createTenant('acme');
    const admin = await loginAs('org_admin@acme.test');
    const bad = await admin.post('/api/media').set('Content-Type', 'image/png').send(Buffer.from('<svg onload=alert(1)>'));
    expect(bad.status).toBe(415);
    const js = await admin.post('/api/products').send({ name: 'X1', sku: 'X1', category: 'Misc', price: 1, imageUrl: 'javascript:alert(1)' });
    expect(js.status).toBe(400);
  });
});

describe('categories', () => {
  it('lists categories from products, creates, renames (moving products) and deletes only when empty', async () => {
    await createTenant('acme', { products: [{ sku: 'T1', stock: 1 }, { sku: 'T2', stock: 1 }] });
    const admin = await loginAs('org_admin@acme.test');

    const list = await admin.get('/api/categories');
    expect(list.body.data).toEqual([expect.objectContaining({ name: 'Test', productCount: 2, activeProductCount: 2 })]);
    const testId = list.body.data[0].id;

    const created = await admin.post('/api/categories').send({ name: 'Bags' });
    expect(created.status).toBe(201);
    expect((await admin.post('/api/categories').send({ name: 'bags' })).body.error.code).toBe('DUPLICATE_CATEGORY');

    const renamed = await admin.patch(`/api/categories/${testId}`).send({ name: 'Gadgets' });
    expect(renamed.status).toBe(200);
    expect(renamed.body.meta.productsMoved).toBe(2);
    expect(await Product.countDocuments({ category: 'Gadgets' })).toBe(2);

    const inUse = await admin.delete(`/api/categories/${testId}`);
    expect(inUse.status).toBe(409);
    expect(inUse.body.error.code).toBe('CATEGORY_IN_USE');
    expect((await admin.delete(`/api/categories/${created.body.data.id}`)).status).toBe(200);
  });

  it("never shows another tenant's categories", async () => {
    await createTenant('acme');
    await createTenant('globex');
    const acme = await loginAs('org_admin@acme.test');
    const created = await acme.post('/api/categories').send({ name: 'Secret' });
    const globex = await loginAs('org_admin@globex.test');
    const list = await globex.get('/api/categories');
    expect(list.body.data.map((c: { name: string }) => c.name)).not.toContain('Secret');
    expect((await globex.delete(`/api/categories/${created.body.data.id}`)).status).toBe(404);
  });
});

describe('customers', () => {
  it('lists storefront customers with their order totals', async () => {
    const { products } = await createTenant('acme', { products: [{ sku: 'SHOP', stock: 5, price: 25_000 }] });
    const shopper = request.agent(testServer());
    await shopper.post('/api/storefront/auth/register').send({ name: 'Asha Shopper', email: 'asha@example.com', password: 'Secret123' });
    await shopper
      .post('/api/storefront/orders')
      .set('Idempotency-Key', key())
      .send({
        items: [{ productId: String(products[0]!._id), quantity: 2 }],
        shipping: { fullName: 'Asha', phone: '+91 98765 43210', line1: '12 MG Road', city: 'Bengaluru', state: 'KA', postalCode: '560001' },
      });

    const viewer = await loginAs('viewer@acme.test');
    const res = await viewer.get('/api/customers?search=ash');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([expect.objectContaining({ email: 'asha@example.com', orderCount: 1, totalSpent: 50_000 })]);
    expect(res.body.meta.total).toBe(1);
  });
});

describe('coupons', () => {
  it('creates, validates, lists, updates and deletes coupons', async () => {
    await createTenant('acme');
    const manager = await loginAs('manager@acme.test');
    const created = await manager.post('/api/coupons').send({ code: 'welcome10', type: 'PERCENT', value: 10, maxDiscount: 50_000 });
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({ code: 'WELCOME10', usedCount: 0, isActive: true });

    expect((await manager.post('/api/coupons').send({ code: 'TOO-MUCH', type: 'PERCENT', value: 150 })).status).toBe(400);
    expect((await manager.post('/api/coupons').send({ code: 'WELCOME10', type: 'FIXED', value: 100 })).body.error.code).toBe('DUPLICATE_COUPON');

    const id = created.body.data.id;
    const updated = await manager.patch(`/api/coupons/${id}`).send({ code: 'WELCOME10', type: 'FIXED', value: 10_000, maxDiscount: 5, isActive: false });
    expect(updated.body.data).toMatchObject({ type: 'FIXED', value: 10_000, maxDiscount: null, isActive: false });
    expect((await manager.get('/api/coupons?status=inactive')).body.meta.total).toBe(1);
    expect((await manager.get('/api/coupons?status=active')).body.meta.total).toBe(0);

    const viewer = await loginAs('viewer@acme.test');
    expect((await viewer.get('/api/coupons')).status).toBe(200);
    expect((await viewer.delete(`/api/coupons/${id}`)).status).toBe(403);
    expect((await manager.delete(`/api/coupons/${id}`)).status).toBe(200);
  });
});

describe('dashboard totals', () => {
  it('reports all-time revenue, products and customers, and a 30-day trend on request', async () => {
    const { products } = await createTenant('acme', { products: [{ sku: 'A', stock: 10, price: 10_000 }] });
    const admin = await loginAs('org_admin@acme.test');
    await admin.post('/api/orders').set('Idempotency-Key', key()).send(orderBody(String(products[0]!._id), 3));
    const week = await admin.get('/api/dashboard/summary');
    expect(week.body.data).toMatchObject({ totalRevenue: 30_000, totalProducts: 1, totalCustomers: 0, rangeDays: 7 });
    expect(week.body.data.trend).toHaveLength(7);
    const month = await admin.get('/api/dashboard/summary?days=30');
    expect(month.body.data.trend).toHaveLength(30);
    expect(month.body.data.ordersToday).toBe(1);
  });
});
