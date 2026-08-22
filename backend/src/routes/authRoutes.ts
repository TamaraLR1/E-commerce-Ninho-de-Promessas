import { Router } from 'express';
import { AuthController } from '../controllers/authController';
import { authMiddleware } from '../middlewares/auth';

const router = Router();
const authController = new AuthController();

router.post('/register', authController.register);
router.post('/login', authController.login);
router.post('/logout', authController.logout); // Adicionado caso queira usar a rota de logout

// Rota protegida que retorna os dados do usuário logado para o frontend
router.get('/perfil', authMiddleware, authController.getProfile);

export { router as authRoutes };