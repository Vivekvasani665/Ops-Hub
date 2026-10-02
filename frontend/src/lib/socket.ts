import { io, type Socket } from 'socket.io-client';
import type { ServerToClientEvents } from '@/shared';

export type OpsSocket = Socket<ServerToClientEvents>;

let socket: OpsSocket | null = null;

/** Cookie-authenticated socket; same origin so the httpOnly access cookie is sent on handshake. */
export function getSocket(): OpsSocket {
  socket ??= io({
    path: '/socket.io',
    withCredentials: true,
    autoConnect: false,
    transports: ['websocket', 'polling'],
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10_000,
  });
  return socket;
}

export function disconnectSocket() {
  socket?.disconnect();
}
