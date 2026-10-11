"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureAdminAuthenticated = ensureAdminAuthenticated;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const JWT_ADMIN_SECRET = process.env.JWT_SECRET_ADMIN;
function ensureAdminAuthenticated(req, res, next) {
    // Pega o token diretamente dos cookies da requisição
    const token = req.cookies?.admin_token;
    if (!token) {
        return res.status(401).json({ message: 'Não autorizado. Token ausente.' });
    }
    try {
        const decoded = jsonwebtoken_1.default.verify(token, JWT_ADMIN_SECRET);
        req.admin = decoded;
        return next();
    }
    catch (err) {
        return res.status(401).json({ message: 'Sessão expirada ou inválida.' });
    }
}
