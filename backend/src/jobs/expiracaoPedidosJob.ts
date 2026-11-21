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

      console.log(`⏱️ Worker: Encontrados ${pedidosExpirados.length} pedido(s) expirado(s). Liberando estoque...`);

      const io = getIO();

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
            if (item.produtoId) {
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
          }

          return true;
        });

        if (resultadoTx && io) {
          io.emit('pedidoAtualizado', { id: pedido.id, status: StatusPedido.CANCELADO });
          console.log(`✅ Pedido ${pedido.id} (${regraLabel}) cancelado por expiração e estoque devolvido.`);
        }
      }
    } catch (error) {
      console.error('❌ Erro no Worker de expiração de pedidos:', error);
    }
  });

  console.log('⏱️ Cron job de expiração de pedidos (15 min PIX / 48h Cartão) iniciado com sucesso.');
}