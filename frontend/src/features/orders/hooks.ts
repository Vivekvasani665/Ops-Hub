import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateOrderInput, UpdateOrderStatusInput } from '@/shared';
import { ordersApi, type OrderListParams } from '@/services/orders.api';
import { dashboardKeys } from '@/features/dashboard/hooks';
import { inventoryKeys } from '@/features/inventory/hooks';
import { auditKeys } from '@/features/audit/hooks';

export const orderKeys = {
  all: ['orders'] as const,
  lists: () => [...orderKeys.all, 'list'] as const,
  list: (params: OrderListParams) => [...orderKeys.lists(), params] as const,
  details: () => [...orderKeys.all, 'detail'] as const,
  detail: (id: string) => [...orderKeys.details(), id] as const,
};

export function useOrders(params: OrderListParams) {
  return useQuery({
    queryKey: orderKeys.list(params),
    queryFn: () => ordersApi.list(params),
    placeholderData: keepPreviousData,
  });
}

export function useOrder(id: string) {
  return useQuery({
    queryKey: orderKeys.detail(id),
    queryFn: () => ordersApi.get(id),
  });
}

export function useCreateOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ input, idempotencyKey }: { input: CreateOrderInput; idempotencyKey: string }) =>
      ordersApi.create(input, idempotencyKey),
    onSuccess: (order) => {
      qc.setQueryData(orderKeys.detail(order.id), order);
      void qc.invalidateQueries({ queryKey: orderKeys.lists() });
      void qc.invalidateQueries({ queryKey: dashboardKeys.all });
      void qc.invalidateQueries({ queryKey: inventoryKeys.all });
      void qc.invalidateQueries({ queryKey: auditKeys.all });
    },
  });
}

export function useUpdateOrderStatus(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateOrderStatusInput) => ordersApi.updateStatus(id, input),
    onSuccess: (order) => {
      qc.setQueryData(orderKeys.detail(id), order);
      void qc.invalidateQueries({ queryKey: orderKeys.lists() });
      void qc.invalidateQueries({ queryKey: dashboardKeys.all });
      void qc.invalidateQueries({ queryKey: inventoryKeys.all });
      void qc.invalidateQueries({ queryKey: auditKeys.all });
    },
    onError: () => {
      // Our copy may be stale (e.g. someone else moved the order); refetch the truth.
      void qc.invalidateQueries({ queryKey: orderKeys.detail(id) });
    },
  });
}
