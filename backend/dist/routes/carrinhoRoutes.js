"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.carrinhoRoutes = void 0;
const express_1 = require("express");
const carrinhoController_1 = require("../controllers/carrinhoController");
const auth_1 = require("../middlewares/auth");
const carrinhoRoutes = (0, express_1.Router)();
exports.carrinhoRoutes = carrinhoRoutes;
// Permite GET em /api/carrinho e /api/carrinho/
carrinhoRoutes.get('/carrinho', auth_1.authMiddleware, carrinhoController_1.carrinhoController.obterCarrinho);
// Operações de itens
carrinhoRoutes.post('/carrinho/item', auth_1.authMiddleware, carrinhoController_1.carrinhoController.adicionarItem);
carrinhoRoutes.put('/carrinho/item/:itemId', auth_1.authMiddleware, carrinhoController_1.carrinhoController.atualizarQuantidade);
carrinhoRoutes.delete('/carrinho/item/:itemId', auth_1.authMiddleware, carrinhoController_1.carrinhoController.removerItem);
carrinhoRoutes.delete('/carrinho/limpar', auth_1.authMiddleware, carrinhoController_1.carrinhoController.limparCarrinho);
