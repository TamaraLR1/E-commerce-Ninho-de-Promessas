import { Router } from 'express';
import { categoriaController } from '../controllers/categoriaController';
import { ensureAdminAuthenticated } from '../middlewares/authAdminMiddleware'; 


const router = Router();

router.get('/categorias', categoriaController.listar);

router.post('/categorias', ensureAdminAuthenticated, categoriaController.criar);
router.put('/categorias/:id', ensureAdminAuthenticated, categoriaController.atualizar);
router.patch('/categorias/:id/inativar', ensureAdminAuthenticated, categoriaController.inativar);
router.patch('/categorias/:id/ativar',ensureAdminAuthenticated, categoriaController.ativar);

export default router;