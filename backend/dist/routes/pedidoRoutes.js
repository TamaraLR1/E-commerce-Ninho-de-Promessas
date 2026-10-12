"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pedidoRoutes = void 0;
const express_1 = require("express");
const pedidoController_1 = require("../controllers/pedidoController");
const auth_1 = require("../middlewares/auth");
const authAdminMiddleware_1 = require("../middlewares/authAdminMiddleware"); // 1. Importe o middleware do Admin
const router = (0, express_1.Router)();
exports.pedidoRoutes = router;
// ==========================================
// ROTAS EXCLUSIVAS DO PAINEL ADMIN
// ==========================================
// Rota do Painel Admin (Retorna TODOS os pedidos do banco)
router.get('/pedidos', authAdminMiddleware_1.ensureAdminAuthenticated, pedidoController_1.pedidoController.listarTodosPedidos);
// Atualização de Status (Admin)
router.patch('/pedidos/:id/status', authAdminMiddleware_1.ensureAdminAuthenticated, pedidoController_1.pedidoController.atualizarStatus);
// Atualização de Rastreio (Admin)
router.patch('/pedidos/:id/rastreio', authAdminMiddleware_1.ensureAdminAuthenticated, pedidoController_1.pedidoController.atualizarRastreio);
// ==========================================
// ROTAS DO CLIENTE / COMPRADOR (E-COMMERCE)
// ==========================================
// Histórico "Meus Pedidos" do cliente logado
router.get('/pedidos/meus', auth_1.authMiddleware, pedidoController_1.pedidoController.listarMeusPedidos);
// ==========================================
// ROTAS COMPARTILHADAS / DETALHES
// ==========================================
// Se o admin precisa visualizar detalhes de qualquer pedido via ID, 
// use authAdminMiddleware ou crie um middleware flexível.
router.get('/pedidos/:id', authAdminMiddleware_1.ensureAdminAuthenticated, pedidoController_1.pedidoController.buscarPorId);
