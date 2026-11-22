import cron from 'node-cron';
import { prisma } from '../lib/prisma';
import { getIO } from '../socket';
import { StatusPedido } from '@prisma/client';

export function iniciarWorkerExpiracaoPedidos() {
  // Roda a cada 1 minuto para verificar reservas de estoque expiradas (15 min PIX / 48h Cartão)
  cron.schedule('* * * * *', async () => {
    try {
      const agora = new Date();
      const quinzeMinutosAtras = new Date(agora.getTime() - 15 * 60 * 1000);
      const quarentaEOitoHorasAtras = new Date(agora.getTime() - 48 * 60 * 60 * 1000);

      const pedidosExpirados = await prisma.pedido.findMany({
        where: {
          status: StatusPedido.PENDENTE,
          OR: [
            {
              expiraEm: {
                not: null,
                lte: agora,
              },
            },
            {
              expiraEm: null,
              metodoPagamento: 'pix',
              createdAt: { lte: quinzeMinutosAtras },
            },
            {
              expiraEm: null,
              metodoPagamento: { not: 'pix' },
              createdAt: { lte: quarentaEOitoHorasAtras },
            },
          ],
        },
        include: {
          itens: true,
        },
      });

      if (pedidosExpirados.length === 0) return;

      const io = getIO();
      let canceladosCount = 0;

      for (const pedido of pedidosExpirados) {
        const isPix = String(pedido.metodoPagamento || '').toLowerCase() === 'pix';
        const regraLabel = isPix ? '15 minutos (PIX)' : '48 horas (Cartão de Crédito)';

        // Garantia extra de transação: só cancela se ainda estiver PENDENTE
        const resultadoTx = await prisma.$transaction(async (tx) => {
          const atualizado = await tx.pedido.updateMany({
            where: {
              id: pedido.id,
              status: StatusPedido.PENDENTE,
            },
            data: {
              status: StatusPedido.CANCELADO,
              expiraEm: null,
            },
          });

          if (atualizado.count === 0) return false;

          await tx.historicoStatusPedido.create({
            data: {
              pedidoId: pedido.id,
              status: StatusPedido.CANCELADO,
              observacao: `Pedido cancelado automaticamente após expiração de ${regraLabel}. Reserva de estoque liberada.`,
            },
          });

          for (const item of pedido.itens) {
            if (item.produtoId && item.tamanhoId && item.corId && item.quantidade > 0) {
              await tx.produtoEstoque.updateMany({
                where: {
                  produtoId: item.produtoId,
                  tamanhoId: item.tamanhoId,
                  corId: item.corId,
                },
                data: {
                  estoque: { increment: item.quantidade },
                },
              });
            }
          }

          return true;
        });

        if (resultadoTx) {
          canceladosCount += 1;

          if (io) {
            const payloadEvento = { id: pedido.id, status: StatusPedido.CANCELADO };
            if (pedido.userId) {
              io.to(`usuario_${pedido.userId}`).emit('pedidoAtualizado', payloadEvento);
            }
            io.emit('pedidoAtualizado', payloadEvento);
          }

          console.log(`✅ Pedido ${pedido.id} (${regraLabel}) cancelado por expiração e estoque devolvido.`);
        }
      }

      if (canceladosCount > 0) {
        console.log(`⏱️ Worker: ${canceladosCount} pedido(s) expirado(s) processado(s).`);
      }
    } catch (error) {
      console.error('❌ Erro no Worker de expiração de pedidos:', error);
    }
  });

  console.log('⏱️ Cron job de expiração de pedidos (15 min PIX / 48h Cartão) iniciado com sucesso.');
}