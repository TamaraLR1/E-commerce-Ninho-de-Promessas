import { Router } from 'express';
import { carrinhoController } from '../controllers/carrinhoController';
import { authMiddleware } from '../middlewares/auth';

const carrinhoRoutes = Router();

// Permite GET em /api/carrinho e /api/carrinho/
carrinhoRoutes.get('/carrinho', authMiddleware, carrinhoController.obterCarrinho);

// Operações de itens
carrinhoRoutes.post('/carrinho/item', authMiddleware, carrinhoController.adicionarItem);
carrinhoRoutes.put('/carrinho/item/:itemId', authMiddleware, carrinhoController.atualizarQuantidade);
carrinhoRoutes.delete('/carrinho/item/:itemId', authMiddleware, carrinhoController.removerItem);
carrinhoRoutes.delete('/carrinho/limpar', authMiddleware, carrinhoController.limparCarrinho);

export { carrinhoRoutes };