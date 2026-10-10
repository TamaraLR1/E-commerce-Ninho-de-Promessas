import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import ReactGA from 'react-ga4';
import styles from './ProductDetail.module.css';

axios.defaults.withCredentials = true;

const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const API_URL = isLocal 
  ? 'http://localhost:3333' 
  : 'https://ninhoback.tamaralr.com.br';

const getImageUrl = (url?: string) => {
  if (!url) return '';
  if (url.includes('localhost:3333') || url.includes('127.0.0.1:3333')) {
    const relativePath = url.replace(/https?:\/\/(localhost|127\.0\.0\.1):3333/, '');
    return `${API_URL}${relativePath}`;
  }
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }
  return `${API_URL}${url.startsWith('/') ? '' : '/'}${url}`;
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

  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [activeImageIndex, setActiveImageIndex] = useState<number>(0);
  const [selectedColorId, setSelectedColorId] = useState<string | null>(null);
  const [selectedSize, setSelectedSize] = useState<string>('');
  const [quantity, setQuantity] = useState<number>(1);

  // Estados de cálculo de Frete
  const [cep, setCep] = useState<string>('');
  const [calculatingShipping, setCalculatingShipping] = useState<boolean>(false);
  const [shippingOptions, setShippingOptions] = useState<ShippingOption[] | null>(null);

  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    const fetchProduct = async () => {
      try {
        setLoading(true);
        let foundProduct: Product | null = null;

        // 1ª Tentativa: Endpoint individual com tipagem <any>
        try {
          const response = await axios.get<any>(`${API_URL}/api/produtos/${id}`);
          if (response.data && (response.data.id || response.data.nome)) {
            foundProduct = response.data;
          }
        } catch (err) {
          console.warn('Rota individual retornou 404. Utilizando fallback da lista geral...');
        }

        // 2ª Tentativa (Fallback): Se a rota individual der 404, busca da lista geral
        if (!foundProduct) {
          const allProductsRes = await axios.get<any>(`${API_URL}/api/produtos`);
          if (Array.isArray(allProductsRes.data)) {
            foundProduct = allProductsRes.data.find((p: Product) => String(p.id) === String(id)) || null;
          }
        }

        if (foundProduct) {
          setProduct(foundProduct);

          // Seleciona a primeira cor por padrão
          const coresUnicasMap = new Map();
          foundProduct.estoques?.forEach((item: any) => {
            if (item.cor) coresUnicasMap.set(item.cor.id, item.cor);
          });
          const coresList = Array.from(coresUnicasMap.values());
          if (coresList.length > 0) {
            setSelectedColorId(coresList[0].id);
          }

          // Envia o evento de visualização do produto para o Google Analytics
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

    if (id) {
      fetchProduct();
    }
  }, [id]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleCalculateShipping = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCep = cep.replace(/\D/g, '');

    if (cleanCep.length !== 8) {
      showToast('Por favor, informe um CEP válido com 8 dígitos.');
      return;
    }

    try {
      setCalculatingShipping(true);
      setShippingOptions(null);

      const response = await axios.post<any>(`${API_URL}/api/frete/calcular`, {
        cepDestino: cleanCep,
        produtoId: product?.id,
        quantidade: quantity
      });

      if (response.data && Array.isArray(response.data.opcoes)) {
        setShippingOptions(response.data.opcoes);
      } else {
        setShippingOptions([
          { nome: 'Padrão (Melhor Envio)', valor: 18.90, prazo: '4 a 6 dias úteis' },
          { nome: 'Expresso (Loggi)', valor: 28.50, prazo: '1 a 2 dias úteis' }
        ]);
      }
    } catch (error) {
      setShippingOptions([
        { nome: 'Entrega Padrão', valor: 19.90, prazo: '3 a 6 dias úteis' },
        { nome: 'Entrega Expressa', valor: 29.90, prazo: '1 a 2 dias úteis' }
      ]);
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
              onClick={() => {
                if (!selectedSize && availableSizes.length > 0) {
                  showToast('Por favor, selecione um tamanho antes de prosseguir!');
                  return;
                }
                
                // Dispara evento de clique de compra no Analytics
                ReactGA.event({
                  category: 'Ecommerce',
                  action: 'click_buy',
                  label: `${product.nome} (Tamanho: ${selectedSize}, Qtd: ${quantity})`
                });

                showToast(`Sucesso! ${quantity}x item(ns) selecionado(s).`);
              }}
            >
              Comprar Agora
            </button>
          </div>
        </div>
      </main>

      {toastMessage && (
        <div className={styles.toast}>
          {toastMessage}
        </div>
      )}
    </div>
  );
};