"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pedidoController = void 0;
const mercadopago_1 = require("mercadopago");
const prisma_1 = require("../lib/prisma");
const socket_1 = require("../socket");
const mpAccessToken = process.env.MERCADOPAGO_ACCESS_TOKEN || 'APP_USR-6241648762325115-101109-22bbdb4d167baad86cf6c9f6f2776dc8-3529610690';
const client = new mercadopago_1.MercadoPagoConfig({ accessToken: mpAccessToken });
const paymentClient = new mercadopago_1.Payment(client);
const BACKEND_URL = process.env.BACKEND_URL || 'https://ninhoback.tamaralr.com.br';
exports.pedidoController = {
    // 🛒 0. Método para Criar Pedido (ou Atualizar se vier de "Refazer Pagamento" via Checkout)
    async criarPedido(req, res) {
        try {
            const rawUserId = req.user?.id || req.userId || req.user?.userId;
            const userId = rawUserId ? Number(rawUserId) : null;
            const { itens, enderecoId, valorTotal, valorFrete, servicoFrete, metodoPagamento, pedidoParaRefazerId, transaction_amount, token, installments, issuer_id, description } = req.body;
            const valorFinalPedido = Number(valorTotal || transaction_amount || 0);
            if (!itens || !Array.isArray(itens) || itens.length === 0) {
                return res.status(400).json({ message: 'O carrinho está vazio.' });
            }
            // Se for um pedido sendo refeito via checkout, vamos processar o pagamento e atualizar o pedido existente
            if (pedidoParaRefazerId) {
                const pedidoExistente = await prisma_1.prisma.pedido.findFirst({
                    where: { id: String(pedidoParaRefazerId), userId: userId ? Number(userId) : undefined },
                    include: { itens: true }
                });
                if (!pedidoExistente) {
                    return res.status(404).json({ message: 'Pedido original para refazer não encontrado.' });
                }
                const user = await prisma_1.prisma.user.findUnique({ where: { id: Number(userId) } });
                const isCartao = metodoPagamento === 'credit_card' || metodoPagamento !== 'pix';
                let paymentBody = {
                    transaction_amount: Number(pedidoExistente.valorTotal),
                    description: `Refazendo pagamento Pedido #${pedidoExistente.id.slice(0, 8)}`,
                    notification_url: `${BACKEND_URL}/api/webhooks/mercadopago`,
                    payer: {
                        email: user?.email || 'cliente@ninhodepromessas.com.br',
                        first_name: (user?.nome || 'Cliente').trim(),
                        last_name: (user?.sobrenome || '').trim(),
                        identification: {
                            type: 'CPF',
                            number: user?.cpf ? String(user.cpf).replace(/\D/g, '') : '00000000000',
                        }
                    }
                };
                if (isCartao) {
                    paymentBody.payment_method_id = metodoPagamento !== 'credit_card' ? metodoPagamento : 'master';
                    paymentBody.token = token;
                    paymentBody.installments = Number(installments || 1);
                    if (issuer_id)
                        paymentBody.issuer_id = issuer_id;
                }
                else {
                    paymentBody.payment_method_id = 'pix';
                }
                const mpResponse = await paymentClient.create({ body: paymentBody });
                const statusMapeado = mpResponse.status === 'approved' ? 'PAGO' : 'PENDENTE';
                const pedidoAtualizado = await prisma_1.prisma.pedido.update({
                    where: { id: pedidoExistente.id },
                    data: {
                        mpPaymentId: String(mpResponse.id),
                        status: statusMapeado,
                        metodoPagamento: isCartao ? 'credit_card' : 'pix',
                        createdAt: new Date(),
                        historicoStatus: {
                            create: {
                                status: statusMapeado,
                                observacao: statusMapeado === 'PAGO'
                                    ? 'Pagamento aprovado via Cartão de Crédito no Checkout.'
                                    : 'Novo código PIX gerado no Checkout.'
                            }
                        }
                    },
                    include: { itens: true, historicoStatus: true, endereco: true }
                });
                const io = (0, socket_1.getIO)();
                if (io && userId) {
                    io.to(`usuario_${userId}`).emit('pedidoAtualizado', pedidoAtualizado);
                    io.emit('pedidoAtualizado', pedidoAtualizado);
                }
                return res.status(200).json({
                    success: true,
                    sucesso: true,
                    pedido: {
                        ...pedidoAtualizado,
                        qrCodePix: mpResponse.point_of_interaction?.transaction_data?.qr_code,
                        qrCodeBase64Pix: mpResponse.point_of_interaction?.transaction_data?.qr_code_base64,
                    }
                });
            }
            // Fluxo normal de criação de novo pedido
            const produtosParaAtualizarIds = new Set();
            for (const item of itens) {
                const produtoId = String(item.produtoId || item.id);
                const corNome = item.corNome || 'Padrão';
                const tamanhoNome = item.tamanho || item.tamanhoNome || 'Único';
                const qtdSolicitada = Number(item.quantidade || 1);
                const produtoEstoque = await prisma_1.prisma.produtoEstoque.findFirst({
                    where: {
                        produtoId,
                        cor: corNome !== 'Padrão' ? { nome: corNome } : undefined,
                        tamanho: { nome: tamanhoNome },
                        ativo: true,
                    },
                    include: {
                        produto: { select: { nome: true } },
                    },
                });
                if (!produtoEstoque) {
                    return res.status(400).json({
                        message: `A variação (Cor: ${corNome}, Tam: ${tamanhoNome}) não foi encontrada ou está indisponível.`,
                    });
                }
                if (produtoEstoque.estoque < qtdSolicitada) {
                    const nomeProd = produtoEstoque.produto?.nome || 'Produto';
                    return res.status(400).json({
                        message: `Ops! O item "${nomeProd}" (${corNome}/${tamanhoNome}) esgotou no stock e não é mais possível concluir a compra.`,
                        produtoId,
                        estoqueDisponivel: produtoEstoque.estoque,
                    });
                }
                produtosParaAtualizarIds.add(produtoId);
            }
            const novoPedido = await prisma_1.prisma.$transaction(async (tx) => {
                const pedidoCriado = await tx.pedido.create({
                    data: {
                        valorTotal: Number(valorFinalPedido),
                        valorFrete: Number(valorFrete || 0),
                        servicoFrete: servicoFrete || 'Entrega Padrão',
                        metodoPagamento: metodoPagamento || 'PIX',
                        status: 'PENDENTE',
                        ...(userId && {
                            user: { connect: { id: Number(userId) } },
                        }),
                        ...(enderecoId && {
                            endereco: { connect: { id: String(enderecoId) } },
                        }),
                        historicoStatus: {
                            create: {
                                status: 'PENDENTE',
                                observacao: 'Pedido realizado aguardando confirmação de pagamento.',
                            },
                        },
                        itens: {
                            create: itens.map((i) => ({
                                nomeProduto: String(i.nomeProduto || i.nome || 'Produto'),
                                quantidade: Number(i.quantidade),
                                precoUnitario: Number(i.precoUnitario || i.preco),
                                produto: {
                                    connect: { id: String(i.produtoId || i.id) },
                                },
                                ...(i.tamanhoId && {
                                    tamanho: { connect: { id: String(i.tamanhoId) } },
                                }),
                                ...(i.corId && {
                                    cor: { connect: { id: String(i.corId) } },
                                }),
                            })),
                        },
                    },
                    include: {
                        itens: true,
                        endereco: true,
                    },
                });
                for (const item of itens) {
                    const produtoId = String(item.produtoId || item.id);
                    const corNome = item.corNome || 'Padrão';
                    const tamanhoNome = item.tamanho || item.tamanhoNome || 'Único';
                    const qtdSolicitada = Number(item.quantidade || 1);
                    const estVar = await tx.produtoEstoque.findFirst({
                        where: {
                            produtoId,
                            cor: corNome !== 'Padrão' ? { nome: corNome } : undefined,
                            tamanho: { nome: tamanhoNome },
                        },
                    });
                    if (estVar) {
                        await tx.produtoEstoque.update({
                            where: { id: estVar.id },
                            data: {
                                estoque: {
                                    decrement: qtdSolicitada,
                                },
                            },
                        });
                    }
                }
                return pedidoCriado;
            });
            const io = (0, socket_1.getIO)();
            if (io) {
                if (userId) {
                    io.to(`usuario_${userId}`).emit('novoPedidoCriado', novoPedido);
                }
                io.emit('novoPedidoCriado', novoPedido);
            }
            return res.status(201).json({
                message: 'Pedido gerado com sucesso!',
                pedido: novoPedido,
            });
        }
        catch (error) {
            console.error('Erro ao criar pedido:', error);
            return res.status(500).json({ message: 'Erro interno ao processar a criação do pedido.' });
        }
    },
    // 1. Método para o Painel Admin (Lista TODOS os pedidos da loja)
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
                        orderBy: { data: 'asc' },
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
                    tamanhoId: i.tamanhoId || i.tamanho?.id || null,
                    corId: i.corId || i.cor?.id || null,
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
                return res.status(401).json({ message: 'Utilizador não autenticado.' });
            }
            const userId = Number(rawUserId);
            if (isNaN(userId)) {
                return res.status(400).json({ message: 'ID de utilizador inválido.' });
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
                        orderBy: { data: 'asc' },
                    },
                },
                orderBy: { createdAt: 'desc' },
            });
            if (!pedidos || pedidos.length === 0) {
                return res.status(200).json([]);
            }
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
                        tamanhoId: item.tamanhoId || item.tamanho?.id || null,
                        corId: item.corId || item.cor?.id || null,
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
            console.error('Erro ao buscar pedidos do utilizador:', error);
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
                        orderBy: { data: 'asc' },
                    },
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
                where: { id },
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
                        observacao: observacao || `Status atualizado para ${status}`,
                    },
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
                        orderBy: { data: 'asc' },
                    },
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
                    tamanhoId: item.tamanhoId || item.tamanho?.id || null,
                    corId: item.corId || item.cor?.id || null,
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
    // 6. Atualizar Pagamento Existente (PIX direto no modal)
    async atualizarPagamentoExistente(req, res) {
        try {
            const { id } = req.params;
            const { metodoPagamento } = req.body;
            const userIdLogado = req.userId || req.user?.id || req.user?.userId;
            const pedido = await prisma_1.prisma.pedido.findFirst({
                where: { id: String(id), userId: Number(userIdLogado) },
                include: { itens: true }
            });
            if (!pedido)
                return res.status(404).json({ message: 'Pedido não encontrado.' });
            const user = await prisma_1.prisma.user.findUnique({ where: { id: Number(userIdLogado) } });
            const paymentBody = {
                transaction_amount: Number(pedido.valorTotal),
                description: `Refazendo pagamento Pedido #${pedido.id.slice(0, 8)}`,
                notification_url: `${BACKEND_URL}/api/webhooks/mercadopago`,
                payment_method_id: 'pix',
                payer: {
                    email: user?.email || 'cliente@ninhodepromessas.com.br',
                    first_name: (user?.nome || 'Cliente').trim(),
                    last_name: (user?.sobrenome || '').trim(),
                    identification: {
                        type: 'CPF',
                        number: user?.cpf ? String(user.cpf).replace(/\D/g, '') : '00000000000',
                    }
                }
            };
            const mpResponse = await paymentClient.create({ body: paymentBody });
            const pedidoAtualizado = await prisma_1.prisma.pedido.update({
                where: { id: pedido.id },
                data: {
                    mpPaymentId: String(mpResponse.id),
                    status: 'PENDENTE',
                    metodoPagamento: 'pix',
                    createdAt: new Date(),
                    historicoStatus: {
                        create: {
                            status: 'PENDENTE',
                            observacao: 'Novo código PIX gerado para nova tentativa de pagamento.'
                        }
                    }
                },
                include: { itens: true, historicoStatus: true }
            });
            return res.status(200).json({
                success: true,
                sucesso: true,
                pedido: {
                    ...pedidoAtualizado,
                    qrCodePix: mpResponse.point_of_interaction?.transaction_data?.qr_code,
                    qrCodeBase64Pix: mpResponse.point_of_interaction?.transaction_data?.qr_code_base64,
                }
            });
        }
        catch (error) {
            console.error('Erro ao atualizar pagamento:', error);
            return res.status(500).json({ message: 'Erro ao processar pagamento.', error: error.message });
        }
    }
};
