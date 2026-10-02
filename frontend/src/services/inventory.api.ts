import type { AdjustInventoryInput, InventoryItemDto } from '@/shared';
import { api } from '@/lib/api';
import { cleanParams, type Envelope, type Paged } from './types';

export type StockFilter = 'all' | 'low' | 'out';

export interface InventoryListParams {
  page?: number;
  limit?: number;
  search?: string;
  stock?: StockFilter;
}

export const inventoryApi = {
  async list(params: InventoryListParams): Promise<Paged<InventoryItemDto>> {
    const res = await api.get<Paged<InventoryItemDto>>('/inventory', { params: cleanParams(params) });
    return res.data;
  },
  async adjust(productId: string, input: AdjustInventoryInput): Promise<InventoryItemDto> {
    const res = await api.post<Envelope<InventoryItemDto>>(`/inventory/${productId}/adjust`, input);
    return res.data.data;
  },
};
