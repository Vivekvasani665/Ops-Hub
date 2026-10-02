import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { PackageX } from 'lucide-react';
import { createProductSchema, type ProductWithInventoryDto } from '@/shared';
import { useCreateProduct, useProduct, useUpdateProduct } from '@/features/products/hooks';
import { useAdjustInventory } from '@/features/inventory/hooks';
import { useCategories } from '@/features/catalog/hooks';
import { useCan } from '@/features/auth/hooks';
import { errorMessage } from '@/lib/api';
import { formatNumber } from '@/lib/utils';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Field, Input, Textarea } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Switch } from '@/components/ui/Switch';
import { Skeleton } from '@/components/ui/Skeleton';
import { ErrorState } from '@/components/ui/ErrorState';
import { EmptyState } from '@/components/ui/EmptyState';
import { ImageUpload } from '@/components/catalog/ImageUpload';

const NEW_CATEGORY = '__new__';

// The form takes rupees and a target stock level; the API takes paise and stock deltas.
const formSchema = createProductSchema
  .pick({ name: true, sku: true, category: true })
  .extend({
    priceRupees: z.number({ invalid_type_error: 'Enter a price' }).min(0, 'Price cannot be negative').max(100_000_000),
    stock: z.number({ invalid_type_error: 'Enter a number' }).int('Whole units only').min(0, 'Stock cannot be negative'),
    reorderLevel: z.number({ invalid_type_error: 'Enter a number' }).int('Whole units only').min(0),
    description: z.string().trim().max(2000, 'Keep it under 2000 characters'),
    imageUrl: z.string().nullable(),
    isActive: z.boolean(),
  });
type ProductForm = z.infer<typeof formSchema>;

const EMPTY: ProductForm = {
  name: '',
  sku: '',
  category: '',
  priceRupees: 0,
  stock: 0,
  reorderLevel: 5,
  description: '',
  imageUrl: null,
  isActive: true,
};

function toForm(p: ProductWithInventoryDto): ProductForm {
  return {
    name: p.name,
    sku: p.sku,
    category: p.category,
    priceRupees: p.price / 100,
    stock: p.inventory?.available ?? 0,
    reorderLevel: p.inventory?.reorderLevel ?? 5,
    description: p.description ?? '',
    imageUrl: p.imageUrl,
    isActive: p.isActive,
  };
}

