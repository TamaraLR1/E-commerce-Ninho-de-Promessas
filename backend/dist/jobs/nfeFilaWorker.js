"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.processarFilaNfe = processarFilaNfe;
exports.iniciarWorkerFilaNfe = iniciarWorkerFilaNfe;
exports.pararWorkerFilaNfe = pararWorkerFilaNfe;
const prisma_1 = require("../lib/prisma");
const socket_1 = require("../socket");
const notaFiscalController_1 = require("../controllers/notaFiscalController");
const blingService_1 = require("../services/blingService");
let filaEmExecucao = false;
let workerIniciado = false;
let intervalId = null;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function isErroTransitorio(error) {
    const status = error?.response?.status;
    const code = error?.code;
    return (status === 429 ||
        status === 502 ||
        status === 503 ||
        status === 504 ||
        code === 'ECONNRESET' ||
        code === 'ETIMEDOUT' ||
        code === 'ECONNABORTED');
}
function notificarAtualizacaoFiscal(pedido) {
    if (!pedido)
        return;
    const fiscal = (0, notaFiscalController_1.formatarPedidoFiscal)(pedido);
    const payload = { pedidoId: pedido.id, ...fiscal };
    const io = (0, socket_1.getIO)();
    if (io) {
        if (pedido.userId) {
            io.to(`usuario_${pedido.userId}`).emit('notaFiscalAtualizada', payload);
        }
        io.emit('notaFiscalAtualizada', payload);
    }
}
async function processarFilaNfe() {
    if (filaEmExecucao)
        return;
    filaEmExecucao = true;
    try {
        while (true) {
            const proximo = await prisma_1.prisma.pedido.findFirst({
                where: { nfeStatus: 'FILA' },
                orderBy: { updatedAt: 'asc' },
            });
            if (!proximo)
                break;
            const emProcessamento = await prisma_1.prisma.pedido.update({
                where: { id: proximo.id },
                data: { nfeStatus: 'PROCESSANDO' },
            });
            notificarAtualizacaoFiscal(emProcessamento);
            try {
                const resultado = await (0, blingService_1.emitirNfeDoPedido)(proximo.id);
                notificarAtualizacaoFiscal(resultado.pedido);
            }
            catch (err) {
                const estadoAtual = await prisma_1.prisma.pedido.findUnique({
                    where: { id: proximo.id },
                });
                notificarAtualizacaoFiscal(estadoAtual);
                if (isErroTransitorio(err)) {
                    await sleep(5000);
                }
            }
            await sleep(1200);
        }
    }
    finally {
        filaEmExecucao = false;
    }
}
function iniciarWorkerFilaNfe() {
    if (workerIniciado)
        return;
    workerIniciado = true;
    console.log('[Worker Fila NF-e] Iniciado.');
    void processarFilaNfe();
    intervalId = setInterval(async () => {
        try {
            await processarFilaNfe();
            const pendentesSync = await prisma_1.prisma.pedido.findMany({
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
                    const sincronizado = await (0, blingService_1.sincronizarNfeNoPedido)(item.id, item.blingNfeId);
                    notificarAtualizacaoFiscal(sincronizado);
                    await sleep(800);
                }
            }
        }
        catch (error) {
            console.error('[Worker Fila NF-e] Erro no ciclo periódico:', error);
        }
    }, 15000);
}
function pararWorkerFilaNfe() {
    if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
    }
    workerIniciado = false;
}
