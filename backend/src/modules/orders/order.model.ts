import { Schema, model, type InferSchemaType } from 'mongoose';
import { ORDER_STATUSES, PAYMENT_GATEWAYS, PAYMENT_METHODS, PAYMENT_STATUSES } from '@shared';

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

/** Gateway details of a storefront order. Amounts are never stored here: `totalAmount` is the only price. */
const paymentSchema = new Schema(
  {
    gateway: { type: String, enum: [...PAYMENT_GATEWAYS, null], default: null },
    /** PayU txnid of the latest attempt. */
    gatewayOrderId: { type: String, default: null },
    /** Every txnid ever issued for this order, so a payment on any attempt can be found and applied once. */
    txnIds: { type: [String], default: undefined },
    /** PayU mihpayid of the successful transaction. */
    gatewayTransactionId: { type: String, default: null },
    instrument: { type: String, default: null },
    instrumentDetail: { type: String, default: null },
    paidAt: { type: Date, default: null },
    refundId: { type: String, default: null },
    refundedAt: { type: Date, default: null },
    lastError: { type: String, default: null },
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
    // Unset on orders created by staff in the admin app.
    paymentMethod: { type: String, enum: PAYMENT_METHODS },
    paymentStatus: { type: String, enum: PAYMENT_STATUSES },
    payment: { type: paymentSchema, default: undefined },
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
// PayU callback / verification lookup; a txnid belongs to exactly one order.
orderSchema.index(
  { 'payment.txnIds': 1 },
  { name: 'payu_txnids', unique: true, partialFilterExpression: { 'payment.txnIds': { $exists: true } } },
);
// Sweep of online orders whose payment never completed (paid orders leave PENDING).
orderSchema.index(
  { createdAt: 1 },
  { name: 'unpaid_payu_orders', partialFilterExpression: { paymentMethod: 'ONLINE', status: 'PENDING' } },
);

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
