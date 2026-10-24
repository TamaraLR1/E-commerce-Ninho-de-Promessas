import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useCart } from '../../components/CartContext/CartContext';
import styles from './CartDrawer.module.css';

axios.defaults.withCredentials = true;

const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const API_URL = isLocal 
  ? 'http://localhost:3333' 
  : 'https://ninhoback.tamaralr.com.br';

interface CartDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenCheckout: () => void;
  user: any;
}

interface OpcaoFrete {
  name: string;
  price: string;
  custom_delivery_time: number;
}

export const CartDrawer: React.FC<CartDrawerProps> = ({
  isOpen,
  onClose,
  onOpenCheckout,
  user,
}) => {
  const navigate = useNavigate();
  const { 
    itens, 
    quantidadeTotal, 
    quantidadeTotalSelecionados, 
    subtotalSelecionados, 
    atualizarQuantidade, 
    removerDoCarrinho,
    toggleItemSelecao,
    toggleTodosItens
  } = useCart();

  const [cep, setCep] = useState('');
  const [opcoesFrete, setOpcoesFrete] = useState<OpcaoFrete[]>([]);
  const [loadingFrete, setLoadingFrete] = useState(false);
  const [freteSelecionado, setFreteSelecionado] = useState<OpcaoFrete | null>(null);
  const [erroFrete, setErroFrete] = useState('');

  if (!isOpen) return null;

  const itensDisponiveis = itens.filter(item => !item.esgotado);
  const itensSelecionados = itens.filter(item => item.selecionado && !item.esgotado);
  const todosSelecionados = itensDisponiveis.length > 0 && itensDisponiveis.every(i => i.selecionado);

  const handleCalcularFrete = async () => {
    const cepLimpo = cep.replace(/\D/g, '');
    if (cepLimpo.length !== 8) {
      setErroFrete('Digite um CEP válido com 8 dígitos.');
      return;
    }

    if (itensSelecionados.length === 0) {
      setErroFrete('Selecione pelo menos um item disponível para calcular o frete.');
      return;
    }

    try {
      setLoadingFrete(true);
      setErroFrete('');
      setFreteSelecionado(null);

      const response = await axios.post(`${API_URL}/api/frete/calcular`, {
        cepDestino: cepLimpo,
        itens: itensSelecionados.map((item) => ({
          produtoId: (item as any).produtoId || (item as any).product?.id || (item as any).id,
          quantidade: item.quantidade,
        })),
      });

      if (Array.isArray(response.data) && response.data.length > 0) {
        setOpcoesFrete(response.data);
      } else if (response.data?.opcoes && Array.isArray(response.data.opcoes)) {
        setOpcoesFrete(response.data.opcoes);
      } else {
        setErroFrete('Nenhuma opção de frete disponível para este CEP.');
      }
    } catch (err: any) {
      console.error('Erro ao calcular frete:', err);
      setErroFrete(
        err.response?.data?.message || 'Erro ao calcular o frete para este CEP.'
      );
    } finally {
      setLoadingFrete(false);
    }
  };

  const valorFreteNum = freteSelecionado ? parseFloat(freteSelecionado.price) : 0;
  const valorTotalGeral = subtotalSelecionados + valorFreteNum;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.drawer} onClick={(e) => e.stopPropagation()}>
        
        {/* Cabeçalho do Carrinho */}
        <div className={styles.header}>
          <h2>Seu Carrinho ({quantidadeTotal})</h2>
          <button type="button" className={styles.closeButton} onClick={onClose}>
            ✕
          </button>
        </div>

        {/* Opção "Selecionar Todos" */}
        {itensDisponiveis.length > 0 && (
          <div className={styles.selectAllRow}>
            <input
              type="checkbox"
              className={styles.checkboxInput}
              checked={todosSelecionados}
              onChange={(e) => toggleTodosItens(e.target.checked)}
            />
            <label onClick={() => toggleTodosItens(!todosSelecionados)} style={{ cursor: 'pointer' }}>
              Selecionar todos os itens disponíveis ({quantidadeTotalSelecionados} selecionados)
            </label>
          </div>
        )}

        {/* Lista de Produtos */}
        <div className={styles.itemList}>
          {itens.length === 0 ? (
            <div className={styles.emptyCart}>
              <span>🛍️</span>
              <p>Seu carrinho está vazio.</p>
            </div>
          ) : (
            itens.map((item) => (
              <div 
                key={item.id} 
                className={`${styles.cartItem} ${!item.selecionado ? styles.cartItemUnselected : ''}`}
                style={item.esgotado ? { opacity: 0.6, backgroundColor: '#f9f9f9' } : {}}
              >
                {/* Checkbox de Seleção - BLOQUEADO SE ESGOTADO */}
                <input
                  type="checkbox"
                  className={styles.checkboxInput}
                  checked={item.selecionado && !item.esgotado}
                  disabled={item.esgotado}
                  onChange={() => toggleItemSelecao(item.id)}
                />

                <img
                  src={item.imagemUrl || '/placeholder.png'}
                  alt={item.nome}
                  className={styles.itemImage}
                />

                <div className={styles.itemDetails}>
                  <div className={styles.itemHeaderRow}>
                    <h4 className={styles.itemName}>{item.nome}</h4>
                    <span className={styles.itemPrice}>
                      R$ {item.totalItem.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </span>
                  </div>

                  {/* Variações */}
                  <div className={styles.variations}>
                    {item.tamanho && <span className={styles.badge}>Tam: {item.tamanho.nome}</span>}
                    {item.cor && (
                      <span className={styles.badge}>
                        Cor: {item.cor.nome}
                      </span>
                    )}
                  </div>

                  {/* Aviso Visual de Esgotado */}
                  {item.esgotado && (
                    <div style={{ color: '#d9534f', fontWeight: 'bold', fontSize: '0.85rem', marginTop: '4px' }}>
                      ⚠️ Esgotado
                    </div>
                  )}

                  <div className={styles.itemActionsRow}>
                    <button
                      type="button"
                      className={styles.removeButton}
                      onClick={() => removerDoCarrinho(item.id)}
                    >
                      Remover
                    </button>

                    {!item.esgotado && (
                      <div className={styles.qtyControls}>
                        <button
                          type="button"
                          onClick={() => atualizarQuantidade(item.id, item.quantidade - 1)}
                        >
                          -
                        </button>
                        <span>{item.quantidade}</span>
                        <button
                          type="button"
                          onClick={() => atualizarQuantidade(item.id, item.quantidade + 1)}
                        >
                          +
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}

          {/* Seção de Frete */}
          {itensSelecionados.length > 0 && (
            <div className={styles.freteSection}>
              <label className={styles.freteLabel}>🚚 Calcular Frete e Prazo</label>
              <div className={styles.freteInputRow}>
                <input
                  type="text"
                  placeholder="Digite seu CEP"
                  maxLength={9}
                  value={cep}
                  onChange={(e) => setCep(e.target.value)}
                  className={styles.cepInput}
                />
                <button
                  type="button"
                  onClick={handleCalcularFrete}
                  disabled={loadingFrete}
                  className={styles.freteButton}
                >
                  {loadingFrete ? 'Calculando...' : 'OK'}
                </button>
              </div>

              {erroFrete && <p className={styles.erroText}>{erroFrete}</p>}

              {opcoesFrete.length > 0 && (
                <div className={styles.freteOptionsList}>
                  {opcoesFrete.map((opcao, idx) => (
                    <label
                      key={idx}
                      className={`${styles.freteOptionCard} ${
                        freteSelecionado?.name === opcao.name ? styles.selectedFrete : ''
                      }`}
                    >
                      <input
                        type="radio"
                        name="frete"
                        checked={freteSelecionado?.name === opcao.name}
                        onChange={() => setFreteSelecionado(opcao)}
                      />
                      <div className={styles.freteOptionInfo}>
                        <strong>{opcao.name}</strong>
                        <span>Até {opcao.custom_delivery_time} dias úteis</span>
                      </div>
                      <span className={styles.fretePrice}>
                        R$ {parseFloat(opcao.price).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Rodapé Fixo */}
        {itens.length > 0 && (
          <div className={styles.footer}>
            <div className={styles.subtotalRow}>
              <span>Subtotal ({quantidadeTotalSelecionados} itens):</span>
              <strong>R$ {subtotalSelecionados.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong>
            </div>

            {freteSelecionado && (
              <div className={styles.subtotalRow}>
                <span>Frete ({freteSelecionado.name}):</span>
                <span>R$ {valorFreteNum.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
              </div>
            )}

            <div className={styles.totalRow}>
              <span>Total:</span>
              <strong>R$ {valorTotalGeral.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong>
            </div>

            <button
              type="button"
              className={styles.checkoutButton}
              disabled={itensSelecionados.length === 0}
              onClick={() => {
                onClose();
                if (!user) {
                  navigate('/login');
                } else {
                  onOpenCheckout();
                }
              }}
            >
              {itensSelecionados.length === 0 
                ? 'Selecione ao menos 1 item disponível' 
                : `Comprar (${quantidadeTotalSelecionados} ${quantidadeTotalSelecionados === 1 ? 'item' : 'itens'})`}
            </button>

            <button type="button" className={styles.continueButton} onClick={onClose}>
              Continuar Comprando
            </button>
          </div>
        )}
      </div>
    </div>
  );
};