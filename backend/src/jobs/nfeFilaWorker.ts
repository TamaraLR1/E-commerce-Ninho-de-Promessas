import { prisma } from '../lib/prisma';
import { getIO } from '../socket';
import { formatarPedidoFiscal } from '../controllers/notaFiscalController';
import {
  emitirNfeDoPedido,
  sincronizarNfeNoPedido,
} from '../services/blingService';
import { limparDocumento, validarCnpjAlfanumerico } from '../utils/documento';

let filaEmExecucao = false;
let workerIniciado = false;
let intervalId: NodeJS.Timeout | null = null;

const MAX_TENTATIVAS_TRANSITORIAS = 3;
const tentativasPorPedido = new Map<string, number>();

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function validarCpfBasico(cpf: string): boolean {
  const limpo = cpf.replace(/\D/g, '');
  if (limpo.length !== 11 || /^(\d)\1{10}$/.test(limpo)) return false;

  let soma = 0;
  for (let i = 1; i <= 9; i++) {
    soma += parseInt(limpo.substring(i - 1, i), 10) * (11 - i);
  }
  let resto = (soma * 10) % 11;
  if (resto === 10 || resto === 11) resto = 0;
  if (resto !== parseInt(limpo.substring(9, 10), 10)) return false;

  soma = 0;
  for (let i = 1; i <= 10; i++) {
    soma += parseInt(limpo.substring(i - 1, i), 10) * (12 - i);
  }
  resto = (soma * 10) % 11;
  if (resto === 10 || resto === 11) resto = 0;
  return resto === parseInt(limpo.substring(10, 11), 10);
}

export function validarPreRequisitosFiscais(pedido: any): string | null {
  if (!pedido) return 'Pedido não encontrado para emissão de NF-e.';

  if (pedido.status !== 'PAGO') {
    return `Pedido com status "${pedido.status}" não está apto para emissão de NF-e (exige status PAGO).`;
  }

  const docLimpo = limparDocumento(pedido.clienteCpf || '');
  const isPj = pedido.tipoFaturamento === 'PJ' || docLimpo.length === 14;
  const docValido = isPj
    ? validarCnpjAlfanumerico(docLimpo)
    : validarCpfBasico(docLimpo);

  if (!docValido) {
    return `Documento fiscal (${isPj ? 'CNPJ' : 'CPF'}) inválido ou ausente no pedido.`;
  }

  const end = pedido.enderecoFiscal || pedido.endereco;
  const cepLimpo = end?.cep ? String(end.cep).replace(/\D/g, '') : '';
  const rua = end?.rua || end?.logradouro || '';
  const numero = end?.numero ? String(end.numero).trim() : '';
  const bairro = end?.bairro ? String(end.bairro).trim() : '';
  const cidade = end?.cidade ? String(end.cidade).trim() : '';
  const uf = end?.estado || end?.uf || '';

  if (
    !end ||
    cepLimpo.length !== 8 ||
    !rua ||
    !numero ||
    !bairro ||
    !cidade ||
    String(uf).trim().length !== 2
  ) {
    return 'Endereço completo (CEP, logradouro, número, bairro, cidade e UF) é obrigatório para emitir NF-e.';
  }

  const itens = Array.isArray(pedido.itens) ? pedido.itens : [];
  if (itens.length === 0) {
    return 'Pedido sem itens para emissão de NF-e.';
  }

  const temItemInvalido = itens.some(
    (item: any) =>
      Number(item.quantidade || 0) <= 0 ||
      Number(item.precoUnitario ?? item.preco ?? 0) <= 0
  );
  if (temItemInvalido) {
    return 'Um ou mais itens do pedido possuem quantidade ou valor unitário inválido.';
  }

  return null;
}

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

function extrairMensagemErro(error: any): string {
  const apiDesc =
    error?.response?.data?.error?.description ||
    error?.response?.data?.error?.message ||
    error?.response?.data?.message;
  if (typeof apiDesc === 'string' && apiDesc.trim()) return apiDesc.trim();
  if (typeof error?.message === 'string' && error.message.trim()) {
    return error.message.trim();
  }
  return 'Falha ao comunicar com o Bling/SEFAZ na emissão da NF-e.';
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
        include: {
          itens: true,
          endereco: true,
          enderecoFiscal: true,
        },
      });

      if (!proximo) break;

      if (proximo.nfeStatus === 'AUTORIZADA' && proximo.chaveAcessoNfe) {
        tentativasPorPedido.delete(proximo.id);
        continue;
      }

      const erroPreRequisito = validarPreRequisitosFiscais(proximo);
      if (erroPreRequisito) {
        tentativasPorPedido.delete(proximo.id);
        const bloqueado = await prisma.pedido.update({
          where: { id: proximo.id },
          data: {
            nfeStatus: 'REJEITADA',
            nfeErroMensagem: erroPreRequisito,
          },
        });
        notificarAtualizacaoFiscal(bloqueado);
        await sleep(500);
        continue;
      }

      const reservou = await prisma.pedido.updateMany({
        where: {
          id: proximo.id,
          nfeStatus: 'FILA',
        },
        data: {
          nfeStatus: 'PROCESSANDO',
          nfeErroMensagem: null,
        },
      });

      if (reservou.count === 0) {
        continue;
      }

      const emProcessamento = await prisma.pedido.findUnique({
        where: { id: proximo.id },
      });
      notificarAtualizacaoFiscal(emProcessamento);

      try {
        const resultado = await emitirNfeDoPedido(proximo.id);
        tentativasPorPedido.delete(proximo.id);
        notificarAtualizacaoFiscal(resultado.pedido);
      } catch (err: any) {
        const mensagemErro = extrairMensagemErro(err);
        const transitorio = isErroTransitorio(err);
        const tentativaAtual = (tentativasPorPedido.get(proximo.id) || 0) + 1;

        if (transitorio && tentativaAtual < MAX_TENTATIVAS_TRANSITORIAS) {
          tentativasPorPedido.set(proximo.id, tentativaAtual);
          const recolocadoFila = await prisma.pedido.update({
            where: { id: proximo.id },
            data: {
              nfeStatus: 'FILA',
              nfeErroMensagem: `Tentativa ${tentativaAtual}/${MAX_TENTATIVAS_TRANSITORIAS} adiada por instabilidade temporária: ${mensagemErro}`,
            },
          });
          notificarAtualizacaoFiscal(recolocadoFila);
          await sleep(5000);
        } else {
          tentativasPorPedido.delete(proximo.id);
          const estadoAtual = await prisma.pedido.findUnique({
            where: { id: proximo.id },
          });

          if (estadoAtual && !(estadoAtual.nfeStatus === 'AUTORIZADA' && estadoAtual.chaveAcessoNfe)) {
            const rejeitado = await prisma.pedido.update({
              where: { id: proximo.id },
              data: {
                nfeStatus: 'REJEITADA',
                nfeErroMensagem: mensagemErro,
              },
            });
            notificarAtualizacaoFiscal(rejeitado);
          } else {
            notificarAtualizacaoFiscal(estadoAtual);
          }
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