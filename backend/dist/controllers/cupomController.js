"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cupomController = void 0;
const prisma_1 = require("../lib/prisma");
const socket_1 = require("../socket");
exports.cupomController = {
    async criar(req, res) {
        try {
            const { codigo, tipo, valor, isPrimeiraCompra, dataValidade } = req.body;
            const rawAdminId = req.admin?.id || req.admin?.adminId || req.user?.id || req.user?.adminId;
            const adminId = rawAdminId ? Number(rawAdminId) : null;
            if (!codigo || !tipo || valor === undefined) {
                return res.status(400).json({ message: 'Código, tipo e valor do cupom são obrigatórios.' });
            }
            const codigoFormatado = String(codigo).toUpperCase().trim();
            const cupomExistente = await prisma_1.prisma.cupom.findUnique({
                where: { codigo: codigoFormatado }
            });
            if (cupomExistente) {
                return res.status(400).json({ message: 'Já existe um cupom cadastrado com este código.' });
            }
            const valorNumerico = Number(valor);
            if (isNaN(valorNumerico) || valorNumerico <= 0) {
                return res.status(400).json({ message: 'O valor do cupom deve ser maior que zero.' });
            }
            if (tipo === 'PERCENTUAL' && valorNumerico > 100) {
                return res.status(400).json({ message: 'O percentual de desconto não pode exceder 100%.' });
            }
            const novoCupom = await prisma_1.prisma.cupom.create({
                data: {
                    codigo: codigoFormatado,
                    tipo, // 'PERCENTUAL' ou 'FIXO'
                    valor: valorNumerico,
                    isPrimeiraCompra: Boolean(isPrimeiraCompra),
                    dataValidade: dataValidade ? new Date(dataValidade) : null,
                    ativo: true,
                },
            });
            if (adminId) {
                await prisma_1.prisma.logAtividade.create({
                    data: {
                        adminId: adminId,
                        acao: `Cadastrou o cupom de desconto "${codigoFormatado}"`
                    }
                });
            }
            const io = (0, socket_1.getIO)();
            if (io) {
                io.emit('cupomAtualizado', novoCupom);
            }
            return res.status(201).json({
                message: 'Cupom cadastrado com sucesso!',
                cupom: novoCupom
            });
        }
        catch (error) {
            console.error('Erro ao criar cupom:', error);
            return res.status(500).json({ message: 'Erro interno ao cadastrar cupom.' });
        }
    },
    async listar(req, res) {
        try {
            const cupons = await prisma_1.prisma.cupom.findMany({
                orderBy: {
                    criadoEm: 'desc',
                },
            });
            return res.status(200).json(cupons);
        }
        catch (error) {
            console.error('Erro ao listar cupons:', error);
            return res.status(500).json({ message: 'Erro interno ao buscar cupons.' });
        }
    },
    async alternarStatus(req, res) {
        try {
            const id = Array.isArray(req.params.id) ? req.params.id[0] : String(req.params.id);
            if (!id) {
                return res.status(400).json({ message: 'ID do cupom não informado.' });
            }
            const cupomExistente = await prisma_1.prisma.cupom.findUnique({
                where: { id }
            });
            if (!cupomExistente) {
                return res.status(404).json({ message: 'Cupom não encontrado.' });
            }
            const cupomAtualizado = await prisma_1.prisma.cupom.update({
                where: { id },
                data: {
                    ativo: !cupomExistente.ativo
                }
            });
            const io = (0, socket_1.getIO)();
            if (io) {
                io.emit('cupomAtualizado', cupomAtualizado);
            }
            return res.status(200).json({
                message: `Cupom ${cupomAtualizado.ativo ? 'ativado' : 'desativado'} com sucesso!`,
                cupom: cupomAtualizado
            });
        }
        catch (error) {
            console.error('Erro ao alterar status do cupom:', error);
            return res.status(500).json({ message: 'Erro interno ao atualizar status do cupom.' });
        }
    },
    async validarCupom(req, res) {
        try {
            const { codigo, clienteId } = req.body;
            if (!codigo) {
                return res.status(400).json({ message: 'Informe o código do cupom.' });
            }
            const codigoFormatado = String(codigo).toUpperCase().trim();
            const cupom = await prisma_1.prisma.cupom.findUnique({
                where: { codigo: codigoFormatado }
            });
            if (!cupom) {
                return res.status(404).json({ message: 'Cupom inválido ou não encontrado.' });
            }
            if (!cupom.ativo) {
                return res.status(400).json({ message: 'Este cupom está inativo.' });
            }
            // Validação de Data de Validade
            if (cupom.dataValidade && new Date() > new Date(cupom.dataValidade)) {
                return res.status(400).json({ message: 'Este cupom de campanha já expirou.' });
            }
            // Validação Rigorosa de Primeira Compra baseada no userId
            if (cupom.isPrimeiraCompra && clienteId) {
                const userIdNum = Number(clienteId);
                const pedidosAnteriores = await prisma_1.prisma.pedido.count({
                    where: {
                        userId: isNaN(userIdNum) ? undefined : userIdNum,
                        NOT: { status: 'CANCELADO' }
                    }
                });
                if (pedidosAnteriores > 0) {
                    return res.status(400).json({
                        message: 'Cupom inválido: este cupom é exclusivo para a primeira compra e sua conta já possui pedidos.'
                    });
                }
            }
            return res.status(200).json({
                message: 'Cupom aplicado com sucesso!',
                cupom: {
                    id: cupom.id,
                    codigo: cupom.codigo,
                    tipo: cupom.tipo,
                    valor: Number(cupom.valor)
                }
            });
        }
        catch (error) {
            console.error('Erro ao validar cupom:', error);
            return res.status(500).json({ message: 'Erro interno ao validar cupom.' });
        }
    }
};
