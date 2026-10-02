import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from 'react';
import type { OrderStatus } from '@/lib/types';
import { STATUS_LABEL, STATUS_STYLE } from '@/lib/format';
import { categoryIcon, categoryTint, sizedImage } from '@/lib/catalog';

function cx(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(' ');
}

type Variant = 'primary' | 'dark' | 'secondary' | 'outline' | 'ghost';
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-blue-600 text-white shadow-sm hover:bg-blue-700 disabled:bg-blue-300',
  dark: 'bg-slate-900 text-white hover:bg-slate-800 disabled:bg-slate-400',
  secondary: 'bg-white text-slate-900 ring-1 ring-slate-300 hover:bg-slate-50 disabled:text-slate-400',
  outline: 'bg-white text-blue-600 ring-1 ring-blue-600 hover:bg-blue-50 disabled:text-blue-300 disabled:ring-blue-200',
  ghost: 'text-slate-600 hover:text-slate-900 hover:bg-slate-100',
};

export function Button({
  variant = 'primary',
  loading,
  className,
  children,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; loading?: boolean }) {
  return (
    <button
      {...props}
      disabled={disabled || loading}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed',
        VARIANTS[variant],
        className,
      )}
    >
      {loading && <Spinner className="size-4" />}
      {children}
    </button>
  );
}

export function Input({ className, invalid, ...props }: InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  return (
    <input
      {...props}
      aria-invalid={invalid || undefined}
      className={cx(
        'w-full rounded-lg border bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2',
        invalid ? 'border-rose-400 focus:ring-rose-200' : 'border-slate-300 focus:border-blue-500 focus:ring-blue-100',
        className,
      )}
    />
  );
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={cx(
        'w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100',
        className,
      )}
    />
  );
}

export function Field({ label, htmlFor, error, children }: { label: string; htmlFor: string; error?: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-medium text-slate-700">
        {label}
      </label>
      {children}
      {error && <p className="text-xs text-rose-600">{error}</p>}
    </div>
  );
}

export function Alert({ tone = 'error', children }: { tone?: 'error' | 'success' | 'info'; children: ReactNode }) {
  const styles = {
    error: 'bg-rose-50 text-rose-800 ring-rose-200',
    success: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
    info: 'bg-sky-50 text-sky-800 ring-sky-200',
  };
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={cx('rounded-lg px-4 py-3 text-sm ring-1', styles[tone])}>
      {children}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={cx('animate-spin', className ?? 'size-6')} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="4" />
      <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

export function PageLoader() {
  return (
    <div className="flex justify-center py-24 text-slate-400" aria-label="Loading">
      <Spinner />
    </div>
  );
}

export function StatusBadge({ status }: { status: OrderStatus }) {
  return (
    <span className={cx('inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ring-1', STATUS_STYLE[status])}>
      {STATUS_LABEL[status]}
    </span>
  );
}

export function EmptyState({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
      <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
      {body && <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">{body}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

/** Product photo, or a tinted category-icon tile when the product has no image. */
export function ProductImage({
  src,
  name,
  category,
  width = 600,
  className,
  iconClassName = 'size-1/3',
}: {
  src: string | null | undefined;
  name: string;
  category: string;
  width?: number;
  className?: string;
  iconClassName?: string;
}) {
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element -- remote catalog URLs from any host
    return <img src={sizedImage(src, width)} alt={name} loading="lazy" className={cx('object-cover', className)} />;
  }
  const Icon = categoryIcon(category);
  return (
    <div className={cx('flex items-center justify-center', categoryTint(category), className)} role="img" aria-label={name}>
      <Icon className={iconClassName} strokeWidth={1.25} />
    </div>
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cx('rounded-2xl border border-slate-200 bg-white', className)}>{children}</div>;
}

export { cx };
