import type { DashboardSummaryDto } from '@/shared';
import { api } from '@/lib/api';
import type { Envelope } from './types';

export const dashboardApi = {
  async summary(): Promise<DashboardSummaryDto> {
    const res = await api.get<Envelope<DashboardSummaryDto>>('/dashboard/summary');
    return res.data.data;
  },
};
