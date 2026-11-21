import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import api from '../../../../api';
import { socket } from '../../../../services/socket';

export interface ItemCarrinho {
  id: string;
  produtoId: string;
  nome: string;
  precoUnitario: number;
  quantidade: number;
  quantidadeDesejada?: number;
  totalItem: number;
  tamanho: { id: string; nome: string } | null;
  cor: { id: string; nome: string; hex?: string } | null;
  imagemUrl: string | null;
  selecionado: boolean;
  esgotado?: boolean;
  estoqueDisponivel?: number;
}

export interface ItemConferidoSync {
  produtoId: string;
  tamanhoId: string | null;
  corId: string | null;
  quantidadeAprovada: number;
  quantidadeDisponivel: number;
  status: 'DISPONIVEL' | 'QUANTIDADE_AJUSTADA' | 'ESGOTADO';
}

interface CartContextData {
  itens: ItemCarrinho[];
  quantidadeTotal: number;
  quantidadeTotalSelecionados: number;
  subtotal: number;
  subtotalSelecionados: number;
  loading: boolean;
  carregarCarrinho: () => Promise<void>;
  sincronizarItensComConferencia: (conferidos: ItemConferidoSync[]) => Promise<void>;
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
  const [loading, setLoading] = useState(false);

  // 1. GET /api/carrinho - Busca o carrinho preservando o estado de esgotado anterior
  const carregarCarrinho = useCallback(async () => {
    try {
      setLoading(true);
      const response = await api.get('/api/carrinho');

      setItens((prevItens) => {
        const itensDoBanco: ItemCarrinho[] = (response.data.itens || []).map((item: any) => {
          const itemAnterior = prevItens.find(
            (p) =>
              p.id === item.id ||
              (p.produtoId === item.produtoId &&
                p.tamanho?.id === item.tamanho?.id &&
                p.cor?.id === item.cor?.id)
          );

          const saldoEstoque =
            item.estoque !== undefined
              ? Number(item.estoque)
              : item.variacaoEstoque !== undefined
              ? Number(item.variacaoEstoque)
              : itemAnterior?.estoqueDisponivel !== undefined
              ? itemAnterior.estoqueDisponivel
              : 999;

          const estaEsgotado =
            saldoEstoque <= 0 || (itemAnterior?.esgotado === true && saldoEstoque === 999);

          const qtdBanco = Number(item.quantidade || 1);
          const qtdDesejada =
            qtdBanco > 0
              ? qtdBanco
              : itemAnterior?.quantidadeDesejada && itemAnterior.quantidadeDesejada > 0
              ? itemAnterior.quantidadeDesejada
              : 1;

          const qtdFinal = estaEsgotado
            ? 0
            : qtdBanco > 0
            ? Math.min(qtdBanco, saldoEstoque)
            : Math.min(qtdDesejada, saldoEstoque);

          const precoUnit = Number(item.precoUnitario || 0);

          return {
            ...item,
            quantidade: qtdFinal,
            quantidadeDesejada: qtdDesejada,
            totalItem: Number((precoUnit * qtdFinal).toFixed(2)),
            estoqueDisponivel: saldoEstoque,
            esgotado: estaEsgotado,
            selecionado: estaEsgotado ? false : itemAnterior ? itemAnterior.selecionado : true,
          };
        });
        return itensDoBanco;
      });
    } catch (error) {
      console.error('Erro ao carregar carrinho:', error);
      setItens([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    carregarCarrinho();
  }, [carregarCarrinho]);

  // 🔌 2. Sincronização em Tempo Real via WebSocket (Estoque e Preço/Oferta)
  useEffect(() => {
    const handleProdutoAtualizado = (produtoAtualizado: any) => {
      const itensParaSincronizarBackend: Array<{ id: string; quantidade: number }> = [];

      setItens((prevItens) =>
        prevItens.map((item) => {
          if (item.produtoId === produtoAtualizado.id) {
            const precoVigente =
              produtoAtualizado.temOferta && produtoAtualizado.precoPromocional
                ? Number(produtoAtualizado.precoPromocional)
                : Number(produtoAtualizado.preco ?? item.precoUnitario);

            const listaVariacoes =
              produtoAtualizado.estoques || produtoAtualizado.variacoes || [];

            const estoqueEncontrado = listaVariacoes.find((est: any) => {
              const tamanhoItem = item.tamanho?.id || item.tamanho?.nome;
              const corItem = item.cor?.id || item.cor?.nome;

              const tamanhoEst =
                est.tamanho?.id || est.tamanhoId || est.tamanho?.nome || est.tamanho;
              const corEst = est.cor?.id || est.corId || est.cor?.nome || est.cor;

              const mesmoTamanho =
                !tamanhoItem || !tamanhoEst || String(tamanhoEst) === String(tamanhoItem);
              const mesmaCor = !corItem || !corEst || String(corEst) === String(corItem);

              return mesmoTamanho && mesmaCor;
            });

            const saldoDisponivel = estoqueEncontrado ? Number(estoqueEncontrado.estoque) : 0;
            const estaEsgotado = saldoDisponivel <= 0;
            const eraEsgotado = Boolean(item.esgotado) || Number(item.quantidade) <= 0;

            const qtdDesejadaSalva =
              item.quantidade > 0
                ? item.quantidade
                : item.quantidadeDesejada && item.quantidadeDesejada > 0
                ? item.quantidadeDesejada
                : 1;

            const novaQuantidade = estaEsgotado
              ? 0
              : eraEsgotado
              ? Math.min(qtdDesejadaSalva, saldoDisponivel)
              : Math.min(item.quantidade, saldoDisponivel);

            if (!estaEsgotado && novaQuantidade > 0 && novaQuantidade !== item.quantidade && item.id) {
              itensParaSincronizarBackend.push({ id: item.id, quantidade: novaQuantidade });
            }

            return {
              ...item,
              quantidadeDesejada: qtdDesejadaSalva,
              quantidade: novaQuantidade,
              precoUnitario: precoVigente,
              totalItem: Number((precoVigente * novaQuantidade).toFixed(2)),
              estoqueDisponivel: saldoDisponivel,
              esgotado: estaEsgotado,
              selecionado: estaEsgotado ? false : eraEsgotado ? true : item.selecionado,
            };
          }
          return item;
        })
      );

      itensParaSincronizarBackend.forEach(({ id, quantidade }) => {
        api.put(`/api/carrinho/item/${id}`, { quantidade }).catch((err) => {
          console.error('Erro ao sincronizar quantidade no carrinho:', err);
        });
      });
    };

    socket.on('produtoAtualizado', handleProdutoAtualizado);
    socket.on('produto-atualizado', handleProdutoAtualizado);

    return () => {
      socket.off('produtoAtualizado', handleProdutoAtualizado);
      socket.off('produto-atualizado', handleProdutoAtualizado);
    };
  }, []);

  // Sincroniza quantidades reduzidas ou itens esgotados vindos da conferência do checkout
  const sincronizarItensComConferencia = useCallback(async (conferidos: ItemConferidoSync[]) => {
    if (!Array.isArray(conferidos) || conferidos.length === 0) return;

    const atualizacoesBackend: Array<{ id: string; quantidade: number }> = [];

    setItens((prevItens) =>
      prevItens.map((item) => {
        const match = conferidos.find(
          (c) =>
            String(c.produtoId) === String(item.produtoId) &&
            String(c.tamanhoId || '') === String(item.tamanho?.id || '') &&
            String(c.corId || '') === String(item.cor?.id || '')
        );

        if (!match) return item;

        const estaEsgotado = match.status === 'ESGOTADO' || Number(match.quantidadeDisponivel) <= 0;
        const qtdAprovada = estaEsgotado ? 0 : Math.max(0, Number(match.quantidadeAprovada || 0));

        if (!estaEsgotado && qtdAprovada > 0 && qtdAprovada !== item.quantidade && item.id) {
          atualizacoesBackend.push({ id: item.id, quantidade: qtdAprovada });
        }

        return {
          ...item,
          quantidadeDesejada: item.quantidade > 0 ? item.quantidade : item.quantidadeDesejada || 1,
          quantidade: qtdAprovada,
          totalItem: Number((item.precoUnitario * qtdAprovada).toFixed(2)),
          estoqueDisponivel: Number(match.quantidadeDisponivel ?? 0),
          esgotado: estaEsgotado,
          selecionado: estaEsgotado ? false : item.selecionado,
        };
      })
    );

    await Promise.all(
      atualizacoesBackend.map(({ id, quantidade }) =>
        api.put(`/api/carrinho/item/${id}`, { quantidade }).catch((err) => {
          console.error('Erro ao persistir quantidade ajustada no carrinho:', err);
        })
      )
    );
  }, []);

  const toggleItemSelecao = (itemId: string) => {
    setItens((prev) =>
      prev.map((item) =>
        item.id === itemId && !item.esgotado ? { ...item, selecionado: !item.selecionado } : item
      )
    );
  };

  const toggleTodosItens = (selecionar: boolean) => {
    setItens((prev) =>
      prev.map((item) => ({
        ...item,
        selecionado: item.esgotado ? false : selecionar,
      }))
    );
  };

  // Totais derivados diretamente da lista atualizada de itens
  const quantidadeTotal = itens
    .filter((item) => !item.esgotado)
    .reduce((acc, item) => acc + Number(item.quantidade || 0), 0);

  const subtotal = Number(
    itens
      .filter((item) => !item.esgotado)
      .reduce((acc, item) => acc + Number(item.totalItem || 0), 0)
      .toFixed(2)
  );

  const subtotalSelecionados = Number(
    itens
      .filter((item) => item.selecionado && !item.esgotado)
      .reduce((acc, item) => acc + Number(item.totalItem || 0), 0)
      .toFixed(2)
  );

  const quantidadeTotalSelecionados = itens
    .filter((item) => item.selecionado && !item.esgotado)
    .reduce((acc, item) => acc + Number(item.quantidade || 0), 0);

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
        sincronizarItensComConferencia,
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