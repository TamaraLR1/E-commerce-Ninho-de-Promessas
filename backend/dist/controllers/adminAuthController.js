"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdminAuthController = void 0;
const prisma_1 = require("../lib/prisma");
const bcrypt_1 = __importDefault(require("bcrypt"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const JWT_ADMIN_SECRET = process.env.JWT_SECRET_ADMIN;
class AdminAuthController {
    async login(req, res) {
        const { email, senha } = req.body;
        try {
            const admin = await prisma_1.prisma.admin.findUnique({
                where: { email },
            });
            if (!admin) {
                return res.status(401).json({ message: 'E-mail ou senha inválidos.' });
            }
            const senhaValida = await bcrypt_1.default.compare(senha, admin.senha);
            if (!senhaValida) {
                return res.status(401).json({ message: 'E-mail ou senha inválidos.' });
            }
            // Gera o token JWT com validade de 1 dia
            const token = jsonwebtoken_1.default.sign({ adminId: admin.id, email: admin.email }, JWT_ADMIN_SECRET, { expiresIn: '1d' });
            const isProduction = process.env.NODE_ENV === 'production';
            const oneDayInMs = 24 * 60 * 60 * 1000;
            res.cookie('admin_token', token, {
                httpOnly: true,
                secure: isProduction, // true em produção (HTTPS)
                sameSite: 'lax', // 'lax' é essencial para permitir o envio do cookie entre subdomínios
                maxAge: oneDayInMs,
            });
            return res.json({
                message: 'Login realizado com sucesso',
            });
        }
        catch (error) {
            console.error(error);
            return res.status(500).json({ message: 'Erro interno no servidor.' });
        }
    }
    async logout(req, res) {
        try {
            // Limpa o cookie de autenticação definindo opções idênticas às usadas na criação (exceto o valor)
            res.clearCookie('admin_token', {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'strict',
            });
            return res.status(200).json({ message: 'Logout realizado com sucesso.' });
        }
        catch (error) {
            console.error(error);
            return res.status(500).json({ message: 'Erro interno ao realizar logout.' });
        }
    }
    async obterPerfil(req, res) {
        try {
            // Captura o ID do admin que foi injetado pelo middleware de autenticação
            const rawAdminId = req.admin?.id || req.admin?.adminId || req.user?.id || req.user?.adminId;
            const adminId = rawAdminId ? Number(rawAdminId) : null;
            if (!adminId) {
                return res.status(401).json({ message: 'Administrador não autenticado.' });
            }
            const admin = await prisma_1.prisma.admin.findUnique({
                where: { id: adminId },
                select: { id: true, nome: true, email: true } // Traz apenas os dados seguros necessários
            });
            if (!admin) {
                return res.status(404).json({ message: 'Administrador não encontrado.' });
            }
            return res.status(200).json(admin);
        }
        catch (error) {
            console.error('Erro ao buscar perfil do admin:', error);
            return res.status(500).json({ message: 'Erro interno ao buscar dados do usuário.' });
        }
    }
    async listarLogs(req, res) {
        try {
            const logs = await prisma_1.prisma.logAtividade.findMany({
                orderBy: { data: 'desc' },
                take: 50,
                include: { admin: { select: { nome: true } } }
            });
            return res.status(200).json(logs);
        }
        catch (error) {
            console.error('Erro ao listar logs:', error);
            return res.status(500).json({ message: 'Erro interno ao buscar logs.' });
        }
    }
}
exports.AdminAuthController = AdminAuthController;
