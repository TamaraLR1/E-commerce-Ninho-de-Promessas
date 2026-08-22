import { Router } from 'express';
import { estoqueController } from '../controllers/estoqueController';

const router = Router();

// GET /api/movimentacoes
router.get('/movimentacoes', estoqueController.listarMovimentacoes);

// POST /api/movimentacoes
router.post('/movimentacoes', estoqueController.criarMovimentacao);

export default router;