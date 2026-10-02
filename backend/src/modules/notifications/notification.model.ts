import { Schema, model } from 'mongoose';
import { ENTITY_TYPES, NOTIFICATION_TYPES } from '@shared';

const notificationSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, required: true },
    type: { type: String, enum: NOTIFICATION_TYPES, required: true },
    severity: { type: String, enum: ['info', 'success', 'warning', 'error'], default: 'info' },
    title: { type: String, required: true },
    message: { type: String, default: '' },
    entityType: { type: String, enum: [...ENTITY_TYPES, null], default: null },
    entityId: { type: Schema.Types.ObjectId, default: null },
    dedupeKey: { type: String },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

notificationSchema.index({ organizationId: 1, createdAt: -1 });
notificationSchema.index({ dedupeKey: 1 }, { unique: true, partialFilterExpression: { dedupeKey: { $type: 'string' } } });
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 30 });

export const Notification = model('Notification', notificationSchema, 'notifications');
