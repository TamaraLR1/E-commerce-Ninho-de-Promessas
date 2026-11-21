import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { initMercadoPago, CardPayment } from '@mercadopago/sdk-react';
import { useCart } from '../../components/CartContext/CartContext';
import { socket } from '../../../../services/socket';
import styles from './CheckoutModal.module.css';

const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const API_URL = isLocal
  ? 'http://localhost:3333'
  : 'https://ninhoback.tamaralr.com.br';

const MP_PUBLIC_KEY =
  import.meta.env.VITE_MERCADOPAGO_PUBLIC_KEY ||
  'APP_USR-b123bab4-983f-4921-8c65-009fe7158446';

if (!(window as any).__mpInitialized) {
  initMercadoPago(MP_PUBLIC_KEY, { locale: 'pt-BR' });
  (window as any).__mpInitialized = true;
}

export interface CheckoutModalProps {
  onClose: () => void;
  onPaymentSuccess?: () => void;
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

type StatusConferenciaItem = 'DISPONIVEL' | 'QUANTIDADE_AJUSTADA' | 'ESGOTADO';

interface ItemConferido {
  produtoId: string;
  tamanhoId: string | null;
  corId: string | null;
  nome: string;
  imagemUrl?: string;
  precoUnitario: number;
  quantidadeSolicitada: number;
  quantidadeDisponivel: number;
  quantidadeAprovada: number;
  subtotalItem: number;
  status: StatusConferenciaItem;
  motivo: string | null;
}

const OPCAO_RETIRADA: OpcaoFrete = {
  id: 'pickup_store',
  name: 'Retirar na Loja',
  company: 'Ninho de Promessas',
  price: '0.00',
  custom_delivery_time: 0,
};

function chaveVariacaoItem(produtoId: any, tamanhoId: any, corId: any) {
  return `${String(produtoId || '')}::${tamanhoId ? String(tamanhoId) : ''}::${corId ? String(corId) : ''}`;
}

function extrairIdsItem(item: any) {
  const produtoId = String(item?.produtoId || item?.product?.id || item?.id || '');
  const tamanhoId = item?.tamanhoId || item?.tamanho?.id ? String(item?.tamanhoId || item?.tamanho?.id) : null;
  const corId = item?.corId || item?.cor?.id ? String(item?.corId || item?.cor?.id) : null;
  const quantidade = Number(item?.quantidade || 1);
  const precoUnitario =
    item?.precoUnitario !== undefined
      ? Number(item.precoUnitario)
      : quantidade > 0
      ? Number((Number(item?.totalItem || 0) / quantidade).toFixed(2))
      : Number(item?.preco || 0);
  const imagemUrl =
    item?.imagemUrl ||
    item?.imagem ||
    item?.produto?.imagens?.[0]?.url ||
    item?.product?.imagens?.[0]?.url ||
    '';

  return {
    produtoId,
    tamanhoId,
    corId,
    nome: item?.nome || item?.nomeProduto || item?.produto?.nome || item?.product?.nome || 'Produto',
    imagemUrl,
    precoUnitario,
    quantidade,
  };
}

export const CheckoutModal: React.FC<CheckoutModalProps> = ({ onClose, onPaymentSuccess, total }) => {
  const { itens, subtotalSelecionados, limparCarrinho, sincronizarItensComConferencia } = useCart();

  // Estados para suportar o refazer pedido do histórico
  const [itensPedidoRefazer, setItensPedidoRefazer] = useState<any[]>([]);
  const [carregandoRefazer, setCarregandoRefazer] = useState<boolean>(false);

  const pedidoIdRefazer = localStorage.getItem('pedidoParaRefazerId');

  // Efeito para buscar os itens do pedido original caso esteja a refazer o pagamento
  useEffect(() => {
    if (pedidoIdRefazer) {
      const buscarPedidoOriginal = async () => {
        try {
          setCarregandoRefazer(true);
          const res = await axios.get(`${API_URL}/api/pedidos/${pedidoIdRefazer}`, { withCredentials: true });
          if (res.data && res.data.itens) {
            const itensFormatados = res.data.itens.map((i: any) => ({
              produtoId: i.produtoId || i.produto?.id,
              tamanhoId: i.tamanhoId || i.tamanho?.id,
              corId: i.corId || i.cor?.id,
              nome: i.produto?.nome || i.nomeProduto || 'Produto',
              imagemUrl: i.produto?.imagens?.[0]?.url || i.imagemUrl || '',
              quantidade: i.quantidade,
              precoUnitario: Number(i.precoUnitario),
              totalItem: Number(i.precoUnitario) * Number(i.quantidade),
              selecionado: true,
            }));
            setItensPedidoRefazer(itensFormatados);
          }
        } catch (err) {
          console.error('Erro ao carregar pedido para refazer:', err);
        } finally {
          setCarregandoRefazer(false);
        }
      };
      buscarPedidoOriginal();
    }
  }, [pedidoIdRefazer]);

  // Itens iniciais selecionados (do pedido antigo ao refazer ou do carrinho)
  const itensSelecionadosOriginais = pedidoIdRefazer
    ? itensPedidoRefazer
    : itens.filter((item) => item.selecionado);

  // Lista ativa usada para pagamento (pode ser confirmada após conferência de estoque)
  const [itensConfirmadosPagamento, setItensConfirmadosPagamento] = useState<any[] | null>(null);
  const [itensConferidos, setItensConferidos] = useState<ItemConferido[]>([]);
  const [quantidadesReferenciaEtapa3, setQuantidadesReferenciaEtapa3] = useState<Record<string, number>>({});
  const [conferindoEstoque, setConferindoEstoque] = useState<boolean>(false);
  const [erroConferencia, setErroConferencia] = useState<string>('');
  const [revisaoConfirmada, setRevisaoConfirmada] = useState<boolean>(false);

  // Reseta a conferência caso o pedido de refazer mude
  useEffect(() => {
    setItensConfirmadosPagamento(null);
    setItensConferidos([]);
    setQuantidadesReferenciaEtapa3({});
    setErroConferencia('');
    setRevisaoConfirmada(false);
  }, [pedidoIdRefazer]);

  const itensAtivos = itensConfirmadosPagamento ?? itensSelecionadosOriginais;

  const valorTotalBase = itensConfirmadosPagamento
    ? Number(
        itensConfirmadosPagamento
          .reduce((acc, item) => acc + Number(item.precoUnitario || 0) * Number(item.quantidade || 0), 0)
          .toFixed(2)
      )
    : pedidoIdRefazer
    ? Number(itensPedidoRefazer.reduce((acc, item) => acc + Number(item.totalItem || 0), 0).toFixed(2))
    : Number((subtotalSelecionados || total).toFixed(2));

  const [step, setStep] = useState<number>(1);
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

  // Cupons
  const [codigoCupomInput, setCodigoCupomInput] = useState<string>('');
  const [cupomAplicado, setCupomAplicado] = useState<{ codigo: string; tipo: 'PERCENTUAL' | 'FIXO'; valor: number } | null>(null);
  const [loadingCupom, setLoadingCupom] = useState<boolean>(false);
  const [erroCupom, setErroCupom] = useState<string>('');

  // Etapa 3: Pagamento
  const [metodoPagamento, setMetodoPagamento] = useState<'pix' | 'credit_card'>('pix');
  const [loadingPagamento, setLoadingPagamento] = useState<boolean>(false);
  const [erroPagamento, setErroPagamento] = useState<string>('');

  // Resultado PIX e Cronômetro de 15 minutos
  const [dadosPix, setDadosPix] = useState<{ qrCode: string; qrCodeBase64: string } | null>(null);
  const [copiado, setCopiado] = useState<boolean>(false);
  const [tempoRestantePix, setTempoRestantePix] = useState<number>(15 * 60);

  useEffect(() => {
    if (!dadosPix) return;
    const timer = setInterval(() => {
      setTempoRestantePix((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [dadosPix]);

  const formatarTempoPix = (segundos: number) => {
    const mins = Math.floor(segundos / 60);
    const secs = segundos % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  useEffect(() => {
    const carregarPerfilUsuario = async () => {
      try {
        const res = await axios.get(`${API_URL}/api/perfil`, {
          withCredentials: true,
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
        console.log('Nenhum utilizador logado ou perfil não encontrado.');
      }
    };

    carregarPerfilUsuario();
  }, []);

  const handleBuscarCep = async (cepInput: string) => {
    setEndereco((prev) => ({ ...prev, cep: cepInput }));
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

        setEndereco((prev) => ({
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

  const handleAplicarCupom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!codigoCupomInput.trim()) return;

    try {
      setLoadingCupom(true);
      setErroCupom('');

      const response = await axios.post(
        `${API_URL}/api/cupons/validar`,
        {
          codigo: codigoCupomInput.trim().toUpperCase(),
          clienteId: clienteLogadoId,
          subtotal: valorTotalBase,
        },
        { withCredentials: true }
      );

      const dadosCupom = response.data?.cupom || response.data;

      if (dadosCupom && dadosCupom.tipo && dadosCupom.valor !== undefined) {
        const valorNumerico = Number(dadosCupom.valor);

        setCupomAplicado({
          codigo: dadosCupom.codigo || codigoCupomInput.trim().toUpperCase(),
          tipo: dadosCupom.tipo,
          valor: isNaN(valorNumerico) ? 0 : valorNumerico,
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

  let valorDesconto = 0;
  if (cupomAplicado) {
    const valCupom = Number(cupomAplicado.valor) || 0;
    if (cupomAplicado.tipo === 'PERCENTUAL') {
      valorDesconto = Number(((valorTotalBase * valCupom) / 100).toFixed(2));
    } else {
      valorDesconto = Number(valCupom.toFixed(2));
    }
  }
  const subtotalComDesconto = Number(Math.max(0, valorTotalBase - valorDesconto).toFixed(2));
  const valorFreteNum = freteSelecionado ? Number(parseFloat(freteSelecionado.price || '0').toFixed(2)) : 0;
  const totalGeral = Number((subtotalComDesconto + valorFreteNum).toFixed(2));

  const permiteCartao = totalGeral >= 1.0;

  const conferirDisponibilidadeItens = async (listaBase: any[]) => {
    if (!listaBase || listaBase.length === 0) {
      setItensConferidos([]);
      setRevisaoConfirmada(false);
      return;
    }

    try {
      setConferindoEstoque(true);
      setErroConferencia('');
      setErroPagamento('');

      const mapaReferencia: Record<string, number> = {};
      const payloadItems = listaBase.map((item) => {
        const dados = extrairIdsItem(item);
        const qtdDesejadaHistorico = Number((item as any)?.quantidadeDesejada || 0);
        const quantidadeOriginalReferencia =
          qtdDesejadaHistorico > dados.quantidade ? qtdDesejadaHistorico : dados.quantidade;

        const chave = chaveVariacaoItem(dados.produtoId, dados.tamanhoId, dados.corId);
        mapaReferencia[chave] = Math.max(mapaReferencia[chave] || 0, quantidadeOriginalReferencia);

        return {
          produtoId: dados.produtoId,
          tamanhoId: dados.tamanhoId,
          corId: dados.corId,
          nome: dados.nome,
          imagemUrl: dados.imagemUrl,
          preco: dados.precoUnitario,
          quantidade: dados.quantidade,
          quantidadeReferencia: quantidadeOriginalReferencia,
        };
      });

      setQuantidadesReferenciaEtapa3(mapaReferencia);

      const res = await axios.post(
        `${API_URL}/api/checkout/conferir-estoque`,
        {
          items: payloadItems.map(({ quantidadeReferencia, ...rest }) => rest),
          pedidoParaRefazerId: pedidoIdRefazer || null,
        },
        { withCredentials: true }
      );

      const conferidos: ItemConferido[] = Array.isArray(res.data?.itens)
        ? res.data.itens.map((c: any, idx: number) => {
            const qtdRef = payloadItems[idx]?.quantidadeReferencia || Number(c.quantidadeSolicitada || 1);
            const qtdAprov = Number(c.quantidadeAprovada || 0);
            const foiReduzidoAntesOuAgora = c.status !== 'ESGOTADO' && qtdAprov < qtdRef;

            return {
              ...c,
              imagemUrl: c.imagemUrl || payloadItems[idx]?.imagemUrl || '',
              quantidadeSolicitada: qtdRef,
              status: foiReduzidoAntesOuAgora ? 'QUANTIDADE_AJUSTADA' : c.status,
              motivo:
                c.motivo ||
                (foiReduzidoAntesOuAgora
                  ? `Quantidade ajustada de ${qtdRef} un. para ${qtdAprov} un. conforme estoque disponível.`
                  : null),
            };
          })
        : [];

      setItensConferidos(conferidos);

      if (!pedidoIdRefazer && conferidos.length > 0 && sincronizarItensComConferencia) {
        await sincronizarItensComConferencia(conferidos);
      }

      const temProblema = conferidos.some(
        (c) => c.status !== 'DISPONIVEL' || c.quantidadeAprovada !== c.quantidadeSolicitada
      );
      const temDisponivel = conferidos.some((c) => c.status !== 'ESGOTADO' && c.quantidadeAprovada > 0);

      if (!temProblema && temDisponivel) {
        const listaValidada = conferidos
          .filter((c) => c.quantidadeAprovada > 0)
          .map((c) => ({
            produtoId: c.produtoId,
            tamanhoId: c.tamanhoId,
            corId: c.corId,
            nome: c.nome,
            imagemUrl: c.imagemUrl || '',
            precoUnitario: c.precoUnitario,
            quantidade: c.quantidadeAprovada,
            totalItem: Number((c.quantidadeAprovada * c.precoUnitario).toFixed(2)),
          }));
        setItensConfirmadosPagamento(listaValidada);
        setRevisaoConfirmada(true);
      } else {
        setItensConfirmadosPagamento(null);
        setRevisaoConfirmada(false);
      }
    } catch (err: any) {
      console.error('Erro ao conferir estoque:', err);
      setErroConferencia(err.response?.data?.message || 'Não foi possível conferir a disponibilidade dos itens agora.');
      setItensConfirmadosPagamento(null);
      setRevisaoConfirmada(false);
    } finally {
      setConferindoEstoque(false);
    }
  };

  // Escuta alterações de estoque/preço em tempo real enquanto estiver na Etapa 3
  useEffect(() => {
    if (step !== 3 || dadosPix) return;

    const handleProdutoAtualizadoNaEtapa3 = (produtoAtualizado: any) => {
      if (!produtoAtualizado || String(produtoAtualizado.id) === '') return;

      const precoVigente =
        produtoAtualizado.temOferta && produtoAtualizado.precoPromocional
          ? Number(produtoAtualizado.precoPromocional)
          : Number(produtoAtualizado.preco ?? 0);

      const listaVariacoes = produtoAtualizado.estoques || produtoAtualizado.variacoes || [];

      setItensConferidos((prevConferidos) => {
        if (!prevConferidos.length) return prevConferidos;

        const novosConferidos = prevConferidos.map((itemConf) => {
          if (String(itemConf.produtoId) !== String(produtoAtualizado.id)) {
            return itemConf;
          }

          const estoqueEncontrado = listaVariacoes.find((est: any) => {
            const tamanhoItem = itemConf.tamanhoId;
            const corItem = itemConf.corId;
            const tamanhoEst = est.tamanho?.id || est.tamanhoId || est.tamanho?.nome || est.tamanho;
            const corEst = est.cor?.id || est.corId || est.cor?.nome || est.cor;

            const mesmoTamanho = !tamanhoItem || !tamanhoEst || String(tamanhoEst) === String(tamanhoItem);
            const mesmaCor = !corItem || !corEst || String(corEst) === String(corItem);
            return mesmoTamanho && mesmaCor;
          });

          const saldoDisponivel = estoqueEncontrado ? Number(estoqueEncontrado.estoque ?? 0) : 0;
          const chave = chaveVariacaoItem(itemConf.produtoId, itemConf.tamanhoId, itemConf.corId);
          const qtdReferencia = Math.max(
            Number(quantidadesReferenciaEtapa3[chave] || 0),
            Number(itemConf.quantidadeSolicitada || 0),
            Number(itemConf.quantidadeAprovada || 0),
            1
          );

          const precoFinalItem = precoVigente > 0 ? precoVigente : Number(itemConf.precoUnitario || 0);

          if (saldoDisponivel <= 0) {
            return {
              ...itemConf,
              precoUnitario: precoFinalItem,
              quantidadeSolicitada: qtdReferencia,
              quantidadeDisponivel: 0,
              quantidadeAprovada: 0,
              subtotalItem: 0,
              status: 'ESGOTADO' as StatusConferenciaItem,
              motivo: 'Item esgotado em tempo real no estoque.',
            };
          }

          if (saldoDisponivel < qtdReferencia) {
            const novaQtdAprovada = saldoDisponivel;
            return {
              ...itemConf,
              precoUnitario: precoFinalItem,
              quantidadeSolicitada: qtdReferencia,
              quantidadeDisponivel: saldoDisponivel,
              quantidadeAprovada: novaQtdAprovada,
              subtotalItem: Number((precoFinalItem * novaQtdAprovada).toFixed(2)),
              status: 'QUANTIDADE_AJUSTADA' as StatusConferenciaItem,
              motivo: `Quantidade reduzida de ${qtdReferencia} un. para ${novaQtdAprovada} un. conforme estoque disponível.`,
            };
          }

          return {
            ...itemConf,
            precoUnitario: precoFinalItem,
            quantidadeSolicitada: qtdReferencia,
            quantidadeDisponivel: saldoDisponivel,
            quantidadeAprovada: qtdReferencia,
            subtotalItem: Number((precoFinalItem * qtdReferencia).toFixed(2)),
            status: 'DISPONIVEL' as StatusConferenciaItem,
            motivo: null,
          };
        });

        const atualizadosValidados = novosConferidos
          .filter((c) => c.status !== 'ESGOTADO' && c.quantidadeAprovada > 0)
          .map((c) => ({
            produtoId: c.produtoId,
            tamanhoId: c.tamanhoId,
            corId: c.corId,
            nome: c.nome,
            imagemUrl: c.imagemUrl || '',
            precoUnitario: c.precoUnitario,
            quantidade: c.quantidadeAprovada,
            totalItem: Number((c.quantidadeAprovada * c.precoUnitario).toFixed(2)),
          }));

        setItensConfirmadosPagamento(atualizadosValidados);
        return novosConferidos;
      });
    };

    socket.on('produtoAtualizado', handleProdutoAtualizadoNaEtapa3);
    socket.on('produto-atualizado', handleProdutoAtualizadoNaEtapa3);

    return () => {
      socket.off('produtoAtualizado', handleProdutoAtualizadoNaEtapa3);
      socket.off('produto-atualizado', handleProdutoAtualizadoNaEtapa3);
    };
  }, [step, dadosPix, quantidadesReferenciaEtapa3]);

  const handleIrParaPagamento = async () => {
    if (totalGeral < 1.0) {
      setMetodoPagamento('pix');
    }
    setStep(3);
    await conferirDisponibilidadeItens(itensSelecionadosOriginais);
  };

  const handleContinuarComDisponiveis = () => {
    const aprovados = itensConferidos
      .filter((c) => c.status !== 'ESGOTADO' && c.quantidadeAprovada > 0)
      .map((c) => ({
        produtoId: c.produtoId,
        tamanhoId: c.tamanhoId,
        corId: c.corId,
        nome: c.nome,
        imagemUrl: c.imagemUrl || '',
        precoUnitario: c.precoUnitario,
        quantidade: c.quantidadeAprovada,
        totalItem: Number((c.quantidadeAprovada * c.precoUnitario).toFixed(2)),
      }));

    if (aprovados.length === 0) return;

    const novoSubtotal = aprovados.reduce((acc, i) => acc + i.totalItem, 0);
    const novoTotalEstimado = Number((Math.max(0, novoSubtotal - valorDesconto) + valorFreteNum).toFixed(2));

    if (novoTotalEstimado < 1.0 && metodoPagamento === 'credit_card') {
      setMetodoPagamento('pix');
    }

    setItensConfirmadosPagamento(aprovados);
    setRevisaoConfirmada(true);
    setErroPagamento('');
  };

  const handleCancelarEVoltarCarrinho = () => {
    localStorage.removeItem('pedidoParaRefazerId');
    setItensConfirmadosPagamento(null);
    setItensConferidos([]);
    setRevisaoConfirmada(false);
    onClose();
  };

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

      const produtosParaEnvio = itensSelecionadosOriginais.map((item) => {
        const dados = extrairIdsItem(item);
        return {
          produtoId: dados.produtoId,
          quantidade: dados.quantidade,
        };
      });

      const res = await axios.post(
        `${API_URL}/api/frete/calcular`,
        {
          cepDestino: cepLimpo,
          itens: produtosParaEnvio,
          products: produtosParaEnvio,
        },
        { withCredentials: true }
      );

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

  const enviarPedidoParaBackend = async (payloadCard: any = null) => {
    const itensEnvioBase =
      itensConfirmadosPagamento && itensConfirmadosPagamento.length > 0
        ? itensConfirmadosPagamento
        : itensConferidos.length > 0
        ? itensConferidos
            .filter((c) => c.status !== 'ESGOTADO' && c.quantidadeAprovada > 0)
            .map((c) => ({
              produtoId: c.produtoId,
              tamanhoId: c.tamanhoId,
              corId: c.corId,
              nome: c.nome,
              precoUnitario: c.precoUnitario,
              quantidade: c.quantidadeAprovada,
            }))
        : itensAtivos;

    const subtotalEnvio = Number(
      itensEnvioBase
        .reduce((acc, item) => {
          const d = extrairIdsItem(item);
          return acc + d.precoUnitario * d.quantidade;
        }, 0)
        .toFixed(2)
    );

    const descontoEnvio = cupomAplicado
      ? cupomAplicado.tipo === 'PERCENTUAL'
        ? Number(((subtotalEnvio * (Number(cupomAplicado.valor) || 0)) / 100).toFixed(2))
        : Number((Number(cupomAplicado.valor) || 0).toFixed(2))
      : 0;

    const totalEnvio = Number((Math.max(0, subtotalEnvio - descontoEnvio) + valorFreteNum).toFixed(2));

    if (metodoPagamento === 'credit_card' && totalEnvio < 1.0) {
      const msg = 'O valor mínimo para pagamentos com cartão de crédito é de R$ 1,00.';
      setErroPagamento(msg);
      alert(msg);
      setMetodoPagamento('pix');
      return;
    }

    try {
      setLoadingPagamento(true);
      setErroPagamento('');

      const endpoint = `${API_URL}/api/pagamento`;

      const itemsFormatados = itensEnvioBase.map((item) => {
        const dados = extrairIdsItem(item);
        return {
          produtoId: dados.produtoId,
          tamanhoId: dados.tamanhoId,
          corId: dados.corId,
          nome: dados.nome,
          preco: dados.precoUnitario,
          quantidade: dados.quantidade,
        };
      });

      const payloadBackend = {
        pedidoParaRefazerId: pedidoIdRefazer || null,
        transaction_amount: totalEnvio,
        token: payloadCard?.token || null,
        description: 'Compra Ninho de Promessas',
        installments: Number(payloadCard?.installments || 1),
        payment_method_id: metodoPagamento === 'pix' ? 'pix' : payloadCard?.payment_method_id || 'master',
        issuer_id: payloadCard?.issuer_id || null,
        subtotal: subtotalEnvio,
        descontoCupom: descontoEnvio,
        cupomCodigo: cupomAplicado?.codigo || null,
        valorFrete: valorFreteNum,
        servicoFrete: freteSelecionado?.name || 'Padrão',
        prazoEntrega:
          freteSelecionado?.id === 'pickup_store'
            ? 'Retirada Imediata'
            : freteSelecionado
            ? `${freteSelecionado.custom_delivery_time} dias úteis`
            : '',
        endereco: {
          cep: endereco.cep.replace(/\D/g, ''),
          rua: endereco.logradouro,
          numero: endereco.numero,
          complemento: endereco.complemento,
          bairro: endereco.bairro,
          cidade: endereco.cidade,
          estado: endereco.uf,
        },
        items: itemsFormatados,
      };

      const res = await axios.post(endpoint, payloadBackend, {
        withCredentials: true,
      });

      if (res.data.success || res.data.sucesso) {
        localStorage.removeItem('pedidoParaRefazerId');

        const qrCodePix = res.data.qrCode || res.data.pixCopiaECola || res.data.pedido?.qrCodePix;
        const qrCodeBase64Pix = res.data.qrCodeBase64 || res.data.pedido?.qrCodeBase64Pix;

        if (!pedidoIdRefazer && limparCarrinho) {
          await limparCarrinho();
        }

        if (metodoPagamento === 'pix' && qrCodePix) {
          setDadosPix({
            qrCode: qrCodePix,
            qrCodeBase64: qrCodeBase64Pix,
          });
          setTempoRestantePix(15 * 60);
        } else {
          alert('🎉 Pagamento processado com sucesso!');
          if (onPaymentSuccess) {
            onPaymentSuccess();
          } else {
            onClose();
          }
        }
      }
    } catch (err: any) {
      console.error('Erro ao processar pagamento:', err);

      if (err.response?.status === 409 && Array.isArray(err.response?.data?.itensIndisponiveis)) {
        setRevisaoConfirmada(false);
        setItensConfirmadosPagamento(null);
        await conferirDisponibilidadeItens(itensSelecionadosOriginais);
      }

      const mensagemErro = err.response?.data?.message || 'Erro ao processar o pagamento ou verificar estoque.';
      setErroPagamento(mensagemErro);
      alert(mensagemErro);
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

  const haItensComDivergencia = itensConferidos.some(
    (i) => i.status !== 'DISPONIVEL' || i.quantidadeAprovada !== i.quantidadeSolicitada
  );
  const haAlgumItemValido =
    itensConferidos.length === 0
      ? itensSelecionadosOriginais.length > 0
      : itensConferidos.some((i) => i.status !== 'ESGOTADO' && i.quantidadeAprovada > 0);

  const podeExibirPagamento =
    haAlgumItemValido && (revisaoConfirmada || !haItensComDivergencia || Boolean(itensConfirmadosPagamento));

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h2>Finalizar Compra</h2>
          <button type="button" className={styles.closeBtn} onClick={onClose}>
            ✕
          </button>
        </div>

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

        {dadosPix ? (
          <div className={styles.pixResultContainer}>
            <div className={styles.pixHeader}>
              <h3>⚡ Pagamento PIX Gerado!</h3>
              <p>Escaneie o QR Code ou copie a chave abaixo:</p>

              <div className={styles.pixCountdownBox}>
                ⏱️ Tempo restante para pagamento: <strong>{formatarTempoPix(tempoRestantePix)}</strong>
              </div>
            </div>

            {dadosPix.qrCodeBase64 && (
              <div className={styles.qrCodeWrapper}>
                <img
                  src={
                    dadosPix.qrCodeBase64.startsWith('data:')
                      ? dadosPix.qrCodeBase64
                      : `data:image/jpeg;base64,${dadosPix.qrCodeBase64}`
                  }
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

            <button
              type="button"
              className={styles.primaryButton}
              onClick={() => {
                if (onPaymentSuccess) {
                  onPaymentSuccess();
                } else {
                  onClose();
                }
              }}
            >
              Acompanhar Meus Pedidos
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
                  <strong>Entregar em:</strong> {endereco.logradouro}, {endereco.numero}{' '}
                  {endereco.complemento ? `- ${endereco.complemento}` : ''}
                  <br />
                  {endereco.bairro} - {endereco.cidade}/{endereco.uf} (CEP: {endereco.cep})
                  <button type="button" className={styles.editBtn} onClick={() => setStep(1)}>
                    Editar
                  </button>
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

                {/* CUPOM */}
                <div className={styles.couponBox}>
                  <label className={styles.couponLabel}>🎟️ Possui cupom de desconto?</label>
                  {cupomAplicado ? (
                    <div className={styles.couponApplied}>
                      <span>
                        Cupom <strong>{cupomAplicado.codigo}</strong> aplicado (
                        {cupomAplicado.tipo === 'PERCENTUAL'
                          ? `${cupomAplicado.valor}% OFF`
                          : `R$ ${cupomAplicado.valor.toFixed(2)} OFF`}
                        )
                      </span>
                      <button type="button" onClick={handleRemoverCupom} className={styles.couponRemoveBtn}>
                        Remover
                      </button>
                    </div>
                  ) : (
                    <form onSubmit={handleAplicarCupom} className={styles.couponForm}>
                      <input
                        type="text"
                        placeholder="Digite o código (ex: PRIMEIRACOMPRA)"
                        value={codigoCupomInput}
                        onChange={(e) => setCodigoCupomInput(e.target.value)}
                        className={styles.selectInput}
                      />
                      <button
                        type="submit"
                        className={styles.secondaryButton}
                        disabled={loadingCupom || !codigoCupomInput.trim()}
                      >
                        {loadingCupom ? 'Aplicando...' : 'Aplicar'}
                      </button>
                    </form>
                  )}
                  {erroCupom && <p className={styles.errorText}>{erroCupom}</p>}
                </div>

                <div className={styles.summaryFooter}>
                  <div className={styles.summaryRow}>
                    <span>Subtotal ({itensSelecionadosOriginais.length} itens selecionados):</span>
                    <span>R$ {valorTotalBase.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                  </div>
                  {cupomAplicado && (
                    <div className={styles.summaryRow}>
                      <span>Desconto ({cupomAplicado.codigo}):</span>
                      <span>
                        - R$ {valorDesconto.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                  )}
                  <div className={styles.summaryRow}>
                    <span>Frete ({freteSelecionado?.name || 'Não selecionado'}):</span>
                    <span>
                      {valorFreteNum === 0
                        ? 'Grátis'
                        : `R$ ${valorFreteNum.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
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
                    onClick={handleIrParaPagamento}
                  >
                    Conferir Itens e Ir para Pagamento →
                  </button>
                </div>
              </div>
            )}

            {/* ETAPA 3: CONFERÊNCIA DE ITENS + PAGAMENTO */}
            {step === 3 && (
              <div className={styles.stepForm}>
                <h3>💳 Etapa 3: Conferência e Pagamento</h3>

                {carregandoRefazer || conferindoEstoque ? (
                  <div className={styles.loadingBox}>
                    {carregandoRefazer
                      ? 'Carregando dados do pedido...'
                      : 'Conferindo disponibilidade dos itens no estoque...'}
                  </div>
                ) : erroConferencia ? (
                  <div className={styles.reviewAlertBox}>
                    <p className={styles.errorText}>{erroConferencia}</p>
                    <div className={styles.actionButtons}>
                      <button
                        type="button"
                        className={styles.secondaryButton}
                        onClick={handleCancelarEVoltarCarrinho}
                      >
                        Cancelar e Voltar ao Carrinho
                      </button>
                      <button
                        type="button"
                        className={styles.primaryButton}
                        onClick={() => conferirDisponibilidadeItens(itensSelecionadosOriginais)}
                      >
                        Tentar Conferir Novamente
                      </button>
                    </div>
                  </div>
                ) : itensSelecionadosOriginais.length === 0 ? (
                  <div className={styles.reviewAlertBox}>
                    <p className={styles.errorText}>⚠️ Não foram encontrados itens selecionados para este pedido.</p>
                    <button
                      type="button"
                      className={styles.secondaryButton}
                      onClick={handleCancelarEVoltarCarrinho}
                    >
                      Cancelar e Voltar ao Carrinho
                    </button>
                  </div>
                ) : (
                  <>
                    {/* BLOCO DE CONFERÊNCIA DE TODOS OS ITENS SELECIONADOS */}
                    <div className={styles.reviewSection}>
                      <div className={styles.reviewHeader}>
                        <strong>Itens selecionados ({itensConferidos.length || itensSelecionadosOriginais.length})</strong>
                        {haItensComDivergencia && (
                          <span className={styles.badgeWarning}>Quantidade / estoque alterado</span>
                        )}
                      </div>

                      {haItensComDivergencia && (
                        <div className={styles.infoBanner}>
                          ⚠️ Houve alteração de estoque/quantidade em um ou mais itens. Confira antes de concluir.
                        </div>
                      )}

                      <ul className={styles.reviewList}>
                        {(itensConferidos.length > 0
                          ? itensConferidos
                          : itensSelecionadosOriginais.map((item) => {
                              const d = extrairIdsItem(item);
                              return {
                                produtoId: d.produtoId,
                                tamanhoId: d.tamanhoId,
                                corId: d.corId,
                                nome: d.nome,
                                imagemUrl: d.imagemUrl,
                                precoUnitario: d.precoUnitario,
                                quantidadeSolicitada: d.quantidade,
                                quantidadeDisponivel: d.quantidade,
                                quantidadeAprovada: d.quantidade,
                                subtotalItem: Number((d.precoUnitario * d.quantidade).toFixed(2)),
                                status: 'DISPONIVEL' as StatusConferenciaItem,
                                motivo: null,
                              };
                            })
                        ).map((itemConf, idx) => {
                          const isEsgotado = itemConf.status === 'ESGOTADO';
                          const isAjustado =
                            itemConf.status === 'QUANTIDADE_AJUSTADA' ||
                            (!isEsgotado && itemConf.quantidadeAprovada !== itemConf.quantidadeSolicitada);

                          const valorOriginalItem = Number(
                            (Number(itemConf.precoUnitario || 0) * Number(itemConf.quantidadeSolicitada || 0)).toFixed(2)
                          );

                          return (
                            <li
                              key={`${itemConf.produtoId}-${itemConf.tamanhoId || ''}-${itemConf.corId || ''}-${idx}`}
                              className={`${styles.reviewItem} ${
                                isEsgotado
                                  ? styles.reviewItemSoldOut
                                  : isAjustado
                                  ? styles.reviewItemAdjusted
                                  : styles.reviewItemAvailable
                              }`}
                            >
                              <div className={styles.reviewItemLeft}>
                                {itemConf.imagemUrl ? (
                                  <img
                                    src={itemConf.imagemUrl}
                                    alt={itemConf.nome}
                                    className={`${styles.reviewThumb} ${isEsgotado ? styles.reviewThumbSoldOut : ''}`}
                                  />
                                ) : (
                                  <div className={styles.reviewThumbPlaceholder}>Sem foto</div>
                                )}

                                <div className={styles.reviewItemInfo}>
                                  <strong className={isEsgotado ? styles.itemStrike : ''}>{itemConf.nome}</strong>
                                  {isEsgotado ? (
                                    <span className={styles.reviewItemMeta}>
                                      Solicitado: {itemConf.quantidadeSolicitada} un. — Esgotado
                                    </span>
                                  ) : isAjustado ? (
                                    <span className={styles.reviewItemMeta}>
                                      <strong>
                                        Quantidade reduzida de {itemConf.quantidadeSolicitada} un. para{' '}
                                        {itemConf.quantidadeAprovada} un.
                                      </strong>{' '}
                                      · R${' '}
                                      {Number(itemConf.precoUnitario || 0).toLocaleString('pt-BR', {
                                        minimumFractionDigits: 2,
                                      })}{' '}
                                      / un.
                                    </span>
                                  ) : (
                                    <span className={styles.reviewItemMeta}>
                                      {itemConf.quantidadeAprovada} un. × R${' '}
                                      {Number(itemConf.precoUnitario || 0).toLocaleString('pt-BR', {
                                        minimumFractionDigits: 2,
                                      })}{' '}
                                      / un.
                                    </span>
                                  )}
                                  {itemConf.motivo && (
                                    <small className={styles.reviewItemReason}>{itemConf.motivo}</small>
                                  )}
                                </div>
                              </div>

                              <div className={styles.reviewItemRight}>
                                <span
                                  className={`${styles.statusPill} ${
                                    isEsgotado
                                      ? styles.pillSoldOut
                                      : isAjustado
                                      ? styles.pillAdjusted
                                      : styles.pillAvailable
                                  }`}
                                >
                                  {isEsgotado ? 'Esgotado' : isAjustado ? 'Qtd. reduzida' : 'Disponível'}
                                </span>

                                {isAjustado && valorOriginalItem > Number(itemConf.subtotalItem || 0) && (
                                  <small className={styles.itemStrike}>
                                    R${' '}
                                    {valorOriginalItem.toLocaleString('pt-BR', {
                                      minimumFractionDigits: 2,
                                    })}
                                  </small>
                                )}

                                <strong className={isEsgotado ? styles.itemStrike : ''}>
                                  R${' '}
                                  {Number(itemConf.subtotalItem || 0).toLocaleString('pt-BR', {
                                    minimumFractionDigits: 2,
                                  })}
                                </strong>
                              </div>
                            </li>
                          );
                        })}
                      </ul>

                      {/* Ações quando há divergência de estoque (esgotado ou quantidade ajustada) */}
                      {haItensComDivergencia && !revisaoConfirmada && (
                        <div className={styles.reviewActionsBox}>
                          {haAlgumItemValido ? (
                            <p className={styles.reviewNotice}>
                              Um ou mais itens alteraram a disponibilidade ou tiveram a quantidade reduzida. Deseja
                              continuar com os itens disponíveis ou cancelar e voltar ao carrinho?
                            </p>
                          ) : (
                            <p className={styles.errorText}>
                              Todos os itens selecionados esgotaram no momento. Cancele para voltar ao carrinho e revisar
                              outros produtos.
                            </p>
                          )}

                          <div className={styles.actionButtons}>
                            <button
                              type="button"
                              className={styles.secondaryButton}
                              onClick={handleCancelarEVoltarCarrinho}
                            >
                              Cancelar / Voltar ao Carrinho
                            </button>

                            {haAlgumItemValido && (
                              <button
                                type="button"
                                className={styles.primaryButton}
                                onClick={handleContinuarComDisponiveis}
                              >
                                Continuar com Itens Disponíveis
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* MÉTODOS DE PAGAMENTO */}
                    {podeExibirPagamento && itensAtivos.length > 0 && (
                      <>
                        <div className={styles.paymentMethodsGrid}>
                          <button
                            type="button"
                            className={`${styles.paymentMethodCard} ${
                              metodoPagamento === 'pix' ? styles.paymentMethodSelected : ''
                            }`}
                            onClick={() => setMetodoPagamento('pix')}
                          >
                            <span className={styles.paymentIcon}>⚡</span>
                            <strong>PIX</strong>
                            <small>Reserva de 15 minutos</small>
                          </button>

                          {permiteCartao && (
                            <button
                              type="button"
                              className={`${styles.paymentMethodCard} ${
                                metodoPagamento === 'credit_card' ? styles.paymentMethodSelected : ''
                              }`}
                              onClick={() => setMetodoPagamento('credit_card')}
                            >
                              <span className={styles.paymentIcon}>💳</span>
                              <strong>Cartão de Crédito</strong>
                              <small>Reserva de até 48h úteis</small>
                            </button>
                          )}
                        </div>

                        {!permiteCartao && (
                          <div className={styles.infoBanner}>
                            ℹ️ O pagamento com Cartão de Crédito está disponível apenas para pedidos a partir de{' '}
                            <strong>R$ 1,00</strong>. Para este valor, utilize o <strong>PIX</strong>.
                          </div>
                        )}

                        {metodoPagamento === 'pix' && (
                          <div className={styles.pixContainer}>
                            <p className={styles.pixInfo}>
                              Ao clicar em <strong>Finalizar Pedido</strong>, o estoque será reservado por{' '}
                              <strong>15 minutos</strong> e o QR Code PIX será gerado.
                            </p>

                            <button
                              type="button"
                              className={styles.primaryButton}
                              onClick={() => enviarPedidoParaBackend()}
                              disabled={loadingPagamento}
                            >
                              {loadingPagamento ? 'Reservando estoque e gerando PIX...' : 'Finalizar Pedido'}
                            </button>
                          </div>
                        )}

                        {permiteCartao && metodoPagamento === 'credit_card' && totalGeral >= 1.0 && (
                          <div className={styles.cardBrickContainer}>
                            <CardPayment
                              key={`card-${totalGeral}`}
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
                              onError={(error) => {
                                console.error('Erro no Card Brick:', JSON.stringify(error, null, 2), error);
                              }}
                              onReady={() => console.log('Card Payment Brick pronto e montado!')}
                            />
                          </div>
                        )}
                      </>
                    )}
                  </>
                )}

                <div className={styles.summaryFooter}>
                  <div className={styles.summaryRow}>
                    <span>Subtotal:</span>
                    <span>R$ {valorTotalBase.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                  </div>
                  {cupomAplicado && (
                    <div className={styles.summaryRow}>
                      <span>Desconto ({cupomAplicado.codigo}):</span>
                      <span>
                        - R$ {valorDesconto.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                  )}
                  <div className={styles.summaryRow}>
                    <span>Frete ({freteSelecionado?.name}):</span>
                    <span>
                      {valorFreteNum === 0
                        ? 'Grátis'
                        : `R$ ${valorFreteNum.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
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
                    disabled={loadingPagamento || conferindoEstoque}
                  >
                    ← Voltar para Envio
                  </button>
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={handleCancelarEVoltarCarrinho}
                    disabled={loadingPagamento}
                  >
                    Cancelar Compra
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