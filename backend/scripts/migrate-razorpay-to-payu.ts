/**
 * npm run migrate:payu — one-off, idempotent switch of stored data from Razorpay to PayU.
 *
 * - orders with paymentMethod RAZORPAY become ONLINE; their Razorpay ids move to the generic gateway fields
 * - drops the Razorpay-only indexes (payment.razorpayOrderId_1, unpaid_online_orders) and payment_events
 * - builds the PayU indexes (payu_txnids, unpaid_payu_orders)
 */
import mongoose from 'mongoose';
import { connectDatabase, disconnectDatabase } from '../src/config/database';
import { Order } from '../src/modules/orders/order.model';

await connectDatabase();
try {
  const db = mongoose.connection.db!;
  const orders = db.collection('orders');

  const converted = await orders.updateMany({ paymentMethod: 'RAZORPAY' }, [
    {
      $set: {
        paymentMethod: 'ONLINE',
        'payment.gatewayOrderId': { $ifNull: ['$payment.razorpayOrderId', null] },
        'payment.gatewayTransactionId': { $ifNull: ['$payment.razorpayPaymentId', null] },
      },
    },
    { $unset: ['payment.razorpayOrderId', 'payment.razorpayPaymentId'] },
  ]);
  console.log(`Orders converted from RAZORPAY to ONLINE: ${converted.modifiedCount}`);

  const existing = new Set((await orders.indexes()).map((i) => i.name));
  for (const name of ['payment.razorpayOrderId_1', 'unpaid_online_orders']) {
    if (existing.has(name)) {
      await orders.dropIndex(name);
      console.log(`Dropped index ${name}`);
    }
  }

  if ((await db.listCollections({ name: 'payment_events' }).toArray()).length) {
    await db.dropCollection('payment_events');
    console.log('Dropped collection payment_events (Razorpay webhook deliveries)');
  }

  await Order.createIndexes();
  console.log(`Order indexes: ${(await orders.indexes()).map((i) => i.name).join(', ')}`);
} finally {
  await disconnectDatabase();
}
