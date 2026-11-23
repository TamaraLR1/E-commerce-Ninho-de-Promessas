import { Router } from 'express';
import { notaFiscalController } from '../controllers/notaFiscalController';

const router = Router();

router.get('/callback', notaFiscalController.oauthCallback);
router.post('/pedidos/:pedidoId/emitir', notaFiscalController.emitirPorPedido);
router.get('/pedidos/:pedidoId/status', notaFiscalController.consultarPorPedido);
router.get('/pedidos/:pedidoId/danfe', notaFiscalController.baixarDanfe);
router.get('/pedidos/:pedidoId/xml', notaFiscalController.baixarXml);

export default router;