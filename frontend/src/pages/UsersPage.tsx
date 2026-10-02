import { Users } from 'lucide-react';
import { useUsers } from '@/features/misc/hooks';
import { formatDateTime, initials, titleCase } from '@/lib/utils';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Badge, type Tone } from '@/components/ui/Badge';
import { TableSkeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/Table';
import type { Role } from '@/shared';

const ROLE_TONE: Record<Role, Tone> = {
  SUPER_ADMIN: 'red',
  ORG_ADMIN: 'indigo',
  MANAGER: 'blue',
  OPERATOR: 'green',
  VIEWER: 'gray',
};

export function UsersPage() {
  const users = useUsers();
  return (
    <div>
      <PageHeader title="Users" description="People with access to this organization." />
      <Card>
        {users.isPending ? (
          <TableSkeleton rows={5} cols={5} />
        ) : users.isError ? (
          <ErrorState error={users.error} onRetry={() => users.refetch()} />
        ) : users.data.length === 0 ? (
          <EmptyState icon={<Users className="h-6 w-6" />} title="No users" />
        ) : (
          <Table>
            <THead>
              <TR className="hover:bg-transparent">
                <TH>User</TH>
                <TH>Role</TH>
                <TH>Status</TH>
                <TH>Last login</TH>
                <TH>Joined</TH>
              </TR>
            </THead>
            <TBody>
              {users.data.map((u) => (
                <TR key={u.id}>
                  <TD>
                    <span className="flex items-center gap-3">
                      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">
                        {initials(u.name)}
                      </span>
                      <span>
                        <span className="block font-medium text-slate-800">{u.name}</span>
                        <span className="block text-xs text-slate-400">{u.email}</span>
                      </span>
                    </span>
                  </TD>
                  <TD>
                    <Badge tone={ROLE_TONE[u.role]}>{titleCase(u.role)}</Badge>
                  </TD>
                  <TD>
                    <Badge tone={u.status === 'ACTIVE' ? 'green' : 'gray'} dot>
                      {titleCase(u.status)}
                    </Badge>
                  </TD>
                  <TD className="text-slate-500">{u.lastLoginAt ? formatDateTime(u.lastLoginAt) : 'Never'}</TD>
                  <TD className="text-slate-500">{formatDateTime(u.createdAt)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
