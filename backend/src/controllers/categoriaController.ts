import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';

export const categoriaController = {
  async listar(req: Request, res: Response) {
    try {
      const categorias = await prisma.categoria.findMany({
        orderBy: { nome: 'asc' },
      });
      return res.status(200).json(categorias);
    } catch (error) {
      console.error('Erro ao listar categorias:', error);
      return res.status(500).json({ message: 'Erro interno ao buscar categorias.' });
    }
  },

  async criar(req: Request, res: Response) {
    try {
      const { nome, slug } = req.body;

      if (!nome || !slug) {
        return res.status(400).json({ message: 'Nome e slug são obrigatórios.' });
      }

      const categoriaExiste = await prisma.categoria.findFirst({
        where: { OR: [{ nome }, { slug }] },
      });

      if (categoriaExiste) {
        return res.status(400).json({ message: 'Já existe uma categoria cadastrada com este nome ou slug.' });
      }

      const novaCategoria = await prisma.categoria.create({
        data: { nome, slug },
      });

      return res.status(201).json(novaCategoria);
    } catch (error) {
      console.error('Erro ao criar categoria:', error);
      return res.status(500).json({ message: 'Erro interno ao cadastrar categoria.' });
    }
  },

  async atualizar(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { nome, slug } = req.body;

      if (!nome || !slug) {
        return res.status(400).json({ message: 'Nome e slug são obrigatórios.' });
      }

      const categoriaAtualizada = await prisma.categoria.update({
        where: { id: String(id) },
        data: { nome, slug },
      });

      return res.status(200).json(categoriaAtualizada);
    } catch (error) {
      console.error('Erro ao atualizar categoria:', error);
      return res.status(500).json({ message: 'Erro interno ao atualizar categoria.' });
    }
  },

  async excluir(req: Request, res: Response) {
    try {
      const { id } = req.params;

      const categoria = await prisma.categoria.findUnique({ where: { id: String(id) } });
      if (!categoria) {
        return res.status(404).json({ message: 'Categoria não encontrada.' });
      }

      const produtosVinculados = await prisma.produto.count({
        where: { categoryId: String(id) },
      });

      if (produtosVinculados > 0) {
        return res.status(400).json({
          message: `Não é possível excluir esta categoria pois existem ${produtosVinculados} produto(s) vinculado(s) a ela.`
        });
      }

      await prisma.categoria.delete({ where: { id: String(id) } });

      return res.status(200).json({ message: 'Categoria excluída com sucesso.' });
    } catch (error) {
      console.error('Erro ao excluir categoria:', error);
      return res.status(500).json({ message: 'Erro interno ao excluir categoria.' });
    }
  },
};