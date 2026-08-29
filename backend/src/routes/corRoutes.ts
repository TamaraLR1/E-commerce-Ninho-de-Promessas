import { Router } from 'express';
import { corController } from '../controllers/corController';
import { ensureAdminAuthenticated } from '../middlewares/authAdminMiddleware'; 


const router = Router();

router.get('/cores', corController.listar);
router.post('/cores', ensureAdminAuthenticated, corController.criar);
router.put('/cores/:id', ensureAdminAuthenticated, corController.atualizar);
router.delete('/cores/:id',ensureAdminAuthenticated, corController.excluir);
router.patch('/cores/:id/inativar', ensureAdminAuthenticated, corController.inativar);
router.patch('/cores/:id/ativar', ensureAdminAuthenticated, corController.ativar);

export default router;