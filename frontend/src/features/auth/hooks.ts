import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { hasPermission, type AuthUser, type LoginInput, type Permission } from '@/shared';
import { authApi } from '@/services/auth.api';
import { ApiError } from '@/lib/api';
import { disconnectSocket } from '@/lib/socket';
import { useAuthUser } from './auth-context';

export const authKeys = {
  me: ['auth', 'me'] as const,
};

export function useMe() {
  return useQuery<AuthUser | null>({
    queryKey: authKeys.me,
    queryFn: async () => {
      try {
        return await authApi.me();
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) return null;
        throw err;
      }
    },
    staleTime: 5 * 60_000,
    retry: false,
  });
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: LoginInput) => authApi.login(input),
    onSuccess: (user) => {
      qc.clear();
      qc.setQueryData(authKeys.me, user);
    },
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => authApi.logout(),
    onSettled: () => {
      disconnectSocket();
      qc.clear();
      qc.setQueryData(authKeys.me, null);
    },
  });
}

/** UI-level permission check; the API remains the authority. */
export function useCan(permission: Permission): boolean {
  const user = useAuthUser();
  return hasPermission(user.role, permission);
}
