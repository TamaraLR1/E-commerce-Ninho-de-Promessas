import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import api from '../../../../api'; 
import { socket } from '../../../../services/socket';

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
  selecionado: boolean;
  esgotado?: boolean;         
  estoqueDisponivel?: number; 
}

interface CartContextData {
  itens: ItemCarrinho[];
  quantidadeTotal: number;
  quantidadeTotalSelecionados: number;
  subtotal: number;
  subtotalSelecionados: number;
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
  toggleItemSelecao: (itemId: string) => void;
  toggleTodosItens: (selecionar: boolean) => void;
}

const CartContext = createContext<CartContextData>({} as CartContextData);

export const CartProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [itens, setItens] = useState<ItemCarrinho[]>([]);
  const [quantidadeTotal, setQuantidadeTotal] = useState(0);
  const [subtotal, setSubtotal] = useState(0);
  const [loading, setLoading] = useState(false);

  // 1. GET /api/carrinho - Busca o carrinho preservando o estado de esgotado anterior
  const carregarCarrinho = useCallback(async () => {
    try {
      setLoading(true);
      const response = await api.get('/api/carrinho');
      
      setItens(prevItens => {
        const itensDoBanco: ItemCarrinho[] = (response.data.itens || []).map((item: any) => {
          const itemAnterior = prevItens.find(
            p => p.id === item.id || (p.produtoId === item.produtoId && p.tamanho?.id === item.tamanho?.id && p.cor?.id === item.cor?.id)
          );

          const saldoEstoque = item.estoque !== undefined 
            ? Number(item.estoque) 
            : (item.variacaoEstoque !== undefined 
                ? Number(item.variacaoEstoque) 
                : (itemAnterior?.estoqueDisponivel !== undefined ? itemAnterior.estoqueDisponivel : 999));

          const estaEsgotado = saldoEstoque <= 0 || (itemAnterior?.esgotado === true && saldoEstoque === 999);

          return {
            ...item,
            estoqueDisponivel: saldoEstoque,
            esgotado: estaEsgotado,
            selecionado: estaEsgotado ? false : (itemAnterior ? itemAnterior.selecionado : true),
            quantidade: Math.min(item.quantidade, Math.max(saldoEstoque > 0 ? saldoEstoque : 1, item.quantidade))
          };
        });
        return itensDoBanco;
      });

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

  // 🔌 2. Sincronização em Tempo Real via WebSocket (Atualização de Stock)
  useEffect(() => {
    const handleProdutoAtualizado = (produtoAtualizado: any) => {
      setItens(prevItens =>
        prevItens.map(item => {
          if (item.produtoId === produtoAtualizado.id) {
            const estoqueEncontrado = produtoAtualizado.estoques?.find((est: any) => {
              const mesmoTamanho = item.tamanho ? est.tamanho?.id === item.tamanho.id || est.tamanho?.nome === item.tamanho.nome : true;
              const mesmaCor = item.cor ? est.cor?.id === item.cor.id || est.cor?.nome === item.cor.nome : true;
              return mesmoTamanho && mesmaCor;
            });

            const saldoDisponivel = estoqueEncontrado ? Number(estoqueEncontrado.estoque) : 0;
            const estaEsgotado = saldoDisponivel <= 0;

            return {
              ...item,
              estoqueDisponivel: saldoDisponivel,
              esgotado: estaEsgotado,
              selecionado: estaEsgotado ? false : item.selecionado,
              quantidade: Math.min(item.quantidade, Math.max(saldoDisponivel, 0))
            };
          }
          return item;
        })
      );
    };

    socket.on('produtoAtualizado', handleProdutoAtualizado);
    socket.on('produto-atualizado', handleProdutoAtualizado);

    return () => {
      socket.off('produtoAtualizado', handleProdutoAtualizado);
      socket.off('produto-atualizado', handleProdutoAtualizado);
    };
  }, []);

  const toggleItemSelecao = (itemId: string) => {
    setItens(prev =>
      prev.map(item =>
        item.id === itemId && !item.esgotado ? { ...item, selecionado: !item.selecionado } : item
      )
    );
  };

  const toggleTodosItens = (selecionar: boolean) => {
    setItens(prev => prev.map(item => ({ 
      ...item, 
      selecionado: item.esgotado ? false : selecionar 
    })));
  };

  const subtotalSelecionados = itens
    .filter(item => item.selecionado && !item.esgotado)
    .reduce((acc, item) => acc + item.totalItem, 0);

  const quantidadeTotalSelecionados = itens
    .filter(item => item.selecionado && !item.esgotado)
    .reduce((acc, item) => acc + item.quantidade, 0);

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

  const atualizarQuantidade = async (itemId: string, novaQuantidade: number) => {
    if (novaQuantidade < 1) return;

    try {
      await api.put(`/api/carrinho/item/${itemId}`, { quantidade: novaQuantidade });
      await carregarCarrinho();
    } catch (error) {
      console.error('Erro ao atualizar quantidade:', error);
      throw error;
    }
  };

  const removerDoCarrinho = async (itemId: string) => {
    try {
      await api.delete(`/api/carrinho/item/${itemId}`);
      await carregarCarrinho();
    } catch (error) {
      console.error('Erro ao remover item do carrinho:', error);
      throw error;
    }
  };

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
        quantidadeTotalSelecionados,
        subtotal,
        subtotalSelecionados,
        loading,
        carregarCarrinho,
        adicionarAoCarrinho,
        atualizarQuantidade,
        removerDoCarrinho,
        limparCarrinho,
        toggleItemSelecao,
        toggleTodosItens,
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