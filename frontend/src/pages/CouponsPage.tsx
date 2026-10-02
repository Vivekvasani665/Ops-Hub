import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Info, Pencil, Plus, Search, TicketPercent, Trash2 } from 'lucide-react';
import type { CouponDto } from '@/shared';
import { useCoupons, useDeleteCoupon, useSaveCoupon } from '@/features/catalog/hooks';
import { useCan } from '@/features/auth/hooks';
import { useDebounce } from '@/hooks/useDebounce';
import type { CouponStatusFilter } from '@/services/catalog.api';
import { errorMessage } from '@/lib/api';
import { formatDate, formatMoney, formatNumber } from '@/lib/utils';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Field, Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Switch } from '@/components/ui/Switch';
import { Badge, type Tone } from '@/components/ui/Badge';
import { Pagination } from '@/components/ui/Pagination';
import { TableSkeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/Table';

const STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'expired', label: 'Expired' },
];

function couponState(c: CouponDto, now = Date.now()): { label: string; tone: Tone } {
  if (!c.isActive) return { label: 'Inactive', tone: 'gray' };
  if (c.expiresAt && new Date(c.expiresAt).getTime() <= now) return { label: 'Expired', tone: 'red' };
  if (c.startsAt && new Date(c.startsAt).getTime() > now) return { label: 'Scheduled', tone: 'blue' };
  if (c.usageLimit !== null && c.usedCount >= c.usageLimit) return { label: 'Used up', tone: 'amber' };
  return { label: 'Active', tone: 'green' };
}

function discountLabel(c: Pick<CouponDto, 'type' | 'value' | 'maxDiscount'>) {
  if (c.type === 'FIXED') return `${formatMoney(c.value)} off`;
  return `${c.value}% off${c.maxDiscount ? ` · up to ${formatMoney(c.maxDiscount)}` : ''}`;
}

// Rupees and plain dates in the form; paise and ISO timestamps on the wire.
const optionalNumber = z.preprocess((v) => (v === '' || v === null || Number.isNaN(v) ? null : v), z.number().nullable());
const formSchema = z
  .object({
    code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9_-]{3,30}$/, '3–30 letters, digits, - or _'),
    description: z.string().trim().max(200),
    type: z.enum(['PERCENT', 'FIXED']),
    value: z.number({ invalid_type_error: 'Enter a value' }).positive('Must be more than 0'),
    minOrderRupees: z.number({ invalid_type_error: 'Enter an amount' }).min(0),
    maxDiscountRupees: optionalNumber,
    startsAt: z.string(),
    expiresAt: z.string(),
    usageLimit: optionalNumber,
    isActive: z.boolean(),
  })
  .refine((f) => f.type !== 'PERCENT' || (Number.isInteger(f.value) && f.value <= 100), {
    message: 'Use a whole percentage from 1 to 100',
    path: ['value'],
  })
  .refine((f) => !f.startsAt || !f.expiresAt || f.expiresAt > f.startsAt, { message: 'Must be after the start date', path: ['expiresAt'] })
  .refine((f) => f.usageLimit === null || (Number.isInteger(f.usageLimit) && f.usageLimit >= 1), {
    message: 'Whole number, at least 1',
    path: ['usageLimit'],
  });
type CouponForm = z.infer<typeof formSchema>;

