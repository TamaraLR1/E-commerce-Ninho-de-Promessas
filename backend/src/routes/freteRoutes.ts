import { Router } from 'express';
import { FreteController } from '../controllers/freteController';

const router = Router();

// Rota pública para calcular frete no carrinho e no checkout
router.post('/frete/calcular', FreteController.calcularFrete);

export { router as freteRoutes };