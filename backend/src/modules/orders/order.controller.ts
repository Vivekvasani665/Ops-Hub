import type { Request, Response } from 'express';
import { ORDER_STATUSES, type OrderStatus } from '@shared';
import { Errors } from '../../utils/errors';
import { pagination, parseDate, parseObjectId, queryString } from '../../utils/http';
import * as orderService from './order.service';

function context(req: Request): orderService.RequestContext {
  return {
    organizationId: req.tenantId!,
    actor: { id: req.auth!.userId, name: req.auth!.name },
    role: req.auth!.role,
    ip: req.ip,
  };
}

export async function listOrdersController(req: Request, res: Response) {
  const status = queryString(req, 'status');
  if (status && !(ORDER_STATUSES as readonly string[]).includes(status)) {
    throw Errors.validation({ status: 'Unknown status' });
  }
  const result = await orderService.listOrders(req.tenantId!, {
    ...pagination(req, { limit: 10, max: 100 }),
    status: status as OrderStatus | undefined,
    search: queryString(req, 'search')?.slice(0, 100),
    from: parseDate(queryString(req, 'from')),
    to: parseDate(queryString(req, 'to'), true),
  });
  res.json(result);
}

export async function getOrderController(req: Request, res: Response) {
  const id = parseObjectId(String(req.params.id), 'Order');
  res.json({ data: await orderService.getOrder(req.tenantId!, id) });
}

export async function createOrderController(req: Request, res: Response) {
  const order = await orderService.createOrder(context(req), req.body);
  res.status(201).json({ data: order });
}

export async function updateOrderStatusController(req: Request, res: Response) {
  const id = parseObjectId(String(req.params.id), 'Order');
  res.json({ data: await orderService.updateOrderStatus(context(req), id, req.body) });
}
