import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { initMercadoPago, CardPayment } from '@mercadopago/sdk-react';
import { useCart } from '../../components/CartContext/CartContext';
import styles from './CheckoutModal.module.css';

const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const API_URL = isLocal 
  ? 'http://localhost:3333' 
  : 'https://ninhoback.tamaralr.com.br';

const MP_PUBLIC_KEY = import.meta.env.VITE_MERCADOPAGO_PUBLIC_KEY || 'APP_USR-b123bab4-983f-4921-8c65-009fe7158446';

initMercadoPago(MP_PUBLIC_KEY, { locale: 'pt-BR' });

interface CheckoutModalProps {
  onClose: () => void;
  total: number;
}

interface EnderecoEntrega {
  cep: string;
  logradouro: string;
  numero: string;
  complemento?: string;
  bairro: string;
  cidade: string;
  uf: string;
}

interface OpcaoFrete {
  id: string;
  name: string;
  company?: string;
  price: string;
  custom_delivery_time: number;
}

const OPCAO_RETIRADA: OpcaoFrete = {
  id: 'pickup_store',
  name: 'Retirar na Loja',
  company: 'Ninho de Promessas',
  price: '0.00',
  custom_delivery_time: 0,
};

export const CheckoutModal: React.FC<CheckoutModalProps> = ({ onClose, total }) => {
  const { itens, limparCarrinho } = useCart();

  const [step, setStep] = useState<number>(1);

  // Armazena o ID ou E-mail do cliente logado para validação de cupons
  const [clienteLogadoId, setClienteLogadoId] = useState<string>('');

  // Etapa 1: Endereço
  const [endereco, setEndereco] = useState<EnderecoEntrega>({
    cep: '',
    logradouro: '',
    numero: '',
    complemento: '',
    bairro: '',
    cidade: '',
    uf: '',
  });
  const [loadingCep, setLoadingCep] = useState<boolean>(false);
  const [erroCep, setErroCep] = useState<string>('');

  // Etapa 2: Frete
  const [opcoesFrete, setOpcoesFrete] = useState<OpcaoFrete[]>([]);
  const [freteSelecionado, setFreteSelecionado] = useState<OpcaoFrete | null>(null);
  const [loadingFrete, setLoadingFrete] = useState<boolean>(false);

  // Estados do Cupom de Desconto
  const [codigoCupomInput, setCodigoCupomInput] = useState<string>('');
  const [cupomAplicado, setCupomAplicado] = useState<{ codigo: string; tipo: 'PERCENTUAL' | 'FIXO'; valor: number } | null>(null);
  const [loadingCupom, setLoadingCupom] = useState<boolean>(false);
  const [erroCupom, setErroCupom] = useState<string>('');

  // Etapa 3: Pagamento
  const [metodoPagamento, setMetodoPagamento] = useState<'pix' | 'credit_card'>('pix');
  const [loadingPagamento, setLoadingPagamento] = useState<boolean>(false);
  const [erroPagamento, setErroPagamento] = useState<string>('');

  // Resultado PIX
  const [dadosPix, setDadosPix] = useState<{ qrCode: string; qrCodeBase64: string } | null>(null);
  const [copiado, setCopiado] = useState<boolean>(false);

  // ==========================================
  // BUSCA O PERFIL E ENDEREÇO SALVO DO USUÁRIO
  // ==========================================
  useEffect(() => {
    const carregarPerfilUsuario = async () => {
      try {
        const res = await axios.get(`${API_URL}/api/perfil`, { 
          withCredentials: true 
        });

        const dadosUsuario = res.data?.user;
        if (dadosUsuario) {
          setClienteLogadoId(dadosUsuario.id || dadosUsuario.email || '');

          const enderecos = dadosUsuario.enderecos;
          if (enderecos && enderecos.length > 0) {
            const endSalvo = enderecos[0];

            setEndereco({
              cep: endSalvo.cep || '',
              logradouro: endSalvo.rua || '',
              numero: endSalvo.numero || '',
              complemento: endSalvo.complemento || '',
              bairro: endSalvo.bairro || '',
              cidade: endSalvo.cidade || '',
              uf: endSalvo.estado || '',
            });
          }
        }
      } catch (error) {
        console.log('Nenhum usuário logado ou perfil não encontrado.');
      }
    };

    carregarPerfilUsuario();
  }, []);

  // Auto-completar ViaCEP
  const handleBuscarCep = async (cepInput: string) => {
    setEndereco(prev => ({ ...prev, cep: cepInput }));
    const cepLimpo = cepInput.replace(/\D/g, '');

    if (cepLimpo.length === 8) {
      try {
        setLoadingCep(true);
        setErroCep('');
        const response = await fetch(`https://viacep.com.br/ws/${cepLimpo}/json/`);
        const data = await response.json();

        if (data.erro) {
          setErroCep('CEP não encontrado. Preencha manualmente.');
          return;
        }

        setEndereco(prev => ({
          ...prev,
          cep: cepLimpo,
          logradouro: data.logradouro || prev.logradouro,
          bairro: data.bairro || prev.bairro,
          cidade: data.localidade || prev.cidade,
          uf: data.uf || prev.uf,
        }));
      } catch (err) {
        console.error('Erro ao buscar ViaCEP:', err);
      } finally {
        setLoadingCep(false);
      }
    }
  };

  // Validar e Aplicar Cupom com tratamento robusto para evitar NaN
  const handleAplicarCupom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!codigoCupomInput.trim()) return;

    try {
      setLoadingCupom(true);
      setErroCupom('');

      const response = await axios.post(`${API_URL}/api/cupons/validar`, {
        codigo: codigoCupomInput.trim().toUpperCase(),
        clienteId: clienteLogadoId,
        subtotal: total
      }, { withCredentials: true });

      const dadosCupom = response.data?.cupom || response.data;

      if (dadosCupom && dadosCupom.tipo && dadosCupom.valor !== undefined) {
        const valorNumerico = Number(dadosCupom.valor);

        setCupomAplicado({
          codigo: dadosCupom.codigo || codigoCupomInput.trim().toUpperCase(),
          tipo: dadosCupom.tipo,
          valor: isNaN(valorNumerico) ? 0 : valorNumerico
        });
        setCodigoCupomInput('');
      } else {
        setErroCupom('Resposta inválida do servidor ao validar cupom.');
      }
    } catch (err: any) {
      setErroCupom(err.response?.data?.message || 'Cupom inválido ou expirado.');
    } finally {
      setLoadingCupom(false);
    }
  };

  const handleRemoverCupom = () => {
    setCupomAplicado(null);
    setErroCupom('');
  };

  // Cálculo seguro do desconto e totais estritamente arredondados a 2 casas decimais
  let valorDesconto = 0;
  if (cupomAplicado) {
    const valCupom = Number(cupomAplicado.valor) || 0;
    if (cupomAplicado.tipo === 'PERCENTUAL') {
      valorDesconto = Number(((total * valCupom) / 100).toFixed(2));
    } else {
      valorDesconto = Number(valCupom.toFixed(2));
    }
  }
  const subtotalComDesconto = Number(Math.max(0, total - valorDesconto).toFixed(2));
  const valorFreteNum = freteSelecionado ? Number(parseFloat(freteSelecionado.price || '0').toFixed(2)) : 0;
  const totalGeral = Number((subtotalComDesconto + valorFreteNum).toFixed(2));

  // Etapa 1 -> Etapa 2
  const handleAvancarParaFrete = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!endereco.cep || !endereco.logradouro || !endereco.numero || !endereco.bairro || !endereco.cidade || !endereco.uf) {
      setErroCep('Por favor, preencha todos os campos obrigatórios do endereço.');
      return;
    }

    const cepLimpo = endereco.cep.replace(/\D/g, '');

    try {
      setLoadingFrete(true);
      setStep(2);

      const produtosParaEnvio = itens.map((item) => ({
        produtoId: (item as any).produtoId || (item as any).product?.id || (item as any).id,
        quantidade: item.quantidade,
      }));

      const res = await axios.post(`${API_URL}/api/frete/calcular`, {
        cepDestino: cepLimpo,
        itens: produtosParaEnvio,
        products: produtosParaEnvio,
      }, { withCredentials: true });

      let listaOpcoes: OpcaoFrete[] = [OPCAO_RETIRADA];

      if (Array.isArray(res.data) && res.data.length > 0) {
        const opcoesFormatadas = res.data.map((opt: any) => ({
          id: String(opt.id || opt.name || opt.nome),
          name: opt.name || opt.nome || 'Frete',
          company: opt.company || opt.empresa || '',
          price: String(opt.price || opt.valor || '0'),
          custom_delivery_time: Number(opt.custom_delivery_time || opt.prazo || 0),
        }));

        listaOpcoes = [...listaOpcoes, ...opcoesFormatadas];
      }

      setOpcoesFrete(listaOpcoes);
      setFreteSelecionado(OPCAO_RETIRADA);
    } catch (err: any) {
      setOpcoesFrete([OPCAO_RETIRADA]);
      setFreteSelecionado(OPCAO_RETIRADA);
    } finally {
      setLoadingFrete(false);
    }
  };

  // Envia pedido para o Backend
  const enviarPedidoParaBackend = async (payloadCard: any = null) => {
    try {
      setLoadingPagamento(true);
      setErroPagamento('');

      const payloadBackend = {
        transaction_amount: totalGeral,
        token: payloadCard?.token || null,
        description: 'Compra Ninho de Promessas',
        installments: Number(payloadCard?.installments || 1),
        payment_method_id: metodoPagamento === 'pix' ? 'pix' : (payloadCard?.payment_method_id || 'master'),
        issuer_id: payloadCard?.issuer_id || null,
        subtotal: total,
        descontoCupom: valorDesconto,
        cupomCodigo: cupomAplicado?.codigo || null,
        valorFrete: valorFreteNum,
        servicoFrete: freteSelecionado?.name || 'Padrão',
        prazoEntrega: freteSelecionado?.id === 'pickup_store' 
          ? 'Retirada Imediata' 
          : (freteSelecionado ? `${freteSelecionado.custom_delivery_time} dias úteis` : ''),
        endereco: {
          cep: endereco.cep.replace(/\D/g, ''),
          rua: endereco.logradouro,
          numero: endereco.numero,
          complemento: endereco.complemento,
          bairro: endereco.bairro,
          cidade: endereco.cidade,
          estado: endereco.uf,
        },
        items: itens.map((item) => ({
          produtoId: (item as any).produtoId || (item as any).product?.id || (item as any).id,
          tamanhoId: (item as any).tamanhoId || (item as any).tamanho?.id || null,
          corId: (item as any).corId || (item as any).cor?.id || null,
          nome: item.nome,
          preco: item.totalItem / item.quantidade,
          quantidade: item.quantidade,
        })),
      };

      const res = await axios.post(`${API_URL}/api/pagamento`, payloadBackend, {
        withCredentials: true,
      });

      if (res.data.success || res.data.sucesso) {
        const qrCodePix = res.data.qrCode || res.data.pixCopiaECola;
        const qrCodeBase64Pix = res.data.qrCodeBase64;

        if (metodoPagamento === 'pix' && qrCodePix) {
          setDadosPix({
            qrCode: qrCodePix,
            qrCodeBase64: qrCodeBase64Pix,
          });
          if (limparCarrinho) limparCarrinho();
        } else {
          if (limparCarrinho) limparCarrinho();
          alert('🎉 Pagamento Aprovado com Sucesso!');
          onClose();
        }
      }
    } catch (err: any) {
      console.error('Erro ao processar pagamento:', err);
      setErroPagamento(err.response?.data?.message || 'Erro ao processar o pagamento.');
    } finally {
      setLoadingPagamento(false);
    }
  };

  const handleCopiarPix = () => {
    if (dadosPix?.qrCode) {
      navigator.clipboard.writeText(dadosPix.qrCode);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 3000);
    }
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        
        {/* Cabeçalho */}
        <div className={styles.header}>
          <h2>Finalizar Compra</h2>
          <button type="button" className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        {/* Indicador de Etapas */}
        {!dadosPix && (
          <div className={styles.stepper}>
            <div className={`${styles.stepItem} ${step >= 1 ? styles.stepActive : ''}`}>
              <span>1</span> Endereço
            </div>
            <div className={styles.stepDivider} />
            <div className={`${styles.stepItem} ${step >= 2 ? styles.stepActive : ''}`}>
              <span>2</span> Envio
            </div>
            <div className={styles.stepDivider} />
            <div className={`${styles.stepItem} ${step >= 3 ? styles.stepActive : ''}`}>
              <span>3</span> Pagamento
            </div>
          </div>
        )}

        {/* EXIBIÇÃO DO PIX GERADO PELO MERCADO PAGO */}
        {dadosPix ? (
          <div className={styles.pixResultContainer}>
            <div className={styles.pixHeader}>
              <h3>⚡ Pagamento PIX Gerado!</h3>
              <p>Escaneie o QR Code ou copie a chave abaixo:</p>
            </div>
            
            {dadosPix.qrCodeBase64 && (
              <div className={styles.qrCodeWrapper}>
                <img
                  src={`data:image/jpeg;base64,${dadosPix.qrCodeBase64}`}
                  alt="QR Code PIX Mercado Pago"
                  className={styles.qrCodeImg}
                />
              </div>
            )}

            <div className={styles.pixCopiaColaBox}>
              <label>Código PIX Copia e Cola:</label>
              <div className={styles.inputCopyGroup}>
                <input type="text" readOnly value={dadosPix.qrCode} className={styles.pixInput} />
                <button
                  type="button"
                  className={`${styles.copyBtn} ${copiado ? styles.copyBtnCopied : ''}`}
                  onClick={handleCopiarPix}
                >
                  {copiado ? 'Copiado! ✅' : 'Copiar Chave'}
                </button>
              </div>
            </div>

            <button type="button" className={styles.primaryButton} onClick={onClose} style={{ marginTop: '0.5rem' }}>
              Entendi, já fiz o pagamento
            </button>
          </div>
        ) : (
          <>
            {/* ETAPA 1: ENDEREÇO */}
            {step === 1 && (
              <form onSubmit={handleAvancarParaFrete} className={styles.stepForm}>
                <h3>📍 Etapa 1: Endereço de Entrega</h3>

                <div className={styles.formRow}>
                  <div className={styles.inputGroup}>
                    <label>CEP *</label>
                    <input
                      type="text"
                      placeholder="00000-000"
                      maxLength={9}
                      value={endereco.cep}
                      onChange={(e) => handleBuscarCep(e.target.value)}
                      required
                    />
                    {loadingCep && <span className={styles.helperText}>Buscando CEP...</span>}
                  </div>

                  <div className={styles.inputGroup}>
                    <label>UF *</label>
                    <input
                      type="text"
                      placeholder="SC"
                      maxLength={2}
                      value={endereco.uf}
                      onChange={(e) => setEndereco({ ...endereco, uf: e.target.value.toUpperCase() })}
                      required
                    />
                  </div>
                </div>

                <div className={styles.inputGroup}>
                  <label>Rua / Logradouro *</label>
                  <input
                    type="text"
                    placeholder="Ex: Rua das Flores"
                    value={endereco.logradouro}
                    onChange={(e) => setEndereco({ ...endereco, logradouro: e.target.value })}
                    required
                  />
                </div>

                <div className={styles.formRow}>
                  <div className={styles.inputGroup}>
                    <label>Número *</label>
                    <input
                      type="text"
                      placeholder="123"
                      value={endereco.numero}
                      onChange={(e) => setEndereco({ ...endereco, numero: e.target.value })}
                      required
                    />
                  </div>

                  <div className={styles.inputGroup}>
                    <label>Complemento</label>
                    <input
                      type="text"
                      placeholder="Apto 101, Bloco B"
                      value={endereco.complemento}
                      onChange={(e) => setEndereco({ ...endereco, complemento: e.target.value })}
                    />
                  </div>
                </div>

                <div className={styles.formRow}>
                  <div className={styles.inputGroup}>
                    <label>Bairro *</label>
                    <input
                      type="text"
                      placeholder="Centro"
                      value={endereco.bairro}
                      onChange={(e) => setEndereco({ ...endereco, bairro: e.target.value })}
                      required
                    />
                  </div>

                  <div className={styles.inputGroup}>
                    <label>Cidade *</label>
                    <input
                      type="text"
                      placeholder="Palhoça"
                      value={endereco.cidade}
                      onChange={(e) => setEndereco({ ...endereco, cidade: e.target.value })}
                      required
                    />
                  </div>
                </div>

                {erroCep && <p className={styles.errorText}>{erroCep}</p>}

                <button type="submit" className={styles.primaryButton}>
                  Ir para Opções de Envio →
                </button>
              </form>
            )}

            {/* ETAPA 2: FORMA DE ENVIO */}
            {step === 2 && (
              <div className={styles.stepForm}>
                <h3>🚚 Etapa 2: Escolha a Forma de Envio</h3>

                <div className={styles.addressSummary}>
                  <strong>Entregar em:</strong> {endereco.logradouro}, {endereco.numero} {endereco.complemento ? `- ${endereco.complemento}` : ''}
                  <br />
                  {endereco.bairro} - {endereco.cidade}/{endereco.uf} (CEP: {endereco.cep})
                  <button type="button" className={styles.editBtn} onClick={() => setStep(1)}>Editar</button>
                </div>

                {loadingFrete ? (
                  <div className={styles.loadingBox}>Consultando opções de frete...</div>
                ) : (
                  <div className={styles.shippingList}>
                    {opcoesFrete.map((opcao) => (
                      <label
                        key={opcao.id}
                        className={`${styles.shippingCard} ${freteSelecionado?.id === opcao.id ? styles.shippingSelected : ''}`}
                      >
                        <input
                          type="radio"
                          name="opcaoEnvio"
                          checked={freteSelecionado?.id === opcao.id}
                          onChange={() => setFreteSelecionado(opcao)}
                        />
                        <div className={styles.shippingInfo}>
                          <strong>{opcao.name}</strong>
                          <span>
                            {opcao.id === 'pickup_store' 
                              ? 'Sem custo de envio' 
                              : `Prazo estimado: até ${opcao.custom_delivery_time} dias úteis`}
                          </span>
                        </div>
                        <span className={styles.shippingPrice}>
                          {parseFloat(opcao.price) === 0 
                            ? 'Grátis' 
                            : `R$ ${parseFloat(opcao.price).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
                        </span>
                      </label>
                    ))}
                  </div>
                )}

                {/* CAMPO DE CUPOM DE DESCONTO */}
                <div style={{ marginTop: '0.8rem', background: '#f8fafc', padding: '0.8rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '6px' }}>
                    🎟️ Possui cupom de desconto?
                  </label>
                  {cupomAplicado ? (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '6px 10px', borderRadius: '6px' }}>
                      <span style={{ fontSize: '0.85rem', color: '#166534', fontWeight: 600 }}>
                        Cupom <strong>{cupomAplicado.codigo}</strong> aplicado ({cupomAplicado.tipo === 'PERCENTUAL' ? `${cupomAplicado.valor}% OFF` : `R$ ${cupomAplicado.valor.toFixed(2)} OFF`})
                      </span>
                      <button 
                        type="button" 
                        onClick={handleRemoverCupom}
                        style={{ background: 'none', border: 'none', color: '#dc2626', fontSize: '0.8rem', fontWeight: 'bold', cursor: 'pointer' }}
                      >
                        Remover
                      </button>
                    </div>
                  ) : (
                    <form onSubmit={handleAplicarCupom} style={{ display: 'flex', gap: '8px' }}>
                      <input
                        type="text"
                        placeholder="Digite o código (ex: PRIMEIRACOMPRA)"
                        value={codigoCupomInput}
                        onChange={(e) => setCodigoCupomInput(e.target.value)}
                        className={styles.selectInput}
                        style={{ flex: 1, padding: '0.5rem 0.8rem', fontSize: '0.85rem' }}
                      />
                      <button
                        type="submit"
                        className={styles.secondaryButton}
                        disabled={loadingCupom || !codigoCupomInput.trim()}
                        style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}
                      >
                        {loadingCupom ? 'Aplicando...' : 'Aplicar'}
                      </button>
                    </form>
                  )}
                  {erroCupom && <p className={styles.errorText} style={{ marginTop: '4px' }}>{erroCupom}</p>}
                </div>

                <div className={styles.summaryFooter}>
                  <div className={styles.summaryRow}>
                    <span>Subtotal:</span>
                    <span>R$ {total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                  </div>
                  {cupomAplicado && (
                    <div className={styles.summaryRow} style={{ color: '#166534', fontWeight: 600 }}>
                      <span>Desconto ({cupomAplicado.codigo}):</span>
                      <span>- R$ {valorDesconto.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                  )}
                  <div className={styles.summaryRow}>
                    <span>Frete ({freteSelecionado?.name || 'Não selecionado'}):</span>
                    <span>
                      {valorFreteNum === 0 ? 'Grátis' : `R$ ${valorFreteNum.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
                    </span>
                  </div>
                  <div className={styles.totalRow}>
                    <span>Total:</span>
                    <strong>R$ {totalGeral.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong>
                  </div>
                </div>

                <div className={styles.actionButtons}>
                  <button type="button" className={styles.secondaryButton} onClick={() => setStep(1)}>
                    ← Voltar
                  </button>
                  <button
                    type="button"
                    className={styles.primaryButton}
                    disabled={!freteSelecionado}
                    onClick={() => setStep(3)}
                  >
                    Ir para Pagamento →
                  </button>
                </div>
              </div>
            )}

            {/* ETAPA 3: PAGAMENTO */}
            {step === 3 && (
              <div className={styles.stepForm}>
                <h3>💳 Etapa 3: Pagamento</h3>

                {/* Botões lado a lado das Opções de Pagamento */}
                <div className={styles.paymentMethodsGrid}>
                  <button
                    type="button"
                    className={`${styles.paymentMethodCard} ${metodoPagamento === 'pix' ? styles.paymentMethodSelected : ''}`}
                    onClick={() => setMetodoPagamento('pix')}
                  >
                    <span className={styles.paymentIcon}>⚡</span>
                    <strong>PIX</strong>
                    <small>Aprovação instantânea</small>
                  </button>

                  <button
                    type="button"
                    className={`${styles.paymentMethodCard} ${metodoPagamento === 'credit_card' ? styles.paymentMethodSelected : ''}`}
                    onClick={() => setMetodoPagamento('credit_card')}
                  >
                    <span className={styles.paymentIcon}>💳</span>
                    <strong>Cartão de Crédito</strong>
                    <small>Parcele em até 6x</small>
                  </button>
                </div>

                {/* ABA PIX */}
                {metodoPagamento === 'pix' && (
                  <div className={styles.pixContainer}>
                    <p className={styles.pixInfo}>
                      Ao clicar em <strong>Finalizar Pedido</strong>, o código PIX Copia e Cola e o QR Code serão gerados em tempo real pelo Mercado Pago.
                    </p>
                    
                    <button
                      type="button"
                      className={styles.primaryButton}
                      onClick={() => enviarPedidoParaBackend()}
                      disabled={loadingPagamento}
                      style={{ marginTop: '1rem' }}
                    >
                      {loadingPagamento ? 'Gerando PIX...' : 'Finalizar Pedido'}
                    </button>
                  </div>
                )}

                {/* ABA CARTÃO DE CRÉDITO */}
                <div style={{ display: metodoPagamento === 'credit_card' ? 'block' : 'none', minHeight: '350px' }}>
                  <CardPayment
                    initialization={{
                      amount: totalGeral,
                    }}
                    customization={{
                      paymentMethods: {
                        maxInstallments: 6,
                      },
                      visual: {
                        style: {
                          theme: 'default',
                        },
                      },
                    }}
                    onSubmit={async (param) => {
                      await enviarPedidoParaBackend(param);
                    }}
                    onError={(error) => console.error('Erro no Card Brick:', error)}
                    onReady={() => console.log('Card Payment Brick pronto e montado!')}
                  />
                </div>

                <div className={styles.summaryFooter}>
                  <div className={styles.summaryRow}>
                    <span>Subtotal:</span>
                    <span>R$ {total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                  </div>
                  {cupomAplicado && (
                    <div className={styles.summaryRow} style={{ color: '#166534', fontWeight: 600 }}>
                      <span>Desconto ({cupomAplicado.codigo}):</span>
                      <span>- R$ {valorDesconto.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                  )}
                  <div className={styles.summaryRow}>
                    <span>Frete ({freteSelecionado?.name}):</span>
                    <span>
                      {valorFreteNum === 0 ? 'Grátis' : `R$ ${valorFreteNum.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
                    </span>
                  </div>
                  <div className={styles.totalRow}>
                    <span>Total Final:</span>
                    <strong>R$ {totalGeral.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong>
                  </div>
                </div>

                {erroPagamento && <p className={styles.errorText}>{erroPagamento}</p>}

                <div className={styles.actionButtons}>
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={() => setStep(2)}
                    disabled={loadingPagamento}
                  >
                    ← Voltar para Envio
                  </button>
                </div>
              </div>
            )}
          </>
        )}

      </div>
    </div>
  );
};