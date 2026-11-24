import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { getIO } from '../socket';
import {
  trocarCodePorToken,
  enfileirarNfeDoPedido,
  enfileirarNfeEmLote,
  sincronizarNfeNoPedido,
} from '../services/blingService';

// 🔧 Função auxiliar para padronizar dados fiscais e serializar BigInt com segurança
export function formatarPedidoFiscal(pedido: any) {
  if (!pedido) return null;

  return {
    blingNfeId: pedido.blingNfeId ? String(pedido.blingNfeId) : null,
    nfeNumero: pedido.nfeNumero || null,
    nfeSerie: pedido.nfeSerie || null,
    chaveAcessoNfe: pedido.chaveAcessoNfe || null,
    nfeStatus: pedido.nfeStatus || null,
    nfeLinkDanfe: pedido.nfeLinkDanfe || null,
    nfeLinkXml: pedido.nfeLinkXml || null,
    nfeErroMensagem: pedido.nfeErroMensagem || null,
    temNfeAutorizada: Boolean(
      pedido.nfeStatus === 'AUTORIZADA' && pedido.chaveAcessoNfe
    ),
  };
}

function extrairAdminId(req: Request): number | null {
  const rawAdminId =
    (req as any).admin?.id ||
    (req as any).admin?.adminId ||
    (req as any).user?.id ||
    (req as any).user?.adminId;
  const parsed = rawAdminId ? Number(rawAdminId) : null;
  return parsed && !Number.isNaN(parsed) ? parsed : null;
}

function emitirEventoNotaFiscal(req: Request, pedido: any) {
  const fiscal = formatarPedidoFiscal(pedido);
  const payload = {
    pedidoId: pedido.id,
    ...fiscal,
  };

  const io = (req as any).io || getIO();
  if (io) {
    if (pedido.userId) {
      io.to(`usuario_${pedido.userId}`).emit('notaFiscalAtualizada', payload);
    }
    io.emit('notaFiscalAtualizada', payload);
  }

  return fiscal;
}

