import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { io } from 'socket.io-client';
import styles from './OrdersModal.module.css';

interface ItemPedido {
  id: string;
  produtoId?: string;
  tamanhoId?: string;
  corId?: string;
  nomeProduto?: string;
  produto?: { id: string; nome: string; imagens?: { url: string }[] };
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
  status: 'PENDENTE' | 'RECUSADO' | 'PAGO' | 'EM_SEPARACAO' | 'ENVIADO' | 'ENTREGUE' | 'CANCELADO';
  valorTotal?: number;
  total?: number;
  codigoRastreio?: string;
  rastreioCodigo?: string;
  createdAt?: string;
  dataCriacao?: string;
  qrCodePix?: string;
  qrCodeBase64Pix?: string;
  itens: ItemPedido[];
  historicoStatus?: HistoricoStatus[];
}

interface OrdersModalProps {
  isOpen: boolean;
  onClose: () => void;
  apiUrl: string;
  userId?: number;
  onRefazerPagamento?: (pedido: Pedido) => void;
}

const statusSteps = ['PENDENTE', 'PAGO', 'EM_SEPARACAO', 'ENVIADO', 'ENTREGUE'];

const formatarStatusAmigavel = (status: string) => {
  const mapa: Record<string, string> = {
    PENDENTE: 'Aguardando Pagamento',
    RECUSADO: 'Pagamento Recusado',
    PAGO: 'Pagamento Aprovado',
    EM_SEPARACAO: 'Em Separação',
    ENVIADO: 'Pedido Enviado',
    ENTREGUE: 'Pedido Entregue',
    CANCELADO: 'Pedido Cancelado'
  };
  return mapa[status] || status;
};

// Verifica se o PIX ainda está dentro da janela de 30 minutos
const isPixValido = (dataCriacao?: string) => {
  if (!dataCriacao) return false;
  const dataPedido = new Date(dataCriacao).getTime();
  const agora = new Date().getTime();
  const trintaMinutosMs = 30 * 60 * 1000;
  return (agora - dataPedido) < trintaMinutosMs;
};

const calcularPrevisaoEntrega = (dataCriacao: string | undefined) => {
  if (!dataCriacao) return null;
  const data = new Date(dataCriacao);
  if (isNaN(data.getTime())) return null;

  const DIAS_PROCESSAMENTO = 5;
  const TRANSPORTADORA_MIN = 3;
  const TRANSPORTADORA_MAX = 7;

  const minDate = new Date(data);
  minDate.setDate(minDate.getDate() + DIAS_PROCESSAMENTO + TRANSPORTADORA_MIN);

  const maxDate = new Date(data);
  maxDate.setDate(maxDate.getDate() + DIAS_PROCESSAMENTO + TRANSPORTADORA_MAX);

  const formatOptions: Intl.DateTimeFormatOptions = { day: '2-digit', month: '2-digit' };
  return `${minDate.toLocaleDateString('pt-BR', formatOptions)} a ${maxDate.toLocaleDateString('pt-BR', formatOptions)}`;
};

