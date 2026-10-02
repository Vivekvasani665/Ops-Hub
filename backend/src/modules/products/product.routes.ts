import { Router, type Request, type Response } from 'express';
import {
  createProductSchema,
  updateProductSchema,
  type CreateProductInput,
  type ProductDto,
  type ProductWithInventoryDto,
  type UpdateProductInput,
} from '@shared';
import type { FilterQuery, SortOrder } from 'mongoose';
import { requirePermission } from '../../middlewares/auth.middleware';
import { validateBody } from '../../middlewares/validation.middleware';
import { escapeRegex, pageMeta, pagination, parseObjectId, queryString } from '../../utils/http';
import { Errors } from '../../utils/errors';
import { withTransaction } from '../../utils/transaction';
import { recordAudit } from '../audit/audit.service';
import { Inventory } from '../inventory/inventory.model';
import { ensureCategories } from '../categories/category.model';
import { releaseMedia } from '../media/media.service';
import { Product, type ProductDoc } from './product.model';

export const productRouter = Router();

type ProductSource = {
  _id: unknown;
  name: string;
  sku: string;
  category: string;
  price: number;
  imageUrl?: string | null;
  description?: string | null;
  isActive: boolean;
  createdAt: Date;
};

function toProductDto(p: ProductSource): ProductDto {
  return {
    id: String(p._id),
    name: p.name,
    sku: p.sku,
    category: p.category,
    price: p.price,
    imageUrl: p.imageUrl ?? null,
    description: p.description ?? null,
    isActive: p.isActive,
    createdAt: new Date(p.createdAt).toISOString(),
  };
}

async function withInventory(orgId: Request['tenantId'], products: ProductSource[]): Promise<ProductWithInventoryDto[]> {
  const inventory = await Inventory.find({
    organizationId: orgId,
    productId: { $in: products.map((p) => p._id) },
  }).lean();
  const byProduct = new Map(inventory.map((i) => [String(i.productId), i]));
  return products.map((p) => {
    const inv = byProduct.get(String(p._id));
    return {
      ...toProductDto(p),
      inventory: inv ? { available: inv.available, reserved: inv.reserved, reorderLevel: inv.reorderLevel } : null,
    };
  });
}

const SORTS: Record<string, Record<string, SortOrder>> = {
  name: { nameLower: 1, _id: 1 },
  newest: { createdAt: -1, _id: -1 },
  oldest: { createdAt: 1, _id: 1 },
  price_asc: { price: 1, _id: 1 },
  price_desc: { price: -1, _id: 1 },
};

const isDuplicateKey = (err: unknown) => (err as { code?: number }).code === 11000;

productRouter.get('/', requirePermission('products:read'), async (req: Request, res: Response) => {
  const { page, limit, skip } = pagination(req, { limit: 50, max: 200 });
  const filter: FilterQuery<ProductDoc> = { organizationId: req.tenantId };
  const search = queryString(req, 'search');
  if (search) {
    const rx = new RegExp(`^${escapeRegex(search.toLowerCase())}`);
    filter.$or = [{ nameLower: rx }, { sku: new RegExp(`^${escapeRegex(search.toUpperCase())}`) }];
  }
  const category = queryString(req, 'category');
  if (category) filter.category = new RegExp(`^${escapeRegex(category)}$`, 'i');
  const status = queryString(req, 'status');
  if (status === 'active') filter.isActive = true;
  if (status === 'inactive') filter.isActive = false;
  const sort = SORTS[queryString(req, 'sort') ?? 'name'] ?? SORTS.name!;

  const [products, total] = await Promise.all([
    Product.find(filter).sort(sort).skip(skip).limit(limit).lean(),
    Product.countDocuments(filter),
  ]);
  res.json({ data: await withInventory(req.tenantId, products), meta: pageMeta(page, limit, total) });
});

productRouter.get('/:id', requirePermission('products:read'), async (req: Request, res: Response) => {
  const id = parseObjectId(String(req.params.id), 'Product');
  const product = await Product.findOne({ _id: id, organizationId: req.tenantId }).lean();
  if (!product) throw Errors.notFound('Product');
  const [data] = await withInventory(req.tenantId, [product]);
  res.json({ data });
});

