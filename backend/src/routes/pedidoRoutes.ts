import { Router } from 'express';
import { pedidoController } from '../controllers/pedidoController';
import { authMiddleware } from '../middlewares/auth';

const router = Router();

// Lista o histórico de compras do cliente logado ("Meus Pedidos")
router.get('/pedidos', authMiddleware, pedidoController.listarMeusPedidos);

// Detalhes de um pedido específico
router.get('/pedidos/:id', authMiddleware, pedidoController.buscarPorId);

// Atualizar status do pedido e código de rastreio (Exclusivo para o Painel Admin)
router.patch('/pedidos/:id/status', authMiddleware, pedidoController.atualizarStatus);

export { router as pedidoRoutes };