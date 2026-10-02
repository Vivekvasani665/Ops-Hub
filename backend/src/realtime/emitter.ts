import type { Server } from 'socket.io';
import type { Types } from 'mongoose';
import type { ServerToClientEvents } from '@shared';

let io: Server<Record<string, never>, ServerToClientEvents> | null = null;

export function attachIo(server: typeof io) {
  io = server;
}

export const orgRoom = (orgId: string | Types.ObjectId) => `org:${String(orgId)}`;

/** Emits only to sockets of one organization; no-op when realtime is not attached (worker, tests). */
export function emitToOrg<E extends keyof ServerToClientEvents>(
  orgId: string | Types.ObjectId,
  event: E,
  ...args: Parameters<ServerToClientEvents[E]>
) {
  if (!io) return;
  io.to(orgRoom(orgId)).emit(event, ...args);
}
