import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

const JWT_ADMIN_SECRET = process.env.JWT_SECRET_ADMIN as string;

export class AdminAuthController {
  async login(req: Request, res: Response) {
    const { email, senha } = req.body;

    try {
      const admin = await prisma.admin.findUnique({
        where: { email },
      });

      if (!admin) {
        return res.status(401).json({ message: 'E-mail ou senha inválidos.' });
      }

      const senhaValida = await bcrypt.compare(senha, admin.senha);

      if (!senhaValida) {
        return res.status(401).json({ message: 'E-mail ou senha inválidos.' });
      }

      // Gera o token JWT com validade de 1 dia
      const token = jwt.sign(
        { adminId: admin.id, email: admin.email },
        JWT_ADMIN_SECRET,
        { expiresIn: '1d' }
      );

      // Define o cookie com validade de 1 dia (24 * 60 * 60 * 1000 ms)
      const oneDayInMs = 24 * 60 * 60 * 1000;

      res.cookie('admin_token', token, {
        httpOnly: true, // Impede acesso via JS no browser (mais seguro)
        secure: process.env.NODE_ENV === 'production', // true em produção (HTTPS)
        sameSite: 'strict',
        maxAge: oneDayInMs,
      });

      return res.json({
        message: 'Login realizado com sucesso',
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: 'Erro interno no servidor.' });
    }
  }

  async logout(req: Request, res: Response) {
    try {
      // Limpa o cookie de autenticação definindo opções idênticas às usadas na criação (exceto o valor)
      res.clearCookie('admin_token', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
      });

      return res.status(200).json({ message: 'Logout realizado com sucesso.' });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: 'Erro interno ao realizar logout.' });
    }
  }

  async obterPerfil(req: Request, res: Response) {
    try {
      // Captura o ID do admin que foi injetado pelo middleware de autenticação
      const rawAdminId = (req as any).admin?.id || (req as any).admin?.adminId || (req as any).user?.id || (req as any).user?.adminId;
      const adminId = rawAdminId ? Number(rawAdminId) : null;

      if (!adminId) {
        return res.status(401).json({ message: 'Administrador não autenticado.' });
      }

      const admin = await prisma.admin.findUnique({
        where: { id: adminId },
        select: { id: true, nome: true, email: true } // Traz apenas os dados seguros necessários
      });

      if (!admin) {
        return res.status(404).json({ message: 'Administrador não encontrado.' });
      }

      return res.status(200).json(admin);
    } catch (error) {
      console.error('Erro ao buscar perfil do admin:', error);
      return res.status(500).json({ message: 'Erro interno ao buscar dados do usuário.' });
    }
  }
}