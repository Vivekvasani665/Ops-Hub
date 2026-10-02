import http from 'node:http';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import type { Role } from '@shared';
import { createApp } from '../src/app';
import { Organization } from '../src/modules/organizations/organization.model';
import { User } from '../src/modules/users/user.model';
import { Product } from '../src/modules/products/product.model';
import { Inventory } from '../src/modules/inventory/inventory.model';
import { Counter, Order } from '../src/modules/orders/order.model';
import { AuditLog } from '../src/modules/audit/audit.model';
import { Job } from '../src/modules/jobs/job.model';
import { Notification } from '../src/modules/notifications/notification.model';
import { IdempotencyKey } from '../src/modules/idempotency/idempotency.model';
import { RefreshToken } from '../src/modules/auth/refresh-token.model';

export const ALL_MODELS = [Organization, User, Product, Inventory, Order, Counter, AuditLog, Job, Notification, IdempotencyKey, RefreshToken];
export const PASSWORD = 'Password123!';
const passwordHash = bcrypt.hashSync(PASSWORD, 4);

/** Wipes every collection but keeps indexes. Raw driver deletes bypass the audit append-only hooks. */
export async function resetDb() {
  await Promise.all(ALL_MODELS.map((m) => m.collection.deleteMany({})));
}

let server: http.Server | undefined;
export function testServer() {
  // Bound once; an unbound server makes supertest listen per request (100 concurrent listens).
  server ??= http.createServer(createApp()).listen(0);
  return server;
}

export async function createTenant(slug: string, opts: { products?: { sku: string; price?: number; stock: number; reorderLevel?: number }[] } = {}) {
  const org = await Organization.create({ name: `${slug} Org`, slug });
  const roles: Role[] = ['ORG_ADMIN', 'MANAGER', 'OPERATOR', 'VIEWER'];
  const users = Object.fromEntries(
    await Promise.all(
      roles.map(async (role) => {
        const u = await User.create({
          organizationId: org._id,
          name: `${slug} ${role}`,
          email: `${role.toLowerCase()}@${slug}.test`,
          passwordHash,
          role,
        });
        return [role, u] as const;
      }),
    ),
  ) as Record<Role, InstanceType<typeof User>>;

  const products = [];
  for (const p of opts.products ?? [{ sku: 'WIDGET', stock: 10 }]) {
    const product = await Product.create({
      organizationId: org._id,
      name: `Product ${p.sku}`,
      sku: p.sku,
      category: 'Test',
      price: p.price ?? 10_000,
    });
    await Inventory.create({
      organizationId: org._id,
      productId: product._id,
      available: p.stock,
      reserved: 0,
      reorderLevel: p.reorderLevel ?? 2,
    });
    products.push(product);
  }
  return { org, users, products };
}

export async function createSuperAdmin() {
  const org = await Organization.create({ name: 'Platform', slug: `platform-${crypto.randomUUID().slice(0, 6)}` });
  return User.create({ organizationId: org._id, name: 'Root', email: `root-${org.slug}@opshub.test`, passwordHash, role: 'SUPER_ADMIN' });
}

/** Supertest agent with a logged-in cookie jar. */
export async function loginAs(email: string) {
  const agent = request.agent(testServer());
  const res = await agent.post('/api/auth/login').send({ email, password: PASSWORD });
  if (res.status !== 200) throw new Error(`login failed for ${email}: ${res.status} ${JSON.stringify(res.body)}`);
  return agent;
}

export function orderBody(productId: string, quantity = 1, extra: Record<string, unknown> = {}) {
  return {
    customer: { name: 'Test Customer', email: 'customer@example.com' },
    items: [{ productId, quantity }],
    ...extra,
  };
}

export async function stockOf(productId: unknown) {
  const inv = await Inventory.findOne({ productId }).lean();
  return { available: inv!.available, reserved: inv!.reserved };
}

export const key = () => crypto.randomUUID();
