import { Request, Response } from 'express';
import { MercadoPagoConfig, Payment } from 'mercadopago';
import { prisma } from '../lib/prisma';
import { getIO } from '../socket';
import { formatarPedidoFiscal } from './notaFiscalController';
import { limparDocumento, validarCnpjAlfanumerico } from '../utils/documento';
import { enfileirarNfeDoPedido } from '../services/blingService';

const mpAccessToken =
  process.env.MERCADOPAGO_ACCESS_TOKEN ||
  'APP_USR-6241648762325115-101109-22bbdb4d167baad86cf6c9f6f2776dc8-3529610690';
const client = new MercadoPagoConfig({ accessToken: mpAccessToken });
const paymentClient = new Payment(client);
const BACKEND_URL = process.env.BACKEND_URL || 'https://ninhoback.tamaralr.com.br';

async function enfileirarNfeAssincrona(pedidoId: string, origem: string) {
  try {
    await enfileirarNfeDoPedido(pedidoId);
  } catch (err: any) {
    console.error(
      `[NF-e Fila ${origem}] Falha ao enfileirar pedido ${pedidoId}:`,
      err?.response?.data || err?.message || err
    );
  }
}

export const pedidoController = {
  // 🛒 0. Método para Criar Pedido (ou Atualizar se vier de "Refazer Pagamento" via Checkout)
  async criarPedido(req: Request, res: Response) {
    try {
      const rawUserId = (req as any).user?.id || (req as any).userId || (req as any).user?.userId;
      const userId = rawUserId ? Number(rawUserId) : null;
      const {
        itens,
        enderecoId,
        enderecoFiscalId: enderecoFiscalIdBody,
        faturarParaEmpresa,
        tipoFaturamento: tipoFaturamentoBody,
        subtotal,
        valorTotal,
        valorFrete,
        servicoFrete,
        metodoPagamento,
        pedidoParaRefazerId,
        transaction_amount,
        token,
        installments,
        issuer_id,
        description,
        clienteNome: clienteNomeBody,
        clienteEmail: clienteEmailBody,
        clienteCpf: clienteCpfBody,
        clienteFone: clienteFoneBody,
      } = req.body;

      const freteFinal = Number(valorFrete || 0);
      const valorFinalPedido = Number(valorTotal || transaction_amount || 0);
      const subtotalFinal =
        subtotal !== undefined && subtotal !== null
          ? Number(subtotal)
          : Math.max(0, Number((valorFinalPedido - freteFinal).toFixed(2)));

      if (!itens || !Array.isArray(itens) || itens.length === 0) {
        return res.status(400).json({ message: 'O carrinho está vazio.' });
      }

      // Se for um pedido sendo refeito via checkout, vamos processar o pagamento e atualizar o pedido existente
      if (pedidoParaRefazerId) {
        const pedidoExistente = await prisma.pedido.findFirst({
          where: { id: String(pedidoParaRefazerId), userId: userId ? Number(userId) : undefined },
          include: { itens: true },
        });

        if (!pedidoExistente) {
          return res.status(404).json({ message: 'Pedido original para refazer não encontrado.' });
        }

        const user = userId
          ? await prisma.user.findUnique({ where: { id: Number(userId) } })
          : null;
        const isCartao = metodoPagamento === 'credit_card' || metodoPagamento !== 'pix';

        const docBruto = pedidoExistente.clienteCpf || user?.cpf || '';
        const documentoLimpo = limparDocumento(docBruto) || '00000000000';
        const isCnpj =
          (pedidoExistente as any).tipoFaturamento === 'PJ' || validarCnpjAlfanumerico(documentoLimpo);

        const paymentBody: any = {
          transaction_amount: Number(pedidoExistente.valorTotal),
          description: `Refazendo pagamento Pedido #${pedidoExistente.id.slice(0, 8)}`,
          notification_url: `${BACKEND_URL}/api/webhooks/mercadopago`,
          payer: {
            email: pedidoExistente.clienteEmail || user?.email || 'cliente@ninhodepromessas.com.br',
            first_name: (user?.nome || pedidoExistente.clienteNome || 'Cliente').trim().split(' ')[0],
            last_name: (user?.sobrenome || '').trim(),
            identification: {
              type: isCnpj ? 'CNPJ' : 'CPF',
              number: documentoLimpo,
            },
          },
        };

        if (isCartao) {
          paymentBody.payment_method_id = metodoPagamento !== 'credit_card' ? metodoPagamento : 'master';
          paymentBody.token = token;
          paymentBody.installments = Number(installments || 1);
          if (issuer_id) paymentBody.issuer_id = issuer_id;
        } else {
          paymentBody.payment_method_id = 'pix';
        }

        const mpResponse = await paymentClient.create({ body: paymentBody });
        const statusMapeado = mpResponse.status === 'approved' ? 'PAGO' : 'PENDENTE';

        const pedidoAtualizado = await prisma.pedido.update({
          where: { id: pedidoExistente.id },
          data: {
            mpPaymentId: String(mpResponse.id),
            status: statusMapeado,
            expiraEm: statusMapeado === 'PAGO' ? null : pedidoExistente.expiraEm,
            metodoPagamento: isCartao ? 'credit_card' : 'pix',
            createdAt: new Date(),
            historicoStatus: {
              create: {
                status: statusMapeado,
                observacao:
                  statusMapeado === 'PAGO'
                    ? 'Pagamento aprovado via Cartão de Crédito no Checkout.'
                    : 'Novo código PIX gerado no Checkout.',
              },
            },
          },
          include: {
            itens: true,
            historicoStatus: { orderBy: { data: 'asc' } },
            endereco: true,
            enderecoFiscal: true,
          },
        });

        if (statusMapeado === 'PAGO' && pedidoExistente.status !== 'PAGO') {
          await enfileirarNfeAssincrona(pedidoAtualizado.id, 'refazer-pagamento-cartao');
        }

        const io = getIO();
        if (io && userId) {
          io.to(`usuario_${userId}`).emit('pedidoAtualizado', pedidoAtualizado);
          io.emit('pedidoAtualizado', pedidoAtualizado);
        }

        return res.status(200).json({
          success: true,
          sucesso: true,
          pedido: {
            ...pedidoAtualizado,
            ...formatarPedidoFiscal(pedidoAtualizado),
            qrCodePix: mpResponse.point_of_interaction?.transaction_data?.qr_code,
            qrCodeBase64Pix: mpResponse.point_of_interaction?.transaction_data?.qr_code_base64,
          },
        });
      }

      // Busca dados do usuário e da empresa (se houver) para montar o snapshot fiscal corretamente
      const usuarioLogado = userId
        ? await prisma.user.findUnique({
            where: { id: Number(userId) },
            include: {
              empresa: {
                include: { enderecoFiscal: true },
              },
            },
          })
        : null;

      const desejaPJ = Boolean(faturarParaEmpresa) || tipoFaturamentoBody === 'PJ';
      const usarPJ = Boolean(desejaPJ && usuarioLogado?.empresa);

      if (desejaPJ && !usuarioLogado?.empresa) {
        return res.status(400).json({
          message: 'Nenhuma empresa vinculada encontrada para faturamento em Pessoa Jurídica.',
        });
      }

      const nomeCompletoUser = usuarioLogado
        ? `${usuarioLogado.nome || ''} ${usuarioLogado.sobrenome || ''}`.trim()
        : '';

      const snapshotTipoFaturamento: 'PF' | 'PJ' = usarPJ ? 'PJ' : 'PF';
      const snapshotClienteNome = usarPJ
        ? usuarioLogado!.empresa!.razaoSocial
        : String(clienteNomeBody || nomeCompletoUser || 'Cliente').trim();

      const snapshotClienteNomeFantasia = usarPJ
        ? usuarioLogado!.empresa!.nomeFantasia || null
        : null;

      const snapshotClienteCpf = usarPJ
        ? limparDocumento(usuarioLogado!.empresa!.cnpj)
        : String(clienteCpfBody || usuarioLogado?.cpf || '').replace(/\D/g, '');

      const snapshotClienteIndicadorIE = usarPJ
        ? usuarioLogado!.empresa!.indicadorIE
        : 'NAO_CONTRIBUINTE';

      const snapshotClienteInscricaoEstadual =
        usarPJ && usuarioLogado!.empresa!.indicadorIE === 'CONTRIBUINTE'
          ? usuarioLogado!.empresa!.inscricaoEstadual || null
          : null;

      const snapshotClienteEmail = String(
        clienteEmailBody || usuarioLogado?.email || ''
      ).trim();

      const snapshotClienteFone = clienteFoneBody || usuarioLogado?.telefone || null;

      let enderecoFiscalFinalId: string | null = null;

      if (enderecoFiscalIdBody) {
        enderecoFiscalFinalId = String(enderecoFiscalIdBody);
      } else if (usarPJ && usuarioLogado?.empresa?.enderecoFiscalId) {
        enderecoFiscalFinalId = usuarioLogado.empresa.enderecoFiscalId;
      }

      const novoPedido = await prisma.$transaction(async (tx) => {
        for (const item of itens) {
          const produtoId = String(item.produtoId || item.id);
          const corNome = item.corNome || 'Padrão';
          const tamanhoNome = item.tamanho || item.tamanhoNome || 'Único';
          const qtdSolicitada = Number(item.quantidade || 1);

          const produtoEstoque = await tx.produtoEstoque.findFirst({
            where: {
              produtoId,
              ...(item.corId
                ? { corId: String(item.corId) }
                : corNome !== 'Padrão'
                  ? { cor: { nome: corNome } }
                  : {}),
              ...(item.tamanhoId
                ? { tamanhoId: String(item.tamanhoId) }
                : { tamanho: { nome: tamanhoNome } }),
              ativo: true,
            },
            include: {
              produto: { select: { nome: true } },
            },
          });

          if (!produtoEstoque) {
            throw new Error(
              `A variação (Cor: ${corNome}, Tam: ${tamanhoNome}) não foi encontrada ou está indisponível.`
            );
          }

          const baixou = await tx.produtoEstoque.updateMany({
            where: {
              id: produtoEstoque.id,
              estoque: { gte: qtdSolicitada },
            },
            data: {
              estoque: { decrement: qtdSolicitada },
            },
          });

          if (baixou.count === 0) {
            const nomeProd = produtoEstoque.produto?.nome || 'Produto';
            throw new Error(
              `Ops! O item "${nomeProd}" (${corNome}/${tamanhoNome}) esgotou no estoque e não é mais possível concluir a compra.`
            );
          }
        }

        const pedidoCriado = await tx.pedido.create({
          data: {
            subtotal: subtotalFinal,
            valorFrete: freteFinal,
            valorTotal: Number(valorFinalPedido),
            servicoFrete: servicoFrete || 'Entrega Padrão',
            metodoPagamento: metodoPagamento || 'PIX',
            status: 'PENDENTE',

            // Snapshot do cliente / destinatário fiscal
            tipoFaturamento: snapshotTipoFaturamento,
            clienteNome: snapshotClienteNome,
            clienteNomeFantasia: snapshotClienteNomeFantasia,
            clienteEmail: snapshotClienteEmail,
            clienteCpf: snapshotClienteCpf,
            clienteIndicadorIE: snapshotClienteIndicadorIE,
            clienteInscricaoEstadual: snapshotClienteInscricaoEstadual,
            clienteFone: snapshotClienteFone,

            ...(userId && {
              user: { connect: { id: Number(userId) } },
            }),

            ...(enderecoId && {
              endereco: { connect: { id: String(enderecoId) } },
            }),

            ...(enderecoFiscalFinalId && {
              enderecoFiscal: { connect: { id: enderecoFiscalFinalId } },
            }),

            historicoStatus: {
              create: {
                status: 'PENDENTE',
                observacao: 'Pedido realizado aguardando confirmação de pagamento.',
              },
            },
            itens: {
              create: itens.map((i: any) => ({
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
            enderecoFiscal: true,
            historicoStatus: {
              orderBy: { data: 'asc' },
            },
          },
        });

        return pedidoCriado;
      });

      const io = getIO();
      if (io) {
        if (userId) {
          io.to(`usuario_${userId}`).emit('novoPedidoCriado', novoPedido);
        }
        io.emit('novoPedidoCriado', novoPedido);
      }

      return res.status(201).json({
        message: 'Pedido gerado com sucesso!',
        pedido: {
          ...novoPedido,
          ...formatarPedidoFiscal(novoPedido),
        },
      });
    } catch (error: any) {
      if (error?.message?.includes('estoque') || error?.message?.includes('variação')) {
        return res.status(400).json({ message: error.message });
      }
      console.error('Erro ao criar pedido:', error);
      return res.status(500).json({ message: 'Erro interno ao processar a criação do pedido.' });
    }
  },

  // 1. Método para o Painel Admin (Lista TODOS os pedidos da loja)
  async listarTodosPedidos(req: Request, res: Response) {
    try {
      const pedidos = await prisma.pedido.findMany({
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: { nome: true, sobrenome: true, email: true, telefone: true, cpf: true },
          },
          endereco: true,
          enderecoFiscal: true,
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

      const pedidosFormatados = pedidos.map((p: any) => ({
        id: p.id,
        codigoPedido: p.numeroPedido ? String(p.numeroPedido) : (p.codigoPedido || p.id.slice(0, 8)),

        tipoFaturamento: p.tipoFaturamento || 'PF',
        clienteNome: p.clienteNome || p.user?.nome || 'Cliente Não Identificado',
        clienteNomeFantasia: p.clienteNomeFantasia || '',
        clienteEmail: p.clienteEmail || p.user?.email || '',
        clienteTelefone: p.clienteFone || p.clienteTelefone || p.user?.telefone || p.telefone,
        cpf: p.clienteCpf || p.user?.cpf || p.cpf,
        clienteIndicadorIE: p.clienteIndicadorIE || null,
        clienteInscricaoEstadual: p.clienteInscricaoEstadual || null,

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

        ...formatarPedidoFiscal(p),

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

        enderecoFiscal: p.enderecoFiscal
          ? {
              logradouro: p.enderecoFiscal.rua || '',
              numero: p.enderecoFiscal.numero || '',
              complemento: p.enderecoFiscal.complemento || '',
              bairro: p.enderecoFiscal.bairro || '',
              cidade: p.enderecoFiscal.cidade || '',
              uf: p.enderecoFiscal.estado || '',
              cep: p.enderecoFiscal.cep || '',
            }
          : undefined,

        historicoStatus: p.historicoStatus || [],

        itens: (p.itens || []).map((i: any) => ({
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
    } catch (error) {
      console.error('Erro ao buscar todos os pedidos para o admin:', error);
      return res.status(500).json({ message: 'Erro ao buscar lista global de pedidos.' });
    }
  },

  // 2. Método para a Área do Cliente (listarMeusPedidos)
  async listarMeusPedidos(req: Request, res: Response) {
    try {
      const rawUserId = (req as any).user?.id || (req as any).userId || (req as any).user?.userId;

      if (!rawUserId) {
        return res.status(401).json({ message: 'Utilizador não autenticado.' });
      }

      const userId = Number(rawUserId);

      if (isNaN(userId)) {
        return res.status(400).json({ message: 'ID de utilizador inválido.' });
      }

      const pedidos = await prisma.pedido.findMany({
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
          enderecoFiscal: true,
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
        codigoPedido: (p as any).codigoPedido || ((p as any).numeroPedido ? String((p as any).numeroPedido) : p.id.slice(0, 8)),
        tipoFaturamento: (p as any).tipoFaturamento || 'PF',
        clienteNome: (p as any).clienteNome || '',
        clienteNomeFantasia: (p as any).clienteNomeFantasia || '',
        clienteCpf: (p as any).clienteCpf || '',
        clienteIndicadorIE: (p as any).clienteIndicadorIE || null,
        clienteInscricaoEstadual: (p as any).clienteInscricaoEstadual || null,
        status: p.status,
        total: Number((p as any).total || (p as any).valorTotal || 0),
        valorFrete: Number((p as any).valorFrete || (p as any).freteValor || 0),
        servicoFrete: (p as any).servicoFrete || (p as any).metodoFrete || 'Entrega Padrão',
        codigoRastreio: (p as any).codigoRastreio || (p as any).rastreioCodigo || '',
        createdAt: p.createdAt,

        ...formatarPedidoFiscal(p),

        historicoStatus: (p as any).historicoStatus || [],

        itens: p.itens.map((item: any) => {
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
    } catch (error) {
      console.error('Erro ao buscar pedidos do utilizador:', error);
      return res.status(500).json({ message: 'Erro ao buscar histórico de pedidos.' });
    }
  },

  // 3. Detalhes de um Pedido Específico
  async buscarPorId(req: Request, res: Response) {
    try {
      const id = String(req.params.id);

      const pedido = await prisma.pedido.findUnique({
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
          enderecoFiscal: true,
          user: true,
          historicoStatus: {
            orderBy: { data: 'asc' },
          },
        },
      });

      if (!pedido) {
        return res.status(404).json({ message: 'Pedido não encontrado.' });
      }

      return res.status(200).json({
        ...pedido,
        ...formatarPedidoFiscal(pedido),
      });
    } catch (error) {
      console.error('Erro ao buscar pedido por ID:', error);
      return res.status(500).json({ message: 'Erro interno ao buscar o pedido.' });
    }
  },

  // 4. Atualizar Status do Pedido
  async atualizarStatus(req: Request, res: Response) {
    try {
      const id = String(req.params.id);
      const { status, codigoRastreio, rastreioCodigo, observacao } = req.body;

      const codigoFinal = codigoRastreio || rastreioCodigo;

      const pedidoExistente = await prisma.pedido.findUnique({
        where: { id },
      });

      if (!pedidoExistente) {
        return res.status(404).json({ message: 'Pedido não encontrado.' });
      }

      const dataUpdate: any = {
        ...(codigoFinal && { codigoRastreio: codigoFinal }),
      };

      if (status && status !== pedidoExistente.status) {
        dataUpdate.status = status;
        if (status === 'PAGO') {
          dataUpdate.expiraEm = null;
        }
        dataUpdate.historicoStatus = {
          create: {
            status: status,
            observacao: observacao || `Status atualizado para ${status}`,
          },
        };
      }

      const pedidoAtualizado = await prisma.pedido.update({
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
          enderecoFiscal: true,
          historicoStatus: {
            orderBy: { data: 'asc' },
          },
        },
      });

      if (status === 'PAGO' && pedidoExistente.status !== 'PAGO') {
        await enfileirarNfeAssincrona(pedidoAtualizado.id, 'atualizar-status-admin');
      }

      const pedidoFormatado = {
        id: pedidoAtualizado.id,
        codigoPedido: (pedidoAtualizado as any).codigoPedido || ((pedidoAtualizado as any).numeroPedido ? String((pedidoAtualizado as any).numeroPedido) : pedidoAtualizado.id.slice(0, 8)),
        status: pedidoAtualizado.status,
        total: Number((pedidoAtualizado as any).total || (pedidoAtualizado as any).valorTotal || 0),
        valorFrete: Number((pedidoAtualizado as any).valorFrete || (pedidoAtualizado as any).freteValor || 0),
        servicoFrete: (pedidoAtualizado as any).servicoFrete || (pedidoAtualizado as any).metodoFrete || 'Entrega Padrão',
        codigoRastreio: (pedidoAtualizado as any).codigoRastreio || (pedidoAtualizado as any).rastreioCodigo || '',
        createdAt: pedidoAtualizado.createdAt,
        userId: pedidoAtualizado.userId,

        ...formatarPedidoFiscal(pedidoAtualizado),

        historicoStatus: (pedidoAtualizado as any).historicoStatus || [],

        itens: pedidoAtualizado.itens.map((item: any) => ({
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

      const io = getIO();
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
    } catch (error) {
      console.error('Erro ao atualizar status do pedido:', error);
      return res.status(500).json({ message: 'Erro ao atualizar o status do pedido.' });
    }
  },

  // 5. Atualizar Código de Rastreio
  async atualizarRastreio(req: Request, res: Response) {
    try {
      const id = String(req.params.id);
      const { rastreioCodigo, codigoRastreio } = req.body;

      const codigoFinal = rastreioCodigo || codigoRastreio;

      const pedidoAtualizado = await prisma.pedido.update({
        where: { id },
        data: {
          codigoRastreio: codigoFinal,
        },
      });

      const io = getIO();
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
    } catch (error) {
      console.error('Erro ao atualizar código de rastreio:', error);
      return res.status(500).json({ message: 'Erro ao salvar o código de rastreio.' });
    }
  },

  // 6. Atualizar Pagamento Existente (PIX direto no modal)
  async atualizarPagamentoExistente(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const userIdLogado = (req as any).userId || (req as any).user?.id || (req as any).user?.userId;

      const pedido = await prisma.pedido.findFirst({
        where: { id: String(id), userId: Number(userIdLogado) },
        include: { itens: true },
      });

      if (!pedido) return res.status(404).json({ message: 'Pedido não encontrado.' });

      const user = await prisma.user.findUnique({ where: { id: Number(userIdLogado) } });
      const docBruto = pedido.clienteCpf || user?.cpf || '';
      const documentoLimpo = limparDocumento(docBruto) || '00000000000';
      const isCnpj =
        (pedido as any).tipoFaturamento === 'PJ' || validarCnpjAlfanumerico(documentoLimpo);

      const paymentBody = {
        transaction_amount: Number(pedido.valorTotal),
        description: `Refazendo pagamento Pedido #${pedido.id.slice(0, 8)}`,
        notification_url: `${BACKEND_URL}/api/webhooks/mercadopago`,
        payment_method_id: 'pix',
        payer: {
          email: pedido.clienteEmail || user?.email || 'cliente@ninhodepromessas.com.br',
          first_name: (user?.nome || pedido.clienteNome || 'Cliente').trim().split(' ')[0],
          last_name: (user?.sobrenome || '').trim(),
          identification: {
            type: isCnpj ? 'CNPJ' : 'CPF',
            number: documentoLimpo,
          },
        },
      };

      const mpResponse = await paymentClient.create({ body: paymentBody });

      const pedidoAtualizado = await prisma.pedido.update({
        where: { id: pedido.id },
        data: {
          mpPaymentId: String(mpResponse.id),
          status: 'PENDENTE',
          metodoPagamento: 'pix',
          createdAt: new Date(),
          historicoStatus: {
            create: {
              status: 'PENDENTE',
              observacao: 'Novo código PIX gerado para nova tentativa de pagamento.',
            },
          },
        },
        include: { itens: true, historicoStatus: { orderBy: { data: 'asc' } } },
      });

      const io = getIO();
      if (io && userIdLogado) {
        io.to(`usuario_${Number(userIdLogado)}`).emit('pedidoAtualizado', pedidoAtualizado);
        io.emit('pedidoAtualizado', pedidoAtualizado);
      }

      return res.status(200).json({
        success: true,
        sucesso: true,
        pedido: {
          ...pedidoAtualizado,
          ...formatarPedidoFiscal(pedidoAtualizado),
          qrCodePix: mpResponse.point_of_interaction?.transaction_data?.qr_code,
          qrCodeBase64Pix: mpResponse.point_of_interaction?.transaction_data?.qr_code_base64,
        },
      });
    } catch (error: any) {
      console.error('Erro ao atualizar pagamento:', error);
      return res.status(500).json({ message: 'Erro ao processar pagamento.', error: error.message });
    }
  },
};