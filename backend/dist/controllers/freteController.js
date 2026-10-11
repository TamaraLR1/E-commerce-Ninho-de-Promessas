"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FreteController = void 0;
const prisma_1 = require("../lib/prisma"); // Ajuste o caminho do seu arquivo de prisma client se necessário
exports.FreteController = {
    async calcularFrete(req, res) {
        try {
            // 1. Aceita tanto 'products' quanto 'itens' enviados pelo frontend
            const { cepDestino } = req.body;
            const rawProducts = req.body.products || req.body.itens;
            if (!cepDestino || !rawProducts || !Array.isArray(rawProducts) || rawProducts.length === 0) {
                return res.status(400).json({ message: 'CEP de destino e lista de produtos são obrigatórios.' });
            }
            const cepLimpo = String(cepDestino).replace(/\D/g, '');
            if (cepLimpo.length !== 8) {
                return res.status(400).json({ message: 'CEP de destino inválido.' });
            }
            // 2. Extrai os IDs dos produtos
            const productIds = rawProducts
                .map((p) => String(p.id || p.produtoId || ''))
                .filter(Boolean);
            // 3. Busca os produtos no banco
            const produtosNoBanco = await prisma_1.prisma.produto.findMany({
                where: {
                    id: { in: productIds },
                },
            });
            // 4. Formata os produtos com cast seguro (as any) para evitar erros de tipagem no Prisma
            const produtosFormatados = rawProducts.map((prod) => {
                const prodId = String(prod.id || prod.produtoId || '');
                const dbProduct = produtosNoBanco.find((p) => String(p.id) === prodId);
                const precoEfetivo = dbProduct?.temOferta && Number(dbProduct?.precoPromocional) > 0
                    ? Number(dbProduct.precoPromocional)
                    : Number(dbProduct?.preco || prod.preco || 0);
                return {
                    id: prodId || '1',
                    width: Number(dbProduct?.largura || dbProduct?.width || prod.largura || 15),
                    height: Number(dbProduct?.altura || dbProduct?.height || prod.altura || 4),
                    length: Number(dbProduct?.comprimento || dbProduct?.length || prod.comprimento || 20),
                    weight: Number(dbProduct?.peso || dbProduct?.weight || prod.peso || 0.2),
                    insurance_value: precoEfetivo,
                    quantity: Number(prod.quantidade || 1),
                };
            });
            const bodyPayload = {
                from: {
                    postal_code: process.env.CEP_ORIGEM || '88130000',
                },
                to: {
                    postal_code: cepLimpo,
                },
                products: produtosFormatados,
            };
            const token = process.env.MELHOR_ENVIO_TOKEN?.trim();
            const url = process.env.MELHOR_ENVIO_URL || 'https://melhorenvio.com.br/api/v2/me/shipment/calculate';
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                    'User-Agent': 'NinhoDePromessas/1.0 (suporte@ninhodepromessas.com.br)',
                },
                body: JSON.stringify(bodyPayload),
            });
            if (!response.ok) {
                const errorText = await response.text();
                console.error('Erro na API do Melhor Envio:', errorText);
                return res.status(response.status).json({ message: 'Erro ao calcular frete no Melhor Envio.' });
            }
            const opcoesFrete = await response.json();
            // 5. Filtra opções válidas da Jadlog e SEDEX
            const opcoesValidas = opcoesFrete.filter((opcao) => {
                if (opcao.error || !opcao.price)
                    return false;
                const nomeEmpresa = opcao.company?.name?.toLowerCase() || '';
                const nomeServico = opcao.name?.toLowerCase() || '';
                const isJadlog = nomeEmpresa.includes('jadlog') && !nomeServico.includes('centralizado');
                const isSedex = nomeEmpresa.includes('correios') && nomeServico.includes('sedex');
                return isJadlog || isSedex;
            });
            // 6. Separa Jadlog e SEDEX
            const opcoesJadlog = opcoesValidas.filter((o) => o.company?.name?.toLowerCase().includes('jadlog'));
            const opcaoSedex = opcoesValidas.find((o) => o.company?.name?.toLowerCase().includes('correios'));
            const resultadoFinal = [];
            if (opcoesJadlog.length > 0) {
                const melhorJadlog = opcoesJadlog.reduce((menor, atual) => {
                    return Number(atual.price) < Number(menor.price) ? atual : menor;
                });
                resultadoFinal.push({
                    id: melhorJadlog.id,
                    name: 'Jadlog Express',
                    nome: 'Jadlog Express',
                    company: melhorJadlog.company.name,
                    empresa: melhorJadlog.company.name,
                    foto: melhorJadlog.company.picture,
                    price: String(melhorJadlog.price),
                    valor: Number(melhorJadlog.price),
                    custom_delivery_time: melhorJadlog.delivery_time,
                    prazo: `${melhorJadlog.delivery_time} dias úteis`,
                });
            }
            if (opcaoSedex) {
                resultadoFinal.push({
                    id: opcaoSedex.id,
                    name: opcaoSedex.name,
                    nome: opcaoSedex.name,
                    company: opcaoSedex.company.name,
                    empresa: opcaoSedex.company.name,
                    foto: opcaoSedex.company.picture,
                    price: String(opcaoSedex.price),
                    valor: Number(opcaoSedex.price),
                    custom_delivery_time: opcaoSedex.delivery_time,
                    prazo: `${opcaoSedex.delivery_time} dias úteis`,
                });
            }
            return res.status(200).json(resultadoFinal);
        }
        catch (error) {
            console.error('Erro interno ao calcular frete:', error);
            return res.status(500).json({ message: 'Erro interno ao calcular frete.' });
        }
    }
};
