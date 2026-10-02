import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Search, Users } from 'lucide-react';
import { useCustomers } from '@/features/catalog/hooks';
import { useDebounce } from '@/hooks/useDebounce';
import { formatDate, formatMoney, formatNumber, initials, timeAgo } from '@/lib/utils';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Badge } from '@/components/ui/Badge';
import { Pagination } from '@/components/ui/Pagination';
import { TableSkeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/Table';

const STATUS_OPTIONS = [
  { value: 'ACTIVE', label: 'Active' },
  { value: 'DISABLED', label: 'Disabled' },
];

export function CustomersPage() {
  const [params, setParams] = useSearchParams();
  const urlSearch = params.get('search') ?? '';
  const status = (params.get('status') ?? '') as 'ACTIVE' | 'DISABLED' | '';
  const page = Math.max(1, Number(params.get('page')) || 1);
  const [search, setSearch] = useState(urlSearch);
  const debounced = useDebounce(search.trim(), 300);

  const update = (patch: Record<string, string | number | undefined>) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(patch)) {
          if (v === undefined || v === '') next.delete(k);
          else next.set(k, String(v));
        }
        if (!('page' in patch)) next.delete('page');
        return next;
      },
      { replace: true },
    );

  useEffect(() => setSearch(urlSearch), [urlSearch]);
  useEffect(() => {
    if (debounced !== urlSearch.trim()) update({ search: debounced });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  const customers = useCustomers({ search: urlSearch.trim(), status, page, limit: 10 });
  const rows = customers.data?.data ?? [];
  const filtered = Boolean(urlSearch || status);

  return (
    <div>
      <PageHeader
        title="Customers"
        breadcrumbs={[{ label: 'Dashboard', to: '/dashboard' }, { label: 'Customers' }]}
        description="Shoppers with a storefront account. Totals exclude cancelled orders."
      />
      <Card>
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center">
          <Input
            className="sm:w-80"
            icon={<Search className="h-4 w-4" />}
            placeholder="Search by name or email"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Select
            className="sm:w-40"
            aria-label="Status"
            placeholder="All Status"
            options={STATUS_OPTIONS}
            value={status}
            onChange={(e) => update({ status: e.target.value })}
          />
        </div>
        {customers.isPending ? (
          <TableSkeleton rows={8} cols={6} />
        ) : customers.isError ? (
          <ErrorState error={customers.error} onRetry={() => customers.refetch()} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<Users className="h-6 w-6" />}
            title={filtered ? 'No customers match your filters' : 'No customers yet'}
            description={filtered ? undefined : 'Customers appear here when they sign up on the storefront.'}
          />
        ) : (
          <div className={customers.isPlaceholderData ? 'opacity-60 transition-opacity' : undefined}>
            <Table>
              <THead>
                <TR className="hover:bg-transparent">
                  <TH>Customer</TH>
                  <TH>Phone</TH>
                  <TH>Orders</TH>
                  <TH>Total Spent</TH>
                  <TH>Last Order</TH>
                  <TH>Joined</TH>
                  <TH>Status</TH>
                </TR>
              </THead>
              <TBody>
                {rows.map((c) => (
                  <TR key={c.id}>
                    <TD>
                      <div className="flex items-center gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-50 text-xs font-semibold text-blue-700">
                          {initials(c.name)}
                        </span>
                        <span className="min-w-0">
                          <span className="block font-medium text-slate-800">{c.name}</span>
                          <span className="block text-xs text-slate-400">{c.email}</span>
                        </span>
                      </div>
                    </TD>
                    <TD className="text-slate-500">{c.phone ?? '—'}</TD>
                    <TD>
                      {c.orderCount > 0 ? (
                        <Link to={`/orders?search=${encodeURIComponent(c.email)}`} className="font-medium text-blue-600 hover:underline">
                          {formatNumber(c.orderCount)}
                        </Link>
                      ) : (
                        <span className="text-slate-400">0</span>
                      )}
                    </TD>
                    <TD className="font-medium text-slate-800">{formatMoney(c.totalSpent)}</TD>
                    <TD className="text-slate-500">{c.lastOrderAt ? timeAgo(c.lastOrderAt) : '—'}</TD>
                    <TD className="text-slate-500">{formatDate(c.createdAt)}</TD>
                    <TD>{c.status === 'ACTIVE' ? <Badge tone="green">Active</Badge> : <Badge tone="red">Disabled</Badge>}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            <div className="border-t border-slate-100">
              <Pagination {...customers.data!.meta} onPageChange={(p) => update({ page: p })} noun="customers" />
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
