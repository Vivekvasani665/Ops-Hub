'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { House, LayoutGrid, ShoppingCart, User } from 'lucide-react';
import { useAuth } from '@/context/auth';
import { useCart } from '@/context/cart';
import { cx } from './ui';

/** Bottom tab bar on phones. */
export function MobileNav() {
  const pathname = usePathname();
  const { customer } = useAuth();
  const { count, ready } = useCart();

  const tabs = [
    { href: '/', label: 'Home', icon: House, active: pathname === '/' },
    { href: '/products', label: 'Shop', icon: LayoutGrid, active: pathname.startsWith('/products') },
    { href: '/cart', label: 'Cart', icon: ShoppingCart, active: pathname === '/cart' || pathname === '/checkout', badge: ready ? count : 0 },
    {
      href: customer ? '/orders' : '/login',
      label: 'Account',
      icon: User,
      active: pathname.startsWith('/orders') || pathname === '/login' || pathname === '/register',
    },
  ];

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 backdrop-blur md:hidden" aria-label="Mobile">
      <ul className="grid grid-cols-4 pb-[env(safe-area-inset-bottom)]">
        {tabs.map(({ href, label, icon: Icon, active, badge }) => (
          <li key={label}>
            <Link href={href} className={cx('flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium', active ? 'text-blue-600' : 'text-slate-500')}>
              <span className="relative">
                <Icon className="size-5" />
                {!!badge && (
                  <span className="absolute -top-1.5 -right-2 min-w-4 rounded-full bg-blue-600 px-1 text-center text-[10px] leading-4 text-white">
                    {badge > 99 ? '99+' : badge}
                  </span>
                )}
              </span>
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
