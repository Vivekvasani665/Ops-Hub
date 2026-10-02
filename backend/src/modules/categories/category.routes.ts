import { Router, type Request, type Response } from 'express';
import { categorySchema, type CategoryDto, type CategoryInput } from '@shared';
import { requirePermission } from '../../middlewares/auth.middleware';
import { validateBody } from '../../middlewares/validation.middleware';
import { escapeRegex, parseObjectId } from '../../utils/http';
import { Errors } from '../../utils/errors';
import { withTransaction } from '../../utils/transaction';
import { recordAudit } from '../audit/audit.service';
import { releaseMedia } from '../media/media.service';
import { Product } from '../products/product.model';
import { Category, ensureCategories } from './category.model';

export const categoryRouter = Router();

const exactName = (name: string) => new RegExp(`^${escapeRegex(name)}$`, 'i');
const isDuplicateKey = (err: unknown) => (err as { code?: number }).code === 11000;

type CategorySource = { _id: unknown; name: string; imageUrl?: string | null; createdAt: Date };
type Stats = { productCount: number; activeProductCount: number; imageUrl: string | null };

function toCategoryDto(c: CategorySource, stats?: Stats): CategoryDto {
  return {
    id: String(c._id),
    name: c.name,
    // A category without its own picture borrows one from its products.
    imageUrl: c.imageUrl ?? stats?.imageUrl ?? null,
    productCount: stats?.productCount ?? 0,
    activeProductCount: stats?.activeProductCount ?? 0,
    createdAt: new Date(c.createdAt).toISOString(),
  };
}

async function productStats(orgId: Request['tenantId']) {
  const rows = await Product.aggregate<{ _id: string } & Stats>([
    { $match: { organizationId: orgId } },
    {
      $group: {
        _id: { $toLower: '$category' },
        productCount: { $sum: 1 },
        activeProductCount: { $sum: { $cond: ['$isActive', 1, 0] } },
        imageUrl: { $max: '$imageUrl' },
      },
    },
  ]);
  return new Map(rows.map((r) => [r._id, r]));
}

categoryRouter.get('/', requirePermission('products:read'), async (req: Request, res: Response) => {
  const orgId = req.tenantId!;
  // Categories that so far exist only as a product's text field get their row on first listing.
  const stats = await productStats(orgId);
  await ensureCategories(
    orgId,
    (await Product.distinct('category', { organizationId: orgId })) as string[],
  );
  const categories = await Category.find({ organizationId: orgId }).sort({ nameLower: 1 }).lean();
  res.json({ data: categories.map((c) => toCategoryDto(c, stats.get(c.nameLower))) });
});

categoryRouter.post(
  '/',
  requirePermission('products:write'),
  validateBody(categorySchema),
  async (req: Request, res: Response) => {
    const orgId = req.tenantId!;
    const body = req.body as CategoryInput;
    try {
      const category = await withTransaction(async (session) => {
        const [c] = await Category.create([{ organizationId: orgId, name: body.name, imageUrl: body.imageUrl ?? null }], { session });
        await recordAudit(
          {
            organizationId: orgId,
            actor: { id: req.auth!.userId, name: req.auth!.name },
            action: 'CATEGORY_CREATED',
            entityType: 'CATEGORY',
            entityId: c._id,
            metadata: { name: c.name },
            ip: req.ip,
          },
          session,
        );
        return c;
      });
      res.status(201).json({ data: toCategoryDto(category.toObject()) });
    } catch (err) {
      if (isDuplicateKey(err)) throw Errors.conflict('DUPLICATE_CATEGORY', `Category "${body.name}" already exists`);
      throw err;
    }
  },
);

/** Renaming also moves every product of the category to the new name, in one transaction. */
categoryRouter.patch(
  '/:id',
  requirePermission('products:write'),
  validateBody(categorySchema),
  async (req: Request, res: Response) => {
    const orgId = req.tenantId!;
    const id = parseObjectId(String(req.params.id), 'Category');
    const body = req.body as CategoryInput;
    const before = await Category.findOne({ _id: id, organizationId: orgId }).lean();
    if (!before) throw Errors.notFound('Category');

    try {
      const { category, productsMoved } = await withTransaction(async (session) => {
        const c = await Category.findOneAndUpdate(
          { _id: id, organizationId: orgId },
          { $set: { name: body.name, nameLower: body.name.toLowerCase(), ...(body.imageUrl !== undefined && { imageUrl: body.imageUrl }) } },
          { new: true, session },
        );
        if (!c) throw Errors.notFound('Category');
        let moved = 0;
        if (before.name !== body.name) {
          const r = await Product.updateMany(
            { organizationId: orgId, category: exactName(before.name) },
            { $set: { category: body.name } },
            { session },
          );
          moved = r.modifiedCount;
        }
        await recordAudit(
          {
            organizationId: orgId,
            actor: { id: req.auth!.userId, name: req.auth!.name },
            action: 'CATEGORY_UPDATED',
            entityType: 'CATEGORY',
            entityId: id,
            metadata: { name: body.name, ...(before.name !== body.name && { previousName: before.name, productsMoved: moved }) },
            ip: req.ip,
          },
          session,
        );
        return { category: c, productsMoved: moved };
      });
      if (body.imageUrl !== undefined && body.imageUrl !== before.imageUrl) await releaseMedia(orgId, before.imageUrl);
      const stats = await productStats(orgId);
      res.json({ data: toCategoryDto(category.toObject(), stats.get(category.nameLower)), meta: { productsMoved } });
    } catch (err) {
      if (isDuplicateKey(err)) throw Errors.conflict('DUPLICATE_CATEGORY', `Category "${body.name}" already exists`);
      throw err;
    }
  },
);

categoryRouter.delete('/:id', requirePermission('products:write'), async (req: Request, res: Response) => {
  const orgId = req.tenantId!;
  const id = parseObjectId(String(req.params.id), 'Category');
  const removed = await withTransaction(async (session) => {
    const c = await Category.findOne({ _id: id, organizationId: orgId }, null, { session }).lean();
    if (!c) throw Errors.notFound('Category');
    const inUse = await Product.countDocuments({ organizationId: orgId, category: exactName(c.name) }, { session });
    if (inUse > 0) {
      throw Errors.conflict('CATEGORY_IN_USE', `${inUse} product(s) still use "${c.name}". Move them to another category first.`);
    }
    await Category.deleteOne({ _id: id, organizationId: orgId }, { session });
    await recordAudit(
      {
        organizationId: orgId,
        actor: { id: req.auth!.userId, name: req.auth!.name },
        action: 'CATEGORY_DELETED',
        entityType: 'CATEGORY',
        entityId: id,
        metadata: { name: c.name },
        ip: req.ip,
      },
      session,
    );
    return c;
  });
  await releaseMedia(orgId, removed.imageUrl);
  res.json({ data: { id: String(id), deleted: true } });
});
