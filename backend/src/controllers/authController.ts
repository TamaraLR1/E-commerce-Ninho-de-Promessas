import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma';
import { limparDocumento, validarCnpjAlfanumerico } from '../utils/documento';

const UFS_VALIDAS = new Set([
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO',
  'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI',
  'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
]);

const onlyDigits = (value?: string | null) => (value ? value.replace(/\D/g, '') : '');
const cleanText = (value?: string | null) => (typeof value === 'string' ? value.trim() : '');

function validarCpf(cpfRaw?: string | null): boolean {
  const cpf = onlyDigits(cpfRaw);
  if (cpf.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cpf)) return false;

  let soma = 0;
  for (let i = 0; i < 9; i++) {
    soma += Number(cpf[i]) * (10 - i);
  }
  let resto = (soma * 10) % 11;
  if (resto === 10) resto = 0;
  if (resto !== Number(cpf[9])) return false;

  soma = 0;
  for (let i = 0; i < 10; i++) {
    soma += Number(cpf[i]) * (11 - i);
  }
  resto = (soma * 10) % 11;
  if (resto === 10) resto = 0;
  return resto === Number(cpf[10]);
}

function validarTelefone(telRaw?: string | null): boolean {
  const digits = onlyDigits(telRaw);
  return digits.length === 10 || digits.length === 11;
}

export class AuthController {
  async register(req: Request, res: Response): Promise<Response> {
    const {
      tipoPessoa = 'PF',
      nome,
      sobrenome,
      cpf,
      email,
      telefone,
      senha,
      confirmarSenha,
      dataNascimento,
      sexo,
      receberNovidades,
      // Campos PJ
      cnpj,
      razaoSocial,
      nomeFantasia,
      indicadorIE,
      inscricaoEstadual,
      // Endereço Fiscal (obrigatório quando PJ)
      cep,
      rua,
      numero,
      complemento,
      bairro,
      cidade,
      estado,
    } = req.body;

    const nomeLimpo = cleanText(nome);
    const sobrenomeLimpo = cleanText(sobrenome);
    const emailLimpo = cleanText(email).toLowerCase();
    const cleanCpf = onlyDigits(cpf);
    const cleanTelefone = onlyDigits(telefone);
    const cleanCnpj = limparDocumento(cnpj);
    const cleanCep = onlyDigits(cep);
    const ufLimpa = cleanText(estado).toUpperCase();
    const razaoSocialLimpa = cleanText(razaoSocial);
    const nomeFantasiaLimpo = cleanText(nomeFantasia);
    const ruaLimpa = cleanText(rua);
    const numeroLimpo = cleanText(numero);
    const complementoLimpo = cleanText(complemento);
    const bairroLimpo = cleanText(bairro);
    const cidadeLimpa = cleanText(cidade);
    const ieLimpa = cleanText(inscricaoEstadual);

    if (!senha || senha.length < 8) {
      return res.status(400).json({ error: 'A senha deve ter no mínimo 8 dígitos.' });
    }

    if (senha !== confirmarSenha) {
      return res.status(400).json({ error: 'As senhas não conferem.' });
    }

    if (!nomeLimpo || !sobrenomeLimpo || !cleanCpf || !emailLimpo || !cleanTelefone) {
      return res.status(400).json({ error: 'Preencha todos os campos obrigatórios.' });
    }

    if (!validarCpf(cleanCpf)) {
      return res.status(400).json({ error: 'Informe um CPF válido.' });
    }

    if (!validarTelefone(cleanTelefone)) {
      return res.status(400).json({ error: 'Informe um telefone válido com DDD (10 ou 11 dígitos).' });
    }

    if (tipoPessoa === 'PJ') {
      if (
        !cleanCnpj ||
        !razaoSocialLimpa ||
        cleanCep.length !== 8 ||
        !ruaLimpa ||
        !numeroLimpo ||
        !bairroLimpo ||
        !cidadeLimpa ||
        !UFS_VALIDAS.has(ufLimpa)
      ) {
        return res.status(400).json({
          error: 'Para Pessoa Jurídica, preencha CNPJ, Razão Social e o endereço fiscal completo com CEP (8 dígitos) e UF válidos.',
        });
      }

      if (!validarCnpjAlfanumerico(cleanCnpj)) {
        return res.status(400).json({
          error: 'Informe um CNPJ válido com 14 caracteres (números ou letras/números).',
        });
      }

      if (indicadorIE === 'CONTRIBUINTE' && ieLimpa.length < 2) {
        return res.status(400).json({
          error: 'Informe uma Inscrição Estadual válida para contribuintes do ICMS.',
        });
      }
    }

    try {
      const userByEmail = await prisma.user.findUnique({ where: { email: emailLimpo } });
      if (userByEmail) {
        return res.status(400).json({ error: 'E-mail já cadastrado.' });
      }

      const userByCpf = await prisma.user.findUnique({ where: { cpf: cleanCpf } });
      if (userByCpf) {
        return res.status(400).json({ error: 'Este CPF já está cadastrado em nossa base de dados.' });
      }

      if (tipoPessoa === 'PJ') {
        const empresaByCnpj = await prisma.empresa.findUnique({ where: { cnpj: cleanCnpj } });
        if (empresaByCnpj) {
          return res.status(400).json({ error: 'Este CNPJ já está cadastrado em nossa base de dados.' });
        }
      }

      const senhaHash = await bcrypt.hash(senha, 8);

      const formattedDataNascimento =
        dataNascimento && String(dataNascimento).trim() !== ''
          ? new Date(dataNascimento)
          : null;

      const createdUser = await prisma.$transaction(async (tx) => {
        const newUser = await tx.user.create({
          data: {
            nome: nomeLimpo,
            sobrenome: sobrenomeLimpo,
            cpf: cleanCpf,
            email: emailLimpo,
            telefone: cleanTelefone,
            senhaHash,
            dataNascimento: formattedDataNascimento,
            sexo: cleanText(sexo) || null,
            receberNovidades: Boolean(receberNovidades),
          },
        });

        if (tipoPessoa === 'PJ') {
          const enderecoFiscal = await tx.endereco.create({
            data: {
              tipo: 'FISCAL',
              principal: true,
              destinatario: razaoSocialLimpa,
              cep: cleanCep,
              rua: ruaLimpa,
              numero: numeroLimpo,
              complemento: complementoLimpo || null,
              bairro: bairroLimpo,
              cidade: cidadeLimpa,
              estado: ufLimpa,
              userId: newUser.id,
            },
          });

          await tx.empresa.create({
            data: {
              userId: newUser.id,
              cnpj: cleanCnpj,
              razaoSocial: razaoSocialLimpa,
              nomeFantasia: nomeFantasiaLimpo || null,
              indicadorIE: indicadorIE || 'NAO_CONTRIBUINTE',
              inscricaoEstadual:
                indicadorIE === 'CONTRIBUINTE' ? ieLimpa : null,
              enderecoFiscalId: enderecoFiscal.id,
            },
          });
        }

        return newUser;
      });

      return res.status(201).json({
        message: 'Usuário cadastrado com sucesso!',
        user: {
          id: createdUser.id,
          nome: createdUser.nome,
          email: createdUser.email,
        },
      });
    } catch (error: any) {
      if (error.code === 'P2002') {
        const campo = error.meta?.target?.[0];
        if (campo === 'cpf') {
          return res.status(400).json({ error: 'Este CPF já está cadastrado em nossa base de dados.' });
        }
        if (campo === 'cnpj') {
          return res.status(400).json({ error: 'Este CNPJ já está cadastrado em nossa base de dados.' });
        }
        if (campo === 'email') {
          return res.status(400).json({ error: 'E-mail já cadastrado.' });
        }
        return res.status(400).json({ error: 'Este registro já existe no sistema.' });
      }

      console.error('Erro ao cadastrar usuário:', error);
      return res.status(500).json({ error: 'Erro interno ao cadastrar usuário.' });
    }
  }

