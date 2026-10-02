import type { CategoryDto, CategoryInput, CouponDto, CouponInput, CustomerDto, MediaUploadDto } from '@/shared';
import { api } from '@/lib/api';
import { cleanParams, type Envelope, type Paged } from './types';

export const categoriesApi = {
  async list(): Promise<CategoryDto[]> {
    const res = await api.get<Envelope<CategoryDto[]>>('/categories');
    return res.data.data;
  },
  async create(input: CategoryInput): Promise<CategoryDto> {
    const res = await api.post<Envelope<CategoryDto>>('/categories', input);
    return res.data.data;
  },
  async update(id: string, input: CategoryInput): Promise<{ category: CategoryDto; productsMoved: number }> {
    const res = await api.patch<Envelope<CategoryDto> & { meta: { productsMoved: number } }>(`/categories/${id}`, input);
    return { category: res.data.data, productsMoved: res.data.meta.productsMoved };
  },
  async remove(id: string): Promise<void> {
    await api.delete(`/categories/${id}`);
  },
};

export interface CustomerListParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: 'ACTIVE' | 'DISABLED' | '';
}

export const customersApi = {
  async list(params: CustomerListParams): Promise<Paged<CustomerDto>> {
    const res = await api.get<Paged<CustomerDto>>('/customers', { params: cleanParams(params) });
    return res.data;
  },
};

export type CouponStatusFilter = 'active' | 'inactive' | 'expired' | '';

export interface CouponListParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: CouponStatusFilter;
}

export const couponsApi = {
  async list(params: CouponListParams): Promise<Paged<CouponDto>> {
    const res = await api.get<Paged<CouponDto>>('/coupons', { params: cleanParams(params) });
    return res.data;
  },
  async create(input: CouponInput): Promise<CouponDto> {
    const res = await api.post<Envelope<CouponDto>>('/coupons', input);
    return res.data.data;
  },
  async update(id: string, input: CouponInput): Promise<CouponDto> {
    const res = await api.patch<Envelope<CouponDto>>(`/coupons/${id}`, input);
    return res.data.data;
  },
  async remove(id: string): Promise<void> {
    await api.delete(`/coupons/${id}`);
  },
};

export const mediaApi = {
  /** Sends the image bytes as the raw request body. */
  async upload(file: Blob): Promise<MediaUploadDto> {
    const res = await api.post<Envelope<MediaUploadDto>>('/media', file, {
      headers: { 'Content-Type': file.type || 'application/octet-stream' },
    });
    return res.data.data;
  },
};
