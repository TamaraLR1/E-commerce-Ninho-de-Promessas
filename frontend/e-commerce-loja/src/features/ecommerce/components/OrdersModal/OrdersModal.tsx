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

interface HistoricoStatus {
  id?: string;
  status: string;
  data: string;
  observacao?: string;
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
  historicoStatus?: HistoricoStatus[];
}

interface OrdersModalProps {
  isOpen: boolean;
  onClose: () => void;
  apiUrl: string;
  userId?: number;
}

const statusSteps = ['PENDENTE', 'PAGO', 'EM_SEPARACAO', 'ENVIADO', 'ENTREGUE'];

// Função para deixar o status mais amigável para o cliente final
const formatarStatusAmigavel = (status: string) => {
  const mapa: Record<string, string> = {
    PENDENTE: 'Aguardando Pagamento',
    PAGO: 'Pagamento Aprovado',
    EM_SEPARACAO: 'Em Separação',
    ENVIADO: 'Pedido Enviado',
    ENTREGUE: 'Pedido Entregue',
    CANCELADO: 'Pedido Cancelado'
  };
  return mapa[status] || status;
};

// Nova função para calcular a estimativa de entrega baseada na data de compra
const calcularPrevisaoEntrega = (dataCriacao: string | undefined) => {
  if (!dataCriacao) return null;
  const data = new Date(dataCriacao);
  if (isNaN(data.getTime())) return null;

  // Ajuste estes valores conforme a realidade da sua loja e transportadora
  const DIAS_PROCESSAMENTO = 5; // Tempo até despachar
  const TRANSPORTADORA_MIN = 3; // Prazo mínimo da transportadora
  const TRANSPORTADORA_MAX = 7; // Prazo máximo da transportadora

  const minDate = new Date(data);
  minDate.setDate(minDate.getDate() + DIAS_PROCESSAMENTO + TRANSPORTADORA_MIN);

  const maxDate = new Date(data);
  maxDate.setDate(maxDate.getDate() + DIAS_PROCESSAMENTO + TRANSPORTADORA_MAX);

  const formatOptions: Intl.DateTimeFormatOptions = { day: '2-digit', month: '2-digit' };
  return `${minDate.toLocaleDateString('pt-BR', formatOptions)} a ${maxDate.toLocaleDateString('pt-BR', formatOptions)}`;
};

export const OrdersModal: React.FC<OrdersModalProps> = ({ isOpen, onClose, apiUrl, userId }) => {
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [loading, setLoading] = useState(false);

  // Instancia o Socket usando a apiUrl dinâmica
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
              const dataCriacaoBase = pedido.createdAt || pedido.dataCriacao;
              const dataFormatada = new Date(dataCriacaoBase || '').toLocaleDateString('pt-BR', {
                day: '2-digit', month: '2-digit', year: 'numeric'
              });
              const valorFinal = Number(pedido.total || pedido.valorTotal || 0);
              const codigoRastreio = pedido.codigoRastreio || pedido.rastreioCodigo;
              
              // Calcula a previsão apenas uma vez por pedido
              const previsao = calcularPrevisaoEntrega(dataCriacaoBase);

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

                  {/* BLOCO DA PREVISÃO DE ENTREGA */}
                  {pedido.status !== 'CANCELADO' && pedido.status !== 'ENTREGUE' && previsao && (
                    <div className={styles.trackingBox} style={{ backgroundColor: '#f0fdf4', borderColor: '#bbf7d0', color: '#166534', marginTop: '12px' }}>
                      <span style={{ color: '#15803d' }}>🗓️ Previsão de Entrega:</span>
                      <strong>Entre {previsao}</strong>
                    </div>
                  )}

                  {codigoRastreio && (
                    <div className={styles.trackingBox} style={{ marginTop: '8px' }}>
                      <span>🚚 Código de Rastreio:</span>
                      <strong>{codigoRastreio}</strong>
                    </div>
                  )}

                  {/* BLOCO DO HISTÓRICO DE STATUS (LINHA DO TEMPO) */}
                  {pedido.historicoStatus && pedido.historicoStatus.length > 0 && (
                    <div style={{ marginTop: '16px', padding: '12px', backgroundColor: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                      <h4 style={{ margin: '0 0 10px 0', fontSize: '0.85rem', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        ⏱️ Histórico do Pedido
                      </h4>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {pedido.historicoStatus.map((hist, idx) => (
                          <div key={hist.id || idx} style={{ display: 'flex', gap: '10px', fontSize: '0.85rem', borderLeft: '2px solid #cbd5e1', paddingLeft: '10px' }}>
                            <span style={{ color: '#64748b', minWidth: '115px', fontWeight: 500 }}>
                              {new Date(hist.data).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
                            </span>
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                              <strong style={{ color: '#0f172a' }}>{formatarStatusAmigavel(hist.status)}</strong>
                              {hist.observacao && !hist.observacao.includes('via Painel Admin') && (
                                <span style={{ color: '#64748b', fontSize: '0.8rem', fontStyle: 'italic', marginTop: '2px' }}>
                                  {hist.observacao}
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
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