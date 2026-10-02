import { Schema, model, type InferSchemaType } from 'mongoose';

/**
 * Shoppers of the customer web storefront. Kept apart from staff `User`s on purpose: customers have no
 * role, never appear in the admin Users page, and cannot authenticate against the staff API.
 */
const customerSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    phone: { type: String, trim: true, default: null },
    status: { type: String, enum: ['ACTIVE', 'DISABLED'], default: 'ACTIVE' },
    failedLoginAttempts: { type: Number, default: 0 },
    lockUntil: { type: Date, default: null },
    lastLoginAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// One account per email per store.
customerSchema.index({ organizationId: 1, email: 1 }, { unique: true });

export type CustomerDoc = InferSchemaType<typeof customerSchema>;
export const Customer = model('Customer', customerSchema, 'customers');

const customerSessionSchema = new Schema(
  {
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true },
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    /** sha256 of the opaque refresh token; the raw token only lives in the httpOnly cookie */
    tokenHash: { type: String, required: true },
    /** rotation chain; reuse of a revoked token revokes the whole family */
    familyId: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
    userAgent: String,
    ip: String,
  },
  { timestamps: true },
);

customerSessionSchema.index({ tokenHash: 1 }, { unique: true });
customerSessionSchema.index({ familyId: 1 });
customerSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const CustomerSession = model('CustomerSession', customerSessionSchema, 'customer_sessions');
