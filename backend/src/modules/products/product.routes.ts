import { Router, type Request, type Response } from 'express';
import { createProductSchema, type ProductDto } from '@shared';
import type { FilterQuery } from 'mongoose';
import { requirePermission } from '../../middlewares/auth.middleware';
import { validateBody } from '../../middlewares/validation.middleware';
import { escapeRegex, pageMeta, pagination, queryString } from '../../utils/http';
import { Errors } from '../../utils/errors';
import { withTransaction } from '../../utils/transaction';
import { recordAudit } from '../audit/audit.service';
import { Inventory } from '../inventory/inventory.model';
import { Product, type ProductDoc } from './product.model';

export const productRouter = Router();

function toProductDto(p: { _id: unknown; name: string; sku: string; category: string; price: number; isActive: boolean; createdAt: Date }): ProductDto {
  return {
    id: String(p._id),
    name: p.name,
    sku: p.sku,
    category: p.category,
    price: p.price,
    isActive: p.isActive,
    createdAt: new Date(p.createdAt).toISOString(),
  };
}

productRouter.get('/', requirePermission('products:read'), async (req: Request, res: Response) => {
  const { page, limit, skip } = pagination(req, { limit: 50, max: 200 });
  const filter: FilterQuery<ProductDoc> = { organizationId: req.tenantId };
  const search = queryString(req, 'search');
  if (search) {
    const rx = new RegExp(`^${escapeRegex(search.toLowerCase())}`);
    filter.$or = [{ nameLower: rx }, { sku: new RegExp(`^${escapeRegex(search.toUpperCase())}`) }];
  }
  const [products, total] = await Promise.all([
    Product.find(filter).sort({ nameLower: 1 }).skip(skip).limit(limit).lean(),
    Product.countDocuments(filter),
  ]);
  const inventory = await Inventory.find({
    organizationId: req.tenantId,
    productId: { $in: products.map((p) => p._id) },
  }).lean();
  const byProduct = new Map(inventory.map((i) => [String(i.productId), i]));

  res.json({
    data: products.map((p) => {
      const inv = byProduct.get(String(p._id));
      return {
        ...toProductDto(p),
        inventory: inv ? { available: inv.available, reserved: inv.reserved, reorderLevel: inv.reorderLevel } : null,
      };
    }),
    meta: pageMeta(page, limit, total),
  });
});

productRouter.post(
  '/',
  requirePermission('products:write'),
  validateBody(createProductSchema),
  async (req: Request, res: Response) => {
    const orgId = req.tenantId!;
    const body = req.body as import('@shared').CreateProductInput;
    try {
      const product = await withTransaction(async (session) => {
        const [p] = await Product.create(
          [{ organizationId: orgId, name: body.name, sku: body.sku, category: body.category, price: body.price }],
          { session },
        );
        await Inventory.create(
          [{ organizationId: orgId, productId: p._id, available: body.initialStock, reserved: 0, reorderLevel: body.reorderLevel }],
          { session },
        );
        await recordAudit(
          {
            organizationId: orgId,
            actor: { id: req.auth!.userId, name: req.auth!.name },
            action: 'PRODUCT_CREATED',
            entityType: 'PRODUCT',
            entityId: p._id,
            metadata: { name: p.name, sku: p.sku, initialStock: body.initialStock },
            ip: req.ip,
          },
          session,
        );
        return p;
      });
      res.status(201).json({ data: toProductDto(product.toObject()) });
    } catch (err) {
      if ((err as { code?: number }).code === 11000) throw Errors.conflict('DUPLICATE_SKU', `SKU ${body.sku} already exists`);
      throw err;
    }
  },
);
