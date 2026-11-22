import { Router } from 'express';
import { EmpresaController } from '../controllers/empresaController';
import { authMiddleware } from '../middlewares/auth';

const router = Router();
const empresaController = new EmpresaController();

router.get('/empresa', authMiddleware, empresaController.getEmpresa);
router.post('/empresa', authMiddleware, empresaController.upsertEmpresa);
router.put('/empresa', authMiddleware, empresaController.upsertEmpresa);
router.put('/empresa/endereco-fiscal', authMiddleware, empresaController.upsertEnderecoFiscal);

export { router as empresaRoutes };