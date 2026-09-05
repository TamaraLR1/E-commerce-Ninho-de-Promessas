import { Server } from 'socket.io';
import http from 'http';

let io: Server;

export function initSocket(server: http.Server) {
  io = new Server(server, {
    cors: {
      origin: ['http://localhost:5173', 'http://localhost:5174'],
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
      credentials: true
    },
    transports: ['websocket', 'polling']
  });

  io.on('connection', (socket) => {
    console.log('Novo cliente conectado ao WebSocket:', socket.id);
  });

  return io;
}

export function socketMiddleware(req: any, res: any, next: any) {
  req.io = io;
  next();
}

export function getIO() {
  if (!io) {
    throw new Error('Socket.io não foi inicializado!');
  }
  return io;
}