import { Router } from 'express';
import { motivoController } from '../controllers/motivoController';

const router = Router();

router.post('/motivos-estoque', motivoController.criar);
router.get('/motivos-estoque', motivoController.listarMotivos);
router.put('/motivos-estoque/:id', motivoController.editar);
router.patch('/motivos-estoque/:id/inativar', motivoController.inativar); // <-- Nova rota para exclusão lógica
export default router;