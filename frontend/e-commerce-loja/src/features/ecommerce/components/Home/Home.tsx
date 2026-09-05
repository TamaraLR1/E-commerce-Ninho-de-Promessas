import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { io } from 'socket.io-client';
import styles from './Home.module.css';
import { CheckoutModal } from '../CheckoutModal/CheckoutModal';

axios.defaults.withCredentials = true;

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
  }[];
  estoques: {
    id: string;
    estoque: number;
    tamanho: {
      id: string;
      nome: string;
      slug: string;
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
  const [selectedCategory, setSelectedCategory] = useState<string>('Todos');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedSizes, setSelectedSizes] = useState<{ [productId: string]: string }>({});
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);

  useEffect(() => {
    const checkUserSession = async () => {
      try {
        const response = await axios.get('http://localhost:3333/api/perfil');
        if (response.data && response.data.user) {
          setUser(response.data.user);
        }
      } catch (error) {
        setUser(null);
      }
    };

    const fetchStoreData = async () => {
      try {
        const productsResponse = await axios.get('http://localhost:3333/api/produtos');
        if (productsResponse.data && Array.isArray(productsResponse.data)) {
          setProducts(productsResponse.data);
        }

        const categoriesResponse = await axios.get('http://localhost:3333/api/categorias');
        if (categoriesResponse.data && Array.isArray(categoriesResponse.data)) {
          setCategories(categoriesResponse.data);
        }
      } catch (error) {
        console.error('Erro ao carregar dados da loja:', error);
      }
    };

    checkUserSession();
    fetchStoreData();

    const socket = io('http://localhost:3333', {
      withCredentials: true,
      transports: ['polling', 'websocket']
    });

    socket.on('produtoAtualizado', (produtoAlterado: Product) => {
      setProducts(prevProducts => {
        const index = prevProducts.findIndex(p => p.id === produtoAlterado.id);

        // Se o produto foi desmarcado da visibilidade ou inativado, remove da vitrine na hora
        if (produtoAlterado.isVisible === false || produtoAlterado.ativoGeral === false) {
          return prevProducts.filter(p => p.id !== produtoAlterado.id);
        }

        // Se ele está visível e ativo:
        if (index > -1) {
          // Já está na lista, apenas atualiza seus dados (preço, desconto, etc.)
          const updated = [...prevProducts];
          updated[index] = produtoAlterado;
          return updated;
        } else {
          // Não estava na lista (nasceu invisível e foi ativado agora), adiciona na vitrine!
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

    const imageUrl = product.imagens && product.imagens.length > 0 ? product.imagens[0].url : '';

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

    if (selectedCategory === 'Todos') return true;
    return p.categoria && p.categoria.nome.toLowerCase().trim() === selectedCategory.toLowerCase().trim();
  });

  return (
    <div className={styles.container}>
      {/* Banner da Loja */}
      <div className={styles.bannerContainer}>
        <img 
          src="/banner.png" 
          alt="Banner Promocional" 
          className={styles.bannerImagem} 
        />
      </div>

      {/* Barra de Filtros por Categoria */}
      <div className={styles.filterBar}>
        <button
          className={`${styles.filterButton} ${selectedCategory === 'Todos' ? styles.activeFilter : ''}`}
          onClick={() => setSelectedCategory('Todos')}
        >
          Todos
        </button>
        {categories.map(cat => (
          <button
            key={cat.id}
            className={`${styles.filterButton} ${selectedCategory === cat.nome ? styles.activeFilter : ''}`}
            onClick={() => setSelectedCategory(cat.nome)}
          >
            {cat.nome}
          </button>
        ))}
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
              const imageUrl = product.imagens && product.imagens.length > 0 ? product.imagens[0].url : '';
              const availableSizes = product.estoques && product.estoques.length > 0 
                ? Array.from(new Set(product.estoques.map(e => e.tamanho?.nome).filter(Boolean)))
                : ['U'];
              
              const chosenSize = selectedSizes[product.id] || availableSizes[0];
              const numericPrice = parseFloat(product.preco) || 0;
              const precoPromocional = product.precoPromocional ? parseFloat(product.precoPromocional) : 0;
              const emOferta = product.temOferta && precoPromocional > 0;

              return (
                <div key={product.id} className={styles.productCard}>
                  {/* Container da imagem com o selo absoluto em cima */}
                  <div className={styles.imageContainer} onClick={() => setSelectedProduct(product)}>
                    <img src={imageUrl} alt={product.nome} className={styles.productImage} />
                    {emOferta && product.percentualDesconto && product.percentualDesconto > 0 && (
                      <span className={styles.discountBadgeOverlay}>
                        {product.percentualDesconto}% OFF
                      </span>
                    )}
                  </div>

                  <div className={styles.productInfo}>
                    <h3 onClick={() => setSelectedProduct(product)}>{product.nome}</h3>
                    
                    <div className={styles.rating}>
                      {Array.from({ length: 5 }).map((_, i) => <span key={i} className={styles.star}>★</span>)}
                      <span className={styles.ratingText}> (5.0)</span>
                    </div>

                    {/* Exibição de Preço / Oferta */}
                    {emOferta ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', margin: '8px 0' }}>
                        <span style={{ textDecoration: 'line-through', color: '#888', fontSize: '0.85rem' }}>
                          R$ {numericPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </span>
                        <span className={styles.price} style={{ color: '#7A9974', fontWeight: 'bold' }}>
                          R$ {precoPromocional.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                    ) : (
                      <p className={styles.price}>
                        R$ {numericPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </p>
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

      {/* Modal de Detalhes do Produto */}
      {selectedProduct && (
        <div className={styles.modalOverlay} onClick={() => setSelectedProduct(null)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <button className={styles.closeButton} onClick={() => setSelectedProduct(null)}>×</button>
            
            <div style={{ position: 'relative', width: '100%', maxHeight: '350px', overflow: 'hidden' }}>
              <img 
                src={selectedProduct.imagens && selectedProduct.imagens.length > 0 ? selectedProduct.imagens[0].url : ''} 
                alt={selectedProduct.nome} 
                style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '8px' }} 
              />
              {selectedProduct.temOferta && selectedProduct.percentualDesconto && selectedProduct.percentualDesconto > 0 && (
                <span style={{ position: 'absolute', top: '10px', right: '10px', backgroundColor: '#7A9974', color: '#fff', padding: '6px 12px', borderRadius: '6px', fontWeight: 'bold' }}>
                  {selectedProduct.percentualDesconto}% OFF
                </span>
              )}
            </div>

            <h2>{selectedProduct.nome}</h2>
            <p className={styles.modalDescription}>{selectedProduct.descricao}</p>
            
            {selectedProduct.temOferta && selectedProduct.precoPromocional && Number(selectedProduct.precoPromocional) > 0 ? (
              <div style={{ margin: '10px 0', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ textDecoration: 'line-through', color: '#888', fontSize: '1rem' }}>
                  R$ {(parseFloat(selectedProduct.preco) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
                <span className={styles.price} style={{ fontSize: '1.5rem', color: '#7A9974' }}>
                  R$ {Number(selectedProduct.precoPromocional).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
              </div>
            ) : (
              <p className={styles.price} style={{ fontSize: '1.5rem' }}>
                R$ {(parseFloat(selectedProduct.preco) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </p>
            )}

            <button className={styles.actionButton} onClick={() => { 
              const availableSizes = selectedProduct.estoques && selectedProduct.estoques.length > 0 
                ? Array.from(new Set(selectedProduct.estoques.map(e => e.tamanho?.nome).filter(Boolean)))
                : ['U'];
              const size = selectedSizes[selectedProduct.id] || availableSizes[0];
              addToCartWithSpecificSize(selectedProduct, size); 
              setSelectedProduct(null); 
            }}>
              Adicionar ao Carrinho e Continuar
            </button>

            <button className={styles.buyButton} onClick={() => { 
              const availableSizes = selectedProduct.estoques && selectedProduct.estoques.length > 0 
                ? Array.from(new Set(selectedProduct.estoques.map(e => e.tamanho?.nome).filter(Boolean)))
                : ['U'];
              const size = selectedSizes[selectedProduct.id] || availableSizes[0];
              if (!selectedSizes[selectedProduct.id] && availableSizes.length > 1) {
                showToast('Por favor, selecione um tamanho antes de comprar!');
                return;
              }
              addToCartWithSpecificSize(selectedProduct, size); 
              setSelectedProduct(null); 
              if (!user) {
                navigate('/login');
              } else {
                setIsCheckoutOpen(true);
              }
            }}>
              Comprar
            </button>
          </div>
        </div>
      )}

      {/* Modal do Carrinho de Compras */}
      {isCartOpen && (
        <div className={styles.modalOverlay} onClick={() => setIsCartOpen(false)}>
          <div className={styles.cartModal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.cartHeader}>
              <h2>Seu Carrinho ({totalItems})</h2>
              <button className={styles.closeButton} onClick={() => setIsCartOpen(false)}>×</button>
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
                        <button className={styles.removeButton} onClick={() => removeFromCart(item.product.id)}>
                          Remover
                        </button>
                      </div>
                      
                      <div className={styles.cartItemRight}>
                        <span className={styles.cartItemPrice}>
                          R$ {(item.numericPrice * item.quantity).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </span>
                        
                        <div className={styles.quantityControls}>
                          <button className={styles.qtyButton} onClick={() => updateQuantity(item.product.id, -1)}>-</button>
                          <span className={styles.qtyValue}>{item.quantity}</span>
                          <button className={styles.qtyButton} onClick={() => updateQuantity(item.product.id, 1)}>+</button>
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
                <button className={styles.actionButton} style={{ backgroundColor: '#28a745', padding: '0.8rem' }} onClick={() => {
                  if (!user) {
                    setIsCartOpen(false);
                    navigate('/login');
                  } else {
                    setIsCartOpen(false);
                    setIsCheckoutOpen(true);
                  }
                }}>
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

      {/* Menu Fixo (apenas Mobile) */}
      <nav className={styles.bottomNav}>
        <button className={styles.navBtn} onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
          📦 Produtos
        </button>
        <button className={styles.navBtn} onClick={() => alert('Ofertas!')}>
          🔥 Ofertas
        </button>
        <button className={styles.navBtn} onClick={() => setIsCartOpen(true)}>
          🛒 ({totalItems})
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