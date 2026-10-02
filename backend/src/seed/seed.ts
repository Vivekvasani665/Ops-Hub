import bcrypt from 'bcryptjs';
import mongoose, { Types } from 'mongoose';
import type { OrderStatus, Role } from '@shared';
import { logger } from '../utils/logger';
import { Organization } from '../modules/organizations/organization.model';
import { User } from '../modules/users/user.model';
import { Product } from '../modules/products/product.model';
import { Inventory } from '../modules/inventory/inventory.model';
import { Counter, Order } from '../modules/orders/order.model';
import { AuditLog } from '../modules/audit/audit.model';
import { Job } from '../modules/jobs/job.model';
import { Notification } from '../modules/notifications/notification.model';
import { IdempotencyKey } from '../modules/idempotency/idempotency.model';
import { RefreshToken } from '../modules/auth/refresh-token.model';

export const SEED_PASSWORD = 'Password123!';

const MODELS = [Organization, User, Product, Inventory, Order, Counter, AuditLog, Job, Notification, IdempotencyKey, RefreshToken];

// Deterministic PRNG so every seed produces the same dataset.
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface SeedProduct {
  name: string;
  sku: string;
  category: string;
  price: number; // rupees
  stock: number;
  reorderLevel: number;
}

const ACME_PRODUCTS: SeedProduct[] = [
  { name: 'iPhone 15', sku: 'IP15-BLK', category: 'Phones', price: 69_999, stock: 6, reorderLevel: 10 },
  { name: 'MacBook Pro', sku: 'MBP-14', category: 'Laptops', price: 1_69_999, stock: 2, reorderLevel: 5 },
  { name: 'AirPods Pro', sku: 'AP2', category: 'Audio', price: 24_900, stock: 0, reorderLevel: 8 },
  { name: 'iPad Air', sku: 'IPAD-AIR', category: 'Tablets', price: 59_900, stock: 40, reorderLevel: 8 },
  { name: 'Apple Watch Series 9', sku: 'AW-S9', category: 'Wearables', price: 41_900, stock: 35, reorderLevel: 6 },
  { name: 'Samsung Galaxy S24', sku: 'SGS24', category: 'Phones', price: 79_999, stock: 50, reorderLevel: 10 },
  { name: 'Sony WH-1000XM5', sku: 'SONY-XM5', category: 'Audio', price: 29_990, stock: 60, reorderLevel: 10 },
  { name: 'Dell XPS 13', sku: 'DELL-XPS13', category: 'Laptops', price: 1_24_990, stock: 18, reorderLevel: 4 },
  { name: 'Logitech MX Master 3S', sku: 'LOGI-MX3S', category: 'Accessories', price: 9_995, stock: 120, reorderLevel: 20 },
  { name: 'Kindle Paperwhite', sku: 'KINDLE-PW', category: 'Tablets', price: 13_999, stock: 75, reorderLevel: 10 },
  { name: 'Magic Keyboard', sku: 'MK-USB', category: 'Accessories', price: 9_500, stock: 4, reorderLevel: 5 },
  { name: 'USB-C 35W Charger', sku: 'USBC-35W', category: 'Accessories', price: 5_800, stock: 200, reorderLevel: 25 },
];

const GLOBEX_PRODUCTS: SeedProduct[] = [
  { name: 'Office Chair Pro', sku: 'CHAIR-PRO', category: 'Furniture', price: 18_500, stock: 30, reorderLevel: 5 },
  { name: 'Standing Desk', sku: 'DESK-STD', category: 'Furniture', price: 32_000, stock: 3, reorderLevel: 4 },
  { name: '4K Monitor 27"', sku: 'MON-27-4K', category: 'Displays', price: 28_999, stock: 22, reorderLevel: 5 },
  { name: 'Webcam HD', sku: 'CAM-HD', category: 'Accessories', price: 4_499, stock: 80, reorderLevel: 10 },
];

const CUSTOMERS = [
  'Rahul Shah', 'John Smith', 'Acme Corp', 'Tech Store', 'Global Retail', 'Priya Patel', 'Ananya Iyer',
  'Arjun Mehta', 'Neha Gupta', 'Vikram Singh', 'Sara Khan', 'David Lee', 'Emma Wilson', 'Rohan Desai',
  'Kavya Nair', 'Isha Reddy', 'Aditya Joshi', 'Meera Kapoor', 'Karan Malhotra', 'Pooja Verma',
  'Bright Electronics', 'Nova Traders', 'Zenith Supplies', 'Om Enterprises',
];

