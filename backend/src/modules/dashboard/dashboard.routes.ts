import { Router } from 'express';
import { requirePermission } from '../../middlewares/auth.middleware';
import { getDashboardSummaryCached } from './dashboard.service';

export const dashboardRouter = Router();

dashboardRouter.get('/summary', requirePermission('dashboard:read'), async (req, res) => {
  res.json({ data: await getDashboardSummaryCached(req.tenantId!) });
});
