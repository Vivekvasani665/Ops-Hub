import { useEffect, useState } from 'react';
import { getSocket } from '@/lib/socket';

/** Observes the shared socket (connected by AppLayout) without owning its lifecycle. */
export function useSocketStatus(): boolean {
  const [connected, setConnected] = useState(() => getSocket().connected);
  useEffect(() => {
    const socket = getSocket();
    const on = () => setConnected(true);
    const off = () => setConnected(false);
    socket.on('connect', on);
    socket.on('disconnect', off);
    setConnected(socket.connected);
    return () => {
      socket.off('connect', on);
      socket.off('disconnect', off);
    };
  }, []);
  return connected;
}
