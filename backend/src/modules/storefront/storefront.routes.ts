import { Router, type CookieOptions, type Request, type Response } from 'express';
import { Types, type FilterQuery } from 'mongoose';
import { env } from '../../config/env';
import { validateBody } from '../../middlewares/validation.middleware';
import { idempotency } from '../../middlewares/idempotency.middleware';
import { apiRateLimit, loginRateLimit } from '../../middlewares/rate-limit.middleware';
import { Errors } from '../../utils/errors';
import { escapeRegex, pageMeta, pagination, parseObjectId, queryString } from '../../utils/http';
import { Inventory } from '../inventory/inventory.model';
import { Product, type ProductDoc } from '../products/product.model';
import { Order, type OrderDoc } from '../orders/order.model';
import { createOrder } from '../orders/order.service';
import * as customerAuth from './customer-auth.service';
import { authenticateCustomer, resolveStore } from './storefront.middleware';
import { checkoutSchema, customerLoginSchema, registerCustomerSchema, type CheckoutInput } from './storefront.schemas';

/**
 * Public API for the customer web storefront (`customer-web/`), mounted at /api/storefront.
 * Orders go through the same `createOrder` service as the admin app, so stock reservation, order numbers,
 * audit, jobs and the live `order:created` event behave identically and the admin sees them immediately.
 */
export const storefrontRouter = Router();
storefrontRouter.use(apiRateLimit, resolveStore);

// ---------- session cookies ----------

const secure = env.NODE_ENV === 'production';
const accessCookie: CookieOptions = {
  httpOnly: true,
  secure,
  sameSite: 'lax',
  path: '/',
  maxAge: env.ACCESS_TOKEN_TTL_SECONDS * 1000,
};
const refreshCookie: CookieOptions = {
  httpOnly: true,
  secure,
  sameSite: 'strict',
  path: '/api/storefront/auth',
  maxAge: env.REFRESH_TOKEN_TTL_DAYS * 86_400_000,
};

function client(req: Request) {
  return { ip: req.ip, userAgent: req.get('user-agent') };
}

function setSession(res: Response, s: { accessToken: string; refreshToken: string }) {
  res.cookie(customerAuth.CUSTOMER_ACCESS_COOKIE, s.accessToken, accessCookie);
  res.cookie(customerAuth.CUSTOMER_REFRESH_COOKIE, s.refreshToken, refreshCookie);
}

function clearSession(res: Response) {
  res.clearCookie(customerAuth.CUSTOMER_ACCESS_COOKIE, { ...accessCookie, maxAge: undefined });
  res.clearCookie(customerAuth.CUSTOMER_REFRESH_COOKIE, { ...refreshCookie, maxAge: undefined });
}

// ---------- store ----------

storefrontRouter.get('/store', (req, res) => {
  res.json({ data: { name: req.store!.name, currency: req.store!.currency } });
});

// ---------- auth ----------

storefrontRouter.post('/auth/register', loginRateLimit, validateBody(registerCustomerSchema), async (req, res) => {
  const session = await customerAuth.register(req.tenantId!, req.body, client(req));
  setSession(res, session);
  res.status(201).json({ data: { customer: session.customer } });
});

storefrontRouter.post('/auth/login', loginRateLimit, validateBody(customerLoginSchema), async (req, res) => {
  const session = await customerAuth.login(req.tenantId!, req.body.email, req.body.password, client(req));
  setSession(res, session);
  res.json({ data: { customer: session.customer } });
});

storefrontRouter.post('/auth/refresh', loginRateLimit, async (req, res) => {
  try {
    const session = await customerAuth.refresh(req.tenantId!, req.cookies?.[customerAuth.CUSTOMER_REFRESH_COOKIE], client(req));
    setSession(res, session);
    res.json({ data: { customer: session.customer } });
  } catch (err) {
    clearSession(res);
    throw err;
  }
});

storefrontRouter.post('/auth/logout', async (req, res) => {
  await customerAuth.logout(req.cookies?.[customerAuth.CUSTOMER_REFRESH_COOKIE]);
  clearSession(res);
  res.json({ data: { ok: true } });
});

storefrontRouter.get('/auth/me', authenticateCustomer, async (req, res) => {
  res.json({ data: { customer: await customerAuth.getProfile(req.customer!.id) } });
});

// ---------- catalog (public) ----------

interface CatalogProduct {
  id: string;
  name: string;
  sku: string;
  category: string;
  price: number;
  available: number;
  inStock: boolean;
}

async function withStock(orgId: Types.ObjectId, products: { _id: Types.ObjectId; name: string; sku: string; category: string; price: number }[]): Promise<CatalogProduct[]> {
  const inventory = await Inventory.find({ organizationId: orgId, productId: { $in: products.map((p) => p._id) } }).lean();
  const available = new Map(inventory.map((i) => [String(i.productId), i.available]));
  return products.map((p) => {
    const qty = available.get(String(p._id)) ?? 0;
    return { id: String(p._id), name: p.name, sku: p.sku, category: p.category, price: p.price, available: qty, inStock: qty > 0 };
  });
}

