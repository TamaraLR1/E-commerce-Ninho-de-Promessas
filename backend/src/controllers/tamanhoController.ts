import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';

export const tamanhoController = {
  async listar(req: Request, res: Response) {
    try {
      const tamanhos = await prisma.tamanho.findMany({
        orderBy: { nome: 'asc' },
      });
      return res.status(200).json(tamanhos);
    } catch (error) {
      console.error('Erro ao listar tamanhos:', error);
      return res.status(500).json({ message: 'Erro interno ao buscar tamanhos.' });
    }
  },

  async criar(req: Request, res: Response) {
    try {
      const { nome, slug } = req.body;

      if (!nome || !slug) {
        return res.status(400).json({ message: 'Nome e slug são obrigatórios.' });
      }

      const tamanhoExiste = await prisma.tamanho.findFirst({
        where: { OR: [{ nome }, { slug }] },
      });

      if (tamanhoExiste) {
        return res.status(400).json({ message: 'Já existe um tamanho cadastrado com este nome ou slug.' });
      }

      const novoTamanho = await prisma.tamanho.create({
        data: { nome, slug },
      });

      return res.status(201).json(novoTamanho);
    } catch (error) {
      console.error('Erro ao criar tamanho:', error);
      return res.status(500).json({ message: 'Erro interno ao cadastrar tamanho.' });
    }
  },

  async atualizar(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { nome, slug } = req.body;

      if (!nome || !slug) {
        return res.status(400).json({ message: 'Nome e slug são obrigatórios.' });
      }

      const tamanhoAtualizado = await prisma.tamanho.update({
        where: { id: String(id) },
        data: { nome, slug },
      });

      return res.status(200).json(tamanhoAtualizado);
    } catch (error) {
      console.error('Erro ao atualizar tamanho:', error);
      return res.status(500).json({ message: 'Erro interno ao atualizar tamanho.' });
    }
  },

  async excluir(req: Request, res: Response) {
    try {
      const { id } = req.params;

      // Substitua 'produtoEstoque' pelo nome exato da nova tabela no seu schema.prisma
      const produtosVinculados = await prisma.produtoEstoque.count({
        where: { tamanhoId: String(id) },
      });

      if (produtosVinculados > 0) {
        return res.status(400).json({
          message: `Não é possível excluir este tamanho pois ele está em uso por ${produtosVinculados} produto(s).`
        });
      }

      await prisma.tamanho.delete({ where: { id: String(id) } });

      return res.status(200).json({ message: 'Tamanho excluído com sucesso.' });
    } catch (error) {
      console.error('Erro ao excluir tamanho:', error);
      return res.status(500).json({ message: 'Erro interno ao excluir tamanho.' });
    }
  },
  
  async inativar(req: Request, res: Response) {
    try {
      const id = String(req.params.id);

      // 1. Inativa o tamanho globalmente
      const tamanhoAtualizado = await prisma.tamanho.update({
        where: { id },
        data: { ativo: false }
      });

      // 2. Inativa em cascata todos os estoques vinculados a este tamanho
      await prisma.produtoEstoque.updateMany({
        where: { tamanhoId: id },
        data: { ativo: false }
      });

      return res.status(200).json({ 
        message: 'Tamanho e seus estoques vinculados foram inativados com sucesso!',
        tamanho: tamanhoAtualizado 
      });
    } catch (error) {
      console.error('Erro ao inativar tamanho:', error);
      return res.status(500).json({ message: 'Erro interno ao inativar tamanho.' });
    }
  },

  async ativar(req: Request, res: Response) {
    try {
      const id = String(req.params.id);

      // 1. Ativa o tamanho globalmente
      const tamanhoAtualizado = await prisma.tamanho.update({
        where: { id },
        data: { ativo: true }
      });

      // 2. Reativa os estoques vinculados a este tamanho
      await prisma.produtoEstoque.updateMany({
        where: { tamanhoId: id },
        data: { ativo: true }
      });

      return res.status(200).json({ 
        message: 'Tamanho e seus estoques vinculados foram ativados com sucesso!',
        tamanho: tamanhoAtualizado 
      });
    } catch (error) {
      console.error('Erro ao ativar tamanho:', error);
      return res.status(500).json({ message: 'Erro interno ao ativar tamanho.' });
    }
  },
};