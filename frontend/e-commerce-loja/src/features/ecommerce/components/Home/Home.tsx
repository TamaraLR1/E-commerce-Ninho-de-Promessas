import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { io } from 'socket.io-client';
import styles from './Home.module.css';
import { CheckoutModal } from '../CheckoutModal/CheckoutModal';

axios.defaults.withCredentials = true;

// Definição dinâmica da URL da API (Local vs Produção)
const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const API_URL = isLocal 
  ? 'http://localhost:3333' 
  : 'https://ninhoback.tamaralr.com.br';

// Função auxiliar inteligente para tratar links com localhost gravados no banco
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

interface Category {
  id: string;
  nome: string;
  slug: string;
}

interface Product {
  id: string;
  nome: string;
  preco: string;
  precoPromocional?: string;
  temOferta?: boolean;
  percentualDesconto?: number;
  descricao: string;
  isVisible: boolean;
  ativo: boolean;
  ativoGeral?: boolean;
  categoria: Category;
  imagens: {
    id: string;
    url: string;
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
      slug: string;
    };
    cor?: {
      id: string;
      nome: string;
      hex: string;
      ativo?: boolean;
    };
  }[];
}

interface CartItem {
  product: Product;
  numericPrice: number;
  quantity: number;
  selectedSize: string;
  displayName: string;
  displayImage: string;
}

interface User {
  id: number;
  nome: string;
  email: string;
}

