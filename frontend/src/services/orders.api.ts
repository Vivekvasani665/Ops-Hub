import type {
  CreateOrderInput,
  OrderDto,
  OrderListItemDto,
  OrderStatus,
  UpdateOrderStatusInput,
} from '@/shared';
import { api } from '@/lib/api';
import { cleanParams, type Envelope, type Paged } from './types';

export interface OrderListParams {
  page?: number;
  limit?: number;
  status?: OrderStatus | '';
  search?: string;
  from?: string;
  to?: string;
}

export const ordersApi = {
  async list(params: OrderListParams): Promise<Paged<OrderListItemDto>> {
    const res = await api.get<Paged<OrderListItemDto>>('/orders', { params: cleanParams(params) });
    return res.data;
  },
  async get(id: string): Promise<OrderDto> {
    const res = await api.get<Envelope<OrderDto>>(`/orders/${id}`);
    return res.data.data;
  },
  async create(input: CreateOrderInput, idempotencyKey: string): Promise<OrderDto> {
    const res = await api.post<Envelope<OrderDto>>('/orders', input, {
      headers: { 'Idempotency-Key': idempotencyKey },
    });
    return res.data.data;
  },
  async updateStatus(id: string, input: UpdateOrderStatusInput): Promise<OrderDto> {
    const res = await api.patch<Envelope<OrderDto>>(`/orders/${id}/status`, input);
    return res.data.data;
  },
};
