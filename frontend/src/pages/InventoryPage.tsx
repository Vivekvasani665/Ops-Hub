import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { Boxes, Search, SlidersHorizontal } from 'lucide-react';
import type { InventoryItemDto } from '@/shared';
import { useAdjustInventory, useInventory } from '@/features/inventory/hooks';
import { useCan } from '@/features/auth/hooks';
import { useDebounce } from '@/hooks/useDebounce';
import { toApiError } from '@/lib/api';
import { cn, formatDateTime, formatMoney, formatNumber } from '@/lib/utils';
import type { StockFilter } from '@/services/inventory.api';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Field, Input } from '@/components/ui/Input';
import { Pagination } from '@/components/ui/Pagination';
import { TableSkeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/Table';
import { StockBadge } from '@/components/inventory/StockBadge';

const TABS: { value: StockFilter; label: string }[] = [
  { value: 'all', label: 'All items' },
  { value: 'low', label: 'Low stock' },
  { value: 'out', label: 'Out of stock' },
];

function AdjustDialog({ item, onClose }: { item: InventoryItemDto | null; onClose: () => void }) {
  const adjust = useAdjustInventory();
  const [mode, setMode] = useState<'add' | 'remove'>('add');
  const [qty, setQty] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const amount = Number.parseInt(qty, 10);
  const valid = Number.isInteger(amount) && amount > 0 && reason.trim().length >= 3;
  const delta = mode === 'add' ? amount : -amount;

  const close = () => {
    setQty('');
    setReason('');
    setError(null);
    setMode('add');
    onClose();
  };

  const submit = () => {
    if (!item || !valid) return;
    adjust.mutate(
      { productId: item.product.id, input: { delta, reason: reason.trim() } },
      {
        onSuccess: (res) => {
          toast.success(`${res.product.name}: ${res.available} available`);
          close();
        },
        onError: (e) => setError(toApiError(e).message),
      },
    );
  };

  return (
    <Dialog
      open={!!item}
      onClose={close}
      size="sm"
      title="Adjust stock"
      description={item ? `${item.product.name} · ${item.product.sku} · ${item.available} available` : undefined}
      footer={
        <>
          <Button variant="outline" onClick={close}>
            Cancel
          </Button>
          <Button disabled={!valid} loading={adjust.isPending} onClick={submit}>
            Save adjustment
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1">
          {(['add', 'remove'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={cn(
                'cursor-pointer rounded-md py-1.5 text-sm font-medium',
                mode === m ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500',
              )}
            >
              {m === 'add' ? 'Add stock' : 'Remove stock'}
            </button>
          ))}
        </div>
        <Field
          label="Quantity"
          hint={item && Number.isInteger(amount) && amount > 0 ? `New available: ${item.available + delta}` : undefined}
        >
          <Input type="number" min={1} value={qty} onChange={(e) => setQty(e.target.value)} placeholder="10" />
        </Field>
        <Field label="Reason">
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Restock from supplier, damaged units…" />
        </Field>
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      </div>
    </Dialog>
  );
}

export function InventoryPage() {
  const [params, setParams] = useSearchParams();
  const stock = (['all', 'low', 'out'].includes(params.get('stock') ?? '') ? params.get('stock') : 'all') as StockFilter;
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const debounced = useDebounce(search.trim(), 300);
  const canAdjust = useCan('inventory:adjust');
  const [adjusting, setAdjusting] = useState<InventoryItemDto | null>(null);
  const inv = useInventory({ stock, search: debounced, page, limit: 20 });

  return (
    <div>
      <PageHeader title="Inventory" description="Available units are sellable; reserved units are held by open orders." />
      <Card>
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 md:flex-row md:items-center md:justify-between">
          <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
            {TABS.map((t) => (
              <button
                key={t.value}
                onClick={() => {
                  setPage(1);
                  setParams(t.value === 'all' ? {} : { stock: t.value }, { replace: true });
                }}
                className={cn(
                  'cursor-pointer rounded-md px-3 py-1.5 text-sm font-medium',
                  stock === t.value ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800',
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
          <Input
            className="md:w-72"
            icon={<Search className="h-4 w-4" />}
            placeholder="Search by name or SKU"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
        {inv.isPending ? (
          <TableSkeleton rows={8} cols={7} />
        ) : inv.isError ? (
          <ErrorState error={inv.error} onRetry={() => inv.refetch()} />
        ) : inv.data.data.length === 0 ? (
          <EmptyState icon={<Boxes className="h-6 w-6" />} title="No inventory items" description="Nothing matches the current filter." />
        ) : (
          <>
            <Table>
              <THead>
                <TR className="hover:bg-transparent">
                  <TH>Product</TH>
                  <TH>Category</TH>
                  <TH className="text-right">Price</TH>
                  <TH className="text-right">Available</TH>
                  <TH className="text-right">Reserved</TH>
                  <TH className="text-right">Reorder level</TH>
                  <TH>Status</TH>
                  <TH>Updated</TH>
                  {canAdjust && <TH className="text-right">Actions</TH>}
                </TR>
              </THead>
              <TBody>
                {inv.data.data.map((item) => (
                  <TR key={item.id}>
                    <TD>
                      <span className="block font-medium text-slate-800">{item.product.name}</span>
                      <span className="block text-xs text-slate-400">{item.product.sku}</span>
                    </TD>
                    <TD className="text-slate-500">{item.product.category}</TD>
                    <TD className="text-right">{formatMoney(item.product.price)}</TD>
                    <TD className="text-right font-semibold text-slate-900">{formatNumber(item.available)}</TD>
                    <TD className="text-right">{formatNumber(item.reserved)}</TD>
                    <TD className="text-right text-slate-500">{item.reorderLevel}</TD>
                    <TD>
                      <StockBadge status={item.stockStatus} available={item.available} />
                    </TD>
                    <TD className="text-slate-500">{formatDateTime(item.updatedAt)}</TD>
                    {canAdjust && (
                      <TD className="text-right">
                        <Button variant="outline" size="sm" onClick={() => setAdjusting(item)}>
                          <SlidersHorizontal className="h-3.5 w-3.5" /> Adjust
                        </Button>
                      </TD>
                    )}
                  </TR>
                ))}
              </TBody>
            </Table>
            <div className="border-t border-slate-100">
              <Pagination {...inv.data.meta} onPageChange={setPage} noun="items" />
            </div>
          </>
        )}
      </Card>
      <AdjustDialog item={adjusting} onClose={() => setAdjusting(null)} />
    </div>
  );
}
