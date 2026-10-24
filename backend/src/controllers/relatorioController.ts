import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';

export const relatorioController = {
  /**
   * 📊 Gera o relatório detalhado de vendas agrupado por Produto, Tamanho e Cor
   */
  async vendasPorVariacao(req: Request, res: Response) {
    try {
      // 1. Busca todos os itens de pedidos que possuem status PAGO ou em fluxo de entrega
      const itensVendidos = await prisma.itemPedido.findMany({
        where: {
          pedido: {
            status: {
              in: ['PAGO', 'EM_SEPARACAO', 'ENVIADO', 'ENTREGUE'],
            },
          },
        },
        include: {
          produto: {
            select: { id: true, nome: true },
          },
          cor: {
            select: { id: true, nome: true, hex: true },
          },
          tamanho: {
            select: { id: true, nome: true },
          },
        },
      });

      // 2. Agrupamento em memória usando Map para consolidar as variações
      const mapaAgrupado = new Map<string, {
        produtoId: string;
        produtoNome: string;
        tamanhoNome: string;
        corNome: string;
        corHex: string | null;
        quantidadeVendida: number;
        faturamentoTotal: number;
        somaPrecos: number;
      }>();

      for (const item of itensVendidos as any[]) {
        const prodId = item.produtoId || item.produto?.id || 'sem-id';
        const prodNome = item.produto?.nome || item.nomeProduto || 'Produto sem nome';
        
        // Tratamento seguro para garantir string no nome do tamanho
        const tamNome = typeof item.tamanho === 'object' && item.tamanho?.nome 
          ? item.tamanho.nome 
          : (typeof item.tamanho === 'string' ? item.tamanho : 'Único');

        // Tratamento seguro para garantir string no nome da cor
        const corNome = typeof item.cor === 'object' && item.cor?.nome 
          ? item.cor.nome 
          : (typeof item.corNome === 'string' ? item.corNome : 'Padrão');

        const corHex = item.cor?.hex || null;

        const chaveUnica = `${prodId}_${tamNome}_${corNome}`;

        const qtd = Number(item.quantidade || 0);
        const preco = Number(item.precoUnitario || 0);
        const subtotal = qtd * preco;

        if (mapaAgrupado.has(chaveUnica)) {
          const existente = mapaAgrupado.get(chaveUnica)!;
          existente.quantidadeVendida += qtd;
          existente.faturamentoTotal += subtotal;
          existente.somaPrecos += preco;
        } else {
          mapaAgrupado.set(chaveUnica, {
            produtoId: prodId,
            produtoNome: prodNome,
            tamanhoNome: tamNome,
            corNome: corNome,
            corHex: corHex,
            quantidadeVendida: qtd,
            faturamentoTotal: subtotal,
            somaPrecos: preco,
          });
        }
      }

      // 3. Formatação final calculando preço médio e ordenando por mais vendidos
      const relatorio = Array.from(mapaAgrupado.values()).map((item) => ({
        produtoId: item.produtoId,
        produtoNome: item.produtoNome,
        tamanhoNome: item.tamanhoNome,
        corNome: item.corNome,
        corHex: item.corHex,
        quantidadeVendida: item.quantidadeVendida,
        faturamentoTotal: Number(item.faturamentoTotal.toFixed(2)),
        precoMedioPago: item.quantidadeVendida > 0
          ? Number((item.faturamentoTotal / item.quantidadeVendida).toFixed(2))
          : 0,
      }));

      relatorio.sort((a, b) => b.quantidadeVendida - a.quantidadeVendida);

      return res.status(200).json(relatorio);
    } catch (error) {
      console.error('Erro ao gerar relatório de vendas por variação:', error);
      return res.status(500).json({ message: 'Erro interno ao gerar relatório de vendas.' });
    }
  },
};