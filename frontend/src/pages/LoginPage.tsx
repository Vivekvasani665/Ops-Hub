import { useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { AlertTriangle, Boxes, Lock, Mail, RadioTower, ShieldCheck, Workflow } from 'lucide-react';
import { loginSchema, type LoginInput } from '@/shared';
import { useLogin, useMe } from '@/features/auth/hooks';
import { toApiError } from '@/lib/api';
import { Logo } from '@/components/layout/Logo';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Input';
import { FullPageSpinner } from '@/components/ui/Spinner';

const DEMO_PASSWORD = 'Password123!';
const DEMO_ACCOUNTS = [
  { email: 'john@acme.com', label: 'Org Admin', org: 'Acme' },
  { email: 'maya@acme.com', label: 'Manager', org: 'Acme' },
  { email: 'ravi@acme.com', label: 'Operator', org: 'Acme' },
  { email: 'vera@acme.com', label: 'Viewer', org: 'Acme' },
  { email: 'admin@globex.com', label: 'Org Admin', org: 'Globex' },
  { email: 'root@opshub.dev', label: 'Super Admin', org: 'Platform' },
];

const FEATURES = [
  { icon: ShieldCheck, title: 'Tenant isolation', text: 'Every query is scoped to your organization.' },
  { icon: Boxes, title: 'Oversell-proof inventory', text: 'Atomic stock reservation under heavy concurrency.' },
  { icon: Workflow, title: 'Reliable background jobs', text: 'Retries with backoff and crash recovery.' },
  { icon: RadioTower, title: 'Realtime updates', text: 'Order changes appear instantly for your team.' },
];

function safeNext(next: string | null): string {
  return next && next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/login') ? next : '/dashboard';
}

export function LoginPage() {
  const me = useMe();
  const login = useLogin();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const [error, setError] = useState<{ message: string; tone: 'red' | 'amber' } | null>(null);

  const { register, handleSubmit, setValue, formState } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  if (me.isPending) return <FullPageSpinner />;
  if (me.data) return <Navigate to={next} replace />;

  const onSubmit = handleSubmit((values) => {
    setError(null);
    login.mutate(values, {
      onSuccess: () => navigate(next, { replace: true }),
      onError: (e) => {
        const err = toApiError(e);
        if (err.code === 'ACCOUNT_LOCKED') setError({ message: err.message, tone: 'amber' });
        else if (err.code === 'RATE_LIMITED')
          setError({ message: 'Too many login attempts from this network. Please wait a few minutes.', tone: 'amber' });
        else setError({ message: err.message, tone: 'red' });
      },
    });
  });

  const fill = (email: string) => {
    setValue('email', email, { shouldValidate: true });
    setValue('password', DEMO_PASSWORD, { shouldValidate: true });
    setError(null);
  };

  return (
    <div className="flex min-h-screen bg-white">
      <aside className="relative hidden w-[46%] max-w-xl flex-col justify-between overflow-hidden bg-gradient-to-br from-navy-900 to-navy-950 p-10 lg:flex">
        <div className="pointer-events-none absolute -top-24 -right-24 h-72 w-72 rounded-full bg-blue-600/20 blur-3xl" />
        <div className="pointer-events-none absolute bottom-0 -left-20 h-64 w-64 rounded-full bg-indigo-500/10 blur-3xl" />
        <Logo />
        <div className="relative">
          <h1 className="text-3xl leading-tight font-semibold text-white">
            Run every order, every warehouse, every team — from one place.
          </h1>
          <p className="mt-3 text-sm text-slate-300">
            OpsHub is a multi-tenant order &amp; operations platform built for correctness first.
          </p>
          <ul className="mt-8 space-y-5">
            {FEATURES.map((f) => (
              <li key={f.title} className="flex gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/10 text-blue-300">
                  <f.icon className="h-4.5 w-4.5" />
                </span>
                <span>
                  <span className="block text-sm font-medium text-white">{f.title}</span>
                  <span className="block text-xs text-slate-400">{f.text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-slate-500">© {new Date().getFullYear()} OpsHub</p>
      </aside>

      <main className="flex flex-1 items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-sm">
          <div className="mb-8 rounded-xl bg-navy-900 p-3 lg:hidden">
            <Logo />
          </div>
          <h2 className="text-2xl font-semibold tracking-tight text-slate-900">Sign in</h2>
          <p className="mt-1 text-sm text-slate-500">Welcome back. Enter your work account details.</p>

          <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
            <Field label="Email" error={formState.errors.email?.message}>
              <Input
                type="email"
                autoComplete="email"
                icon={<Mail className="h-4 w-4" />}
                placeholder="you@company.com"
                invalid={!!formState.errors.email}
                {...register('email')}
              />
            </Field>
            <Field label="Password" error={formState.errors.password?.message}>
              <Input
                type="password"
                autoComplete="current-password"
                icon={<Lock className="h-4 w-4" />}
                placeholder="••••••••"
                invalid={!!formState.errors.password}
                {...register('password')}
              />
            </Field>
            {error && (
              <div
                className={
                  error.tone === 'amber'
                    ? 'flex gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800'
                    : 'flex gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700'
                }
                role="alert"
              >
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                {error.message}
              </div>
            )}
            <Button type="submit" size="lg" className="w-full" loading={login.isPending}>
              Sign in
            </Button>
          </form>

          <div className="mt-8">
            <p className="mb-2 text-xs font-medium text-slate-500">Demo accounts (password {DEMO_PASSWORD})</p>
            <div className="grid grid-cols-2 gap-2">
              {DEMO_ACCOUNTS.map((a) => (
                <button
                  key={a.email}
                  type="button"
                  onClick={() => fill(a.email)}
                  className="cursor-pointer rounded-lg border border-slate-200 px-3 py-2 text-left hover:border-blue-300 hover:bg-blue-50/50"
                >
                  <span className="block text-xs font-medium text-slate-800">{a.label}</span>
                  <span className="block truncate text-[11px] text-slate-500">{a.email}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
