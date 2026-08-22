import { Router } from 'express';
import { motivoController } from '../controllers/motivoController';

const router = Router();

router.get('/motivos-estoque', motivoController.listarMotivos);

export default router;