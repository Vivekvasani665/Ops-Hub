import { Check, X } from 'lucide-react';
import { PERMISSIONS, ROLE_PERMISSIONS } from '@/shared';
import { useAuthUser } from '@/features/auth/auth-context';
import { useSocketStatus } from '@/hooks/useSocketStatus';
import { cn, initials, titleCase } from '@/lib/utils';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';

export function SettingsPage() {
  const user = useAuthUser();
  const connected = useSocketStatus();
  const granted = new Set(ROLE_PERMISSIONS[user.role]);

  return (
    <div className="space-y-5">
      <PageHeader title="Settings" description="Your profile, permissions and connection status." />
      <div className="grid gap-5 lg:grid-cols-3">
        <Card>
          <CardHeader title="Profile" />
          <CardBody className="flex items-center gap-4">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-700 text-lg font-semibold text-white">
              {initials(user.name)}
            </span>
            <div className="min-w-0">
              <p className="font-medium text-slate-900">{user.name}</p>
              <p className="truncate text-sm text-slate-500">{user.email}</p>
              <p className="mt-1 text-xs text-slate-500">
                {titleCase(user.role)} · {user.organization.name}
              </p>
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Realtime" />
          <CardBody className="flex items-center gap-3">
            <span className={cn('h-2.5 w-2.5 rounded-full', connected ? 'bg-emerald-500' : 'bg-slate-300')} />
            <span className="text-sm text-slate-700">{connected ? 'Connected — updates arrive live' : 'Disconnected — reconnecting…'}</span>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Session" />
          <CardBody className="text-sm text-slate-600">
            Tokens live in httpOnly cookies. Access tokens expire after 15 minutes and are refreshed automatically.
          </CardBody>
        </Card>
      </div>
      <Card>
        <CardHeader title="Your permissions" description={`Granted to the ${titleCase(user.role)} role. The API enforces these on every request.`} />
        <CardBody>
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {PERMISSIONS.map((p) => {
              const ok = granted.has(p);
              return (
                <li key={p} className="flex items-center gap-2 text-sm">
                  {ok ? <Check className="h-4 w-4 text-emerald-600" /> : <X className="h-4 w-4 text-slate-300" />}
                  <span className={ok ? 'text-slate-800' : 'text-slate-400'}>{p}</span>
                  {ok && p.endsWith(':read') === false && <Badge tone="blue" className="ml-auto">write</Badge>}
                </li>
              );
            })}
          </ul>
        </CardBody>
      </Card>
    </div>
  );
}
