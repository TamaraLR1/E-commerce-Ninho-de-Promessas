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
