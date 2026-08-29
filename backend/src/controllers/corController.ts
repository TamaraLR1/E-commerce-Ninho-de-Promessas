import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';

export const corController = {
  async listar(req: Request, res: Response) {
    try {
      const cores = await prisma.cor.findMany({
        orderBy: { nome: 'asc' },
      });
      return res.status(200).json(cores);
    } catch (error) {
      console.error('Erro ao listar cores:', error);
      return res.status(500).json({ message: 'Erro interno ao buscar cores.' });
    }
  },

  async criar(req: Request, res: Response) {
    try {
      const { nome, slug, hex } = req.body;

      if (!nome || !slug) {
        return res.status(400).json({ message: 'Nome e slug são obrigatórios.' });
      }

      const corExistente = await prisma.cor.findUnique({
        where: { slug },
      });

      if (corExistente) {
        return res.status(400).json({ message: 'Já existe uma cor cadastrada com este slug.' });
      }

      const novaCor = await prisma.cor.create({
        data: {
          nome,
          slug,
          hex: hex || '#000000',
        },
      });

      return res.status(201).json(novaCor);
    } catch (error) {
      console.error('Erro ao criar cor:', error);
      return res.status(500).json({ message: 'Erro interno ao cadastrar cor.' });
    }
  },

  async atualizar(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { nome, slug, hex } = req.body;

      const corExistente = await prisma.cor.findUnique({
        where: { id: String(id) },
      });

      if (!corExistente) {
        return res.status(404).json({ message: 'Cor não encontrada.' });
      }

      // Se o slug foi alterado, verifica se já pertence a outra cor
      if (slug && slug !== corExistente.slug) {
        const slugEmUso = await prisma.cor.findUnique({
          where: { slug },
        });

        if (slugEmUso) {
          return res.status(400).json({ message: 'Já existe outra cor cadastrada com este slug.' });
        }
      }

      const corAtualizada = await prisma.cor.update({
        where: { id: String(id) },
        data: {
          nome: nome !== undefined ? nome : corExistente.nome,
          slug: slug !== undefined ? slug : corExistente.slug,
          hex: hex !== undefined ? hex : corExistente.hex,
        },
      });

      return res.status(200).json(corAtualizada);
    } catch (error) {
      console.error('Erro ao atualizar cor:', error);
      return res.status(500).json({ message: 'Erro interno ao atualizar cor.' });
    }
  },

  async excluir(req: Request, res: Response) {
    try {
      const { id } = req.params;

      // Verificação de vínculo com produtos (ajuste para a tabela/relação atualizada de estoque)
      const produtosVinculados = await prisma.produtoEstoque.count({
        where: { corId: String(id) },
      });

      if (produtosVinculados > 0) {
        return res.status(400).json({
          message: `Não é possível excluir esta cor pois ela está em uso por ${produtosVinculados} produto(s).`
        });
      }

      await prisma.cor.delete({ 
        where: { id: String(id) } 
      });

      return res.status(200).json({ message: 'Cor excluída com sucesso.' });
    } catch (error) {
      console.error('Erro ao excluir cor:', error);
      return res.status(500).json({ message: 'Erro interno ao excluir cor.' });
    }
  },

  async inativar(req: Request, res: Response) {
    try {
      const id = String(req.params.id);

      // 1. Verifica se existem estoques vinculados a esta cor
      const estoquesVinculados = await prisma.produtoEstoque.findMany({
        where: { corId: id },
        select: { id: true }
      });

      // 2. Se não houver vínculos, exclui permanentemente do banco de dados
      if (estoquesVinculados.length === 0) {
        await prisma.cor.delete({
          where: { id }
        });

        return res.status(200).json({ 
          message: 'Cor sem vínculos foi excluída permanentemente com sucesso!' 
        });
      }

      // 3. Se houver vínculos, inativa a cor globalmente
      const corAtualizada = await prisma.cor.update({
        where: { id },
        data: { ativo: false }
      });

      // 4. Inativa em cascata todos os estoques vinculados a esta cor
      await prisma.produtoEstoque.updateMany({
        where: { corId: id },
        data: { ativo: false }
      });

      // 5. Verifica os produtos afetados e atualiza o 'ativo' do produto se necessário
      const produtosAfetados = await prisma.produto.findMany({
        where: {
          estoques: {
            some: { corId: id }
          }
        },
        include: {
          estoques: {
            include: { tamanho: true, cor: true }
          }
        }
      });

      for (const produto of produtosAfetados) {
        const temAlgumaVariacaoAtiva = produto.estoques.some((item: any) => {
          const tamanhoAtivo = item.tamanho?.ativo !== false;
          const corAtiva = !item.cor || item.cor.ativo !== false;
          const estoqueItemAtivo = item.ativo !== false;
          return tamanhoAtivo && corAtiva && estoqueItemAtivo;
        });

        if (!temAlgumaVariacaoAtiva) {
          await prisma.produto.update({
            where: { id: produto.id },
            data: { ativo: false, isVisible: false }
          });
        }
      }

      return res.status(200).json({ 
        message: 'Cor e seus estoques vinculados foram inativados com sucesso!',
        cor: corAtualizada 
      });
    } catch (error) {
      console.error('Erro ao processar cor:', error);
      return res.status(500).json({ message: 'Erro interno ao processar cor.' });
    }
  },

  async ativar(req: Request, res: Response) {
    try {
      const id = String(req.params.id);

      // 1. Ativa a cor globalmente
      const corAtualizada = await prisma.cor.update({
        where: { id },
        data: { ativo: true }
      });

      // 2. Reativa os estoques vinculados a esta cor
      await prisma.produtoEstoque.updateMany({
        where: { corId: id },
        data: { ativo: true }
      });

      // 3. Busca os produtos afetados e reativa o produto principal caso ele volte a ter variações válidas
      const produtosAfetados = await prisma.produto.findMany({
        where: {
          estoques: {
            some: { corId: id }
          }
        },
        include: {
          estoques: {
            include: { tamanho: true, cor: true }
          }
        }
      });

      for (const produto of produtosAfetados) {
        const temAlgumaVariacaoAtiva = produto.estoques.some((item: any) => {
          const tamanhoAtivo = item.tamanho?.ativo !== false;
          const corAtiva = !item.cor || item.cor.ativo !== false;
          const estoqueItemAtivo = item.ativo !== false;
          return tamanhoAtivo && corAtiva && estoqueItemAtivo;
        });

        // Se o produto agora possui ao menos uma variação ativa, volta o produto para ativo = true
        if (temAlgumaVariacaoAtiva) {
          await prisma.produto.update({
            where: { id: produto.id },
            data: { ativo: true }
          });
        }
      }

      return res.status(200).json({ 
        message: 'Cor e seus estoques vinculados foram ativados com sucesso!',
        cor: corAtualizada 
      });
    } catch (error) {
      console.error('Erro ao ativar cor:', error);
      return res.status(500).json({ message: 'Erro interno ao ativar cor.' });
    }
  },
};