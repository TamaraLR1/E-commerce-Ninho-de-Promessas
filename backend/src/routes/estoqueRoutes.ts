import { Router } from 'express';
import { estoqueController } from '../controllers/estoqueController';
import { ensureAdminAuthenticated } from '../middlewares/authAdminMiddleware'; 

const router = Router();

router.get('/estoque/dashboard', ensureAdminAuthenticated, estoqueController.obterDashboard);

router.get('/movimentacoes', ensureAdminAuthenticated, estoqueController.listarMovimentacoes);
router.post('/movimentacoes', ensureAdminAuthenticated, estoqueController.criarMovimentacao);

export default router;