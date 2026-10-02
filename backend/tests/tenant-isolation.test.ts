import { beforeEach, describe, expect, it } from 'vitest';
import { createSuperAdmin, createTenant, key, loginAs, orderBody, resetDb, stockOf } from './helpers';

beforeEach(resetDb);

async function twoTenants() {
  const acme = await createTenant('acme', { products: [{ sku: 'ACME-1', stock: 10 }] });
  const globex = await createTenant('globex', { products: [{ sku: 'GLOBEX-1', stock: 10 }] });
  const acmeAgent = await loginAs('org_admin@acme.test');
  const globexAgent = await loginAs('org_admin@globex.test');
  const acmeOrder = await acmeAgent
    .post('/api/orders')
    .set('Idempotency-Key', key())
    .send(orderBody(String(acme.products[0]!._id), 1));
  return { acme, globex, acmeAgent, globexAgent, acmeOrderId: acmeOrder.body.data.id as string };
}

describe('tenant isolation', () => {
  it("cannot read another tenant's order by id (404, not 403, so ids are not confirmed)", async () => {
    const { globexAgent, acmeOrderId } = await twoTenants();
    const res = await globexAgent.get(`/api/orders/${acmeOrderId}`);
    expect(res.status).toBe(404);
  });

  it("never lists another tenant's orders, even when searching for them", async () => {
    const { globexAgent, acmeAgent } = await twoTenants();
    const own = await acmeAgent.get('/api/orders');
    const other = await globexAgent.get('/api/orders?search=test');
    expect(own.body.meta.total).toBe(1);
    expect(other.body.meta.total).toBe(0);
  });

  it("cannot change another tenant's order status", async () => {
    const { globexAgent, acmeOrderId } = await twoTenants();
    const res = await globexAgent.patch(`/api/orders/${acmeOrderId}/status`).send({ status: 'CANCELLED' });
    expect(res.status).toBe(404);
  });

  it("cannot order another tenant's product or touch its stock", async () => {
    const { acme, globexAgent } = await twoTenants();
    const acmeProductId = String(acme.products[0]!._id);

    const order = await globexAgent.post('/api/orders').set('Idempotency-Key', key()).send(orderBody(acmeProductId, 1));
    expect(order.status).toBe(400);

    const adjust = await globexAgent.post(`/api/inventory/${acmeProductId}/adjust`).send({ delta: -5, reason: 'steal' });
    expect(adjust.status).toBe(404);
    expect(await stockOf(acmeProductId)).toEqual({ available: 9, reserved: 1 });
  });

  it('scopes inventory, products, audit logs, users and dashboard', async () => {
    const { globexAgent } = await twoTenants();
    const [inv, products, audit, users, dash] = await Promise.all([
      globexAgent.get('/api/inventory'),
      globexAgent.get('/api/products'),
      globexAgent.get('/api/audit-logs'),
      globexAgent.get('/api/users'),
      globexAgent.get('/api/dashboard/summary'),
    ]);
    expect(inv.body.data.map((i: { product: { sku: string } }) => i.product.sku)).toEqual(['GLOBEX-1']);
    expect(products.body.data.map((p: { sku: string }) => p.sku)).toEqual(['GLOBEX-1']);
    expect(audit.body.data.every((a: { action: string }) => a.action === 'USER_LOGGED_IN')).toBe(true);
    expect(users.body.data.every((u: { email: string }) => u.email.endsWith('@globex.test'))).toBe(true);
    expect(dash.body.data.totalOrders).toBe(0);
  });

  it('ignores the X-Organization-Id override for non-super-admins', async () => {
    const { acme, globexAgent } = await twoTenants();
    const res = await globexAgent.get('/api/orders').set('X-Organization-Id', String(acme.org._id));
    expect(res.body.meta.total).toBe(0);
  });

  it('lets a SUPER_ADMIN act on a tenant explicitly via X-Organization-Id', async () => {
    const { acme } = await twoTenants();
    const root = await createSuperAdmin();
    const agent = await loginAs(root.email);
    const res = await agent.get('/api/orders').set('X-Organization-Id', String(acme.org._id));
    expect(res.body.meta.total).toBe(1);
  });
});

describe('RBAC (enforced server-side)', () => {
  it('VIEWER is read-only', async () => {
    const { products } = await createTenant('acme');
    const viewer = await loginAs('viewer@acme.test');
    expect((await viewer.get('/api/orders')).status).toBe(200);
    expect(
      (await viewer.post('/api/orders').set('Idempotency-Key', key()).send(orderBody(String(products[0]!._id)))).status,
    ).toBe(403);
    expect((await viewer.get('/api/audit-logs')).status).toBe(403);
    expect((await viewer.post(`/api/inventory/${products[0]!._id}/adjust`).send({ delta: 1, reason: 'x y z' })).status).toBe(403);
  });

  it('OPERATOR can progress orders but not cancel them', async () => {
    const { products } = await createTenant('acme');
    const operator = await loginAs('operator@acme.test');
    const order = await operator.post('/api/orders').set('Idempotency-Key', key()).send(orderBody(String(products[0]!._id)));
    const id = order.body.data.id;

    expect((await operator.patch(`/api/orders/${id}/status`).send({ status: 'CANCELLED' })).status).toBe(403);
    expect((await operator.patch(`/api/orders/${id}/status`).send({ status: 'CONFIRMED' })).status).toBe(200);
  });

  it('MANAGER can cancel and adjust stock', async () => {
    const { products } = await createTenant('acme');
    const manager = await loginAs('manager@acme.test');
    const order = await manager.post('/api/orders').set('Idempotency-Key', key()).send(orderBody(String(products[0]!._id)));
    expect((await manager.patch(`/api/orders/${order.body.data.id}/status`).send({ status: 'CANCELLED' })).status).toBe(200);
    expect((await manager.post(`/api/inventory/${products[0]!._id}/adjust`).send({ delta: 5, reason: 'restock' })).status).toBe(200);
  });

  it('only ORG_ADMIN can retry jobs', async () => {
    await createTenant('acme');
    const manager = await loginAs('manager@acme.test');
    expect((await manager.post('/api/jobs/64b000000000000000000000/retry')).status).toBe(403);
  });
});
