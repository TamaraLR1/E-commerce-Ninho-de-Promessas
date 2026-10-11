"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pedidoController = void 0;
const prisma_1 = require("../lib/prisma");
const socket_1 = require("../socket");
exports.pedidoController = {
    async listarMeusPedidos(req, res) {
        try {
            const userId = Number(req.user?.id || req.user?.userId);
            const pedidos = await prisma_1.prisma.pedido.findMany({
                where: { userId },
                include: {
                    itens: {
                        include: {
                            produto: {
                                include: { imagens: true },
                            },
                        },
                    },
                    endereco: true,
                },
                orderBy: { createdAt: 'desc' },
            });
            return res.status(200).json(pedidos);
        }
        catch (error) {
            console.error('Erro ao buscar pedidos do usuário:', error);
            return res.status(500).json({ message: 'Erro ao buscar histórico de pedidos.' });
        }
    },
    async buscarPorId(req, res) {
        try {
            const id = String(req.params.id);
            const pedido = await prisma_1.prisma.pedido.findUnique({
                where: { id },
                include: {
                    itens: {
                        include: {
                            produto: {
                                include: { imagens: true },
                            },
                            tamanho: true,
                            cor: true,
                        },
                    },
                    endereco: true,
                    user: true,
                },
            });
            if (!pedido) {
                return res.status(404).json({ message: 'Pedido não encontrado.' });
            }
            return res.status(200).json(pedido);
        }
        catch (error) {
            console.error('Erro ao buscar pedido por ID:', error);
            return res.status(500).json({ message: 'Erro interno ao buscar o pedido.' });
        }
    },
    async atualizarStatus(req, res) {
        try {
            const id = String(req.params.id);
            const { status, codigoRastreio } = req.body;
            const pedidoAtualizado = await prisma_1.prisma.pedido.update({
                where: { id },
                data: {
                    status,
                    ...(codigoRastreio && { codigoRastreio }),
                },
                include: {
                    itens: true,
                    endereco: true,
                },
            });
            const io = (0, socket_1.getIO)();
            if (io) {
                io.emit('pedidoAtualizado', pedidoAtualizado);
            }
            return res.status(200).json({
                message: 'Status do pedido atualizado com sucesso!',
                pedido: pedidoAtualizado,
            });
        }
        catch (error) {
            console.error('Erro ao atualizar status do pedido:', error);
            return res.status(500).json({ message: 'Erro ao atualizar o status do pedido.' });
        }
    },
};
