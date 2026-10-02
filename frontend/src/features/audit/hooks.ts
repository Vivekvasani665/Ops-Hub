import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { auditApi, type AuditListParams } from '@/services/audit.api';

export const auditKeys = {
  all: ['audit'] as const,
  infinite: (params: Omit<AuditListParams, 'cursor'>) => [...auditKeys.all, 'infinite', params] as const,
  recent: (limit: number) => [...auditKeys.all, 'recent', limit] as const,
};

export function useAuditLogs(params: Omit<AuditListParams, 'cursor'>) {
  return useInfiniteQuery({
    queryKey: auditKeys.infinite(params),
    queryFn: ({ pageParam }) => auditApi.list({ ...params, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.meta.nextCursor ?? undefined,
  });
}

export function useRecentActivity(limit = 5) {
  return useQuery({
    queryKey: auditKeys.recent(limit),
    queryFn: () => auditApi.list({ limit }),
    select: (res) => res.data,
  });
}
