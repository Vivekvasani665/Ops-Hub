import type { ClientSession, Types } from 'mongoose';
import type { AuditAction, AuditLogDto, EntityType } from '@shared';
import { AuditLog } from './audit.model';
import { emitToOrg } from '../../realtime/emitter';

export interface AuditInput {
  organizationId: Types.ObjectId;
  actor: { id: Types.ObjectId; name: string } | null;
  action: AuditAction;
  entityType: EntityType;
  entityId?: Types.ObjectId | null;
  metadata?: Record<string, unknown>;
  ip?: string;
  dedupeKey?: string;
}

export function toAuditDto(doc: {
  _id: unknown;
  actor?: { id?: unknown; name?: string | null } | null;
  action: string;
  entityType: string;
  entityId?: unknown;
  metadata?: unknown;
  createdAt: Date;
}): AuditLogDto {
  return {
    id: String(doc._id),
    actor: doc.actor?.id ? { id: String(doc.actor.id), name: doc.actor.name ?? 'Unknown' } : null,
    action: doc.action as AuditLogDto['action'],
    entityType: doc.entityType as AuditLogDto['entityType'],
    entityId: doc.entityId ? String(doc.entityId) : null,
    metadata: (doc.metadata as Record<string, unknown>) ?? {},
    createdAt: doc.createdAt.toISOString(),
  };
}

/**
 * Appends an audit entry. Pass a session to make the entry part of the business transaction
 * (it then commits or rolls back together with the change it describes).
 * With a dedupeKey, a repeated write (e.g. retried job) is silently ignored.
 */
export async function recordAudit(input: AuditInput, session?: ClientSession) {
  try {
    const [doc] = await AuditLog.create(
      [
        {
          organizationId: input.organizationId,
          actor: input.actor,
          action: input.action,
          entityType: input.entityType,
          entityId: input.entityId ?? null,
          metadata: input.metadata ?? {},
          ip: input.ip,
          dedupeKey: input.dedupeKey,
        },
      ],
      { session },
    );
    if (!session) emitToOrg(input.organizationId, 'audit:created', { log: toAuditDto(doc) });
    return doc;
  } catch (err) {
    if (input.dedupeKey && (err as { code?: number }).code === 11000) return null;
    throw err;
  }
}
