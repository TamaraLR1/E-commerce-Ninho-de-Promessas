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
            const { transaction_amount, token, description, installments, payment_method_id, issuer_id, items, subtotal, valorFrete, servicoFrete, prazoEntrega, endereco, } = req.body;
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
            const isSandbox = mpAccessToken.startsWith('TEST-');
            // Monta o objeto payer com CPF e endereço completos
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
                    transaction_amount: Number(transaction_amount),
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
                    transaction_amount: Number(transaction_amount),
                    token: token,
                    description: description || 'Compra Ninho de Promessas',
                    installments: Number(installments || 1),
                    payment_method_id: bandeiraFinal,
                    payer: payerData,
                };
                if (issuer_id)
                    paymentBody.issuer_id = issuer_id;
            }
            console.log('Payload enviado ao Mercado Pago:', JSON.stringify(paymentBody, null, 2));
            let mpResponse;
            try {
                mpResponse = await paymentClient.create({ body: paymentBody });
            }
            catch (firstErr) {
                const isTokenErr = firstErr?.causes?.some((c) => c.code === 2006 || String(c.description).includes('Card Token'));
                if (isTokenErr && paymentBody.payment_method_id && payment_method_id !== 'pix') {
                    console.warn('Alerta 2006 detectado: tentando autorização do token sem payment_method_id explícito...');
                    delete paymentBody.payment_method_id;
                    mpResponse = await paymentClient.create({ body: paymentBody });
                }
                else {
                    throw firstErr;
                }
            }
            // Mapeamento do status do pedido com tipagem correta
            let statusPedido = 'PENDENTE';
            if (mpResponse.status === 'approved')
                statusPedido = 'PAGO';
            else if (mpResponse.status === 'in_process')
                statusPedido = 'EM_SEPARACAO';
            else if (mpResponse.status === 'rejected')
                statusPedido = 'RECUSADO';
            // 3. Salva ou Atualiza Endereço (evitando duplicações), Cria Pedido e Itens em uma transação
            const resultado = await prisma_1.prisma.$transaction(async (tx) => {
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
                    rua: endereco.rua,
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
                    const novoEndereco = await tx.endereco.create({
                        data: dadosTratados,
                    });
                    enderecoId = novoEndereco.id;
                }
                const novoPedido = await tx.pedido.create({
                    data: {
                        status: statusPedido,
                        subtotal: Number(subtotal || Number(transaction_amount) - (Number(valorFrete) || 0)),
                        valorFrete: Number(valorFrete || 0),
                        valorTotal: Number(transaction_amount),
                        servicoFrete: servicoFrete || 'Padrão',
                        prazoEntrega: prazoEntrega || null,
                        metodoPagamento: payment_method_id,
                        mpPaymentId: String(mpResponse.id),
                        clienteNome: `${user.nome} ${user.sobrenome}`,
                        clienteEmail: user.email,
                        clienteCpf: user.cpf,
                        clienteFone: user.telefone,
                        userId: user.id,
                        enderecoId: enderecoId,
                        itens: {
                            create: items.map((item) => ({
                                produtoId: String(item.produtoId),
                                tamanhoId: item.tamanhoId ? String(item.tamanhoId) : null,
                                corId: item.corId ? String(item.corId) : null,
                                nomeProduto: item.nome || 'Produto',
                                precoUnitario: Number(item.preco),
                                quantidade: Number(item.quantidade),
                            })),
                        },
                    },
                    include: {
                        itens: true,
                        endereco: true,
                    },
                });
                if (statusPedido === 'PAGO') {
                    for (const item of items) {
                        if (item.tamanhoId || item.corId) {
                            await tx.produtoEstoque.updateMany({
                                where: {
                                    produtoId: String(item.produtoId),
                                    tamanhoId: item.tamanhoId ? String(item.tamanhoId) : null,
                                    corId: item.corId ? String(item.corId) : null,
                                },
                                data: {
                                    estoque: { decrement: Number(item.quantidade) },
                                },
                            });
                        }
                    }
                }
                return novoPedido;
            });
            const io = (0, socket_1.getIO)();
            if (io) {
                io.emit('novoPedido', resultado);
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
            // Captura de erro específica para retornos de rejeição da API do Mercado Pago
            const isIdentificationErr = error?.causes?.some((c) => String(c.description).includes('identification') || c.code === 2060);
            if (isIdentificationErr || error?.message?.includes('identification')) {
                return res.status(400).json({
                    message: 'CPF inválido ou não reconhecido. Por favor, verifique se digitou seu CPF corretamente.',
                });
            }
            return res.status(500).json({
                message: 'Erro interno ao processar o pagamento e salvar o pedido.',
                error: error.message || error,
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
                if (paymentInfo.status === 'approved') {
                    const pedidoExistente = await prisma_1.prisma.pedido.findFirst({
                        where: { mpPaymentId },
                        include: { itens: true },
                    });
                    if (pedidoExistente && pedidoExistente.status !== 'PAGO') {
                        await prisma_1.prisma.$transaction(async (tx) => {
                            await tx.pedido.update({
                                where: { id: pedidoExistente.id },
                                data: { status: 'PAGO' },
                            });
                            for (const item of pedidoExistente.itens) {
                                if (item.tamanhoId || item.corId) {
                                    await tx.produtoEstoque.updateMany({
                                        where: {
                                            produtoId: item.produtoId,
                                            tamanhoId: item.tamanhoId,
                                            corId: item.corId,
                                        },
                                        data: {
                                            estoque: { decrement: item.quantidade },
                                        },
                                    });
                                }
                            }
                        });
                        const io = (0, socket_1.getIO)();
                        if (io) {
                            io.emit('pedidoAtualizado', { id: pedidoExistente.id, status: 'PAGO' });
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