function ProductEditor({ product }: { product?: ProductWithInventoryDto }) {
  const navigate = useNavigate();
  const editing = Boolean(product);
  const canAdjust = useCan('inventory:adjust');
  const categories = useCategories();
  const create = useCreateProduct();
  const update = useUpdateProduct(product?.id ?? '');
  const adjust = useAdjustInventory();
  const [error, setError] = useState<string | null>(null);
  const [newCategory, setNewCategory] = useState(false);

  // Captured once: background refetches (e.g. realtime stock updates) must not reset what the user is typing.
  const [initial] = useState(() => (product ? toForm(product) : EMPTY));
  const { register, handleSubmit, control, setValue, formState } = useForm<ProductForm>({
    resolver: zodResolver(formSchema),
    defaultValues: initial,
  });

  // An edited product whose category isn't in the list yet (e.g. a legacy spelling) still shows it.
  const categoryNames = (categories.data ?? []).map((c) => c.name);
  if (product && !categoryNames.some((n) => n.toLowerCase() === product.category.toLowerCase())) categoryNames.unshift(product.category);

  const saving = create.isPending || update.isPending || adjust.isPending;
  const e = formState.errors;

  const onSubmit = handleSubmit(async ({ priceRupees, stock, ...rest }) => {
    setError(null);
    const fields = { ...rest, price: Math.round(priceRupees * 100), description: rest.description || null };
    try {
      if (!product) {
        const { reorderLevel, ...p } = fields;
        const created = await create.mutateAsync({ ...p, reorderLevel, initialStock: stock });
        toast.success(`${created.name} added`);
      } else {
        await update.mutateAsync(fields);
        // Only an edited stock field moves stock, by what the user changed it by; orders placed meanwhile stay intact.
        const delta = stock - initial.stock;
        if (delta !== 0 && canAdjust) {
          try {
            await adjust.mutateAsync({ productId: product.id, input: { delta, reason: 'Stock updated from the product editor' } });
          } catch (err) {
            toast.warning('Product saved, but the stock change failed', { description: errorMessage(err) });
            return;
          }
        }
        toast.success(`${fields.name} updated`);
      }
      navigate('/products');
    } catch (err) {
      setError(errorMessage(err));
    }
  });

  const title = editing ? 'Edit Product' : 'Add Product';
  return (
    <form onSubmit={onSubmit} noValidate>
      <PageHeader
        title={title}
        breadcrumbs={[{ label: 'Dashboard', to: '/dashboard' }, { label: 'Products', to: '/products' }, { label: title }]}
      />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader title="Product Information" />
          <div className="grid gap-4 p-5 sm:grid-cols-2">
            <Field label="Product Name *" error={e.name?.message} className="sm:col-span-2">
              <Input placeholder="Enter product name" invalid={!!e.name} {...register('name')} />
            </Field>
            <Field label="Category *" error={e.category?.message}>
              {newCategory ? (
                <div className="flex gap-2">
                  <Input autoFocus placeholder="New category name" invalid={!!e.category} {...register('category')} />
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setNewCategory(false);
                      setValue('category', product?.category ?? '');
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              ) : (
                <Controller
                  control={control}
                  name="category"
                  render={({ field }) => (
                    <Select
                      placeholder={categories.isPending ? 'Loading…' : 'Select category'}
                      options={[...categoryNames.map((n) => ({ value: n, label: n })), { value: NEW_CATEGORY, label: '+ New category…' }]}
                      value={field.value}
                      onBlur={field.onBlur}
                      onChange={(ev) => {
                        if (ev.target.value === NEW_CATEGORY) {
                          setNewCategory(true);
                          field.onChange('');
                        } else field.onChange(ev.target.value);
                      }}
                    />
                  )}
                />
              )}
            </Field>
            <Field label="SKU *" error={e.sku?.message} hint="Unique code, e.g. WH-001">
              <Input placeholder="Enter SKU" className="uppercase placeholder:normal-case" invalid={!!e.sku} {...register('sku')} />
            </Field>
            <Field label="Description" error={e.description?.message} className="sm:col-span-2">
              <Textarea rows={7} placeholder="Enter product description…" {...register('description')} />
            </Field>
            <div className="flex items-center justify-between gap-4 rounded-lg border border-slate-200 px-4 py-3 sm:col-span-2">
              <div>
                <p className="text-sm font-medium text-slate-800">Status</p>
                <p className="text-xs text-slate-500">Inactive products are hidden from the storefront.</p>
              </div>
              <Controller
                control={control}
                name="isActive"
                render={({ field }) => (
                  <div className="flex items-center gap-2.5">
                    <span className="text-xs font-medium text-slate-600">{field.value ? 'Active' : 'Inactive'}</span>
                    <Switch checked={field.value} onChange={field.onChange} label="Active" />
                  </div>
                )}
              />
            </div>
          </div>
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Product Image" />
            <div className="p-5">
              <Controller
                control={control}
                name="imageUrl"
                render={({ field }) => <ImageUpload value={field.value} onChange={field.onChange} />}
              />
            </div>
          </Card>
          <Card>
            <CardHeader title="Pricing & Stock" />
            <div className="grid gap-4 p-5 sm:grid-cols-2">
              <Field label="Price (₹) *" error={e.priceRupees?.message}>
                <Input type="number" step="0.01" min={0} placeholder="0.00" invalid={!!e.priceRupees} {...register('priceRupees', { valueAsNumber: true })} />
              </Field>
              <Field
                label="Stock Quantity *"
                error={e.stock?.message}
                hint={
                  editing
                    ? canAdjust
                      ? product?.inventory?.reserved
                        ? `${formatNumber(product.inventory.reserved)} more reserved by open orders`
                        : 'Changes are logged as a stock adjustment'
                      : 'You do not have permission to adjust stock'
                    : undefined
                }
              >
                <Input type="number" min={0} disabled={editing && !canAdjust} invalid={!!e.stock} {...register('stock', { valueAsNumber: true })} />
              </Field>
              <Field label="Low-stock alert at" error={e.reorderLevel?.message} hint="Flag the product when stock falls to this level">
                <Input type="number" min={0} invalid={!!e.reorderLevel} {...register('reorderLevel', { valueAsNumber: true })} />
              </Field>
            </div>
          </Card>
        </div>
      </div>

      {error && <p className="mt-5 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="outline" onClick={() => navigate('/products')} disabled={saving}>
          Cancel
        </Button>
        <Button type="submit" loading={saving}>
          {editing ? 'Update Product' : 'Save Product'}
        </Button>
      </div>
    </form>
  );
}

export function ProductFormPage() {
  const { id } = useParams();
  const product = useProduct(id);
  if (!id) return <ProductEditor />;
  if (product.isPending)
    return (
      <div className="space-y-5">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-5 lg:grid-cols-[1.35fr_1fr]">
          <Skeleton className="h-96" />
          <Skeleton className="h-96" />
        </div>
      </div>
    );
  if (product.isError) {
    const notFound = (product.error as { status?: number }).status === 404;
    return (
      <Card>
        {notFound ? (
          <EmptyState icon={<PackageX className="h-6 w-6" />} title="Product not found" description="It may have been deleted." />
        ) : (
          <ErrorState error={product.error} onRetry={() => product.refetch()} />
        )}
      </Card>
    );
  }
  return <ProductEditor key={product.data.id} product={product.data} />;
}
