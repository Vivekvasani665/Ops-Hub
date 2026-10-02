import { Schema, model, type InferSchemaType } from 'mongoose';

const productSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    name: { type: String, required: true, trim: true },
    nameLower: { type: String, required: true },
    sku: { type: String, required: true, uppercase: true, trim: true },
    category: { type: String, required: true, trim: true },
    price: { type: Number, required: true, min: 0 }, // minor units (paise)
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

productSchema.index({ organizationId: 1, sku: 1 }, { unique: true });
productSchema.index({ organizationId: 1, nameLower: 1 });

productSchema.pre('validate', function () {
  if (this.name) this.nameLower = this.name.toLowerCase();
});

export type ProductDoc = InferSchemaType<typeof productSchema>;
export const Product = model('Product', productSchema, 'products');
