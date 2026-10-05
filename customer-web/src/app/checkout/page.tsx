'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Lock, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/context/auth';
import { useCart } from '@/context/cart';
import { RequireAuth } from '@/components/RequireAuth';
import { api, ApiError } from '@/lib/api';
import { money, newIdempotencyKey } from '@/lib/format';
import { redirectToPayu } from '@/lib/payu';
import type { ShippingAddress } from '@/lib/types';
import { CheckoutSteps } from '@/components/CheckoutSteps';
import { PaymentMarks } from '@/components/Footer';
import { PaymentOptions, PAYMENT_CHOICE_LABEL, type PaymentChoice } from '@/components/PaymentOptions';
import { Alert, Button, EmptyState, Field, Input, PageLoader, ProductImage, Textarea } from '@/components/ui';

type Errors = Partial<Record<keyof ShippingAddress, string>>;

const STATES = [
  'Andaman and Nicobar Islands', 'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chandigarh', 'Chhattisgarh',
  'Dadra and Nagar Haveli and Daman and Diu', 'Delhi', 'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jammu and Kashmir',
  'Jharkhand', 'Karnataka', 'Kerala', 'Ladakh', 'Lakshadweep', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya',
  'Mizoram', 'Nagaland', 'Odisha', 'Puducherry', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura',
  'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
];

// Mirrors backend/src/modules/storefront/storefront.schemas.ts; the backend remains the authority.
function validate(s: ShippingAddress): Errors {
  const e: Errors = {};
  if (s.fullName.trim().length < 2) e.fullName = 'Name is required';
  if (!/^[0-9+\-\s()]{7,20}$/.test(s.phone.trim())) e.phone = 'Valid phone number required';
  if (s.line1.trim().length < 3) e.line1 = 'Address is required';
  if (s.city.trim().length < 2) e.city = 'City is required';
  if (s.state.trim().length < 2) e.state = 'State is required';
  if (!/^[A-Za-z0-9\s-]{3,12}$/.test(s.postalCode.trim())) e.postalCode = 'Valid PIN code required';
  return e;
}

type Stage = 'placing' | 'redirecting';

