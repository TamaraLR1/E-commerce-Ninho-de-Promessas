import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { io } from 'socket.io-client';
import styles from './OrdersModal.module.css';

interface ItemPedido {
  id: string;
  nomeProduto?: string;
  produto?: { nome: string; imagens?: { url: string }[] };
  corNome?: string;
  tamanho?: string;
  quantidade: number;
  precoUnitario: number;
  imagemUrl?: string;
}

interface Pedido {
  id: string;
  userId?: number;
  codigoPedido?: string;
  status: 'PENDENTE' | 'PAGO' | 'EM_SEPARACAO' | 'ENVIADO' | 'ENTREGUE' | 'CANCELADO';
  valorTotal?: number;
  total?: number;
  codigoRastreio?: string;
  rastreioCodigo?: string;
  createdAt?: string;
  dataCriacao?: string;
  itens: ItemPedido[];
}

interface OrdersModalProps {
  isOpen: boolean;
  onClose: () => void;
  apiUrl: string;
  userId?: number;
}

const statusSteps = ['PENDENTE', 'PAGO', 'EM_SEPARACAO', 'ENVIADO', 'ENTREGUE'];

export const OrdersModal: React.FC<OrdersModalProps> = ({ isOpen, onClose, apiUrl, userId }) => {
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [loading, setLoading] = useState(false);

  // Instancia o Socket usando a apiUrl dinâmica (http://localhost:3333 em dev ou https://ninhoback.tamaralr.com.br em produção)
  const socket = useMemo(() => {
    return io(apiUrl, {
      transports: ['polling', 'websocket'],
      withCredentials: true,
    });
  }, [apiUrl]);

  useEffect(() => {
    if (isOpen) {
      carregarMeusPedidos();
    }
  }, [isOpen]);

  // --- ATUALIZAÇÃO EM TEMPO REAL VIA SOCKET ---
  useEffect(() => {
    if (!isOpen) return;

    if (userId) {
      socket.emit('joinUserRoom', userId);
    }

    const handlePedidoAtualizado = (pedidoAtualizado: any) => {
      setPedidos((pedidosAnteriores) =>
        pedidosAnteriores.map((p) =>
          p.id === pedidoAtualizado.id ? { ...p, ...pedidoAtualizado } : p
        )
      );
    };

    socket.on('pedidoAtualizado', handlePedidoAtualizado);
    socket.on('pedidoRastreioAtualizado', handlePedidoAtualizado);

    return () => {
      socket.off('pedidoAtualizado', handlePedidoAtualizado);
      socket.off('pedidoRastreioAtualizado', handlePedidoAtualizado);
    };
  }, [isOpen, userId, socket]);

  const carregarMeusPedidos = async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${apiUrl}/api/pedidos/meus`, { withCredentials: true });
      if (response.data && Array.isArray(response.data)) {
        setPedidos(response.data);
      }
    } catch (err) {
      console.error('Erro ao carregar histórico de pedidos', err);
    } finally {
      setLoading(false);
    }
  };

  const getImageUrl = (url?: string) => {
    if (!url) return 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?q=80&w=200';
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    return `${apiUrl}${url.startsWith('/') ? '' : '/'}${url}`;
  };

  if (!isOpen) return null;

  const renderProgressBar = (status: Pedido['status']) => {
    if (status === 'CANCELADO') {
      return <div className={styles.statusCanceledBadge}>❌ Pedido Cancelado</div>;
    }

    const currentIndex = statusSteps.indexOf(status);
    const percentage = currentIndex >= 0 ? (currentIndex / (statusSteps.length - 1)) * 100 : 0;

    return (
      <div className={styles.progressContainer}>
        <div className={styles.progressTrack}>
          <div 
            className={styles.progressBarFill} 
            style={{ width: `${percentage}%` }}
          />
        </div>
        <div className={styles.stepsRow}>
          <div className={`${styles.stepDot} ${currentIndex >= 0 ? styles.stepActive : ''}`}>
            <span>⏳</span>
            <p>Pendente</p>
          </div>
          <div className={`${styles.stepDot} ${currentIndex >= 1 ? styles.stepActive : ''}`}>
            <span>💳</span>
            <p>Pago</p>
          </div>
          <div className={`${styles.stepDot} ${currentIndex >= 2 ? styles.stepActive : ''}`}>
            <span>📦</span>
            <p>Separação</p>
          </div>
          <div className={`${styles.stepDot} ${currentIndex >= 3 ? styles.stepActive : ''}`}>
            <span>🚚</span>
            <p>Enviado</p>
          </div>
          <div className={`${styles.stepDot} ${currentIndex >= 4 ? styles.stepActive : ''}`}>
            <span>✅</span>
            <p>Entregue</p>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h3>🛍️ Meus Pedidos</h3>
          <button type="button" className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        {loading ? (
          <p className={styles.loadingNotice}>Buscando suas compras...</p>
        ) : pedidos.length === 0 ? (
          <div className={styles.emptyNotice}>
            <span>🛒</span>
            <p>Você ainda não realizou nenhum pedido em nossa loja.</p>
          </div>
        ) : (
          <div className={styles.ordersList}>
            {pedidos.map((pedido) => {
              const codExibicao = pedido.codigoPedido || pedido.id.slice(0, 8);
              const dataFormatada = new Date(pedido.createdAt || pedido.dataCriacao || '').toLocaleDateString('pt-BR', {
                day: '2-digit', month: '2-digit', year: 'numeric'
              });
              const valorFinal = Number(pedido.total || pedido.valorTotal || 0);
              const codigoRastreio = pedido.codigoRastreio || pedido.rastreioCodigo;

              return (
                <div key={pedido.id} className={styles.orderCard}>
                  <div className={styles.orderCardHeader}>
                    <div>
                      <strong className={styles.orderCode}>Pedido #{codExibicao}</strong>
                      <span className={styles.orderDate}>{dataFormatada}</span>
                    </div>
                    <span className={styles.orderTotal}>R$ {valorFinal.toFixed(2)}</span>
                  </div>

                  {renderProgressBar(pedido.status)}

                  {codigoRastreio && (
                    <div className={styles.trackingBox}>
                      <span>🚚 Código de Rastreio:</span>
                      <strong>{codigoRastreio}</strong>
                    </div>
                  )}

                  <div className={styles.itemsSummary}>
                    {pedido.itens?.map((item, idx) => {
                      const nomeProd = item.nomeProduto || item.produto?.nome || 'Produto';
                      const rawImg = item.imagemUrl || item.produto?.imagens?.[0]?.url;
                      const imgUrl = getImageUrl(rawImg);

                      return (
                        <div key={item.id || idx} className={styles.itemRow}>
                          <img src={imgUrl} alt={nomeProd} className={styles.itemThumb} />
                          <div className={styles.itemMeta}>
                            <p className={styles.itemName}>{nomeProd}</p>
                            <span className={styles.itemSub}>
                              {item.corNome && `Cor: ${item.corNome}`} {item.tamanho && `| Tam: ${item.tamanho}`} | Qtd: {item.quantidade}
                            </span>
                          </div>
                          <span className={styles.itemPrice}>
                            R$ {(Number(item.precoUnitario) * Number(item.quantidade)).toFixed(2)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};