import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { Package, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import { useDeleteProduct, useProducts } from '@/features/products/hooks';
import { useCategories } from '@/features/catalog/hooks';
import { useCan } from '@/features/auth/hooks';
import { useDebounce } from '@/hooks/useDebounce';
import type { ProductSort, ProductWithInventory } from '@/services/products.api';
import { errorMessage } from '@/lib/api';
import { stockStatusOf } from '@/lib/stock';
import { cn, formatMoney, formatNumber } from '@/lib/utils';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Badge } from '@/components/ui/Badge';
import { Pagination } from '@/components/ui/Pagination';
import { TableSkeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/Table';
import { Thumb } from '@/components/catalog/Thumb';

const STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
];
const SORT_OPTIONS: { value: ProductSort; label: string }[] = [
  { value: 'newest', label: 'Newest' },
  { value: 'oldest', label: 'Oldest' },
  { value: 'name', label: 'Name (A–Z)' },
  { value: 'price_asc', label: 'Price: low to high' },
  { value: 'price_desc', label: 'Price: high to low' },
];

function StockCell({ product }: { product: ProductWithInventory }) {
  const inv = product.inventory;
  if (!inv) return <span className="text-slate-400">—</span>;
  const status = stockStatusOf(inv.available, inv.reorderLevel);
  return (
    <span
      className={cn(
        'font-medium',
        status === 'OUT_OF_STOCK' ? 'text-red-600' : status === 'LOW_STOCK' ? 'text-amber-600' : 'text-slate-700',
      )}
      title={status === 'IN_STOCK' ? undefined : status === 'LOW_STOCK' ? 'Low stock' : 'Out of stock'}
    >
      {formatNumber(inv.available)}
    </span>
  );
}

