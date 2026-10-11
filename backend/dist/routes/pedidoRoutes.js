"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pedidoRoutes = void 0;
const express_1 = require("express");
const pedidoController_1 = require("../controllers/pedidoController");
const auth_1 = require("../middlewares/auth");
const router = (0, express_1.Router)();
exports.pedidoRoutes = router;
// Lista o histórico de compras do cliente logado ("Meus Pedidos")
router.get('/pedidos', auth_1.authMiddleware, pedidoController_1.pedidoController.listarMeusPedidos);
// Detalhes de um pedido específico
router.get('/pedidos/:id', auth_1.authMiddleware, pedidoController_1.pedidoController.buscarPorId);
// Atualizar status do pedido e código de rastreio (Exclusivo para o Painel Admin)
router.patch('/pedidos/:id/status', auth_1.authMiddleware, pedidoController_1.pedidoController.atualizarStatus);
