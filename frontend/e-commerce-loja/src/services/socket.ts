import { io } from 'socket.io-client';

export const socket = io('http://localhost:3333', {
  transports: ['polling', 'websocket'],
  withCredentials: true,
});