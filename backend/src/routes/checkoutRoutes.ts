import { Router } from 'express';
import { authMiddleware } from '../middlewares/auth';
import { checkoutController } from '../controllers/checkoutController';

const router = Router();

router.post('/conferir-estoque', authMiddleware, checkoutController.conferirEstoque);

export default router;