/** YYYY-MM-DD in the browser's timezone, for <input type="date">. */
function dateOnly(iso: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function CouponDialog({ coupon, onClose }: { coupon: CouponDto | null; onClose: () => void }) {
  const save = useSaveCoupon();
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, control, watch, formState } = useForm<CouponForm>({
    resolver: zodResolver(formSchema),
    defaultValues: coupon
      ? {
          code: coupon.code,
          description: coupon.description ?? '',
          type: coupon.type,
          value: coupon.type === 'FIXED' ? coupon.value / 100 : coupon.value,
          minOrderRupees: coupon.minOrderAmount / 100,
          maxDiscountRupees: coupon.maxDiscount !== null ? coupon.maxDiscount / 100 : null,
          startsAt: dateOnly(coupon.startsAt),
          expiresAt: dateOnly(coupon.expiresAt),
          usageLimit: coupon.usageLimit,
          isActive: coupon.isActive,
        }
      : { code: '', description: '', type: 'PERCENT', value: 10, minOrderRupees: 0, maxDiscountRupees: null, startsAt: '', expiresAt: '', usageLimit: null, isActive: true },
  });
  const type = watch('type');
  const e = formState.errors;

  const onSubmit = handleSubmit((f) => {
    setError(null);
    const paise = (r: number) => Math.round(r * 100);
    save.mutate(
      {
        id: coupon?.id,
        input: {
          code: f.code,
          description: f.description || null,
          type: f.type,
          value: f.type === 'FIXED' ? paise(f.value) : f.value,
          minOrderAmount: paise(f.minOrderRupees),
          maxDiscount: f.type === 'PERCENT' && f.maxDiscountRupees ? paise(f.maxDiscountRupees) : null,
          // Local midnight at the start; end of the chosen day for expiry.
          startsAt: f.startsAt ? new Date(`${f.startsAt}T00:00:00`).toISOString() : null,
          expiresAt: f.expiresAt ? new Date(`${f.expiresAt}T23:59:59`).toISOString() : null,
          usageLimit: f.usageLimit,
          isActive: f.isActive,
        },
      },
      {
        onSuccess: (c) => {
          toast.success(coupon ? `${c.code} updated` : `${c.code} created`);
          onClose();
        },
        onError: (err) => setError(errorMessage(err)),
      },
    );
  });

  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title={coupon ? 'Edit Coupon' : 'Add Coupon'}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="coupon-form" loading={save.isPending}>
            {coupon ? 'Update Coupon' : 'Save Coupon'}
          </Button>
        </>
      }
    >
      <form id="coupon-form" onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2" noValidate>
        <Field label="Code *" error={e.code?.message}>
          <Input autoFocus placeholder="WELCOME10" className="font-mono uppercase placeholder:normal-case" invalid={!!e.code} {...register('code')} />
        </Field>
        <Field label="Discount type *">
          <Controller
            control={control}
            name="type"
            render={({ field }) => (
              <Select
                options={[
                  { value: 'PERCENT', label: 'Percentage (%)' },
                  { value: 'FIXED', label: 'Fixed amount (₹)' },
                ]}
                value={field.value}
                onChange={(ev) => field.onChange(ev.target.value)}
              />
            )}
          />
        </Field>
        <Field label={type === 'PERCENT' ? 'Discount (%) *' : 'Discount (₹) *'} error={e.value?.message}>
          <Input type="number" min={0} step={type === 'PERCENT' ? 1 : 0.01} invalid={!!e.value} {...register('value', { valueAsNumber: true })} />
        </Field>
        {type === 'PERCENT' ? (
          <Field label="Max discount (₹)" error={e.maxDiscountRupees?.message} hint="Leave empty for no cap">
            <Input type="number" min={0} step={0.01} placeholder="No cap" {...register('maxDiscountRupees', { valueAsNumber: true })} />
          </Field>
        ) : (
          <div className="hidden sm:block" />
        )}
        <Field label="Minimum order (₹)" error={e.minOrderRupees?.message}>
          <Input type="number" min={0} step={0.01} {...register('minOrderRupees', { valueAsNumber: true })} />
        </Field>
        <Field label="Usage limit" error={e.usageLimit?.message} hint="Leave empty for unlimited">
          <Input type="number" min={1} placeholder="Unlimited" invalid={!!e.usageLimit} {...register('usageLimit', { valueAsNumber: true })} />
        </Field>
        <Field label="Starts on" error={e.startsAt?.message}>
          <Input type="date" {...register('startsAt')} />
        </Field>
        <Field label="Expires on" error={e.expiresAt?.message}>
          <Input type="date" invalid={!!e.expiresAt} {...register('expiresAt')} />
        </Field>
        <Field label="Description" error={e.description?.message} className="sm:col-span-2">
          <Input placeholder="e.g. 10% off your first order" {...register('description')} />
        </Field>
        <div className="flex items-center justify-between rounded-lg border border-slate-200 px-4 py-3 sm:col-span-2">
          <p className="text-sm font-medium text-slate-800">Active</p>
          <Controller control={control} name="isActive" render={({ field }) => <Switch checked={field.value} onChange={field.onChange} label="Active" />} />
        </div>
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 sm:col-span-2">{error}</p>}
      </form>
    </Dialog>
  );
}

