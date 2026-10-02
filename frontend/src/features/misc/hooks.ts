import { useQuery } from '@tanstack/react-query';
import { miscApi } from '@/services/misc.api';

export const notificationKeys = {
  all: ['notifications'] as const,
  list: (limit: number) => [...notificationKeys.all, limit] as const,
};
export const userKeys = { all: ['users'] as const };
export const orgKeys = { current: ['organization', 'current'] as const };
export const healthKeys = { all: ['health'] as const };

export function useNotifications(limit = 10) {
  return useQuery({
    queryKey: notificationKeys.list(limit),
    queryFn: () => miscApi.notifications(limit),
  });
}

export function useUsers() {
  return useQuery({ queryKey: userKeys.all, queryFn: () => miscApi.users() });
}

export function useOrganization() {
  return useQuery({ queryKey: orgKeys.current, queryFn: () => miscApi.organization() });
}

export function useHealth() {
  return useQuery({
    queryKey: healthKeys.all,
    queryFn: () => miscApi.health(),
    refetchInterval: 30_000,
    retry: false,
  });
}
