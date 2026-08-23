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

  async editar(req: Request, res: Response) {
    try {
      const id = String(req.params.id);
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

      // Verifica se o motivo a ser editado existe
      const motivoExistente = await prisma.motivoEstoque.findUnique({
        where: { id } // Altere para Number(id) caso o ID no seu banco seja inteiro/autoincrement
      });

      if (!motivoExistente) {
        return res.status(404).json({ message: 'Motivo de estoque não encontrado.' });
      }

      // Verifica se já existe OUTRO motivo com o mesmo nome que está tentando atualizar
      const nomeDuplicado = await prisma.motivoEstoque.findFirst({
        where: { 
          nome,
          NOT: { id } 
        }
      });

      if (nomeDuplicado) {
        return res.status(400).json({ message: 'Já existe outro motivo cadastrado com esse nome.' });
      }

      // Atualiza o motivo no banco
      const motivoAtualizado = await prisma.motivoEstoque.update({
        where: { id }, // Altere para Number(id) se necessário
        data: {
          nome,
          tipo: tipoUpper,
        },
      });

      return res.status(200).json({
        message: 'Motivo de estoque atualizado com sucesso!',
        motivo: motivoAtualizado,
      });

    } catch (error) {
      console.error('Erro ao atualizar motivo de estoque:', error);
      return res.status(500).json({ message: 'Erro interno ao atualizar motivo.' });
    }
  },
};