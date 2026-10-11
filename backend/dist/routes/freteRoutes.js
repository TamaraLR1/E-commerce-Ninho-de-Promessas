"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.freteRoutes = void 0;
const express_1 = require("express");
const freteController_1 = require("../controllers/freteController");
const router = (0, express_1.Router)();
exports.freteRoutes = router;
// Rota pública para calcular frete no carrinho e no checkout
router.post('/frete/calcular', freteController_1.FreteController.calcularFrete);
