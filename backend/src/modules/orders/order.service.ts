import { Types, type FilterQuery } from 'mongoose';
import {
  hasPermission,
  type CreateOrderInput,
  type OrderDto,
  type OrderListItemDto,
  type OrderStatus,
  type PageMeta,
  type Role,
  type UpdateOrderStatusInput,
} from '@shared';
import { Errors } from '../../utils/errors';
import { withTransaction } from '../../utils/transaction';
import { escapeRegex, pageMeta } from '../../utils/http';
import { emitToOrg } from '../../realtime/emitter';
import { recordAudit, toAuditDto } from '../audit/audit.service';
import { enqueueJob } from '../jobs/job.service';
import { Product } from '../products/product.model';
import { consumeReservedStock, releaseStock, reserveStock } from '../inventory/inventory.service';
import { Counter, Order, type OrderDoc } from './order.model';
import { toOrderDto, toOrderListItemDto } from './order.mapper';
import { assertTransition, inventoryEffect, permissionForTransition } from './order.state-machine';

export interface RequestContext {
  organizationId: Types.ObjectId;
  actor: { id: Types.ObjectId; name: string };
  role: Role;
  ip?: string;
}

const ORDER_NUMBER_OFFSET = 1000;

type AuditDoc = NonNullable<Awaited<ReturnType<typeof recordAudit>>>;

function emitAudits(orgId: Types.ObjectId, docs: (AuditDoc | null)[]) {
  for (const doc of docs) if (doc) emitToOrg(orgId, 'audit:created', { log: toAuditDto(doc) });
}

/**
 * Create order — one MongoDB transaction:
 *   load products (tenant-scoped) → reserve stock (conditional $inc per row) → allocate order number
 *   → insert order → audit inventory reservation → enqueue notification + audit jobs (outbox).
 * Anything that throws rolls the whole thing back, so stock is never reserved for an order that
 * does not exist, and a job never exists for an order that was not committed.
 */
export async function createOrder(ctx: RequestContext, input: CreateOrderInput): Promise<OrderDto> {
  const { organizationId: orgId } = ctx;
  const productIds = input.items.map((i) => new Types.ObjectId(i.productId));

  const { order, audits, stock } = await withTransaction(async (session) => {
    const products = await Product.find(
      { _id: { $in: productIds }, organizationId: orgId, isActive: true },
      null,
      { session },
    ).lean();
    const byId = new Map(products.map((p) => [String(p._id), p]));
    const missing = input.items.filter((i) => !byId.has(i.productId)).map((i) => i.productId);
    // Another tenant's product id is indistinguishable from a non-existent one.
    if (missing.length) throw Errors.validation({ fieldErrors: { items: [`Unknown product(s): ${missing.join(', ')}`] } });

    const lines = input.items.map((i) => {
      const p = byId.get(i.productId)!;
      return {
        productId: p._id,
        name: p.name,
        sku: p.sku,
        unitPrice: p.price,
        quantity: i.quantity,
        lineTotal: p.price * i.quantity,
      };
    });

    const stock = await reserveStock(orgId, lines, session);

    // Allocated after the reservation so rejected orders never touch the hot counter document.
    const counter = await Counter.findOneAndUpdate(
      { organizationId: orgId, name: 'order' },
      { $inc: { seq: 1 } },
      { upsert: true, new: true, session },
    );
    const orderNumber = ORDER_NUMBER_OFFSET + counter.seq;
    const now = new Date();

    const [order] = await Order.create(
      [
        {
          organizationId: orgId,
          orderNumber,
          customer: { name: input.customer.name, email: input.customer.email, nameLower: input.customer.name.toLowerCase() },
          items: lines,
          totalAmount: lines.reduce((sum, l) => sum + l.lineTotal, 0),
          status: 'PENDING',
          notes: input.notes,
          statusHistory: [{ from: null, to: 'PENDING', changedBy: ctx.actor, at: now }],
          createdBy: ctx.actor,
        },
      ],
      { session },
    );

    const audit = await recordAudit(
      {
        organizationId: orgId,
        actor: ctx.actor,
        action: 'INVENTORY_RESERVED',
        entityType: 'ORDER',
        entityId: order._id,
        metadata: {
          orderNumber,
          items: lines.map((l) => ({ productId: String(l.productId), name: l.name, sku: l.sku, quantity: l.quantity })),
        },
        ip: ctx.ip,
      },
      session,
    );

    const lowStock = stock
      .filter((s) => s.available <= s.reorderLevel)
      .map((s) => {
        const line = lines.find((l) => String(l.productId) === String(s.productId))!;
        return { productId: String(s.productId), name: line.name, sku: line.sku, available: s.available };
      });

    await enqueueJob(
      {
        type: 'CREATE_ORDER_AUDIT',
        organizationId: orgId,
        payload: {
          orderId: String(order._id),
          orderNumber,
          customerName: input.customer.name,
          totalAmount: order.totalAmount,
          itemCount: lines.reduce((n, l) => n + l.quantity, 0),
          actor: { id: String(ctx.actor.id), name: ctx.actor.name },
          ip: ctx.ip,
        },
        dedupeKey: `order-audit:${order._id}`,
      },
      session,
    );
    await enqueueJob(
      {
        type: 'SEND_ORDER_NOTIFICATION',
        organizationId: orgId,
        payload: {
          event: 'created',
          orderId: String(order._id),
          orderNumber,
          customerName: input.customer.name,
          totalAmount: order.totalAmount,
          lowStock,
        },
      },
      session,
    );

    return { order, audits: [audit], stock };
  });

  // Side effects that must only happen after commit.
  emitAudits(orgId, audits);
  emitToOrg(orgId, 'order:created', { order: toOrderListItemDto(order) });
  for (const s of stock) {
    emitToOrg(orgId, 'inventory:updated', { productId: String(s.productId), available: s.available, reserved: s.reserved });
  }
  return toOrderDto(order.toObject());
}

