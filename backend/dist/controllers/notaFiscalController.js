"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.notaFiscalController = void 0;
exports.formatarPedidoFiscal = formatarPedidoFiscal;
const prisma_1 = require("../lib/prisma");
const socket_1 = require("../socket");
const blingService_1 = require("../services/blingService");
// 🔧 Função auxiliar para padronizar dados fiscais e serializar BigInt com segurança
function formatarPedidoFiscal(pedido) {
    if (!pedido)
        return null;
    return {
        blingNfeId: pedido.blingNfeId ? String(pedido.blingNfeId) : null,
        nfeNumero: pedido.nfeNumero || null,
        nfeSerie: pedido.nfeSerie || null,
        chaveAcessoNfe: pedido.chaveAcessoNfe || null,
        nfeStatus: pedido.nfeStatus || null,
        nfeLinkDanfe: pedido.nfeLinkDanfe || null,
        nfeLinkXml: pedido.nfeLinkXml || null,
        nfeErroMensagem: pedido.nfeErroMensagem || null,
        temNfeAutorizada: Boolean(pedido.nfeStatus === 'AUTORIZADA' && pedido.chaveAcessoNfe),
    };
}
exports.notaFiscalController = {
    async oauthCallback(req, res) {
        try {
            const code = req.query.code;
            if (!code) {
                return res
                    .status(400)
                    .json({ message: 'Parâmetro "code" não informado no callback.' });
            }
            const resultado = await (0, blingService_1.trocarCodePorToken)(code);
            return res.status(200).json({
                message: 'Integração com o Bling autorizada com sucesso!',
                expiresAt: resultado.expiresAt,
            });
        }
        catch (error) {
            console.error('Erro no callback OAuth do Bling:', error?.response?.data || error.message);
            return res.status(500).json({
                message: 'Erro interno ao concluir autorização com o Bling.',
            });
        }
    },
    async emitirPorPedido(req, res) {
        try {
            const pedidoId = Array.isArray(req.params.pedidoId)
                ? req.params.pedidoId[0]
                : String(req.params.pedidoId);
            const rawAdminId = req.admin?.id ||
                req.admin?.adminId ||
                req.user?.id ||
                req.user?.adminId;
            const adminId = rawAdminId ? Number(rawAdminId) : null;
            if (!pedidoId) {
                return res
                    .status(400)
                    .json({ message: 'ID do pedido não informado.' });
            }
            const { jaEmitida, pedido } = await (0, blingService_1.emitirNfeDoPedido)(pedidoId);
            if (adminId) {
                await prisma_1.prisma.logAtividade.create({
                    data: {
                        adminId,
                        acao: `Emitiu/sincronizou NF-e do pedido #${pedido.numeroPedido}`,
                    },
                });
            }
            const fiscal = formatarPedidoFiscal(pedido);
            const io = req.io || (0, socket_1.getIO)();
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
        }
        catch (error) {
            const detalhes = error?.response?.data?.error?.description ||
                error?.response?.data ||
                error.message;
            console.error('Erro ao emitir NF-e por pedido:', detalhes);
            return res.status(500).json({
                message: 'Erro interno ao emitir nota fiscal no Bling.',
                detalhes,
            });
        }
    },
    async consultarPorPedido(req, res) {
        try {
            const pedidoId = Array.isArray(req.params.pedidoId)
                ? req.params.pedidoId[0]
                : String(req.params.pedidoId);
            if (!pedidoId) {
                return res
                    .status(400)
                    .json({ message: 'ID do pedido não informado.' });
            }
            const pedidoExistente = await prisma_1.prisma.pedido.findUnique({
                where: { id: pedidoId },
            });
            if (!pedidoExistente) {
                return res.status(404).json({ message: 'Pedido não encontrado.' });
            }
            let pedidoFinal = pedidoExistente;
            if (pedidoExistente.blingNfeId) {
                pedidoFinal = await (0, blingService_1.sincronizarNfeNoPedido)(pedidoExistente.id, pedidoExistente.blingNfeId);
            }
            return res.status(200).json(formatarPedidoFiscal(pedidoFinal));
        }
        catch (error) {
            console.error('Erro ao consultar NF-e do pedido:', error);
            return res
                .status(500)
                .json({ message: 'Erro interno ao consultar dados da NF-e.' });
        }
    },
    async baixarDanfe(req, res) {
        try {
            const pedidoId = Array.isArray(req.params.pedidoId)
                ? req.params.pedidoId[0]
                : String(req.params.pedidoId);
            if (!pedidoId) {
                return res
                    .status(400)
                    .json({ message: 'ID do pedido não informado.' });
            }
            const pedido = await prisma_1.prisma.pedido.findUnique({
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
        }
        catch (error) {
            console.error('Erro ao obter link do DANFE:', error);
            return res
                .status(500)
                .json({ message: 'Erro interno ao buscar DANFE.' });
        }
    },
    async baixarXml(req, res) {
        try {
            const pedidoId = Array.isArray(req.params.pedidoId)
                ? req.params.pedidoId[0]
                : String(req.params.pedidoId);
            if (!pedidoId) {
                return res
                    .status(400)
                    .json({ message: 'ID do pedido não informado.' });
            }
            const pedido = await prisma_1.prisma.pedido.findUnique({
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
        }
        catch (error) {
            console.error('Erro ao obter link do XML:', error);
            return res
                .status(500)
                .json({ message: 'Erro interno ao buscar XML da NF-e.' });
        }
    },
};
