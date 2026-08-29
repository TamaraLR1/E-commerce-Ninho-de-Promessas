import { Router } from 'express';
import { AdminAuthController } from '../controllers/adminAuthController';
import { ensureAdminAuthenticated } from '../middlewares/authAdminMiddleware'; 

const router = Router();
const adminAuthController = new AdminAuthController();

router.post('/admin/login', (req, res) => adminAuthController.login(req, res));
router.post('/admin/logout', adminAuthController.logout);
router.get('/admin/me', ensureAdminAuthenticated, adminAuthController.obterPerfil);

export default router;