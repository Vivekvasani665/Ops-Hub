import { Router } from 'express';
import { Notification } from './notification.model';
import { toNotificationDto } from './notification.mapper';

export const notificationRouter = Router();

notificationRouter.get('/', async (req, res) => {
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 10));
  const docs = await Notification.find({ organizationId: req.tenantId }).sort({ createdAt: -1 }).limit(limit).lean();
  res.json({ data: docs.map((d) => toNotificationDto(d as never)) });
});
