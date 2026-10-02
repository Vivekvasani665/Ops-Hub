import type { NotificationDto } from '@shared';

export function toNotificationDto(doc: {
  _id: unknown;
  type: string;
  severity?: string;
  title: string;
  message?: string;
  entityType?: string | null;
  entityId?: unknown;
  createdAt: Date;
}): NotificationDto {
  return {
    id: String(doc._id),
    type: doc.type as NotificationDto['type'],
    severity: (doc.severity ?? 'info') as NotificationDto['severity'],
    title: doc.title,
    message: doc.message ?? '',
    entityType: (doc.entityType ?? null) as NotificationDto['entityType'],
    entityId: doc.entityId ? String(doc.entityId) : null,
    createdAt: new Date(doc.createdAt).toISOString(),
  };
}
