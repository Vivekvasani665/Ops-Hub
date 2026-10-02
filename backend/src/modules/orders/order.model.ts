import { Schema, model, type InferSchemaType } from 'mongoose';
import { ORDER_STATUSES } from '@shared';

const orderItemSchema = new Schema(
  {
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    name: { type: String, required: true },
    sku: { type: String, required: true },
    unitPrice: { type: Number, required: true },
    quantity: { type: Number, required: true, min: 1 },
    lineTotal: { type: Number, required: true },
  },
  { _id: false },
);

const statusChangeSchema = new Schema(
  {
    from: { type: String, enum: [...ORDER_STATUSES, null], default: null },
    to: { type: String, enum: ORDER_STATUSES, required: true },
    changedBy: { id: Schema.Types.ObjectId, name: String },
    reason: String,
    at: { type: Date, required: true },
  },
  { _id: false },
);

const orderSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    orderNumber: { type: Number, required: true },
    customer: {
      type: new Schema(
        {
          name: { type: String, required: true },
          email: { type: String, required: true },
          nameLower: { type: String, required: true },
        },
        { _id: false },
      ),
      required: true,
    },
    items: { type: [orderItemSchema], required: true },
    totalAmount: { type: Number, required: true, min: 0 },
    status: { type: String, enum: ORDER_STATUSES, required: true, default: 'PENDING' },
    notes: String,
    statusHistory: { type: [statusChangeSchema], default: [] },
    createdBy: { id: { type: Schema.Types.ObjectId, required: true }, name: String },
  },
  { timestamps: true },
);

// Default list view: newest orders in an org. `_id` is the tie-breaker of the list sort, so the
// index delivers rows already in sort order (no in-memory SORT stage) and pagination stays stable.
orderSchema.index({ organizationId: 1, createdAt: -1, _id: -1 });
// Status filter + dashboard counters.
orderSchema.index({ organizationId: 1, status: 1, createdAt: -1, _id: -1 });
// Lookup by human order number; also guarantees uniqueness per tenant.
orderSchema.index({ organizationId: 1, orderNumber: 1 }, { unique: true });
// Prefix search on customer name / email.
orderSchema.index({ organizationId: 1, 'customer.nameLower': 1, createdAt: -1 });
orderSchema.index({ organizationId: 1, 'customer.email': 1, createdAt: -1 });

export type OrderDoc = InferSchemaType<typeof orderSchema>;
export const Order = model('Order', orderSchema, 'orders');

/** Per-organization sequence for human-friendly order numbers (#1024). */
const counterSchema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, required: true },
  name: { type: String, required: true },
  seq: { type: Number, required: true, default: 1000 },
});
counterSchema.index({ organizationId: 1, name: 1 }, { unique: true });
export const Counter = model('Counter', counterSchema, 'counters');
