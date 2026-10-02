import { NavLink, useNavigate } from 'react-router';
import { ChevronDown, LogOut, Settings, X } from 'lucide-react';
import { hasPermission } from '@/shared';
import { cn, initials, titleCase } from '@/lib/utils';
import { useAuthUser } from '@/features/auth/auth-context';
import { useLogout } from '@/features/auth/hooks';
import { useHealth } from '@/features/misc/hooks';
import { useUiStore } from '@/stores/ui.store';
import { Dropdown, DropdownItem } from '@/components/ui/Dropdown';
import { Logo } from './Logo';
import { NAV_SECTIONS, NAV_TOP, type NavItem } from './nav';

function NavEntry({ item, onNavigate }: { item: NavItem; onNavigate?: () => void }) {
  const Icon = item.icon;
  return (
    <NavLink
      to={item.to}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-3 rounded-lg px-3.5 py-2.5 text-sm font-medium transition-colors',
          isActive
            ? 'bg-blue-600 text-white shadow-md shadow-blue-950/40'
            : 'text-slate-300 hover:bg-white/5 hover:text-white',
        )
      }
    >
      <Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.8} />
      <span>{item.label}</span>
    </NavLink>
  );
}

function SystemStatus() {
  const health = useHealth();
  const ok = health.data?.status === 'ok' && health.data.db === 'up';
  const label = health.isPending ? 'Checking status…' : ok ? 'System Operational' : 'Degraded Service';
  return (
    <div
      className={cn(
        'flex items-center gap-2.5 rounded-lg border px-3.5 py-2.5 text-xs font-medium',
        health.isPending
          ? 'border-slate-600/40 bg-slate-500/10 text-slate-300'
          : ok
            ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300'
            : 'border-red-500/30 bg-red-500/10 text-red-300',
      )}
    >
      <span className="relative flex h-2.5 w-2.5">
        {ok && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-50" />}
        <span
          className={cn(
            'relative inline-flex h-2.5 w-2.5 rounded-full',
            health.isPending ? 'bg-slate-400' : ok ? 'bg-emerald-400' : 'bg-red-400',
          )}
        />
      </span>
      {label}
    </div>
  );
}

function UserCard() {
  const user = useAuthUser();
  const logout = useLogout();
  const navigate = useNavigate();
  return (
    <Dropdown
      side="top"
      align="left"
      className="w-full"
      trigger={({ toggle, open }) => (
        <button
          onClick={toggle}
          className="flex w-full cursor-pointer items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-white/5"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-500/40 text-sm font-semibold text-white ring-2 ring-white/10">
            {initials(user.name)}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-white">{user.name}</span>
            <span className="block truncate text-xs text-slate-400">{titleCase(user.role)}</span>
          </span>
          <ChevronDown className={cn('h-4 w-4 text-slate-400 transition-transform', open && 'rotate-180')} />
        </button>
      )}
    >
      {(close) => (
        <>
          <div className="border-b border-slate-100 px-3 py-2">
            <p className="truncate text-sm font-medium text-slate-900">{user.email}</p>
            <p className="text-xs text-slate-500">{user.organization.name}</p>
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

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const user = useAuthUser();
  return (
    <div className="flex h-full flex-col bg-gradient-to-b from-navy-900 to-navy-950">
      <div className="px-5 pt-5 pb-6">
        <Logo />
      </div>
      <nav className="flex-1 space-y-6 overflow-y-auto px-3 pb-4">
        <NavEntry item={NAV_TOP} onNavigate={onNavigate} />
        {NAV_SECTIONS.map((section) => {
          const items = section.items.filter((i) => !i.permission || hasPermission(user.role, i.permission));
          if (items.length === 0) return null;
          return (
            <div key={section.title}>
              <p className="mb-2 px-3.5 text-[11px] font-semibold tracking-wider text-slate-400 uppercase">
                {section.title}
              </p>
              <div className="space-y-1">
                {items.map((item) => (
                  <NavEntry key={item.to} item={item} onNavigate={onNavigate} />
                ))}
              </div>
            </div>
          );
        })}
      </nav>
      <div className="space-y-4 px-3 pb-4">
        <SystemStatus />
        <div className="border-t border-white/10 pt-3">
          <UserCard />
        </div>
      </div>
    </div>
  );
}

export function Sidebar() {
  const mobileOpen = useUiStore((s) => s.mobileNavOpen);
  const setMobileOpen = useUiStore((s) => s.setMobileNavOpen);
  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[244px] lg:block">
        <SidebarContent />
      </aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setMobileOpen(false)} />
          <aside className="animate-fade-in absolute inset-y-0 left-0 w-[264px] shadow-2xl">
            <button
              onClick={() => setMobileOpen(false)}
              className="absolute top-5 right-3 z-10 cursor-pointer rounded-md p-1.5 text-slate-300 hover:bg-white/10"
              aria-label="Close menu"
            >
              <X className="h-5 w-5" />
            </button>
            <SidebarContent onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}
    </>
  );
}
