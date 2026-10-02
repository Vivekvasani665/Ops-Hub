import { Router, type Request, type Response } from 'express';
import type { FilterQuery } from 'mongoose';
import type { CustomerDto } from '@shared';
import { requirePermission } from '../../middlewares/auth.middleware';
import { escapeRegex, pageMeta, pagination, queryString } from '../../utils/http';
import { Customer, type CustomerDoc } from '../storefront/customer.model';
import { Order } from '../orders/order.model';

/** Read-only admin view of storefront shoppers. Accounts are created and managed by the customers themselves. */
export const customerRouter = Router();

customerRouter.get('/', requirePermission('customers:read'), async (req: Request, res: Response) => {
  const orgId = req.tenantId!;
  const { page, limit, skip } = pagination(req, { limit: 10, max: 100 });
  const filter: FilterQuery<CustomerDoc> = { organizationId: orgId };
  const search = queryString(req, 'search')?.slice(0, 100);
  if (search) {
    filter.$or = [
      { email: new RegExp(`^${escapeRegex(search.toLowerCase())}`) },
      { name: new RegExp(`^${escapeRegex(search)}`, 'i') },
    ];
  }
  const status = queryString(req, 'status');
  if (status === 'ACTIVE' || status === 'DISABLED') filter.status = status;

  const [customers, total] = await Promise.all([
    Customer.find(filter).sort({ createdAt: -1, _id: -1 }).skip(skip).limit(limit).lean(),
    Customer.countDocuments(filter),
  ]);

  // Served by the { organizationId, customer.email, createdAt } index.
  const totals = await Order.aggregate<{ _id: string; orderCount: number; totalSpent: number; lastOrderAt: Date }>([
    { $match: { organizationId: orgId, 'customer.email': { $in: customers.map((c) => c.email) } } },
    {
      $group: {
        _id: '$customer.email',
        orderCount: { $sum: 1 },
        totalSpent: { $sum: { $cond: [{ $eq: ['$status', 'CANCELLED'] }, 0, '$totalAmount'] } },
        lastOrderAt: { $max: '$createdAt' },
      },
    },
  ]);
  const byEmail = new Map(totals.map((t) => [t._id, t]));

  const data: CustomerDto[] = customers.map((c) => {
    const t = byEmail.get(c.email);
    return {
      id: String(c._id),
      name: c.name,
      email: c.email,
      phone: c.phone ?? null,
      status: c.status,
      orderCount: t?.orderCount ?? 0,
      totalSpent: t?.totalSpent ?? 0,
      lastOrderAt: t ? t.lastOrderAt.toISOString() : null,
      lastLoginAt: c.lastLoginAt ? c.lastLoginAt.toISOString() : null,
      createdAt: c.createdAt.toISOString(),
    };
  });
  res.json({ data, meta: pageMeta(page, limit, total) });
});
