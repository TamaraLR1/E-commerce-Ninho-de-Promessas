import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';

export const estoqueController = {
  async listarMovimentacoes(req: Request, res: Response) {
    try {
      const movimentacoes = await prisma.movimentacaoEstoque.findMany({
        orderBy: { data: 'desc' },
        include: {
          motivo: true,   // Traz os dados da tabela relacionada de motivos
          produto: true,  // Traz os dados do produto (opcional, caso precise exibir o nome do produto)
        },
      });
      return res.status(200).json(movimentacoes);
    } catch (error) {
      console.error('Erro ao listar movimentações:', error);
      return res.status(500).json({ message: 'Erro interno ao buscar movimentações.' });
    }
  },

  async criarMovimentacao(req: Request, res: Response) {
  try {
    // 1. Extraia o motivoId (e mantenha o motivo caso algum outro lugar ainda envie texto)
    const { produtoId, corNome, tamanho, tipo, quantidade, motivoId, motivo } = req.body;

    if (!produtoId || !tipo || !quantidade) {
      return res.status(400).json({ message: 'Campos obrigatórios ausentes.' });
    }

    const corNomeFinal = corNome || 'Padrão';
    const tamanhoFinal = tamanho || 'Único';

    const produtoEstoque = await prisma.produtoEstoque.findFirst({
      where: {
        produtoId,
        cor: { nome: corNomeFinal },
        tamanho: { nome: tamanhoFinal }
      },
    });

    if (!produtoEstoque) {
      return res.status(404).json({ message: 'Variação de estoque não encontrada para este produto.' });
    }

    if (produtoEstoque.ativo === false) {
      return res.status(400).json({ 
        message: 'Não é permitido realizar movimentações para variações inativas.' 
      });
    }

    // 2. Salve o motivoId ou o texto correto no banco
    const novaMovimentacao = await prisma.movimentacaoEstoque.create({
      data: {
        produtoId,
        corNome: corNomeFinal,
        tamanho: tamanhoFinal,
        tipo,
        quantidade: Number(quantidade),
        // Se a sua coluna no banco for motivoId (UUID):
        motivoId: motivoId || null,
        // OU se o seu banco espera o texto direto do motivo enviado:
        // motivo: motivo || 'Movimentação manual',
      },
    });

    return res.status(201).json(novaMovimentacao);
  } catch (error) {
    console.error('Erro ao criar movimentação:', error);
    return res.status(500).json({ message: 'Erro interno ao salvar movimentação.' });
  }
  }
};