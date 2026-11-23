import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { getIO } from '../socket';
import {
  trocarCodePorToken,
  emitirNfeDoPedido,
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

      const rawAdminId =
        (req as any).admin?.id ||
        (req as any).admin?.adminId ||
        (req as any).user?.id ||
        (req as any).user?.adminId;
      const adminId = rawAdminId ? Number(rawAdminId) : null;

      if (!pedidoId) {
        return res
          .status(400)
          .json({ message: 'ID do pedido não informado.' });
      }

      const { jaEmitida, pedido } = await emitirNfeDoPedido(pedidoId);

      if (adminId) {
        await prisma.logAtividade.create({
          data: {
            adminId,
            acao: `Emitiu/sincronizou NF-e do pedido #${pedido.numeroPedido}`,
          },
        });
      }

      const fiscal = formatarPedidoFiscal(pedido);

      const io = (req as any).io || getIO();
      if (io) {
        if (pedido.userId) {
          io.to(`usuario_${pedido.userId}`).emit('notaFiscalAtualizada', {
            pedidoId: pedido.id,
            ...fiscal,
          });
        }
        io.emit('notaFiscalAtualizada', {
          pedidoId: pedido.id,
          ...fiscal,
        });
      }

      return res.status(200).json({
        message: jaEmitida
          ? 'Nota fiscal já estava autorizada para este pedido.'
          : 'NF-e processada com sucesso!',
        fiscal,
      });
    } catch (error: any) {
      const detalhes =
        error?.response?.data?.error?.description ||
        error?.response?.data ||
        error.message;

      console.error('Erro ao emitir NF-e por pedido:', detalhes);
      return res.status(500).json({
        message: 'Erro interno ao emitir nota fiscal no Bling.',
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

      return res.status(200).json(formatarPedidoFiscal(pedidoFinal));
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