/**
 * Status change — transition validated server-side, inventory side effect (release on cancel,
 * consume on ship) and audit in the same transaction. The update is conditional on the status we
 * read, so two operators racing on the same order cannot both apply a transition.
 */
export async function updateOrderStatus(
  ctx: RequestContext,
  orderId: Types.ObjectId,
  input: UpdateOrderStatusInput,
): Promise<OrderDto> {
  const { organizationId: orgId } = ctx;
  if (!hasPermission(ctx.role, permissionForTransition(input.status))) throw Errors.forbidden();

  const { order, from, audits, stock } = await withTransaction(async (session) => {
    const current = await Order.findOne({ _id: orderId, organizationId: orgId }, null, { session }).lean();
    if (!current) throw Errors.notFound('Order');
    const from = current.status as OrderStatus;
    assertTransition(from, input.status);

    const order = await Order.findOneAndUpdate(
      { _id: orderId, organizationId: orgId, status: from },
      {
        $set: { status: input.status },
        $push: {
          statusHistory: { from, to: input.status, changedBy: ctx.actor, reason: input.reason, at: new Date() },
        },
      },
      { new: true, session },
    );
    if (!order) throw Errors.conflict('CONCURRENT_MODIFICATION', 'Order was modified by someone else, reload and retry');

    const lines = current.items.map((i) => ({ productId: i.productId, quantity: i.quantity, sku: i.sku }));
    const effect = inventoryEffect(input.status);
    const stock =
      effect === 'release'
        ? await releaseStock(orgId, lines, session)
        : effect === 'consume'
          ? await consumeReservedStock(orgId, lines, session)
          : [];

    const meta = { orderNumber: current.orderNumber, customerName: current.customer.name, from, to: input.status };
    const audits = [
      await recordAudit(
        {
          organizationId: orgId,
          actor: ctx.actor,
          action: input.status === 'CANCELLED' ? 'ORDER_CANCELLED' : 'ORDER_STATUS_CHANGED',
          entityType: 'ORDER',
          entityId: orderId,
          metadata: { ...meta, ...(input.reason ? { reason: input.reason } : {}) },
          ip: ctx.ip,
        },
        session,
      ),
    ];
    if (effect === 'release') {
      audits.push(
        await recordAudit(
          {
            organizationId: orgId,
            actor: ctx.actor,
            action: 'INVENTORY_RELEASED',
            entityType: 'ORDER',
            entityId: orderId,
            metadata: {
              orderNumber: current.orderNumber,
              items: current.items.map((i) => ({ productId: String(i.productId), name: i.name, sku: i.sku, quantity: i.quantity })),
            },
            ip: ctx.ip,
          },
          session,
        ),
      );
    }

    await enqueueJob(
      {
        type: 'SEND_ORDER_NOTIFICATION',
        organizationId: orgId,
        payload: { event: 'status_changed', orderId: String(orderId), ...meta, totalAmount: current.totalAmount },
      },
      session,
    );
    return { order, from, audits, stock };
  });

  emitAudits(orgId, audits);
  emitToOrg(orgId, 'order:updated', { order: toOrderListItemDto(order), from, to: input.status });
  for (const s of stock) {
    emitToOrg(orgId, 'inventory:updated', { productId: String(s.productId), available: s.available, reserved: s.reserved });
  }
  return toOrderDto(order.toObject());
}

