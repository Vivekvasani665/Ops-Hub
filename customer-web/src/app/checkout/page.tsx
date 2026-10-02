'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useAuth } from '@/context/auth';
import { useCart } from '@/context/cart';
import { RequireAuth } from '@/components/RequireAuth';
import { api, ApiError } from '@/lib/api';
import { money, newIdempotencyKey } from '@/lib/format';
import type { ShippingAddress } from '@/lib/types';
import { Alert, Button, EmptyState, Field, Input, PageLoader, Textarea } from '@/components/ui';

type Errors = Partial<Record<keyof ShippingAddress, string>>;

// Mirrors backend/src/modules/storefront/storefront.schemas.ts; the backend remains the authority.
function validate(s: ShippingAddress): Errors {
  const e: Errors = {};
  if (s.fullName.trim().length < 2) e.fullName = 'Name is required';
  if (!/^[0-9+\-\s()]{7,20}$/.test(s.phone.trim())) e.phone = 'Valid phone number required';
  if (s.line1.trim().length < 3) e.line1 = 'Address is required';
  if (s.city.trim().length < 2) e.city = 'City is required';
  if (s.state.trim().length < 2) e.state = 'State is required';
  if (!/^[A-Za-z0-9\s-]{3,12}$/.test(s.postalCode.trim())) e.postalCode = 'Valid postal code required';
  return e;
}

function CheckoutForm() {
  const { customer } = useAuth();
  const { lines, ready, subtotal, clear } = useCart();
  const router = useRouter();
  const [shipping, setShipping] = useState<ShippingAddress>({
    fullName: customer?.name ?? '',
    phone: customer?.phone ?? '',
    line1: '',
    line2: '',
    city: '',
    state: '',
    postalCode: '',
  });
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const placed = useRef(false);

  // One key per distinct cart: a double-click or network retry replays the same order instead of
  // creating a second one, while changing the cart starts a fresh attempt.
  const cartSignature = useMemo(() => lines.map((l) => `${l.productId}:${l.quantity}`).join('|'), [lines]);
  const idempotencyKey = useRef('');
  useEffect(() => {
    idempotencyKey.current = newIdempotencyKey();
  }, [cartSignature]);

  if (!ready) return <PageLoader />;
  if (lines.length === 0 && !placed.current) {
    return (
      <EmptyState
        title="Nothing to check out"
        action={
          <Link href="/" className="inline-block rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white">
            Browse products
          </Link>
        }
      />
    );
  }

  const set = (key: keyof ShippingAddress) => (e: { target: { value: string } }) =>
    setShipping((s) => ({ ...s, [key]: e.target.value }));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    const found = validate(shipping);
    setErrors(found);
    if (Object.keys(found).length) return;

    setSubmitting(true);
    try {
      const order = await api.placeOrder(
        {
          items: lines.map((l) => ({ productId: l.productId, quantity: l.quantity })),
          shipping: { ...shipping, line2: shipping.line2?.trim() || undefined },
          notes: notes.trim() || undefined,
        },
        idempotencyKey.current,
      );
      placed.current = true;
      clear();
      router.replace(`/orders/${order.id}?placed=1`);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === 'INSUFFICIENT_STOCK') {
          const d = err.details as { sku?: string; available?: number } | undefined;
          setSubmitError(
            `Not enough stock for ${lines.find((l) => l.sku === d?.sku)?.name ?? d?.sku ?? 'an item'} (${d?.available ?? 0} available). Please update your cart.`,
          );
        } else if (err.code === 'IDEMPOTENCY_IN_PROGRESS') {
          setSubmitError('Your order is still being processed. Please wait a moment and try again.');
        } else if (err.status === 401) {
          router.replace('/login?next=/checkout');
        } else {
          setSubmitError(err.message);
        }
      } else {
        setSubmitError('Network error. Please check your connection and try again.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-8 lg:grid-cols-[1fr_360px]">
      <section className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="text-lg font-semibold">Shipping address</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name" htmlFor="fullName" error={errors.fullName}>
            <Input id="fullName" autoComplete="name" value={shipping.fullName} onChange={set('fullName')} invalid={!!errors.fullName} />
          </Field>
          <Field label="Phone" htmlFor="phone" error={errors.phone}>
            <Input id="phone" type="tel" autoComplete="tel" value={shipping.phone} onChange={set('phone')} invalid={!!errors.phone} />
          </Field>
        </div>
        <Field label="Address line 1" htmlFor="line1" error={errors.line1}>
          <Input id="line1" autoComplete="address-line1" value={shipping.line1} onChange={set('line1')} invalid={!!errors.line1} />
        </Field>
        <Field label="Address line 2 (optional)" htmlFor="line2">
          <Input id="line2" autoComplete="address-line2" value={shipping.line2} onChange={set('line2')} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="City" htmlFor="city" error={errors.city}>
            <Input id="city" autoComplete="address-level2" value={shipping.city} onChange={set('city')} invalid={!!errors.city} />
          </Field>
          <Field label="State" htmlFor="state" error={errors.state}>
            <Input id="state" autoComplete="address-level1" value={shipping.state} onChange={set('state')} invalid={!!errors.state} />
          </Field>
          <Field label="PIN code" htmlFor="postalCode" error={errors.postalCode}>
            <Input id="postalCode" autoComplete="postal-code" value={shipping.postalCode} onChange={set('postalCode')} invalid={!!errors.postalCode} />
          </Field>
        </div>
        <Field label="Order note (optional)" htmlFor="notes">
          <Textarea id="notes" rows={3} maxLength={200} placeholder="Delivery instructions, landmark…" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <p className="text-sm text-slate-500">Payment: cash on delivery.</p>
      </section>

      <aside className="h-fit space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="font-semibold">Order summary</h2>
        <ul className="space-y-2 text-sm">
          {lines.map((l) => (
            <li key={l.productId} className="flex justify-between gap-3">
              <span className="min-w-0 truncate">
                {l.name} <span className="text-slate-400">× {l.quantity}</span>
              </span>
              <span className="tabular-nums">{money(l.price * l.quantity)}</span>
            </li>
          ))}
        </ul>
        <div className="flex justify-between border-t border-slate-200 pt-3 text-base font-semibold">
          <span>Total</span>
          <span className="tabular-nums">{money(subtotal)}</span>
        </div>
        <p className="text-xs text-slate-500">Final prices are confirmed by the store when the order is placed.</p>
        {submitError && <Alert>{submitError}</Alert>}
        <Button type="submit" className="w-full" loading={submitting}>
          Place order
        </Button>
        <Link href="/cart" className="block text-center text-sm text-slate-600 hover:text-slate-900">
          Back to cart
        </Link>
      </aside>
    </form>
  );
}

export default function CheckoutPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Checkout</h1>
      <RequireAuth>
        <CheckoutForm />
      </RequireAuth>
    </div>
  );
}
