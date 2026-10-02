import { Router, type Request, type Response } from 'express';
import type { FilterQuery } from 'mongoose';
import { couponSchema, type CouponDto, type CouponInput } from '@shared';
import { requirePermission } from '../../middlewares/auth.middleware';
import { validateBody } from '../../middlewares/validation.middleware';
import { escapeRegex, pageMeta, pagination, parseObjectId, queryString } from '../../utils/http';
import { Errors } from '../../utils/errors';
import { recordAudit } from '../audit/audit.service';
import { Coupon, type CouponDoc } from './coupon.model';

export const couponRouter = Router();

type CouponSource = CouponDoc & { _id: unknown; createdAt: Date };

function toCouponDto(c: CouponSource): CouponDto {
  const iso = (d: Date | null | undefined) => (d ? new Date(d).toISOString() : null);
  return {
    id: String(c._id),
    code: c.code,
    description: c.description ?? null,
    type: c.type,
    value: c.value,
    minOrderAmount: c.minOrderAmount ?? 0,
    maxDiscount: c.maxDiscount ?? null,
    startsAt: iso(c.startsAt),
    expiresAt: iso(c.expiresAt),
    usageLimit: c.usageLimit ?? null,
    usedCount: c.usedCount ?? 0,
    isActive: c.isActive,
    createdAt: new Date(c.createdAt).toISOString(),
  };
}

function toFields(body: CouponInput) {
  return {
    code: body.code,
    description: body.description || null,
    type: body.type,
    value: body.value,
    minOrderAmount: body.minOrderAmount,
    // A cap only means something on a percentage discount.
    maxDiscount: body.type === 'PERCENT' ? (body.maxDiscount ?? null) : null,
    startsAt: body.startsAt ? new Date(body.startsAt) : null,
    expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
    usageLimit: body.usageLimit ?? null,
    isActive: body.isActive,
  };
}

const isDuplicateKey = (err: unknown) => (err as { code?: number }).code === 11000;
const duplicate = (code: string) => Errors.conflict('DUPLICATE_COUPON', `Coupon ${code} already exists`);

couponRouter.get('/', requirePermission('coupons:read'), async (req: Request, res: Response) => {
  const { page, limit, skip } = pagination(req, { limit: 10, max: 100 });
  const filter: FilterQuery<CouponDoc> = { organizationId: req.tenantId };
  const search = queryString(req, 'search');
  if (search) filter.code = new RegExp(`^${escapeRegex(search.toUpperCase())}`);
  const now = new Date();
  switch (queryString(req, 'status')) {
    case 'active':
      Object.assign(filter, {
        isActive: true,
        $and: [
          { $or: [{ startsAt: null }, { startsAt: { $lte: now } }] },
          { $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }] },
        ],
      });
      break;
    case 'inactive':
      filter.isActive = false;
      break;
    case 'expired':
      filter.expiresAt = { $lte: now };
      break;
  }
  const [coupons, total] = await Promise.all([
    Coupon.find(filter).sort({ createdAt: -1, _id: -1 }).skip(skip).limit(limit).lean(),
    Coupon.countDocuments(filter),
  ]);
  res.json({ data: coupons.map(toCouponDto), meta: pageMeta(page, limit, total) });
});

couponRouter.post('/', requirePermission('coupons:write'), validateBody(couponSchema), async (req: Request, res: Response) => {
  const body = req.body as CouponInput;
  try {
    const coupon = await Coupon.create({ organizationId: req.tenantId, ...toFields(body) });
    await recordAudit({
      organizationId: req.tenantId!,
      actor: { id: req.auth!.userId, name: req.auth!.name },
      action: 'COUPON_CREATED',
      entityType: 'COUPON',
      entityId: coupon._id,
      metadata: { code: coupon.code, type: coupon.type, value: coupon.value },
      ip: req.ip,
    });
    res.status(201).json({ data: toCouponDto(coupon.toObject()) });
  } catch (err) {
    if (isDuplicateKey(err)) throw duplicate(body.code);
    throw err;
  }
});

couponRouter.patch('/:id', requirePermission('coupons:write'), validateBody(couponSchema), async (req: Request, res: Response) => {
  const id = parseObjectId(String(req.params.id), 'Coupon');
  const body = req.body as CouponInput;
  try {
    const coupon = await Coupon.findOneAndUpdate(
      { _id: id, organizationId: req.tenantId },
      { $set: toFields(body) },
      { new: true, runValidators: true },
    ).lean();
    if (!coupon) throw Errors.notFound('Coupon');
    await recordAudit({
      organizationId: req.tenantId!,
      actor: { id: req.auth!.userId, name: req.auth!.name },
      action: 'COUPON_UPDATED',
      entityType: 'COUPON',
      entityId: id,
      metadata: { code: coupon.code, isActive: coupon.isActive },
      ip: req.ip,
    });
    res.json({ data: toCouponDto(coupon) });
  } catch (err) {
    if (isDuplicateKey(err)) throw duplicate(body.code);
    throw err;
  }
});

couponRouter.delete('/:id', requirePermission('coupons:write'), async (req: Request, res: Response) => {
  const id = parseObjectId(String(req.params.id), 'Coupon');
  const coupon = await Coupon.findOneAndDelete({ _id: id, organizationId: req.tenantId }).lean();
  if (!coupon) throw Errors.notFound('Coupon');
  await recordAudit({
    organizationId: req.tenantId!,
    actor: { id: req.auth!.userId, name: req.auth!.name },
    action: 'COUPON_DELETED',
    entityType: 'COUPON',
    entityId: id,
    metadata: { code: coupon.code },
    ip: req.ip,
  });
  res.json({ data: { id: String(id), deleted: true } });
});
