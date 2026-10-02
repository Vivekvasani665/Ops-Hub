import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { Plus, Search, X } from 'lucide-react';
import { ORDER_STATUSES, type OrderStatus } from '@/shared';
import { useOrders } from '@/features/orders/hooks';
import { useCan } from '@/features/auth/hooks';
import { useDebounce } from '@/hooks/useDebounce';
import { useUiStore } from '@/stores/ui.store';
import { ORDER_STATUS_META } from '@/lib/status';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Pagination } from '@/components/ui/Pagination';
import { OrdersTable } from '@/components/orders/OrdersTable';

const STATUS_OPTIONS = ORDER_STATUSES.map((s) => ({ value: s, label: ORDER_STATUS_META[s].label }));

export function OrdersPage() {
  const [params, setParams] = useSearchParams();
  const canCreate = useCan('orders:create');
  const openCreate = useUiStore((s) => s.setCreateOrderOpen);

  const urlSearch = params.get('search') ?? '';
  const status = (params.get('status') ?? '') as OrderStatus | '';
  const from = params.get('from') ?? '';
  const to = params.get('to') ?? '';
  const page = Math.max(1, Number(params.get('page')) || 1);

  const [search, setSearch] = useState(urlSearch);
  const debounced = useDebounce(search.trim(), 350);

  // Header search navigates here with ?search=; keep the input in sync.
  useEffect(() => setSearch(urlSearch), [urlSearch]);

  const update = (patch: Record<string, string | number | undefined>, resetPage = true) => {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(patch)) {
          if (v === undefined || v === '') next.delete(k);
          else next.set(k, String(v));
        }
        if (resetPage && !('page' in patch)) next.delete('page');
        return next;
      },
      { replace: true },
    );
  };

  useEffect(() => {
    if (debounced !== urlSearch.trim()) update({ search: debounced });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  const orders = useOrders({ page, limit: 10, search: urlSearch.trim(), status, from, to });
  const filtered = Boolean(urlSearch || status || from || to);

  return (
    <div>
      <PageHeader
        title="Orders"
        breadcrumbs={[{ label: 'Dashboard', to: '/dashboard' }, { label: 'Orders' }]}
        actions={
          canCreate && (
            <Button onClick={() => openCreate(true)}>
              <Plus className="h-4 w-4" /> Create Order
            </Button>
          )
        }
      />
      <Card>
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 lg:flex-row lg:items-center">
          <Input
            className="lg:w-80"
            icon={<Search className="h-4 w-4" />}
            placeholder="Search by order ID or customer..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Select
            className="lg:w-40"
            placeholder="All Statuses"
            options={STATUS_OPTIONS}
            value={status}
            onChange={(e) => update({ status: e.target.value })}
          />
          <div className="flex items-center gap-2">
            <Input type="date" aria-label="From date" className="w-40" value={from} max={to || undefined} onChange={(e) => update({ from: e.target.value })} />
            <span className="text-xs text-slate-400">to</span>
            <Input type="date" aria-label="To date" className="w-40" value={to} min={from || undefined} onChange={(e) => update({ to: e.target.value })} />
          </div>
          {filtered && (
            <Button
              variant="ghost"
              size="sm"
              className="lg:ml-auto"
              onClick={() => {
                setSearch('');
                setParams(new URLSearchParams(), { replace: true });
              }}
            >
              <X className="h-3.5 w-3.5" /> Clear filters
            </Button>
          )}
        </div>
        <div className={orders.isPlaceholderData ? 'opacity-60 transition-opacity' : undefined}>
          <OrdersTable
            orders={orders.data?.data}
            isPending={orders.isPending}
            error={orders.error}
            onRetry={() => orders.refetch()}
            filtered={filtered}
            emptyAction={
              !filtered && canCreate ? (
                <Button onClick={() => openCreate(true)}>
                  <Plus className="h-4 w-4" /> Create your first order
                </Button>
              ) : undefined
            }
          />
        </div>
        {orders.data && orders.data.meta.total > 0 && (
          <div className="border-t border-slate-100">
            <Pagination {...orders.data.meta} onPageChange={(p) => update({ page: p }, false)} noun="orders" />
          </div>
        )}
      </Card>
    </div>
  );
}
