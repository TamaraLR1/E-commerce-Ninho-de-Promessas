import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import styles from './Home.module.css';
import navStyles from './Navbar.module.css';
import { CheckoutModal } from '../CheckoutModal/CheckoutModal';

// Configuração global para o axios enviar e receber cookies HTTP-only
axios.defaults.withCredentials = true;

interface Product {
  id: number;
  name: string;
  price: string;
  numericPrice: number; 
  rating: number;
  category: string;
  image: string;
  description: string;
  sizes: string[];
}

interface CartItem {
  product: Product;
  quantity: number;
  selectedSize: string;
}

interface User {
  id: number;
  nome: string;
  email: string;
}

interface NavbarProps {
  cartCount: number;
  onCartClick: () => void;
  user: User | null;
  onLogout: () => void;
}

const Navbar: React.FC<NavbarProps> = ({ 
  cartCount, 
  onCartClick, 
  user, 
  onLogout 
}) => {
  const navigate = useNavigate();
  return (
    <nav className={navStyles.navbar}>
      <div className={navStyles.logo} onClick={() => navigate('/')}>Ninho de Promessas</div>
      <div className={navStyles.navLinks}>
        <span className={navStyles.link}>Produtos</span>
        <span className={navStyles.link}>Ofertas</span>
        <div className={navStyles.cartIcon} onClick={onCartClick}>
          🛒({cartCount})
        </div>
        {user ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <span style={{ fontWeight: 'bold', color: '#333' }}>Olá, {user.nome}</span>
            <button className={navStyles.loginButton} onClick={onLogout}>Sair</button>
          </div>
        ) : (
          <button className={navStyles.loginButton} onClick={() => navigate('/login')}>Entrar</button>
        )}
      </div>
    </nav>
  );
};

