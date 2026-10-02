import { useState } from 'react';
import { Link } from 'react-router';
import { ScrollText, X } from 'lucide-react';
import { AUDIT_ACTIONS, ENTITY_TYPES, type AuditAction, type AuditLogDto, type EntityType } from '@/shared';
import { useAuditLogs } from '@/features/audit/hooks';
import { auditMeta, describeAudit, metadataSummary } from '@/lib/audit';
import { cn, formatDateTime, titleCase } from '@/lib/utils';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { TableSkeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/Table';

const ACTION_OPTIONS = AUDIT_ACTIONS.map((a) => ({ value: a, label: auditMeta(a).label }));
const ENTITY_OPTIONS = ENTITY_TYPES.map((e) => ({ value: e, label: titleCase(e) }));

function EntityCell({ log }: { log: AuditLogDto }) {
  const label = titleCase(log.entityType);
  if (log.entityType === 'ORDER' && log.entityId) {
    const no = log.metadata?.orderNumber;
    return (
      <Link to={`/orders/${log.entityId}`} className="text-blue-600 hover:underline">
        {label} {no ? `#${String(no)}` : ''}
      </Link>
    );
  }
  return <span className="text-slate-600">{label}</span>;
}

export function AuditLogsPage() {
  const [action, setAction] = useState<AuditAction | ''>('');
  const [entityType, setEntityType] = useState<EntityType | ''>('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const logs = useAuditLogs({ limit: 25, action, entityType, from, to });
  const rows = logs.data?.pages.flatMap((p) => p.data) ?? [];
  const filtered = Boolean(action || entityType || from || to);

  return (
    <div>
      <PageHeader title="Audit Logs" description="Append-only record of every important action in your organization." />
      <Card>
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 lg:flex-row lg:items-center">
          <Select className="lg:w-52" placeholder="All actions" options={ACTION_OPTIONS} value={action} onChange={(e) => setAction(e.target.value as AuditAction | '')} />
          <Select className="lg:w-40" placeholder="All entities" options={ENTITY_OPTIONS} value={entityType} onChange={(e) => setEntityType(e.target.value as EntityType | '')} />
          <div className="flex items-center gap-2">
            <Input type="date" aria-label="From date" className="w-40" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
            <span className="text-xs text-slate-400">to</span>
            <Input type="date" aria-label="To date" className="w-40" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
          </div>
          {filtered && (
            <Button
              variant="ghost"
              size="sm"
              className="lg:ml-auto"
              onClick={() => {
                setAction('');
                setEntityType('');
                setFrom('');
                setTo('');
              }}
            >
              <X className="h-3.5 w-3.5" /> Clear filters
            </Button>
          )}
        </div>
        {logs.isPending ? (
          <TableSkeleton rows={10} cols={5} />
        ) : logs.isError ? (
          <ErrorState error={logs.error} onRetry={() => logs.refetch()} />
        ) : rows.length === 0 ? (
          <EmptyState icon={<ScrollText className="h-6 w-6" />} title="No audit entries" description={filtered ? 'Nothing matches these filters.' : undefined} />
        ) : (
          <>
            <Table>
              <THead>
                <TR className="hover:bg-transparent">
                  <TH>Time</TH>
                  <TH>Actor</TH>
                  <TH>Action</TH>
                  <TH>Entity</TH>
                  <TH>Details</TH>
                </TR>
              </THead>
              <TBody>
                {rows.map((log) => {
                  const meta = auditMeta(log.action);
                  const Icon = meta.icon;
                  const { detail } = describeAudit(log);
                  return (
                    <TR key={log.id}>
                      <TD className="text-slate-500">{formatDateTime(log.createdAt)}</TD>
                      <TD className="font-medium text-slate-800">{log.actor?.name ?? 'System'}</TD>
                      <TD>
                        <span className="inline-flex items-center gap-2">
                          <span className={cn('flex h-6 w-6 items-center justify-center rounded-full ring-2', meta.tone)}>
                            <Icon className="h-3 w-3" />
                          </span>
                          <span className="text-slate-800">{meta.label}</span>
                        </span>
                      </TD>
                      <TD>
                        <EntityCell log={log} />
                      </TD>
                      <TD className="max-w-md whitespace-normal">
                        {detail && <span className="block text-slate-700">{detail}</span>}
                        <span className="block truncate text-xs text-slate-400" title={metadataSummary(log.metadata)}>
                          {metadataSummary(log.metadata)}
                        </span>
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
            <div className="flex items-center justify-between border-t border-slate-100 px-5 py-4">
              <p className="text-xs text-slate-500">Showing {rows.length} entries</p>
              {logs.hasNextPage ? (
                <Button variant="outline" size="sm" loading={logs.isFetchingNextPage} onClick={() => logs.fetchNextPage()}>
                  Load more
                </Button>
              ) : (
                <span className="text-xs text-slate-400">End of log</span>
              )}
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
