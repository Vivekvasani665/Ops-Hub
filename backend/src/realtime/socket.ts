import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import { parse as parseCookie } from 'cookie';
import mongoose from 'mongoose';
import type { ServerToClientEvents } from '@shared';
import { env } from '../config/env';
import { ACCESS_COOKIE, verifyAccessToken } from '../modules/auth/token.service';
import { attachIo, emitToOrg, orgRoom } from './emitter';
import { toNotificationDto } from '../modules/notifications/notification.mapper';
import { toAuditDto } from '../modules/audit/audit.service';
import { logger } from '../utils/logger';

export function createSocketServer(httpServer: HttpServer) {
  const io = new Server<Record<string, never>, ServerToClientEvents>(httpServer, {
    cors: { origin: env.WEB_ORIGIN, credentials: true },
    path: '/socket.io',
  });

  // Same cookie-based auth as the REST API; the room is derived from the verified token only.
  io.use((socket, next) => {
    try {
      const cookies = parseCookie(socket.handshake.headers.cookie ?? '');
      const payload = verifyAccessToken(cookies[ACCESS_COOKIE] ?? '');
      socket.data.orgId = payload.org;
      socket.data.userId = payload.sub;
      next();
    } catch {
      next(new Error('UNAUTHENTICATED'));
    }
  });

  io.on('connection', (socket) => {
    void socket.join(orgRoom(socket.data.orgId));
  });

  attachIo(io);
  watchWorkerEvents();
  return io;
}

/**
 * The worker runs in a separate process, so it cannot emit on this Socket.IO server.
 * Instead we tail MongoDB change streams (requires a replica set) and fan out to the org room.
 */
function watchWorkerEvents() {
  const db = mongoose.connection;
  try {
    db.collection('notifications')
      .watch([{ $match: { operationType: 'insert' } }])
      .on('change', (change) => {
        if (change.operationType !== 'insert') return;
        const doc = change.fullDocument;
        emitToOrg(doc.organizationId, 'notification:created', { notification: toNotificationDto(doc as never) });
      })
      .on('error', (err) => logger.warn('notifications change stream error', err));

    db.collection('jobs')
      .watch([{ $match: { operationType: { $in: ['insert', 'update'] } } }], { fullDocument: 'updateLookup' })
      .on('change', (change) => {
        if (change.operationType !== 'insert' && change.operationType !== 'update') return;
        const doc = change.fullDocument;
        if (!doc?.organizationId) return;
        emitToOrg(doc.organizationId, 'job:updated', { id: String(doc._id), type: doc.type, status: doc.status });
      })
      .on('error', (err) => logger.warn('jobs change stream error', err));

    // Audit entries written by the worker always carry a dedupeKey; API-written ones are emitted directly.
    db.collection('audit_logs')
      .watch([{ $match: { operationType: 'insert', 'fullDocument.dedupeKey': { $exists: true } } }])
      .on('change', (change) => {
        if (change.operationType !== 'insert') return;
        const doc = change.fullDocument;
        emitToOrg(doc.organizationId, 'audit:created', { log: toAuditDto(doc as never) });
      })
      .on('error', (err) => logger.warn('audit change stream error', err));
  } catch (err) {
    logger.warn('Change streams unavailable; worker events will not be pushed in realtime', err);
  }
}
