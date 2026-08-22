import { RequestHandler, Router } from 'express';
import { produtoController } from '../controllers/produtoController';
import { parseUpload } from '../middlewares/upload.middleware';

const router = Router();

router.get('/produtos', produtoController.listar);
router.delete('/produtos/:id', produtoController.excluir);
router.post('/produtos', parseUpload('imagens', 10), produtoController.criar);
router.put('/produtos/:id', parseUpload('imagens', 10), produtoController.atualizar);

export { router as produtoRoutes };