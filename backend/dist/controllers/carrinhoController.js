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
            // 4. Formatando a resposta com cálculo do subtotal e imagem principal
            let subtotal = 0;
            const itensFormatados = (carrinho.itens || []).map((item) => {
                const precoUnitario = item.produto.temOferta && Number(item.produto.precoPromocional) > 0
                    ? Number(item.produto.precoPromocional)
                    : Number(item.produto.preco);
                const totalItem = precoUnitario * item.quantidade;
                subtotal += totalItem;
                // Tenta pegar a imagem vinculada à cor do item ou a primeira do produto
                const imagemVinculada = item.produto.imagens.find((img) => img.corId === item.corId);
                const imagemUrl = imagemVinculada ? imagemVinculada.url : item.produto.imagens[0]?.url || null;
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
    // POST /api/carrinho/item - Adiciona produto ao carrinho (ou soma quantidade)
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
            // Garante que o carrinho exista
            let carrinho = await prisma_1.prisma.carrinho.findUnique({
                where: { userId: Number(userId) },
            });
            if (!carrinho) {
                carrinho = await prisma_1.prisma.carrinho.create({
                    data: { userId: Number(userId) },
                });
            }
            // Verifica se o mesmo item com a mesma variação já está no carrinho
            const itemExistente = await prisma_1.prisma.itemCarrinho.findFirst({
                where: {
                    carrinhoId: carrinho.id,
                    produtoId,
                    tamanhoId: tamanhoId || null,
                    corId: corId || null,
                },
            });
            if (itemExistente) {
                // Incrementa a quantidade
                await prisma_1.prisma.itemCarrinho.update({
                    where: { id: itemExistente.id },
                    data: { quantidade: itemExistente.quantidade + Number(quantidade) },
                });
            }
            else {
                // Cria um novo item no carrinho
                await prisma_1.prisma.itemCarrinho.create({
                    data: {
                        carrinhoId: carrinho.id,
                        produtoId,
                        tamanhoId: tamanhoId || null,
                        corId: corId || null,
                        quantidade: Number(quantidade),
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
    // PUT /api/carrinho/item/:itemId - Atualiza a quantidade do item
    // PUT /api/carrinho/item/:itemId - Atualiza a quantidade do item
    async atualizarQuantidade(req, res) {
        try {
            const userId = req.userId || req.userId;
            const itemId = Array.isArray(req.params.itemId) ? req.params.itemId[0] : req.params.itemId;
            const { quantidade } = req.body;
            if (!userId) {
                return res.status(401).json({ message: 'Usuário não autenticado.' });
            }
            const novaQuantidade = Number(quantidade);
            if (isNaN(novaQuantidade) || novaQuantidade <= 0) {
                // Se a quantidade for <= 0, remove o item
                await prisma_1.prisma.itemCarrinho.delete({
                    where: { id: String(itemId) },
                });
                return res.status(200).json({ message: 'Item removido do carrinho.' });
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
            const userId = req.userId || req.userId;
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