storefrontRouter.get('/products', async (req, res) => {
  const { page, limit, skip } = pagination(req, { limit: 24, max: 60 });
  const filter: FilterQuery<ProductDoc> = { organizationId: req.tenantId, isActive: true };

  const ids = queryString(req, 'ids');
  if (ids) {
    const valid = ids.split(',').slice(0, 60).filter((id) => Types.ObjectId.isValid(id));
    filter._id = { $in: valid.map((id) => new Types.ObjectId(id)) };
  }
  const search = queryString(req, 'search')?.slice(0, 100);
  if (search) {
    filter.$or = [
      { nameLower: new RegExp(escapeRegex(search.toLowerCase())) },
      { sku: new RegExp(`^${escapeRegex(search.toUpperCase())}`) },
    ];
  }
  const category = queryString(req, 'category');
  if (category) filter.category = category.slice(0, 60);

  const [products, total] = await Promise.all([
    Product.find(filter).sort({ nameLower: 1 }).skip(skip).limit(limit).lean(),
    Product.countDocuments(filter),
  ]);
  res.json({ data: await withStock(req.tenantId!, products), meta: pageMeta(page, limit, total) });
});

storefrontRouter.get('/products/:id', async (req, res) => {
  const id = parseObjectId(String(req.params.id), 'Product');
  const product = await Product.findOne({ _id: id, organizationId: req.tenantId, isActive: true }).lean();
  if (!product) throw Errors.notFound('Product');
  const [data] = await withStock(req.tenantId!, [product]);
  res.json({ data });
});

storefrontRouter.get('/categories', async (req, res) => {
  const categories = await Product.distinct('category', { organizationId: req.tenantId, isActive: true });
  res.json({ data: (categories as string[]).sort((a, b) => a.localeCompare(b)) });
});

// ---------- customer orders ----------

/** Customer-facing view: no staff names, ids or allowed transitions. */
function toCustomerOrder(o: OrderDoc & { _id: unknown; createdAt: Date; updatedAt: Date }) {
  return {
    id: String(o._id),
    orderNumber: o.orderNumber,
    status: o.status,
    items: o.items.map((i) => ({
      productId: String(i.productId),
      name: i.name,
      sku: i.sku,
      unitPrice: i.unitPrice,
      quantity: i.quantity,
      lineTotal: i.lineTotal,
    })),
    itemCount: o.items.reduce((n, i) => n + i.quantity, 0),
    totalAmount: o.totalAmount,
    notes: o.notes ?? null,
    timeline: (o.statusHistory ?? []).map((h) => ({ status: h.to, at: new Date(h.at).toISOString() })),
    createdAt: new Date(o.createdAt).toISOString(),
    updatedAt: new Date(o.updatedAt).toISOString(),
  };
}

function ownOrders(req: Request): FilterQuery<OrderDoc> {
  return { organizationId: req.tenantId, 'customer.email': req.customer!.email, 'createdBy.id': req.customer!.id };
}

function shippingNotes({ shipping: s, notes }: CheckoutInput) {
  const address = [s.line1, s.line2, s.city, `${s.state} ${s.postalCode}`].filter(Boolean).join(', ');
  const lines = [`[Web order] Ship to: ${s.fullName}, ${address} · Phone: ${s.phone}`];
  if (notes) lines.push(`Customer note: ${notes}`);
  return lines.join('\n');
}

storefrontRouter.get('/orders', authenticateCustomer, async (req, res) => {
  const { page, limit, skip } = pagination(req, { limit: 10, max: 50 });
  const filter = ownOrders(req);
  const [orders, total] = await Promise.all([
    Order.find(filter).sort({ createdAt: -1, _id: -1 }).skip(skip).limit(limit).lean(),
    Order.countDocuments(filter),
  ]);
  res.json({ data: orders.map(toCustomerOrder), meta: pageMeta(page, limit, total) });
});

storefrontRouter.get('/orders/:id', authenticateCustomer, async (req, res) => {
  const id = parseObjectId(String(req.params.id), 'Order');
  const order = await Order.findOne({ _id: id, ...ownOrders(req) }).lean();
  if (!order) throw Errors.notFound('Order');
  res.json({ data: toCustomerOrder(order) });
});

storefrontRouter.post(
  '/orders',
  authenticateCustomer,
  validateBody(checkoutSchema),
  idempotency({ required: true }),
  async (req: Request, res: Response) => {
    const body = req.body as CheckoutInput;
    const c = req.customer!;
    const created = await createOrder(
      {
        organizationId: req.tenantId!,
        actor: { id: c.id, name: `${c.name} (web)` },
        // createOrder does not consult the role; least privilege in case it ever does.
        role: 'VIEWER',
        ip: req.ip,
      },
      // Customer identity comes from the session, never from the request body.
      { customer: { name: c.name, email: c.email }, items: body.items, notes: shippingNotes(body) },
    );
    const order = await Order.findById(created.id).lean();
    res.status(201).json({ data: toCustomerOrder(order!) });
  },
);
