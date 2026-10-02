import type { PreferredMethod } from '@/lib/razorpay';
import { cx } from './ui';

export type PaymentChoice = PreferredMethod | 'cod';

const OPTIONS: { value: PaymentChoice; title: string; body: string; online: boolean }[] = [
  { value: 'upi', title: 'UPI', body: 'Google Pay, PhonePe, Paytm, BHIM or scan a UPI QR code', online: true },
  { value: 'card', title: 'Card', body: 'Credit or debit card — Visa, Mastercard, RuPay, Amex', online: true },
  { value: 'other', title: 'Digital payment', body: 'Wallets, net banking and other Razorpay methods', online: true },
  { value: 'cod', title: 'Cash on delivery', body: 'Pay in cash when your order arrives', online: false },
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
    <fieldset className="space-y-3" disabled={disabled}>
      <legend className="mb-3 text-lg font-semibold">Payment method</legend>
      {OPTIONS.map((o) => {
        const unavailable = o.online && !onlineAvailable;
        const selected = value === o.value;
        return (
          <label
            key={o.value}
            className={cx(
              'flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors',
              selected ? 'border-slate-900 bg-slate-50 ring-1 ring-slate-900' : 'border-slate-200 hover:border-slate-300',
              unavailable && 'cursor-not-allowed opacity-50',
            )}
          >
            <input
              type="radio"
              name="paymentMethod"
              value={o.value}
              checked={selected}
              disabled={unavailable}
              onChange={() => onChange(o.value)}
              className="mt-1 size-4 accent-slate-900"
            />
            <span className="min-w-0">
              <span className="block text-sm font-medium text-slate-900">{o.title}</span>
              <span className="block text-sm text-slate-500">{o.body}</span>
            </span>
          </label>
        );
      })}
      {!onlineAvailable && <p className="text-xs text-slate-500">Online payments are currently unavailable. Cash on delivery is still open.</p>}
      {onlineAvailable && value !== 'cod' && (
        <p className="text-xs text-slate-500">You will pay securely on Razorpay. Your order is confirmed as soon as the payment is verified.</p>
      )}
    </fieldset>
  );
}
