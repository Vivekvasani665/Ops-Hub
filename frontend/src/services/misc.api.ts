import type { NotificationDto, UserDto } from '@/shared';
import { api } from '@/lib/api';
import type { Envelope } from './types';

export interface OrganizationDetails {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  currency: string;
  createdAt: string;
  stats: { users: number; products: number; orders: number };
}

export interface Health {
  status: string;
  db: string;
}

export const miscApi = {
  async notifications(limit = 10): Promise<NotificationDto[]> {
    const res = await api.get<Envelope<NotificationDto[]>>('/notifications', { params: { limit } });
    return res.data.data;
  },
  async users(): Promise<UserDto[]> {
    const res = await api.get<Envelope<UserDto[]>>('/users');
    return res.data.data;
  },
  async organization(): Promise<OrganizationDetails> {
    const res = await api.get<Envelope<OrganizationDetails>>('/organizations/current');
    return res.data.data;
  },
  async health(): Promise<Health> {
    const res = await api.get<Envelope<Health>>('/health');
    return res.data.data;
  },
};
