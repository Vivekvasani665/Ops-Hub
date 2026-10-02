import { Link } from 'react-router';
import { ArrowRight, Package } from 'lucide-react';
import { useInventory } from '@/features/inventory/hooks';
import { useNotifications } from '@/features/misc/hooks';
import { useRecentActivity } from '@/features/audit/hooks';
import { useCan } from '@/features/auth/hooks';
import { describeAudit, auditMeta } from '@/lib/audit';
import { cn, timeAgo } from '@/lib/utils';
import { Card, CardHeader } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { ErrorState } from '@/components/ui/ErrorState';
import { StockBadge } from '@/components/inventory/StockBadge';
import { NotificationIcon, notificationLink } from '@/components/layout/notification-icon';

function ListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-4 px-5 pt-4 pb-5">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="h-9 w-9 rounded-full" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-3/4" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function InventoryAlertsCard() {
  const inv = useInventory({ stock: 'low', limit: 3 });
  return (
    <Card className="flex h-full flex-col">
      <CardHeader title="Inventory Alerts" />
      {inv.isPending ? (
        <ListSkeleton />
      ) : inv.isError ? (
        <ErrorState compact error={inv.error} onRetry={() => inv.refetch()} />
      ) : inv.data.data.length === 0 ? (
        <p className="flex-1 px-5 py-8 text-center text-sm text-slate-500">All products are well stocked.</p>
      ) : (
        <ul className="flex-1 divide-y divide-slate-100 px-5 pt-2">
          {inv.data.data.map((item) => (
            <li key={item.id} className="flex items-center gap-3 py-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-500">
                <Package className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-slate-800">{item.product.name}</span>
                <span className="block text-xs text-slate-500">SKU: {item.product.sku}</span>
              </span>
              <StockBadge status={item.stockStatus} available={item.available} />
            </li>
          ))}
        </ul>
      )}
      <Link to="/inventory?stock=low" className="flex items-center gap-1 px-5 py-4 text-sm font-medium text-blue-600 hover:text-blue-700">
        View all inventory <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </Card>
  );
}

export function RecentNotificationsCard() {
  const q = useNotifications(3);
  return (
    <Card>
      <CardHeader
        title="Recent Notifications"
        action={
          <Link to="/audit-logs" className="text-xs font-medium text-blue-600 hover:text-blue-700">
            View all
          </Link>
        }
      />
      {q.isPending ? (
        <ListSkeleton />
      ) : q.isError ? (
        <ErrorState compact error={q.error} onRetry={() => q.refetch()} />
      ) : q.data.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-slate-500">No notifications yet.</p>
      ) : (
        <ul className="divide-y divide-slate-100 px-5 pt-2 pb-2">
          {q.data.map((n) => {
            const link = notificationLink(n);
            const body = (
              <>
                <NotificationIcon notification={n} />
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-slate-800">{n.title}</span>
                  <span className="block text-xs text-slate-500">{timeAgo(n.createdAt)}</span>
                </span>
              </>
            );
            return (
              <li key={n.id}>
                {link ? (
                  <Link to={link} className="flex items-center gap-3 py-3.5 hover:opacity-80">
                    {body}
                  </Link>
                ) : (
                  <div className="flex items-center gap-3 py-3.5">{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function ActivityList() {
  const q = useRecentActivity(5);
  if (q.isPending) return <ListSkeleton rows={5} />;
  if (q.isError) return <ErrorState compact error={q.error} onRetry={() => q.refetch()} />;
  if (q.data.length === 0) return <p className="px-5 py-8 text-center text-sm text-slate-500">No activity yet.</p>;
  return (
    <ol className="px-5 pt-3 pb-5">
      {q.data.map((log, i) => {
        const meta = auditMeta(log.action);
        const { title, detail } = describeAudit(log);
        const Icon = meta.icon;
        const last = i === q.data.length - 1;
        return (
          <li key={log.id} className="relative flex gap-3 pb-5 last:pb-0">
            {!last && <span className="absolute top-9 bottom-0 left-[17px] w-px bg-slate-200" aria-hidden />}
            <span className={cn('relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full ring-4', meta.tone)}>
              <Icon className="h-4 w-4" />
            </span>
            <span className="min-w-0 pt-0.5">
              <span className="block text-sm font-medium text-slate-800">{title}</span>
              {detail && <span className="block truncate text-xs text-slate-600">{detail}</span>}
              <span className="block text-xs text-slate-400">{timeAgo(log.createdAt)}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export function RecentActivityCard() {
  const canRead = useCan('audit:read');
  return (
    <Card>
      <CardHeader title="Recent Activity" />
      {canRead ? (
        <ActivityList />
      ) : (
        <p className="px-5 py-8 text-center text-sm text-slate-500">Activity is visible to managers and admins.</p>
      )}
    </Card>
  );
}
