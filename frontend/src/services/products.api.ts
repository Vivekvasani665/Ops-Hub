import type { CreateProductInput, ProductDto, ProductWithInventoryDto, UpdateProductInput } from '@/shared';
import { api } from '@/lib/api';
import { cleanParams, type Envelope, type Paged } from './types';

export type ProductWithInventory = ProductWithInventoryDto;

export type ProductSort = 'name' | 'newest' | 'oldest' | 'price_asc' | 'price_desc';

export interface ProductListParams {
  page?: number;
  limit?: number;
  search?: string;
  category?: string;
  status?: 'active' | 'inactive' | '';
  sort?: ProductSort;
}

export const productsApi = {
  async list(params: ProductListParams): Promise<Paged<ProductWithInventory>> {
    const res = await api.get<Paged<ProductWithInventory>>('/products', { params: cleanParams(params) });
    return res.data;
  },
  async get(id: string): Promise<ProductWithInventory> {
    const res = await api.get<Envelope<ProductWithInventory>>(`/products/${id}`);
    return res.data.data;
  },
  async create(input: CreateProductInput): Promise<ProductDto> {
    const res = await api.post<Envelope<ProductDto>>('/products', input);
    return res.data.data;
  },
  async update(id: string, input: UpdateProductInput): Promise<ProductWithInventory> {
    const res = await api.patch<Envelope<ProductWithInventory>>(`/products/${id}`, input);
    return res.data.data;
  },
  async remove(id: string): Promise<void> {
    await api.delete(`/products/${id}`);
  },
};
