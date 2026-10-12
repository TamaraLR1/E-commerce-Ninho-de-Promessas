import { Router } from 'express';
import { pedidoController } from '../controllers/pedidoController';
import { authMiddleware } from '../middlewares/auth';
import { ensureAdminAuthenticated } from '../middlewares/authAdminMiddleware'; // 1. Importe o middleware do Admin

const router = Router();

// ==========================================
// ROTAS EXCLUSIVAS DO PAINEL ADMIN
// ==========================================

// Rota do Painel Admin (Retorna TODOS os pedidos do banco)
router.get('/pedidos', ensureAdminAuthenticated, pedidoController.listarTodosPedidos);

// Atualização de Status (Admin)
router.patch('/pedidos/:id/status', ensureAdminAuthenticated, pedidoController.atualizarStatus);

// Atualização de Rastreio (Admin)
router.patch('/pedidos/:id/rastreio', ensureAdminAuthenticated, pedidoController.atualizarRastreio);


// ==========================================
// ROTAS DO CLIENTE / COMPRADOR (E-COMMERCE)
// ==========================================

// Histórico "Meus Pedidos" do cliente logado
router.get('/pedidos/meus', authMiddleware, pedidoController.listarMeusPedidos);


// ==========================================
// ROTAS COMPARTILHADAS / DETALHES
// ==========================================

// Se o admin precisa visualizar detalhes de qualquer pedido via ID, 
// use authAdminMiddleware ou crie um middleware flexível.
router.get('/pedidos/:id', ensureAdminAuthenticated, pedidoController.buscarPorId);

export { router as pedidoRoutes };