const FLOW: OrderStatus[] = ['PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED'];

function emailFor(name: string) {
  return `${name.toLowerCase().replace(/[^a-z]+/g, '.').replace(/^\.|\.$/g, '')}@example.com`;
}

/** Older orders are mostly finished; today's are mostly still open. */
function pickStatus(ageHours: number, r: number): OrderStatus {
  if (r < 0.045) return 'CANCELLED';
  if (ageHours < 6) return r < 0.4 ? 'PENDING' : r < 0.75 ? 'CONFIRMED' : 'PROCESSING';
  if (ageHours < 24) return r < 0.15 ? 'PENDING' : r < 0.4 ? 'CONFIRMED' : r < 0.7 ? 'PROCESSING' : 'SHIPPED';
  if (ageHours < 72) return r < 0.1 ? 'CONFIRMED' : r < 0.3 ? 'PROCESSING' : r < 0.65 ? 'SHIPPED' : 'DELIVERED';
  return r < 0.08 ? 'SHIPPED' : 'DELIVERED';
}

interface SeedUser {
  _id: Types.ObjectId;
  name: string;
}

async function seedOrders(opts: {
  orgId: Types.ObjectId;
  products: { _id: Types.ObjectId; name: string; sku: string; price: number }[];
  users: SeedUser[];
  count: number;
  days: number;
  rand: () => number;
  now: Date;
}) {
  const { orgId, products, users, count, days, rand, now } = opts;
  const reserved = new Map<string, number>();
  const BATCH = 5000;

  // A busy "today" for the dashboard on top of an even spread over the period; sorted ascending
  // so order numbers increase with time.
  const todayCount = Math.min(count, Math.max(20, Math.round(count / days) * 2));
  const times = [
    ...Array.from({ length: count - todayCount }, () => now.getTime() - rand() * days * 86_400_000),
    ...Array.from({ length: todayCount }, () => now.getTime() - rand() * 9 * 3_600_000),
  ].sort((a, b) => a - b);

  for (let start = 0; start < count; start += BATCH) {
    const orders: Record<string, unknown>[] = [];
    const audits: Record<string, unknown>[] = [];
    for (let i = start; i < Math.min(count, start + BATCH); i++) {
      const createdAt = new Date(times[i]!);
      const ageHours = (now.getTime() - createdAt.getTime()) / 3_600_000;
      const status = pickStatus(ageHours, rand());
      const creator = users[Math.floor(rand() * users.length)]!;
      const customerName = CUSTOMERS[Math.floor(rand() * CUSTOMERS.length)]!;

      const lineCount = 1 + Math.floor(rand() * (rand() < 0.7 ? 1 : 3));
      const chosen = new Set<number>();
      while (chosen.size < lineCount) chosen.add(Math.floor(rand() * products.length));
      const items = [...chosen].map((idx) => {
        const p = products[idx]!;
        const quantity = 1 + Math.floor(rand() * (rand() < 0.8 ? 1 : 3));
        return { productId: p._id, name: p.name, sku: p.sku, unitPrice: p.price, quantity, lineTotal: p.price * quantity };
      });

      // Walk the state machine up to the final status so history is always valid.
      const history: Record<string, unknown>[] = [];
      const stepMs = Math.max(60_000, Math.min(ageHours * 3_600_000, 3 * 86_400_000) / 5);
      let t = createdAt.getTime();
      const target = status === 'CANCELLED' ? FLOW[Math.floor(rand() * 3)]! : status;
      let prev: OrderStatus | null = null;
      for (const s of FLOW) {
        history.push({ from: prev, to: s, changedBy: { id: creator._id, name: creator.name }, at: new Date(t) });
        prev = s;
        if (s === target) break;
        t = Math.min(now.getTime(), t + stepMs * (0.5 + rand()));
      }
      if (status === 'CANCELLED') {
        t = Math.min(now.getTime(), t + stepMs);
        history.push({ from: prev, to: 'CANCELLED', changedBy: { id: creator._id, name: creator.name }, reason: 'Customer request', at: new Date(t) });
      }

      if (status === 'PENDING' || status === 'CONFIRMED' || status === 'PROCESSING') {
        for (const it of items) reserved.set(String(it.productId), (reserved.get(String(it.productId)) ?? 0) + it.quantity);
      }

      const _id = new Types.ObjectId();
      orders.push({
        _id,
        organizationId: orgId,
        orderNumber: 1001 + i,
        customer: { name: customerName, email: emailFor(customerName), nameLower: customerName.toLowerCase() },
        items,
        totalAmount: items.reduce((s, it) => s + it.lineTotal, 0),
        status,
        statusHistory: history,
        createdBy: { id: creator._id, name: creator.name },
        createdAt,
        updatedAt: new Date(t),
      });
      audits.push({
        organizationId: orgId,
        actor: { id: creator._id, name: creator.name },
        action: 'ORDER_CREATED',
        entityType: 'ORDER',
        entityId: _id,
        metadata: { orderNumber: 1001 + i, customerName, totalAmount: items.reduce((s, it) => s + it.lineTotal, 0) },
        dedupeKey: `order-created:${_id}`,
        createdAt,
      });
      if (ageHours < 48 && history.length > 1) {
        const last = history[history.length - 1]!;
        audits.push({
          organizationId: orgId,
          actor: { id: creator._id, name: creator.name },
          action: last.to === 'CANCELLED' ? 'ORDER_CANCELLED' : 'ORDER_STATUS_CHANGED',
          entityType: 'ORDER',
          entityId: _id,
          metadata: { orderNumber: 1001 + i, customerName, from: last.from, to: last.to },
          createdAt: last.at,
        });
      }
    }
    // Raw driver inserts: the seed generates already-valid documents, and skipping Mongoose
    // hydration keeps a 100k seed in seconds rather than minutes.
    await Order.collection.insertMany(orders, { ordered: false });
    await AuditLog.collection.insertMany(audits, { ordered: false });
    if (count > BATCH) logger.info(`  ...${Math.min(count, start + BATCH).toLocaleString()} / ${count.toLocaleString()} orders`);
  }

  await Counter.updateOne({ organizationId: orgId, name: 'order' }, { $set: { seq: count } }, { upsert: true });
  return reserved;
}

