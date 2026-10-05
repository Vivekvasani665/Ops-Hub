'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { House, LayoutGrid, Settings, ShoppingCart, User } from 'lucide-react';
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
      label: customer ? 'Orders' : 'Sign in',
      icon: User,
      active: pathname.startsWith('/orders') || pathname === '/login' || pathname === '/register',
    },
    { href: '/settings', label: 'Settings', icon: Settings, active: pathname === '/settings' },
  ];

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 backdrop-blur-xl md:hidden" aria-label="Mobile">
      <ul className="grid grid-cols-5 pb-[env(safe-area-inset-bottom)]">
        {tabs.map(({ href, label, icon: Icon, active, badge }) => (
          <li key={label}>
            <Link href={href} className={cx('flex flex-col items-center gap-1 py-2 text-[11px] font-medium', active ? 'text-primary' : 'text-muted')}>
              <span className={cx('relative rounded-full px-4 py-1 transition-colors', active && 'bg-primary-soft')}>
                <Icon className="size-5" />
                {!!badge && (
                  <span className="absolute -top-1 right-1.5 min-w-4 rounded-full bg-primary px-1 text-center text-[10px] leading-4 font-bold text-primary-fg">
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
