import { Router } from 'express';
import { pagamentoController } from '../controllers/pagamentoController';
import { authMiddleware } from '../middlewares/auth';

const router = Router();

// Rota POST para efetuar o pagamento e gerar o pedido
router.post('/pagamento', authMiddleware, pagamentoController.processarPagamento);

// Webhook do Mercado Pago (público)
router.post('/webhooks/mercadopago', pagamentoController.webhookMercadoPago);

export { router as pagamentoRoutes };