import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { io } from 'socket.io-client';
import { CheckoutModal } from '../CheckoutModal/CheckoutModal';
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

interface EnderecoResumo {
  id?: string;
  cep?: string;
  rua?: string;
  numero?: string;
  complemento?: string | null;
  bairro?: string;
  cidade?: string;
  estado?: string;
}

interface Pedido {
  id: string;
  userId?: number;
  codigoPedido?: string;
  status: 'PENDENTE' | 'RECUSADO' | 'PAGO' | 'EM_SEPARACAO' | 'ENVIADO' | 'ENTREGUE' | 'CANCELADO';
  tipoFaturamento?: 'PF' | 'PJ' | null;
  clienteNome?: string | null;
  clienteNomeFantasia?: string | null;
  clienteCpf?: string | null;
  clienteIndicadorIE?: string | null;
  clienteInscricaoEstadual?: string | null;
  endereco?: EnderecoResumo | null;
  enderecoFiscal?: EnderecoResumo | null;
  valorTotal?: number;
  total?: number;
  codigoRastreio?: string;
  rastreioCodigo?: string;
  createdAt?: string;
  dataCriacao?: string;
  qrCodePix?: string;
  pixCopiaECola?: string;
  qrCodeBase64Pix?: string;
  qrCodeBase64?: string;
  pix?: {
    qrCode?: string;
    qrCodeBase64?: string;
  };
  itens: ItemPedido[];
  historicoStatus?: HistoricoStatus[];
}

interface OrdersModalProps {
  isOpen: boolean;
  onClose: () => void;
  apiUrl: string;
  userId?: number | string;
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
  return mapa[status?.toUpperCase()] || status;
};

const formatarDocumento = (doc?: string | null, tipo?: 'PF' | 'PJ' | null) => {
  if (!doc) return '';
  const digits = String(doc).replace(/\D/g, '');
  if (tipo === 'PJ' || digits.length === 14) {
    return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  }
  if (digits.length === 11) {
    return digits.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
  }
  return doc;
};

const formatarEnderecoLinha = (end?: EnderecoResumo | null) => {
  if (!end || !end.rua) return '';
  const comp = end.complemento ? ` (${end.complemento})` : '';
  const cidUf = [end.cidade, end.estado].filter(Boolean).join('/');
  return `${end.rua}, ${end.numero || 'S/N'}${comp} — ${end.bairro ? `${end.bairro}, ` : ''}${cidUf}`;
};

