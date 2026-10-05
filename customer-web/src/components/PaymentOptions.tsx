import { Banknote, CreditCard, QrCode, Wallet, type LucideIcon } from 'lucide-react';
import type { PreferredMethod } from '@/lib/payu';
import { cx } from './ui';

export type PaymentChoice = PreferredMethod | 'cod';

export const PAYMENT_CHOICE_LABEL: Record<PaymentChoice, string> = {
  upi: 'UPI',
  card: 'Card',
  other: 'Digital payment',
  cod: 'Cash on delivery',
};

const OPTIONS: { value: PaymentChoice; title: string; body: string; icon: LucideIcon }[] = [
  { value: 'upi', title: 'UPI', body: 'Google Pay, PhonePe, Paytm or scan a UPI QR', icon: QrCode },
  { value: 'card', title: 'Credit / Debit Card', body: 'Visa, Mastercard, RuPay, Amex', icon: CreditCard },
  { value: 'other', title: 'Digital Payment', body: 'Wallets, net banking & more via PayU', icon: Wallet },
  { value: 'cod', title: 'Cash on Delivery', body: 'Pay in cash when your order arrives', icon: Banknote },
];

export function PaymentOptions({
  value,
  onChange,
  disabled,
}: {
  value: PaymentChoice;
  onChange: (v: PaymentChoice) => void;
  disabled?: boolean;
}) {
  return (
    <fieldset className="space-y-2.5" disabled={disabled}>
      <legend className="mb-3 font-semibold">Payment Method</legend>
      {OPTIONS.map(({ value: v, title, body, icon: Icon }) => {
        const selected = value === v;
        return (
          <label
            key={v}
            className={cx(
              'flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition-colors',
              selected ? 'border-primary bg-primary-soft/60 ring-1 ring-primary' : 'border-line hover:border-line-2',
            )}
          >
            <input
              type="radio"
              name="paymentMethod"
              value={v}
              checked={selected}
              onChange={() => onChange(v)}
              className="size-4 shrink-0 accent-primary"
            />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-fg">{title}</span>
              <span className="block truncate text-xs text-muted">{body}</span>
            </span>
            <Icon className={cx('size-5 shrink-0', selected ? 'text-primary' : 'text-subtle')} />
          </label>
        );
      })}
    </fieldset>
  );
}
