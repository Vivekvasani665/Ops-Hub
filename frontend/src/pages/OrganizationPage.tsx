import { Building2, Package, ShoppingCart, Users } from 'lucide-react';
import { useOrganization } from '@/features/misc/hooks';
import { formatDate, formatNumber } from '@/lib/utils';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { ErrorState } from '@/components/ui/ErrorState';

export function OrganizationPage() {
  const org = useOrganization();
  if (org.isPending)
    return (
      <div className="space-y-5">
        <Skeleton className="h-8 w-60" />
        <Skeleton className="h-48" />
      </div>
    );
  if (org.isError)
    return (
      <Card>
        <ErrorState error={org.error} onRetry={() => org.refetch()} />
      </Card>
    );
  const o = org.data;
  const stats = [
    { label: 'Users', value: o.stats.users, icon: Users, cls: 'bg-indigo-50 text-indigo-600' },
    { label: 'Products', value: o.stats.products, icon: Package, cls: 'bg-violet-50 text-violet-600' },
    { label: 'Orders', value: o.stats.orders, icon: ShoppingCart, cls: 'bg-blue-50 text-blue-600' },
  ];
  const details = [
    ['Name', o.name],
    ['Slug', o.slug],
    ['Organization ID', o.id],
    ['Timezone', o.timezone],
    ['Currency', o.currency],
    ['Created', formatDate(o.createdAt)],
  ];
  return (
    <div className="space-y-5">
      <PageHeader title="Organization" description="Your tenant. All data you see is isolated to this organization." />
      <div className="grid gap-4 sm:grid-cols-3">
        {stats.map((s) => (
          <Card key={s.label} className="flex items-center gap-4 p-5">
            <span className={`flex h-11 w-11 items-center justify-center rounded-lg ${s.cls}`}>
              <s.icon className="h-5 w-5" />
            </span>
            <span>
              <span className="block text-sm text-slate-500">{s.label}</span>
              <span className="block text-2xl font-semibold text-slate-900">{formatNumber(s.value)}</span>
            </span>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader title={<span className="flex items-center gap-2"><Building2 className="h-4 w-4 text-slate-400" /> Details</span>} />
        <CardBody>
          <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
            {details.map(([k, v]) => (
              <div key={k}>
                <dt className="text-xs text-slate-500">{k}</dt>
                <dd className={`mt-0.5 text-sm break-all text-slate-800 ${k === 'Organization ID' ? 'font-mono' : ''}`}>{v}</dd>
              </div>
            ))}
          </dl>
        </CardBody>
      </Card>
    </div>
  );
}
