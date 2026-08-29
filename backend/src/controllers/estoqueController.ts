import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';

export const estoqueController = {
async listarMovimentacoes(req: Request, res: Response) {
    try {
      const movimentacoes = await prisma.movimentacaoEstoque.findMany({
        orderBy: { data: 'desc' },
        include: {
          motivo: true,   // Traz os dados da tabela relacionada de motivos
          produto: true,  // Traz os dados do produto
        },
      });

      // Trata as movimentações para exibir "Produto Removido" caso o produto tenha sido deletado
      const movimentacoesFormatadas = movimentacoes.map((m) => {
        // Se o produto foi excluído do banco, criamos um objeto 'produto' básico com a mensagem
        if (!m.produto) {
          return {
            ...m,
            produto: {
              nome: 'Produto Removido',
            },
          };
        }
        return m;
      });

      return res.status(200).json(movimentacoesFormatadas);
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
      const qtdNumerica = Number(quantidade);

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

      // Validação opcional para evitar estoque negativo em caso de saída
      if (tipo === 'SAIDA' && produtoEstoque.estoque < qtdNumerica) {
        return res.status(400).json({ message: 'Estoque insuficiente para esta saída.' });
      }

      // 2. Executa a criação da movimentação e a atualização do estoque físico em transação
      const [novaMovimentacao] = await prisma.$transaction([
        // Cria o registro no histórico
        prisma.movimentacaoEstoque.create({
          data: {
            produtoId,
            corNome: corNomeFinal,
            tamanho: tamanhoFinal,
            tipo,
            quantidade: qtdNumerica,
            motivoId: motivoId || null,
          },
        }),
        // Atualiza o saldo real na tabela de estoque do produto
        prisma.produtoEstoque.update({
          where: { id: produtoEstoque.id },
          data: {
            estoque: {
              [tipo === 'ENTRADA' ? 'increment' : 'decrement']: qtdNumerica
            }
          }
        })
      ]);

      return res.status(201).json(novaMovimentacao);
    } catch (error) {
      console.error('Erro ao criar movimentação:', error);
      return res.status(500).json({ message: 'Erro interno ao salvar movimentação.' });
    }
  },

  async obterDashboard(req: Request, res: Response) {
    try {
      // 1. Total de variações de produtos ativas no estoque
      const totalProdutosEstoque = await prisma.produtoEstoque.count({
        where: { ativo: true }
      });

      // 2. Quantidade física total real (Soma de todo o estoque de todas as variações ativas)
      const estoqueAgregado = await prisma.produtoEstoque.aggregate({
        where: { ativo: true },
        _sum: { estoque: true }
      });

      const quantidadeFisicaTotal = estoqueAgregado._sum.estoque || 0;

      // 3. Contagem de movimentações do mês atual (Apenas o fluxo real de entradas e saídas manuais/automáticas do mês)
      const inicioDoMes = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
      
      const movimentacoesMes = await prisma.movimentacaoEstoque.findMany({
        where: {
          data: {
            gte: inicioDoMes,
          },
        },
        include: {
          motivo: true,
        }
      });

      const totalEntradasMes = movimentacoesMes
        .filter(m => m.tipo === 'ENTRADA')
        .reduce((acc, m) => acc + m.quantidade, 0);

      const totalSaidasMes = movimentacoesMes
        .filter(m => m.tipo === 'SAIDA')
        .reduce((acc, m) => acc + m.quantidade, 0);

      // 4. Últimas 5 movimentações para tabela rápida de auditoria
      const ultimasMovimentacoes = await prisma.movimentacaoEstoque.findMany({
        orderBy: { data: 'desc' },
        take: 5,
        include: {
          motivo: true,
          produto: true,
        }
      });

      // Retornando os dados consolidados para o Dashboard
      return res.status(200).json({
        cards: {
          totalProdutosAtivos: totalProdutosEstoque,
          quantidadeFisicaTotal,
          entradasNoMes: totalEntradasMes,
          saidasNoMes: totalSaidasMes,
        },
        ultimasMovimentacoes,
      });

    } catch (error) {
      console.error('Erro ao carregar dados do dashboard:', error);
      return res.status(500).json({ message: 'Erro interno ao carregar o dashboard.' });
    }
  },
};

