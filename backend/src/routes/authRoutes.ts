import { Router } from 'express';
import { AuthController } from '../controllers/authController';
import { authMiddleware } from '../middlewares/auth';

const router = Router();
const authController = new AuthController();

router.post('/register', authController.register);
router.post('/login', authController.login);
router.post('/logout', authController.logout);

router.get('/perfil', authMiddleware, authController.getProfile);
router.put('/perfil', authMiddleware, authController.updateProfile);

export { router as authRoutes };