import { Router } from 'express';
import { DASHBOARD_RANGES, type DashboardRange } from '@shared';
import { requirePermission } from '../../middlewares/auth.middleware';
import { getDashboardSummaryCached } from './dashboard.service';

export const dashboardRouter = Router();

dashboardRouter.get('/summary', requirePermission('dashboard:read'), async (req, res) => {
  const days = Number(req.query.days ?? 7) as DashboardRange;
  const range = DASHBOARD_RANGES.includes(days) ? days : 7;
  res.json({ data: await getDashboardSummaryCached(req.tenantId!, range) });
});
