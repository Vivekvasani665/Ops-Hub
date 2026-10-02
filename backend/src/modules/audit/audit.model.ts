import { Schema, model, type InferSchemaType } from 'mongoose';
import { AUDIT_ACTIONS, ENTITY_TYPES } from '@shared';

const auditLogSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, required: true },
    actor: { id: Schema.Types.ObjectId, name: String },
    action: { type: String, enum: AUDIT_ACTIONS, required: true },
    entityType: { type: String, enum: ENTITY_TYPES, required: true },
    entityId: { type: Schema.Types.ObjectId, default: null },
    metadata: { type: Schema.Types.Mixed, default: {} },
    ip: String,
    /** set by background jobs so a retried job never writes the same audit entry twice */
    dedupeKey: { type: String },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

// Primary listing (newest first, cursor = createdAt+_id).
auditLogSchema.index({ organizationId: 1, createdAt: -1, _id: -1 });
auditLogSchema.index({ organizationId: 1, action: 1, createdAt: -1 });
auditLogSchema.index({ organizationId: 1, entityType: 1, entityId: 1, createdAt: -1 });
auditLogSchema.index({ organizationId: 1, 'actor.id': 1, createdAt: -1 });
auditLogSchema.index({ dedupeKey: 1 }, { unique: true, partialFilterExpression: { dedupeKey: { $type: 'string' } } });

// Append-only: block every update/delete path at the model layer.
const blocked = function () {
  throw new Error('Audit logs are append-only');
};
for (const op of [
  'updateOne',
  'updateMany',
  'findOneAndUpdate',
  'replaceOne',
  'deleteOne',
  'deleteMany',
  'findOneAndDelete',
] as const) {
  auditLogSchema.pre(op, blocked);
}

export type AuditLogDoc = InferSchemaType<typeof auditLogSchema>;
export const AuditLog = model('AuditLog', auditLogSchema, 'audit_logs');