export const Home: React.FC = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('Todos');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedSizes, setSelectedSizes] = useState<{ [productId: number]: string }>({});
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Verifica se já existe uma sessão ativa (cookie válido) ao carregar a home
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

    checkUserSession();
  }, []);

  const showToast = (message: string) => {
    setToastMessage(message);
    setTimeout(() => {
      setToastMessage(null);
    }, 3000);
  };

  const products: Product[] = [
    { 
      id: 1, 
      name: 'Body Manga Longa Suedine', 
      price: 'R$ 39,90', 
      numericPrice: 39.90, 
      rating: 5, 
      category: 'Bodies', 
      image: 'https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?q=80&w=500', 
      description: 'Confeccionado em suedine 100% algodão, super macio e confortável para a pele sensível do bebê.', 
      sizes: ['RN', 'P', 'M', 'G'] 
    },
    { 
      id: 2, 
      name: 'Macacão Longo com Pezinho', 
      price: 'R$ 69,90', 
      numericPrice: 69.90, 
      rating: 5, 
      category: 'Macacões', 
      image: 'https://images.unsplash.com/photo-1519689680058-324335c77eba?q=80&w=500', 
      description: 'Macacão prático com botões de pressão frontais e pezinho fechado para manter o bebê aquecido.', 
      sizes: ['RN', 'P', 'M', 'G', '1 ano'] 
    },
    { 
      id: 3, 
      name: 'Conjunto Tapa-Fralda e Blusa', 
      price: 'R$ 54,90', 
      numericPrice: 54.90, 
      rating: 4, 
      category: 'Conjuntos', 
      image: 'https://images.unsplash.com/photo-1596870230751-ebdfce98ec42?q=80&w=500', 
      description: 'Lindo conjunto fresquinho para os dias mais quentes, com estampa delicada.', 
      sizes: ['P', 'M', 'G', '1 ano', '2 anos'] 
    },
    { 
      id: 4, 
      name: 'Vestido Estampado com Calcinha', 
      price: 'R$ 79,90', 
      numericPrice: 79.90, 
      rating: 5, 
      category: 'Vestidos', 
      image: 'https://images.unsplash.com/photo-1544717305-2782549b5136?q=80&w=500', 
      description: 'Vestido rodado encantador acompanhado de calcinha tapa-fralda combinando.', 
      sizes: ['6 meses', '1 ano', '2 anos'] 
    },
  ];

  // Função de Logout Real
  const handleLogout = async () => {
    try {
      await axios.post('http://localhost:3333/api/logout');
      setUser(null);
    } catch (error) {
      console.error('Erro ao sair:', error);
    }
  };

  const addToCartWithSpecificSize = (product: Product, size: string) => {
    if (!product) return;

    setCart((prevCart) => {
      const safeCart = Array.isArray(prevCart) ? prevCart : [];
      
      const existingIndex = safeCart.findIndex(
        item => item.product && item.product.id === product.id && item.selectedSize === size
      );

      if (existingIndex > -1) {
        const updated = [...safeCart];
        updated[existingIndex] = {
          ...updated[existingIndex],
          quantity: updated[existingIndex].quantity + 1
        };
        return updated;
      }

      const newItem: CartItem = {
        product: product,
        quantity: 1,
        selectedSize: size,
      };

      return [...safeCart, newItem];
    });
  };

  const updateQuantity = (productId: number, amount: number) => {
    setCart((prevCart) =>
      prevCart
        .map(item => {
          if (item.product && item.product.id === productId) {
            const newQuantity = item.quantity + amount;
            return { ...item, quantity: newQuantity };
          }
          return item;
        })
        .filter(item => item.quantity > 0)
    );
  };

  const removeFromCart = (productId: number) => {
    setCart((prevCart) => prevCart.filter(item => item.product && item.product.id !== productId));
  };

  const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
  const totalPrice = cart.reduce((sum, item) => sum + item.product.numericPrice * item.quantity, 0);

  const filteredProducts = selectedCategory === 'Todos' 
    ? products 
    : products.filter(p => p.category === selectedCategory);

  return (
    <div className={styles.container}>
      <Navbar 
        cartCount={totalItems} 
        onCartClick={() => setIsCartOpen(true)} 
        user={user}
        onLogout={handleLogout}
      />
      
      {/* Novo Banner Centralizado */}
      <div className={styles.bannerContainer}>
        <img 
          src="/banner.png" 
          alt="Banner Promocional" 
          className={styles.bannerImagem} 
        />
      </div>

      <div className={styles.filterBar}>
        {['Todos', 'Bodies', 'Macacões', 'Conjuntos', 'Vestidos'].map(category => (
          <button
            key={category}
            className={`${styles.filterButton} ${selectedCategory === category ? styles.activeFilter : ''}`}
            onClick={() => setSelectedCategory(category)}
          >
            {category}
          </button>
        ))}
      </div>

      <main className={styles.productsSection}>
        <h2>Produtos em Destaque</h2>
        <div className={styles.grid}>
          {filteredProducts.map(product => {
            const chosenSize = selectedSizes[product.id] || product.sizes[0];
            return (
              <div key={product.id} className={styles.productCard}>
                <img src={product.image} alt={product.name} className={styles.productImage} onClick={() => setSelectedProduct(product)} />
                <div className={styles.productInfo}>
                  <h3 onClick={() => setSelectedProduct(product)}>{product.name}</h3>
                  
                  <div className={styles.rating}>
                    {Array.from({ length: product.rating }).map((_, i) => <span key={i} className={styles.star}>★</span>)}
                    <span className={styles.ratingText}> ({product.rating}.0)</span>
                  </div>

                  <p className={styles.price}>{product.price}</p>

                  <div className={styles.sizeContainer}>
                    <span className={styles.sizeLabel}>Selecione o tamanho:</span>
                    <div className={styles.sizeList}>
                      {product.sizes && product.sizes.map((size, index) => {
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
                      const sizeSelected = selectedSizes[product.id];
                      if (!sizeSelected) {
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
          })}
        </div>
      </main>

      {/* Modal de Detalhes do Produto */}
      {selectedProduct && (
        <div className={styles.modalOverlay} onClick={() => setSelectedProduct(null)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <button className={styles.closeButton} onClick={() => setSelectedProduct(null)}>×</button>
            <img src={selectedProduct.image} alt={selectedProduct.name} className={styles.modalImage} />
            <h2>{selectedProduct.name}</h2>
            <p className={styles.modalDescription}>{selectedProduct.description}</p>
            <p className={styles.price} style={{ fontSize: '1.5rem' }}>{selectedProduct.price}</p>
            <button className={styles.actionButton} onClick={() => { 
              const size = selectedSizes[selectedProduct.id] || selectedProduct.sizes[0];
              addToCartWithSpecificSize(selectedProduct, size); 
              setSelectedProduct(null); 
            }}>
              Adicionar ao Carrinho e Continuar
            </button>

            <button className={styles.buyButton} onClick={() => { 
              const size = selectedSizes[selectedProduct.id];
              if (!size) {
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
                  <div key={item.product.id} className={styles.cartItem}>
                    <img src={item.product.image} alt={item.product.name} className={styles.cartItemImage} />
                    
                    <div className={styles.cartItemInfo}>
                      <div className={styles.cartItemDetails}>
                        <h4>{item.product.name}</h4>
                        {item.selectedSize && (
                          <span className={styles.cartItemSize}>Tamanho: {item.selectedSize}</span>
                        )}
                        <button className={styles.removeButton} onClick={() => removeFromCart(item.product.id)}>
                          Remover
                        </button>
                      </div>
                      
                      <div className={styles.cartItemRight}>
                        <span className={styles.cartItemPrice}>
                          R$ {(item.product.numericPrice * item.quantity).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
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