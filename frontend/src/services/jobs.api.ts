import type { JobDto, JobStatus, JobType, PageMeta } from '@/shared';
import { api } from '@/lib/api';
import { cleanParams, type Envelope } from './types';

export interface JobListParams {
  page?: number;
  limit?: number;
  status?: JobStatus | '';
  type?: JobType | '';
}

export interface JobList {
  data: JobDto[];
  meta: PageMeta & { counts: Record<JobStatus, number> };
}

export const jobsApi = {
  async list(params: JobListParams): Promise<JobList> {
    const res = await api.get<JobList>('/jobs', { params: cleanParams(params) });
    return res.data;
  },
  async retry(id: string): Promise<JobDto> {
    const res = await api.post<Envelope<JobDto>>(`/jobs/${id}/retry`);
    return res.data.data;
  },
};
