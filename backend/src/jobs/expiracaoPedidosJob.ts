import cron from 'node-cron';
import { prisma } from '../lib/prisma';
import { getIO } from '../socket';
import { StatusPedido } from '@prisma/client';

export function iniciarWorkerExpiracaoPedidos() {
  // Roda a cada 1 minuto para verificar pedidos pendentes expirados (limite de 15 minutos)
  cron.schedule('* * * * *', async () => {
    try {
      const quinzeMinutosAtras = new Date(Date.now() - 15 * 60 * 1000);

      // Busca pedidos que ainda estão PENDENTE e foram criados há mais de 15 minutos
      const pedidosPendentes = await prisma.pedido.findMany({
        where: {
          status: StatusPedido.PENDENTE,
          createdAt: {
            lte: quinzeMinutosAtras,
          },
        },
        include: {
          itens: true,
        },
      });

      if (pedidosPendentes.length === 0) return;

      console.log(`⏱️ Worker: Encontrados ${pedidosPendentes.length} pedido(s) pendente(s) expirado(s) (> 15 min). Liberando estoque...`);

      const io = getIO();

      for (const pedido of pedidosPendentes) {
        await prisma.$transaction(async (tx) => {
          // 1. Atualiza o status do pedido para CANCELADO
          await tx.pedido.update({
            where: { id: pedido.id },
            data: { status: StatusPedido.CANCELADO },
          });

          // 2. Registra no histórico de status
          await tx.historicoStatusPedido.create({
            data: {
              pedidoId: pedido.id,
              status: StatusPedido.CANCELADO,
              observacao: 'Pedido cancelado automaticamente após 15 minutos sem confirmação de pagamento. Estoque liberado.',
            },
          });

          // 3. Devolve o estoque para a prateleira para cada item do pedido
          for (const item of pedido.itens) {
            await tx.produtoEstoque.updateMany({
              where: {
                produtoId: item.produtoId,
                tamanhoId: item.tamanhoId || null,
                corId: item.corId || null,
              },
              data: {
                estoque: { increment: item.quantidade },
              },
            });
          }
        });

        // Notifica via WebSocket se houver clientes conectados
        if (io) {
          io.emit('pedidoAtualizado', { id: pedido.id, status: StatusPedido.CANCELADO });
        }

        console.log(`✅ Pedido ${pedido.id} cancelado por expiração de tempo e estoque devolvido.`);
      }
    } catch (error) {
      console.error('❌ Erro no Worker de expiração de pedidos:', error);
    }
  });

  console.log('⏱️ Cron job de expiração de pedidos pendentes (15 min) iniciado com sucesso.');
}