export function CouponsPage() {
  const canWrite = useCan('coupons:write');
  const [params, setParams] = useSearchParams();
  const urlSearch = params.get('search') ?? '';
  const status = (params.get('status') ?? '') as CouponStatusFilter;
  const page = Math.max(1, Number(params.get('page')) || 1);
  const [search, setSearch] = useState(urlSearch);
  const debounced = useDebounce(search.trim(), 300);
  const [dialog, setDialog] = useState<{ coupon: CouponDto | null } | null>(null);
  const [toDelete, setToDelete] = useState<CouponDto | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const remove = useDeleteCoupon();

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

  const coupons = useCoupons({ search: urlSearch.trim(), status, page, limit: 10 });
  const rows = coupons.data?.data ?? [];
  const filtered = Boolean(urlSearch || status);

  return (
    <div>
      <PageHeader
        title="Coupons"
        breadcrumbs={[{ label: 'Dashboard', to: '/dashboard' }, { label: 'Coupons' }]}
        actions={
          canWrite && (
            <Button onClick={() => setDialog({ coupon: null })}>
              <Plus className="h-4 w-4" /> Add Coupon
            </Button>
          )
        }
      />
      <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-blue-100 bg-blue-50/60 px-4 py-3 text-sm text-blue-800">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <p>Coupons are managed here but are not yet redeemed at storefront checkout, so usage counts stay at 0 for now.</p>
      </div>
      <Card>
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center">
          <Input className="sm:w-72" icon={<Search className="h-4 w-4" />} placeholder="Search by code" value={search} onChange={(ev) => setSearch(ev.target.value)} />
          <Select className="sm:w-40" aria-label="Status" placeholder="All Status" options={STATUS_OPTIONS} value={status} onChange={(ev) => update({ status: ev.target.value })} />
        </div>
        {coupons.isPending ? (
          <TableSkeleton rows={6} cols={6} />
        ) : coupons.isError ? (
          <ErrorState error={coupons.error} onRetry={() => coupons.refetch()} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<TicketPercent className="h-6 w-6" />}
            title={filtered ? 'No coupons match your filters' : 'No coupons yet'}
            action={
              !filtered && canWrite ? (
                <Button onClick={() => setDialog({ coupon: null })}>
                  <Plus className="h-4 w-4" /> Add Coupon
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className={coupons.isPlaceholderData ? 'opacity-60 transition-opacity' : undefined}>
            <Table>
              <THead>
                <TR className="hover:bg-transparent">
                  <TH>Code</TH>
                  <TH>Discount</TH>
                  <TH>Min. Order</TH>
                  <TH>Validity</TH>
                  <TH>Usage</TH>
                  <TH>Status</TH>
                  {canWrite && <TH className="text-right">Actions</TH>}
                </TR>
              </THead>
              <TBody>
                {rows.map((c) => {
                  const state = couponState(c);
                  return (
                    <TR key={c.id}>
                      <TD>
                        <span className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-2 py-1 font-mono text-xs font-semibold text-slate-800">{c.code}</span>
                        {c.description && <span className="mt-1.5 block max-w-56 truncate text-xs text-slate-400">{c.description}</span>}
                      </TD>
                      <TD className="font-medium text-slate-800">{discountLabel(c)}</TD>
                      <TD className="text-slate-500">{c.minOrderAmount ? formatMoney(c.minOrderAmount) : '—'}</TD>
                      <TD className="text-slate-500">
                        {c.startsAt || c.expiresAt
                          ? `${c.startsAt ? formatDate(c.startsAt) : 'Now'} – ${c.expiresAt ? formatDate(c.expiresAt) : 'No expiry'}`
                          : 'Always'}
                      </TD>
                      <TD className="text-slate-500">
                        {formatNumber(c.usedCount)} / {c.usageLimit === null ? '∞' : formatNumber(c.usageLimit)}
                      </TD>
                      <TD>
                        <Badge tone={state.tone}>{state.label}</Badge>
                      </TD>
                      {canWrite && (
                        <TD>
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => setDialog({ coupon: c })}
                              className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-blue-600"
                              aria-label={`Edit ${c.code}`}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => {
                                setDeleteError(null);
                                setToDelete(c);
                              }}
                              className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border border-red-100 bg-red-50 text-red-600 hover:bg-red-100"
                              aria-label={`Delete ${c.code}`}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </TD>
                      )}
                    </TR>
                  );
                })}
              </TBody>
            </Table>
            <div className="border-t border-slate-100">
              <Pagination {...coupons.data!.meta} onPageChange={(p) => update({ page: p })} noun="coupons" />
            </div>
          </div>
        )}
      </Card>

      {dialog && <CouponDialog key={dialog.coupon?.id ?? 'new'} coupon={dialog.coupon} onClose={() => setDialog(null)} />}
      <ConfirmDialog
        open={toDelete !== null}
        onClose={() => setToDelete(null)}
        loading={remove.isPending}
        error={deleteError}
        title="Delete coupon?"
        description={
          <p>
            <span className="font-mono font-semibold text-slate-900">{toDelete?.code}</span> will be removed permanently.
          </p>
        }
        onConfirm={() =>
          toDelete &&
          remove.mutate(toDelete.id, {
            onSuccess: () => {
              toast.success(`${toDelete.code} deleted`);
              setToDelete(null);
            },
            onError: (err) => setDeleteError(errorMessage(err)),
          })
        }
      />
    </div>
  );
}
