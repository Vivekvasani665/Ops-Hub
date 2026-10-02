import { Router, type Request, type Response } from 'express';
import { adjustInventorySchema } from '@shared';
import type { PipelineStage } from 'mongoose';
import { requirePermission } from '../../middlewares/auth.middleware';
import { validateBody } from '../../middlewares/validation.middleware';
import { escapeRegex, pageMeta, pagination, parseObjectId, queryString } from '../../utils/http';
import { Errors } from '../../utils/errors';
import { emitToOrg } from '../../realtime/emitter';
import { recordAudit } from '../audit/audit.service';
import { Product } from '../products/product.model';
import { Inventory } from './inventory.model';
import { adjustStock, toInventoryDto } from './inventory.service';

export const inventoryRouter = Router();

inventoryRouter.get('/', requirePermission('inventory:read'), async (req: Request, res: Response) => {
  const { page, limit, skip } = pagination(req, { limit: 20, max: 100 });
  const stock = queryString(req, 'stock') ?? 'all';
  const search = queryString(req, 'search');

  const match: Record<string, unknown> = { organizationId: req.tenantId };
  if (stock === 'out') match.available = 0;
  if (stock === 'low') match.$expr = { $lte: ['$available', '$reorderLevel'] };

  const pipeline: PipelineStage[] = [
    { $match: match },
    { $lookup: { from: 'products', localField: 'productId', foreignField: '_id', as: 'product' } },
    { $unwind: '$product' },
  ];
  if (search) {
    const rx = new RegExp(escapeRegex(search), 'i');
    pipeline.push({ $match: { $or: [{ 'product.name': rx }, { 'product.sku': rx }] } });
  }
  // Most urgent first for low/out filters; alphabetical otherwise.
  pipeline.push({ $sort: stock === 'all' ? { 'product.nameLower': 1 } : { available: 1, 'product.nameLower': 1 } });
  pipeline.push({ $facet: { rows: [{ $skip: skip }, { $limit: limit }], total: [{ $count: 'n' }] } });

  const [result] = await Inventory.aggregate(pipeline);
  const rows = (result?.rows ?? []) as Parameters<typeof toInventoryDto>[0] & { product: Parameters<typeof toInventoryDto>[1] }[];
  res.json({
    data: (rows as unknown as (Parameters<typeof toInventoryDto>[0] & { product: Parameters<typeof toInventoryDto>[1] })[]).map(
      (r) => toInventoryDto(r, r.product),
    ),
    meta: pageMeta(page, limit, result?.total?.[0]?.n ?? 0),
  });
});

inventoryRouter.post(
  '/:productId/adjust',
  requirePermission('inventory:adjust'),
  validateBody(adjustInventorySchema),
  async (req: Request, res: Response) => {
    const productId = parseObjectId(String(req.params.productId), 'Product');
    const product = await Product.findOne({ _id: productId, organizationId: req.tenantId }).lean();
    if (!product) throw Errors.notFound('Product');

    const inv = await adjustStock(req.tenantId!, productId, req.body.delta);
    await recordAudit({
      organizationId: req.tenantId!,
      actor: { id: req.auth!.userId, name: req.auth!.name },
      action: 'INVENTORY_ADJUSTED',
      entityType: 'INVENTORY',
      entityId: productId,
      metadata: { sku: product.sku, name: product.name, delta: req.body.delta, reason: req.body.reason, available: inv.available },
      ip: req.ip,
    });
    emitToOrg(req.tenantId!, 'inventory:updated', {
      productId: String(productId),
      available: inv.available,
      reserved: inv.reserved,
    });
    res.json({ data: toInventoryDto(inv.toObject(), product) });
  },
);