  async login(req: Request, res: Response): Promise<Response> {
    const { email, senha } = req.body;
    const emailLimpo = cleanText(email).toLowerCase();

    if (!emailLimpo || !senha) {
      return res.status(400).json({ error: 'E-mail e senha são obrigatórios.' });
    }

    const user = await prisma.user.findUnique({ where: { email: emailLimpo } });
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
    const oneDayInMs = 24 * 60 * 60 * 1000;

    res.cookie('token', token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      maxAge: oneDayInMs,
    });

    return res.json({
      user: {
        id: user.id,
        nome: user.nome,
        email: user.email,
      },
    });
  }

  async logout(req: Request, res: Response): Promise<Response> {
    res.clearCookie('token');
    return res.json({ message: 'Logout realizado com sucesso.' });
  }

  async getProfile(req: Request, res: Response): Promise<Response> {
    try {
      const userId = (req as any).userId;

      const user = await prisma.user.findUnique({
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
          empresa: {
            include: {
              enderecoFiscal: true,
            },
          },
          enderecos: {
            orderBy: { createdAt: 'desc' },
          },
        },
      });

      if (!user) {
        return res.status(404).json({ error: 'Usuário não encontrado.' });
      }

      return res.json({ user });
    } catch (error) {
      console.error('Erro ao buscar perfil:', error);
      return res.status(500).json({ error: 'Erro interno no servidor.' });
    }
  }

  async updateProfile(req: Request, res: Response): Promise<Response> {
    try {
      const userId = (req as any).userId;
      const { nome, sobrenome, telefone, dataNascimento, sexo, receberNovidades } = req.body;

      const nomeLimpo = cleanText(nome);
      const sobrenomeLimpo = cleanText(sobrenome);
      const cleanTelefone = onlyDigits(telefone);

      if (!nomeLimpo || !sobrenomeLimpo) {
        return res.status(400).json({ error: 'Nome e sobrenome são obrigatórios.' });
      }

      if (cleanTelefone && !validarTelefone(cleanTelefone)) {
        return res.status(400).json({ error: 'Informe um telefone válido com DDD (10 ou 11 dígitos).' });
      }

      const updatedUser = await prisma.user.update({
        where: { id: userId },
        data: {
          nome: nomeLimpo,
          sobrenome: sobrenomeLimpo,
          telefone: cleanTelefone || undefined,
          dataNascimento: dataNascimento ? new Date(dataNascimento) : null,
          sexo: cleanText(sexo) || null,
          receberNovidades: Boolean(receberNovidades),
        },
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
        },
      });

      return res.json({ message: 'Perfil atualizado com sucesso!', user: updatedUser });
    } catch (error) {
      console.error('Erro ao atualizar perfil:', error);
      return res.status(500).json({ error: 'Erro ao atualizar o perfil.' });
    }
  }
}