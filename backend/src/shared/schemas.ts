import { z } from 'zod';
import { ORDER_STATUSES } from './enums';

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

export const createProductSchema = z.object({
  name: z.string().trim().min(2).max(120),
  sku: z.string().trim().toUpperCase().min(2).max(40),
  category: z.string().trim().min(2).max(60),
  /** price in minor units (paise) */
  price: z.number().int().min(0),
  initialStock: z.number().int().min(0).default(0),
  reorderLevel: z.number().int().min(0).default(5),
});
export type CreateProductInput = z.infer<typeof createProductSchema>;

export const adjustInventorySchema = z.object({
  delta: z
    .number()
    .int()
    .refine((v) => v !== 0, 'Delta cannot be zero'),
  reason: z.string().trim().min(3).max(200),
});
export type AdjustInventoryInput = z.infer<typeof adjustInventorySchema>;
