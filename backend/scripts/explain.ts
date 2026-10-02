/**
 * Prints MongoDB query plans for the hot queries. Run after `npm run seed:100k`:
 *   npm run explain
 * For each query: winning plan stages, index used, keys/docs examined vs returned, and time.
 */
import type { Types } from 'mongoose';
import { connectDatabase, disconnectDatabase } from '../src/config/database';
import { Organization } from '../src/modules/organizations/organization.model';
import { Order } from '../src/modules/orders/order.model';
import { AuditLog } from '../src/modules/audit/audit.model';
import { Job } from '../src/modules/jobs/job.model';
import { Inventory } from '../src/modules/inventory/inventory.model';
import { startOfDayInTz } from '../src/utils/time';

type Plan = { stage?: string; indexName?: string; inputStage?: Plan; inputStages?: Plan[]; queryPlan?: Plan };

function walk(plan: Plan | undefined, out: { stages: string[]; indexes: Set<string> }) {
  if (!plan) return out;
  if (plan.stage) out.stages.push(plan.stage);
  if (plan.indexName) out.indexes.add(plan.indexName);
  walk(plan.queryPlan, out);
  walk(plan.inputStage, out);
  for (const s of plan.inputStages ?? []) walk(s, out);
  return out;
}

function summarize(name: string, explain: any) { // explain output is untyped
  // find() explains have queryPlanner at the top; aggregate explains nest it under stages[0].$cursor.
  const root = explain.queryPlanner ? explain : (explain.stages?.[0]?.$cursor ?? explain);
  const stats = root.executionStats ?? {};
  const { stages, indexes } = walk(root.queryPlanner?.winningPlan, { stages: [], indexes: new Set() });
  const blockingSort = stages.includes('SORT');
  const collscan = stages.includes('COLLSCAN');
  console.log(`\n■ ${name}`);
  console.log(`  plan:      ${stages.join(' ← ') || 'n/a'}`);
  console.log(`  index:     ${[...indexes].join(', ') || '— none —'}`);
  console.log(
    `  examined:  keys=${stats.totalKeysExamined ?? '?'} docs=${stats.totalDocsExamined ?? '?'} returned=${stats.nReturned ?? '?'}  time=${stats.executionTimeMillis ?? '?'}ms`,
  );
  if (collscan) console.log('  ⚠ COLLSCAN — no index used');
  if (blockingSort) console.log('  ⚠ in-memory SORT stage');
}

await connectDatabase();
const org = await Organization.findOne({ slug: 'acme' }).lean();
if (!org) throw new Error('Seed the database first: npm run seed:100k');
const orgId = org._id as Types.ObjectId;
const total = await Order.countDocuments({ organizationId: orgId });
console.log(`Acme Merchant: ${total.toLocaleString()} orders`);

const listSort = { createdAt: -1, _id: -1 } as const;
summarize('GET /orders (page 1)', await Order.find({ organizationId: orgId }).sort(listSort).limit(10).explain('executionStats'));
summarize(
  'GET /orders?status=PENDING (page 1)',
  await Order.find({ organizationId: orgId, status: 'PENDING' }).sort(listSort).limit(10).explain('executionStats'),
);
summarize(
  'GET /orders (page 500, skip 4990)',
  await Order.find({ organizationId: orgId }).sort(listSort).skip(4990).limit(10).explain('executionStats'),
);
summarize(
  'GET /orders?search=rahul (customer prefix)',
  await Order.find({
    organizationId: orgId,
    $or: [{ 'customer.nameLower': { $regex: '^rahul' } }, { 'customer.email': { $regex: '^rahul' } }],
  })
    .sort(listSort)
    .limit(10)
    .explain('executionStats'),
);
summarize('GET /orders?search=#1024', await Order.find({ organizationId: orgId, orderNumber: 1024 }).explain('executionStats'));
summarize(
  'Order count (pagination total)',
  await Order.aggregate([{ $match: { organizationId: orgId } }, { $group: { _id: null, n: { $sum: 1 } } }]).explain('executionStats'),
);

const weekAgo = startOfDayInTz(new Date(), org.timezone, 6);
summarize(
  'Dashboard: status distribution',
  await Order.aggregate([{ $match: { organizationId: orgId } }, { $group: { _id: '$status', n: { $sum: 1 } } }]).explain(
    'executionStats',
  ),
);
summarize(
  'Dashboard: 7-day trend',
  await Order.aggregate([
    { $match: { organizationId: orgId, createdAt: { $gte: weekAgo } } },
    { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, n: { $sum: 1 } } },
  ]).explain('executionStats'),
);
summarize(
  'Dashboard: low stock count',
  await Inventory.find({ organizationId: orgId, available: { $gt: 0 }, $expr: { $lte: ['$available', '$reorderLevel'] } }).explain(
    'executionStats',
  ),
);

summarize('GET /audit-logs (first page)', await AuditLog.find({ organizationId: orgId }).sort(listSort).limit(21).explain('executionStats'));
const mid = await AuditLog.find({ organizationId: orgId }).sort(listSort).skip(50_000).limit(1).lean();
if (mid[0]) {
  summarize(
    'GET /audit-logs (cursor at row 50,000)',
    await AuditLog.find({
      organizationId: orgId,
      createdAt: { $lte: mid[0].createdAt },
      $or: [{ createdAt: { $lt: mid[0].createdAt } }, { createdAt: mid[0].createdAt, _id: { $lt: mid[0]._id } }],
    })
      .sort(listSort)
      .limit(21)
      .explain('executionStats'),
  );
}
summarize(
  'GET /audit-logs?action=ORDER_CREATED',
  await AuditLog.find({ organizationId: orgId, action: 'ORDER_CREATED' }).sort({ createdAt: -1 }).limit(21).explain('executionStats'),
);

summarize(
  'Worker: claim next job',
  await Job.find({
    $or: [
      { status: 'PENDING', availableAt: { $lte: new Date() } },
      { status: 'PROCESSING', lockedUntil: { $lt: new Date() } },
    ],
  })
    .sort({ availableAt: 1 })
    .limit(1)
    .explain('executionStats'),
);

await disconnectDatabase();
