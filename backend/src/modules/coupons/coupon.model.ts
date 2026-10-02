import { Schema, model, type InferSchemaType } from 'mongoose';
import { COUPON_TYPES } from '@shared';

/**
 * Discount codes managed from the admin app. Checkout does not redeem them yet: `usedCount` stays 0 until
 * the order flow applies coupons.
 */
const couponSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    code: { type: String, required: true, uppercase: true, trim: true },
    description: { type: String, trim: true, default: null },
    type: { type: String, enum: COUPON_TYPES, required: true },
    /** PERCENT: 1–100. FIXED: paise. */
    value: { type: Number, required: true, min: 1 },
    minOrderAmount: { type: Number, default: 0, min: 0 },
    maxDiscount: { type: Number, default: null },
    startsAt: { type: Date, default: null },
    expiresAt: { type: Date, default: null },
    usageLimit: { type: Number, default: null },
    usedCount: { type: Number, default: 0, min: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

couponSchema.index({ organizationId: 1, code: 1 }, { unique: true });
couponSchema.index({ organizationId: 1, createdAt: -1 });

export type CouponDoc = InferSchemaType<typeof couponSchema>;
export const Coupon = model('Coupon', couponSchema, 'coupons');
