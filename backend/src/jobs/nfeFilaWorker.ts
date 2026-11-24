import { prisma } from '../lib/prisma';
import { getIO } from '../socket';
import { formatarPedidoFiscal } from '../controllers/notaFiscalController';
import {
  emitirNfeDoPedido,
  sincronizarNfeNoPedido,
} from '../services/blingService';

let filaEmExecucao = false;
let workerIniciado = false;
let intervalId: NodeJS.Timeout | null = null;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function isErroTransitorio(error: any): boolean {
  const status = error?.response?.status;
  const code = error?.code;
  return (
    status === 429 ||
    status === 502 ||
    status === 503 ||
    status === 504 ||
    code === 'ECONNRESET' ||
    code === 'ETIMEDOUT' ||
    code === 'ECONNABORTED'
  );
}

function notificarAtualizacaoFiscal(pedido: any) {
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

export async function processarFilaNfe(): Promise<void> {
  if (filaEmExecucao) return;
  filaEmExecucao = true;

  try {
    while (true) {
      const proximo = await prisma.pedido.findFirst({
        where: { nfeStatus: 'FILA' },
        orderBy: { updatedAt: 'asc' },
      });

      if (!proximo) break;

      const emProcessamento = await prisma.pedido.update({
        where: { id: proximo.id },
        data: { nfeStatus: 'PROCESSANDO' },
      });
      notificarAtualizacaoFiscal(emProcessamento);

      try {
        const resultado = await emitirNfeDoPedido(proximo.id);
        notificarAtualizacaoFiscal(resultado.pedido);
      } catch (err: any) {
        const estadoAtual = await prisma.pedido.findUnique({
          where: { id: proximo.id },
        });
        notificarAtualizacaoFiscal(estadoAtual);

        if (isErroTransitorio(err)) {
          await sleep(5000);
        }
      }

      await sleep(1200);
    }
  } finally {
    filaEmExecucao = false;
  }
}

export function iniciarWorkerFilaNfe(): void {
  if (workerIniciado) return;
  workerIniciado = true;

  console.log('[Worker Fila NF-e] Iniciado.');
  void processarFilaNfe();

  intervalId = setInterval(async () => {
    try {
      await processarFilaNfe();

      const pendentesSync = await prisma.pedido.findMany({
        where: {
          nfeStatus: 'PROCESSANDO',
          blingNfeId: { not: null },
        },
        take: 5,
        orderBy: { updatedAt: 'asc' },
        select: { id: true, blingNfeId: true },
      });

      for (const item of pendentesSync) {
        if (item.blingNfeId) {
          const sincronizado = await sincronizarNfeNoPedido(
            item.id,
            item.blingNfeId
          );
          notificarAtualizacaoFiscal(sincronizado);
          await sleep(800);
        }
      }
    } catch (error) {
      console.error('[Worker Fila NF-e] Erro no ciclo periódico:', error);
    }
  }, 15000);
}

export function pararWorkerFilaNfe(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
  workerIniciado = false;
}