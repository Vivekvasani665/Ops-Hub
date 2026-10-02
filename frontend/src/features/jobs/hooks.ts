import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { jobsApi, type JobListParams } from '@/services/jobs.api';

export const jobKeys = {
  all: ['jobs'] as const,
  list: (params: JobListParams) => [...jobKeys.all, 'list', params] as const,
};

export function useJobs(params: JobListParams) {
  return useQuery({
    queryKey: jobKeys.list(params),
    queryFn: () => jobsApi.list(params),
    placeholderData: keepPreviousData,
    refetchInterval: 15_000,
  });
}

export function useRetryJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => jobsApi.retry(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: jobKeys.all }),
  });
}
