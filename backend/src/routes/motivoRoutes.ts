import { Router } from 'express';
import { motivoController } from '../controllers/motivoController';
import { ensureAdminAuthenticated } from '../middlewares/authAdminMiddleware'; 

const router = Router();

router.post('/motivos-estoque', ensureAdminAuthenticated, motivoController.criar);
router.get('/motivos-estoque', ensureAdminAuthenticated, motivoController.listarMotivos);
router.put('/motivos-estoque/:id', ensureAdminAuthenticated, motivoController.editar);
router.patch('/motivos-estoque/:id/inativar', ensureAdminAuthenticated, motivoController.inativar);

export default router;