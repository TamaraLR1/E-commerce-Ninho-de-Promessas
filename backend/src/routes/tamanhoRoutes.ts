import { Router } from 'express';
import { tamanhoController } from '../controllers/tamanhoController';
import { ensureAdminAuthenticated } from '../middlewares/authAdminMiddleware'; 

const router = Router();

router.get('/tamanhos', tamanhoController.listar);
router.post('/tamanhos', ensureAdminAuthenticated, tamanhoController.criar);
router.put('/tamanhos/:id',ensureAdminAuthenticated, tamanhoController.atualizar);
router.delete('/tamanhos/:id', ensureAdminAuthenticated, tamanhoController.excluir);
router.patch('/tamanhos/:id/inativar', ensureAdminAuthenticated, tamanhoController.inativar);
router.patch('/tamanhos/:id/ativar', ensureAdminAuthenticated, tamanhoController.ativar);

export default router;