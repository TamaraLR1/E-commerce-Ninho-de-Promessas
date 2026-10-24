import { Router } from 'express';
import { relatorioController } from '../controllers/RelatorioController';
import { ensureAdminAuthenticated } from '../middlewares/authAdminMiddleware';

const router = Router();

// Rota protegida para acesso exclusivo do painel administrativo
router.get('/relatorios/vendas-variacao', ensureAdminAuthenticated, relatorioController.vendasPorVariacao);

export { router as relatorioRoutes };