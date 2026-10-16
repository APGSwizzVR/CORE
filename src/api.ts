import { io, Socket } from 'socket.io-client';

const configuredBase = (import.meta.env.VITE_CORE_SERVER_URL as string | undefined)?.replace(/\/$/, '') || '';
export const apiBase = configuredBase;
const getBase = () => ((localStorage.getItem('CORE_SERVER_URL') ?? configuredBase).trim()).replace(/\/$/, '');
export const assetUrl = (value: string | null | undefined) => !value ? '' : value.startsWith('http') ? value : `${getBase()}${value}`;

export async function api<T = any>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${getBase()}${path}`, {
    ...options,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  const value = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(value.error || `CORE couldn’t complete that request (${response.status}).`);
  return value as T;
}

export function createSocket(): Socket {
  return io(getBase() || undefined, { withCredentials: true, transports: ['websocket', 'polling'], reconnection: true, reconnectionDelayMax: 4000 });
}
