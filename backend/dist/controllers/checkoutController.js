"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkoutController = void 0;
const prisma_1 = require("../lib/prisma");
exports.checkoutController = {
    async conferirEstoque(req, res) {
        try {
            const userIdLogado = req.userId || req.user?.id || req.user?.userId;
            if (!userIdLogado) {
                return res.status(401).json({ message: 'Você precisa estar logado para conferir o estoque.' });
            }
            const { items, pedidoParaRefazerId } = req.body;
            if (!items || !Array.isArray(items) || items.length === 0) {
                return res.status(400).json({ message: 'Nenhum item informado para conferência.' });
            }
            // Se estiver refazendo um pedido ativo (PENDENTE ou PAGO), mapeia a reserva já existente nele
            const reservaPedidoAntigo = new Map();
            if (pedidoParaRefazerId) {
                const pedidoAntigo = await prisma_1.prisma.pedido.findUnique({
                    where: { id: String(pedidoParaRefazerId) },
                    include: { itens: true },
                });
                if (pedidoAntigo && (pedidoAntigo.status === 'PENDENTE' || pedidoAntigo.status === 'PAGO')) {
                    for (const itemAnt of pedidoAntigo.itens) {
                        if (!itemAnt.produtoId)
                            continue;
                        const chave = `${String(itemAnt.produtoId)}::${itemAnt.tamanhoId ? String(itemAnt.tamanhoId) : ''}::${itemAnt.corId ? String(itemAnt.corId) : ''}`;
                        reservaPedidoAntigo.set(chave, (reservaPedidoAntigo.get(chave) || 0) + Number(itemAnt.quantidade || 0));
                    }
                }
            }
            let subtotalDisponivel = 0;
            let temItensEsgotados = false;
            let temQuantidadeAjustada = false;
            let temAlgumDisponivel = false;
            const itensConferidos = [];
            for (const item of items) {
                const produtoId = item.produtoId ? String(item.produtoId) : item.id ? String(item.id) : '';
                const tamanhoId = item.tamanhoId ? String(item.tamanhoId) : null;
                const corId = item.corId ? String(item.corId) : null;
                const quantidadeSolicitada = Math.max(1, Number(item.quantidade || 1));
                const precoUnitario = Number(item.preco ?? item.precoUnitario ?? 0);
                const nomeProduto = item.nome || item.nomeProduto || 'Produto';
                if (!produtoId) {
                    temItensEsgotados = true;
                    itensConferidos.push({
                        produtoId: '',
                        tamanhoId,
                        corId,
                        nome: nomeProduto,
                        precoUnitario,
                        quantidadeSolicitada,
                        quantidadeDisponivel: 0,
                        quantidadeAprovada: 0,
                        subtotalItem: 0,
                        status: 'ESGOTADO',
                        motivo: 'Produto inválido ou indisponível.',
                    });
                    continue;
                }
                const registroEstoque = await prisma_1.prisma.produtoEstoque.findFirst({
                    where: {
                        produtoId,
                        ...(tamanhoId ? { tamanhoId } : {}),
                        ...(corId ? { corId } : {}),
                    },
                    include: {
                        produto: { select: { nome: true, ativo: true } },
                    },
                });
                const chave = `${produtoId}::${tamanhoId || ''}::${corId || ''}`;
                const estoqueBanco = registroEstoque ? Number(registroEstoque.estoque || 0) : 0;
                const reservaPropria = reservaPedidoAntigo.get(chave) || 0;
                const disponivelReal = registroEstoque && registroEstoque.produto?.ativo === false
                    ? 0
                    : Math.max(0, estoqueBanco + reservaPropria);
                let statusItem = 'ESGOTADO';
                let quantidadeAprovada = 0;
                let motivo = null;
                if (disponivelReal <= 0) {
                    statusItem = 'ESGOTADO';
                    quantidadeAprovada = 0;
                    motivo = 'Item esgotado no estoque.';
                    temItensEsgotados = true;
                }
                else if (disponivelReal < quantidadeSolicitada) {
                    statusItem = 'QUANTIDADE_AJUSTADA';
                    quantidadeAprovada = disponivelReal;
                    motivo = `Apenas ${disponivelReal} un. disponível(is) (solicitado: ${quantidadeSolicitada}).`;
                    temItensEsgotados = true;
                    temQuantidadeAjustada = true;
                    temAlgumDisponivel = true;
                }
                else {
                    statusItem = 'DISPONIVEL';
                    quantidadeAprovada = quantidadeSolicitada;
                    temAlgumDisponivel = true;
                }
                const subtotalItem = Number((quantidadeAprovada * precoUnitario).toFixed(2));
                subtotalDisponivel = Number((subtotalDisponivel + subtotalItem).toFixed(2));
                itensConferidos.push({
                    produtoId,
                    tamanhoId,
                    corId,
                    nome: registroEstoque?.produto?.nome || nomeProduto,
                    precoUnitario,
                    quantidadeSolicitada,
                    quantidadeDisponivel: disponivelReal,
                    quantidadeAprovada,
                    subtotalItem,
                    status: statusItem,
                    motivo,
                });
            }
            return res.status(200).json({
                success: true,
                itens: itensConferidos,
                subtotalDisponivel,
                temItensEsgotados,
                temQuantidadeAjustada,
                temAlgumDisponivel,
            });
        }
        catch (error) {
            console.error('Erro ao conferir estoque no checkout:', error);
            return res.status(500).json({
                message: 'Erro interno ao conferir disponibilidade do estoque.',
            });
        }
    },
};
