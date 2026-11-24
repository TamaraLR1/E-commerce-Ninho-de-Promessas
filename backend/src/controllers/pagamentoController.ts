import { Request, Response } from 'express';
import { MercadoPagoConfig, Payment } from 'mercadopago';
import { prisma } from '../lib/prisma';
import { getIO } from '../socket';
import { formatarPedidoFiscal } from './notaFiscalController';
import { limparDocumento, validarCnpjAlfanumerico } from '../utils/documento';
import { enfileirarNfeDoPedido } from '../services/blingService';
import { processarFilaNfe } from '../jobs/nfeFilaWorker';

const mpAccessToken =
  process.env.MERCADOPAGO_ACCESS_TOKEN ||
  'APP_USR-6241648762325115-101109-22bbdb4d167baad86cf6c9f6f2776dc8-3529610690';
const client = new MercadoPagoConfig({ accessToken: mpAccessToken });
const paymentClient = new Payment(client);

// URL base do Backend em produção para o Webhook
const BACKEND_URL = process.env.BACKEND_URL || 'https://ninhoback.tamaralr.com.br';

function emitirEventoNotaFiscalPedido(pedido: any) {
  if (!pedido) return;
  const fiscal = formatarPedidoFiscal(pedido);
  const payload = { pedidoId: pedido.id, ...fiscal };

  const io = getIO();
  if (io) {
    if (pedido.userId) {
      io.to(`usuario_${pedido.userId}`).emit('notaFiscalAtualizada', payload);
    }
    io.emit('notaFiscalAtualizada', payload);
  }
}

async function enfileirarNfeAssincrona(pedidoId: string, origem: string) {
  try {
    const { pedido } = await enfileirarNfeDoPedido(pedidoId);
    emitirEventoNotaFiscalPedido(pedido);
    void processarFilaNfe();
  } catch (err: any) {
    console.error(
      `[NF-e Fila ${origem}] Falha ao enfileirar pedido ${pedidoId}:`,
      err?.response?.data || err?.message || err
    );
  }
}

function validarCPF(cpf: string): boolean {
  const cpfLimpo = cpf.replace(/\D/g, '');
  if (cpfLimpo.length !== 11 || /^(\d)\1{10}$/.test(cpfLimpo)) return false;

  let soma = 0;
  let resto: number;

  for (let i = 1; i <= 9; i++) {
    soma += parseInt(cpfLimpo.substring(i - 1, i), 10) * (11 - i);
  }
  resto = (soma * 10) % 11;
  if (resto === 10 || resto === 11) resto = 0;
  if (resto !== parseInt(cpfLimpo.substring(9, 10), 10)) return false;

  soma = 0;
  for (let i = 1; i <= 10; i++) {
    soma += parseInt(cpfLimpo.substring(i - 1, i), 10) * (12 - i);
  }
  resto = (soma * 10) % 11;
  if (resto === 10 || resto === 11) resto = 0;
  if (resto !== parseInt(cpfLimpo.substring(10, 11), 10)) return false;

  return true;
}

