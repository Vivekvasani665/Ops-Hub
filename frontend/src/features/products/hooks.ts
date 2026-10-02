import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateProductInput, UpdateProductInput } from '@/shared';
import { productsApi, type ProductListParams } from '@/services/products.api';
import { inventoryKeys } from '@/features/inventory/hooks';
import { dashboardKeys } from '@/features/dashboard/hooks';
import { auditKeys } from '@/features/audit/hooks';
import { categoryKeys } from '@/features/catalog/hooks';

export const productKeys = {
  all: ['products'] as const,
  list: (params: ProductListParams) => [...productKeys.all, 'list', params] as const,
  detail: (id: string) => [...productKeys.all, 'detail', id] as const,
};

export function useProducts(params: ProductListParams, enabled = true) {
  return useQuery({
    queryKey: productKeys.list(params),
    queryFn: () => productsApi.list(params),
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useProduct(id: string | undefined) {
  return useQuery({
    queryKey: productKeys.detail(id ?? ''),
    queryFn: () => productsApi.get(id!),
    enabled: Boolean(id),
  });
}

/** Everything a catalog change can show up in. */
function useInvalidateCatalog() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: productKeys.all });
    void qc.invalidateQueries({ queryKey: inventoryKeys.all });
    void qc.invalidateQueries({ queryKey: categoryKeys.all });
    void qc.invalidateQueries({ queryKey: dashboardKeys.all });
    void qc.invalidateQueries({ queryKey: auditKeys.all });
  };
}

export function useCreateProduct() {
  const invalidate = useInvalidateCatalog();
  return useMutation({
    mutationFn: (input: CreateProductInput) => productsApi.create(input),
    onSuccess: invalidate,
  });
}

export function useUpdateProduct(id: string) {
  const invalidate = useInvalidateCatalog();
  return useMutation({
    mutationFn: (input: UpdateProductInput) => productsApi.update(id, input),
    onSuccess: invalidate,
  });
}

export function useDeleteProduct() {
  const invalidate = useInvalidateCatalog();
  return useMutation({
    mutationFn: (id: string) => productsApi.remove(id),
    onSuccess: invalidate,
  });
}
