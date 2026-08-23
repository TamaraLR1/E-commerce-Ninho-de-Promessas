import { Router } from 'express';
import { tamanhoController } from '../controllers/tamanhoController';

const router = Router();

router.get('/tamanhos', tamanhoController.listar);
router.post('/tamanhos', tamanhoController.criar);
router.put('/tamanhos/:id', tamanhoController.atualizar);
router.delete('/tamanhos/:id', tamanhoController.excluir);
router.patch('/tamanhos/:id/inativar', tamanhoController.inativar);
router.patch('/tamanhos/:id/ativar', tamanhoController.ativar);

export default router;