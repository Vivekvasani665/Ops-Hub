import type { Types } from 'mongoose';
import type { EntityType, NotificationDto, NotificationType } from '@shared';
import { Notification } from './notification.model';

export interface NotificationInput {
  organizationId: Types.ObjectId;
  type: NotificationType;
  severity: NotificationDto['severity'];
  title: string;
  message?: string;
  entityType?: EntityType | null;
  entityId?: Types.ObjectId | string | null;
  /** makes the write idempotent: a retried job never creates the same notification twice */
  dedupeKey: string;
}

export async function createNotification(input: NotificationInput) {
  try {
    const [doc] = await Notification.create([input]);
    return doc;
  } catch (err) {
    if ((err as { code?: number }).code === 11000) return null;
    throw err;
  }
}
