import { Schema, model, type InferSchemaType } from 'mongoose';
import { ROLES } from '@shared';

const userSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ROLES, required: true },
    status: { type: String, enum: ['ACTIVE', 'DISABLED'], default: 'ACTIVE' },
    failedLoginAttempts: { type: Number, default: 0 },
    lockUntil: { type: Date, default: null },
    lastLoginAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// Login looks users up by email alone, so email is globally unique.
userSchema.index({ email: 1 }, { unique: true });
// Users list inside an organization.
userSchema.index({ organizationId: 1, createdAt: -1 });

export type UserDoc = InferSchemaType<typeof userSchema>;
export const User = model('User', userSchema, 'users');