const STAGE_LABEL: Record<Stage, string> = {
  placing: 'Placing your order…',
  redirecting: 'Redirecting to PayU secure checkout…',
};

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
  const [paymentChoice, setPaymentChoice] = useState<PaymentChoice>('upi');
  const [stage, setStage] = useState<Stage | null>(null);
  const placed = useRef(false);

  const online = paymentChoice !== 'cod';

  // One key per distinct attempt: a double-click or network retry replays the same order instead of
  // creating a second one, while changing the cart or payment method starts a fresh attempt.
  const cartSignature = useMemo(() => lines.map((l) => `${l.productId}:${l.quantity}`).join('|'), [lines]);
  const idempotencyKey = useRef('');
  useEffect(() => {
    idempotencyKey.current = newIdempotencyKey();
  }, [cartSignature, online]);

  if (!ready) return <PageLoader />;
  if (lines.length === 0 && !placed.current) {
    return (
      <EmptyState
        title="Nothing to check out"
        body="Your cart is empty."
        action={
          <Link href="/products" className="inline-block rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-fg hover:bg-primary-hover">
            Browse products
          </Link>
        }
      />
    );
  }

  const set = (key: keyof ShippingAddress) => (e: { target: { value: string } }) => setShipping((s) => ({ ...s, [key]: e.target.value }));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    const found = validate(shipping);
    setErrors(found);
    if (Object.keys(found).length) {
      document.getElementById(Object.keys(found)[0]!)?.focus();
      return;
    }

    setSubmitting(true);
    setStage('placing');
    try {
      // The backend prices the order from the database and reserves stock; the cart only names products.
      const order = await api.placeOrder(
        {
          items: lines.map((l) => ({ productId: l.productId, quantity: l.quantity })),
          shipping: { ...shipping, line2: shipping.line2?.trim() || undefined },
          notes: notes.trim() || undefined,
          paymentMethod: online ? 'ONLINE' : 'COD',
        },
        idempotencyKey.current,
      );
      placed.current = true;
      clear();
      if (!online) {
        router.replace(`/orders/${order.id}/success`);
        return;
      }
      // The order exists now (awaiting payment). The browser leaves for PayU; if the redirect cannot start,
      // the order's page explains why and offers a retry.
      setStage('redirecting');
      const failure = await redirectToPayu(order.id);
      router.replace(failure === 'already_paid' ? `/orders/${order.id}/success` : `/orders/${order.id}?payment=${failure}`);
    } catch (err) {
      if (err instanceof ApiError) {
        // The server answered, so nothing was created: a corrected retry needs a fresh key.
        idempotencyKey.current = newIdempotencyKey();
        if (err.code === 'INSUFFICIENT_STOCK') {
          const d = err.details as { sku?: string; available?: number } | undefined;
          setSubmitError(
            `Not enough stock for ${lines.find((l) => l.sku === d?.sku)?.name ?? d?.sku ?? 'an item'} (${d?.available ?? 0} available). Please update your cart.`,
          );
        } else if (err.code === 'IDEMPOTENCY_IN_PROGRESS') {
          setSubmitError('Your order is still being processed. Please wait a moment and try again.');
        } else if (err.status === 401) {
          router.replace('/login?next=/checkout');
        } else if (err.code === 'PAYMENTS_UNAVAILABLE') {
          if (process.env.NODE_ENV !== 'production') {
            // details lists the missing PayU settings by name (the backend never sends their values).
            // warn, not error: Next's dev overlay would pop up on console.error and print the object as {}.
            console.warn(`[PayU] Payment initialization failed: ${err.status} ${err.code} ${JSON.stringify(err.details ?? null)}`);
          }
          setSubmitError('Unable to start PayU payment. Please try again, or choose Cash on Delivery.');
        } else {
          setSubmitError(err.message);
        }
      } else {
        setSubmitError('Network error. Please check your connection and try again.');
      }
    } finally {
      setSubmitting(false);
      setStage(null);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-6 lg:grid-cols-[1fr_400px]">
      <section className="space-y-5 rounded-2xl border border-line bg-surface p-5 sm:p-6">
        <h2 className="text-lg font-semibold">Shipping Information</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name" htmlFor="fullName" error={errors.fullName}>
            <Input id="fullName" autoComplete="name" placeholder="John Doe" value={shipping.fullName} onChange={set('fullName')} invalid={!!errors.fullName} />
          </Field>
          <Field label="Email" htmlFor="email">
            <Input id="email" type="email" value={customer?.email ?? ''} readOnly className="bg-surface-2 text-muted" />
          </Field>
        </div>
        <Field label="Phone" htmlFor="phone" error={errors.phone}>
          <Input id="phone" type="tel" autoComplete="tel" placeholder="+91 98765 43210" value={shipping.phone} onChange={set('phone')} invalid={!!errors.phone} />
        </Field>
        <Field label="Address" htmlFor="line1" error={errors.line1}>
          <Input id="line1" autoComplete="address-line1" placeholder="House no., street, area" value={shipping.line1} onChange={set('line1')} invalid={!!errors.line1} />
        </Field>
        <Field label="Apartment, landmark (optional)" htmlFor="line2">
          <Input id="line2" autoComplete="address-line2" value={shipping.line2} onChange={set('line2')} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="City" htmlFor="city" error={errors.city}>
            <Input id="city" autoComplete="address-level2" placeholder="Ahmedabad" value={shipping.city} onChange={set('city')} invalid={!!errors.city} />
          </Field>
          <Field label="State" htmlFor="state" error={errors.state}>
            <select
              id="state"
              autoComplete="address-level1"
              value={shipping.state}
              onChange={set('state')}
              aria-invalid={!!errors.state || undefined}
              className={`w-full rounded-xl border bg-surface px-3 py-2.5 text-sm focus:ring-2 focus:outline-none ${errors.state ? 'border-danger focus:ring-danger/25' : 'border-line-2 focus:border-primary focus:ring-primary/15'}`}
            >
              <option value="">Select state</option>
              {STATES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </Field>
          <Field label="Country" htmlFor="country">
            <Input id="country" value="India" readOnly className="bg-surface-2 text-muted" />
          </Field>
          <Field label="PIN code" htmlFor="postalCode" error={errors.postalCode}>
            <Input id="postalCode" autoComplete="postal-code" inputMode="numeric" placeholder="380001" value={shipping.postalCode} onChange={set('postalCode')} invalid={!!errors.postalCode} />
          </Field>
        </div>
        <Field label="Order note (optional)" htmlFor="notes">
          <Textarea id="notes" rows={2} maxLength={200} placeholder="Delivery instructions…" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </section>

      <aside className="h-fit space-y-5 rounded-2xl border border-line bg-surface p-5 sm:p-6 lg:sticky lg:top-24">
        <h2 className="text-lg font-semibold">Order Summary</h2>
        <ul className="max-h-64 space-y-3 overflow-y-auto pr-1">
          {lines.map((l) => (
            <li key={l.productId} className="flex items-center gap-3 text-sm">
              <div className="shrink-0 overflow-hidden rounded-xl bg-surface-2">
                <ProductImage src={l.imageUrl} name={l.name} category={l.category ?? ''} width={120} className="size-12" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{l.name}</p>
                <p className="text-xs text-muted">
                  {money(l.price)} × {l.quantity}
                </p>
              </div>
              <span className="font-semibold tabular-nums">{money(l.price * l.quantity)}</span>
            </li>
          ))}
        </ul>
        <dl className="space-y-2 border-t border-line pt-4 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted">Subtotal</dt>
            <dd className="tabular-nums">{money(subtotal)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">Shipping</dt>
            <dd className="font-medium text-success">Free</dd>
          </div>
          <div className="flex justify-between border-t border-line pt-3 text-base font-bold">
            <dt>Total</dt>
            <dd className="tabular-nums">{money(subtotal)}</dd>
          </div>
        </dl>

        <PaymentOptions value={paymentChoice} onChange={setPaymentChoice} disabled={submitting} />

        {submitError && <Alert>{submitError}</Alert>}
        {stage && <Alert tone="info">{STAGE_LABEL[stage]}</Alert>}

        <Button type="submit" className="w-full py-3 text-base" loading={submitting}>
          {!submitting && <Lock className="size-4" />}
          {online ? `Pay ${money(subtotal)}` : `Place Order – ${money(subtotal)}`}
        </Button>
        <p className="-mt-2 text-center text-xs text-muted">
          Paying with <span className="font-medium text-fg-2">{PAYMENT_CHOICE_LABEL[paymentChoice]}</span>. Final amount is confirmed by the store.
        </p>
        <div className="space-y-2 border-t border-line pt-4">
          <p className="flex items-center gap-2 text-xs text-muted">
            <ShieldCheck className="size-4 shrink-0 text-success" />
            Your payment information is safe and secure with PayU.
          </p>
          <PaymentMarks />
        </div>
      </aside>
    </form>
  );
}

export default function CheckoutPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Checkout</h1>
        <CheckoutSteps current={1} />
      </div>
      <RequireAuth>
        <CheckoutForm />
      </RequireAuth>
    </div>
  );
}
