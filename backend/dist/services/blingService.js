"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.trocarCodePorToken = trocarCodePorToken;
exports.getValidBlingToken = getValidBlingToken;
exports.sincronizarNfeNoPedido = sincronizarNfeNoPedido;
exports.enfileirarNfeDoPedido = enfileirarNfeDoPedido;
exports.enfileirarNfeEmLote = enfileirarNfeEmLote;
exports.emitirNfeDoPedido = emitirNfeDoPedido;
exports.processarFilaNfe = processarFilaNfe;
exports.iniciarWorkerFilaNfe = iniciarWorkerFilaNfe;
const axios_1 = __importDefault(require("axios"));
const prisma_1 = require("../lib/prisma");
const documento_1 = require("../utils/documento");
const BLING_API_URL = 'https://api.bling.com.br/Api/v3';
const BLING_CLIENT_ID = process.env.BLING_CLIENT_ID;
const BLING_CLIENT_SECRET = process.env.BLING_CLIENT_SECRET;
const BLING_NATUREZA_NAO_CONTRIBUINTE_ID = process.env
    .BLING_NATUREZA_NAO_CONTRIBUINTE_ID
    ? Number(process.env.BLING_NATUREZA_NAO_CONTRIBUINTE_ID)
    : process.env.BLING_NATUREZA_OPERACAO_ID
        ? Number(process.env.BLING_NATUREZA_OPERACAO_ID)
        : undefined;
const BLING_NATUREZA_PJ_CONTRIBUINTE_ID = process.env
    .BLING_NATUREZA_PJ_CONTRIBUINTE_ID
    ? Number(process.env.BLING_NATUREZA_PJ_CONTRIBUINTE_ID)
    : BLING_NATUREZA_NAO_CONTRIBUINTE_ID;
const BLING_NATUREZA_PJ_ISENTO_ID = process.env.BLING_NATUREZA_PJ_ISENTO_ID
    ? Number(process.env.BLING_NATUREZA_PJ_ISENTO_ID)
    : BLING_NATUREZA_NAO_CONTRIBUINTE_ID;