export const notaFiscalController = {
  async oauthCallback(req: Request, res: Response) {
    try {
      const code = req.query.code as string;

      if (!code) {
        return res
          .status(400)
          .json({ message: 'Parâmetro "code" não informado no callback.' });
      }

      const resultado = await trocarCodePorToken(code);

      return res.status(200).json({
        message: 'Integração com o Bling autorizada com sucesso!',
        expiresAt: resultado.expiresAt,
      });
    } catch (error: any) {
      console.error(
        'Erro no callback OAuth do Bling:',
        error?.response?.data || error.message
      );
      return res.status(500).json({
        message: 'Erro interno ao concluir autorização com o Bling.',
      });
    }
  },

  async emitirPorPedido(req: Request, res: Response) {
    try {
      const pedidoId = Array.isArray(req.params.pedidoId)
        ? req.params.pedidoId[0]
        : String(req.params.pedidoId);

      const adminId = extrairAdminId(req);

      if (!pedidoId) {
        return res
          .status(400)
          .json({ message: 'ID do pedido não informado.' });
      }

      const { jaEmitida, enfileirada, pedido } =
        await enfileirarNfeDoPedido(pedidoId);

      if (adminId) {
        await prisma.logAtividade.create({
          data: {
            adminId,
            acao: jaEmitida
              ? `Consultou NF-e já autorizada do pedido #${pedido.numeroPedido}`
              : `Enfileirou emissão de NF-e do pedido #${pedido.numeroPedido}`,
          },
        });
      }

      const fiscal = emitirEventoNotaFiscal(req, pedido);

      const statusHttp = jaEmitida ? 200 : 202;

      return res.status(statusHttp).json({
        message: jaEmitida
          ? 'Nota fiscal já estava autorizada para este pedido.'
          : 'Pedido adicionado à fila de emissão de NF-e.',
        jaEmitida,
        enfileirada,
        fiscal,
      });
    } catch (error: any) {
      const detalhes =
        error?.response?.data?.error?.description ||
        error?.response?.data ||
        error.message;

      console.error('Erro ao enfileirar NF-e por pedido:', detalhes);
      return res.status(500).json({
        message: 'Erro interno ao enfileirar nota fiscal no Bling.',
        detalhes,
      });
    }
  },

  async emitirEmLote(req: Request, res: Response) {
    try {
      const { pedidoIds } = req.body as { pedidoIds?: string[] };
      const adminId = extrairAdminId(req);

      if (!Array.isArray(pedidoIds) || pedidoIds.length === 0) {
        return res
          .status(400)
          .json({ message: 'Informe ao menos um ID de pedido em pedidoIds.' });
      }

      const { totalEnfileirados } = await enfileirarNfeEmLote(pedidoIds);

      if (adminId) {
        await prisma.logAtividade.create({
          data: {
            adminId,
            acao: `Enfileirou emissão de NF-e em lote (${totalEnfileirados} pedido(s))`,
          },
        });
      }

      const pedidosAtualizados = await prisma.pedido.findMany({
        where: { id: { in: pedidoIds } },
      });

      for (const pedido of pedidosAtualizados) {
        emitirEventoNotaFiscal(req, pedido);
      }

      return res.status(202).json({
        message: `${totalEnfileirados} pedido(s) adicionado(s) à fila de emissão de NF-e.`,
        totalEnfileirados,
        pedidosFiscais: pedidosAtualizados.map((p) => ({
          pedidoId: p.id,
          ...formatarPedidoFiscal(p),
        })),
      });
    } catch (error: any) {
      const detalhes =
        error?.response?.data?.error?.description ||
        error?.response?.data ||
        error.message;

      console.error('Erro ao enfileirar NF-e em lote:', detalhes);
      return res.status(500).json({
        message: 'Erro interno ao enfileirar lote de notas fiscais no Bling.',
        detalhes,
      });
    }
  },

  async consultarPorPedido(req: Request, res: Response) {
    try {
      const pedidoId = Array.isArray(req.params.pedidoId)
        ? req.params.pedidoId[0]
        : String(req.params.pedidoId);

      if (!pedidoId) {
        return res
          .status(400)
          .json({ message: 'ID do pedido não informado.' });
      }

      const pedidoExistente = await prisma.pedido.findUnique({
        where: { id: pedidoId },
      });

      if (!pedidoExistente) {
        return res.status(404).json({ message: 'Pedido não encontrado.' });
      }

      let pedidoFinal = pedidoExistente;
      if (pedidoExistente.blingNfeId) {
        pedidoFinal = await sincronizarNfeNoPedido(
          pedidoExistente.id,
          pedidoExistente.blingNfeId
        );
      }

      const fiscal = emitirEventoNotaFiscal(req, pedidoFinal);
      return res.status(200).json(fiscal);
    } catch (error) {
      console.error('Erro ao consultar NF-e do pedido:', error);
      return res
        .status(500)
        .json({ message: 'Erro interno ao consultar dados da NF-e.' });
    }
  },

  async baixarDanfe(req: Request, res: Response) {
    try {
      const pedidoId = Array.isArray(req.params.pedidoId)
        ? req.params.pedidoId[0]
        : String(req.params.pedidoId);

      if (!pedidoId) {
        return res
          .status(400)
          .json({ message: 'ID do pedido não informado.' });
      }

      const pedido = await prisma.pedido.findUnique({
        where: { id: pedidoId },
      });

      if (!pedido) {
        return res.status(404).json({ message: 'Pedido não encontrado.' });
      }

      if (!pedido.nfeLinkDanfe) {
        return res
          .status(404)
          .json({ message: 'DANFE (PDF) ainda não disponível para este pedido.' });
      }

      return res.status(200).json({
        url: pedido.nfeLinkDanfe,
        chaveAcessoNfe: pedido.chaveAcessoNfe,
        nfeNumero: pedido.nfeNumero,
      });
    } catch (error) {
      console.error('Erro ao obter link do DANFE:', error);
      return res
        .status(500)
        .json({ message: 'Erro interno ao buscar DANFE.' });
    }
  },

  async baixarXml(req: Request, res: Response) {
    try {
      const pedidoId = Array.isArray(req.params.pedidoId)
        ? req.params.pedidoId[0]
        : String(req.params.pedidoId);

      if (!pedidoId) {
        return res
          .status(400)
          .json({ message: 'ID do pedido não informado.' });
      }

      const pedido = await prisma.pedido.findUnique({
        where: { id: pedidoId },
      });

      if (!pedido) {
        return res.status(404).json({ message: 'Pedido não encontrado.' });
      }

      if (!pedido.nfeLinkXml) {
        return res
          .status(404)
          .json({ message: 'XML da NF-e ainda não disponível para este pedido.' });
      }

      return res.status(200).json({
        url: pedido.nfeLinkXml,
        chaveAcessoNfe: pedido.chaveAcessoNfe,
        nfeNumero: pedido.nfeNumero,
      });
    } catch (error) {
      console.error('Erro ao obter link do XML:', error);
      return res
        .status(500)
        .json({ message: 'Erro interno ao buscar XML da NF-e.' });
    }
  },
};