import type { ReactNode } from 'react';
import { ShieldOff } from 'lucide-react';
import type { Permission } from '@/shared';
import { useCan } from '@/features/auth/hooks';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';

/** UI guard only; the API enforces the same permission on every request. */
export function RequirePermission({ permission, children }: { permission: Permission; children: ReactNode }) {
  const allowed = useCan(permission);
  if (allowed) return <>{children}</>;
  return (
    <Card>
      <EmptyState
        icon={<ShieldOff className="h-6 w-6" />}
        title="You don't have access to this page"
        description="Ask an organization admin to grant your role the required permission."
      />
    </Card>
  );
}
