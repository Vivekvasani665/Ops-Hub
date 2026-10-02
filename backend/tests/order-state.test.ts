import { beforeEach, describe, expect, it } from 'vitest';
import { ORDER_STATUSES, canTransition, type OrderStatus } from '@shared';
import { AuditLog } from '../src/modules/audit/audit.model';
import { Job } from '../src/modules/jobs/job.model';
import { createTenant, key, loginAs, orderBody, resetDb, stockOf } from './helpers';

beforeEach(resetDb);

describe('order state machine (pure)', () => {
  const allowed: [OrderStatus, OrderStatus][] = [
    ['PENDING', 'CONFIRMED'],
    ['PENDING', 'CANCELLED'],
    ['CONFIRMED', 'PROCESSING'],
    ['CONFIRMED', 'CANCELLED'],
    ['PROCESSING', 'SHIPPED'],
    ['PROCESSING', 'CANCELLED'],
    ['SHIPPED', 'DELIVERED'],
  ];

  it('allows exactly the documented transitions', () => {
    for (const from of ORDER_STATUSES) {
      for (const to of ORDER_STATUSES) {
        const expected = allowed.some(([f, t]) => f === from && t === to);
        expect(canTransition(from, to), `${from} → ${to}`).toBe(expected);
      }
    }
  });
});

describe('order lifecycle via API', () => {
  async function setup() {
    const { products } = await createTenant('acme', { products: [{ sku: 'LIFE', stock: 10 }] });
    const productId = String(products[0]!._id);
    const agent = await loginAs('manager@acme.test');
    const created = await agent.post('/api/orders').set('Idempotency-Key', key()).send(orderBody(productId, 3));
    const id = created.body.data.id as string;
    const move = (status: OrderStatus, reason?: string) => agent.patch(`/api/orders/${id}/status`).send({ status, reason });
    return { agent, productId, id, created, move };
  }

  it('creates PENDING orders with server-computed totals and reserved stock', async () => {
    const { created, productId } = await setup();
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({ status: 'PENDING', totalAmount: 30_000, allowedTransitions: ['CONFIRMED', 'CANCELLED'] });
    expect(await stockOf(productId)).toEqual({ available: 7, reserved: 3 });
  });

  it('walks the happy path; shipping consumes the reservation', async () => {
    const { move, productId } = await setup();
    for (const s of ['CONFIRMED', 'PROCESSING', 'SHIPPED'] as const) expect((await move(s)).status).toBe(200);
    expect(await stockOf(productId)).toEqual({ available: 7, reserved: 0 });

    const delivered = await move('DELIVERED');
    expect(delivered.body.data.status).toBe('DELIVERED');
    expect(delivered.body.data.allowedTransitions).toEqual([]);
    expect(delivered.body.data.statusHistory.map((h: { to: string }) => h.to)).toEqual([
      'PENDING',
      'CONFIRMED',
      'PROCESSING',
      'SHIPPED',
      'DELIVERED',
    ]);
  });

  it.each([
    ['PENDING', 'DELIVERED'],
    ['PENDING', 'SHIPPED'],
    ['PENDING', 'PENDING'],
  ] as const)('rejects %s → %s', async (_from, to) => {
    const { move } = await setup();
    const res = await move(to);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INVALID_STATUS_TRANSITION');
    expect(res.body.error.details.allowed).toEqual(['CONFIRMED', 'CANCELLED']);
  });

  it('rejects going backwards and cancelling after shipment', async () => {
    const { move } = await setup();
    await move('CONFIRMED');
    await move('PROCESSING');
    await move('SHIPPED');
    expect((await move('CONFIRMED')).status).toBe(409);
    expect((await move('CANCELLED')).status).toBe(409);
    await move('DELIVERED');
    expect((await move('PENDING')).status).toBe(409);
  });

  it('cancelling releases reserved stock and records the reason', async () => {
    const { move, productId } = await setup();
    await move('CONFIRMED');
    const res = await move('CANCELLED', 'Customer changed mind');
    expect(res.status).toBe(200);
    expect(res.body.data.statusHistory.at(-1)).toMatchObject({ from: 'CONFIRMED', to: 'CANCELLED', reason: 'Customer changed mind' });
    expect(await stockOf(productId)).toEqual({ available: 10, reserved: 0 });
  });

  it('writes audit entries and enqueues jobs in the same transaction', async () => {
    const { move, id } = await setup();
    await move('CONFIRMED');
    const actions = (await AuditLog.find({ entityId: id }).lean()).map((a) => a.action).sort();
    expect(actions).toEqual(['INVENTORY_RESERVED', 'ORDER_STATUS_CHANGED']);
    const jobs = (await Job.find({}).lean()).map((j) => j.type).sort();
    expect(jobs).toEqual(['CREATE_ORDER_AUDIT', 'SEND_ORDER_NOTIFICATION', 'SEND_ORDER_NOTIFICATION']);
  });

  it('validates the create payload', async () => {
    const { agent, productId } = await setup();
    const bad = await agent
      .post('/api/orders')
      .set('Idempotency-Key', key())
      .send({ customer: { name: 'X', email: 'not-an-email' }, items: [{ productId, quantity: 0 }] });
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('ignores client-supplied prices and statuses', async () => {
    const { agent, productId } = await setup();
    const res = await agent
      .post('/api/orders')
      .set('Idempotency-Key', key())
      .send({ ...orderBody(productId, 1), totalAmount: 1, status: 'DELIVERED', items: [{ productId, quantity: 1, unitPrice: 1 }] });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ status: 'PENDING', totalAmount: 10_000 });
  });

  it('lists with status filter, order-number search and pagination', async () => {
    const { agent, productId, created, move } = await setup();
    await move('CONFIRMED');
    for (let i = 0; i < 4; i++) await agent.post('/api/orders').set('Idempotency-Key', key()).send(orderBody(productId, 1));

    const page1 = await agent.get('/api/orders?limit=2&page=1');
    expect(page1.body.meta).toMatchObject({ total: 5, totalPages: 3, page: 1 });
    expect(page1.body.data).toHaveLength(2);

    const confirmed = await agent.get('/api/orders?status=CONFIRMED');
    expect(confirmed.body.meta.total).toBe(1);

    const byNumber = await agent.get(`/api/orders?search=%23${created.body.data.orderNumber}`);
    expect(byNumber.body.data.map((o: { id: string }) => o.id)).toEqual([created.body.data.id]);
  });
});
