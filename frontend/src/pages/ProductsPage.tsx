import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Package, Plus, Search } from 'lucide-react';
import { createProductSchema } from '@/shared';
import { useCreateProduct, useProducts } from '@/features/products/hooks';
import { useCan } from '@/features/auth/hooks';
import { useDebounce } from '@/hooks/useDebounce';
import { toApiError } from '@/lib/api';
import { stockStatusOf } from '@/lib/stock';
import { formatDate, formatMoney, formatNumber } from '@/lib/utils';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Field, Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Pagination } from '@/components/ui/Pagination';
import { TableSkeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/Table';
import { StockBadge } from '@/components/inventory/StockBadge';

// The form takes rupees; the API takes paise.
const productFormSchema = createProductSchema.omit({ price: true }).extend({
  priceRupees: z.number({ invalid_type_error: 'Enter a price' }).min(0).max(100_000_000),
  initialStock: z.number({ invalid_type_error: 'Enter a number' }).int().min(0),
  reorderLevel: z.number({ invalid_type_error: 'Enter a number' }).int().min(0),
});
type ProductForm = z.infer<typeof productFormSchema>;

function NewProductDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const create = useCreateProduct();
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, reset, formState } = useForm<ProductForm>({
    resolver: zodResolver(productFormSchema),
    defaultValues: { name: '', sku: '', category: '', priceRupees: 0, initialStock: 0, reorderLevel: 5 },
  });
  const close = () => {
    reset();
    setError(null);
    onClose();
  };
  const onSubmit = handleSubmit(({ priceRupees, ...rest }) => {
    setError(null);
    create.mutate(
      { ...rest, price: Math.round(priceRupees * 100) },
      {
        onSuccess: (p) => {
          toast.success(`${p.name} added`);
          close();
        },
        onError: (e) => setError(toApiError(e).message),
      },
    );
  });
  const e = formState.errors;

  return (
    <Dialog
      open={open}
      onClose={close}
      title="New product"
      description="Creates the product and its inventory record together."
      footer={
        <>
          <Button variant="outline" onClick={close}>
            Cancel
          </Button>
          <Button type="submit" form="new-product-form" loading={create.isPending}>
            Create product
          </Button>
        </>
      }
    >
      <form id="new-product-form" onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2" noValidate>
        <Field label="Name" error={e.name?.message} className="sm:col-span-2">
          <Input placeholder="iPhone 15" invalid={!!e.name} {...register('name')} />
        </Field>
        <Field label="SKU" error={e.sku?.message}>
          <Input placeholder="IP15-BLK" invalid={!!e.sku} {...register('sku')} />
        </Field>
        <Field label="Category" error={e.category?.message}>
          <Input placeholder="Phones" invalid={!!e.category} {...register('category')} />
        </Field>
        <Field label="Price (₹)" error={e.priceRupees?.message}>
          <Input type="number" step="0.01" min={0} invalid={!!e.priceRupees} {...register('priceRupees', { valueAsNumber: true })} />
        </Field>
        <Field label="Initial stock" error={e.initialStock?.message}>
          <Input type="number" min={0} invalid={!!e.initialStock} {...register('initialStock', { valueAsNumber: true })} />
        </Field>
        <Field label="Reorder level" error={e.reorderLevel?.message} hint="Low-stock alert threshold">
          <Input type="number" min={0} invalid={!!e.reorderLevel} {...register('reorderLevel', { valueAsNumber: true })} />
        </Field>
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 sm:col-span-2">{error}</p>}
      </form>
    </Dialog>
  );
}

export function ProductsPage() {
  const canWrite = useCan('products:write');
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const debounced = useDebounce(search.trim(), 300);
  const products = useProducts({ search: debounced, page, limit: 20 });

  return (
    <div>
      <PageHeader
        title="Products"
        description="Your catalog. Prices are stored in paise to avoid rounding errors."
        actions={
          canWrite && (
            <Button onClick={() => setOpen(true)}>
              <Plus className="h-4 w-4" /> New product
            </Button>
          )
        }
      />
      <Card>
        <div className="border-b border-slate-100 p-4">
          <Input
            className="sm:w-80"
            icon={<Search className="h-4 w-4" />}
            placeholder="Search by name or SKU prefix"
            value={search}
            onChange={(ev) => {
              setSearch(ev.target.value);
              setPage(1);
            }}
          />
        </div>
        {products.isPending ? (
          <TableSkeleton rows={8} cols={6} />
        ) : products.isError ? (
          <ErrorState error={products.error} onRetry={() => products.refetch()} />
        ) : products.data.data.length === 0 ? (
          <EmptyState icon={<Package className="h-6 w-6" />} title="No products found" />
        ) : (
          <>
            <Table>
              <THead>
                <TR className="hover:bg-transparent">
                  <TH>Product</TH>
                  <TH>SKU</TH>
                  <TH>Category</TH>
                  <TH className="text-right">Price</TH>
                  <TH className="text-right">Available</TH>
                  <TH>Stock</TH>
                  <TH>Status</TH>
                  <TH>Created</TH>
                </TR>
              </THead>
              <TBody>
                {products.data.data.map((p) => (
                  <TR key={p.id}>
                    <TD className="font-medium text-slate-800">{p.name}</TD>
                    <TD className="text-slate-500">{p.sku}</TD>
                    <TD className="text-slate-500">{p.category}</TD>
                    <TD className="text-right">{formatMoney(p.price)}</TD>
                    <TD className="text-right">{p.inventory ? formatNumber(p.inventory.available) : '—'}</TD>
                    <TD>
                      {p.inventory ? (
                        <StockBadge status={stockStatusOf(p.inventory.available, p.inventory.reorderLevel)} available={p.inventory.available} />
                      ) : (
                        '—'
                      )}
                    </TD>
                    <TD>{p.isActive ? <Badge tone="green">Active</Badge> : <Badge>Inactive</Badge>}</TD>
                    <TD className="text-slate-500">{formatDate(p.createdAt)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            <div className="border-t border-slate-100">
              <Pagination {...products.data.meta} onPageChange={setPage} noun="products" />
            </div>
          </>
        )}
      </Card>
      <NewProductDialog open={open} onClose={() => setOpen(false)} />
    </div>
  );
}
