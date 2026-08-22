import { Router } from 'express';
import { estoqueController } from '../controllers/estoqueController';

const router = Router();

router.get('/estoque/dashboard', estoqueController.obterDashboard);

router.get('/movimentacoes', estoqueController.listarMovimentacoes);
router.post('/movimentacoes', estoqueController.criarMovimentacao);

export default router;