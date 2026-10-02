import { useQuery } from '@tanstack/react-query';
import { dashboardApi } from '@/services/dashboard.api';

export const dashboardKeys = {
  all: ['dashboard'] as const,
  summary: () => [...dashboardKeys.all, 'summary'] as const,
};

export function useDashboardSummary() {
  return useQuery({
    queryKey: dashboardKeys.summary(),
    queryFn: () => dashboardApi.summary(),
    refetchInterval: 60_000,
  });
}
