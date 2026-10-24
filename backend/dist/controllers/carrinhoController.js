"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.carrinhoController = void 0;
const prisma_1 = require("../lib/prisma");
exports.carrinhoController = {
    // GET /api/carrinho - Busca ou cria o carrinho do usuário logado
    async obterCarrinho(req, res) {
        try {
            const rawUserId = req.user?.id || req.userId;
            if (!rawUserId) {
                return res.status(401).json({ message: 'Usuário não autenticado.' });
            }
            const userId = Number(rawUserId);
            if (isNaN(userId)) {
                return res.status(400).json({ message: 'ID de usuário inválido.' });
            }
            // 1. Valida se o usuário existe no banco para evitar erro de Foreign Key (P2003)
            const usuarioExiste = await prisma_1.prisma.user.findUnique({
                where: { id: userId },
            });
            if (!usuarioExiste) {
                return res.status(404).json({ message: 'Usuário não encontrado. Faça login novamente.' });
            }
            // 2. Busca o carrinho existente
            let carrinho = await prisma_1.prisma.carrinho.findUnique({
                where: { userId },
                include: {
                    itens: {
                        include: {
                            produto: {
                                include: {
                                    imagens: true,
                                },
                            },
                            tamanho: true,
                            cor: true,
                        },
                        orderBy: { createdAt: 'desc' },
                    },
                },
            });
            // 3. Se o usuário ainda não tiver um carrinho criado no banco, cria um novo
            if (!carrinho) {
                carrinho = await prisma_1.prisma.carrinho.create({
                    data: { userId },
                    include: {
                        itens: {
                            include: {
                                produto: {
                                    include: {
                                        imagens: true,
                                    },
                                },
                                tamanho: true,
                                cor: true,
                            },
                        },
                    },
                });
            }
            // 4. Formatando a resposta com cálculo do subtotal e imagem principal (ordem: 0)
            let subtotal = 0;
            const itensFormatados = (carrinho.itens || []).map((item) => {
                const precoUnitario = item.produto.temOferta && Number(item.produto.precoPromocional) > 0
                    ? Number(item.produto.precoPromocional)
                    : Number(item.produto.preco);
                const totalItem = precoUnitario * item.quantidade;
                subtotal += totalItem;
                // 1. Prioridade absoluta: imagem definida como capa principal (ordem === 0)
                const imagemCapa = item.produto.imagens.find((img) => img.ordem === 0);
                // 2. Fallbacks: imagem pela ordem mais baixa ou vinculada à cor
                const imagemOrdenada = [...(item.produto.imagens || [])].sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0))[0];
                const imagemVinculada = item.produto.imagens.find((img) => img.corId === item.corId);
                const imagemUrl = imagemCapa?.url || imagemOrdenada?.url || imagemVinculada?.url || null;
                return {
                    id: item.id,
                    produtoId: item.produtoId,
                    nome: item.produto.nome,
                    precoUnitario,
                    quantidade: item.quantidade,
                    totalItem,
                    tamanho: item.tamanho ? { id: item.tamanho.id, nome: item.tamanho.nome } : null,
                    cor: item.cor ? { id: item.cor.id, nome: item.cor.nome, hex: item.cor.hex } : null,
                    imagemUrl,
                };
            });
            return res.status(200).json({
                carrinhoId: carrinho.id,
                itens: itensFormatados,
                quantidadeTotal: itensFormatados.reduce((acc, item) => acc + item.quantidade, 0),
                subtotal,
            });
        }
        catch (error) {
            console.error('Erro ao buscar carrinho:', error);
            return res.status(500).json({ message: 'Erro interno ao buscar carrinho.' });
        }
    },
    // POST /api/carrinho/item - Adiciona produto ao carrinho com checagem rigorosa de estoque
    async adicionarItem(req, res) {
        try {
            const userId = req.user?.id || req.userId;
            const { produtoId, tamanhoId, corId, quantidade = 1 } = req.body;
            if (!userId) {
                return res.status(401).json({ message: 'Usuário não autenticado.' });
            }
            if (!produtoId) {
                return res.status(400).json({ message: 'ID do produto é obrigatório.' });
            }
            if (!tamanhoId || !corId) {
                return res.status(400).json({
                    message: 'Por favor, selecione a cor e o tamanho do produto antes de adicionar ao carrinho.'
                });
            }
            const qtdAdicionar = Number(quantidade);
            if (isNaN(qtdAdicionar) || qtdAdicionar <= 0) {
                return res.status(400).json({ message: 'Quantidade inválida.' });
            }
            // 1. Busca o estoque disponível para este produto/tamanho/cor usando prisma.produtoEstoque
            const estoqueRegistro = await prisma_1.prisma.produtoEstoque.findFirst({
                where: {
                    produtoId: String(produtoId),
                    tamanhoId: String(tamanhoId),
                    corId: String(corId),
                },
            });
            const estoqueDisponivel = estoqueRegistro ? estoqueRegistro.estoque : 0;
            if (estoqueDisponivel <= 0) {
                return res.status(400).json({ message: 'Desculpe, este produto está esgotado no momento.' });
            }
            // 2. Garante que o carrinho exista
            let carrinho = await prisma_1.prisma.carrinho.findUnique({
                where: { userId: Number(userId) },
            });
            if (!carrinho) {
                carrinho = await prisma_1.prisma.carrinho.create({
                    data: { userId: Number(userId) },
                });
            }
            // 3. Verifica a quantidade já existente no carrinho para validar contra o estoque
            const itemExistente = await prisma_1.prisma.itemCarrinho.findFirst({
                where: {
                    carrinhoId: carrinho.id,
                    produtoId: String(produtoId),
                    tamanhoId: String(tamanhoId),
                    corId: String(corId),
                },
            });
            const qtdAtualNoCarrinho = itemExistente ? itemExistente.quantidade : 0;
            const novaQtdTotal = qtdAtualNoCarrinho + qtdAdicionar;
            if (novaQtdTotal > estoqueDisponivel) {
                const restantePermitido = estoqueDisponivel - qtdAtualNoCarrinho;
                if (restantePermitido <= 0) {
                    return res.status(400).json({
                        message: `Você já possui ${qtdAtualNoCarrinho} unidade(s) no carrinho, que é o limite máximo em estoque.`
                    });
                }
                return res.status(400).json({
                    message: `Estoque insuficiente. Restam apenas ${estoqueDisponivel} unidade(s) no estoque (você já possui ${qtdAtualNoCarrinho} no carrinho).`
                });
            }
            if (itemExistente) {
                await prisma_1.prisma.itemCarrinho.update({
                    where: { id: itemExistente.id },
                    data: { quantidade: novaQtdTotal },
                });
            }
            else {
                await prisma_1.prisma.itemCarrinho.create({
                    data: {
                        carrinhoId: carrinho.id,
                        produtoId: String(produtoId),
                        tamanhoId: String(tamanhoId),
                        corId: String(corId),
                        quantidade: qtdAdicionar,
                    },
                });
            }
            return res.status(200).json({ message: 'Item adicionado ao carrinho com sucesso.' });
        }
        catch (error) {
            console.error('Erro ao adicionar item ao carrinho:', error);
            return res.status(500).json({ message: 'Erro interno ao adicionar item ao carrinho.' });
        }
    },
    // PUT /api/carrinho/item/:itemId - Atualiza a quantidade do item com checagem de estoque
    async atualizarQuantidade(req, res) {
        try {
            const userId = req.userId || req.user?.id;
            const itemId = Array.isArray(req.params.itemId) ? req.params.itemId[0] : req.params.itemId;
            const { quantidade } = req.body;
            if (!userId) {
                return res.status(401).json({ message: 'Usuário não autenticado.' });
            }
            const novaQuantidade = Number(quantidade);
            if (isNaN(novaQuantidade) || novaQuantidade <= 0) {
                await prisma_1.prisma.itemCarrinho.delete({
                    where: { id: String(itemId) },
                });
                return res.status(200).json({ message: 'Item removido do carrinho.' });
            }
            // 1. Busca o item do carrinho
            const itemCarrinho = await prisma_1.prisma.itemCarrinho.findUnique({
                where: { id: String(itemId) },
            });
            if (!itemCarrinho) {
                return res.status(404).json({ message: 'Item não encontrado no carrinho.' });
            }
            // 2. Busca o estoque real da variação usando prisma.produtoEstoque
            const estoqueRegistro = await prisma_1.prisma.produtoEstoque.findFirst({
                where: {
                    produtoId: itemCarrinho.produtoId,
                    tamanhoId: itemCarrinho.tamanhoId,
                    corId: itemCarrinho.corId,
                },
            });
            const estoqueDisponivel = estoqueRegistro ? estoqueRegistro.estoque : 0;
            if (novaQuantidade > estoqueDisponivel) {
                return res.status(400).json({
                    message: `Estoque insuficiente. Não é possível alterar para ${novaQuantidade} unidade(s). Restam apenas ${estoqueDisponivel} disponível(is).`
                });
            }
            await prisma_1.prisma.itemCarrinho.update({
                where: { id: String(itemId) },
                data: { quantidade: novaQuantidade },
            });
            return res.status(200).json({ message: 'Quantidade atualizada com sucesso.' });
        }
        catch (error) {
            console.error('Erro ao atualizar quantidade do carrinho:', error);
            return res.status(500).json({ message: 'Erro interno ao atualizar quantidade.' });
        }
    },
    // DELETE /api/carrinho/item/:itemId - Remove um item do carrinho
    async removerItem(req, res) {
        try {
            const userId = req.userId || req.user?.id;
            const itemId = Array.isArray(req.params.itemId) ? req.params.itemId[0] : req.params.itemId;
            if (!userId) {
                return res.status(401).json({ message: 'Usuário não autenticado.' });
            }
            await prisma_1.prisma.itemCarrinho.delete({
                where: { id: String(itemId) },
            });
            return res.status(200).json({ message: 'Item removido com sucesso.' });
        }
        catch (error) {
            console.error('Erro ao remover item do carrinho:', error);
            return res.status(500).json({ message: 'Erro interno ao remover item.' });
        }
    },
    // DELETE /api/carrinho/limpar - Limpa todos os itens do carrinho
    async limparCarrinho(req, res) {
        try {
            const userId = req.user?.id || req.userId;
            if (!userId) {
                return res.status(401).json({ message: 'Usuário não autenticado.' });
            }
            const carrinho = await prisma_1.prisma.carrinho.findUnique({
                where: { userId: Number(userId) },
            });
            if (carrinho) {
                await prisma_1.prisma.itemCarrinho.deleteMany({
                    where: { carrinhoId: carrinho.id },
                });
            }
            return res.status(200).json({ message: 'Carrinho limpo com sucesso.' });
        }
        catch (error) {
            console.error('Erro ao limpar carrinho:', error);
            return res.status(500).json({ message: 'Erro interno ao limpar carrinho.' });
        }
    },
};
