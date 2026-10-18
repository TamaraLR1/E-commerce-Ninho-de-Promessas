import { Router } from 'express';
import { cupomController } from '../controllers/cupomController';
import { ensureAdminAuthenticated } from '../middlewares/authAdminMiddleware';

const router = Router();

router.get('/cupons', ensureAdminAuthenticated, cupomController.listar);
router.post('/cupons', ensureAdminAuthenticated, cupomController.criar);
router.patch('/cupons/:id/status', ensureAdminAuthenticated, cupomController.alternarStatus);
router.post('/cupons/validar', cupomController.validarCupom);

export { router as cupomRoutes };