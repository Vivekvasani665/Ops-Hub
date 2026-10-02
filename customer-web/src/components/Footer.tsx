import Link from 'next/link';
import { BRAND, TAGLINE } from '@/lib/catalog';
import { Logo } from './Header';

const COLUMNS = [
  {
    title: 'Shop',
    links: [
      { href: '/', label: 'Home' },
      { href: '/products', label: 'All products' },
      { href: '/products?sort=newest', label: 'New arrivals' },
      { href: '/cart', label: 'Cart' },
    ],
  },
  {
    title: 'My account',
    links: [
      { href: '/orders', label: 'My orders' },
      { href: '/orders', label: 'Track order' },
      { href: '/login', label: 'Sign in' },
      { href: '/register', label: 'Create account' },
    ],
  },
];

/** Accepted payment methods as text marks (no third-party logo files). */
export function PaymentMarks({ className = '' }: { className?: string }) {
  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${className}`} aria-label="Accepted payment methods">
      {['UPI', 'VISA', 'Mastercard', 'RuPay', 'Wallets', 'COD'].map((m) => (
        <span key={m} className="rounded bg-white px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-slate-700 ring-1 ring-slate-200">
          {m}
        </span>
      ))}
    </div>
  );
}

export function Footer() {
  return (
    <footer className="mt-16 bg-slate-900 pb-20 text-slate-300 md:pb-0">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-3">
          <Logo light />
          <p className="text-sm text-slate-400">{TAGLINE}</p>
        </div>
        {COLUMNS.map((c) => (
          <div key={c.title}>
            <h3 className="text-sm font-semibold text-white">{c.title}</h3>
            <ul className="mt-3 space-y-2 text-sm">
              {c.links.map((l) => (
                <li key={l.label}>
                  <Link href={l.href} className="text-slate-400 hover:text-white">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
        <div>
          <h3 className="text-sm font-semibold text-white">Secure payments</h3>
          <p className="mt-3 text-sm text-slate-400">UPI, cards, wallets and net banking via Razorpay, or cash on delivery.</p>
          <PaymentMarks className="mt-4" />
        </div>
      </div>
      <div className="border-t border-slate-800">
        <p className="mx-auto max-w-7xl px-4 py-5 text-xs text-slate-500">
          © {new Date().getFullYear()} {BRAND}. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
