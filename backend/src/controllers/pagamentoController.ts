import { Request, Response } from 'express';
import { MercadoPagoConfig, Payment } from 'mercadopago';
import { prisma } from '../lib/prisma';
import { getIO } from '../socket';

const mpAccessToken = process.env.MERCADOPAGO_ACCESS_TOKEN || 'APP_USR-6241648762325115-101109-22bbdb4d167baad86cf6c9f6f2776dc8-3529610690';
const client = new MercadoPagoConfig({ accessToken: mpAccessToken });
const paymentClient = new Payment(client);

// URL base do Backend em produção para o Webhook
const BACKEND_URL = process.env.BACKEND_URL || 'https://ninhoback.tamaralr.com.br';

export const pagamentoController = {
  async processarPagamento(req: Request, res: Response) {
    try {
      // 1. Identifica o usuário autenticado na requisição
      const userIdLogado = (req as any).userId || (req as any).user?.id || (req as any).user?.userId;

      if (!userIdLogado) {
        return res.status(401).json({ message: 'Você precisa estar logado para finalizar a compra.' });
      }

      // 2. Busca os dados do usuário no banco de dados
      const user = await prisma.user.findUnique({
        where: { id: Number(userIdLogado) },
      });

      if (!user) {
        return res.status(404).json({ message: 'Usuário não encontrado.' });
      }

      const {
        transaction_amount,
        token,
        description,
        installments,
        payment_method_id,
        issuer_id,
        items,
        subtotal,
        valorFrete,
        servicoFrete,
        prazoEntrega,
        endereco,
      } = req.body;

      if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ message: 'O pedido deve conter pelo menos um item.' });
      }

      if (!endereco || !endereco.cep || !endereco.rua || !endereco.numero) {
        return res.status(400).json({ message: 'Endereço de entrega incompleto.' });
      }

      const cpfLimpo = user.cpf ? user.cpf.replace(/\D/g, '') : '';
      const isSandbox = mpAccessToken.startsWith('TEST-');

      let paymentBody: any = {
        notification_url: `${BACKEND_URL}/api/webhooks/mercadopago`,
      };

      if (payment_method_id === 'pix') {
        const emailPayerMp = isSandbox
          ? 'TESTUSER312184413725449474@testuser.com'
          : user.email;

        paymentBody = {
          ...paymentBody,
          transaction_amount: Number(transaction_amount),
          description: description || 'Compra Ninho de Promessas',
          payment_method_id: 'pix',
          payer: {
            email: emailPayerMp,
            first_name: (user.nome || 'Cliente').trim(),
            last_name: (user.sobrenome || '').trim(),
          },
        };
      } else {
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
          payer: {
            email: user.email,
            first_name: (user.nome || 'Cliente').trim(),
            last_name: (user.sobrenome || '').trim(),
            identification: {
              type: 'CPF',
              number: cpfLimpo,
            },
          },
        };
        if (issuer_id) paymentBody.issuer_id = issuer_id;
      }

      console.log('Payload enviado ao Mercado Pago:', JSON.stringify(paymentBody, null, 2));

      let mpResponse;
      try {
        mpResponse = await paymentClient.create({ body: paymentBody });
      } catch (firstErr: any) {
        const isTokenErr = firstErr?.causes?.some((c: any) => c.code === 2006 || String(c.description).includes('Card Token'));
        if (isTokenErr && paymentBody.payment_method_id && payment_method_id !== 'pix') {
          console.warn('Alerta 2006 detectado: tentando autorização do token sem payment_method_id explícito...');
          delete paymentBody.payment_method_id;
          mpResponse = await paymentClient.create({ body: paymentBody });
        } else {
          throw firstErr;
        }
      }

      // Mapeamento alterado para 'PAGO'
      let statusPedido: 'PENDENTE' | 'PAGO' | 'EM_PROCESSAMENTO' | 'RECUSADO' = 'PENDENTE';
      if (mpResponse.status === 'approved') statusPedido = 'PAGO';
      else if (mpResponse.status === 'in_process') statusPedido = 'EM_PROCESSAMENTO';
      else if (mpResponse.status === 'rejected') statusPedido = 'RECUSADO';

      // 3. Salva Endereço, Pedido e Itens em uma transação com o banco MySQL
      const resultado = await prisma.$transaction(async (tx) => {
        const novoEndereco = await tx.endereco.create({
          data: {
            cep: String(endereco.cep).replace(/\D/g, ''),
            rua: endereco.rua,
            numero: String(endereco.numero),
            complemento: endereco.complemento || null,
            bairro: endereco.bairro,
            cidade: endereco.cidade,
            estado: endereco.estado,
            destinatario: endereco.destinatario || `${user.nome} ${user.sobrenome}`,
            userId: user.id,
          },
        });

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
            enderecoId: novoEndereco.id,

            itens: {
              create: items.map((item: any) => ({
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

        // Decrementa estoque se o pedido for criado como PAGO
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

      // Emite evento via WebSocket para atualizar o painel admin em tempo real
      const io = getIO();
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
    } catch (error: any) {
      console.error('Erro detalhado ao processar pagamento:', JSON.stringify(error, null, 2));
      return res.status(500).json({
        message: 'Erro interno ao processar o pagamento e salvar o pedido.',
        error: error.message || error,
      });
    }
  },

  async webhookMercadoPago(req: Request, res: Response) {
    try {
      const paymentId = 
        req.body?.data?.id || 
        req.body?.id || 
        req.query?.id || 
        req.query['data.id'];

      const topic = req.body?.type || req.body?.action || req.query?.topic;

      res.status(200).send('OK');

      if ((topic === 'payment' || topic === 'payment.updated' || !topic) && paymentId) {
        const mpPaymentId = String(paymentId);
        const paymentInfo = await paymentClient.get({ id: mpPaymentId });

        if (paymentInfo.status === 'approved') {
          const pedidoExistente = await prisma.pedido.findFirst({
            where: { mpPaymentId },
            include: { itens: true },
          });

          // Atualizado para comparar e salvar como 'PAGO'
          if (pedidoExistente && pedidoExistente.status !== 'PAGO') {
            await prisma.$transaction(async (tx) => {
              // 1. Atualiza status do pedido para PAGO
              await tx.pedido.update({
                where: { id: pedidoExistente.id },
                data: { status: 'PAGO' },
              });

              // 2. Dá baixa no estoque
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

            // 3. Notifica via WebSocket
            const io = getIO();
            if (io) {
              io.emit('pedidoAtualizado', { id: pedidoExistente.id, status: 'PAGO' });
            }
          }
        }
      }
    } catch (error) {
      console.error('Erro ao processar Webhook do Mercado Pago:', error);
    }
  },
};