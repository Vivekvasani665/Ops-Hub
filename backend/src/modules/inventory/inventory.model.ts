import { Schema, model, type InferSchemaType } from 'mongoose';

const inventorySchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    /** sellable units. Invariant: never negative (guarded by conditional updates + validator). */
    available: { type: Number, required: true, min: 0 },
    /** units held by open orders (PENDING..PROCESSING), released on cancel, consumed on ship */
    reserved: { type: Number, required: true, min: 0, default: 0 },
    reorderLevel: { type: Number, required: true, min: 0, default: 5 },
  },
  { timestamps: true },
);

inventorySchema.index({ organizationId: 1, productId: 1 }, { unique: true });
// Low-stock dashboard counter & inventory alerts.
inventorySchema.index({ organizationId: 1, available: 1 });

export type InventoryDoc = InferSchemaType<typeof inventorySchema>;
export const Inventory = model('Inventory', inventorySchema, 'inventory');
