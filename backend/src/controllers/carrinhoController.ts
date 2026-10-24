import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';

export const carrinhoController = {
  // GET /api/carrinho - Busca ou cria o carrinho do usuário logado
  async obterCarrinho(req: Request, res: Response) {
    try {
      const rawUserId = (req as any).user?.id || (req as any).userId;

      if (!rawUserId) {
        return res.status(401).json({ message: 'Usuário não autenticado.' });
      }

      const userId = Number(rawUserId);

      if (isNaN(userId)) {
        return res.status(400).json({ message: 'ID de usuário inválido.' });
      }

      // 1. Valida se o usuário existe no banco para evitar erro de Foreign Key (P2003)
      const usuarioExiste = await prisma.user.findUnique({
        where: { id: userId },
      });

      if (!usuarioExiste) {
        return res.status(404).json({ message: 'Usuário não encontrado. Faça login novamente.' });
      }

      // 2. Busca o carrinho existente
      let carrinho = await prisma.carrinho.findUnique({
        where: { userId },
        include: {
          itens: {
            include: {
              produto: {
                include: {
                  imagens: true,
                },
              },
              tamanho: true,
              cor: true,
            },
            orderBy: { createdAt: 'desc' },
          },
        },
      });

      // 3. Se o usuário ainda não tiver um carrinho criado no banco, cria um novo
      if (!carrinho) {
        carrinho = await prisma.carrinho.create({
          data: { userId },
          include: {
            itens: {
              include: {
                produto: {
                  include: {
                    imagens: true,
                  },
                },
                tamanho: true,
                cor: true,
              },
            },
          },
        });
      }

      // 4. Formatando a resposta com cálculo do subtotal e imagem principal (ordem: 0)
      let subtotal = 0;

      const itensFormatados = (carrinho.itens || []).map((item) => {
        const precoUnitario = item.produto.temOferta && Number(item.produto.precoPromocional) > 0
          ? Number(item.produto.precoPromocional)
          : Number(item.produto.preco);

        const totalItem = precoUnitario * item.quantidade;
        subtotal += totalItem;

        // 1. Prioridade absoluta: imagem definida como capa principal (ordem === 0)
        const imagemCapa = item.produto.imagens.find((img: any) => img.ordem === 0);

        // 2. Fallbacks: imagem pela ordem mais baixa ou vinculada à cor
        const imagemOrdenada = [...(item.produto.imagens || [])].sort((a: any, b: any) => (a.ordem ?? 0) - (b.ordem ?? 0))[0];
        const imagemVinculada = item.produto.imagens.find((img) => img.corId === item.corId);

        const imagemUrl = imagemCapa?.url || imagemOrdenada?.url || imagemVinculada?.url || null;

        return {
          id: item.id,
          produtoId: item.produtoId,
          nome: item.produto.nome,
          precoUnitario,
          quantidade: item.quantidade,
          totalItem,
          tamanho: item.tamanho ? { id: item.tamanho.id, nome: item.tamanho.nome } : null,
          cor: item.cor ? { id: item.cor.id, nome: item.cor.nome, hex: item.cor.hex } : null,
          imagemUrl,
        };
      });

      return res.status(200).json({
        carrinhoId: carrinho.id,
        itens: itensFormatados,
        quantidadeTotal: itensFormatados.reduce((acc, item) => acc + item.quantidade, 0),
        subtotal,
      });
    } catch (error) {
      console.error('Erro ao buscar carrinho:', error);
      return res.status(500).json({ message: 'Erro interno ao buscar carrinho.' });
    }
  },

  // POST /api/carrinho/item - Adiciona produto ao carrinho (ou soma quantidade)
  async adicionarItem(req: Request, res: Response) {
    try {
      const userId = (req as any).user?.id || (req as any).userId;
      const { produtoId, tamanhoId, corId, quantidade = 1 } = req.body;

      if (!userId) {
        return res.status(401).json({ message: 'Usuário não autenticado.' });
      }

      if (!produtoId) {
        return res.status(400).json({ message: 'ID do produto é obrigatório.' });
      }

      // REGRA DE NEGÓCIO: Bloqueia a adição se tamanhoId ou corId não forem fornecidos
      if (!tamanhoId || !corId) {
        return res.status(400).json({ 
          message: 'Por favor, selecione a cor e o tamanho do produto antes de adicionar ao carrinho.' 
        });
      }

      // Garante que o carrinho exista
      let carrinho = await prisma.carrinho.findUnique({
        where: { userId: Number(userId) },
      });

      if (!carrinho) {
        carrinho = await prisma.carrinho.create({
          data: { userId: Number(userId) },
        });
      }

      // Verifica se o mesmo item com a mesma variação já está no carrinho
      const itemExistente = await prisma.itemCarrinho.findFirst({
        where: {
          carrinhoId: carrinho.id,
          produtoId,
          tamanhoId: String(tamanhoId),
          corId: String(corId),
        },
      });

      if (itemExistente) {
        // Incrementa a quantidade
        await prisma.itemCarrinho.update({
          where: { id: itemExistente.id },
          data: { quantidade: itemExistente.quantidade + Number(quantidade) },
        });
      } else {
        // Cria um novo item no carrinho
        await prisma.itemCarrinho.create({
          data: {
            carrinhoId: carrinho.id,
            produtoId,
            tamanhoId: String(tamanhoId),
            corId: String(corId),
            quantidade: Number(quantidade),
          },
        });
      }

      return res.status(200).json({ message: 'Item adicionado ao carrinho com sucesso.' });
    } catch (error) {
      console.error('Erro ao adicionar item ao carrinho:', error);
      return res.status(500).json({ message: 'Erro interno ao adicionar item ao carrinho.' });
    }
  },

  // PUT /api/carrinho/item/:itemId - Atualiza a quantidade do item
  async atualizarQuantidade(req: Request, res: Response) {
    try {
      const userId = (req as any).userId || (req as any).user?.id;
      const itemId = Array.isArray(req.params.itemId) ? req.params.itemId[0] : req.params.itemId;
      const { quantidade } = req.body;

      if (!userId) {
        return res.status(401).json({ message: 'Usuário não autenticado.' });
      }

      const novaQuantidade = Number(quantidade);

      if (isNaN(novaQuantidade) || novaQuantidade <= 0) {
        // Se a quantidade for <= 0, remove o item
        await prisma.itemCarrinho.delete({
          where: { id: String(itemId) },
        });
        return res.status(200).json({ message: 'Item removido do carrinho.' });
      }

      await prisma.itemCarrinho.update({
        where: { id: String(itemId) },
        data: { quantidade: novaQuantidade },
      });

      return res.status(200).json({ message: 'Quantidade atualizada com sucesso.' });
    } catch (error) {
      console.error('Erro ao atualizar quantidade do carrinho:', error);
      return res.status(500).json({ message: 'Erro interno ao atualizar quantidade.' });
    }
  },

  // DELETE /api/carrinho/item/:itemId - Remove um item do carrinho
  async removerItem(req: Request, res: Response) {
    try {
      const userId = (req as any).userId || (req as any).user?.id;
      const itemId = Array.isArray(req.params.itemId) ? req.params.itemId[0] : req.params.itemId;

      if (!userId) {
        return res.status(401).json({ message: 'Usuário não autenticado.' });
      }

      await prisma.itemCarrinho.delete({
        where: { id: String(itemId) },
      });

      return res.status(200).json({ message: 'Item removido com sucesso.' });
    } catch (error) {
      console.error('Erro ao remover item do carrinho:', error);
      return res.status(500).json({ message: 'Erro interno ao remover item.' });
    }
  },

  // DELETE /api/carrinho/limpar - Limpa todos os itens do carrinho
  async limparCarrinho(req: Request, res: Response) {
    try {
      const userId = (req as any).user?.id || (req as any).userId;

      if (!userId) {
        return res.status(401).json({ message: 'Usuário não autenticado.' });
      }

      const carrinho = await prisma.carrinho.findUnique({
        where: { userId: Number(userId) },
      });

      if (carrinho) {
        await prisma.itemCarrinho.deleteMany({
          where: { carrinhoId: carrinho.id },
        });
      }

      return res.status(200).json({ message: 'Carrinho limpo com sucesso.' });
    } catch (error) {
      console.error('Erro ao limpar carrinho:', error);
      return res.status(500).json({ message: 'Erro interno ao limpar carrinho.' });
    }
  },
};