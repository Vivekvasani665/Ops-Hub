import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AdjustInventoryInput } from '@/shared';
import { inventoryApi, type InventoryListParams } from '@/services/inventory.api';
import { dashboardKeys } from '@/features/dashboard/hooks';
import { productKeys } from '@/features/products/hooks';
import { auditKeys } from '@/features/audit/hooks';

export const inventoryKeys = {
  all: ['inventory'] as const,
  list: (params: InventoryListParams) => [...inventoryKeys.all, 'list', params] as const,
};

export function useInventory(params: InventoryListParams) {
  return useQuery({
    queryKey: inventoryKeys.list(params),
    queryFn: () => inventoryApi.list(params),
    placeholderData: keepPreviousData,
  });
}

export function useAdjustInventory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ productId, input }: { productId: string; input: AdjustInventoryInput }) =>
      inventoryApi.adjust(productId, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: inventoryKeys.all });
      void qc.invalidateQueries({ queryKey: productKeys.all });
      void qc.invalidateQueries({ queryKey: dashboardKeys.all });
      void qc.invalidateQueries({ queryKey: auditKeys.all });
    },
  });
}
