"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.relatorioRoutes = void 0;
const express_1 = require("express");
const relatorioController_1 = require("../controllers/relatorioController");
const authAdminMiddleware_1 = require("../middlewares/authAdminMiddleware");
const router = (0, express_1.Router)();
exports.relatorioRoutes = router;
// Rota protegida para acesso exclusivo do painel administrativo
router.get('/relatorios/vendas-variacao', authAdminMiddleware_1.ensureAdminAuthenticated, relatorioController_1.relatorioController.vendasPorVariacao);
