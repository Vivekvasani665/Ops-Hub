import { beforeEach, describe, expect, it } from 'vitest';
import { AuditLog } from '../src/modules/audit/audit.model';
import { recordAudit } from '../src/modules/audit/audit.service';
import { createTenant, key, loginAs, orderBody, resetDb } from './helpers';

beforeEach(resetDb);

describe('audit logs', () => {
  it('are append-only at the model layer', async () => {
    const { org } = await createTenant('acme');
    const doc = await recordAudit({ organizationId: org._id, actor: null, action: 'PRODUCT_CREATED', entityType: 'PRODUCT' });
    await expect(AuditLog.updateOne({ _id: doc!._id }, { $set: { action: 'ORDER_CREATED' } })).rejects.toThrow(/append-only/);
    await expect(AuditLog.deleteOne({ _id: doc!._id })).rejects.toThrow(/append-only/);
    await expect(AuditLog.findOneAndUpdate({ _id: doc!._id }, { $set: { metadata: {} } })).rejects.toThrow(/append-only/);
    expect(await AuditLog.countDocuments()).toBe(1);
  });

  it('cursor pagination walks every entry exactly once, newest first', async () => {
    const { org } = await createTenant('acme');
    const base = Date.now();
    // Same timestamp for several rows exercises the _id tie-breaker.
    await AuditLog.collection.insertMany(
      Array.from({ length: 23 }, (_, i) => ({
        organizationId: org._id,
        action: 'PRODUCT_CREATED',
        entityType: 'PRODUCT',
        metadata: { i },
        createdAt: new Date(base - Math.floor(i / 4) * 1000),
      })),
    );
    const agent = await loginAs('org_admin@acme.test');
    const seen: string[] = [];
    let cursor: string | null = null;
    do {
      const res = await agent.get('/api/audit-logs').query({ limit: 5, action: 'PRODUCT_CREATED', ...(cursor ? { cursor } : {}) });
      expect(res.status).toBe(200);
      seen.push(...res.body.data.map((d: { id: string }) => d.id));
      cursor = res.body.meta.nextCursor;
    } while (cursor);
    expect(seen).toHaveLength(23);
    expect(new Set(seen).size).toBe(23);
  });

  it('filters by action and entity', async () => {
    const { products } = await createTenant('acme');
    const agent = await loginAs('manager@acme.test');
    const order = await agent.post('/api/orders').set('Idempotency-Key', key()).send(orderBody(String(products[0]!._id)));
    const res = await agent.get('/api/audit-logs').query({ entityType: 'ORDER', entityId: order.body.data.id });
    expect(res.body.data.map((a: { action: string }) => a.action)).toEqual(['INVENTORY_RESERVED']);
    expect((await agent.get('/api/audit-logs').query({ action: 'NOPE' })).status).toBe(400);
  });
});

describe('dashboard summary', () => {
  it('aggregates counts, revenue and stock alerts for the tenant', async () => {
    const { products } = await createTenant('acme', {
      products: [
        { sku: 'A', stock: 20, price: 50_000, reorderLevel: 2 },
        { sku: 'LOW', stock: 3, reorderLevel: 5 },
        { sku: 'OUT', stock: 0 },
      ],
    });
    const agent = await loginAs('manager@acme.test');
    const create = (q: number) =>
      agent.post('/api/orders').set('Idempotency-Key', key()).send(orderBody(String(products[0]!._id), q));
    const o1 = await create(1);
    await create(2);
    const o3 = await create(1);
    await agent.patch(`/api/orders/${o1.body.data.id}/status`).send({ status: 'CONFIRMED' });
    await agent.patch(`/api/orders/${o3.body.data.id}/status`).send({ status: 'CANCELLED' });

    const res = await agent.get('/api/dashboard/summary');
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      ordersToday: 3,
      pendingOrders: 1,
      cancelledOrders: 1,
      totalOrders: 3,
      revenueToday: 150_000, // cancelled order excluded
      lowStockProducts: 1,
      outOfStockProducts: 1,
      statusDistribution: { PENDING: 1, CONFIRMED: 1, CANCELLED: 1, PROCESSING: 0 },
    });
    expect(res.body.data.trend).toHaveLength(7);
    expect(res.body.data.trend[6].orders).toBe(3);
  });
});
