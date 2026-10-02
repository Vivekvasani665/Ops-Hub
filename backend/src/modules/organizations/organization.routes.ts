import { Router } from 'express';
import { requirePermission } from '../../middlewares/auth.middleware';
import { Errors } from '../../utils/errors';
import { User } from '../users/user.model';
import { Product } from '../products/product.model';
import { Order } from '../orders/order.model';
import { Organization } from './organization.model';

export const organizationRouter = Router();

organizationRouter.get('/current', requirePermission('organization:read'), async (req, res) => {
  const org = await Organization.findById(req.tenantId).lean();
  if (!org) throw Errors.notFound('Organization');
  const filter = { organizationId: req.tenantId };
  const [users, products, orders] = await Promise.all([
    User.countDocuments(filter),
    Product.countDocuments(filter),
    Order.countDocuments(filter),
  ]);
  res.json({
    data: {
      id: String(org._id),
      name: org.name,
      slug: org.slug,
      timezone: org.timezone,
      currency: org.currency,
      createdAt: org.createdAt.toISOString(),
      stats: { users, products, orders },
    },
  });
});

/** Platform-level listing; only SUPER_ADMIN can see other tenants exist. */
organizationRouter.get('/', async (req, res) => {
  if (req.auth!.role !== 'SUPER_ADMIN') throw Errors.forbidden();
  const orgs = await Organization.find().sort({ name: 1 }).lean();
  res.json({ data: orgs.map((o) => ({ id: String(o._id), name: o.name, slug: o.slug, status: o.status })) });
});
