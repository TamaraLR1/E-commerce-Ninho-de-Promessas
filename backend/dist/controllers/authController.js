"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthController = void 0;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const prisma_1 = require("../lib/prisma");
class AuthController {
    async register(req, res) {
        const { nome, sobrenome, cpf, email, telefone, senha, confirmarSenha, dataNascimento, sexo, receberNovidades } = req.body;
        if (!senha || senha.length < 8) {
            return res.status(400).json({ error: 'A senha deve ter no mínimo 8 dígitos.' });
        }
        if (senha !== confirmarSenha) {
            return res.status(400).json({ error: 'As senhas não conferem.' });
        }
        if (!nome || !sobrenome || !cpf || !email || !telefone || !senha || !confirmarSenha) {
            return res.status(400).json({ error: 'Preencha todos os campos obrigatórios.' });
        }
        try {
            // 1. Verifica se o e-mail já existe
            const userByEmail = await prisma_1.prisma.user.findUnique({ where: { email } });
            if (userByEmail) {
                return res.status(400).json({ error: 'E-mail já cadastrado.' });
            }
            // 2. Verifica se o CPF já existe
            const userByCpf = await prisma_1.prisma.user.findUnique({ where: { cpf } });
            if (userByCpf) {
                return res.status(400).json({ error: 'Este CPF já está cadastrado em nossa base de dados.' });
            }
            const senhaHash = await bcryptjs_1.default.hash(senha, 8);
            const formattedDataNascimento = dataNascimento && dataNascimento.trim() !== ''
                ? new Date(dataNascimento)
                : null;
            const userData = {
                nome,
                sobrenome,
                cpf,
                email,
                telefone,
                senhaHash,
                sexo: sexo || null,
                receberNovidades: Boolean(receberNovidades)
            };
            if (formattedDataNascimento) {
                userData.dataNascimento = formattedDataNascimento;
            }
            const newUser = await prisma_1.prisma.user.create({
                data: userData
            });
            return res.status(201).json({
                message: 'Usuário cadastrado com sucesso!',
                user: {
                    id: newUser.id,
                    nome: newUser.nome,
                    email: newUser.email
                }
            });
        }
        catch (error) {
            // Tratamento de segurança caso escape alguma restrição única do banco (P2002 do Prisma)
            if (error.code === 'P2002') {
                const campo = error.meta?.target?.[0];
                if (campo === 'cpf') {
                    return res.status(400).json({ error: 'Este CPF já está cadastrado em nossa base de dados.' });
                }
                if (campo === 'email') {
                    return res.status(400).json({ error: 'E-mail já cadastrado.' });
                }
                return res.status(400).json({ error: 'Este registro já existe no sistema.' });
            }
            return res.status(500).json({ error: 'Erro interno ao cadastrar usuário.' });
        }
    }
    async login(req, res) {
        const { email, senha } = req.body;
        if (!email || !senha) {
            return res.status(400).json({ error: 'E-mail e senha são obrigatórios.' });
        }
        const user = await prisma_1.prisma.user.findUnique({ where: { email } });
        if (!user) {
            return res.status(401).json({ error: 'E-mail ou senha inválidos.' });
        }
        const passwordMatch = await bcryptjs_1.default.compare(senha, user.senhaHash);
        if (!passwordMatch) {
            return res.status(401).json({ error: 'E-mail ou senha inválidos.' });
        }
        const secret = process.env.JWT_SECRET || 'seu_segredo_jwt_padrao';
        const token = jsonwebtoken_1.default.sign({ id: user.id }, secret, { expiresIn: '1d' });
        const isProduction = process.env.NODE_ENV === 'production';
        const oneDayInMs = 24 * 60 * 60 * 1000;
        res.cookie('token', token, {
            httpOnly: true,
            secure: isProduction, // true em produção (HTTPS)
            sameSite: 'lax', // 'lax' é essencial para permitir o envio do cookie entre subdomínios
            maxAge: oneDayInMs,
        });
        // Retorna apenas os dados do usuário de forma silenciosa (sem expor o token no JSON)
        return res.json({
            user: {
                id: user.id,
                nome: user.nome,
                email: user.email
            }
        });
    }
    async logout(req, res) {
        res.clearCookie('token');
        return res.json({ message: 'Logout realizado com sucesso.' });
    }
    async getProfile(req, res) {
        try {
            const userId = req.userId; // Conforme o seu middleware de autenticação
            const user = await prisma_1.prisma.user.findUnique({
                where: { id: userId },
                select: {
                    id: true,
                    nome: true,
                    sobrenome: true,
                    cpf: true,
                    email: true,
                    telefone: true,
                    dataNascimento: true,
                    sexo: true,
                    receberNovidades: true,
                    enderecos: {
                        orderBy: { createdAt: 'desc' },
                        take: 1 // Traz o endereço mais recente do usuário
                    }
                }
            });
            if (!user) {
                return res.status(404).json({ error: 'Usuário não encontrado.' });
            }
            return res.json({ user });
        }
        catch (error) {
            console.error('Erro ao buscar perfil:', error);
            return res.status(500).json({ error: 'Erro interno no servidor.' });
        }
    }
    async updateProfile(req, res) {
        try {
            const userId = req.userId; // ID do utilizador logado extraído pelo middleware
            const { nome, sobrenome, telefone, dataNascimento, sexo, receberNovidades } = req.body;
            const updatedUser = await prisma_1.prisma.user.update({
                where: { id: userId },
                data: {
                    nome,
                    sobrenome,
                    telefone,
                    dataNascimento: dataNascimento ? new Date(dataNascimento) : null,
                    sexo,
                    receberNovidades: Boolean(receberNovidades),
                }
            });
            return res.json({ message: 'Perfil atualizado com sucesso!', user: updatedUser });
        }
        catch (error) {
            console.error('Erro ao atualizar perfil:', error);
            return res.status(500).json({ error: 'Erro ao atualizar o perfil.' });
        }
    }
}
exports.AuthController = AuthController;
