import Link from 'next/link';
import { Banknote, Headphones, RotateCcw, ShieldCheck, Truck } from 'lucide-react';
import { BRAND, TAGLINE } from '@/lib/catalog';
import { Logo } from './Header';

const COLUMNS = [
  {
    title: 'Shop',
    links: [
      { href: '/', label: 'Home' },
      { href: '/products', label: 'All products' },
      { href: '/products?sort=newest', label: 'New arrivals' },
      { href: '/products?sort=price_asc', label: 'Best value' },
    ],
  },
  {
    title: 'My account',
    links: [
      { href: '/orders', label: 'My orders' },
      { href: '/cart', label: 'Shopping cart' },
      { href: '/login', label: 'Sign in' },
      { href: '/register', label: 'Create account' },
    ],
  },
  {
    title: 'Preferences',
    links: [
      { href: '/settings', label: 'Settings' },
      { href: '/settings#appearance', label: 'Theme & appearance' },
    ],
  },
];

const PROMISES = [
  { icon: Truck, title: 'Free delivery', body: 'On every order, no minimum' },
  { icon: Banknote, title: 'Cash on delivery', body: 'Pay when it arrives' },
  { icon: ShieldCheck, title: 'Secure payments', body: 'UPI, cards & net banking via PayU' },
  { icon: RotateCcw, title: 'Order tracking', body: 'Follow every step online' },
];

/** Accepted payment methods as text marks (no third-party logo files). */
export function PaymentMarks({ className = '' }: { className?: string }) {
  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${className}`} aria-label="Accepted payment methods">
      {['UPI', 'VISA', 'Mastercard', 'RuPay', 'Net banking', 'COD'].map((m) => (
        <span key={m} className="rounded-md bg-surface px-2 py-1 text-[10px] font-bold tracking-wide text-fg-2 ring-1 ring-line">
          {m}
        </span>
      ))}
    </div>
  );
}

export function Footer() {
  return (
    <footer className="mt-20 border-t border-line bg-surface pb-20 md:pb-0">
      <div className="border-b border-line">
        <ul className="mx-auto grid max-w-7xl grid-cols-2 gap-6 px-4 py-8 lg:grid-cols-4">
          {PROMISES.map(({ icon: Icon, title, body }) => (
            <li key={title} className="flex items-center gap-3">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-primary-soft text-primary">
                <Icon className="size-5" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-fg">{title}</span>
                <span className="block text-xs text-muted">{body}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div className="space-y-4">
          <Logo />
          <p className="max-w-xs text-sm text-muted">{TAGLINE} Genuine products, honest prices and delivery you can track.</p>
          <PaymentMarks />
        </div>
        {COLUMNS.map((c) => (
          <div key={c.title}>
            <h3 className="text-sm font-semibold text-fg">{c.title}</h3>
            <ul className="mt-4 space-y-2.5 text-sm">
              {c.links.map((l) => (
                <li key={l.label}>
                  <Link href={l.href} className="text-muted transition-colors hover:text-primary">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-line">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 px-4 py-5 text-xs text-subtle sm:flex-row">
          <p>
            © {new Date().getFullYear()} {BRAND}. All rights reserved.
          </p>
          <p className="flex items-center gap-1.5">
            <Headphones className="size-3.5" /> Need help? Check your order status in My orders.
          </p>
        </div>
      </div>
    </footer>
  );
}
