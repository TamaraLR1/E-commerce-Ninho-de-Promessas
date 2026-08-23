import { Router } from 'express';
import { categoriaController } from '../controllers/categoriaController';

const router = Router();

router.get('/categorias', categoriaController.listar);
router.post('/categorias', categoriaController.criar);
router.put('/categorias/:id', categoriaController.atualizar);
router.patch('/categorias/:id/inativar', categoriaController.inativar);
router.patch('/categorias/:id/ativar', categoriaController.ativar);

export default router;