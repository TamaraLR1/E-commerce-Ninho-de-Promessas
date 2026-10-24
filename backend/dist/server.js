"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const express_1 = __importDefault(require("express"));
const http_1 = __importDefault(require("http"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const cors_1 = __importDefault(require("cors"));
const authRoutes_1 = require("./routes/authRoutes");
const adminRoutes_1 = __importDefault(require("./routes/adminRoutes"));
const categoriaRoutes_1 = __importDefault(require("./routes/categoriaRoutes"));
const tamanhoRoutes_1 = __importDefault(require("./routes/tamanhoRoutes"));
const corRoutes_1 = __importDefault(require("./routes/corRoutes"));
const produtoRoutes_1 = require("./routes/produtoRoutes");
const estoqueRoutes_1 = __importDefault(require("./routes/estoqueRoutes"));
const motivoRoutes_1 = __importDefault(require("./routes/motivoRoutes"));
const pagamentoRoutes_1 = require("./routes/pagamentoRoutes");
const pedidoRoutes_1 = require("./routes/pedidoRoutes");
const freteRoutes_1 = require("./routes/freteRoutes");
const carrinhoRoutes_1 = require("./routes/carrinhoRoutes");
const cupomRoutes_1 = require("./routes/cupomRoutes");
const relatorioRoutes_1 = require("./routes/relatorioRoutes");
const path_1 = __importDefault(require("path"));
const socket_1 = require("./socket");
const app = (0, express_1.default)();
const server = http_1.default.createServer(app);
(0, socket_1.initSocket)(server);
const UPLOADS_PATH = path_1.default.join(__dirname, '..', 'uploads');
app.use(express_1.default.json());
app.use(express_1.default.urlencoded({ extended: true }));
app.use((0, cookie_parser_1.default)());
const allowedOrigins = [
    'http://localhost:5173',
    'http://localhost:5174',
    'https://ninho.tamaralr.com.br',
    'https://painelninho.tamaralr.com.br'
];
app.use((0, cors_1.default)({
    origin: allowedOrigins,
    credentials: true
}));
app.use(socket_1.socketMiddleware);
// Garante que o CORS seja aplicado nas imagens estáticas da pasta uploads
app.use('/uploads', (0, cors_1.default)({ origin: allowedOrigins, credentials: true }), express_1.default.static(UPLOADS_PATH));
app.use('/api', authRoutes_1.authRoutes);
app.use('/api', adminRoutes_1.default);
app.use('/api', categoriaRoutes_1.default);
app.use('/api', tamanhoRoutes_1.default);
app.use('/api', corRoutes_1.default);
app.use('/api', produtoRoutes_1.produtoRoutes);
app.use('/api', estoqueRoutes_1.default);
app.use('/api', motivoRoutes_1.default);
app.use('/api', pagamentoRoutes_1.pagamentoRoutes);
app.use('/api', pedidoRoutes_1.pedidoRoutes);
app.use('/api', freteRoutes_1.freteRoutes);
app.use('/api', carrinhoRoutes_1.carrinhoRoutes);
app.use('/api', cupomRoutes_1.cupomRoutes);
app.use('/api', relatorioRoutes_1.relatorioRoutes);
const PORT = Number(process.env.PORT) || 3333;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});
