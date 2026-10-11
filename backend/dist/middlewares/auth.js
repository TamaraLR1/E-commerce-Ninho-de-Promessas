"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authMiddleware = authMiddleware;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
function authMiddleware(req, res, next) {
    // Lê o token diretamente do cookie HTTP-only enviado pelo navegador
    const token = req.cookies?.token;
    if (!token) {
        return res.status(401).json({ error: 'Token não fornecido.' });
    }
    try {
        const secret = process.env.JWT_SECRET || 'seu_segredo_jwt_padrao';
        const decoded = jsonwebtoken_1.default.verify(token, secret);
        req.userId = Number(decoded.id);
        return next();
    }
    catch (err) {
        return res.status(401).json({ error: 'Token inválido.' });
    }
}
