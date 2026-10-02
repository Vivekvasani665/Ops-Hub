import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { Bell, Building2, ChevronDown, LogOut, Menu, Search, Settings } from 'lucide-react';
import { useAuthUser } from '@/features/auth/auth-context';
import { useLogout } from '@/features/auth/hooks';
import { useNotifications } from '@/features/misc/hooks';
import { useUiStore } from '@/stores/ui.store';
import { Dropdown, DropdownItem } from '@/components/ui/Dropdown';
import { cn, initials, timeAgo, titleCase } from '@/lib/utils';
import { NotificationIcon, notificationLink } from './notification-icon';

const SEEN_KEY = 'opshub-notifications-seen-at';

function readSeenAt(): number {
  try {
    return Number(localStorage.getItem(SEEN_KEY) ?? 0);
  } catch {
    return 0;
  }
}

function NotificationBell() {
  const { data = [] } = useNotifications(10);
  const [seenAt, setSeenAt] = useState(readSeenAt);
  const navigate = useNavigate();
  const unread = data.filter((n) => new Date(n.createdAt).getTime() > seenAt).length;

  const markSeen = () => {
    const now = Date.now();
    setSeenAt(now);
    try {
      localStorage.setItem(SEEN_KEY, String(now));
    } catch {
      /* storage unavailable */
    }
  };

  return (
    <Dropdown
      className="w-80"
      trigger={({ toggle }) => (
        <button
          onClick={() => {
            toggle();
            markSeen();
          }}
          className="relative cursor-pointer rounded-lg p-2 text-slate-600 hover:bg-slate-100"
          aria-label="Notifications"
        >
          <Bell className="h-5 w-5" />
          {unread > 0 && (
            <span className="absolute top-0.5 right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white ring-2 ring-white">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </button>
      )}
    >
      {(close) => (
        <div>
          <p className="px-3 pt-2 pb-1 text-sm font-semibold text-slate-900">Notifications</p>
          {data.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-slate-500">You're all caught up.</p>
          ) : (
            <div className="max-h-96 overflow-y-auto">
              {data.map((n) => {
                const link = notificationLink(n);
                return (
                  <button
                    key={n.id}
                    onClick={() => {
                      close();
                      if (link) navigate(link);
                    }}
                    className="flex w-full cursor-pointer items-start gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-slate-50"
                  >
                    <NotificationIcon notification={n} size="sm" />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-slate-800">{n.title}</span>
                      <span className="block truncate text-xs text-slate-500">{n.message}</span>
                      <span className="block text-[11px] text-slate-400">{timeAgo(n.createdAt)}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </Dropdown>
  );
}

/** Pages whose list reads `?search=`; anywhere else the header search looks through orders. */
const SEARCH_TARGETS: { prefix: string; placeholder: string }[] = [
  { prefix: '/products', placeholder: 'Search products by name or SKU...' },
  { prefix: '/customers', placeholder: 'Search customers by name or email...' },
  { prefix: '/coupons', placeholder: 'Search coupon codes...' },
];

function GlobalSearch() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const target = SEARCH_TARGETS.find((t) => pathname.startsWith(t.prefix));
  const base = target?.prefix ?? '/orders';

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <form
      className="relative w-full max-w-md"
      onSubmit={(e) => {
        e.preventDefault();
        const q = value.trim();
        navigate(q ? `${base}?search=${encodeURIComponent(q)}` : base);
      }}
    >
      <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={target?.placeholder ?? 'Search orders by number, customer or email...'}
        className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50/60 pr-14 pl-10 text-sm placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none"
      />
      <kbd className="absolute top-1/2 right-3 hidden -translate-y-1/2 rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-sans text-[10px] text-slate-500 sm:block">
        ⌘ K
      </kbd>
    </form>
  );
}

function UserMenu() {
  const user = useAuthUser();
  const logout = useLogout();
  const navigate = useNavigate();
  return (
    <Dropdown
      className="w-60"
      trigger={({ toggle, open }) => (
        <button onClick={toggle} className="flex cursor-pointer items-center gap-2.5 rounded-lg py-1 pr-1.5 pl-1 hover:bg-slate-100">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-sm font-semibold text-white">
            {initials(user.name)}
          </span>
          <span className="hidden text-left leading-tight sm:block">
            <span className="block max-w-36 truncate text-sm font-medium text-slate-800">{user.name}</span>
            <span className="block text-[11px] text-slate-500">{titleCase(user.role)}</span>
          </span>
          <ChevronDown className={cn('hidden h-4 w-4 text-slate-400 transition-transform sm:block', open && 'rotate-180')} />
        </button>
      )}
    >
      {(close) => (
        <>
          <div className="border-b border-slate-100 px-3 py-2">
            <p className="truncate text-sm font-medium text-slate-900">{user.email}</p>
            <p className="flex items-center gap-1 text-xs text-slate-500">
              <Building2 className="h-3 w-3" /> {user.organization.name}
            </p>
          </div>
          <DropdownItem
            onClick={() => {
              close();
              navigate('/settings');
            }}
          >
            <Settings className="h-4 w-4" /> Settings
          </DropdownItem>
          <DropdownItem
            danger
            onClick={() => {
              close();
              logout.mutate(undefined, { onSettled: () => navigate('/login', { replace: true }) });
            }}
          >
            <LogOut className="h-4 w-4" /> Log out
          </DropdownItem>
        </>
      )}
    </Dropdown>
  );
}

export function Header() {
  const setMobileOpen = useUiStore((s) => s.setMobileNavOpen);
  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-slate-200/80 bg-white/95 px-4 backdrop-blur sm:px-6">
      <button
        className="cursor-pointer rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden"
        onClick={() => setMobileOpen(true)}
        aria-label="Open menu"
      >
        <Menu className="h-5 w-5" />
      </button>
      <GlobalSearch />
      <div className="ml-auto flex items-center gap-2 sm:gap-3">
        <NotificationBell />
        <span className="hidden h-6 w-px bg-slate-200 sm:block" />
        <UserMenu />
      </div>
    </header>
  );
}
