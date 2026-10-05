'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '@/context/auth';
import { safeNext } from '@/components/RequireAuth';
import { ApiError } from '@/lib/api';
import { Alert, Button, Field, Input, PageLoader } from '@/components/ui';

interface Form {
  name: string;
  email: string;
  phone: string;
  password: string;
}
type Errors = Partial<Record<keyof Form, string>>;

// Mirrors backend registerCustomerSchema; the backend remains the authority.
function validate(f: Form): Errors {
  const e: Errors = {};
  if (f.name.trim().length < 2) e.name = 'Name is required';
  if (!/^\S+@\S+\.\S+$/.test(f.email.trim())) e.email = 'Valid email required';
  if (f.phone.trim().length > 20) e.phone = 'Phone number is too long';
  if (f.password.length < 8) e.password = 'Password must be at least 8 characters';
  else if (!/[A-Za-z]/.test(f.password) || !/[0-9]/.test(f.password)) e.password = 'Use at least one letter and one number';
  return e;
}

function RegisterForm() {
  const { customer, loading, register } = useAuth();
  const router = useRouter();
  const next = safeNext(useSearchParams().get('next'));
  const [form, setForm] = useState<Form>({ name: '', email: '', phone: '', password: '' });
  const [errors, setErrors] = useState<Errors>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && customer) router.replace(next);
  }, [loading, customer, next, router]);

  const set = (key: keyof Form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [key]: e.target.value }));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const found = validate(form);
    setErrors(found);
    if (Object.keys(found).length) return;

    setSubmitting(true);
    try {
      await register({
        name: form.name.trim(),
        email: form.email.trim(),
        password: form.password,
        phone: form.phone.trim() || undefined,
      });
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fieldErrors).length) {
        setErrors(Object.fromEntries(Object.entries(err.fieldErrors).map(([k, v]) => [k, v[0]])) as Errors);
      } else {
        setError((err as Error).message);
      }
      setSubmitting(false);
    }
  }

  if (loading || customer) return <PageLoader />;

  return (
    <div className="mx-auto max-w-sm space-y-6 py-8">
      <div className="text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Create your account</h1>
        <p className="mt-1 text-sm text-muted">Track orders and check out faster.</p>
      </div>
      <form onSubmit={onSubmit} noValidate className="space-y-4 rounded-2xl border border-line bg-surface p-6">
        {error && <Alert>{error}</Alert>}
        <Field label="Full name" htmlFor="name" error={errors.name}>
          <Input id="name" autoComplete="name" value={form.name} onChange={set('name')} invalid={!!errors.name} />
        </Field>
        <Field label="Email" htmlFor="email" error={errors.email}>
          <Input id="email" type="email" autoComplete="email" value={form.email} onChange={set('email')} invalid={!!errors.email} />
        </Field>
        <Field label="Phone (optional)" htmlFor="phone" error={errors.phone}>
          <Input id="phone" type="tel" autoComplete="tel" value={form.phone} onChange={set('phone')} invalid={!!errors.phone} />
        </Field>
        <Field label="Password" htmlFor="password" error={errors.password}>
          <Input id="password" type="password" autoComplete="new-password" value={form.password} onChange={set('password')} invalid={!!errors.password} />
        </Field>
        <Button type="submit" className="w-full" loading={submitting}>
          Create account
        </Button>
      </form>
      <p className="text-center text-sm text-muted">
        Already have an account?{' '}
        <Link href={`/login?next=${encodeURIComponent(next)}`} className="font-medium text-fg underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={<PageLoader />}>
      <RegisterForm />
    </Suspense>
  );
}
