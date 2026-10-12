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

  // 2. Método para a Área do Cliente
  async listarMeusPedidos(req: Request, res: Response) {
    try {
      const userId = Number((req as any).user?.id || (req as any).user?.userId);

      const pedidos = await prisma.pedido.findMany({
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
      const { status, codigoRastreio } = req.body;

      const pedidoAtualizado = await prisma.pedido.update({
        where: { id },
        data: {
          ...(status && { status }),
          ...(codigoRastreio && { codigoRastreio }),
        },
        include: {
          itens: true,
          endereco: true,
        },
      });

      const io = getIO();
      if (io) {
        io.emit('pedidoAtualizado', pedidoAtualizado);
      }

      return res.status(200).json({
        message: 'Status do pedido atualizado com sucesso!',
        pedido: pedidoAtualizado,
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