import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';

export const motivoController = {
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