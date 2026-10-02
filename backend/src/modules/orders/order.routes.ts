import { Router } from 'express';
import { createOrderSchema, updateOrderStatusSchema } from '@shared';
import { requirePermission } from '../../middlewares/auth.middleware';
import { validateBody } from '../../middlewares/validation.middleware';
import { idempotency } from '../../middlewares/idempotency.middleware';
import {
  createOrderController,
  getOrderController,
  listOrdersController,
  updateOrderStatusController,
} from './order.controller';

export const orderRouter = Router();

orderRouter.get('/', requirePermission('orders:read'), listOrdersController);
orderRouter.get('/:id', requirePermission('orders:read'), getOrderController);
// Validation runs before idempotency so the stored request hash is over the normalised body.
orderRouter.post(
  '/',
  requirePermission('orders:create'),
  validateBody(createOrderSchema),
  idempotency({ required: true }),
  createOrderController,
);
// Fine-grained permission (cancel vs progress) is checked in the service once the target status is known.
orderRouter.patch(
  '/:id/status',
  requirePermission('orders:update_status'),
  validateBody(updateOrderStatusSchema),
  updateOrderStatusController,
);
