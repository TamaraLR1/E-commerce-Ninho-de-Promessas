import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { getIO } from '../socket';

export const pedidoController = {
  // 1. Método para o Painel Admin (Lista TODOS os pedidos da loja com as dimensões)
  async listarTodosPedidos(req: Request, res: Response) {
    try {
      const pedidos = await prisma.pedido.findMany({
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: { nome: true, email: true, telefone: true, cpf: true },
          },
          endereco: true,
          // --- ADICIONADO: Traz o histórico ordenado ---
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
      const pedidosFormatados = pedidos.map((p: any) => ({
        id: p.id,
        codigoPedido: p.numeroPedido ? String(p.numeroPedido) : (p.codigoPedido || p.id.slice(0, 8)),
        
        // Prioriza o nome completo salvo na tabela Pedido (clienteNome)
        clienteNome: p.clienteNome || p.user?.nome || 'Cliente Não Identificado',
        clienteEmail: p.clienteEmail || p.user?.email || '',
        clienteTelefone: p.clienteFone || p.clienteTelefone || p.user?.telefone || p.telefone,
        cpf: p.clienteCpf || p.user?.cpf || p.cpf,
        
        status: p.status, // 'PAGO', 'PENDENTE', etc
        total: Number(p.valorTotal ?? p.total ?? p.subtotal ?? 0),
        freteValor: Number(p.valorFrete ?? p.freteValor ?? 0),
        
        // Retorna o método de pagamento exato (PIX, Cartão de Crédito, Boleto, etc.)
        metodoPagamento: p.metodoPagamento || p.formaPagamento || 'PIX / Cartão',
        
        // Retorna a opção/serviço de frete gravado no banco (SEDEX, PAC, Jadlog, Retirar na Loja)
        servicoFrete: p.servicoFrete || p.metodoFrete || p.transportadora || 'Retirar na Loja',
        
        rastreioCodigo: p.codigoRastreio || p.rastreioCodigo || '',
        dataCriacao: p.createdAt || p.dataCriacao,
        
        // Dimensões do Pacote para o Melhor Envio
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
        
        // --- ADICIONADO: Envia o histórico para o frontend ---
        historicoStatus: p.historicoStatus || [],

        itens: (p.itens || []).map((i: any) => ({
          id: i.id,
          produtoId: i.produtoId,
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
      // Procura o ID em todas as propriedades possíveis do middleware
      const rawUserId = (req as any).user?.id || (req as any).userId || (req as any).user?.userId;

      if (!rawUserId) {
        return res.status(401).json({ message: 'Usuário não autenticado.' });
      }

      const userId = Number(rawUserId);

      if (isNaN(userId)) {
        return res.status(400).json({ message: 'ID de usuário inválido.' });
      }

      // Busca os pedidos do utilizador
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
          // --- ADICIONADO: Traz o histórico para a área do cliente também ---
          historicoStatus: {
            orderBy: { data: 'asc' }
          }
        },
        orderBy: { createdAt: 'desc' },
      });

      if (!pedidos || pedidos.length === 0) {
        return res.status(200).json([]);
      }

      // Formatação limpa para o Modal / Tela de Pedidos do Cliente
      const pedidosFormatados = pedidos.map((p) => ({
        id: p.id,
        codigoPedido: (p as any).codigoPedido || (p as any).numeroPedido ? String((p as any).numeroPedido) : p.id.slice(0, 8),
        status: p.status,
        total: Number((p as any).total || (p as any).valorTotal || 0),
        valorFrete: Number((p as any).valorFrete || (p as any).freteValor || 0),
        servicoFrete: (p as any).servicoFrete || (p as any).metodoFrete || 'Entrega Padrão',
        codigoRastreio: (p as any).codigoRastreio || (p as any).rastreioCodigo || '',
        createdAt: p.createdAt,
        
        // --- ADICIONADO: Envia o histórico formatado ---
        historicoStatus: (p as any).historicoStatus || [],

        itens: p.itens.map((item) => {
          const primeiraImagem = item.produto?.imagens?.[0]?.url || '';
          return {
            id: item.id,
            nomeProduto: item.produto?.nome || (item as any).nomeProduto || 'Produto',
            corNome: item.cor?.nome || (item as any).corNome || '',
            tamanho: item.tamanho?.nome || (item as any).tamanho || (item as any).tamanhoNome || '',
            quantidade: item.quantidade,
            precoUnitario: Number(item.precoUnitario),
            imagemUrl: primeiraImagem || (item as any).imagemUrl || '',
          };
        }),
      }));

      return res.status(200).json(pedidosFormatados);
    } catch (error) {
      console.error('Erro ao buscar pedidos do usuário:', error);
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
          user: true,
          // --- ADICIONADO ---
          historicoStatus: {
            orderBy: { data: 'asc' }
          }
        },
      });

      if (!pedido) {
        return res.status(404).json({ message: 'Pedido não encontrado.' });
      }

      return res.status(200).json(pedido);
    } catch (error) {
      console.error('Erro ao buscar pedido por ID:', error);
      return res.status(500).json({ message: 'Erro interno ao buscar o pedido.' });
    }
  },

  // 4. Atualizar Status do Pedido
  async atualizarStatus(req: Request, res: Response) {
    try {
      const id = String(req.params.id);
      // Recebe também a observação opcional
      const { status, codigoRastreio, rastreioCodigo, observacao } = req.body;

      const codigoFinal = codigoRastreio || rastreioCodigo;

      // Busca o pedido atual para verificar se o status realmente mudou
      const pedidoExistente = await prisma.pedido.findUnique({
        where: { id }
      });

      if (!pedidoExistente) {
        return res.status(404).json({ message: 'Pedido não encontrado.' });
      }

      // Monta os dados de atualização de forma dinâmica
      const dataUpdate: any = {
        ...(codigoFinal && { codigoRastreio: codigoFinal }),
      };

      // Se um status foi passado E é diferente do status atual, nós atualizamos o campo e criamos o histórico
      if (status && status !== pedidoExistente.status) {
        dataUpdate.status = status;
        dataUpdate.historicoStatus = {
          create: {
            status: status,
            observacao: observacao || `Status atualizado para ${status}`
          }
        };
      }

      // 1. Atualiza no Banco de Dados via Prisma
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
          // --- ADICIONADO: Traz o histórico atualizado na resposta ---
          historicoStatus: {
            orderBy: { data: 'asc' }
          }
        },
      });

      // 2. Formata a resposta para garantir compatibilidade com o front-end
      const pedidoFormatado = {
        id: pedidoAtualizado.id,
        codigoPedido: (pedidoAtualizado as any).codigoPedido || (pedidoAtualizado as any).numeroPedido ? String((pedidoAtualizado as any).numeroPedido) : pedidoAtualizado.id.slice(0, 8),
        status: pedidoAtualizado.status,
        total: Number((pedidoAtualizado as any).total || (pedidoAtualizado as any).valorTotal || 0),
        valorFrete: Number((pedidoAtualizado as any).valorFrete || (pedidoAtualizado as any).freteValor || 0),
        servicoFrete: (pedidoAtualizado as any).servicoFrete || (pedidoAtualizado as any).metodoFrete || 'Entrega Padrão',
        codigoRastreio: (pedidoAtualizado as any).codigoRastreio || (pedidoAtualizado as any).rastreioCodigo || '',
        createdAt: pedidoAtualizado.createdAt,
        userId: pedidoAtualizado.userId,
        
        // --- ADICIONADO ---
        historicoStatus: (pedidoAtualizado as any).historicoStatus || [],

        itens: pedidoAtualizado.itens.map((item) => ({
          id: item.id,
          nomeProduto: item.produto?.nome || (item as any).nomeProduto || 'Produto',
          corNome: item.cor?.nome || (item as any).corNome || '',
          tamanho: item.tamanho?.nome || (item as any).tamanho || '',
          quantidade: item.quantidade,
          precoUnitario: Number(item.precoUnitario),
          imagemUrl: item.produto?.imagens?.[0]?.url || (item as any).imagemUrl || '',
        })),
      };

      // 3. Emite os eventos via Socket.IO para atualizar o cliente e o admin em tempo real
      const io = getIO();
      if (io) {
        // Notifica o canal do usuário específico (ex: "usuario_123")
        if (pedidoAtualizado.userId) {
          io.to(`usuario_${pedidoAtualizado.userId}`).emit('pedidoAtualizado', pedidoFormatado);
        }
        
        // Broadcast geral para atualizar o Admin Dashboard e outros clientes conectados
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
};