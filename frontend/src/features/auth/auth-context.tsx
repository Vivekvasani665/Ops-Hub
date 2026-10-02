import { createContext, useContext, type ReactNode } from 'react';
import type { AuthUser } from '@/shared';

const AuthContext = createContext<AuthUser | null>(null);

export function AuthUserProvider({ user, children }: { user: AuthUser; children: ReactNode }) {
  return <AuthContext.Provider value={user}>{children}</AuthContext.Provider>;
}

/** Only valid inside the protected layout. */
export function useAuthUser(): AuthUser {
  const user = useContext(AuthContext);
  if (!user) throw new Error('useAuthUser must be used inside an authenticated route');
  return user;
}
