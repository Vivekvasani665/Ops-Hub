import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from 'react';
import type { OrderStatus } from '@/lib/types';
import { STATUS_LABEL, STATUS_STYLE } from '@/lib/format';
import { categoryIcon, categoryTint, sizedImage } from '@/lib/catalog';

function cx(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(' ');
}

type Variant = 'primary' | 'dark' | 'secondary' | 'outline' | 'ghost';
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-primary text-primary-fg shadow-sm shadow-primary/20 hover:bg-primary-hover disabled:opacity-50 disabled:shadow-none',
  dark: 'bg-inverse text-inverse-fg hover:opacity-90 disabled:opacity-40',
  secondary: 'bg-surface text-fg ring-1 ring-line-2 hover:bg-surface-2 disabled:text-subtle',
  outline: 'bg-transparent text-primary ring-1 ring-primary hover:bg-primary-soft disabled:opacity-50',
  ghost: 'text-fg-2 hover:text-fg hover:bg-surface-2',
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
        'inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:active:scale-100',
        VARIANTS[variant],
        className,
      )}
    >
      {loading && <Spinner className="size-4" />}
      {children}
    </button>
  );
}

const FIELD_BASE =
  'w-full rounded-xl border bg-surface px-3.5 py-2.5 text-sm text-fg placeholder:text-subtle transition-colors focus:outline-none focus:ring-4';

export function Input({ className, invalid, ...props }: InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  return (
    <input
      {...props}
      aria-invalid={invalid || undefined}
      className={cx(FIELD_BASE, invalid ? 'border-danger focus:ring-danger/15' : 'border-line-2 focus:border-primary focus:ring-primary/15', className)}
    />
  );
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cx(FIELD_BASE, 'border-line-2 focus:border-primary focus:ring-primary/15', className)} />;
}

/** Native select styled like the inputs. */
export const selectClass = cx(FIELD_BASE, 'border-line-2 focus:border-primary focus:ring-primary/15');

export function Field({ label, htmlFor, error, children }: { label: string; htmlFor: string; error?: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-medium text-fg-2">
        {label}
      </label>
      {children}
      {error && <p className="text-xs font-medium text-danger">{error}</p>}
    </div>
  );
}

export function Alert({ tone = 'error', children }: { tone?: 'error' | 'success' | 'info'; children: ReactNode }) {
  const styles = {
    error: 'bg-danger-soft text-danger ring-danger/25',
    success: 'bg-success-soft text-success ring-success/25',
    info: 'bg-info-soft text-info ring-info/25',
  };
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={cx('rounded-xl px-4 py-3 text-sm ring-1', styles[tone])}>
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
    <div className="flex justify-center py-24 text-subtle" aria-label="Loading">
      <Spinner />
    </div>
  );
}

export function StatusBadge({ status }: { status: OrderStatus }) {
  return (
    <span className={cx('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1', STATUS_STYLE[status])}>
      <span className="size-1.5 rounded-full bg-current" />
      {STATUS_LABEL[status]}
    </span>
  );
}

export function EmptyState({ title, body, action, icon }: { title: string; body?: string; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="rounded-3xl border border-dashed border-line-2 bg-surface px-6 py-16 text-center">
      {icon && <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-primary-soft text-primary">{icon}</div>}
      <h2 className="text-lg font-semibold text-fg">{title}</h2>
      {body && <p className="mx-auto mt-2 max-w-md text-sm text-muted">{body}</p>}
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
  return <div className={cx('rounded-2xl border border-line bg-surface', className)}>{children}</div>;
}

/** Section title row used across the storefront. */
export function SectionHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-5 flex items-end justify-between gap-4">
      <div>
        <h2 className="text-xl font-bold tracking-tight text-fg sm:text-2xl">{title}</h2>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export { cx };
