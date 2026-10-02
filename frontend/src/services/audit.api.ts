import type { AuditAction, AuditLogDto, EntityType } from '@/shared';
import { api } from '@/lib/api';
import { cleanParams, type CursorPaged } from './types';

export interface AuditListParams {
  limit?: number;
  cursor?: string;
  action?: AuditAction | '';
  entityType?: EntityType | '';
  entityId?: string;
  actorId?: string;
  from?: string;
  to?: string;
}

export const auditApi = {
  async list(params: AuditListParams): Promise<CursorPaged<AuditLogDto>> {
    const res = await api.get<CursorPaged<AuditLogDto>>('/audit-logs', { params: cleanParams(params) });
    return res.data;
  },
};
