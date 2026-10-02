import { Schema, model, type InferSchemaType } from 'mongoose';

const organizationSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, lowercase: true, trim: true },
    timezone: { type: String, default: 'Asia/Kolkata' },
    currency: { type: String, default: 'INR' },
    status: { type: String, enum: ['ACTIVE', 'SUSPENDED'], default: 'ACTIVE' },
  },
  { timestamps: true },
);

organizationSchema.index({ slug: 1 }, { unique: true });

export type OrganizationDoc = InferSchemaType<typeof organizationSchema>;
export const Organization = model('Organization', organizationSchema, 'organizations');
