/**
 * npm run seed                 → seed if empty (800 Acme orders)
 * npm run seed -- --reset      → wipe and reseed
 * npm run seed:100k            → wipe and seed 100,000 Acme orders (performance testing)
 */
import { connectDatabase, disconnectDatabase } from '../src/config/database';
import { seedDatabase } from '../src/seed/seed';

const args = process.argv.slice(2);
const ordersIdx = args.indexOf('--orders');
const orders = ordersIdx >= 0 ? Number(args[ordersIdx + 1]) : 800;
const reset = args.includes('--reset');

if (!Number.isInteger(orders) || orders < 0) {
  console.error('--orders must be a non-negative integer');
  process.exit(1);
}

await connectDatabase();
try {
  await seedDatabase({ orders, reset });
} finally {
  await disconnectDatabase();
}
