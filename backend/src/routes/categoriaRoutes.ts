import { Router } from 'express';
import { categoriaController } from '../controllers/categoriaController';

const router = Router();

router.get('/categorias', categoriaController.listar);
router.post('/categorias', categoriaController.criar);
router.put('/categorias/:id', categoriaController.atualizar);
router.delete('/categorias/:id', categoriaController.excluir);

export default router;