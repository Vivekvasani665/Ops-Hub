import type { DashboardRange, DashboardSummaryDto } from '@/shared';
import { api } from '@/lib/api';
import type { Envelope } from './types';

export const dashboardApi = {
  async summary(days: DashboardRange = 7): Promise<DashboardSummaryDto> {
    const res = await api.get<Envelope<DashboardSummaryDto>>('/dashboard/summary', { params: { days } });
    return res.data.data;
  },
};
