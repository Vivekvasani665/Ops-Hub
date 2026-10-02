import { Banknote, CreditCard, QrCode, Wallet, type LucideIcon } from 'lucide-react';
import type { PreferredMethod } from '@/lib/razorpay';
import { cx } from './ui';

export type PaymentChoice = PreferredMethod | 'cod';

export const PAYMENT_CHOICE_LABEL: Record<PaymentChoice, string> = {
  upi: 'UPI',
  card: 'Card',
  other: 'Digital payment',
  cod: 'Cash on delivery',
};

const OPTIONS: { value: PaymentChoice; title: string; body: string; icon: LucideIcon; online: boolean }[] = [
  { value: 'upi', title: 'UPI', body: 'Google Pay, PhonePe, Paytm or scan a UPI QR', icon: QrCode, online: true },
  { value: 'card', title: 'Credit / Debit Card', body: 'Visa, Mastercard, RuPay, Amex', icon: CreditCard, online: true },
  { value: 'other', title: 'Digital Payment', body: 'Wallets, net banking & more via Razorpay', icon: Wallet, online: true },
  { value: 'cod', title: 'Cash on Delivery', body: 'Pay in cash when your order arrives', icon: Banknote, online: false },
];

export function PaymentOptions({
  value,
  onChange,
  onlineAvailable,
  disabled,
}: {
  value: PaymentChoice;
  onChange: (v: PaymentChoice) => void;
  onlineAvailable: boolean;
  disabled?: boolean;
}) {
  return (
    <fieldset className="space-y-2.5" disabled={disabled}>
      <legend className="mb-3 font-semibold">Payment Method</legend>
      {OPTIONS.map(({ value: v, title, body, icon: Icon, online }) => {
        const unavailable = online && !onlineAvailable;
        const selected = value === v;
        return (
          <label
            key={v}
            className={cx(
              'flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition-colors',
              selected ? 'border-blue-600 bg-blue-50/60 ring-1 ring-blue-600' : 'border-slate-200 hover:border-slate-300',
              unavailable && 'cursor-not-allowed opacity-50',
            )}
          >
            <input
              type="radio"
              name="paymentMethod"
              value={v}
              checked={selected}
              disabled={unavailable}
              onChange={() => onChange(v)}
              className="size-4 shrink-0 accent-blue-600"
            />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-slate-900">{title}</span>
              <span className="block truncate text-xs text-slate-500">{body}</span>
            </span>
            <Icon className={cx('size-5 shrink-0', selected ? 'text-blue-600' : 'text-slate-400')} />
          </label>
        );
      })}
      {!onlineAvailable && <p className="text-xs text-slate-500">Online payments are currently unavailable. Cash on delivery is still open.</p>}
    </fieldset>
  );
}
