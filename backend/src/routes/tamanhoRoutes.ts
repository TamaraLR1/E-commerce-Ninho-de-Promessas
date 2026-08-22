import { Router } from 'express';
import { tamanhoController } from '../controllers/tamanhoController';

const router = Router();

router.get('/tamanhos', tamanhoController.listar);
router.post('/tamanhos', tamanhoController.criar);
router.put('/tamanhos/:id', tamanhoController.atualizar);
router.delete('/tamanhos/:id', tamanhoController.excluir);

export default router;