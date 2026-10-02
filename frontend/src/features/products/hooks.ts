import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateProductInput } from '@/shared';
import { productsApi, type ProductListParams } from '@/services/products.api';
import { inventoryKeys } from '@/features/inventory/hooks';

export const productKeys = {
  all: ['products'] as const,
  list: (params: ProductListParams) => [...productKeys.all, 'list', params] as const,
};

export function useProducts(params: ProductListParams, enabled = true) {
  return useQuery({
    queryKey: productKeys.list(params),
    queryFn: () => productsApi.list(params),
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useCreateProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateProductInput) => productsApi.create(input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: productKeys.all });
      void qc.invalidateQueries({ queryKey: inventoryKeys.all });
    },
  });
}
