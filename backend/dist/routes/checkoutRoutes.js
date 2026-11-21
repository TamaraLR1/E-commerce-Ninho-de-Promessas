"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middlewares/auth");
const checkoutController_1 = require("../controllers/checkoutController");
const router = (0, express_1.Router)();
router.post('/conferir-estoque', auth_1.authMiddleware, checkoutController_1.checkoutController.conferirEstoque);
exports.default = router;
