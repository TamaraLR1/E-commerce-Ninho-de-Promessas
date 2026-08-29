import { RequestHandler, Router } from 'express';
import { produtoController } from '../controllers/produtoController';
import { parseUpload } from '../middlewares/upload.middleware';
import { ensureAdminAuthenticated } from '../middlewares/authAdminMiddleware'; 

const router = Router();

router.get('/produtos', ensureAdminAuthenticated, produtoController.listar);
router.delete('/produtos/:id', ensureAdminAuthenticated, produtoController.excluir);
router.post('/produtos', ensureAdminAuthenticated, parseUpload('imagens', 10), produtoController.criar);
router.put('/produtos/:id', ensureAdminAuthenticated, parseUpload('imagens', 10), produtoController.atualizar);
router.patch('/produtos/:id/oferta',ensureAdminAuthenticated, produtoController.configurarOferta);
router.patch('/produtos/:id/visibilidade', ensureAdminAuthenticated, produtoController.atualizarVisibilidade);
router.patch('/produtos/:id/reativar', ensureAdminAuthenticated, produtoController.reativar);

export { router as produtoRoutes };