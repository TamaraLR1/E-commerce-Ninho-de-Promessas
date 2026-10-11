"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pagamentoRoutes = void 0;
const express_1 = require("express");
const pagamentoController_1 = require("../controllers/pagamentoController");
const auth_1 = require("../middlewares/auth");
const router = (0, express_1.Router)();
exports.pagamentoRoutes = router;
// Rota POST para efetuar o pagamento e gerar o pedido
router.post('/pagamento', auth_1.authMiddleware, pagamentoController_1.pagamentoController.processarPagamento);
// Webhook do Mercado Pago (público)
router.post('/webhooks/mercadopago', pagamentoController_1.pagamentoController.webhookMercadoPago);
