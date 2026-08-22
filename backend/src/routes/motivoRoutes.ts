import { Router } from 'express';
import { motivoController } from '../controllers/motivoController';

const router = Router();

router.post('/motivos-estoque', motivoController.criar);
router.get('/motivos-estoque', motivoController.listarMotivos);

export default router;