async function seedTenant(opts: {
  name: string;
  slug: string;
  users: { name: string; email: string; role: Role }[];
  products: SeedProduct[];
  orders: number;
  passwordHash: string;
  rand: () => number;
  now: Date;
}) {
  const org = await Organization.create({ name: opts.name, slug: opts.slug });
  const users = await User.insertMany(
    opts.users.map((u) => ({ ...u, organizationId: org._id, passwordHash: opts.passwordHash })),
  );
  const products = await Product.insertMany(
    opts.products.map((p) => ({
      organizationId: org._id,
      name: p.name,
      nameLower: p.name.toLowerCase(),
      sku: p.sku,
      category: p.category,
      price: p.price * 100,
    })),
  );

  const reserved = opts.orders
    ? await seedOrders({
        orgId: org._id,
        products,
        users: users.filter((u) => u.role !== 'VIEWER'),
        count: opts.orders,
        days: 30,
        rand: opts.rand,
        now: opts.now,
      })
    : new Map<string, number>();

  await Inventory.insertMany(
    products.map((p, i) => ({
      organizationId: org._id,
      productId: p._id,
      available: opts.products[i]!.stock,
      reserved: reserved.get(String(p._id)) ?? 0,
      reorderLevel: opts.products[i]!.reorderLevel,
    })),
  );
  return { org, users, products };
}

