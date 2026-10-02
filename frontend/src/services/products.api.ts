import type { CreateProductInput, ProductDto } from '@/shared';
import { api } from '@/lib/api';
import { cleanParams, type Envelope, type Paged } from './types';

export type ProductWithInventory = ProductDto & {
  inventory: { available: number; reserved: number; reorderLevel: number } | null;
};

export interface ProductListParams {
  page?: number;
  limit?: number;
  search?: string;
}

export const productsApi = {
  async list(params: ProductListParams): Promise<Paged<ProductWithInventory>> {
    const res = await api.get<Paged<ProductWithInventory>>('/products', { params: cleanParams(params) });
    return res.data;
  },
  async create(input: CreateProductInput): Promise<ProductDto> {
    const res = await api.post<Envelope<ProductDto>>('/products', input);
    return res.data.data;
  },
};