let refreshPromise = null;
let filaEmExecucao = false;
let workerIniciado = false;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function isErroTransitorioBling(error) {
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
async function executarComRetryBling(fn, tentativas = 4) {
    let atrasoMs = 2000;
    for (let tentativa = 1; tentativa <= tentativas; tentativa++) {
        try {
            return await fn();
        }
        catch (error) {
            if (!isErroTransitorioBling(error) || tentativa === tentativas) {
                throw error;
            }
            const retryAfterHeader = Number(error?.response?.headers?.['retry-after']);
            const espera = !Number.isNaN(retryAfterHeader) && retryAfterHeader > 0
                ? retryAfterHeader * 1000
                : atrasoMs;
            console.warn(`[Bling NF-e] Limite/instabilidade temporária (tentativa ${tentativa}/${tentativas}). Aguardando ${espera}ms...`);
            await sleep(espera);
            atrasoMs *= 2;
        }
    }
    throw new Error('Falha após tentativas no Bling.');
}
function getBasicAuthHeader() {
    const credentials = Buffer.from(`${BLING_CLIENT_ID}:${BLING_CLIENT_SECRET}`).toString('base64');
    return `Basic ${credentials}`;
}
function mapIndicadorIE(indicador) {
    if (indicador === 'CONTRIBUINTE')
        return 1;
    if (indicador === 'ISENTO')
        return 2;
    return 9; // NAO_CONTRIBUINTE
}
async function trocarCodePorToken(code) {
    const params = new URLSearchParams();
    params.append('grant_type', 'authorization_code');
    params.append('code', code);
    const response = await axios_1.default.post(`${BLING_API_URL}/oauth/token`, params, {
        headers: {
            Authorization: getBasicAuthHeader(),
            'Content-Type': 'application/x-www-form-urlencoded',
            Accept: 'application/json',
        },
    });
    const { access_token, refresh_token, expires_in } = response.data;
    const expiresAt = new Date(Date.now() + (Number(expires_in || 21600) - 300) * 1000);
    await prisma_1.prisma.blingToken.upsert({
        where: { id: 1 },
        update: {
            accessToken: access_token,
            refreshToken: refresh_token,
            expiresAt,
        },
        create: {
            id: 1,
            accessToken: access_token,
            refreshToken: refresh_token,
            expiresAt,
        },
    });
    return { access_token, expiresAt };
}
async function getValidBlingToken() {
    const tokenRecord = await prisma_1.prisma.blingToken.findUnique({
        where: { id: 1 },
    });
    if (!tokenRecord) {
        throw new Error('Bling não autorizado. Acesse o link de convite do app para gerar o token inicial.');
    }
    if (new Date() < tokenRecord.expiresAt) {
        return tokenRecord.accessToken;
    }
    if (refreshPromise) {
        return refreshPromise;
    }
    refreshPromise = (async () => {
        try {
            const params = new URLSearchParams();
            params.append('grant_type', 'refresh_token');
            params.append('refresh_token', tokenRecord.refreshToken);
            const response = await axios_1.default.post(`${BLING_API_URL}/oauth/token`, params, {
                headers: {
                    Authorization: getBasicAuthHeader(),
                    'Content-Type': 'application/x-www-form-urlencoded',
                    Accept: 'application/json',
                },
            });
            const { access_token, refresh_token, expires_in } = response.data;
            const expiresAt = new Date(Date.now() + (Number(expires_in || 21600) - 300) * 1000);
            await prisma_1.prisma.blingToken.update({
                where: { id: 1 },
                data: {
                    accessToken: access_token,
                    refreshToken: refresh_token,
                    expiresAt,
                },
            });
            return access_token;
        }
        finally {
            refreshPromise = null;
        }
    })();
    return refreshPromise;
}
async function sincronizarNfeNoPedido(pedidoId, blingNfeId) {
    const token = await getValidBlingToken();
    const headers = {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
    };
    const detailRes = await executarComRetryBling(() => axios_1.default.get(`${BLING_API_URL}/nfe/${blingNfeId}`, { headers }));
    const nfeData = detailRes.data?.data;
    const xmlUrl = nfeData?.linkXml || nfeData?.xml || null;
    let nfeStatus = 'PROCESSANDO';
    if (nfeData?.chaveAcesso) {
        nfeStatus = 'AUTORIZADA';
    }
    else if (nfeData?.situacao === 7 || nfeData?.situacao === 'REJEITADA') {
        nfeStatus = 'REJEITADA';
    }
    return prisma_1.prisma.pedido.update({
        where: { id: pedidoId },
        data: {
            blingNfeId: BigInt(blingNfeId),
            nfeNumero: nfeData?.numero ? String(nfeData.numero) : null,
            nfeSerie: nfeData?.serie ? String(nfeData.serie) : null,
            chaveAcessoNfe: nfeData?.chaveAcesso || null,
            nfeLinkDanfe: nfeData?.linkDanfe || null,
            nfeLinkXml: xmlUrl,
            nfeStatus,
            nfeErroMensagem: nfeStatus === 'AUTORIZADA'
                ? null
                : nfeData?.motivoRejeicao || nfeData?.mensagem || null,
        },
    });
}
async function enfileirarNfeDoPedido(pedidoId) {
    const pedido = await prisma_1.prisma.pedido.findUnique({
        where: { id: pedidoId },
        select: {
            id: true,
            numeroPedido: true,
            nfeStatus: true,
            chaveAcessoNfe: true,
        },
    });
    if (!pedido) {
        throw new Error(`Pedido ${pedidoId} não encontrado.`);
    }
    if (pedido.nfeStatus === 'AUTORIZADA' && pedido.chaveAcessoNfe) {
        return { jaEmitida: true, enfileirada: false, pedido };
    }
    const atualizado = await prisma_1.prisma.pedido.update({
        where: { id: pedidoId },
        data: {
            nfeStatus: 'FILA',
            nfeErroMensagem: null,
        },
    });
    void processarFilaNfe();
    return { jaEmitida: false, enfileirada: true, pedido: atualizado };
}
async function enfileirarNfeEmLote(pedidoIds) {
    const unicos = Array.from(new Set(pedidoIds.filter(Boolean)));
    if (unicos.length === 0)
        return { totalEnfileirados: 0 };
    const result = await prisma_1.prisma.pedido.updateMany({
        where: {
            id: { in: unicos },
            NOT: {
                AND: [
                    { nfeStatus: 'AUTORIZADA' },
                    { chaveAcessoNfe: { not: null } },
                ],
            },
        },
        data: {
            nfeStatus: 'FILA',
            nfeErroMensagem: null,
        },
    });
    void processarFilaNfe();
    return { totalEnfileirados: result.count };
}
async function emitirNfeDoPedido(pedidoId) {
    const pedido = await prisma_1.prisma.pedido.findUnique({
        where: { id: pedidoId },
        include: {
            endereco: true,
            enderecoFiscal: true,
            itens: {
                include: {
                    produto: true,
                    tamanho: true,
                    cor: true,
                },
            },
        },
    });
    if (!pedido) {
        throw new Error(`Pedido ${pedidoId} não encontrado.`);
    }
    if (pedido.nfeStatus === 'AUTORIZADA' && pedido.chaveAcessoNfe) {
        return {
            jaEmitida: true,
            pedido,
        };
    }
    try {
        const token = await getValidBlingToken();
        const headers = {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            Accept: 'application/json',
        };
        const end = pedido.enderecoFiscal || pedido.endereco;
        const documento = (0, documento_1.limparDocumento)(pedido.clienteCpf);
        const ieLimpa = (0, documento_1.limparDocumento)(pedido.clienteInscricaoEstadual);
        const isPJ = pedido.tipoFaturamento === 'PJ' || documento.length === 14;
        const indicadorIE = isPJ ? mapIndicadorIE(pedido.clienteIndicadorIE) : 9;
        const isPjContribuinte = isPJ && indicadorIE === 1 && Boolean(ieLimpa);
        let naturezaOperacaoId = BLING_NATUREZA_NAO_CONTRIBUINTE_ID;
        if (isPjContribuinte) {
            naturezaOperacaoId = BLING_NATUREZA_PJ_CONTRIBUINTE_ID;
        }
        else if (isPJ && indicadorIE === 2) {
            naturezaOperacaoId = BLING_NATUREZA_PJ_ISENTO_ID;
        }
        const contatoPayload = {
            nome: pedido.clienteNome,
            tipoPessoa: isPJ ? 'J' : 'F',
            numeroDocumento: documento,
            indicadorInscricaoEstadual: isPjContribuinte ? 1 : indicadorIE === 2 ? 2 : 9,
            email: pedido.clienteEmail,
            telefone: (0, documento_1.limparDocumento)(pedido.clienteFone),
            endereco: {
                endereco: end.rua,
                numero: end.numero || 'S/N',
                complemento: end.complemento || '',
                bairro: end.bairro,
                cep: (0, documento_1.limparDocumento)(end.cep),
                municipio: end.cidade,
                uf: String(end.estado || '').trim().toUpperCase(),
            },
        };
        if (isPjContribuinte) {
            contatoPayload.ie = ieLimpa;
        }
        const itensPayload = pedido.itens.map((item) => {
            const partesVariacao = [];
            if (item.cor?.nome)
                partesVariacao.push(`Cor: ${item.cor.nome}`);
            if (item.tamanho?.nome)
                partesVariacao.push(`Tam: ${item.tamanho.nome}`);
            const detalhesTexto = partesVariacao.join(' | ');
            const descricaoItem = detalhesTexto
                ? `${item.nomeProduto} - ${detalhesTexto}`
                : item.nomeProduto;
            return {
                codigo: item.produtoId.slice(0, 20),
                descricao: descricaoItem.slice(0, 120),
                unidade: 'UN',
                quantidade: Number(item.quantidade),
                valor: Number(item.precoUnitario),
                tipo: 'P',
                origem: Number(item.produto?.origem ?? 0),
                classificacaoFiscal: (0, documento_1.limparDocumento)(item.produto?.ncm) || '61112000',
                ...(detalhesTexto ? { informacoesAdicionais: detalhesTexto } : {}),
            };
        });
        const subtotalNum = Number(pedido.subtotal || 0);
        const freteNum = Number(pedido.valorFrete || 0);
        const totalNum = Number(pedido.valorTotal || 0);
        const descontoCalculado = Math.max(0, Number((subtotalNum + freteNum - totalNum).toFixed(2)));
        const nfePayload = {
            tipo: 1,
            numeroPedidoLoja: String(pedido.numeroPedido),
            dataOperacao: new Date().toISOString().replace('T', ' ').slice(0, 19),
            finalidade: 1,
            ...(naturezaOperacaoId
                ? { naturezaOperacao: { id: naturezaOperacaoId } }
                : {}),
            contato: contatoPayload,
            itens: itensPayload,
            transporte: {
                fretePorConta: 0,
                frete: freteNum,
                volumes: [
                    {
                        quantidade: 1,
                        especie: 'CAIXA',
                        pesoBruto: Number(pedido.pesoTotal ?? 0.3),
                        pesoLiquido: Number(pedido.pesoTotal ?? 0.3),
                    },
                ],
            },
            ...(descontoCalculado > 0 ? { desconto: descontoCalculado } : {}),
        };
        const createRes = await executarComRetryBling(() => axios_1.default.post(`${BLING_API_URL}/nfe`, nfePayload, { headers }));
        const blingNfeId = createRes.data?.data?.id;
        if (!blingNfeId) {
            throw new Error('Bling não retornou o ID da NF-e criada.');
        }
        await prisma_1.prisma.pedido.update({
            where: { id: pedido.id },
            data: {
                blingNfeId: BigInt(blingNfeId),
                nfeStatus: 'PROCESSANDO',
                nfeErroMensagem: null,
            },
        });
        await sleep(400);
        await executarComRetryBling(() => axios_1.default.post(`${BLING_API_URL}/nfe/${blingNfeId}/enviar`, {}, { headers }));
        await sleep(600);
        const pedidoAtualizado = await sincronizarNfeNoPedido(pedido.id, blingNfeId);
        return {
            jaEmitida: false,
            pedido: pedidoAtualizado,
        };
    }
    catch (error) {
        if (isErroTransitorioBling(error)) {
            console.warn(`[Bling NF-e] Erro transitório no pedido #${pedido.numeroPedido}. Mantendo em FILA para nova tentativa.`);
            await prisma_1.prisma.pedido.update({
                where: { id: pedido.id },
                data: {
                    nfeStatus: 'FILA',
                    nfeErroMensagem: 'Aguardando nova tentativa automática (limite de requisições ou instabilidade no Bling).',
                },
            });
            throw error;
        }
        const detalhesBling = error?.response?.data?.error?.fields ||
            error?.response?.data?.error?.description ||
            error?.response?.data ||
            error.message;
        const mensagemFormatada = typeof detalhesBling === 'string'
            ? detalhesBling
            : JSON.stringify(detalhesBling);
        console.error(`[Bling NF-e] Erro no pedido #${pedido.numeroPedido}:`, mensagemFormatada);
        await prisma_1.prisma.pedido.update({
            where: { id: pedido.id },
            data: {
                nfeStatus: 'REJEITADA',
                nfeErroMensagem: mensagemFormatada,
            },
        });
        throw error;
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
                select: { id: true, numeroPedido: true },
            });
            if (!proximo)
                break;
            await prisma_1.prisma.pedido.update({
                where: { id: proximo.id },
                data: { nfeStatus: 'PROCESSANDO' },
            });
            try {
                await emitirNfeDoPedido(proximo.id);
            }
            catch (err) {
                if (isErroTransitorioBling(err)) {
                    // Dá uma pausa maior se o Bling pediu respiro antes de pegar o próximo
                    await sleep(5000);
                }
            }
            // Cadência segura de ~1.2s entre emissões para respeitar o rate limit do Bling
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
    // Retoma imediatamente eventuais notas que ficaram em FILA antes de um restart
    void processarFilaNfe();
    // Varredura de segurança a cada 15s (também tenta sincronizar notas que ficaram em PROCESSANDO)
    setInterval(async () => {
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
                    await sincronizarNfeNoPedido(item.id, item.blingNfeId);
                    await sleep(800);
                }
            }
        }
        catch (error) {
            console.error('[Worker Fila NF-e] Erro no ciclo periódico:', error);
        }
    }, 15000);
}