export const OrdersModal: React.FC<OrdersModalProps> = ({ isOpen, onClose, apiUrl, userId, onRefazerPagamento }) => {
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [loading, setLoading] = useState(false);
  const [pixAbertoId, setPixAbertoId] = useState<string | null>(null);
  const [copiadoId, setCopiadoId] = useState<string | null>(null);

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

  const handleCopiarPix = (codigo: string, pedidoId: string) => {
    navigator.clipboard.writeText(codigo);
    setCopiadoId(pedidoId);
    setTimeout(() => setCopiadoId(null), 3000);
  };

  if (!isOpen) return null;

  // Renderiza a barra visual com tratamento de erro (bolinha vermelha)
  const renderProgressBar = (pedido: Pedido) => {
    const { status } = pedido;
    const dataCriacaoBase = pedido.createdAt || pedido.dataCriacao;
    const pixValido = isPixValido(dataCriacaoBase);

    // Identifica se foi recusado no Cartão, Cancelado ou PIX Expirado
    const foiRecusadoOuExpirado = 
      status === 'CANCELADO' || 
      status === 'RECUSADO' || 
      (status === 'PENDENTE' && !pixValido);

    const currentIndex = statusSteps.indexOf(status);
    const percentage = currentIndex >= 0 && !foiRecusadoOuExpirado 
      ? (currentIndex / (statusSteps.length - 1)) * 100 
      : 0;

    return (
      <div className={styles.progressContainer}>
        <div className={styles.progressTrack}>
          <div 
            className={styles.progressBarFill} 
            style={{ width: `${percentage}%` }}
          />
        </div>
        <div className={styles.stepsRow}>
          {/* Ponto 1: Fica vermelho se houver recusa em cartão ou PIX expirado */}
          <div 
            className={`${styles.stepDot} ${currentIndex >= 0 && !foiRecusadoOuExpirado ? styles.stepActive : ''}`}
            style={foiRecusadoOuExpirado ? { color: '#ef4444' } : undefined}
          >
            <span style={foiRecusadoOuExpirado ? { backgroundColor: '#ef4444', color: '#ffffff', borderColor: '#ef4444' } : undefined}>
              {foiRecusadoOuExpirado ? '✖' : '⏳'}
            </span>
            <p style={foiRecusadoOuExpirado ? { color: '#ef4444' } : undefined}>
              {foiRecusadoOuExpirado ? 'Recusado' : 'Pendente'}
            </p>
          </div>

          <div className={`${styles.stepDot} ${currentIndex >= 1 && !foiRecusadoOuExpirado ? styles.stepActive : ''}`}>
            <span>💳</span>
            <p>Pago</p>
          </div>
          <div className={`${styles.stepDot} ${currentIndex >= 2 && !foiRecusadoOuExpirado ? styles.stepActive : ''}`}>
            <span>📦</span>
            <p>Separação</p>
          </div>
          <div className={`${styles.stepDot} ${currentIndex >= 3 && !foiRecusadoOuExpirado ? styles.stepActive : ''}`}>
            <span>🚚</span>
            <p>Enviado</p>
          </div>
          <div className={`${styles.stepDot} ${currentIndex >= 4 && !foiRecusadoOuExpirado ? styles.stepActive : ''}`}>
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
              
              const previsao = calcularPrevisaoEntrega(dataCriacaoBase);
              const pixAindaValido = isPixValido(dataCriacaoBase);

              return (
                <div key={pedido.id} className={styles.orderCard}>
                  <div className={styles.orderCardHeader}>
                    <div>
                      <strong className={styles.orderCode}>Pedido #{codExibicao}</strong>
                      <span className={styles.orderDate}>{dataFormatada}</span>
                    </div>
                    <span className={styles.orderTotal}>R$ {valorFinal.toFixed(2)}</span>
                  </div>

                  {renderProgressBar(pedido)}

                  {/* PREVISÃO DE ENTREGA */}
                  {pedido.status !== 'CANCELADO' && pedido.status !== 'RECUSADO' && pedido.status !== 'ENTREGUE' && previsao && (
                    <div className={styles.trackingBox}>
                      <span style={{ color: '#15803d' }}>🗓️ Previsão de Entrega:</span>
                      <strong>Entre {previsao}</strong>
                    </div>
                  )}

                  {/* BOTÃO DE AÇÃO DISCRETO PARA PIX OU REFAZER PAGAMENTO */}
                  {pedido.status === 'PENDENTE' && (
                    <div className={styles.paymentActionBox}>
                      {pixAindaValido ? (
                        <>
                          <button
                            type="button"
                            className={styles.pixBtn}
                            onClick={() => setPixAbertoId(pixAbertoId === pedido.id ? null : pedido.id)}
                          >
                            ⚡ {pixAbertoId === pedido.id ? 'Ocultar QR Code PIX' : 'Ver QR Code / Copiar PIX'}
                          </button>

                          {pixAbertoId === pedido.id && pedido.qrCodePix && (
                            <div className={styles.pixContainerModal}>
                              {pedido.qrCodeBase64Pix && (
                                <img
                                  src={`data:image/jpeg;base64,${pedido.qrCodeBase64Pix}`}
                                  alt="QR Code PIX"
                                  style={{ width: '130px', height: '130px' }}
                                />
                              )}
                              <div className={styles.pixCodeBox}>
                                <input type="text" readOnly value={pedido.qrCodePix} className={styles.pixInput} />
                                <button
                                  type="button"
                                  className={styles.pixBtn}
                                  style={{ width: 'auto', padding: '6px 12px' }}
                                  onClick={() => handleCopiarPix(pedido.qrCodePix!, pedido.id)}
                                >
                                  {copiadoId === pedido.id ? 'Copiado! ✅' : 'Copiar'}
                                </button>
                              </div>
                            </div>
                          )}
                        </>
                      ) : (
                        <button
                          type="button"
                          className={styles.retryBtn}
                          onClick={() => {
                            onClose();
                            if (onRefazerPagamento) onRefazerPagamento(pedido);
                          }}
                        >
                          🔄 Refazer Pagamento
                        </button>
                      )}
                    </div>
                  )}

                  {(pedido.status === 'CANCELADO' || pedido.status === 'RECUSADO') && (
                    <div className={styles.paymentActionBox}>
                      <button
                        type="button"
                        className={styles.retryBtn}
                        onClick={() => {
                          onClose();
                          if (onRefazerPagamento) onRefazerPagamento(pedido);
                        }}
                      >
                        🔄 Refazer Pagamento
                      </button>
                    </div>
                  )}

                  {codigoRastreio && (
                    <div className={styles.trackingBox} style={{ marginTop: '8px' }}>
                      <span>🚚 Código de Rastreio:</span>
                      <strong>{codigoRastreio}</strong>
                    </div>
                  )}

                  {/* HISTÓRICO DE STATUS */}
                  {pedido.historicoStatus && pedido.historicoStatus.length > 0 && (
                    <div style={{ marginTop: '12px', marginBottom: '12px', padding: '10px', backgroundColor: '#ffffff', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                      <h4 style={{ margin: '0 0 8px 0', fontSize: '0.8rem', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        ⏱️ Histórico
                      </h4>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {pedido.historicoStatus.map((hist, idx) => (
                          <div key={hist.id || idx} style={{ display: 'flex', gap: '10px', fontSize: '0.8rem', borderLeft: '2px solid #cbd5e1', paddingLeft: '8px' }}>
                            <span style={{ color: '#64748b', minWidth: '110px', fontWeight: 500 }}>
                              {new Date(hist.data).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                            </span>
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                              <strong style={{ color: '#0f172a' }}>{formatarStatusAmigavel(hist.status)}</strong>
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