const isPixValido = (dataCriacao?: string) => {
  if (!dataCriacao) return false;
  const dataPedido = new Date(dataCriacao).getTime();
  const agora = new Date().getTime();
  const quinzeMinutosMs = 15 * 60 * 1000;
  return (agora - dataPedido) < quinzeMinutosMs;
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

export const OrdersModal: React.FC<OrdersModalProps> = ({ isOpen, onClose, apiUrl, userId }) => {
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [loading, setLoading] = useState(false);
  const [pixAbertoId, setPixAbertoId] = useState<string | null>(null);
  const [copiadoId, setCopiadoId] = useState<string | null>(null);
  const [pedidoRefazendo, setPedidoRefazendo] = useState<Pedido | null>(null);

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
        pedidosAnteriores.map((p) => {
          if (p.id !== pedidoAtualizado.id) return p;

          const historicoRecebido =
            pedidoAtualizado.historicoStatus || pedidoAtualizado.HistoricoStatusPedido;

          const novoHistorico =
            Array.isArray(historicoRecebido) && historicoRecebido.length > 0
              ? historicoRecebido
              : p.historicoStatus;

          return {
            ...p,
            ...pedidoAtualizado,
            historicoStatus: novoHistorico,
          };
        })
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
        const normalizados = response.data.map((p: any) => ({
          ...p,
          historicoStatus: p.historicoStatus || p.HistoricoStatusPedido || [],
        }));
        setPedidos(normalizados);
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

  const handleAbrirCheckoutRefazer = (pedido: Pedido) => {
    localStorage.setItem('pedidoParaRefazerId', pedido.id);
    setPedidoRefazendo(pedido);
  };

  if (!isOpen) return null;

  const renderProgressBar = (pedido: Pedido) => {
    const statusUpper = (pedido.status || '').toUpperCase();

    const foiRecusadoOuExpirado =
      statusUpper === 'CANCELADO' ||
      statusUpper === 'RECUSADO';

    const currentIndex = statusSteps.indexOf(statusUpper);
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
          <div
            className={`${styles.stepDot} ${currentIndex >= 0 && !foiRecusadoOuExpirado ? styles.stepActive : ''}`}
            style={foiRecusadoOuExpirado ? { color: '#ef4444' } : undefined}
          >
            <span style={foiRecusadoOuExpirado ? { backgroundColor: '#ef4444', color: '#ffffff', borderColor: '#ef4444' } : undefined}>
              {foiRecusadoOuExpirado ? '✖' : '⏳'}
            </span>
            <p style={foiRecusadoOuExpirado ? { color: '#ef4444' } : undefined}>
              {foiRecusadoOuExpirado ? 'Expirado/Recusado' : 'Pendente'}
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
    <>
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
                const statusUpper = (pedido.status || '').toUpperCase();
                const codExibicao = pedido.codigoPedido || pedido.id.slice(0, 8);
                const dataCriacaoBase = pedido.createdAt || pedido.dataCriacao;
                const dataFormatada = new Date(dataCriacaoBase || '').toLocaleDateString('pt-BR', {
                  day: '2-digit', month: '2-digit', year: 'numeric'
                });
                const valorFinal = Number(pedido.total || pedido.valorTotal || 0);
                const codigoRastreio = pedido.codigoRastreio || pedido.rastreioCodigo;

                const isPJ = pedido.tipoFaturamento === 'PJ';
                const docFormatado = formatarDocumento(pedido.clienteCpf, pedido.tipoFaturamento);
                const endEntregaTexto = formatarEnderecoLinha(pedido.endereco);
                const endFiscalTexto = formatarEnderecoLinha(pedido.enderecoFiscal);
                const mostrarEndFiscalSeparado =
                  Boolean(endFiscalTexto) &&
                  (!pedido.enderecoFiscal?.id || pedido.enderecoFiscal.id !== pedido.endereco?.id) &&
                  endFiscalTexto !== endEntregaTexto;

                const previsao = calcularPrevisaoEntrega(dataCriacaoBase);
                const pixAindaValido = isPixValido(dataCriacaoBase);

                const statusAprovados = ['PAGO', 'EM_SEPARACAO', 'ENVIADO', 'ENTREGUE'];
                const exibirPrevisaoEntrega = statusAprovados.includes(statusUpper) && Boolean(previsao);

                const codigoPix = pedido.qrCodePix || pedido.pixCopiaECola || pedido.pix?.qrCode || '';
                const base64Pix = pedido.qrCodeBase64Pix || pedido.qrCodeBase64 || pedido.pix?.qrCodeBase64 || '';

                const isExpiradoOuCancelado = statusUpper === 'CANCELADO' || statusUpper === 'RECUSADO';
                const listaHistorico = pedido.historicoStatus || [];

                return (
                  <div key={pedido.id} className={styles.orderCard}>
                    <div className={styles.orderCardHeader}>
                      <div>
                        <div className={styles.orderTitleRow}>
                          <strong className={styles.orderCode}>Pedido #{codExibicao}</strong>
                          {pedido.tipoFaturamento && (
                            <span className={`${styles.billingBadge} ${isPJ ? styles.badgePJ : styles.badgePF}`}>
                              {isPJ ? 'PJ · NF-e' : 'PF'}
                            </span>
                          )}
                        </div>
                        <span className={styles.orderDate}>{dataFormatada}</span>
                      </div>
                      <span className={styles.orderTotal}>R$ {valorFinal.toFixed(2)}</span>
                    </div>

                    {(isPJ || endEntregaTexto || mostrarEndFiscalSeparado) && (
                      <div className={styles.billingBox}>
                        {isPJ && (
                          <div className={styles.billingLine}>
                            <span>Faturamento:</span>
                            <strong>
                              {pedido.clienteNome || 'Empresa'}
                              {docFormatado ? ` · CNPJ ${docFormatado}` : ''}
                            </strong>
                          </div>
                        )}
                        {isPJ && pedido.clienteInscricaoEstadual && (
                          <div className={styles.billingLine}>
                            <span>Inscrição Estadual:</span>
                            <span>{pedido.clienteInscricaoEstadual}</span>
                          </div>
                        )}
                        {endEntregaTexto && (
                          <div className={styles.billingLine}>
                            <span>Entrega:</span>
                            <span>{endEntregaTexto}</span>
                          </div>
                        )}
                        {mostrarEndFiscalSeparado && (
                          <div className={styles.billingLine}>
                            <span>Endereço Fiscal:</span>
                            <span>{endFiscalTexto}</span>
                          </div>
                        )}
                      </div>
                    )}

                    {renderProgressBar(pedido)}

                    {isExpiradoOuCancelado && (
                      <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', padding: '10px 12px', borderRadius: '8px', margin: '8px 0', fontSize: '0.85rem', display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                        <span style={{ fontSize: '1rem' }}>ℹ️</span>
                        <p style={{ margin: 0, color: '#475569', lineHeight: '1.4' }}>
                          <strong>Atenção:</strong> Este pedido expirou ou foi cancelado. Clique abaixo para abrir o checkout e refazer o pagamento.
                        </p>
                      </div>
                    )}

                    {exibirPrevisaoEntrega && (
                      <div className={styles.trackingBox}>
                        <span style={{ color: '#15803d' }}>🗓️ Previsão de Entrega:</span>
                        <strong>Entre {previsao}</strong>
                      </div>
                    )}

                    {(statusUpper === 'PENDENTE' || isExpiradoOuCancelado) && (
                      <div className={styles.paymentActionBox}>
                        {pixAindaValido && codigoPix && !isExpiradoOuCancelado ? (
                          <>
                            <button
                              type="button"
                              className={styles.pixBtn}
                              onClick={() => setPixAbertoId(pixAbertoId === pedido.id ? null : pedido.id)}
                            >
                              ⚡ {pixAbertoId === pedido.id ? 'Ocultar QR Code PIX' : 'Ver QR Code / Copiar PIX'}
                            </button>

                            <button
                              type="button"
                              className={styles.retryBtn}
                              style={{ marginTop: '6px', background: '#2563eb', color: '#fff' }}
                              onClick={() => handleAbrirCheckoutRefazer(pedido)}
                            >
                              💳 Abrir Checkout (Refazer Pagamento)
                            </button>

                            {pixAbertoId === pedido.id && (
                              <div className={styles.pixContainerModal}>
                                {base64Pix && (
                                  <img
                                    src={base64Pix.startsWith('data:') ? base64Pix : `data:image/jpeg;base64,${base64Pix}`}
                                    alt="QR Code PIX"
                                    style={{ width: '140px', height: '140px', display: 'block', margin: '0 auto' }}
                                  />
                                )}

                                <div className={styles.pixCodeBox}>
                                  <input type="text" readOnly value={codigoPix} className={styles.pixInput} />
                                  <button
                                    type="button"
                                    className={styles.pixBtn}
                                    style={{ width: 'auto', padding: '6px 12px' }}
                                    onClick={() => handleCopiarPix(codigoPix, pedido.id)}
                                  >
                                    {copiadoId === pedido.id ? 'Copiado! ✅' : 'Copiar'}
                                  </button>
                                </div>
                              </div>
                            )}
                          </>
                        ) : (
                          <div style={{ textAlign: 'center' }}>
                            <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', padding: '10px 12px', borderRadius: '8px', marginBottom: '8px', fontSize: '0.85rem', color: '#1e40af', textAlign: 'left' }}>
                              ⏳ <strong>Pagamento em Análise / Processamento:</strong> Se efetuou o pagamento com cartão de crédito recentemente, aguarde alguns instantes. Análises de segurança do Mercado Pago podem levar <strong>alguns minutos ou até 2 dias úteis</strong> para aprovação. O status atualizar-se-á automaticamente assim que confirmado.
                            </div>

                            <button
                              type="button"
                              className={styles.retryBtn}
                              style={{ backgroundColor: '#2563eb', color: '#fff', width: '100%', padding: '10px' }}
                              onClick={() => handleAbrirCheckoutRefazer(pedido)}
                            >
                              💳 Tentar Novamente / Outro Meio
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    {codigoRastreio && (
                      <div className={styles.trackingBox} style={{ marginTop: '8px' }}>
                        <span>🚚 Código de Rastreio:</span>
                        <strong>{codigoRastreio}</strong>
                      </div>
                    )}

                    {/* HISTÓRICO DE STATUS */}
                    {listaHistorico.length > 0 && (
                      <div style={{ marginTop: '12px', marginBottom: '12px', padding: '10px', backgroundColor: '#ffffff', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                        <h4 style={{ margin: '0 0 8px 0', fontSize: '0.8rem', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                          ⏱️ Histórico
                        </h4>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          {listaHistorico.map((hist, idx) => (
                            <div key={hist.id || idx} style={{ display: 'flex', gap: '10px', fontSize: '0.8rem', borderLeft: '2px solid #cbd5e1', paddingLeft: '8px' }}>
                              <span style={{ color: '#64748b', minWidth: '110px', fontWeight: 500 }}>
                                {new Date(hist.data).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                              </span>
                              <div style={{ display: 'flex', flexDirection: 'column' }}>
                                <strong style={{ color: '#0f172a' }}>{formatarStatusAmigavel(hist.status)}</strong>
                                {hist.observacao && <span style={{ color: '#64748b', fontSize: '0.75rem' }}>{hist.observacao}</span>}
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

      {pedidoRefazendo && (
        <CheckoutModal
          total={Number(pedidoRefazendo.total || pedidoRefazendo.valorTotal || 0)}
          onClose={() => {
            localStorage.removeItem('pedidoParaRefazerId');
            setPedidoRefazendo(null);
          }}
          onPaymentSuccess={() => {
            localStorage.removeItem('pedidoParaRefazerId');
            setPedidoRefazendo(null);
            carregarMeusPedidos();
          }}
        />
      )}
    </>
  );
};