productRouter.post(
  '/',
  requirePermission('products:write'),
  validateBody(createProductSchema),
  async (req: Request, res: Response) => {
    const orgId = req.tenantId!;
    const body = req.body as CreateProductInput;
    try {
      const product = await withTransaction(async (session) => {
        const [p] = await Product.create(
          [
            {
              organizationId: orgId,
              name: body.name,
              sku: body.sku,
              category: body.category,
              price: body.price,
              imageUrl: body.imageUrl ?? null,
              description: body.description || null,
              isActive: body.isActive,
            },
          ],
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
      await ensureCategories(orgId, [product.category]);
      res.status(201).json({ data: toProductDto(product.toObject()) });
    } catch (err) {
      if (isDuplicateKey(err)) throw Errors.conflict('DUPLICATE_SKU', `SKU ${body.sku} already exists`);
      throw err;
    }
  },
);

productRouter.patch(
  '/:id',
  requirePermission('products:write'),
  validateBody(updateProductSchema),
  async (req: Request, res: Response) => {
    const orgId = req.tenantId!;
    const id = parseObjectId(String(req.params.id), 'Product');
    const body = req.body as UpdateProductInput;

    const before = await Product.findOne({ _id: id, organizationId: orgId }).lean();
    if (!before) throw Errors.notFound('Product');

    const { reorderLevel, ...productFields } = body;
    if (productFields.description === '') productFields.description = null;
    // Only fields whose value actually changes end up in the update and the audit entry.
    const changes = Object.fromEntries(
      Object.entries(productFields).filter(([k, v]) => v !== undefined && ((before as Record<string, unknown>)[k] ?? null) !== v),
    ) as Partial<ProductDoc>;
    if (changes.name) changes.nameLower = changes.name.toLowerCase();

    try {
      const product = await withTransaction(async (session) => {
        const updated = await Product.findOneAndUpdate({ _id: id, organizationId: orgId }, { $set: changes }, { new: true, session });
        if (!updated) throw Errors.notFound('Product');
        let reorderChanged = false;
        if (reorderLevel !== undefined) {
          const r = await Inventory.updateOne({ organizationId: orgId, productId: id }, { $set: { reorderLevel } }, { session });
          reorderChanged = r.modifiedCount > 0;
        }
        const changed = [...Object.keys(changes).filter((k) => k !== 'nameLower'), ...(reorderChanged ? ['reorderLevel'] : [])];
        if (changed.length > 0) {
          await recordAudit(
            {
              organizationId: orgId,
              actor: { id: req.auth!.userId, name: req.auth!.name },
              action: 'PRODUCT_UPDATED',
              entityType: 'PRODUCT',
              entityId: id,
              metadata: { name: updated.name, sku: updated.sku, changed },
              ip: req.ip,
            },
            session,
          );
        }
        return updated;
      });
      if (changes.category) await ensureCategories(orgId, [changes.category]);
      if ('imageUrl' in changes) await releaseMedia(orgId, before.imageUrl);
      const [data] = await withInventory(orgId, [product.toObject()]);
      res.json({ data });
    } catch (err) {
      if (isDuplicateKey(err)) throw Errors.conflict('DUPLICATE_SKU', `SKU ${body.sku} already exists`);
      throw err;
    }
  },
);

productRouter.delete('/:id', requirePermission('products:write'), async (req: Request, res: Response) => {
  const orgId = req.tenantId!;
  const id = parseObjectId(String(req.params.id), 'Product');

  const removed = await withTransaction(async (session) => {
    const product = await Product.findOne({ _id: id, organizationId: orgId }, null, { session }).lean();
    if (!product) throw Errors.notFound('Product');
    // Open orders hold reserved units of this product; deleting it would strand them.
    const inv = await Inventory.findOne({ organizationId: orgId, productId: id }, null, { session }).lean();
    if (inv && inv.reserved > 0) {
      throw Errors.conflict(
        'PRODUCT_HAS_RESERVATIONS',
        `${inv.reserved} unit(s) are reserved by open orders. Finish or cancel them first, or mark the product inactive.`,
      );
    }
    // Order lines keep their own name/SKU/price snapshot, so order history is unaffected.
    await Product.deleteOne({ _id: id, organizationId: orgId }, { session });
    await Inventory.deleteOne({ organizationId: orgId, productId: id }, { session });
    await recordAudit(
      {
        organizationId: orgId,
        actor: { id: req.auth!.userId, name: req.auth!.name },
        action: 'PRODUCT_DELETED',
        entityType: 'PRODUCT',
        entityId: id,
        metadata: { name: product.name, sku: product.sku },
        ip: req.ip,
      },
      session,
    );
    return product;
  });
  await releaseMedia(orgId, removed.imageUrl);
  res.json({ data: { id: String(id), deleted: true } });
});