async function seedActivity(acme: Awaited<ReturnType<typeof seedTenant>>, now: Date) {
  const ago = (min: number) => new Date(now.getTime() - min * 60_000);
  const recent = await Order.find({ organizationId: acme.org._id }).sort({ orderNumber: -1 }).limit(3).lean();
  const [newest, second] = recent;
  const john = acme.users.find((u) => u.email === 'john@acme.com')!;
  const macbook = acme.products.find((p) => p.sku === 'MBP-14')!;

  if (newest && second) {
    await Notification.collection.insertMany([
      {
        organizationId: acme.org._id, type: 'ORDER_STATUS_CHANGED', severity: 'success',
        title: `Order #${second.orderNumber} shipped`, message: second.customer.name,
        entityType: 'ORDER', entityId: second._id, createdAt: ago(2),
      },
      {
        organizationId: acme.org._id, type: 'LOW_STOCK', severity: 'warning',
        title: 'Low stock: MacBook Pro', message: 'MBP-14 · 2 left',
        entityType: 'PRODUCT', entityId: macbook._id, createdAt: ago(8),
      },
      {
        organizationId: acme.org._id, type: 'ORDER_CREATED', severity: 'info',
        title: `New order #${newest.orderNumber}`, message: newest.customer.name,
        entityType: 'ORDER', entityId: newest._id, createdAt: ago(12),
      },
    ]);
  }

  await AuditLog.collection.insertOne({
    organizationId: acme.org._id, actor: { id: john._id, name: john.name }, action: 'USER_LOGGED_IN',
    entityType: 'USER', entityId: john._id, metadata: { email: john.email }, createdAt: ago(15),
  });

  // A permanently failed job so the Jobs page has something to retry.
  await Job.collection.insertMany([
    {
      organizationId: acme.org._id, type: 'SEND_ORDER_NOTIFICATION', status: 'FAILED', attempts: 3, maxAttempts: 3,
      payload: { event: 'created', orderId: String(newest?._id ?? ''), orderNumber: newest?.orderNumber ?? 0, customerName: newest?.customer.name ?? '', totalAmount: newest?.totalAmount ?? 0 },
      lastError: 'Notification provider timed out', availableAt: ago(30), lockedBy: null, lockedUntil: null,
      result: null, completedAt: null, createdAt: ago(31), updatedAt: ago(30),
    },
    {
      organizationId: acme.org._id, type: 'CREATE_ORDER_AUDIT', status: 'COMPLETED', attempts: 1, maxAttempts: 3,
      payload: { orderNumber: newest?.orderNumber ?? 0 }, lastError: null, availableAt: ago(12), lockedBy: null,
      lockedUntil: null, result: { deduplicated: false }, completedAt: ago(12), createdAt: ago(12), updatedAt: ago(12),
    },
  ]);
}

export async function resetDatabase() {
  await mongoose.connection.db!.dropDatabase();
  // Drop removes indexes too; rebuild them before inserting so unique constraints hold during the seed.
  for (const m of MODELS) await m.createIndexes();
}

export async function seedDatabase({ orders = 800, reset = false }: { orders?: number; reset?: boolean } = {}) {
  if (reset) await resetDatabase();
  else if (await Organization.exists({})) {
    logger.info('Database already seeded; skipping (use --reset to reseed)');
    return false;
  }

  const started = Date.now();
  const now = new Date();
  const rand = mulberry32(42);
  const passwordHash = await bcrypt.hash(SEED_PASSWORD, 10);

  const acme = await seedTenant({
    name: 'Acme Merchant',
    slug: 'acme',
    users: [
      { name: 'John Doe', email: 'john@acme.com', role: 'ORG_ADMIN' },
      { name: 'Maya Rao', email: 'maya@acme.com', role: 'MANAGER' },
      { name: 'Ravi Kumar', email: 'ravi@acme.com', role: 'OPERATOR' },
      { name: 'Vera Fernandes', email: 'vera@acme.com', role: 'VIEWER' },
    ],
    products: ACME_PRODUCTS,
    orders,
    passwordHash,
    rand,
    now,
  });
  await seedTenant({
    name: 'Globex Retail',
    slug: 'globex',
    users: [{ name: 'Grace Admin', email: 'admin@globex.com', role: 'ORG_ADMIN' }],
    products: GLOBEX_PRODUCTS,
    orders: Math.min(150, Math.max(20, Math.round(orders / 10))),
    passwordHash,
    rand,
    now,
  });
  await seedTenant({
    name: 'OpsHub Platform',
    slug: 'opshub',
    users: [{ name: 'Root Admin', email: 'root@opshub.dev', role: 'SUPER_ADMIN' }],
    products: [],
    orders: 0,
    passwordHash,
    rand,
    now,
  });
  await seedActivity(acme, now);

  logger.info(`Seeded ${orders.toLocaleString()} Acme orders in ${((Date.now() - started) / 1000).toFixed(1)}s. Login: john@acme.com / ${SEED_PASSWORD}`);
  return true;
}
