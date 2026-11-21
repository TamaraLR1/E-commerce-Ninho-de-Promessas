"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pagamentoController = void 0;
const mercadopago_1 = require("mercadopago");
const prisma_1 = require("../lib/prisma");
const socket_1 = require("../socket");
const mpAccessToken = process.env.MERCADOPAGO_ACCESS_TOKEN || 'APP_USR-6241648762325115-101109-22bbdb4d167baad86cf6c9f6f2776dc8-3529610690';
const client = new mercadopago_1.MercadoPagoConfig({ accessToken: mpAccessToken });
const paymentClient = new mercadopago_1.Payment(client);
// URL base do Backend em produção para o Webhook
const BACKEND_URL = process.env.BACKEND_URL || 'https://ninhoback.tamaralr.com.br';
function validarCPF(cpf) {
    const cpfLimpo = cpf.replace(/\D/g, '');
    if (cpfLimpo.length !== 11 || /^(\d)\1{10}$/.test(cpfLimpo))
        return false;
    let soma = 0;
    let resto;
    for (let i = 1; i <= 9; i++) {
        soma += parseInt(cpfLimpo.substring(i - 1, i)) * (11 - i);
    }
    resto = (soma * 10) % 11;
    if (resto === 10 || resto === 11)
        resto = 0;
    if (resto !== parseInt(cpfLimpo.substring(9, 10)))
        return false;
    soma = 0;
    for (let i = 1; i <= 10; i++) {
        soma += parseInt(cpfLimpo.substring(i - 1, i)) * (12 - i);
    }
    resto = (soma * 10) % 11;
    if (resto === 10 || resto === 11)
        resto = 0;
    if (resto !== parseInt(cpfLimpo.substring(10, 11)))
        return false;
    return true;
}
exports.pagamentoController = {
    async processarPagamento(req, res) {
        try {
            // 1. Identifica o usuário autenticado na requisição
            const userIdLogado = req.userId || req.user?.id || req.user?.userId;
            if (!userIdLogado) {
                return res.status(401).json({ message: 'Você precisa estar logado para finalizar a compra.' });
            }
            // 2. Busca os dados do usuário no banco de dados
            const user = await prisma_1.prisma.user.findUnique({
                where: { id: Number(userIdLogado) },
            });
            if (!user) {
                return res.status(404).json({ message: 'Usuário não encontrado.' });
            }
            const { pedidoParaRefazerId, transaction_amount, token, description, installments, payment_method_id, issuer_id, items, subtotal, descontoCupom, valorFrete, servicoFrete, prazoEntrega, endereco, } = req.body;
            if (!items || !Array.isArray(items) || items.length === 0) {
                return res.status(400).json({ message: 'O pedido deve conter pelo menos um item.' });
            }
            if (!endereco || !endereco.cep || !endereco.rua || !endereco.numero) {
                return res.status(400).json({ message: 'Endereço de entrega incompleto.' });
            }
            // Validação prévia de algoritmo de CPF
            const cpfLimpo = user.cpf ? String(user.cpf).replace(/\D/g, '') : '';
            if (!cpfLimpo || !validarCPF(cpfLimpo)) {
                return res.status(400).json({
                    message: 'O CPF cadastrado na sua conta é inválido. Por favor, corrija o CPF em seus dados pessoais para continuar.'
                });
            }
            // Recalcula subtotal no servidor com base nos itens enviados
            const subtotalCalculado = Number(items.reduce((acc, item) => {
                const precoUnit = Number(item.preco ?? item.precoUnitario ?? 0);
                const qtd = Number(item.quantidade ?? 0);
                return acc + precoUnit * qtd;
            }, 0).toFixed(2));
            const subtotalFinal = subtotal !== undefined && subtotal !== null
                ? Number(Number(subtotal).toFixed(2))
                : subtotalCalculado;
            if (Math.abs(subtotalFinal - subtotalCalculado) > 0.02) {
                return res.status(400).json({
                    message: 'O subtotal informado não corresponde aos itens selecionados. Atualize a conferência do pedido.',
                });
            }
            const descontoNum = Number(descontoCupom || 0);
            const freteNum = Number(valorFrete || 0);
            const totalCalculado = Number((Math.max(0, subtotalFinal - descontoNum) + freteNum).toFixed(2));
            const valorCobranca = transaction_amount !== undefined && transaction_amount !== null
                ? Number(Number(transaction_amount).toFixed(2))
                : totalCalculado;
            if (Math.abs(valorCobranca - totalCalculado) > 0.02) {
                return res.status(400).json({
                    message: 'O valor total da cobrança divergiu do cálculo dos itens. Revise o pedido antes de pagar.',
                });
            }
            // Validação de valor mínimo para Cartão de Crédito (< R$ 1,00)
            const isCartaoCredito = payment_method_id === 'credit_card' || (payment_method_id && payment_method_id !== 'pix');
            if (isCartaoCredito && valorCobranca < 1.00) {
                return res.status(400).json({
                    message: 'O valor mínimo para pagamentos com cartão de crédito é de R$ 1,00.'
                });
            }
            // -------------------------------------------------------------------------
            // 3. PRÉ-VALIDAÇÃO DE ESTOQUE ANTES DE COBRAR NO MERCADO PAGO
            // -------------------------------------------------------------------------
            const itensIndisponiveis = [];
            await prisma_1.prisma.$transaction(async (tx) => {
                // Se estiver refazendo um pedido ativo, devolve temporariamente o estoque dele dentro da transação
                // para checar a disponibilidade real (se falhar, a transação faz rollback automático)
                if (pedidoParaRefazerId) {
                    const pedidoAntigo = await tx.pedido.findUnique({
                        where: { id: String(pedidoParaRefazerId) },
                        include: { itens: true },
                    });
                    if (pedidoAntigo && (pedidoAntigo.status === 'PAGO' || pedidoAntigo.status === 'PENDENTE')) {
                        for (const itemAntigo of pedidoAntigo.itens) {
                            if (itemAntigo.produtoId) {
                                await tx.produtoEstoque.updateMany({
                                    where: {
                                        produtoId: itemAntigo.produtoId,
                                        ...(itemAntigo.tamanhoId ? { tamanhoId: itemAntigo.tamanhoId } : {}),
                                        ...(itemAntigo.corId ? { corId: itemAntigo.corId } : {}),
                                    },
                                    data: { estoque: { increment: itemAntigo.quantidade } },
                                });
                            }
                        }
                    }
                }
                for (const item of items) {
                    if (item.produtoId) {
                        const estoqueDisponivel = await tx.produtoEstoque.findFirst({
                            where: {
                                produtoId: String(item.produtoId),
                                ...(item.tamanhoId ? { tamanhoId: String(item.tamanhoId) } : {}),
                                ...(item.corId ? { corId: String(item.corId) } : {}),
                            },
                        });
                        const qtdDisp = estoqueDisponivel ? Number(estoqueDisponivel.estoque || 0) : 0;
                        const qtdSol = Number(item.quantidade || 0);
                        if (!estoqueDisponivel || qtdDisp < qtdSol) {
                            itensIndisponiveis.push({
                                produtoId: String(item.produtoId),
                                nome: item.nome || 'Item',
                                quantidadeSolicitada: qtdSol,
                                quantidadeDisponivel: qtdDisp,
                            });
                        }
                    }
                }
            });
            if (itensIndisponiveis.length > 0) {
                return res.status(409).json({
                    message: `Estoque insuficiente para: ${itensIndisponiveis.map((i) => i.nome).join(', ')}.`,
                    itensIndisponiveis,
                });
            }
            // -------------------------------------------------------------------------
            // TRATATIVA DE REFAZER: Se houver um pedido anterior, cancela o pagamento antigo no MP
            // -------------------------------------------------------------------------
            if (pedidoParaRefazerId) {
                const pedidoAntigo = await prisma_1.prisma.pedido.findUnique({
                    where: { id: String(pedidoParaRefazerId) },
                });
                if (pedidoAntigo && pedidoAntigo.mpPaymentId) {
                    try {
                        await paymentClient.cancel({ id: String(pedidoAntigo.mpPaymentId) });
                        console.log(`Pagamento anterior ${pedidoAntigo.mpPaymentId} cancelado com sucesso no Mercado Pago.`);
                    }
                    catch (cancelErr) {
                        console.warn(`Não foi possível cancelar o pagamento anterior ${pedidoAntigo.mpPaymentId} no MP:`, cancelErr);
                    }
                }
            }
            const isSandbox = mpAccessToken.startsWith('TEST-');
            const payerData = {
                email: isSandbox && payment_method_id === 'pix'
                    ? 'TESTUSER312184413725449474@testuser.com'
                    : user.email,
                first_name: (user.nome || 'Cliente').trim(),
                last_name: (user.sobrenome || '').trim(),
                identification: {
                    type: 'CPF',
                    number: cpfLimpo,
                },
                address: {
                    zip_code: String(endereco.cep).replace(/\D/g, ''),
                    street_name: endereco.rua,
                    street_number: String(endereco.numero),
                    neighborhood: endereco.bairro,
                    city: endereco.cidade,
                    federal_unit: endereco.estado,
                },
            };
            let paymentBody = {
                notification_url: `${BACKEND_URL}/api/webhooks/mercadopago`,
            };
            if (payment_method_id === 'pix') {
                paymentBody = {
                    ...paymentBody,
                    transaction_amount: valorCobranca,
                    description: description || 'Compra Ninho de Promessas',
                    payment_method_id: 'pix',
                    payer: payerData,
                };
            }
            else {
                const bandeiraFinal = (payment_method_id && payment_method_id !== 'credit_card')
                    ? payment_method_id
                    : 'master';
                paymentBody = {
                    ...paymentBody,
                    transaction_amount: valorCobranca,
                    token: token,
                    description: description || 'Compra Ninho de Promessas',
                    installments: Number(installments || 1),
                    payment_method_id: bandeiraFinal,
                    payer: payerData,
                };
                if (issuer_id)
                    paymentBody.issuer_id = issuer_id;
            }
            let mpResponse;
            try {
                mpResponse = await paymentClient.create({ body: paymentBody });
            }
            catch (firstErr) {
                const isTokenErr = firstErr?.causes?.some((c) => c.code === 2006 || String(c.description).includes('Card Token'));
                if (isTokenErr && paymentBody.payment_method_id && payment_method_id !== 'pix') {
                    delete paymentBody.payment_method_id;
                    mpResponse = await paymentClient.create({ body: paymentBody });
                }
                else {
                    throw firstErr;
                }
            }
            let statusPedido = 'PENDENTE';
            if (mpResponse.status === 'approved') {
                statusPedido = 'PAGO';
            }
            else if (mpResponse.status === 'rejected') {
                statusPedido = 'RECUSADO';
            }
            else {
                statusPedido = 'PENDENTE';
            }
            // -------------------------------------------------------------------------
            // 4. TRANSAÇÃO PRISMA: ESTOQUE, RESERVA E EXPIRAÇÃO (15 min PIX / 48h Cartão)
            // -------------------------------------------------------------------------
            const resultado = await prisma_1.prisma.$transaction(async (tx) => {
                if (pedidoParaRefazerId) {
                    const pedidoAntigo = await tx.pedido.findUnique({
                        where: { id: String(pedidoParaRefazerId) },
                        include: { itens: true },
                    });
                    if (pedidoAntigo && (pedidoAntigo.status === 'PAGO' || pedidoAntigo.status === 'PENDENTE')) {
                        for (const itemAntigo of pedidoAntigo.itens) {
                            if (itemAntigo.produtoId) {
                                await tx.produtoEstoque.updateMany({
                                    where: {
                                        produtoId: itemAntigo.produtoId,
                                        ...(itemAntigo.tamanhoId ? { tamanhoId: itemAntigo.tamanhoId } : {}),
                                        ...(itemAntigo.corId ? { corId: itemAntigo.corId } : {}),
                                    },
                                    data: { estoque: { increment: itemAntigo.quantidade } },
                                });
                            }
                        }
                    }
                    await tx.itemPedido.deleteMany({ where: { pedidoId: String(pedidoParaRefazerId) } });
                }
                // Revalidação final dentro da transação antes de decrementar
                for (const item of items) {
                    if (item.produtoId) {
                        const estoqueDisponivel = await tx.produtoEstoque.findFirst({
                            where: {
                                produtoId: String(item.produtoId),
                                ...(item.tamanhoId ? { tamanhoId: String(item.tamanhoId) } : {}),
                                ...(item.corId ? { corId: String(item.corId) } : {}),
                            },
                        });
                        if (!estoqueDisponivel || estoqueDisponivel.estoque < Number(item.quantidade)) {
                            throw new Error(`Estoque insuficiente para o produto: ${item.nome || 'Item'}`);
                        }
                    }
                }
                if (statusPedido !== 'RECUSADO') {
                    for (const item of items) {
                        if (item.produtoId) {
                            await tx.produtoEstoque.updateMany({
                                where: {
                                    produtoId: String(item.produtoId),
                                    ...(item.tamanhoId ? { tamanhoId: String(item.tamanhoId) } : {}),
                                    ...(item.corId ? { corId: String(item.corId) } : {}),
                                },
                                data: { estoque: { decrement: Number(item.quantidade) } },
                            });
                        }
                    }
                }
                const expiraEm = new Date();
                if (payment_method_id === 'pix') {
                    expiraEm.setMinutes(expiraEm.getMinutes() + 15);
                }
                else {
                    expiraEm.setHours(expiraEm.getHours() + 48);
                }
                let enderecoExistente = await tx.endereco.findFirst({
                    where: { userId: user.id },
                    orderBy: { createdAt: 'desc' },
                });
                if (!enderecoExistente) {
                    enderecoExistente = await tx.endereco.findFirst({
                        where: { userId: null },
                        orderBy: { createdAt: 'desc' },
                    });
                }
                let enderecoId;
                const dadosTratados = {
                    cep: String(endereco.cep).replace(/\D/g, ''),
                    rua: endereco.logradouro || endereco.rua,
                    numero: String(endereco.numero),
                    complemento: endereco.complemento || null,
                    bairro: endereco.bairro,
                    cidade: endereco.cidade,
                    estado: endereco.estado,
                    destinatario: endereco.destinatario || `${user.nome} ${user.sobrenome}`,
                    userId: user.id,
                };
                if (enderecoExistente) {
                    const enderecoAtualizado = await tx.endereco.update({
                        where: { id: enderecoExistente.id },
                        data: dadosTratados,
                    });
                    enderecoId = enderecoAtualizado.id;
                }
                else {
                    const novoEndereco = await tx.endereco.create({ data: dadosTratados });
                    enderecoId = novoEndereco.id;
                }
                let pedidoFinal;
                const dadosPayloadPedido = {
                    status: statusPedido,
                    subtotal: subtotalFinal,
                    valorFrete: freteNum,
                    valorTotal: valorCobranca,
                    servicoFrete: servicoFrete || 'Padrão',
                    prazoEntrega: prazoEntrega || null,
                    metodoPagamento: payment_method_id,
                    mpPaymentId: String(mpResponse.id),
                    expiraEm: statusPedido === 'PAGO' ? null : expiraEm,
                    createdAt: new Date(),
                    enderecoId: enderecoId,
                    itens: {
                        create: items.map((item) => ({
                            produtoId: String(item.produtoId),
                            tamanhoId: item.tamanhoId ? String(item.tamanhoId) : null,
                            corId: item.corId ? String(item.corId) : null,
                            nomeProduto: item.nome || 'Produto',
                            precoUnitario: Number(item.preco ?? item.precoUnitario ?? 0),
                            quantidade: Number(item.quantidade),
                        })),
                    },
                };
                if (pedidoParaRefazerId) {
                    pedidoFinal = await tx.pedido.update({
                        where: { id: String(pedidoParaRefazerId) },
                        data: {
                            ...dadosPayloadPedido,
                            historicoStatus: {
                                create: {
                                    status: statusPedido,
                                    observacao: 'Tentativa de pagamento refeita. Status reativado para PENDENTE e estoque reservado novamente.',
                                },
                            },
                        },
                        include: { itens: true, endereco: true, historicoStatus: true },
                    });
                }
                else {
                    pedidoFinal = await tx.pedido.create({
                        data: {
                            ...dadosPayloadPedido,
                            clienteNome: `${user.nome} ${user.sobrenome}`,
                            clienteEmail: user.email,
                            clienteCpf: user.cpf,
                            clienteFone: user.telefone,
                            userId: user.id,
                            historicoStatus: {
                                create: {
                                    status: statusPedido,
                                    observacao: 'Pedido criado. Estoque reservado temporariamente.',
                                },
                            },
                        },
                        include: { itens: true, endereco: true, historicoStatus: true },
                    });
                }
                return pedidoFinal;
            });
            const io = (0, socket_1.getIO)();
            if (io) {
                io.emit(pedidoParaRefazerId ? 'pedidoAtualizado' : 'novoPedido', resultado);
            }
            return res.status(201).json({
                success: true,
                sucesso: true,
                pedido: resultado,
                mpStatus: mpResponse.status,
                qrCode: mpResponse.point_of_interaction?.transaction_data?.qr_code,
                qrCodeBase64: mpResponse.point_of_interaction?.transaction_data?.qr_code_base64,
            });
        }
        catch (error) {
            console.error('Erro detalhado ao processar pagamento:', JSON.stringify(error, null, 2));
            return res.status(400).json({
                message: error.message || 'Erro interno ao processar o pagamento e salvar o pedido.',
            });
        }
    },
    async webhookMercadoPago(req, res) {
        try {
            const paymentId = req.body?.data?.id ||
                req.body?.id ||
                req.query?.id ||
                req.query['data.id'];
            const topic = req.body?.type || req.body?.action || req.query?.topic;
            res.status(200).send('OK');
            if ((topic === 'payment' || topic === 'payment.updated' || !topic) && paymentId) {
                const mpPaymentId = String(paymentId);
                const paymentInfo = await paymentClient.get({ id: mpPaymentId });
                const pedidoExistente = await prisma_1.prisma.pedido.findFirst({
                    where: { mpPaymentId },
                    include: { itens: true },
                });
                if (!pedidoExistente)
                    return;
                if (pedidoExistente.status === 'CANCELADO') {
                    if (paymentInfo.status === 'approved') {
                        await prisma_1.prisma.historicoStatusPedido.create({
                            data: {
                                pedidoId: pedidoExistente.id,
                                status: 'CANCELADO',
                                observacao: `Pagamento ${mpPaymentId} aprovado no Mercado Pago após expiração do pedido. Pedido mantido como CANCELADO e estoque já devolvido; verificar estorno/atendimento.`,
                            },
                        });
                    }
                    return;
                }
                if (paymentInfo.status === 'approved' && pedidoExistente.status === 'PENDENTE') {
                    let foiAprovado = false;
                    await prisma_1.prisma.$transaction(async (tx) => {
                        const atualizado = await tx.pedido.updateMany({
                            where: {
                                id: pedidoExistente.id,
                                status: 'PENDENTE',
                            },
                            data: {
                                status: 'PAGO',
                                expiraEm: null,
                            },
                        });
                        if (atualizado.count > 0) {
                            foiAprovado = true;
                            await tx.historicoStatusPedido.create({
                                data: {
                                    pedidoId: pedidoExistente.id,
                                    status: 'PAGO',
                                    observacao: 'Pagamento aprovado via Webhook do Mercado Pago.',
                                },
                            });
                        }
                    });
                    if (foiAprovado) {
                        const io = (0, socket_1.getIO)();
                        if (io) {
                            io.emit('pedidoAtualizado', { id: pedidoExistente.id, status: 'PAGO' });
                        }
                    }
                }
                else if (['rejected', 'cancelled'].includes(String(paymentInfo.status)) && pedidoExistente.status === 'PENDENTE') {
                    const novoStatus = 'RECUSADO';
                    let foiRecusado = false;
                    await prisma_1.prisma.$transaction(async (tx) => {
                        const atualizado = await tx.pedido.updateMany({
                            where: {
                                id: pedidoExistente.id,
                                status: 'PENDENTE',
                            },
                            data: {
                                status: novoStatus,
                                expiraEm: null,
                            },
                        });
                        if (atualizado.count === 0)
                            return;
                        foiRecusado = true;
                        await tx.historicoStatusPedido.create({
                            data: {
                                pedidoId: pedidoExistente.id,
                                status: novoStatus,
                                observacao: `Pagamento ${paymentInfo.status === 'rejected' ? 'recusado' : 'cancelado/expirado'} pelo Mercado Pago.`,
                            },
                        });
                        for (const item of pedidoExistente.itens) {
                            if (item.produtoId) {
                                await tx.produtoEstoque.updateMany({
                                    where: {
                                        produtoId: item.produtoId,
                                        ...(item.tamanhoId ? { tamanhoId: item.tamanhoId } : {}),
                                        ...(item.corId ? { corId: item.corId } : {}),
                                    },
                                    data: { estoque: { increment: item.quantidade } },
                                });
                            }
                        }
                    });
                    if (foiRecusado) {
                        const io = (0, socket_1.getIO)();
                        if (io) {
                            io.emit('pedidoAtualizado', { id: pedidoExistente.id, status: novoStatus });
                        }
                    }
                }
            }
        }
        catch (error) {
            console.error('Erro ao processar Webhook do Mercado Pago:', error);
        }
    },
};
