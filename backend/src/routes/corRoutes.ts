import { Router } from 'express';
import { corController } from '../controllers/corController';

const router = Router();

router.get('/cores', corController.listar);
router.post('/cores', corController.criar);
router.put('/cores/:id', corController.atualizar);
router.delete('/cores/:id', corController.excluir);

export default router;