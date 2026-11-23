"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.trocarCodePorToken = trocarCodePorToken;
exports.getValidBlingToken = getValidBlingToken;
exports.sincronizarNfeNoPedido = sincronizarNfeNoPedido;
exports.emitirNfeDoPedido = emitirNfeDoPedido;
const axios_1 = __importDefault(require("axios"));
const prisma_1 = require("../lib/prisma");
const documento_1 = require("../utils/documento");
const BLING_API_URL = 'https://api.bling.com.br/Api/v3';
const BLING_CLIENT_ID = process.env.BLING_CLIENT_ID;
const BLING_CLIENT_SECRET = process.env.BLING_CLIENT_SECRET;
const BLING_NATUREZA_ID = process.env.BLING_NATUREZA_OPERACAO_ID
    ? Number(process.env.BLING_NATUREZA_OPERACAO_ID)
    : undefined;
const BLING_NATUREZA_PJ_CONTRIBUINTE_ID = process.env.BLING_NATUREZA_PJ_CONTRIBUINTE_ID
    ? Number(process.env.BLING_NATUREZA_PJ_CONTRIBUINTE_ID)
    : BLING_NATUREZA_ID;
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
async function sincronizarNfeNoPedido(pedidoId, blingNfeId) {
    const token = await getValidBlingToken();
    const headers = {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
    };
    const detailRes = await axios_1.default.get(`${BLING_API_URL}/nfe/${blingNfeId}`, {
        headers,
    });
    const nfeData = detailRes.data?.data;
    const xmlUrl = nfeData?.linkXml || nfeData?.xml || null;
    let nfeStatus = 'PROCESSANDO';
    if (nfeData?.chaveAcesso) {
        nfeStatus = 'AUTORIZADA';
    }
    else if (nfeData?.situacao === 7 || nfeData?.situacao === 'REJEITADA') {
        nfeStatus = 'REJEITADA';
    }
    const pedidoAtualizado = await prisma_1.prisma.pedido.update({
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
    return pedidoAtualizado;
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
        const isPJ = pedido.tipoFaturamento === 'PJ' || documento.length === 14;
        const isPjContribuinte = isPJ &&
            Boolean(pedido.clienteInscricaoEstadual) &&
            pedido.clienteIndicadorIE === 'CONTRIBUINTE';
        const naturezaOperacaoId = isPjContribuinte
            ? BLING_NATUREZA_PJ_CONTRIBUINTE_ID
            : BLING_NATUREZA_ID;
        const contatoPayload = {
            nome: pedido.clienteNome,
            tipoPessoa: isPJ ? 'J' : 'F',
            numeroDocumento: documento,
            indicadorInscricaoEstadual: isPJ
                ? mapIndicadorIE(pedido.clienteIndicadorIE)
                : 9,
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
        if (isPJ && pedido.clienteInscricaoEstadual) {
            contatoPayload.ie = (0, documento_1.limparDocumento)(pedido.clienteInscricaoEstadual);
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
            tipo: 1, // 1 = Saída
            numeroPedidoLoja: String(pedido.numeroPedido),
            dataOperacao: new Date().toISOString().replace('T', ' ').slice(0, 19),
            finalidade: 1, // 1 = NF-e normal
            ...(naturezaOperacaoId
                ? { naturezaOperacao: { id: naturezaOperacaoId } }
                : {}),
            contato: contatoPayload,
            itens: itensPayload,
            transporte: {
                fretePorConta: 0, // 0 = Remetente (CIF)
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
        const createRes = await axios_1.default.post(`${BLING_API_URL}/nfe`, nfePayload, {
            headers,
        });
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
        await axios_1.default.post(`${BLING_API_URL}/nfe/${blingNfeId}/enviar`, {}, { headers });
        const pedidoAtualizado = await sincronizarNfeNoPedido(pedido.id, blingNfeId);
        return {
            jaEmitida: false,
            pedido: pedidoAtualizado,
        };
    }
    catch (error) {
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
