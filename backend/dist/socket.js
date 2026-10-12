"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.initSocket = initSocket;
exports.socketMiddleware = socketMiddleware;
exports.getIO = getIO;
const socket_io_1 = require("socket.io");
let io;
function initSocket(server) {
    io = new socket_io_1.Server(server, {
        cors: {
            origin: [
                'http://localhost:5173',
                'http://localhost:5174',
                'https://ninho.tamaralr.com.br',
                'https://painelninho.tamaralr.com.br'
            ],
            methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
            credentials: true
        },
        transports: ['polling', 'websocket'] // O polling deve vir primeiro para o Cloudflare Tunnel fazer o upgrade seguro
    });
    io.on('connection', (socket) => {
        console.log('Novo cliente conectado ao WebSocket:', socket.id);
        // Evento para o cliente (ou admin) entrar em uma sala individual de usuário
        socket.on('joinUserRoom', (userId) => {
            if (userId) {
                const room = `usuario_${userId}`;
                socket.join(room);
                console.log(`Socket ${socket.id} entrou na sala: ${room}`);
            }
        });
        // Evento para o cliente sair da sala ao desconectar/deslogar (opcional)
        socket.on('leaveUserRoom', (userId) => {
            if (userId) {
                const room = `usuario_${userId}`;
                socket.leave(room);
                console.log(`Socket ${socket.id} saiu da sala: ${room}`);
            }
        });
        socket.on('disconnect', () => {
            console.log('Cliente desconectado do WebSocket:', socket.id);
        });
    });
    return io;
}
function socketMiddleware(req, res, next) {
    req.io = io;
    next();
}
function getIO() {
    if (!io) {
        throw new Error('Socket.io não foi inicializado!');
    }
    return io;
}
