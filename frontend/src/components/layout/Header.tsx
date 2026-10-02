import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Bell, Building2, ChevronDown, Menu, Search } from 'lucide-react';
import { useAuthUser } from '@/features/auth/auth-context';
import { useNotifications } from '@/features/misc/hooks';
import { useUiStore } from '@/stores/ui.store';
import { Dropdown } from '@/components/ui/Dropdown';
import { initials, timeAgo } from '@/lib/utils';
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

function GlobalSearch() {
  const navigate = useNavigate();
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

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
        navigate(q ? `/orders?search=${encodeURIComponent(q)}` : '/orders');
      }}
    >
      <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Search orders, customers, products..."
        className="h-10 w-full rounded-lg border border-slate-200 bg-white pr-14 pl-10 text-sm placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none"
      />
      <kbd className="absolute top-1/2 right-3 hidden -translate-y-1/2 rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-sans text-[10px] text-slate-500 sm:block">
        ⌘ K
      </kbd>
    </form>
  );
}

export function Header() {
  const user = useAuthUser();
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
        <Link
          to="/organization"
          className="hidden h-10 items-center gap-2.5 rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 md:flex"
        >
          <Building2 className="h-4 w-4 text-slate-500" />
          <span className="max-w-40 truncate">{user.organization.name}</span>
          <ChevronDown className="h-4 w-4 text-slate-400" />
        </Link>
        <span
          className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-700 text-sm font-semibold text-white"
          title={user.name}
        >
          {initials(user.name)}
        </span>
      </div>
    </header>
  );
}
