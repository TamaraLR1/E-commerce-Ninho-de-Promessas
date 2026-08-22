import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';

export const estoqueController = {
  async listarMovimentacoes(req: Request, res: Response) {
    try {
      const movimentacoes = await prisma.movimentacaoEstoque.findMany({
        orderBy: { data: 'desc' },
      });
      return res.status(200).json(movimentacoes);
    } catch (error) {
      console.error('Erro ao listar movimentações:', error);
      return res.status(500).json({ message: 'Erro interno ao buscar movimentações.' });
    }
  },

async criarMovimentacao(req: Request, res: Response) {
    try {
      const { produtoId, corNome, tamanho, tipo, quantidade, motivo } = req.body;

      if (!produtoId || !tipo || !quantidade) {
        return res.status(400).json({ message: 'Campos obrigatórios ausentes.' });
      }

      // 1. Opcional: Se precisar converter corNome/tamanho para IDs, faça aqui. 
      // Caso sua rota já receba os IDs ou você busque pelo nome/relação:
      const corNomeFinal = corNome || 'Padrão';
      const tamanhoFinal = tamanho || 'Único';

      // Buscamos o registro específico no ProdutoEstoque considerando produto, cor e tamanho
      // Nota: Ajuste a query de busca caso você receba IDs diretos no req.body (ex: corId, tamanhoId)
      const produtoEstoque = await prisma.produtoEstoque.findFirst({
        where: {
          produtoId,
          // Se na sua tabela a relação com Cor usa o nome ou ID, ajuste aqui. 
          // Exemplo buscando pela relação de cor e tamanho:
          cor: { nome: corNomeFinal },
          tamanho: { nome: tamanhoFinal }
        },
      });

      // Se não achar o registro exato de estoque
      if (!produtoEstoque) {
        return res.status(404).json({ message: 'Variação de estoque não encontrada para este produto.' });
      }

      // 2. Valida se o estoque específico está inativo
      if (produtoEstoque.ativo === false) {
        return res.status(400).json({ 
          message: 'Não é permitido realizar movimentações para variações inativas.' 
        });
      }

      // 3. Prossegue com a criação da movimentação
      const novaMovimentacao = await prisma.movimentacaoEstoque.create({
        data: {
          produtoId,
          corNome: corNomeFinal,
          tamanho: tamanhoFinal,
          tipo,
          quantidade: Number(quantidade),
          motivo: motivo || 'Movimentação manual',
        },
      });

      return res.status(201).json(novaMovimentacao);
    } catch (error) {
      console.error('Erro ao criar movimentação:', error);
      return res.status(500).json({ message: 'Erro interno ao salvar movimentação.' });
    }
  },
};