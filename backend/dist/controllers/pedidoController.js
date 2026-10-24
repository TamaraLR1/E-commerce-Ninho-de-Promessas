"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pedidoController = void 0;
const prisma_1 = require("../lib/prisma");
const socket_1 = require("../socket");
exports.pedidoController = {
    // 1. Método para o Painel Admin (Lista TODOS os pedidos da loja com as dimensões)
    async listarTodosPedidos(req, res) {
        try {
            const pedidos = await prisma_1.prisma.pedido.findMany({
                orderBy: { createdAt: 'desc' },
                include: {
                    user: {
                        select: { nome: true, email: true, telefone: true, cpf: true },
                    },
                    endereco: true,
                    historicoStatus: {
                        orderBy: { data: 'asc' }
                    },
                    itens: {
                        include: {
                            produto: {
                                include: { imagens: true },
                            },
                            tamanho: true,
                            cor: true,
                        },
                    },
                },
            });
            // Mapeamento dos campos do banco MySQL para a interface do AdminDashboard
            const pedidosFormatados = pedidos.map((p) => ({
                id: p.id,
                codigoPedido: p.numeroPedido ? String(p.numeroPedido) : (p.codigoPedido || p.id.slice(0, 8)),
                clienteNome: p.clienteNome || p.user?.nome || 'Cliente Não Identificado',
                clienteEmail: p.clienteEmail || p.user?.email || '',
                clienteTelefone: p.clienteFone || p.clienteTelefone || p.user?.telefone || p.telefone,
                cpf: p.clienteCpf || p.user?.cpf || p.cpf,
                status: p.status,
                total: Number(p.valorTotal ?? p.total ?? p.subtotal ?? 0),
                freteValor: Number(p.valorFrete ?? p.freteValor ?? 0),
                metodoPagamento: p.metodoPagamento || p.formaPagamento || 'PIX / Cartão',
                servicoFrete: p.servicoFrete || p.metodoFrete || p.transportadora || 'Retirar na Loja',
                rastreioCodigo: p.codigoRastreio || p.rastreioCodigo || '',
                dataCriacao: p.createdAt || p.dataCriacao,
                pesoTotal: Number(p.pesoTotal ?? 0.3),
                alturaCaixa: Number(p.alturaCaixa ?? 8.0),
                larguraCaixa: Number(p.larguraCaixa ?? 16.0),
                comprimentoCaixa: Number(p.comprimentoCaixa ?? 24.0),
                enderecoEntrega: p.endereco
                    ? {
                        logradouro: p.endereco.rua || p.endereco.logradouro || '',
                        numero: p.endereco.numero || '',
                        complemento: p.endereco.complemento || '',
                        bairro: p.endereco.bairro || '',
                        cidade: p.endereco.cidade || '',
                        uf: p.endereco.estado || p.endereco.uf || '',
                        cep: p.endereco.cep || '',
                    }
                    : undefined,
                historicoStatus: p.historicoStatus || [],
                itens: (p.itens || []).map((i) => ({
                    id: i.id,
                    produtoId: i.produtoId || i.produto?.id || null,
                    tamanhoId: i.tamanhoId || i.tamanho?.id || null, // CORRIGIDO: Retorna o ID do tamanho
                    corId: i.corId || i.cor?.id || null, // CORRIGIDO: Retorna o ID da cor
                    nomeProduto: i.produto?.nome || i.nomeProduto || 'Produto sem nome',
                    imagemUrl: i.produto?.imagens?.[0]?.url || i.imagemUrl || '',
                    corNome: i.cor?.nome || i.corNome || '',
                    tamanho: i.tamanho?.nome || i.tamanho || '',
                    quantidade: i.quantidade,
                    precoUnitario: Number(i.precoUnitario || i.preco || 0),
                })),
            }));
            return res.status(200).json(pedidosFormatados);
        }
        catch (error) {
            console.error('Erro ao buscar todos os pedidos para o admin:', error);
            return res.status(500).json({ message: 'Erro ao buscar lista global de pedidos.' });
        }
    },
    // 2. Método para a Área do Cliente (listarMeusPedidos)
    async listarMeusPedidos(req, res) {
        try {
            const rawUserId = req.user?.id || req.userId || req.user?.userId;
            if (!rawUserId) {
                return res.status(401).json({ message: 'Usuário não autenticado.' });
            }
            const userId = Number(rawUserId);
            if (isNaN(userId)) {
                return res.status(400).json({ message: 'ID de usuário inválido.' });
            }
            const pedidos = await prisma_1.prisma.pedido.findMany({
                where: { userId },
                include: {
                    itens: {
                        include: {
                            produto: {
                                include: { imagens: true },
                            },
                            cor: true,
                            tamanho: true,
                        },
                    },
                    endereco: true,
                    historicoStatus: {
                        orderBy: { data: 'asc' }
                    }
                },
                orderBy: { createdAt: 'desc' },
            });
            if (!pedidos || pedidos.length === 0) {
                return res.status(200).json([]);
            }
            // Formatação limpa enviando os IDs das variações para o modal do cliente
            const pedidosFormatados = pedidos.map((p) => ({
                id: p.id,
                codigoPedido: p.codigoPedido || p.numeroPedido ? String(p.numeroPedido) : p.id.slice(0, 8),
                status: p.status,
                total: Number(p.total || p.valorTotal || 0),
                valorFrete: Number(p.valorFrete || p.freteValor || 0),
                servicoFrete: p.servicoFrete || p.metodoFrete || 'Entrega Padrão',
                codigoRastreio: p.codigoRastreio || p.rastreioCodigo || '',
                createdAt: p.createdAt,
                historicoStatus: p.historicoStatus || [],
                itens: p.itens.map((item) => {
                    const primeiraImagem = item.produto?.imagens?.[0]?.url || '';
                    return {
                        id: item.id,
                        produtoId: item.produtoId || item.produto?.id || null,
                        tamanhoId: item.tamanhoId || item.tamanho?.id || null, // CORRIGIDO: Retorna o ID do tamanho
                        corId: item.corId || item.cor?.id || null, // CORRIGIDO: Retorna o ID da cor
                        nomeProduto: item.produto?.nome || item.nomeProduto || 'Produto',
                        corNome: item.cor?.nome || item.corNome || '',
                        tamanho: item.tamanho?.nome || item.tamanho || item.tamanhoNome || '',
                        quantidade: item.quantidade,
                        precoUnitario: Number(item.precoUnitario),
                        imagemUrl: primeiraImagem || item.imagemUrl || '',
                    };
                }),
            }));
            return res.status(200).json(pedidosFormatados);
        }
        catch (error) {
            console.error('Erro ao buscar pedidos do usuário:', error);
            return res.status(500).json({ message: 'Erro ao buscar histórico de pedidos.' });
        }
    },
    // 3. Detalhes de um Pedido Específico
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
                    historicoStatus: {
                        orderBy: { data: 'asc' }
                    }
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
    // 4. Atualizar Status do Pedido
    async atualizarStatus(req, res) {
        try {
            const id = String(req.params.id);
            const { status, codigoRastreio, rastreioCodigo, observacao } = req.body;
            const codigoFinal = codigoRastreio || rastreioCodigo;
            const pedidoExistente = await prisma_1.prisma.pedido.findUnique({
                where: { id }
            });
            if (!pedidoExistente) {
                return res.status(404).json({ message: 'Pedido não encontrado.' });
            }
            const dataUpdate = {
                ...(codigoFinal && { codigoRastreio: codigoFinal }),
            };
            if (status && status !== pedidoExistente.status) {
                dataUpdate.status = status;
                dataUpdate.historicoStatus = {
                    create: {
                        status: status,
                        observacao: observacao || `Status atualizado para ${status}`
                    }
                };
            }
            const pedidoAtualizado = await prisma_1.prisma.pedido.update({
                where: { id },
                data: dataUpdate,
                include: {
                    itens: {
                        include: {
                            produto: {
                                include: { imagens: true },
                            },
                            cor: true,
                            tamanho: true,
                        },
                    },
                    endereco: true,
                    historicoStatus: {
                        orderBy: { data: 'asc' }
                    }
                },
            });
            const pedidoFormatado = {
                id: pedidoAtualizado.id,
                codigoPedido: pedidoAtualizado.codigoPedido || pedidoAtualizado.numeroPedido ? String(pedidoAtualizado.numeroPedido) : pedidoAtualizado.id.slice(0, 8),
                status: pedidoAtualizado.status,
                total: Number(pedidoAtualizado.total || pedidoAtualizado.valorTotal || 0),
                valorFrete: Number(pedidoAtualizado.valorFrete || pedidoAtualizado.freteValor || 0),
                servicoFrete: pedidoAtualizado.servicoFrete || pedidoAtualizado.metodoFrete || 'Entrega Padrão',
                codigoRastreio: pedidoAtualizado.codigoRastreio || pedidoAtualizado.rastreioCodigo || '',
                createdAt: pedidoAtualizado.createdAt,
                userId: pedidoAtualizado.userId,
                historicoStatus: pedidoAtualizado.historicoStatus || [],
                itens: pedidoAtualizado.itens.map((item) => ({
                    id: item.id,
                    produtoId: item.produtoId || item.produto?.id || null,
                    tamanhoId: item.tamanhoId || item.tamanho?.id || null, // CORRIGIDO: Retorna o ID do tamanho
                    corId: item.corId || item.cor?.id || null, // CORRIGIDO: Retorna o ID da cor
                    nomeProduto: item.produto?.nome || item.nomeProduto || 'Produto',
                    corNome: item.cor?.nome || item.corNome || '',
                    tamanho: item.tamanho?.nome || item.tamanho || '',
                    quantidade: item.quantidade,
                    precoUnitario: Number(item.precoUnitario),
                    imagemUrl: item.produto?.imagens?.[0]?.url || item.imagemUrl || '',
                })),
            };
            const io = (0, socket_1.getIO)();
            if (io) {
                if (pedidoAtualizado.userId) {
                    io.to(`usuario_${pedidoAtualizado.userId}`).emit('pedidoAtualizado', pedidoFormatado);
                }
                io.emit('pedidoAtualizado', pedidoFormatado);
            }
            return res.status(200).json({
                message: 'Status do pedido atualizado com sucesso!',
                pedido: pedidoFormatado,
            });
        }
        catch (error) {
            console.error('Erro ao atualizar status do pedido:', error);
            return res.status(500).json({ message: 'Erro ao atualizar o status do pedido.' });
        }
    },
    // 5. Atualizar Código de Rastreio
    async atualizarRastreio(req, res) {
        try {
            const id = String(req.params.id);
            const { rastreioCodigo, codigoRastreio } = req.body;
            const codigoFinal = rastreioCodigo || codigoRastreio;
            const pedidoAtualizado = await prisma_1.prisma.pedido.update({
                where: { id },
                data: {
                    codigoRastreio: codigoFinal,
                },
            });
            const io = (0, socket_1.getIO)();
            if (io) {
                if (pedidoAtualizado.userId) {
                    io.to(`usuario_${pedidoAtualizado.userId}`).emit('pedidoRastreioAtualizado', pedidoAtualizado);
                }
                io.emit('pedidoRastreioAtualizado', pedidoAtualizado);
            }
            return res.status(200).json({
                message: 'Código de rastreio atualizado com sucesso!',
                pedido: pedidoAtualizado,
            });
        }
        catch (error) {
            console.error('Erro ao atualizar código de rastreio:', error);
            return res.status(500).json({ message: 'Erro ao salvar o código de rastreio.' });
        }
    },
};
