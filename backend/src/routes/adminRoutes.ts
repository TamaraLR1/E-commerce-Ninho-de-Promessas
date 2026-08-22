import { Router } from 'express';
import { AdminAuthController } from '../controllers/adminAuthController';

const router = Router();
const adminAuthController = new AdminAuthController();

// Mapeia a rota POST /api/admin/login para o método login do controller
router.post('/admin/login', (req, res) => adminAuthController.login(req, res));

export default router;