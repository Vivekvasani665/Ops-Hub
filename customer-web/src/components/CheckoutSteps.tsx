import { Check } from 'lucide-react';
import { cx } from './ui';

const STEPS = ['Cart', 'Shipping', 'Payment'];

/** Progress header for the cart → checkout → payment flow. */
export function CheckoutSteps({ current }: { current: 0 | 1 | 2 }) {
  return (
    <ol className="flex items-center gap-2 text-sm sm:gap-3" aria-label="Checkout progress">
      {STEPS.map((s, i) => (
        <li key={s} className="flex items-center gap-2 sm:gap-3">
          <span
            className={cx(
              'flex size-7 items-center justify-center rounded-full text-xs font-semibold',
              i < current ? 'bg-primary text-primary-fg' : i === current ? 'bg-primary text-primary-fg ring-4 ring-primary/15' : 'bg-surface-3 text-muted',
            )}
          >
            {i < current ? <Check className="size-4" /> : i + 1}
          </span>
          <span className={cx('font-medium', i <= current ? 'text-fg' : 'text-subtle')}>{s}</span>
          {i < STEPS.length - 1 && <span className={cx('h-px w-6 sm:w-12', i < current ? 'bg-primary' : 'bg-line-2')} />}
        </li>
      ))}
    </ol>
  );
}
