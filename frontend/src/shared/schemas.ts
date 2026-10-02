import { z } from 'zod';
import { COUPON_TYPES, ORDER_STATUSES } from './enums';

const objectId = z.string().regex(/^[a-f0-9]{24}$/i, 'Invalid id');

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1, 'Password is required').max(200),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const createOrderSchema = z.object({
  customer: z.object({
    name: z.string().trim().min(2, 'Customer name is required').max(120),
    email: z.string().trim().toLowerCase().email('Valid email required'),
  }),
  items: z
    .array(
      z.object({
        productId: objectId,
        quantity: z.number().int().min(1).max(1000),
      }),
    )
    .min(1, 'Add at least one product')
    .max(50)
    .refine(
      (items) => new Set(items.map((i) => i.productId)).size === items.length,
      'Each product can only appear once',
    ),
  notes: z.string().trim().max(500).optional(),
});
export type CreateOrderInput = z.infer<typeof createOrderSchema>;

export const updateOrderStatusSchema = z.object({
  status: z.enum(ORDER_STATUSES),
  reason: z.string().trim().max(300).optional(),
});
export type UpdateOrderStatusInput = z.infer<typeof updateOrderStatusSchema>;

/** Our own uploads (`/api/storefront/media/<id>`) or any absolute http(s) image URL. */
export const imageUrlSchema = z
  .string()
  .trim()
  .max(1000)
  .refine((v) => /^\/api\/storefront\/media\/[a-f0-9]{24}$/.test(v) || /^https?:\/\/\S+$/i.test(v), 'Enter a valid image URL');

const productFields = {
  name: z.string().trim().min(2).max(120),
  sku: z.string().trim().toUpperCase().min(2).max(40),
  category: z.string().trim().min(2).max(60),
  /** price in minor units (paise) */
  price: z.number().int().min(0),
  imageUrl: imageUrlSchema.nullable().optional(),
  description: z.string().trim().max(2000).nullable().optional(),
};

export const createProductSchema = z.object({
  ...productFields,
  isActive: z.boolean().default(true),
  initialStock: z.number().int().min(0).default(0),
  reorderLevel: z.number().int().min(0).default(5),
});
export type CreateProductInput = z.infer<typeof createProductSchema>;

/** Stock is not edited here: it moves through `POST /inventory/:productId/adjust` so every change is audited. */
export const updateProductSchema = z
  .object({ ...productFields, isActive: z.boolean(), reorderLevel: z.number().int().min(0) })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update');
export type UpdateProductInput = z.infer<typeof updateProductSchema>;

export const categorySchema = z.object({
  name: z.string().trim().min(2).max(60),
  imageUrl: imageUrlSchema.nullable().optional(),
});
export type CategoryInput = z.infer<typeof categorySchema>;

const dateInput = z
  .string()
  .trim()
  .refine((v) => !Number.isNaN(new Date(v).getTime()), 'Invalid date');

export const couponSchema = z
  .object({
    code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9_-]{3,30}$/, '3–30 letters, digits, - or _'),
    description: z.string().trim().max(200).nullable().optional(),
    type: z.enum(COUPON_TYPES),
    /** PERCENT: 1–100. FIXED: paise. */
    value: z.number().int().min(1),
    /** paise */
    minOrderAmount: z.number().int().min(0).default(0),
    /** paise; caps a PERCENT discount */
    maxDiscount: z.number().int().min(1).nullable().optional(),
    startsAt: dateInput.nullable().optional(),
    expiresAt: dateInput.nullable().optional(),
    usageLimit: z.number().int().min(1).nullable().optional(),
    isActive: z.boolean().default(true),
  })
  .refine((c) => c.type !== 'PERCENT' || c.value <= 100, { message: 'A percentage cannot exceed 100', path: ['value'] })
  .refine((c) => !c.startsAt || !c.expiresAt || new Date(c.expiresAt) > new Date(c.startsAt), {
    message: 'Expiry must be after the start date',
    path: ['expiresAt'],
  });
export type CouponInput = z.infer<typeof couponSchema>;

export const adjustInventorySchema = z.object({
  delta: z
    .number()
    .int()
    .refine((v) => v !== 0, 'Delta cannot be zero'),
  reason: z.string().trim().min(3).max(200),
});
export type AdjustInventoryInput = z.infer<typeof adjustInventorySchema>;
