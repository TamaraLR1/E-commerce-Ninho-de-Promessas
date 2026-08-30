import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';

// Função auxiliar para gerar slug automaticamente caso não seja enviado
function gerarSlug(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove acentos
    .replace(/[^\w\s-]/g, '') // Remove caracteres especiais
    .trim()
    .replace(/\s+/g, '-'); // Substitui espaços por hifens
}

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
      const { nome } = req.body;
      let { slug } = req.body;

      // Captura o ID do admin logado
      const rawAdminId = (req as any).admin?.id || (req as any).admin?.adminId || (req as any).user?.id || (req as any).user?.adminId;
      const adminId = rawAdminId ? Number(rawAdminId) : null;

      if (!nome) {
        return res.status(400).json({ message: 'O nome da categoria é obrigatório.' });
      }

      if (!slug) {
        slug = gerarSlug(nome);
      } else {
        slug = gerarSlug(slug);
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

      // 📝 Registra o log de criação da categoria
      if (adminId) {
        await prisma.logAtividade.create({
          data: {
            adminId: adminId,
            acao: `Cadastrou a categoria "${novaCategoria.nome}"`
          }
        });
      }

      return res.status(201).json(novaCategoria);
    } catch (error) {
      console.error('Erro ao criar categoria:', error);
      return res.status(500).json({ message: 'Erro interno ao cadastrar categoria.' });
    }
  },

  async atualizar(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { nome } = req.body;
      let { slug } = req.body;

      // Captura o ID do admin logado
      const rawAdminId = (req as any).admin?.id || (req as any).admin?.adminId || (req as any).user?.id || (req as any).user?.adminId;
      const adminId = rawAdminId ? Number(rawAdminId) : null;

      if (!nome) {
        return res.status(400).json({ message: 'O nome da categoria é obrigatório.' });
      }

      if (!slug) {
        slug = gerarSlug(nome);
      } else {
        slug = gerarSlug(slug);
      }

      const categoriaAtual = await prisma.categoria.findUnique({ where: { id: String(id) } });
      if (!categoriaAtual) {
        return res.status(404).json({ message: 'Categoria não encontrada.' });
      }

      const categoriaConflitante = await prisma.categoria.findFirst({
        where: {
          AND: [
            { id: { not: String(id) } },
            { OR: [{ nome }, { slug }] }
          ]
        },
      });

      if (categoriaConflitante) {
        return res.status(400).json({ message: 'Já existe outra categoria com este nome ou slug.' });
      }

      const categoriaAtualizada = await prisma.categoria.update({
        where: { id: String(id) },
        data: { nome, slug },
      });

      // 📝 Registra o log de atualização da categoria
      if (adminId) {
        const alteracaoNome = categoriaAtual.nome !== nome 
          ? `o nome de "${categoriaAtual.nome}" para "${nome}"` 
          : `os dados`;

        await prisma.logAtividade.create({
          data: {
            adminId: adminId,
            acao: `Atualizou a categoria "${categoriaAtual.nome}": alterou ${alteracaoNome}`
          }
        });
      }

      return res.status(200).json(categoriaAtualizada);
    } catch (error) {
      console.error('Erro ao atualizar categoria:', error);
      return res.status(500).json({ message: 'Erro interno ao atualizar categoria.' });
    }
  },

  async inativar(req: Request, res: Response) {
    try {
      const id = String(req.params.id);

      // Captura o ID do admin logado
      const rawAdminId = (req as any).admin?.id || (req as any).admin?.adminId || (req as any).user?.id || (req as any).user?.adminId;
      const adminId = rawAdminId ? Number(rawAdminId) : null;

      const categoriaExistente = await prisma.categoria.findUnique({ where: { id } });
      if (!categoriaExistente) {
        return res.status(404).json({ message: 'Categoria não encontrada.' });
      }

      const produtosDaCategoria = await prisma.produto.findMany({
        where: { categoryId: id },
        select: { id: true }
      });

      // 2. Se não houver vínculos, exclui permanentemente do banco de dados
      if (produtosDaCategoria.length === 0) {
        await prisma.categoria.delete({
          where: { id }
        });

        // 📝 Registra o log de exclusão permanente
        if (adminId) {
          await prisma.logAtividade.create({
            data: {
              adminId: adminId,
              acao: `Excluiu permanentemente a categoria "${categoriaExistente.nome}"`
            }
          });
        }

        return res.status(200).json({ 
          message: 'Categoria sem vínculos foi excluída permanentemente com sucesso!' 
        });
      }

      // 3. Se houver vínculos, desativa a categoria normalmente
      const categoriaAtualizada = await prisma.categoria.update({
        where: { id },
        data: { ativo: false }
      });

      const produtoIds = produtosDaCategoria.map(p => p.id);

      if (produtoIds.length > 0) {
        await prisma.produtoEstoque.updateMany({
          where: { produtoId: { in: produtoIds } },
          data: { ativo: false }
        });
      }

      // 📝 Registra o log de inativação
      if (adminId) {
        await prisma.logAtividade.create({
          data: {
            adminId: adminId,
            acao: `Inativou a categoria "${categoriaExistente.nome}" e seus produtos vinculados`
          }
        });
      }

      return res.status(200).json({ 
        message: 'Categoria e seus produtos vinculados foram desativados com sucesso!',
        categoria: categoriaAtualizada 
      });
    } catch (error) {
      console.error('Erro ao processar categoria:', error);
      return res.status(500).json({ message: 'Erro interno ao processar categoria.' });
    }
  },

  async ativar(req: Request, res: Response) {
    try {
      const id = String(req.params.id);

      // Captura o ID do admin logado
      const rawAdminId = (req as any).admin?.id || (req as any).admin?.adminId || (req as any).user?.id || (req as any).user?.adminId;
      const adminId = rawAdminId ? Number(rawAdminId) : null;

      const categoriaExistente = await prisma.categoria.findUnique({ where: { id } });
      if (!categoriaExistente) {
        return res.status(404).json({ message: 'Categoria não encontrada.' });
      }

      // 1. Ativa a categoria
      const categoriaAtualizada = await prisma.categoria.update({
        where: { id },
        data: { ativo: true }
      });

      const produtosDaCategoria = await prisma.produto.findMany({
        where: { categoryId: id },
        select: { id: true }
      });

      const produtoIds = produtosDaCategoria.map(p => p.id);

      if (produtoIds.length > 0) {
        await prisma.produtoEstoque.updateMany({
          where: { produtoId: { in: produtoIds } },
          data: { ativo: true }
        });
      }

      // 📝 Registra o log de reativação
      if (adminId) {
        await prisma.logAtividade.create({
          data: {
            adminId: adminId,
            acao: `Reativou a categoria "${categoriaExistente.nome}" e seus produtos vinculados`
          }
        });
      }

      return res.status(200).json({ 
        message: 'Categoria e seus produtos vinculados foram ativados com sucesso!',
        categoria: categoriaAtualizada 
      });
    } catch (error) {
      console.error('Erro ao ativar categoria:', error);
      return res.status(500).json({ message: 'Erro interno ao ativar categoria.' });
    }
  },
};