import type { Types } from 'mongoose';
import { ORDER_STATUSES, type DashboardRange, type DashboardSummaryDto, type DashboardTrendPoint, type OrderStatus } from '@shared';
import { env } from '../../config/env';
import { isoDateInTz, startOfDayInTz, weekdayInTz } from '../../utils/time';
import { Order } from '../orders/order.model';
import { Inventory } from '../inventory/inventory.model';
import { Organization } from '../organizations/organization.model';
import { Product } from '../products/product.model';
import { Customer } from '../storefront/customer.model';

const DAY_MS = 86_400_000;

/**
 * Micro-cache: every order event invalidates the dashboard in every open browser of the tenant, so
 * N viewers would otherwise each run a full status aggregation (~190ms of index scan at 100k orders).
 * Concurrent requests share one in-flight computation and results are reused for a few seconds.
 */
const CACHE_TTL_MS = env.NODE_ENV === 'test' ? 0 : 5_000;
const cache = new Map<string, { at: number; value: Promise<DashboardSummaryDto> }>();

export function getDashboardSummaryCached(orgId: Types.ObjectId, rangeDays: DashboardRange = 7): Promise<DashboardSummaryDto> {
  const key = `${String(orgId)}:${rangeDays}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value;
  const value = getDashboardSummary(orgId, new Date(), rangeDays);
  cache.set(key, { at: Date.now(), value });
  value.catch(() => cache.delete(key));
  return value;
}

/**
 * Every query below starts with `{ organizationId }` and is served by an index whose prefix is
 * organizationId (see order.model / inventory.model), so cost scales with the tenant's own data.
 * "Today" is computed in the organization's timezone, not the server's.
 */
export async function getDashboardSummary(
  orgId: Types.ObjectId,
  now = new Date(),
  rangeDays: DashboardRange = 7,
): Promise<DashboardSummaryDto> {
  const org = await Organization.findById(orgId).select({ timezone: 1 }).lean();
  const tz = org?.timezone ?? env.ORG_TIMEZONE;

  const trendStart = startOfDayInTz(now, tz, rangeDays - 1);
  const last7Start = startOfDayInTz(now, tz, 6);
  const prev7Start = startOfDayInTz(now, tz, 13);

  const [
    byStatus,
    trendRows,
    deliveredRows,
    lowStockProducts,
    outOfStockProducts,
    revenueRows,
    totalProducts,
    totalCustomers,
    newCustomers,
  ] = await Promise.all([
    Order.aggregate<{ _id: OrderStatus; n: number }>([
      { $match: { organizationId: orgId } },
      { $group: { _id: '$status', n: { $sum: 1 } } },
    ]),
    Order.aggregate<{ _id: string; orders: number; revenue: number }>([
      { $match: { organizationId: orgId, createdAt: { $gte: trendStart } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: tz } },
          orders: { $sum: 1 },
          revenue: { $sum: { $cond: [{ $eq: ['$status', 'CANCELLED'] }, 0, '$totalAmount'] } },
        },
      },
    ]),
    // DELIVERED is terminal, so updatedAt is the delivery time.
    Order.aggregate<{ _id: 'current' | 'previous'; n: number }>([
      { $match: { organizationId: orgId, status: 'DELIVERED', updatedAt: { $gte: prev7Start } } },
      {
        $group: {
          _id: { $cond: [{ $gte: ['$updatedAt', last7Start] }, 'current', 'previous'] },
          n: { $sum: 1 },
        },
      },
    ]),
    Inventory.countDocuments({
      organizationId: orgId,
      available: { $gt: 0 },
      $expr: { $lte: ['$available', '$reorderLevel'] },
    }),
    Inventory.countDocuments({ organizationId: orgId, available: 0 }),
    Order.aggregate<{ total: number }>([
      { $match: { organizationId: orgId, status: { $ne: 'CANCELLED' } } },
      { $group: { _id: null, total: { $sum: '$totalAmount' } } },
    ]),
    Product.countDocuments({ organizationId: orgId }),
    Customer.countDocuments({ organizationId: orgId }),
    Customer.countDocuments({ organizationId: orgId, createdAt: { $gte: trendStart } }),
  ]);

  const statusDistribution = Object.fromEntries(ORDER_STATUSES.map((s) => [s, 0])) as Record<OrderStatus, number>;
  for (const row of byStatus) statusDistribution[row._id] = row.n;

  const byDay = new Map(trendRows.map((r) => [r._id, r]));
  const trend: DashboardTrendPoint[] = Array.from({ length: rangeDays }, (_, i) => {
    // Midday of each local day avoids DST edge cases when formatting.
    const instant = new Date(trendStart.getTime() + i * DAY_MS + DAY_MS / 2);
    const date = isoDateInTz(instant, tz);
    const row = byDay.get(date);
    return { date, label: weekdayInTz(instant, tz), orders: row?.orders ?? 0, revenue: row?.revenue ?? 0 };
  });
  const today = trend[rangeDays - 1]!;
  const yesterday = trend[rangeDays - 2]!;
  const delivered = Object.fromEntries(deliveredRows.map((r) => [r._id, r.n]));

  return {
    ordersToday: today.orders,
    ordersYesterday: yesterday.orders,
    pendingOrders: statusDistribution.PENDING,
    processingOrders: statusDistribution.PROCESSING,
    deliveredOrders: statusDistribution.DELIVERED,
    deliveredLast7Days: delivered.current ?? 0,
    deliveredPrev7Days: delivered.previous ?? 0,
    cancelledOrders: statusDistribution.CANCELLED,
    totalOrders: Object.values(statusDistribution).reduce((a, b) => a + b, 0),
    revenueToday: today.revenue,
    revenueYesterday: yesterday.revenue,
    lowStockProducts,
    outOfStockProducts,
    totalRevenue: revenueRows[0]?.total ?? 0,
    totalProducts,
    totalCustomers,
    newCustomers,
    statusDistribution,
    trend,
    rangeDays,
    generatedAt: now.toISOString(),
  };
}
