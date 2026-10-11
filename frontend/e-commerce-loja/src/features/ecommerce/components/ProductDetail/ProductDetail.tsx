import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import ReactGA from 'react-ga4';
import styles from './ProductDetail.module.css';
import { useCart } from '../../components/CartContext/CartContext';
import { AuthModal } from '../../../ecommerce/components/AuthModal/AuthModal';

axios.defaults.withCredentials = true;

const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const API_URL = isLocal 
  ? 'http://localhost:3333' 
  : 'https://ninhoback.tamaralr.com.br';

const getImageUrl = (url?: string) => {
  if (!url) return '';

  let finalUrl = url;
  if (finalUrl.includes('localhost:3333') || finalUrl.includes('127.0.0.1:3333')) {
    const relativePath = finalUrl.replace(/https?:\/\/(localhost|127\.0\.0\.1):3333/, '');
    finalUrl = `${API_URL}${relativePath}`;
  } else if (!finalUrl.startsWith('http://') && !finalUrl.startsWith('https://')) {
    finalUrl = `${API_URL}${finalUrl.startsWith('/') ? '' : '/'}${finalUrl}`;
  }

  if (window.location.protocol === 'https:') {
    return finalUrl.replace(/^http:\/\//, 'https://');
  }

  return finalUrl;
};

const sortSizes = (sizes: string[]) => {
  const customOrder: { [key: string]: number } = {
    'RN': 1, 'P': 2, 'M': 3, 'G': 4, 'GG': 5, 'XGG': 6,
    'PP': 1, 'U': 99, 'ÚNICO': 99
  };

  return [...sizes].sort((a, b) => {
    const cleanA = a.toUpperCase().trim();
    const cleanB = b.toUpperCase().trim();

    if (customOrder[cleanA] !== undefined && customOrder[cleanB] !== undefined) {
      return customOrder[cleanA] - customOrder[cleanB];
    }
    if (customOrder[cleanA] !== undefined) return -1;
    if (customOrder[cleanB] !== undefined) return 1;

    const numA = parseFloat(cleanA);
    const numB = parseFloat(cleanB);
    if (!isNaN(numA) && !isNaN(numB)) {
      return numA - numB;
    }

    return cleanA.localeCompare(cleanB);
  });
};

interface Product {
  id: string;
  nome: string;
  preco: string;
  precoPromocional?: string;
  temOferta?: boolean;
  percentualDesconto?: number;
  descricao: string;
  categoria?: {
    id: string;
    nome: string;
  };
  imagens: {
    id: string;
    url: string;
    ordem?: number;
    corId?: string;
    cor?: {
      id: string;
      nome: string;
    };
  }[];
  estoques: {
    id: string;
    estoque: number;
    tamanho: {
      id: string;
      nome: string;
    };
    cor?: {
      id: string;
      nome: string;
      hex: string;
    };
  }[];
}

interface ShippingOption {
  nome: string;
  valor: number;
  prazo: string;
}

export const ProductDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { adicionarAoCarrinho } = useCart();

  const [product, setProduct] = useState<Product | null>(null);
  const [user, setUser] = useState<any | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [activeImageIndex, setActiveImageIndex] = useState<number>(0);
  const [selectedColorId, setSelectedColorId] = useState<string | null>(null);
  const [selectedSize, setSelectedSize] = useState<string>('');
  const [quantity, setQuantity] = useState<number>(1);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState<boolean>(false);

  // Estados de cálculo de Frete
  const [cep, setCep] = useState<string>('');
  const [calculatingShipping, setCalculatingShipping] = useState<boolean>(false);
  const [shippingOptions, setShippingOptions] = useState<ShippingOption[] | null>(null);

  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    const checkUserSession = async () => {
      try {
        const response = await axios.get<any>(`${API_URL}/api/perfil`);
        if (response.data && response.data.user) {
          setUser(response.data.user);
        }
      } catch (error) {
        setUser(null);
      }
    };

    const fetchProduct = async () => {
      try {
        setLoading(true);
        let foundProduct: Product | null = null;

        try {
          const response = await axios.get<any>(`${API_URL}/api/produtos/${id}`);
          if (response.data && (response.data.id || response.data.nome)) {
            foundProduct = response.data;
          }
        } catch (err) {
          console.warn('Rota individual não encontrada. Usando lista geral...');
        }

        if (!foundProduct) {
          const allProductsRes = await axios.get<any>(`${API_URL}/api/produtos`);
          if (Array.isArray(allProductsRes.data)) {
            foundProduct = allProductsRes.data.find((p: Product) => String(p.id) === String(id)) || null;
          }
        }

        if (foundProduct) {
          setProduct(foundProduct);

          const coresUnicasMap = new Map();
          foundProduct.estoques?.forEach((item: any) => {
            if (item.cor) coresUnicasMap.set(item.cor.id, item.cor);
          });
          const coresList = Array.from(coresUnicasMap.values());
          if (coresList.length > 0) {
            setSelectedColorId(coresList[0].id);
          }

          ReactGA.event({
            category: 'Ecommerce',
            action: 'view_item',
            label: `${foundProduct.nome} (ID: ${foundProduct.id})`
          });
        }
      } catch (error) {
        console.error('Erro ao carregar o produto:', error);
      } finally {
        setLoading(false);
      }
    };

    checkUserSession();
    if (id) {
      fetchProduct();
    }
  }, [id]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleAddToCart = async () => {
    if (!product) return;

    if (!user) {
      setIsAuthModalOpen(true);
      return;
    }

    if (!selectedSize && availableSizes.length > 0) {
      showToast('Por favor, selecione um tamanho antes de prosseguir!');
      return;
    }

    try {
      const estoqueItem = product.estoques?.find((e) => 
        e.tamanho?.nome === selectedSize && (!selectedColorId || e.cor?.id === selectedColorId)
      );

      await adicionarAoCarrinho({
        produtoId: product.id,
        tamanhoId: estoqueItem?.tamanho?.id || null,
        corId: selectedColorId || estoqueItem?.cor?.id || null,
        quantidade: quantity,
      });

      ReactGA.event({
        category: 'Ecommerce',
        action: 'click_buy',
        label: `${product.nome} (Tamanho: ${selectedSize}, Qtd: ${quantity})`
      });

      showToast(`Sucesso! ${quantity}x item(ns) adicionado(s) ao carrinho.`);
    } catch (error) {
      console.error('Erro ao adicionar produto:', error);
      setIsAuthModalOpen(true);
    }
  };

  const handleCalculateShipping = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCep = cep.replace(/\D/g, '');

    if (cleanCep.length !== 8) {
      showToast('Por favor, informe um CEP válido com 8 dígitos.');
      return;
    }

    if (!product?.id) {
      showToast('Produto indisponível para cálculo de frete.');
      return;
    }

    try {
      setCalculatingShipping(true);
      setShippingOptions(null);

      // ✅ Envia a estrutura correta com o array de itens exigido pelo backend
      const response = await axios.post(`${API_URL}/api/frete/calcular`, {
        cepDestino: cleanCep,
        itens: [
          {
            produtoId: product.id,
            quantidade: quantity,
          },
        ],
      });

      if (Array.isArray(response.data) && response.data.length > 0) {
        setShippingOptions(
          response.data.map((opt: any) => ({
            nome: opt.name || opt.nome,
            valor: parseFloat(opt.price || opt.valor || '0'),
            prazo: opt.custom_delivery_time 
              ? `Até ${opt.custom_delivery_time} dias úteis` 
              : opt.prazo || 'A consultar'
          }))
        );
      } else if (response.data && Array.isArray(response.data.opcoes)) {
        setShippingOptions(response.data.opcoes);
      } else {
        showToast('Nenhuma opção de frete encontrada para este CEP.');
      }
    } catch (error: any) {
      console.error('Erro ao calcular frete:', error);
      showToast(
        error.response?.data?.message || 'Erro ao calcular o frete para este CEP.'
      );
    } finally {
      setCalculatingShipping(false);
    }
  };

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.loadingState}>Carregando informações do produto...</div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className={styles.container}>
        <div className={styles.notFoundState}>
          <h2>Produto não encontrado</h2>
          <p>O produto pesquisado não está disponível no momento.</p>
          <button type="button" onClick={() => navigate('/')} className={styles.backButton}>
            ← Voltar para a loja
          </button>
        </div>
      </div>
    );
  }

  const imagensDaCor = product.imagens?.filter((img) => {
    const imgCorId = img.corId || img.cor?.id;
    return !selectedColorId || imgCorId === selectedColorId;
  }) || [];

  const listaImagensOrdenadas = [...imagensDaCor].sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));
  const listaImagens = listaImagensOrdenadas.length > 0 
    ? listaImagensOrdenadas 
    : [...(product.imagens || [])].sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));

  const imagemAtualUrl = listaImagens[activeImageIndex]?.url || listaImagens[0]?.url || '';

  const tamanhosDaCor = product.estoques?.filter((item) => {
    return !selectedColorId || item.cor?.id === selectedColorId;
  }) || [];

  const rawAvailableSizes = Array.from(new Set(tamanhosDaCor.map((e) => e.tamanho?.nome).filter(Boolean)));
  const availableSizes = sortSizes(rawAvailableSizes as string[]);

  const numericPrice = parseFloat(product.preco) || 0;
  const precoPromocional = product.precoPromocional ? parseFloat(product.precoPromocional) : 0;
  const emOferta = product.temOferta && precoPromocional > 0;

  return (
    <div className={styles.container}>
      <header className={styles.topHeader}>
        <button type="button" onClick={() => navigate('/')} className={styles.backLink}>
          ← Voltar para a vitrine
        </button>
      </header>

      <main className={styles.mainGrid}>
        {/* Galeria de Fotos */}
        <div className={styles.imageGallery}>
          <img 
            src={getImageUrl(imagemAtualUrl)} 
            alt={product.nome} 
            className={styles.mainImage} 
          />
          {listaImagens.length > 1 && (
            <div className={styles.thumbnailsList}>
              {listaImagens.map((img, idx) => (
                <img 
                  key={img.id || idx} 
                  src={getImageUrl(img.url)} 
                  alt="" 
                  onClick={() => setActiveImageIndex(idx)}
                  className={`${styles.thumbItem} ${activeImageIndex === idx ? styles.thumbActive : ''}`} 
                />
              ))}
            </div>
          )}
        </div>

        {/* Informações do Produto */}
        <div className={styles.productDetails}>
          <span className={styles.categoryBadge}>
            {product.categoria?.nome || 'Geral'}
          </span>
          <h1 className={styles.productTitle}>{product.nome}</h1>

          <div className={styles.priceBlock}>
            {emOferta ? (
              <div className={styles.offerFlex}>
                <span className={styles.oldPrice}>
                  R$ {numericPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
                <span className={styles.newPrice}>
                  R$ {precoPromocional.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
              </div>
            ) : (
              <span className={styles.normalPrice}>
                R$ {numericPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </span>
            )}
          </div>

          <div 
            className={styles.descriptionText}
            dangerouslySetInnerHTML={{ 
              __html: (product.descricao || 'Nenhuma descrição informada.')
                .split('\n')
                .map(line => {
                  const trimmed = line.trim();
                  if (trimmed.startsWith('*')) {
                    return `<li style="margin-top: 4px; margin-bottom: 4px;">${trimmed.substring(1).trim()}</li>`;
                  }
                  if (trimmed === '') {
                    return '<div style="height: 8px;"></div>';
                  }
                  return `<div>${trimmed}</div>`;
                })
                .join('')
            }}
          />

          {/* Escolha de Cor */}
          <div className={styles.sectionGroup}>
            <label className={styles.sectionLabel}>🎨 Escolha a Cor / Estampa:</label>
            <div className={styles.colorsList}>
              {(() => {
                const coresUnicasMap = new Map();
                product.estoques?.forEach((item) => {
                  if (item.cor) coresUnicasMap.set(item.cor.id, item.cor);
                });
                const coresList = Array.from(coresUnicasMap.values());

                if (coresList.length > 0) {
                  return coresList.map((c: any) => {
                    const isSelected = selectedColorId === c.id;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => {
                          setSelectedColorId(c.id);
                          setActiveImageIndex(0);
                        }}
                        className={`${styles.colorButton} ${isSelected ? styles.colorSelected : ''}`}
                      >
                        {c.hex && <span className={styles.colorDot} style={{ backgroundColor: c.hex }} />}
                        {c.nome}
                      </button>
                    );
                  });
                }
                return <span>Cor única padrão</span>;
              })()}
            </div>
          </div>

          {/* Escolha de Tamanho */}
          <div className={styles.sectionGroup}>
            <label className={styles.sectionLabel}>📏 Selecione o Tamanho:</label>
            <div className={styles.sizesGrid}>
              {availableSizes.length > 0 ? (
                availableSizes.map((sizeName, idx) => {
                  const isSelected = selectedSize === sizeName;
                  const estoqueItem = tamanhosDaCor.find((e) => e.tamanho?.nome === sizeName);
                  const estoqueDisp = estoqueItem?.estoque ?? 0;

                  return (
                    <button
                      key={idx}
                      type="button"
                      disabled={estoqueDisp === 0}
                      className={`${styles.sizeButton} ${isSelected ? styles.sizeSelected : ''}`}
                      style={{ opacity: estoqueDisp === 0 ? 0.4 : 1 }}
                      onClick={() => setSelectedSize(sizeName)}
                    >
                      {sizeName} ({estoqueDisp} em estoque)
                    </button>
                  );
                })
              ) : (
                <span>Tamanho único</span>
              )}
            </div>
          </div>

          {/* Seleção de Quantidade */}
          <div className={styles.sectionGroup}>
            <label className={styles.sectionLabel}>📦 Quantidade:</label>
            <div className={styles.quantityContainer}>
              <button 
                type="button" 
                onClick={() => setQuantity(prev => Math.max(1, prev - 1))}
                className={styles.qtyBtn}
              >
                -
              </button>
              <span className={styles.qtyValue}>{quantity}</span>
              <button 
                type="button" 
                onClick={() => setQuantity(prev => prev + 1)}
                className={styles.qtyBtn}
              >
                +
              </button>
            </div>
          </div>

          {/* Cálculo de CEP e Frete */}
          <div className={styles.shippingBox}>
            <label className={styles.sectionLabel}>🚚 Calcular Frete e Prazo:</label>
            <form onSubmit={handleCalculateShipping} className={styles.shippingForm}>
              <input 
                type="text" 
                placeholder="00000-000"
                value={cep}
                maxLength={9}
                onChange={(e) => setCep(e.target.value)}
                className={styles.cepInput}
              />
              <button type="submit" className={styles.calcButton} disabled={calculatingShipping}>
                {calculatingShipping ? 'Calculando...' : 'Calcular'}
              </button>
            </form>

            {shippingOptions && (
              <div className={styles.shippingResults}>
                {shippingOptions.map((opt, i) => (
                  <div key={i} className={styles.shippingOption}>
                    <div>
                      <strong>{opt.nome}</strong>
                      <span className={styles.shippingTime}> Prazo: {opt.prazo}</span>
                    </div>
                    <span className={styles.shippingPrice}>
                      R$ {opt.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Botões de Ação */}
          <div className={styles.actionsContainer}>
            <button 
              type="button" 
              className={styles.buyButton}
              onClick={handleAddToCart}
            >
              Comprar Agora
            </button>
          </div>
        </div>
      </main>

      <AuthModal 
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
      />

      {toastMessage && (
        <div className={styles.toast}>
          {toastMessage}
        </div>
      )}
    </div>
  );
};