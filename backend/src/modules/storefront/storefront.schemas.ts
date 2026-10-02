import { z } from 'zod';
import { createOrderSchema } from '@shared';

// Storefront-only request contracts. Kept out of `@shared` because that folder is mirrored into the admin app.

export const registerCustomerSchema = z.object({
  name: z.string().trim().min(2, 'Name is required').max(80),
  email: z.string().trim().toLowerCase().email('Valid email required'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(200)
    .regex(/[A-Za-z]/, 'Password must contain a letter')
    .regex(/[0-9]/, 'Password must contain a number'),
  phone: z.string().trim().max(20).optional(),
});
export type RegisterCustomerInput = z.infer<typeof registerCustomerSchema>;

export const customerLoginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1, 'Password is required').max(200),
});

export const checkoutSchema = z.object({
  items: createOrderSchema.shape.items,
  shipping: z.object({
    fullName: z.string().trim().min(2, 'Name is required').max(80),
    phone: z.string().trim().regex(/^[0-9+\-\s()]{7,20}$/, 'Valid phone number required'),
    line1: z.string().trim().min(3, 'Address is required').max(120),
    line2: z.string().trim().max(120).optional(),
    city: z.string().trim().min(2, 'City is required').max(60),
    state: z.string().trim().min(2, 'State is required').max(60),
    postalCode: z.string().trim().regex(/^[A-Za-z0-9\s-]{3,12}$/, 'Valid postal code required'),
  }),
  notes: z.string().trim().max(200).optional(),
});
export type CheckoutInput = z.infer<typeof checkoutSchema>;
