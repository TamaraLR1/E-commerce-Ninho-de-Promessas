import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma';

export class AuthController {
  async register(req: Request, res: Response): Promise<Response> {
    const {
      nome,
      sobrenome,
      cpf,
      email,
      telefone,
      senha,
      confirmarSenha,
      dataNascimento,
      sexo,
      receberNovidades
    } = req.body;
   
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
      const userByEmail = await prisma.user.findUnique({ where: { email } });
      if (userByEmail) {
        return res.status(400).json({ error: 'E-mail já cadastrado.' });
      }

      // 2. Verifica se o CPF já existe
      const userByCpf = await prisma.user.findUnique({ where: { cpf } });
      if (userByCpf) {
        return res.status(400).json({ error: 'Este CPF já está cadastrado em nossa base de dados.' });
      }

      const senhaHash = await bcrypt.hash(senha, 8);
      
     const formattedDataNascimento = dataNascimento && dataNascimento.trim() !== '' 
        ? new Date(dataNascimento) 
        : null;

      const userData: any = {
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

      const newUser = await prisma.user.create({
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
    } catch (error: any) {
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

  async login(req: Request, res: Response): Promise<Response> {
    const { email, senha } = req.body;

    if (!email || !senha) {
      return res.status(400).json({ error: 'E-mail e senha são obrigatórios.' });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(401).json({ error: 'E-mail ou senha inválidos.' });
    }

    const passwordMatch = await bcrypt.compare(senha, user.senhaHash);
    if (!passwordMatch) {
      return res.status(401).json({ error: 'E-mail ou senha inválidos.' });
    }

    const secret = process.env.JWT_SECRET || 'seu_segredo_jwt_padrao';
    const token = jwt.sign({ id: user.id }, secret, { expiresIn: '1d' });

    const isProduction = process.env.NODE_ENV === 'production';

    res.cookie('token', token, {
      httpOnly: true,
      secure: isProduction,
      // Só define o domain se estiver em produção; em localhost, deixe o navegador gerenciar sozinho
      ...(isProduction && { domain: '.tamaralr.com.br' }),
      path: '/',
      sameSite: isProduction ? 'strict' : 'lax', // 'lax' para localhost evitar bloqueios de porta cruzada
      maxAge: 24 * 60 * 60 * 1000 // 1 dia em milissegundos
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

  async logout(req: Request, res: Response): Promise<Response> {
    res.clearCookie('token');
    return res.json({ message: 'Logout realizado com sucesso.' });
  }

async getProfile(req: Request, res: Response): Promise<Response> {
    try {
      const userId = (req as any).userId; // Ou req.user dependendo de como seu middleware injeta o id

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, nome: true, email: true }
      });

      if (!user) {
        return res.status(404).json({ error: 'Usuário não encontrado.' });
      }

      return res.json({ user });
    } catch (error) {
      return res.status(500).json({ error: 'Erro interno no servidor.' });
    }
  }
}