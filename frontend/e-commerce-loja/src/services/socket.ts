import { io } from 'socket.io-client';

const isLocal =
  typeof window !== 'undefined' &&
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

const SOCKET_URL = isLocal
  ? 'http://localhost:3333'
  : 'https://ninhoback.tamaralr.com.br';

export const socket = io(SOCKET_URL, {
  transports: ['polling', 'websocket'],
  withCredentials: true,
});