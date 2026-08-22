import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';

export const motivoController = {
  async criar(req: Request, res: Response) {
    try {
      const { nome, tipo } = req.body;

      // Validação básica
      if (!nome || !tipo) {
        return res.status(400).json({ message: 'Nome e tipo (ENTRADA ou SAIDA) são obrigatórios.' });
      }

      // Valida se o tipo é válido
      const tipoUpper = tipo.toUpperCase();
      if (tipoUpper !== 'ENTRADA' && tipoUpper !== 'SAIDA') {
        return res.status(400).json({ message: 'O tipo deve ser "ENTRADA" ou "SAIDA".' });
      }

      // Verifica se já existe um motivo com esse nome exato
      const motivoExiste = await prisma.motivoEstoque.findUnique({
        where: { nome }
      });

      if (motivoExiste) {
        return res.status(400).json({ message: 'Já existe um motivo cadastrado com esse nome.' });
      }

      // Cria o novo motivo no banco
      const novoMotivo = await prisma.motivoEstoque.create({
        data: {
          nome,
          tipo: tipoUpper,
        },
      });

      return res.status(201).json({
        message: 'Motivo de estoque cadastrado com sucesso!',
        motivo: novoMotivo,
      });

    } catch (error) {
      console.error('Erro ao cadastrar motivo de estoque:', error);
      return res.status(500).json({ message: 'Erro interno ao cadastrar motivo.' });
    }
  },
  
  async listarMotivos(req: Request, res: Response) {
    try {
      const { tipo } = req.query;
      const whereClause = tipo ? { tipo: String(tipo).toUpperCase() } : {};

      const motivos = await prisma.motivoEstoque.findMany({
        where: whereClause,
        orderBy: { nome: 'asc' },
      });

      return res.json(motivos);
    } catch (error) {
      console.error('Erro ao listar motivos de estoque:', error);
      return res.status(500).json({ error: 'Erro interno ao buscar motivos.' });
    }
  },
};