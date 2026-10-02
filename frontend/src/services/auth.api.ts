import type { AuthUser, LoginInput } from '@/shared';
import { api } from '@/lib/api';
import type { Envelope } from './types';

export const authApi = {
  async me(): Promise<AuthUser> {
    const res = await api.get<Envelope<{ user: AuthUser }>>('/auth/me');
    return res.data.data.user;
  },
  async login(input: LoginInput): Promise<AuthUser> {
    const res = await api.post<Envelope<{ user: AuthUser }>>('/auth/login', input);
    return res.data.data.user;
  },
  async logout(): Promise<void> {
    await api.post('/auth/logout');
  },
};
