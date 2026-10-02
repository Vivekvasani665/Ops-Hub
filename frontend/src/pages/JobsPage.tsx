import { useState } from 'react';
import { toast } from 'sonner';
import { Activity, RotateCcw } from 'lucide-react';
import { JOB_STATUSES, JOB_TYPES, type JobStatus, type JobType } from '@/shared';
import { useJobs, useRetryJob } from '@/features/jobs/hooks';
import { useCan } from '@/features/auth/hooks';
import { toApiError } from '@/lib/api';
import { JOB_STATUS_META } from '@/lib/status';
import { cn, formatDateTime, formatNumber, titleCase } from '@/lib/utils';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Badge, toneClasses } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Pagination } from '@/components/ui/Pagination';
import { TableSkeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/Table';

export function JobsPage() {
  const canRetry = useCan('jobs:retry');
  const [status, setStatus] = useState<JobStatus | ''>('');
  const [type, setType] = useState<JobType | ''>('');
  const [page, setPage] = useState(1);
  const jobs = useJobs({ status, type, page, limit: 20 });
  const retry = useRetryJob();

  return (
    <div>
      <PageHeader title="Background Jobs" description="Async work processed by the worker with retries, backoff and lease-based crash recovery." />
      <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {JOB_STATUSES.map((s) => (
          <button
            key={s}
            onClick={() => {
              setStatus(status === s ? '' : s);
              setPage(1);
            }}
            className={cn(
              'cursor-pointer rounded-xl border bg-white p-4 text-left shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition',
              status === s ? 'border-blue-400 ring-2 ring-blue-500/20' : 'border-slate-200/80 hover:border-slate-300',
            )}
          >
            <span className="flex items-center gap-2 text-sm text-slate-600">
              <span className={cn('h-2 w-2 rounded-full', toneClasses[JOB_STATUS_META[s].tone].dot)} />
              {JOB_STATUS_META[s].label}
            </span>
            <span className="mt-2 block text-2xl font-semibold text-slate-900">
              {jobs.data ? formatNumber(jobs.data.meta.counts[s] ?? 0) : '—'}
            </span>
          </button>
        ))}
      </div>
      <Card>
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row">
          <Select
            className="sm:w-44"
            placeholder="All statuses"
            options={JOB_STATUSES.map((s) => ({ value: s, label: JOB_STATUS_META[s].label }))}
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as JobStatus | '');
              setPage(1);
            }}
          />
          <Select
            className="sm:w-60"
            placeholder="All types"
            options={JOB_TYPES.map((t) => ({ value: t, label: titleCase(t) }))}
            value={type}
            onChange={(e) => {
              setType(e.target.value as JobType | '');
              setPage(1);
            }}
          />
        </div>
        {jobs.isPending ? (
          <TableSkeleton rows={8} cols={6} />
        ) : jobs.isError ? (
          <ErrorState error={jobs.error} onRetry={() => jobs.refetch()} />
        ) : jobs.data.data.length === 0 ? (
          <EmptyState icon={<Activity className="h-6 w-6" />} title="No jobs" />
        ) : (
          <>
            <Table>
              <THead>
                <TR className="hover:bg-transparent">
                  <TH>Type</TH>
                  <TH>Status</TH>
                  <TH className="text-right">Attempts</TH>
                  <TH>Available at</TH>
                  <TH>Created</TH>
                  <TH>Worker</TH>
                  <TH>Last error</TH>
                  {canRetry && <TH className="text-right">Actions</TH>}
                </TR>
              </THead>
              <TBody>
                {jobs.data.data.map((j) => (
                  <TR key={j.id}>
                    <TD className="font-medium text-slate-800">{titleCase(j.type)}</TD>
                    <TD>
                      <Badge tone={JOB_STATUS_META[j.status].tone} dot>
                        {JOB_STATUS_META[j.status].label}
                      </Badge>
                    </TD>
                    <TD className="text-right">
                      {j.attempts}/{j.maxAttempts}
                    </TD>
                    <TD className="text-slate-500">{formatDateTime(j.availableAt)}</TD>
                    <TD className="text-slate-500">{formatDateTime(j.createdAt)}</TD>
                    <TD className="text-xs text-slate-400">{j.lockedBy ?? '—'}</TD>
                    <TD className="max-w-xs truncate text-xs text-red-600" title={j.lastError ?? undefined}>
                      {j.lastError ?? <span className="text-slate-300">—</span>}
                    </TD>
                    {canRetry && (
                      <TD className="text-right">
                        {j.status === 'FAILED' && (
                          <Button
                            variant="outline"
                            size="sm"
                            loading={retry.isPending && retry.variables === j.id}
                            onClick={() =>
                              retry.mutate(j.id, {
                                onSuccess: () => toast.success('Job re-queued'),
                                onError: (e) => toast.error(toApiError(e).message),
                              })
                            }
                          >
                            <RotateCcw className="h-3.5 w-3.5" /> Retry
                          </Button>
                        )}
                      </TD>
                    )}
                  </TR>
                ))}
              </TBody>
            </Table>
            <div className="border-t border-slate-100">
              <Pagination {...jobs.data.meta} onPageChange={setPage} noun="jobs" />
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
