import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { useFieldArray, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { AlertTriangle, Minus, Package, Plus, Search, Trash2 } from 'lucide-react';
import { createOrderSchema, type CreateOrderInput } from '@/shared';
import { useUiStore } from '@/stores/ui.store';
import { useCreateOrder } from '@/features/orders/hooks';
import { useProducts } from '@/features/products/hooks';
import { useDebounce } from '@/hooks/useDebounce';
import { toApiError } from '@/lib/api';
import { cn, formatMoney } from '@/lib/utils';
import type { ProductWithInventory } from '@/services/products.api';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { Field, Input, Textarea } from '@/components/ui/Input';
import { Skeleton } from '@/components/ui/Skeleton';

const FORM_ID = 'create-order-form';
const EMPTY: CreateOrderInput = { customer: { name: '', email: '' }, items: [], notes: '' };

function ProductPicker({ onPick, pickedIds }: { onPick: (p: ProductWithInventory) => void; pickedIds: Set<string> }) {
  const [search, setSearch] = useState('');
  const debounced = useDebounce(search, 250);
  const products = useProducts({ search: debounced, limit: 6 });

  return (
    <div className="rounded-xl border border-slate-200">
      <div className="border-b border-slate-100 p-2">
        <Input
          icon={<Search className="h-4 w-4" />}
          placeholder="Search products by name or SKU…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <div className="max-h-52 overflow-y-auto p-1">
        {products.isPending ? (
          <div className="space-y-2 p-2">
            <Skeleton className="h-8" />
            <Skeleton className="h-8" />
          </div>
        ) : products.isError ? (
          <p className="p-3 text-sm text-red-600">Could not load products.</p>
        ) : products.data.data.length === 0 ? (
          <p className="p-3 text-center text-sm text-slate-500">No products match “{debounced}”.</p>
        ) : (
          products.data.data.map((p) => {
            const available = p.inventory?.available ?? 0;
            const picked = pickedIds.has(p.id);
            const disabled = available <= 0 || !p.isActive;
            return (
              <button
                key={p.id}
                type="button"
                disabled={disabled}
                onClick={() => onPick(p)}
                className={cn(
                  'flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50',
                  picked && 'bg-blue-50/60',
                )}
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-500">
                  <Package className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-slate-800">{p.name}</span>
                  <span className="block text-xs text-slate-500">SKU: {p.sku}</span>
                </span>
                <span className="text-right">
                  <span className="block text-sm font-medium text-slate-800">{formatMoney(p.price)}</span>
                  <span className={cn('block text-xs', available <= 0 ? 'text-red-600' : 'text-slate-500')}>
                    {available <= 0 ? 'Out of stock' : `${available} available`}
                  </span>
                </span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

export function CreateOrderDialog() {
  const open = useUiStore((s) => s.createOrderOpen);
  const setOpen = useUiStore((s) => s.setCreateOrderOpen);
  const navigate = useNavigate();
  const createOrder = useCreateOrder();
  const [catalog, setCatalog] = useState<Record<string, ProductWithInventory>>({});
  const [formError, setFormError] = useState<string | null>(null);
  // One key per logical submission: reused on retry of identical values, regenerated when values change.
  const idempotencyKey = useRef<string | null>(null);

  const form = useForm<CreateOrderInput>({ resolver: zodResolver(createOrderSchema), defaultValues: EMPTY });
  const { register, control, handleSubmit, watch, reset, setValue, formState } = form;
  const items = useFieldArray({ control, name: 'items' });

  useEffect(() => {
    const sub = watch(() => {
      idempotencyKey.current = null;
      setFormError(null);
    });
    return () => sub.unsubscribe();
  }, [watch]);

  useEffect(() => {
    if (open) {
      reset(EMPTY);
      setCatalog({});
      setFormError(null);
      idempotencyKey.current = null;
      createOrder.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const watchedItems = watch('items');
  const total = useMemo(
    () =>
      (watchedItems ?? []).reduce(
        (sum, i) => sum + (catalog[i.productId]?.price ?? 0) * (Number.isFinite(i.quantity) ? i.quantity : 0),
        0,
      ),
    [watchedItems, catalog],
  );
  const pickedIds = new Set((watchedItems ?? []).map((i) => i.productId));

  const close = () => setOpen(false);

  const pick = (p: ProductWithInventory) => {
    setCatalog((c) => ({ ...c, [p.id]: p }));
    const idx = (watchedItems ?? []).findIndex((i) => i.productId === p.id);
    if (idx >= 0) {
      setValue(`items.${idx}.quantity`, (watchedItems[idx]!.quantity || 0) + 1, { shouldValidate: true });
    } else {
      items.append({ productId: p.id, quantity: 1 });
    }
  };

  const onSubmit = handleSubmit((values) => {
    idempotencyKey.current ??= crypto.randomUUID();
    const notes = values.notes?.trim() ? values.notes.trim() : undefined;
    createOrder.mutate(
      { input: { ...values, notes }, idempotencyKey: idempotencyKey.current },
      {
        onSuccess: (order) => {
          idempotencyKey.current = null;
          toast.success(`Order #${order.orderNumber} created`, { description: `${order.customer.name} · ${formatMoney(order.totalAmount)}` });
          close();
          navigate(`/orders/${order.id}`);
        },
        onError: (error) => {
          const err = toApiError(error);
          if (err.code === 'INSUFFICIENT_STOCK') {
            const d = (err.details ?? {}) as { sku?: string; available?: number; requested?: number };
            setFormError(
              `Not enough stock for ${d.sku ?? 'a product'}: requested ${d.requested ?? '?'}, only ${d.available ?? 0} available.`,
            );
          } else if (err.code === 'VALIDATION_ERROR') {
            const fe = ((err.details ?? {}) as { fieldErrors?: Record<string, string[]> }).fieldErrors ?? {};
            const msgs = Object.entries(fe).map(([k, v]) => `${k}: ${v.join(', ')}`);
            setFormError(msgs.length ? msgs.join(' · ') : err.message);
          } else if (err.code === 'IDEMPOTENCY_IN_PROGRESS') {
            setFormError('This order is still being processed. Please try again in a moment.');
          } else {
            setFormError(err.message);
          }
        },
      },
    );
  });

  const itemsError = formState.errors.items?.message ?? formState.errors.items?.root?.message;

  return (
    <Dialog
      open={open}
      onClose={close}
      size="lg"
      title="Create Order"
      description="Stock is reserved atomically when the order is placed."
      footer={
        <>
          <Button variant="outline" onClick={close}>
            Cancel
          </Button>
          <Button type="submit" form={FORM_ID} loading={createOrder.isPending}>
            Create Order
          </Button>
        </>
      }
    >
      <form id={FORM_ID} onSubmit={onSubmit} className="space-y-5" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Customer name" error={formState.errors.customer?.name?.message}>
            <Input placeholder="Rahul Shah" invalid={!!formState.errors.customer?.name} {...register('customer.name')} />
          </Field>
          <Field label="Customer email" error={formState.errors.customer?.email?.message}>
            <Input
              type="email"
              placeholder="rahul@example.com"
              invalid={!!formState.errors.customer?.email}
              {...register('customer.email')}
            />
          </Field>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-medium text-slate-700">Products</p>
          <ProductPicker onPick={pick} pickedIds={pickedIds} />
        </div>

        {items.fields.length > 0 && (
          <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
            {items.fields.map((field, index) => {
              const product = catalog[field.productId];
              const available = product?.inventory?.available ?? 0;
              const qty = watchedItems?.[index]?.quantity ?? 0;
              const qtyError = formState.errors.items?.[index]?.quantity?.message;
              return (
                <div key={field.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-800">{product?.name ?? 'Product'}</p>
                    <p className="text-xs text-slate-500">
                      {product?.sku} · {formatMoney(product?.price ?? 0)} each ·{' '}
                      <span className={qty > available ? 'text-red-600' : ''}>{available} available</span>
                    </p>
                    {qtyError && <p className="text-xs text-red-600">{qtyError}</p>}
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      size="icon"
                      variant="outline"
                      className="h-8 w-8"
                      aria-label="Decrease quantity"
                      onClick={() => setValue(`items.${index}.quantity`, Math.max(1, qty - 1), { shouldValidate: true })}
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </Button>
                    <Input
                      type="number"
                      min={1}
                      className="h-8 w-16 text-center"
                      {...register(`items.${index}.quantity`, { valueAsNumber: true })}
                    />
                    <Button
                      size="icon"
                      variant="outline"
                      className="h-8 w-8"
                      aria-label="Increase quantity"
                      onClick={() => setValue(`items.${index}.quantity`, qty + 1, { shouldValidate: true })}
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <p className="w-24 text-right text-sm font-medium text-slate-800">
                    {formatMoney((product?.price ?? 0) * (Number.isFinite(qty) ? qty : 0))}
                  </p>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-slate-400 hover:text-red-600"
                    aria-label="Remove product"
                    onClick={() => items.remove(index)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              );
            })}
          </div>
        )}
        {itemsError && <p className="text-xs text-red-600">{itemsError}</p>}

        <Field label="Notes (optional)" error={formState.errors.notes?.message}>
          <Textarea placeholder="Delivery instructions, gift wrap…" {...register('notes')} />
        </Field>

        <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
          <span className="text-sm text-slate-600">Total</span>
          <span className="text-lg font-semibold text-slate-900">{formatMoney(total)}</span>
        </div>

        {formError && (
          <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{formError}</span>
          </div>
        )}
      </form>
    </Dialog>
  );
}
