import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { DashboardRange } from '@/shared';
import { dashboardApi } from '@/services/dashboard.api';

export const dashboardKeys = {
  all: ['dashboard'] as const,
  summary: (days: DashboardRange = 7) => [...dashboardKeys.all, 'summary', days] as const,
};

export function useDashboardSummary(days: DashboardRange = 7) {
  return useQuery({
    queryKey: dashboardKeys.summary(days),
    queryFn: () => dashboardApi.summary(days),
    placeholderData: keepPreviousData,
    refetchInterval: 60_000,
  });
}