export const pagamentoController = {
  async processarPagamento(req: Request, res: Response) {
    try {
      // 1. Identifica o usuário autenticado na requisição
      const userIdLogado = (req as any).userId || (req as any).user?.id || (req as any).user?.userId;

      if (!userIdLogado) {
        return res.status(401).json({ message: 'Você precisa estar logado para finalizar a compra.' });
      }

      // 2. Busca os dados do usuário e da empresa (se houver) no banco de dados
      const user = await prisma.user.findUnique({
        where: { id: Number(userIdLogado) },
        include: {
          empresa: {
            include: { enderecoFiscal: true },
          },
        },
      });

      if (!user) {
        return res.status(404).json({ message: 'Usuário não encontrado.' });
      }

      const {
        pedidoParaRefazerId,
        faturarParaEmpresa,
        tipoFaturamento: tipoFaturamentoBody,
        enderecoFiscalId: enderecoFiscalIdBody,
        clienteNome: clienteNomeBody,
        clienteEmail: clienteEmailBody,
        clienteCpf: clienteCpfBody,
        clienteFone: clienteFoneBody,
        transaction_amount,
        token,
        description,
        installments,
        payment_method_id,
        issuer_id,
        items,
        subtotal,
        descontoCupom,
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

      const desejaPJ = Boolean(faturarParaEmpresa) || tipoFaturamentoBody === 'PJ';
      const usarPJ = Boolean(desejaPJ && user.empresa);

      if (desejaPJ && !user.empresa) {
        return res.status(400).json({
          message: 'Nenhuma empresa vinculada encontrada para faturamento em Pessoa Jurídica.',
        });
      }

      const cpfLimpo = user.cpf ? String(user.cpf).replace(/\D/g, '') : '';
      const cnpjLimpo = user.empresa?.cnpj ? limparDocumento(user.empresa.cnpj) : '';

      if (usarPJ) {
        if (!cnpjLimpo || !validarCnpjAlfanumerico(cnpjLimpo)) {
          return res.status(400).json({
            message: 'O CNPJ cadastrado na empresa é inválido. Verifique os dados da empresa para continuar.',
          });
        }
      } else {
        if (!cpfLimpo || !validarCPF(cpfLimpo)) {
          return res.status(400).json({
            message:
              'O CPF cadastrado na sua conta é inválido. Por favor, corrija o CPF em seus dados pessoais para continuar.',
          });
        }
      }

      const nomeCompletoUser = `${user.nome || ''} ${user.sobrenome || ''}`.trim();
      const snapshotTipoFaturamento: 'PF' | 'PJ' = usarPJ ? 'PJ' : 'PF';
      const snapshotClienteNome = usarPJ
        ? user.empresa!.razaoSocial
        : String(clienteNomeBody || nomeCompletoUser || 'Cliente').trim();
      const snapshotClienteNomeFantasia = usarPJ ? user.empresa!.nomeFantasia || null : null;
      const snapshotClienteCpf = usarPJ
        ? cnpjLimpo
        : String(clienteCpfBody || cpfLimpo || '').trim();
      const snapshotClienteIndicadorIE = usarPJ ? user.empresa!.indicadorIE : 'NAO_CONTRIBUINTE';
      const snapshotClienteInscricaoEstadual =
        usarPJ && user.empresa!.indicadorIE === 'CONTRIBUINTE'
          ? user.empresa!.inscricaoEstadual || null
          : null;
      const snapshotClienteEmail = String(clienteEmailBody || user.email || '').trim();
      const snapshotClienteFone = clienteFoneBody || user.telefone || null;

      let enderecoFiscalFinalId: string | null = null;
      if (enderecoFiscalIdBody) {
        enderecoFiscalFinalId = String(enderecoFiscalIdBody);
      } else if (usarPJ && user.empresa?.enderecoFiscalId) {
        enderecoFiscalFinalId = user.empresa.enderecoFiscalId;
      }

      const documentoCobrancaLimpo = usarPJ ? cnpjLimpo : cpfLimpo;

      // Recalcula subtotal no servidor com base nos itens enviados
      const subtotalCalculado = Number(
        items
          .reduce((acc: number, item: any) => {
            const precoUnit = Number(item.preco ?? item.precoUnitario ?? 0);
            const qtd = Number(item.quantidade ?? 0);
            return acc + precoUnit * qtd;
          }, 0)
          .toFixed(2)
      );

      const subtotalFinal =
        subtotal !== undefined && subtotal !== null ? Number(Number(subtotal).toFixed(2)) : subtotalCalculado;

      if (Math.abs(subtotalFinal - subtotalCalculado) > 0.02) {
        return res.status(400).json({
          message: 'O subtotal informado não corresponde aos itens selecionados. Atualize a conferência do pedido.',
        });
      }

      const descontoNum = Number(descontoCupom || 0);
      const freteNum = Number(valorFrete || 0);
      const totalCalculado = Number((Math.max(0, subtotalFinal - descontoNum) + freteNum).toFixed(2));
      const valorCobranca =
        transaction_amount !== undefined && transaction_amount !== null
          ? Number(Number(transaction_amount).toFixed(2))
          : totalCalculado;

      if (Math.abs(valorCobranca - totalCalculado) > 0.02) {
        return res.status(400).json({
          message: 'O valor total da cobrança divergiu do cálculo dos itens. Revise o pedido antes de pagar.',
        });
      }

      // Validação de valor mínimo para Cartão de Crédito (< R$ 1,00)
      const isCartaoCredito =
        payment_method_id === 'credit_card' || (payment_method_id && payment_method_id !== 'pix');

      if (isCartaoCredito && valorCobranca < 1.0) {
        return res.status(400).json({
          message: 'O valor mínimo para pagamentos com cartão de crédito é de R$ 1,00.',
        });
      }

      // -------------------------------------------------------------------------
      // 3. PRÉ-VALIDAÇÃO DE ESTOQUE ANTES DE COBRAR NO MERCADO PAGO
      // -------------------------------------------------------------------------
      const itensIndisponiveis: Array<{
        produtoId: string;
        nome: string;
        quantidadeSolicitada: number;
        quantidadeDisponivel: number;
      }> = [];

      const pedidoAntigoPre = pedidoParaRefazerId
        ? await prisma.pedido.findUnique({
            where: { id: String(pedidoParaRefazerId) },
            include: { itens: true },
          })
        : null;

      const reservaAntigaPorChave = new Map<string, number>();
      if (pedidoAntigoPre && (pedidoAntigoPre.status === 'PAGO' || pedidoAntigoPre.status === 'PENDENTE')) {
        for (const itemAntigo of pedidoAntigoPre.itens) {
          if (itemAntigo.produtoId) {
            const chave = `${String(itemAntigo.produtoId)}::${itemAntigo.tamanhoId ? String(itemAntigo.tamanhoId) : ''}::${
              itemAntigo.corId ? String(itemAntigo.corId) : ''
            }`;
            reservaAntigaPorChave.set(chave, (reservaAntigaPorChave.get(chave) || 0) + Number(itemAntigo.quantidade || 0));
          }
        }
      }

      for (const item of items) {
        if (item.produtoId) {
          const estoqueDisponivel = await prisma.produtoEstoque.findFirst({
            where: {
              produtoId: String(item.produtoId),
              ...(item.tamanhoId ? { tamanhoId: String(item.tamanhoId) } : {}),
              ...(item.corId ? { corId: String(item.corId) } : {}),
            },
          });

          const chave = `${String(item.produtoId)}::${item.tamanhoId ? String(item.tamanhoId) : ''}::${
            item.corId ? String(item.corId) : ''
          }`;
          const estoqueFisico = estoqueDisponivel ? Number(estoqueDisponivel.estoque || 0) : 0;
          const qtdEfetivaDisponivel = estoqueFisico + (reservaAntigaPorChave.get(chave) || 0);
          const qtdSol = Number(item.quantidade || 0);

          if (!estoqueDisponivel || qtdEfetivaDisponivel < qtdSol) {
            itensIndisponiveis.push({
              produtoId: String(item.produtoId),
              nome: item.nome || 'Item',
              quantidadeSolicitada: qtdSol,
              quantidadeDisponivel: qtdEfetivaDisponivel,
            });
          }
        }
      }

      if (itensIndisponiveis.length > 0) {
        return res.status(409).json({
          message: `Estoque insuficiente para: ${itensIndisponiveis.map((i) => i.nome).join(', ')}.`,
          itensIndisponiveis,
        });
      }

      // -------------------------------------------------------------------------
      // TRATATIVA DE REFAZER: Se houver um pedido anterior, cancela o pagamento antigo no MP
      // -------------------------------------------------------------------------
      if (pedidoParaRefazerId && pedidoAntigoPre?.mpPaymentId) {
        try {
          await paymentClient.cancel({ id: String(pedidoAntigoPre.mpPaymentId) });
          console.log(`Pagamento anterior ${pedidoAntigoPre.mpPaymentId} cancelado com sucesso no Mercado Pago.`);
        } catch (cancelErr) {
          console.warn(
            `Não foi possível cancelar o pagamento anterior ${pedidoAntigoPre.mpPaymentId} no MP:`,
            cancelErr
          );
        }
      }

      const isSandbox = mpAccessToken.startsWith('TEST-');

      const payerData: any = {
        email:
          isSandbox && payment_method_id === 'pix'
            ? 'TESTUSER312184413725449474@testuser.com'
            : snapshotClienteEmail || user.email,
        first_name: usarPJ ? snapshotClienteNome.trim().split(' ')[0] : (user.nome || 'Cliente').trim(),
        last_name: usarPJ
          ? snapshotClienteNome.trim().split(' ').slice(1).join(' ')
          : (user.sobrenome || '').trim(),
        identification: {
          type: usarPJ ? 'CNPJ' : 'CPF',
          number: documentoCobrancaLimpo,
        },
        address: {
          zip_code: String(endereco.cep).replace(/\D/g, ''),
          street_name: endereco.rua,
          street_number: String(endereco.numero),
          neighborhood: endereco.bairro,
          city: endereco.cidade,
          federal_unit: String(endereco.estado || '').trim().toUpperCase(),
        },
      };

      let paymentBody: any = {
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
      } else {
        const bandeiraFinal =
          payment_method_id && payment_method_id !== 'credit_card' ? payment_method_id : 'master';

        paymentBody = {
          ...paymentBody,
          transaction_amount: valorCobranca,
          token: token,
          description: description || 'Compra Ninho de Promessas',
          installments: Number(installments || 1),
          payment_method_id: bandeiraFinal,
          payer: payerData,
        };
        if (issuer_id) paymentBody.issuer_id = issuer_id;
      }

      let mpResponse;
      try {
        mpResponse = await paymentClient.create({ body: paymentBody });
      } catch (firstErr: any) {
        const isTokenErr = firstErr?.causes?.some(
          (c: any) => c.code === 2006 || String(c.description).includes('Card Token')
        );
        if (isTokenErr && paymentBody.payment_method_id && payment_method_id !== 'pix') {
          delete paymentBody.payment_method_id;
          mpResponse = await paymentClient.create({ body: paymentBody });
        } else {
          throw firstErr;
        }
      }

      let statusPedido: 'PENDENTE' | 'PAGO' | 'RECUSADO' = 'PENDENTE';
      if (mpResponse.status === 'approved') {
        statusPedido = 'PAGO';
      } else if (mpResponse.status === 'rejected') {
        statusPedido = 'RECUSADO';
      } else {
        statusPedido = 'PENDENTE';
      }

      // -------------------------------------------------------------------------
      // 4. TRANSAÇÃO PRISMA: ESTOQUE ATÔMICO, RESERVA E EXPIRAÇÃO
      // -------------------------------------------------------------------------
      const resultado = await prisma.$transaction(async (tx) => {
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

        if (statusPedido !== 'RECUSADO') {
          for (const item of items) {
            if (item.produtoId) {
              const qtdSol = Number(item.quantidade || 0);
              const atualizadoEstoque = await tx.produtoEstoque.updateMany({
                where: {
                  produtoId: String(item.produtoId),
                  ...(item.tamanhoId ? { tamanhoId: String(item.tamanhoId) } : {}),
                  ...(item.corId ? { corId: String(item.corId) } : {}),
                  estoque: { gte: qtdSol },
                },
                data: { estoque: { decrement: qtdSol } },
              });

              if (atualizadoEstoque.count === 0) {
                throw new Error(`Estoque insuficiente para o produto: ${item.nome || 'Item'}`);
              }
            }
          }
        }

        const expiraEm = new Date();
        if (payment_method_id === 'pix') {
          expiraEm.setMinutes(expiraEm.getMinutes() + 15);
        } else {
          expiraEm.setHours(expiraEm.getHours() + 48);
        }

        let enderecoExistente = await tx.endereco.findFirst({
          where: {
            userId: user.id,
            tipo: { in: ['ENTREGA', 'AMBOS'] },
          },
          orderBy: { createdAt: 'desc' },
        });

        if (!enderecoExistente) {
          enderecoExistente = await tx.endereco.findFirst({
            where: { userId: null },
            orderBy: { createdAt: 'desc' },
          });
        }

        let enderecoId: string;
        const dadosTratados = {
          tipo: 'ENTREGA' as const,
          cep: String(endereco.cep).replace(/\D/g, ''),
          rua: endereco.logradouro || endereco.rua,
          numero: String(endereco.numero),
          complemento: endereco.complemento || null,
          bairro: endereco.bairro,
          cidade: endereco.cidade,
          estado: String(endereco.estado || '').trim().toUpperCase(),
          destinatario: endereco.destinatario || snapshotClienteNome,
          userId: user.id,
        };

        if (enderecoExistente) {
          const enderecoAtualizado = await tx.endereco.update({
            where: { id: enderecoExistente.id },
            data: dadosTratados,
          });
          enderecoId = enderecoAtualizado.id;
        } else {
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
          ...(enderecoFiscalFinalId ? { enderecoFiscalId: enderecoFiscalFinalId } : {}),
          tipoFaturamento: snapshotTipoFaturamento,
          clienteNome: snapshotClienteNome,
          clienteNomeFantasia: snapshotClienteNomeFantasia,
          clienteEmail: snapshotClienteEmail,
          clienteCpf: snapshotClienteCpf,
          clienteIndicadorIE: snapshotClienteIndicadorIE,
          clienteInscricaoEstadual: snapshotClienteInscricaoEstadual,
          clienteFone: snapshotClienteFone,
          itens: {
            create: items.map((item: any) => ({
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
                  observacao:
                    'Tentativa de pagamento refeita. Status reativado para PENDENTE e estoque reservado novamente.',
                },
              },
            },
            include: { itens: true, endereco: true, enderecoFiscal: true, historicoStatus: true },
          });
        } else {
          pedidoFinal = await tx.pedido.create({
            data: {
              ...dadosPayloadPedido,
              userId: user.id,
              historicoStatus: {
                create: {
                  status: statusPedido,
                  observacao: 'Pedido criado. Estoque reservado temporariamente.',
                },
              },
            },
            include: { itens: true, endereco: true, enderecoFiscal: true, historicoStatus: true },
          });
        }

        return pedidoFinal;
      });

      if (resultado.status === 'PAGO') {
        await enfileirarNfeAssincrona(resultado.id, 'pagamento-imediato');
      }

      const io = getIO();
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
    } catch (error: any) {
      console.error('Erro detalhado ao processar pagamento:', JSON.stringify(error, null, 2));

      return res.status(400).json({
        message: error.message || 'Erro interno ao processar o pagamento e salvar o pedido.',
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

        const pedidoExistente = await prisma.pedido.findFirst({
          where: { mpPaymentId },
          include: { itens: true },
        });

        if (!pedidoExistente) return;

        if (pedidoExistente.status === 'CANCELADO') {
          if (paymentInfo.status === 'approved') {
            await prisma.historicoStatusPedido.create({
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

          await prisma.$transaction(async (tx) => {
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
            await enfileirarNfeAssincrona(pedidoExistente.id, 'webhook-mp');

            const io = getIO();
            if (io) {
              if (pedidoExistente.userId) {
                io.to(`usuario_${pedidoExistente.userId}`).emit('pedidoAtualizado', {
                  id: pedidoExistente.id,
                  status: 'PAGO',
                });
              }
              io.emit('pedidoAtualizado', { id: pedidoExistente.id, status: 'PAGO' });
            }
          }
        } else if (
          ['rejected', 'cancelled'].includes(String(paymentInfo.status)) &&
          pedidoExistente.status === 'PENDENTE'
        ) {
          const novoStatus = 'RECUSADO' as const;
          let foiRecusado = false;

          await prisma.$transaction(async (tx) => {
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

            if (atualizado.count === 0) return;
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
            const io = getIO();
            if (io) {
              if (pedidoExistente.userId) {
                io.to(`usuario_${pedidoExistente.userId}`).emit('pedidoAtualizado', {
                  id: pedidoExistente.id,
                  status: novoStatus,
                });
              }
              io.emit('pedidoAtualizado', { id: pedidoExistente.id, status: novoStatus });
            }
          }
        }
      }
    } catch (error) {
      console.error('Erro ao processar Webhook do Mercado Pago:', error);
    }
  },
};