export const Home: React.FC = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isCategoryDrawerOpen, setIsCategoryDrawerOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('Todos');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedSizes, setSelectedSizes] = useState<{ [productId: string]: string }>({});
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  
  // Estados para o Modal estilo Admin e Carrossel do Card
  const [activeImageIndex, setActiveImageIndex] = useState<number>(0);
  const [selectedColorForDetails, setSelectedColorForDetails] = useState<string | null>(null);
  const [cardImageIndexes, setCardImageIndexes] = useState<{ [productId: string]: number }>({});
  
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);

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

    const fetchStoreData = async () => {
      try {
        const productsResponse = await axios.get(`${API_URL}/api/produtos`);
        if (productsResponse.data && Array.isArray(productsResponse.data)) {
          setProducts(productsResponse.data);
        }

        const categoriesResponse = await axios.get(`${API_URL}/api/categorias`);
        if (categoriesResponse.data && Array.isArray(categoriesResponse.data)) {
          setCategories(categoriesResponse.data);
        }
      } catch (error) {
        console.error('Erro ao carregar dados da loja:', error);
      }
    };

    checkUserSession();
    fetchStoreData();

    const socket = io(API_URL, {
      withCredentials: true,
      transports: ['websocket', 'polling'],
      secure: true,
      rejectUnauthorized: false
    });

    socket.on('produtoAtualizado', (produtoAlterado: Product) => {
      setProducts(prevProducts => {
        const index = prevProducts.findIndex(p => p.id === produtoAlterado.id);

        if (produtoAlterado.isVisible === false || produtoAlterado.ativoGeral === false) {
          return prevProducts.filter(p => p.id !== produtoAlterado.id);
        }

        if (index > -1) {
          const updated = [...prevProducts];
          updated[index] = produtoAlterado;
          return updated;
        } else {
          return [produtoAlterado, ...prevProducts];
        }
      });
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  const showToast = (message: string) => {
    setToastMessage(message);
    setTimeout(() => {
      setToastMessage(null);
    }, 3000);
  };

  const addToCartWithSpecificSize = (product: Product, size: string) => {
    if (!product) return;

    const precoEfetivo = product.temOferta && product.precoPromocional && Number(product.precoPromocional) > 0 
      ? Number(product.precoPromocional) 
      : (parseFloat(product.preco) || 0);

    const imageUrl = product.imagens && product.imagens.length > 0 ? getImageUrl(product.imagens[0].url) : '';

    setCart((prevCart) => {
      const safeCart = Array.isArray(prevCart) ? prevCart : [];
      
      const existingIndex = safeCart.findIndex(
        item => item.product.id === product.id && item.selectedSize === size
      );

      if (existingIndex > -1) {
        const updated = [...safeCart];
        updated[existingIndex] = {
          ...updated[existingIndex],
          numericPrice: precoEfetivo,
          quantity: updated[existingIndex].quantity + 1
        };
        return updated;
      }

      const newItem: CartItem = {
        product,
        numericPrice: precoEfetivo,
        quantity: 1,
        selectedSize: size,
        displayName: product.nome,
        displayImage: imageUrl,
      };

      return [...safeCart, newItem];
    });
  };

  const updateQuantity = (productId: string, amount: number) => {
    setCart((prevCart) =>
      prevCart
        .map(item => {
          if (item.product.id === productId) {
            const newQuantity = item.quantity + amount;
            return { ...item, quantity: newQuantity };
          }
          return item;
        })
        .filter(item => item.quantity > 0)
    );
  };

  const removeFromCart = (productId: string) => {
    setCart((prevCart) => prevCart.filter(item => item.product.id !== productId));
  };

  const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
  const totalPrice = cart.reduce((sum, item) => sum + item.numericPrice * item.quantity, 0);

  const filteredProducts = products.filter(p => {
    if (p.isVisible !== true) return false;
    if (p.ativoGeral === false) return false;

    const matchesSearch = p.nome.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          (p.descricao && p.descricao.toLowerCase().includes(searchTerm.toLowerCase()));
    if (!matchesSearch) return false;

    if (selectedCategory === 'Todos') return true;
    return p.categoria && p.categoria.nome.toLowerCase().trim() === selectedCategory.toLowerCase().trim();
  });

  return (
    <div className={styles.container}>
      {/* Banner da Loja */}
      <div className={styles.bannerContainer} style={{ position: 'relative' }}>
        <img 
          src="/banner.png" 
          alt="Banner Promocional" 
          className={styles.bannerImagem} 
        />

        {/* Botões flutuantes no canto direito */}
        <div style={{ position: 'absolute', top: '20px', right: '25px', display: 'flex', alignItems: 'center', gap: '10px', zIndex: 10 }}>
          <button 
            type="button"
            className={styles.desktopCartButton}
            style={{ 
              background: 'rgba(255, 255, 255, 0.9)', 
              color: '#0066cc', 
              border: '1px solid #cbd5e1', 
              padding: '0.4rem 0.8rem', 
              borderRadius: '20px', 
              fontWeight: 600, 
              cursor: 'pointer', 
              fontSize: '0.9rem',
              boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
            }}
            onClick={() => setIsCartOpen(true)}
          >
            🛒 ({totalItems})
          </button>

          {user ? (
            <button 
              type="button"
              className={styles.desktopCartButton}
              style={{ 
                background: 'rgba(255, 255, 255, 0.9)', 
                border: '1px solid #cbd5e1', 
                cursor: 'pointer', 
                fontWeight: 600, 
                color: '#4a5568', 
                padding: '0.4rem 1rem', 
                borderRadius: '6px',
                boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
              }}
              onClick={() => navigate('/perfil')}
            >
              👤 {user.nome.split(' ')[0]}
            </button>
          ) : (
            <button 
              type="button"
              className={styles.desktopCartButton}
              style={{ 
                backgroundColor: '#D7B796', 
                color: 'white', 
                border: 'none', 
                padding: '0.4rem 1rem', 
                borderRadius: '6px', 
                fontWeight: 600, 
                cursor: 'pointer', 
                fontSize: '0.9rem',
                boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
              }}
              onClick={() => navigate('/login')}
            >
              Entrar
            </button>
          )}
        </div>
      </div>

      {/* Área de Pesquisa e Botão de Categorias */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', padding: '1.2rem 5%', backgroundColor: '#fcfcfc', borderBottom: '1px solid #e2e8f0' }}>
        <div style={{ display: 'flex', alignItems: 'center', backgroundColor: '#ffffff', border: '1px solid #ced4da', borderRadius: '20px', padding: '0.5rem 1.2rem', width: '100%', maxWidth: '450px', boxShadow: '0 2px 6px rgba(0,0,0,0.03)' }}>
          <span style={{ marginRight: '8px', color: '#D7B796' }}>🔍</span>
          <input
            type="text"
            placeholder="O que você está procurando para o seu bebê?"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ border: 'none', background: 'transparent', outline: 'none', width: '100%', fontSize: '0.95rem', color: '#333' }}
          />
        </div>

        <div className={styles.desktopCategoryWrapper}>
          <button 
            type="button"
            onClick={() => setIsCategoryDrawerOpen(true)}
            style={{ 
              backgroundColor: '#D7B796', 
              color: 'white', 
              border: 'none', 
              padding: '0.5rem 1.2rem', 
              borderRadius: '6px', 
              fontWeight: 600, 
              cursor: 'pointer', 
              display: 'flex', 
              alignItems: 'center', 
              gap: '8px' 
            }}
          >
            📂 Categorias: {selectedCategory} ▼
          </button>
        </div>
      </div>

      {/* Vitrine de Produtos */}
      <main className={styles.productsSection}>
        <h2>Produtos em Destaque</h2>
        <div className={styles.grid}>
          {filteredProducts.length === 0 ? (
            <p style={{ color: '#666', gridColumn: '1 / -1', textAlign: 'center', padding: '2rem 0' }}>
              Nenhum produto encontrado.
            </p>
          ) : (
            filteredProducts.map(product => {
              // Mapeia as cores únicas disponíveis para este produto
              const coresCardMap = new Map();
              product.estoques?.forEach((item: any) => {
                if (item.cor) {
                  coresCardMap.set(item.cor.id, item.cor);
                }
              });
              const coresCardList = Array.from(coresCardMap.values()) as any[];
              const currentCardColor = selectedSizes[`color-${product.id}`] || coresCardList[0]?.id;

              // Filtra as imagens estritamente pertencentes à cor selecionada no card
              const imagensDaCorSelecionada = product.imagens?.filter((img: any) => {
                const imgCorId = img.corId || img.cor?.id;
                return !currentCardColor || imgCorId === currentCardColor;
              }) || [];

              const listaImagensCard = imagensDaCorSelecionada.length > 0 ? imagensDaCorSelecionada : product.imagens;
              
              const cardImgIndex = cardImageIndexes[product.id] || 0;
              const imagemAtualCardUrl = listaImagensCard[cardImgIndex]?.url || listaImagensCard[0]?.url || '';
              const imageUrl = getImageUrl(imagemAtualCardUrl);

              const tamanhosDoCard = product.estoques?.filter((item: any) => {
                return !currentCardColor || item.cor?.id === currentCardColor;
              }) || [];
              
              const availableSizes = tamanhosDoCard.length > 0 
                ? Array.from(new Set(tamanhosDoCard.map((e: any) => e.tamanho?.nome).filter(Boolean)))
                : (product.estoques && product.estoques.length > 0 
                    ? Array.from(new Set(product.estoques.map((e: any) => e.tamanho?.nome).filter(Boolean)))
                    : ['U']);
              
              const chosenSize = selectedSizes[product.id] || availableSizes[0];
              const numericPrice = parseFloat(product.preco) || 0;
              const precoPromocional = product.precoPromocional ? parseFloat(product.precoPromocional) : 0;
              const emOferta = product.temOferta && precoPromocional > 0;

              return (
                <div key={product.id} className={styles.productCard}>
                  <div className={styles.imageContainer} style={{ position: 'relative' }}>
                    <img 
                      src={imageUrl} 
                      alt={product.nome} 
                      className={styles.productImage} 
                      onClick={() => {
                        setSelectedProduct(product);
                        setActiveImageIndex(0);
                        setSelectedColorForDetails(currentCardColor || product.estoques?.find(e => e.cor)?.cor?.id || null);
                      }}
                    />

                    {/* Botões do Carrossel no Card */}
                    {listaImagensCard.length > 1 && (
                      <>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setCardImageIndexes(prev => ({
                              ...prev,
                              [product.id]: cardImgIndex === 0 ? listaImagensCard.length - 1 : cardImgIndex - 1
                            }));
                          }}
                          style={{
                            position: 'absolute', top: '50%', left: '8px', transform: 'translateY(-50%)',
                            background: 'rgba(0,0,0,0.5)', color: '#fff', border: 'none', borderRadius: '50%',
                            width: '28px', height: '28px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.9rem', zIndex: 5
                          }}
                        >
                          ‹
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setCardImageIndexes(prev => ({
                              ...prev,
                              [product.id]: cardImgIndex === listaImagensCard.length - 1 ? 0 : cardImgIndex + 1
                            }));
                          }}
                          style={{
                            position: 'absolute', top: '50%', right: '8px', transform: 'translateY(-50%)',
                            background: 'rgba(0,0,0,0.5)', color: '#fff', border: 'none', borderRadius: '50%',
                            width: '28px', height: '28px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.9rem', zIndex: 5
                          }}
                        >
                          ›
                        </button>
                      </>
                    )}

                    {emOferta && product.percentualDesconto && product.percentualDesconto > 0 && (
                      <span className={styles.discountBadgeOverlay}>
                        {product.percentualDesconto}% OFF
                      </span>
                    )}
                  </div>

                  <div className={styles.productInfo}>
                    <h3 onClick={() => {
                      setSelectedProduct(product);
                      setActiveImageIndex(0);
                      setSelectedColorForDetails(currentCardColor || product.estoques?.find(e => e.cor)?.cor?.id || null);
                    }}>{product.nome}</h3>
                    
                    <div className={styles.rating}>
                      {Array.from({ length: 5 }).map((_, i) => <span key={i} className={styles.star}>★</span>)}
                      <span className={styles.ratingText}> (5.0)</span>
                    </div>

                    {emOferta ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', margin: '8px 0' }}>
                        <span style={{ textDecoration: 'line-through', color: '#888', fontSize: '0.85rem' }}>
                          R$ {numericPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </span>
                        <span className={styles.price} style={{ color: '#D7B796', fontWeight: 'bold' }}>
                          R$ {precoPromocional.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                    ) : (
                      <p className={styles.price}>
                        R$ {numericPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </p>
                    )}

                    {coresCardList.length > 0 && (
                      <div className={styles.sizeContainer} style={{ marginTop: '8px', marginBottom: '8px' }}>
                        <span className={styles.sizeLabel}>Selecione a cor:</span>
                        <div className={styles.cardColorsRow}>
                          {coresCardList.map((c: any) => {
                            const isSelected = currentCardColor === c.id;
                            return (
                              <button
                                key={c.id}
                                type="button"
                                title={c.nome}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedSizes(prev => ({
                                    ...prev,
                                    [`color-${product.id}`]: c.id
                                  }));
                                  setCardImageIndexes(prev => ({
                                    ...prev,
                                    [product.id]: 0
                                  }));
                                }}
                                className={styles.cardColorButton}
                                style={{
                                  backgroundColor: c.hex || '#000',
                                  border: isSelected ? '2px solid #2563eb' : '1px solid #cbd5e1',
                                  transform: isSelected ? 'scale(1.15)' : 'scale(1)',
                                  boxShadow: isSelected ? '0 0 0 2px rgba(37, 99, 235, 0.2)' : 'none'
                                }}
                              />
                            );
                          })}
                        </div>
                      </div>
                    )}

                    <div className={styles.sizeContainer}>
                      <span className={styles.sizeLabel}>Selecione o tamanho:</span>
                      <div className={styles.sizeList}>
                        {availableSizes.map((size, index) => {
                          const isSelected = selectedSizes[product.id] === size;
                          return (
                            <button
                              key={index}
                              type="button"
                              className={`${styles.sizeBadge} ${isSelected ? styles.selectedSizeBadge : ''}`}
                              onClick={() => {
                                setSelectedSizes(prev => ({
                                  ...prev,
                                  [product.id]: size
                                }));
                              }}
                            >
                              {size}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <button 
                      className={styles.actionButton} 
                      type="button"
                      onClick={() => {
                        addToCartWithSpecificSize(product, chosenSize);
                        setIsCartOpen(true); 
                      }}
                    >
                      Adicionar ao Carrinho
                    </button>
                    
                    <button 
                      className={styles.buyButton} 
                      type="button"
                      onClick={() => { 
                        const sizeSelected = selectedSizes[product.id] || availableSizes[0];
                        if (!selectedSizes[product.id] && availableSizes.length > 1) {
                          showToast('Por favor, selecione um tamanho antes de comprar!');
                          return;
                        }

                        addToCartWithSpecificSize(product, sizeSelected); 
                        
                        if (!user) {
                          navigate('/login');
                        } else {
                          setIsCheckoutOpen(true); 
                        }
                      }}
                    >
                      Comprar
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </main>

      {/* Gaveta Lateral de Categorias */}
      {isCategoryDrawerOpen && (
        <div 
          onClick={() => setIsCategoryDrawerOpen(false)}
          style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 3000, display: 'flex', justifyContent: 'flex-start'
          }}
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '280px', maxWidth: '80%', height: '100%', backgroundColor: '#ffffff',
              boxShadow: '4px 0 15px rgba(0,0,0,0.15)', display: 'flex', flexDirection: 'column', zIndex: 3001
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.2rem 1.5rem', borderBottom: '1px solid #eee' }}>
              <h3 style={{ margin: 0, fontSize: '1.2rem', color: '#222', fontWeight: 700 }}>Categorias</h3>
              <button 
                type="button" 
                onClick={() => setIsCategoryDrawerOpen(false)}
                style={{ background: 'none', border: 'none', fontSize: '1.4rem', cursor: 'pointer', color: '#666' }}
              >
                ✕
              </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '1rem 0' }}>
              <button
                type="button"
                onClick={() => {
                  setSelectedCategory('Todos');
                  setIsCategoryDrawerOpen(false);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                style={{
                  width: '100%', padding: '12px 20px', textAlign: 'left',
                  background: selectedCategory === 'Todos' ? '#FAF7F2' : 'transparent',
                  border: 'none', borderLeft: selectedCategory === 'Todos' ? '4px solid #D7B796' : '4px solid transparent',
                  cursor: 'pointer', fontSize: '1rem', color: selectedCategory === 'Todos' ? '#D7B796' : '#333',
                  fontWeight: selectedCategory === 'Todos' ? 600 : 400
                }}
              >
                Todos os Produtos
              </button>

              {categories.map((cat) => {
                const isSelected = selectedCategory === cat.nome;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => {
                      setSelectedCategory(cat.nome);
                      setIsCategoryDrawerOpen(false);
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    style={{
                      width: '100%', padding: '12px 20px', textAlign: 'left',
                      background: isSelected ? '#FAF7F2' : 'transparent',
                      border: 'none', borderLeft: isSelected ? '4px solid #D7B796' : '4px solid transparent',
                      cursor: 'pointer', fontSize: '1rem', color: isSelected ? '#D7B796' : '#333',
                      fontWeight: isSelected ? 600 : 400
                    }}
                  >
                    {cat.nome}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Modal de Detalhes do Produto */}
      {selectedProduct && (
        <div className={styles.modalOverlay} onClick={() => setSelectedProduct(null)}>
          <div className={styles.modalContentBox} onClick={(e) => e.stopPropagation()}>
            <button 
              type="button"
              onClick={() => setSelectedProduct(null)}
              className={styles.modalCloseButton}
            >
              ✕
            </button>

            <div className={styles.modalGridContainer}>
              <div>
                {(() => {
                  const imagensModalDaCor = selectedProduct.imagens?.filter((img: any) => {
                    const imgCorId = img.corId || img.cor?.id;
                    return !selectedColorForDetails || imgCorId === selectedColorForDetails;
                  }) || [];

                  const listaImagensModal = imagensModalDaCor.length > 0 ? imagensModalDaCor : selectedProduct.imagens;
                  const imagemAtualModalUrl = listaImagensModal[activeImageIndex]?.url || listaImagensModal[0]?.url || '';

                  return (
                    <div>
                      <img 
                        src={getImageUrl(imagemAtualModalUrl)} 
                        alt={selectedProduct.nome} 
                        className={styles.modalMainImage} 
                      />
                      
                      {listaImagensModal.length > 1 && (
                        <div className={styles.modalThumbnailsList}>
                          {listaImagensModal.map((img: any, idx: number) => {
                            const isSelectedThumb = activeImageIndex === idx;
                            return (
                              <img 
                                key={img.id || idx} 
                                src={getImageUrl(img.url)} 
                                alt="" 
                                onClick={() => setActiveImageIndex(idx)}
                                className={`${styles.modalThumbItem} ${isSelectedThumb ? styles.modalThumbActive : styles.modalThumbInactive}`} 
                              />
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>

              <div>
                <span className={styles.modalCategoryBadge}>
                  {selectedProduct.categoria?.nome || 'Geral'}
                </span>
                <h2 className={styles.modalProductTitle}>{selectedProduct.nome}</h2>
                
                <div className={styles.modalPriceBlock}>
                  {selectedProduct.temOferta && selectedProduct.precoPromocional && Number(selectedProduct.precoPromocional) > 0 ? (
                    <div className={styles.modalOfferFlex}>
                      <span className={styles.modalOldPrice}>
                        R$ {(parseFloat(selectedProduct.preco) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </span>
                      <span className={styles.modalNewPrice}>
                        R$ {Number(selectedProduct.precoPromocional).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  ) : (
                    <span className={styles.modalNormalPrice}>
                      R$ {(parseFloat(selectedProduct.preco) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </span>
                  )}
                </div>

                <div 
                  className={styles.modalDescriptionText}
                  dangerouslySetInnerHTML={{ 
                    __html: (selectedProduct?.descricao || 'Nenhuma descrição informada.')
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

                <div className={styles.modalSectionGroup}>
                  <label className={styles.modalSectionLabel}>
                    🎨 Escolha a Cor / Estampa:
                  </label>
                  <div className={styles.modalColorsList}>
                    {(() => {
                      const coresUnicasMap = new Map();
                      selectedProduct.estoques?.forEach((item: any) => {
                        if (item.cor) {
                          coresUnicasMap.set(item.cor.id, item.cor);
                        }
                      });
                      const coresList = Array.from(coresUnicasMap.values());

                      if (coresList.length > 0) {
                        return coresList.map((c: any) => {
                          const isSelected = selectedColorForDetails === c.id;
                          return (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => {
                                setSelectedColorForDetails(c.id);
                                setActiveImageIndex(0);
                              }}
                              className={`${styles.modalColorButton} ${isSelected ? styles.modalColorButtonSelected : styles.modalColorButtonUnselected}`}
                            >
                              {c.hex && (
                                <span 
                                  className={styles.modalColorDot}
                                  style={{ backgroundColor: c.hex }}
                                ></span>
                              )}
                              {c.nome}
                            </button>
                          );
                        });
                      }
                      return <span className={styles.emptyNotice}>Cor única padrão</span>;
                    })()}
                  </div>
                </div>

                <div className={styles.modalSectionGroup}>
                  <label className={styles.modalSectionLabel}>
                    📏 Selecione o Tamanho:
                  </label>
                  <div className={styles.modalSizesGrid}>
                    {(() => {
                      if (!selectedProduct.estoques || selectedProduct.estoques.length === 0) {
                        return <span className={styles.emptyNotice}>Tamanho único</span>;
                      }

                      const tamanhosDaCor = selectedProduct.estoques.filter((item: any) => {
                        return !selectedColorForDetails || item.cor?.id === selectedColorForDetails;
                      });

                      if (tamanhosDaCor.length === 0) {
                        return <span className={styles.emptyNotice}>Selecione uma cor para ver os tamanhos.</span>;
                      }

                      const availableSizes = Array.from(new Set(tamanhosDaCor.map((e: any) => e.tamanho?.nome).filter(Boolean)));
                      const currentSelectedSize = selectedSizes[selectedProduct.id] || availableSizes[0];

                      return availableSizes.map((sizeName: any, idx: number) => {
                        const isSelected = currentSelectedSize === sizeName;
                        const estoqueItem = tamanhosDaCor.find((e: any) => e.tamanho?.nome === sizeName);
                        const estoqueDisp = estoqueItem?.estoque ?? 0;

                        return (
                          <button
                            key={idx}
                            type="button"
                            disabled={estoqueDisp === 0}
                            className={`${styles.sizeBadge} ${isSelected ? styles.selectedSizeBadge : ''}`}
                            style={{
                              opacity: estoqueDisp === 0 ? 0.4 : 1,
                              cursor: estoqueDisp === 0 ? 'not-allowed' : 'pointer',
                              padding: '8px 12px',
                              borderRadius: '6px',
                              border: isSelected ? '2px solid #2563eb' : '1px solid #cbd5e1',
                              background: isSelected ? '#eff6ff' : '#fff'
                            }}
                            onClick={() => {
                              setSelectedSizes(prev => ({
                                ...prev,
                                [selectedProduct.id]: sizeName
                              }));
                            }}
                          >
                            {sizeName} ({estoqueDisp})
                          </button>
                        );
                      });
                    })()}
                  </div>
                </div>

                <div style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <button 
                    className={styles.actionButton} 
                    type="button"
                    onClick={() => {
                      const availableSizes = selectedProduct.estoques && selectedProduct.estoques.length > 0 
                        ? Array.from(new Set(selectedProduct.estoques.map((e: any) => e.tamanho?.nome).filter(Boolean)))
                        : ['U'];
                      
                      const sizeSelected = selectedSizes[selectedProduct.id] || availableSizes[0];
                      if (!selectedSizes[selectedProduct.id] && availableSizes.length > 1) {
                        showToast('Por favor, selecione um tamanho antes de adicionar ao carrinho!');
                        return;
                      }

                      addToCartWithSpecificSize(selectedProduct, sizeSelected);
                      setSelectedProduct(null);
                      setIsCartOpen(true); 
                    }}
                  >
                    Adicionar ao Carrinho
                  </button>
                  
                  <button 
                    className={styles.buyButton} 
                    type="button"
                    onClick={() => { 
                      const availableSizes = selectedProduct.estoques && selectedProduct.estoques.length > 0 
                        ? Array.from(new Set(selectedProduct.estoques.map((e: any) => e.tamanho?.nome).filter(Boolean)))
                        : ['U'];

                      const sizeSelected = selectedSizes[selectedProduct.id] || availableSizes[0];
                      if (!selectedSizes[selectedProduct.id] && availableSizes.length > 1) {
                        showToast('Por favor, selecione um tamanho antes de comprar!');
                        return;
                      }

                      addToCartWithSpecificSize(selectedProduct, sizeSelected); 
                      setSelectedProduct(null); 
                      
                      if (!user) {
                        navigate('/login');
                      } else {
                        setIsCheckoutOpen(true); 
                      }
                    }}
                  >
                    Comprar
                  </button>
                </div>

              </div>
            </div>

          </div>
        </div>
      )}

      {/* Modal do Carrinho */}
      {isCartOpen && (
        <div className={styles.modalOverlay} onClick={() => setIsCartOpen(false)}>
          <div className={styles.cartModal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.cartHeader}>
              <h2>Seu Carrinho ({totalItems})</h2>
              <button type="button" className={styles.closeButton} onClick={() => setIsCartOpen(false)}>×</button>
            </div>

            <div className={styles.cartList}>
              {cart.length === 0 ? (
                <p className={styles.emptyCart}>O seu carrinho está vazio.</p>
              ) : (
                cart.map(item => (
                  <div key={`${item.product.id}-${item.selectedSize}`} className={styles.cartItem}>
                    <img src={item.displayImage} alt={item.displayName} className={styles.cartItemImage} />
                    
                    <div className={styles.cartItemInfo}>
                      <div className={styles.cartItemDetails}>
                        <h4>{item.displayName}</h4>
                        {item.selectedSize && (
                          <span className={styles.cartItemSize}>Tamanho: {item.selectedSize}</span>
                        )}
                        <button type="button" className={styles.removeButton} onClick={() => removeFromCart(item.product.id)}>
                          Remover
                        </button>
                      </div>
                      
                      <div className={styles.cartItemRight}>
                        <span className={styles.cartItemPrice}>
                          R$ {(item.numericPrice * item.quantity).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </span>
                        
                        <div className={styles.quantityControls}>
                          <button type="button" className={styles.qtyButton} onClick={() => updateQuantity(item.product.id, -1)}>-</button>
                          <span className={styles.qtyValue}>{item.quantity}</span>
                          <button type="button" className={styles.qtyButton} onClick={() => updateQuantity(item.product.id, 1)}>+</button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {cart.length > 0 && (
              <div className={styles.cartFooter}>
                <div className={styles.totalRow}>
                  <span>Total do Pedido:</span>
                  <span>R$ {totalPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                </div>
                <button 
                  type="button"
                  className={styles.actionButton} 
                  style={{ backgroundColor: '#28a745', padding: '0.8rem' }} 
                  onClick={() => {
                    if (!user) {
                      setIsCartOpen(false);
                      navigate('/login');
                    } else {
                      setIsCartOpen(false);
                      setIsCheckoutOpen(true);
                    }
                  }}
                >
                  Confirmar e Finalizar Compra
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal de Checkout */}
      {isCheckoutOpen && (
        <CheckoutModal 
          onClose={() => setIsCheckoutOpen(false)} 
          total={totalPrice} 
        />
      )}

      {/* Menu Fixo Inferior */}
      <nav className={styles.bottomNav}>
        <button type="button" className={styles.navBtn} onClick={() => setIsCategoryDrawerOpen(true)}>
          📂 Categorias
        </button>
        <button type="button" className={styles.navBtn} onClick={() => alert('Ofertas!')}>
          🔥 Ofertas
        </button>
        <button type="button" className={styles.navBtn} onClick={() => setIsCartOpen(true)}>
          🛒 ({totalItems})
        </button>
        <button 
          type="button" 
          className={styles.navBtn} 
          onClick={() => {
            if (!user) {
              navigate('/login');
            } else {
              navigate('/perfil');
            }
          }}
        >
          {user ? `👤 ${user.nome.split(' ')[0]}` : '🔑 Entrar'}
        </button>
      </nav>
      
      {/* Mensagem Flutuante (Toast) */}
      {toastMessage && (
        <div className={styles.toastContainer}>
          <span>🛍️</span>
          <p>{toastMessage}</p>
        </div>
      )}
    </div>
  );
};