export function ProductsPage() {
  const canWrite = useCan('products:write');
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const urlSearch = params.get('search') ?? '';
  const category = params.get('category') ?? '';
  const status = (params.get('status') ?? '') as 'active' | 'inactive' | '';
  const sort = (params.get('sort') ?? 'newest') as ProductSort;
  const page = Math.max(1, Number(params.get('page')) || 1);

  const [search, setSearch] = useState(urlSearch);
  const debounced = useDebounce(search.trim(), 300);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [toDelete, setToDelete] = useState<ProductWithInventory[] | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const deleteOne = useDeleteProduct();

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

  // The header search navigates here with ?search=.
  useEffect(() => setSearch(urlSearch), [urlSearch]);
  useEffect(() => {
    if (debounced !== urlSearch.trim()) update({ search: debounced });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  const products = useProducts({ search: urlSearch.trim(), category, status, sort, page, limit: 10 });
  const categories = useCategories();
  const rows = products.data?.data ?? [];
  const filtered = Boolean(urlSearch || category || status);

  useEffect(() => setSelected(new Set()), [urlSearch, category, status, sort, page]);
  const allChecked = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // One request per product so a product with open orders doesn't stop the rest.
  const confirmDelete = async () => {
    if (!toDelete) return;
    setDeleteError(null);
    setDeleting(true);
    const failures: string[] = [];
    for (const p of toDelete) {
      try {
        await deleteOne.mutateAsync(p.id);
      } catch (e) {
        failures.push(toDelete.length === 1 ? errorMessage(e) : `${p.name}: ${errorMessage(e)}`);
      }
    }
    setDeleting(false);
    const done = toDelete.length - failures.length;
    if (done > 0) toast.success(toDelete.length === 1 ? `${toDelete[0]!.name} deleted` : `${done} product${done === 1 ? '' : 's'} deleted`);
    setSelected(new Set());
    if (failures.length > 0) {
      setToDelete(toDelete.filter((p) => failures.some((f) => toDelete.length === 1 || f.startsWith(`${p.name}:`))));
      setDeleteError(failures.join('\n'));
    } else setToDelete(null);
  };

  return (
    <div>
      <PageHeader
        title="Products"
        breadcrumbs={[{ label: 'Dashboard', to: '/dashboard' }, { label: 'Products' }]}
        actions={
          canWrite && (
            <Button onClick={() => navigate('/products/new')}>
              <Plus className="h-4 w-4" /> Add Product
            </Button>
          )
        }
      />
      <Card>
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 lg:flex-row lg:items-center">
          <Input
            className="lg:w-64"
            icon={<Search className="h-4 w-4" />}
            placeholder="Search name or SKU"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Select
            className="lg:w-48"
            aria-label="Category"
            placeholder="All Categories"
            options={(categories.data ?? []).map((c) => ({ value: c.name, label: c.name }))}
            value={category}
            onChange={(e) => update({ category: e.target.value })}
          />
          <Select
            className="lg:w-36"
            aria-label="Status"
            placeholder="All Status"
            options={STATUS_OPTIONS}
            value={status}
            onChange={(e) => update({ status: e.target.value })}
          />
          {filtered && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearch('');
                update({ search: undefined, category: undefined, status: undefined });
              }}
            >
              <X className="h-3.5 w-3.5" /> Clear
            </Button>
          )}
          <div className="flex items-center gap-2 lg:ml-auto">
            {canWrite && selected.size > 0 && (
              <Button variant="outline" size="sm" className="text-red-600" onClick={() => setToDelete(rows.filter((r) => selected.has(r.id)))}>
                <Trash2 className="h-3.5 w-3.5" /> Delete ({selected.size})
              </Button>
            )}
            <span className="text-xs whitespace-nowrap text-slate-500">Sort by:</span>
            <Select className="w-44" aria-label="Sort by" options={SORT_OPTIONS} value={sort} onChange={(e) => update({ sort: e.target.value })} />
          </div>
        </div>

        {products.isPending ? (
          <TableSkeleton rows={8} cols={7} />
        ) : products.isError ? (
          <ErrorState error={products.error} onRetry={() => products.refetch()} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<Package className="h-6 w-6" />}
            title={filtered ? 'No products match your filters' : 'No products yet'}
            description={filtered ? 'Try a different search, category or status.' : 'Add your first product to start selling.'}
            action={
              !filtered && canWrite ? (
                <Button onClick={() => navigate('/products/new')}>
                  <Plus className="h-4 w-4" /> Add Product
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className={products.isPlaceholderData ? 'opacity-60 transition-opacity' : undefined}>
            <Table>
              <THead>
                <TR className="hover:bg-transparent">
                  {canWrite && (
                    <TH className="w-10">
                      <input
                        type="checkbox"
                        aria-label="Select all on this page"
                        className="h-4 w-4 cursor-pointer rounded border-slate-300 accent-blue-600"
                        checked={allChecked}
                        onChange={() => setSelected(allChecked ? new Set() : new Set(rows.map((r) => r.id)))}
                      />
                    </TH>
                  )}
                  <TH>Image</TH>
                  <TH>Name</TH>
                  <TH>Category</TH>
                  <TH>Price</TH>
                  <TH>Stock</TH>
                  <TH>Status</TH>
                  {canWrite && <TH className="text-right">Actions</TH>}
                </TR>
              </THead>
              <TBody>
                {rows.map((p) => (
                  <TR key={p.id} className={selected.has(p.id) ? 'bg-blue-50/40' : undefined}>
                    {canWrite && (
                      <TD>
                        <input
                          type="checkbox"
                          aria-label={`Select ${p.name}`}
                          className="h-4 w-4 cursor-pointer rounded border-slate-300 accent-blue-600"
                          checked={selected.has(p.id)}
                          onChange={() => toggle(p.id)}
                        />
                      </TD>
                    )}
                    <TD>
                      <Thumb src={p.imageUrl} alt={p.name} />
                    </TD>
                    <TD>
                      {canWrite ? (
                        <Link to={`/products/${p.id}/edit`} className="block font-medium text-slate-800 hover:text-blue-600">
                          {p.name}
                        </Link>
                      ) : (
                        <span className="block font-medium text-slate-800">{p.name}</span>
                      )}
                      <span className="block text-xs text-slate-400">SKU: {p.sku}</span>
                    </TD>
                    <TD className="text-slate-500">{p.category}</TD>
                    <TD className="font-medium text-slate-800">{formatMoney(p.price)}</TD>
                    <TD>
                      <StockCell product={p} />
                    </TD>
                    <TD>{p.isActive ? <Badge tone="green">Active</Badge> : <Badge>Inactive</Badge>}</TD>
                    {canWrite && (
                      <TD>
                        <div className="flex items-center justify-end gap-1.5">
                          <Link
                            to={`/products/${p.id}/edit`}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-blue-600"
                            aria-label={`Edit ${p.name}`}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Link>
                          <button
                            onClick={() => setToDelete([p])}
                            className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border border-red-100 bg-red-50 text-red-600 hover:bg-red-100"
                            aria-label={`Delete ${p.name}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </TD>
                    )}
                  </TR>
                ))}
              </TBody>
            </Table>
            <div className="border-t border-slate-100">
              <Pagination {...products.data.meta} onPageChange={(p) => update({ page: p })} noun="products" />
            </div>
          </div>
        )}
      </Card>

      <ConfirmDialog
        open={toDelete !== null}
        onClose={() => {
          setToDelete(null);
          setDeleteError(null);
        }}
        onConfirm={() => void confirmDelete()}
        loading={deleting}
        error={deleteError}
        title={toDelete && toDelete.length > 1 ? `Delete ${toDelete.length} products?` : 'Delete product?'}
        description={
          <p>
            {toDelete && toDelete.length === 1 ? (
              <>
                <span className="font-medium text-slate-900">{toDelete[0]!.name}</span> and its stock record will be removed.
              </>
            ) : (
              'The selected products and their stock records will be removed.'
            )}{' '}
            Past orders keep their line items. Products with units reserved by open orders can't be deleted; mark them inactive instead.
          </p>
        }
      />
    </div>
  );
}