export async function getOrder(orgId: Types.ObjectId, orderId: Types.ObjectId): Promise<OrderDto> {
  // Tenant filter is part of the lookup: another org's order id is simply "not found".
  const order = await Order.findOne({ _id: orderId, organizationId: orgId }).lean();
  if (!order) throw Errors.notFound('Order');
  return toOrderDto(order);
}

/**
 * Pagination totals: the page itself is an O(limit) index walk, but an exact count is an O(n) COUNT_SCAN
 * (~50ms at 100k orders, much worse under concurrency). Totals per (tenant, filter) are shared by
 * concurrent requests and reused briefly; the rows themselves are never cached.
 */
const COUNT_TTL_MS = process.env.NODE_ENV === 'test' ? 0 : 5_000;
const countCache = new Map<string, { at: number; value: Promise<number> }>();

function cachedCount(filter: FilterQuery<OrderDoc>): Promise<number> {
  const key = JSON.stringify(filter);
  const hit = countCache.get(key);
  if (hit && Date.now() - hit.at < COUNT_TTL_MS) return hit.value;
  const value = Order.countDocuments(filter).exec();
  countCache.set(key, { at: Date.now(), value });
  value.catch(() => countCache.delete(key));
  if (countCache.size > 1000) countCache.delete(countCache.keys().next().value!);
  return value;
}

export interface ListOrdersQuery {
  page: number;
  limit: number;
  skip: number;
  status?: OrderStatus;
  search?: string;
  from?: Date;
  to?: Date;
}

export async function listOrders(
  orgId: Types.ObjectId,
  q: ListOrdersQuery,
): Promise<{ data: OrderListItemDto[]; meta: PageMeta }> {
  const filter: FilterQuery<OrderDoc> = { organizationId: orgId };
  if (q.status) filter.status = q.status;
  if (q.from || q.to) filter.createdAt = { ...(q.from && { $gte: q.from }), ...(q.to && { $lte: q.to }) };

  if (q.search) {
    const s = q.search.trim();
    const asNumber = /^#?\d+$/.test(s) ? Number(s.replace('#', '')) : null;
    if (asNumber !== null) {
      filter.orderNumber = asNumber;
    } else {
      // Anchored, case-normalised prefixes so the {org, customer.nameLower} / {org, customer.email} indexes apply.
      const rx = `^${escapeRegex(s.toLowerCase())}`;
      filter.$or = [{ 'customer.nameLower': { $regex: rx } }, { 'customer.email': { $regex: rx } }];
    }
  }

  const [docs, total] = await Promise.all([
    Order.find(filter)
      .select({ orderNumber: 1, customer: 1, 'items.quantity': 1, totalAmount: 1, status: 1, createdAt: 1 })
      .sort({ createdAt: -1, _id: -1 })
      .skip(q.skip)
      .limit(q.limit)
      .lean(),
    cachedCount(filter),
  ]);

  return { data: docs.map((d) => toOrderListItemDto(d)), meta: pageMeta(q.page, q.limit, total) };
}
