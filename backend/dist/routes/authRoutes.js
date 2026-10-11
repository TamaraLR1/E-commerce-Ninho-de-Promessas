"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authRoutes = void 0;
const express_1 = require("express");
const authController_1 = require("../controllers/authController");
const auth_1 = require("../middlewares/auth");
const router = (0, express_1.Router)();
exports.authRoutes = router;
const authController = new authController_1.AuthController();
router.post('/register', authController.register);
router.post('/login', authController.login);
router.post('/logout', authController.logout); // Adicionado caso queira usar a rota de logout
// Rota protegida que retorna os dados do usuário logado para o frontend
router.get('/perfil', auth_1.authMiddleware, authController.getProfile);
router.put('/perfil', auth_1.authMiddleware, authController.updateProfile);
