import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
// Importe diretamente de onde fica sua instância do Axios (ex: '../api', './api', '@/api')
import api from '../../../../api'; 

export interface ItemCarrinho {
  id: string;
  produtoId: string;
  nome: string;
  precoUnitario: number;
  quantidade: number;
  totalItem: number;
  tamanho: { id: string; nome: string } | null;
  cor: { id: string; nome: string; hex?: string } | null;
  imagemUrl: string | null;
}

interface CartContextData {
  itens: ItemCarrinho[];
  quantidadeTotal: number;
  subtotal: number;
  loading: boolean;
  carregarCarrinho: () => Promise<void>;
  adicionarAoCarrinho: (params: {
    produtoId: string;
    tamanhoId?: string | null;
    corId?: string | null;
    quantidade?: number;
  }) => Promise<void>;
  atualizarQuantidade: (itemId: string, novaQuantidade: number) => Promise<void>;
  removerDoCarrinho: (itemId: string) => Promise<void>;
  limparCarrinho: () => Promise<void>;
}

const CartContext = createContext<CartContextData>({} as CartContextData);

export const CartProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [itens, setItens] = useState<ItemCarrinho[]>([]);
  const [quantidadeTotal, setQuantidadeTotal] = useState(0);
  const [subtotal, setSubtotal] = useState(0);
  const [loading, setLoading] = useState(false);

  // 1. GET /api/carrinho - Busca o carrinho do banco
  const carregarCarrinho = useCallback(async () => {
    try {
      setLoading(true);
      const response = await api.get('/api/carrinho');
      
      setItens(response.data.itens || []);
      setQuantidadeTotal(response.data.quantidadeTotal || 0);
      setSubtotal(response.data.subtotal || 0);
    } catch (error) {
      console.error('Erro ao carregar carrinho:', error);
      setItens([]);
      setQuantidadeTotal(0);
      setSubtotal(0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    carregarCarrinho();
  }, [carregarCarrinho]);

  // 2. POST /api/carrinho/item - Adiciona produto
  const adicionarAoCarrinho = async (params: {
    produtoId: string;
    tamanhoId?: string | null;
    corId?: string | null;
    quantidade?: number;
  }) => {
    try {
      await api.post('/api/carrinho/item', params);
      await carregarCarrinho();
    } catch (error) {
      console.error('Erro ao adicionar item ao carrinho:', error);
      throw error;
    }
  };

  // 3. PUT /api/carrinho/item/:itemId - Atualiza quantidade (+ / -)
  const atualizarQuantidade = async (itemId: string, novaQuantidade: number) => {
    try {
      await api.put(`/api/carrinho/item/${itemId}`, { quantidade: novaQuantidade });
      await carregarCarrinho();
    } catch (error) {
      console.error('Erro ao atualizar quantidade:', error);
      throw error;
    }
  };

  // 4. DELETE /api/carrinho/item/:itemId - Remove um item
  const removerDoCarrinho = async (itemId: string) => {
    try {
      await api.delete(`/api/carrinho/item/${itemId}`);
      await carregarCarrinho();
    } catch (error) {
      console.error('Erro ao remover item do carrinho:', error);
      throw error;
    }
  };

  // 5. DELETE /api/carrinho/limpar - Limpa o carrinho todo
  const limparCarrinho = async () => {
    try {
      await api.delete('/api/carrinho/limpar');
      await carregarCarrinho();
    } catch (error) {
      console.error('Erro ao limpar carrinho:', error);
      throw error;
    }
  };

  return (
    <CartContext.Provider
      value={{
        itens,
        quantidadeTotal,
        subtotal,
        loading,
        carregarCarrinho,
        adicionarAoCarrinho,
        atualizarQuantidade,
        removerDoCarrinho,
        limparCarrinho,
      }}
    >
      {children}
    </CartContext.Provider>
  );
};

export const useCart = (): CartContextData => {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart deve ser usado dentro de um CartProvider');
  }
  return context;
};