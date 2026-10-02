import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CategoryInput, CouponInput } from '@/shared';
import {
  categoriesApi,
  couponsApi,
  customersApi,
  mediaApi,
  type CouponListParams,
  type CustomerListParams,
} from '@/services/catalog.api';
import { auditKeys } from '@/features/audit/hooks';

export const categoryKeys = { all: ['categories'] as const };
export const customerKeys = {
  all: ['customers'] as const,
  list: (params: CustomerListParams) => [...customerKeys.all, 'list', params] as const,
};
export const couponKeys = {
  all: ['coupons'] as const,
  list: (params: CouponListParams) => [...couponKeys.all, 'list', params] as const,
};

export function useCategories() {
  return useQuery({ queryKey: categoryKeys.all, queryFn: () => categoriesApi.list() });
}

function useInvalidate(...keys: (readonly unknown[])[]) {
  const qc = useQueryClient();
  return () => {
    for (const queryKey of [...keys, auditKeys.all]) void qc.invalidateQueries({ queryKey });
  };
}

export function useSaveCategory() {
  // A rename moves products too.
  const invalidate = useInvalidate(categoryKeys.all, ['products']);
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: CategoryInput }) =>
      id ? categoriesApi.update(id, input) : categoriesApi.create(input).then((category) => ({ category, productsMoved: 0 })),
    onSuccess: invalidate,
  });
}

export function useDeleteCategory() {
  const invalidate = useInvalidate(categoryKeys.all);
  return useMutation({ mutationFn: (id: string) => categoriesApi.remove(id), onSuccess: invalidate });
}

export function useCustomers(params: CustomerListParams) {
  return useQuery({
    queryKey: customerKeys.list(params),
    queryFn: () => customersApi.list(params),
    placeholderData: keepPreviousData,
  });
}

export function useCoupons(params: CouponListParams) {
  return useQuery({
    queryKey: couponKeys.list(params),
    queryFn: () => couponsApi.list(params),
    placeholderData: keepPreviousData,
  });
}

export function useSaveCoupon() {
  const invalidate = useInvalidate(couponKeys.all);
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: CouponInput }) =>
      id ? couponsApi.update(id, input) : couponsApi.create(input),
    onSuccess: invalidate,
  });
}

export function useDeleteCoupon() {
  const invalidate = useInvalidate(couponKeys.all);
  return useMutation({ mutationFn: (id: string) => couponsApi.remove(id), onSuccess: invalidate });
}

export function useUploadImage() {
  return useMutation({ mutationFn: (file: Blob) => mediaApi.upload(file) });
}
