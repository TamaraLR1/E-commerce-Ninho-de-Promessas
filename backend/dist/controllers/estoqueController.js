"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.estoqueController = void 0;
const prisma_1 = require("../lib/prisma");
const socket_1 = require("../socket");
const produtoController_1 = require("./produtoController"); // Ou mova 'formatarProduto' para um arquivo utils/produto.ts
exports.estoqueController = {
    async listarMovimentacoes(req, res) {
        try {
            const movimentacoes = await prisma_1.prisma.movimentacaoEstoque.findMany({
                orderBy: { data: 'desc' },
                include: {
                    motivo: true, // Traz os dados da tabela relacionada de motivos
                    produto: true, // Traz os dados do produto
                    admin: true, // 👤 Traz os dados do administrador responsável
                },
            });
            // Trata as movimentações para exibir "Produto Removido" caso o produto tenha sido deletado
            const movimentacoesFormatadas = movimentacoes.map((m) => {
                // Se o produto foi excluído do banco, criamos um objeto 'produto' básico com a mensagem
                if (!m.produto) {
                    return {
                        ...m,
                        produto: {
                            nome: 'Produto Removido',
                        },
                    };
                }
                return m;
            });
            return res.status(200).json(movimentacoesFormatadas);
        }
        catch (error) {
            console.error('Erro ao listar movimentações:', error);
            return res.status(500).json({ message: 'Erro interno ao buscar movimentações.' });
        }
    },
    async criarMovimentacao(req, res) {
        try {
            const { produtoId, corNome, tamanho, tipo, quantidade, motivoId } = req.body;
            const rawAdminId = req.admin?.id || req.admin?.adminId || req.user?.id || req.user?.adminId;
            const adminId = rawAdminId ? Number(rawAdminId) : null;
            if (!produtoId || !tipo || !quantidade) {
                return res.status(400).json({ message: 'Campos obrigatórios ausentes.' });
            }
            if (!adminId) {
                return res.status(401).json({ message: 'Administrador não autenticado.' });
            }
            const corNomeFinal = corNome || 'Padrão';
            const tamanhoFinal = tamanho || 'Único';
            const qtdNumerica = Number(quantidade);
            const produtoEstoque = await prisma_1.prisma.produtoEstoque.findFirst({
                where: {
                    produtoId,
                    cor: { nome: corNomeFinal },
                    tamanho: { nome: tamanhoFinal }
                },
                include: {
                    produto: { select: { nome: true } }
                }
            });
            if (!produtoEstoque) {
                return res.status(404).json({ message: 'Variação de estoque não encontrada para este produto.' });
            }
            if (produtoEstoque.ativo === false) {
                return res.status(400).json({
                    message: 'Não é permitido realizar movimentações para variações inativas.'
                });
            }
            if (tipo === 'SAIDA' && produtoEstoque.estoque < qtdNumerica) {
                return res.status(400).json({ message: 'Estoque insuficiente para esta saída.' });
            }
            const nomeProdutoLog = produtoEstoque.produto?.nome || 'Produto';
            // 1. Executa a movimentação, atualização de estoque e log
            const [novaMovimentacao] = await prisma_1.prisma.$transaction([
                prisma_1.prisma.movimentacaoEstoque.create({
                    data: {
                        produtoId,
                        corNome: corNomeFinal,
                        tamanho: tamanhoFinal,
                        tipo,
                        quantidade: qtdNumerica,
                        motivoId: motivoId || null,
                        adminId: Number(adminId),
                    },
                    include: {
                        admin: true,
                        motivo: true,
                    }
                }),
                prisma_1.prisma.produtoEstoque.update({
                    where: { id: produtoEstoque.id },
                    data: {
                        estoque: {
                            [tipo === 'ENTRADA' ? 'increment' : 'decrement']: qtdNumerica
                        }
                    }
                }),
                prisma_1.prisma.logAtividade.create({
                    data: {
                        adminId: Number(adminId),
                        acao: `Registrou uma ${tipo.toLowerCase()} de ${qtdNumerica} un. no produto "${nomeProdutoLog}" (Cor: ${corNomeFinal}, Tam: ${tamanhoFinal})`
                    }
                })
            ]);
            // 2. BUSCA O PRODUTO COMPLETO ATUALIZADO (com estoques, tamanhos, cores e vendas)
            const produtoAtualizado = await prisma_1.prisma.produto.findUnique({
                where: { id: produtoId },
                include: {
                    categoria: true,
                    imagens: { include: { cor: true }, orderBy: { ordem: 'asc' } },
                    estoques: { include: { tamanho: true, cor: true } },
                    criadoPor: true,
                    atualizadoPor: true,
                    itemPedidos: {
                        where: { pedido: { status: 'PAGO' } },
                        select: { quantidade: true }
                    }
                }
            });
            // 3. EMITE O EVENTO SOCKET COM O PRODUTO FORMATADO
            if (produtoAtualizado) {
                const produtoFormatado = (0, produtoController_1.formatarProduto)(produtoAtualizado);
                const io = (0, socket_1.getIO)() || req.io;
                if (io) {
                    io.emit('produtoAtualizado', produtoFormatado);
                    io.emit('produto-atualizado', produtoFormatado);
                }
            }
            return res.status(201).json(novaMovimentacao);
        }
        catch (error) {
            console.error('Erro ao criar movimentação:', error);
            return res.status(500).json({ message: 'Erro interno ao salvar movimentação.' });
        }
    },
    async obterDashboard(req, res) {
        try {
            // 1. Total de variações de produtos ativas no estoque
            const totalProdutosEstoque = await prisma_1.prisma.produtoEstoque.count({
                where: { ativo: true }
            });
            // 2. Quantidade física total real
            const estoqueAgregado = await prisma_1.prisma.produtoEstoque.aggregate({
                where: { ativo: true },
                _sum: { estoque: true }
            });
            const quantidadeFisicaTotal = estoqueAgregado._sum.estoque || 0;
            // 3. Contagem de movimentações do mês atual para os cards e gráfico diário
            const inicioDoMes = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
            const movimentacoesMes = await prisma_1.prisma.movimentacaoEstoque.findMany({
                where: {
                    data: {
                        gte: inicioDoMes,
                    },
                },
                include: {
                    motivo: true,
                },
                orderBy: { data: 'asc' }
            });
            const totalEntradasMes = movimentacoesMes
                .filter(m => m.tipo === 'ENTRADA')
                .reduce((acc, m) => acc + m.quantidade, 0);
            const totalSaidasMes = movimentacoesMes
                .filter(m => m.tipo === 'SAIDA')
                .reduce((acc, m) => acc + m.quantidade, 0);
            // Agrupando movimentações por dia para o gráfico de fluxo diário
            const historicoPorDiaMap = {};
            movimentacoesMes.forEach(m => {
                const diaStr = new Date(m.data).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
                if (!historicoPorDiaMap[diaStr]) {
                    historicoPorDiaMap[diaStr] = { entradas: 0, saidas: 0 };
                }
                if (m.tipo === 'ENTRADA') {
                    historicoPorDiaMap[diaStr].entradas += m.quantidade;
                }
                else if (m.tipo === 'SAIDA') {
                    historicoPorDiaMap[diaStr].saidas += m.quantidade;
                }
            });
            const historicoMensal = Object.keys(historicoPorDiaMap).map(dia => ({
                dia,
                entradas: historicoPorDiaMap[dia].entradas,
                saidas: historicoPorDiaMap[dia].saidas,
            }));
            // --- NOVO: Agrupamento de Volume Total por Mês (último ano / histórico) ---
            const todasMovimentacoes = await prisma_1.prisma.movimentacaoEstoque.findMany({
                orderBy: { data: 'asc' }
            });
            const volumePorMesMap = {};
            todasMovimentacoes.forEach(m => {
                const dataMov = new Date(m.data);
                // Chave no formato "MM/AAAA" (ex: "08/2026") para ordenar ou exibir bonitinho
                const mesAnoStr = dataMov.toLocaleDateString('pt-BR', { month: '2-digit', year: 'numeric' });
                if (!volumePorMesMap[mesAnoStr]) {
                    volumePorMesMap[mesAnoStr] = { entradas: 0, saidas: 0 };
                }
                if (m.tipo === 'ENTRADA') {
                    volumePorMesMap[mesAnoStr].entradas += m.quantidade;
                }
                else if (m.tipo === 'SAIDA') {
                    volumePorMesMap[mesAnoStr].saidas += m.quantidade;
                }
            });
            const volumePorMes = Object.keys(volumePorMesMap).map(mes => ({
                mes,
                entradas: volumePorMesMap[mes].entradas,
                saidas: volumePorMesMap[mes].saidas,
            }));
            // --------------------------------------------------------------------------
            // Gráfico 2: Distribuição de Produtos por Categoria (PieChart)
            const produtosAtivosComCategoria = await prisma_1.prisma.produto.findMany({
                where: { ativo: true },
                include: {
                    categoria: true,
                    estoques: { where: { ativo: true } }
                }
            });
            const categoriasMap = {};
            produtosAtivosComCategoria.forEach(p => {
                const catNome = p.categoria?.nome || 'Geral';
                const somaEstoqueProd = p.estoques.reduce((acc, item) => acc + item.estoque, 0);
                if (!categoriasMap[catNome]) {
                    categoriasMap[catNome] = 0;
                }
                categoriasMap[catNome] += somaEstoqueProd;
            });
            const distribuicaoCategorias = Object.keys(categoriasMap).map(nome => ({
                name: nome,
                value: categoriasMap[nome]
            }));
            // Gráfico 3: Produtos com Menor Estoque (Top Alertas)
            const todasVariacoesEstoque = await prisma_1.prisma.produtoEstoque.findMany({
                where: { ativo: true },
                include: {
                    produto: true,
                    tamanho: true,
                    cor: true
                },
                orderBy: { estoque: 'asc' },
                take: 5
            });
            const produtosCriticos = todasVariacoesEstoque.map(item => ({
                nome: `${item.produto?.nome || 'Prod'} (${item.cor?.nome || ''}/${item.tamanho?.nome || 'Único'})`,
                estoque: item.estoque
            }));
            // Gráfico 4: Saídas por Motivo (BarChart)
            const saidasPorMotivoMap = {};
            movimentacoesMes
                .filter(m => m.tipo === 'SAIDA')
                .forEach(m => {
                const motivoNome = m.motivo?.nome || 'Outros';
                if (!saidasPorMotivoMap[motivoNome]) {
                    saidasPorMotivoMap[motivoNome] = 0;
                }
                saidasPorMotivoMap[motivoNome] += m.quantidade;
            });
            const saidasPorMotivo = Object.keys(saidasPorMotivoMap).map(nome => ({
                motivo: nome,
                quantidade: saidasPorMotivoMap[nome]
            }));
            // 4. Últimas movimentações para tabela rápida
            const ultimasMovimentacoes = await prisma_1.prisma.movimentacaoEstoque.findMany({
                orderBy: { data: 'desc' },
                take: 5,
                include: {
                    motivo: true,
                    produto: true,
                    admin: true,
                }
            });
            return res.status(200).json({
                cards: {
                    totalProdutosAtivos: totalProdutosEstoque,
                    quantidadeFisicaTotal,
                    entradasNoMes: totalEntradasMes,
                    saidasNoMes: totalSaidasMes,
                },
                historicoMensal,
                volumePorMes, // <-- Novo bloco agregado mensalmente disponível para o front-end
                distribuicaoCategorias,
                produtosCriticos,
                saidasPorMotivo,
                ultimasMovimentacoes,
            });
        }
        catch (error) {
            console.error('Erro ao carregar dados do dashboard:', error);
            return res.status(500).json({ message: 'Erro interno ao carregar o dashboard.' });
        }
    },
};
