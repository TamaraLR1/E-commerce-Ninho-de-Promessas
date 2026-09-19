import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { io } from 'socket.io-client';
import styles from './Home.module.css';
import { CheckoutModal } from '../CheckoutModal/CheckoutModal';

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
  genero?: string; 
  categoria: Category;
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
      slug: string;
      ordem?: number;
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
  
  // Controle do Modal/Gaveta de Filtros Avançados
  const [isFilterDrawerOpen, setIsFilterDrawerOpen] = useState(false);

  // Estados dos Filtros
  const [selectedCategory, setSelectedCategory] = useState<string>('Todos');
  const [searchTerm, setSearchTerm] = useState<string>('');
  
  // Estado do Filtro de Ordenação
  const [sortBy, setSortBy] = useState<string>('novidades');
  
  // Filtros solicitados: Preço Mínimo/Máximo (0 a 500), Tamanho, Gênero e Cor
  const [precoMin, setPrecoMin] = useState<number>(0);
  const [precoMax, setPrecoMax] = useState<number>(500);
  const [filtroTamanho, setFiltroTamanho] = useState<string>('Todos');
  const [filtroGenero, setFiltroGenero] = useState<string>('Todos');
  const [filtroCor, setFiltroCor] = useState<string>('Todos');

  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedSizes, setSelectedSizes] = useState<{ [productId: string]: string }>({});
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  
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

  // Coleta dados dinâmicos do banco para os filtros
  const dbSizesList = Array.from(new Set(products.flatMap(p => p.estoques?.map(e => e.tamanho?.nome).filter(Boolean) || []))) as string[];
  const sortedDbSizes = sortSizes(dbSizesList);

  const dbColorsMap = new Map();
  products.forEach(p => {
    p.estoques?.forEach((e: any) => {
      if (e.cor && e.cor.id) {
        dbColorsMap.set(e.cor.id, e.cor);
      }
    });
  });
  const dbColorsList = Array.from(dbColorsMap.values());

  // Lógica de Filtragem Geral
  const filteredProducts = products.filter(p => {
    if (p.isVisible !== true) return false;
    if (p.ativoGeral === false) return false;

    // Busca por texto
    const matchesSearch = p.nome.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          (p.descricao && p.descricao.toLowerCase().includes(searchTerm.toLowerCase()));
    if (!matchesSearch) return false;

    // Categoria via menu lateral
    if (selectedCategory !== 'Todos') {
      const matchCat = p.categoria && p.categoria.nome.toLowerCase().trim() === selectedCategory.toLowerCase().trim();
      if (!matchCat) return false;
    }

    // 1. Filtro de Preço (Mínimo e Máximo)
    const precoEfetivo = p.temOferta && p.precoPromocional && Number(p.precoPromocional) > 0 
      ? Number(p.precoPromocional) 
      : (parseFloat(p.preco) || 0);
    if (precoEfetivo < precoMin || precoEfetivo > precoMax) return false;

    // 2. Filtro de Tamanho
    if (filtroTamanho !== 'Todos') {
      const temTamanho = p.estoques?.some(e => e.tamanho?.nome?.toLowerCase() === filtroTamanho.toLowerCase());
      if (!temTamanho) return false;
    }

    // 3. Filtro de Gênero
    if (filtroGenero !== 'Todos') {
      const generoProd = (p.genero || '').toLowerCase();
      const catProd = (p.categoria?.nome || '').toLowerCase();
      const descProd = (p.descricao || '').toLowerCase();
      const termo = filtroGenero.toLowerCase();
      
      const matchGenero = generoProd.includes(termo) || catProd.includes(termo) || descProd.includes(termo);
      if (!matchGenero) return false;
    }

    // 4. Filtro de Cor
    if (filtroCor !== 'Todos') {
      const temCor = p.estoques?.some(e => e.cor?.id === filtroCor || e.cor?.nome?.toLowerCase() === filtroCor.toLowerCase());
      if (!temCor) return false;
    }

    return true;
  });

  // Lógica de Ordenação dos Produtos Filtrados
  const sortedAndFilteredProducts = [...filteredProducts].sort((a, b) => {
    if (sortBy === 'novidades') {
      return b.id.localeCompare(a.id);
    }
    
    const precoA = a.temOferta && a.precoPromocional && Number(a.precoPromocional) > 0 ? Number(a.precoPromocional) : (parseFloat(a.preco) || 0);
    const precoB = b.temOferta && b.precoPromocional && Number(b.precoPromocional) > 0 ? Number(b.precoPromocional) : (parseFloat(b.preco) || 0);

    if (sortBy === 'preco-asc') {
      return precoA - precoB;
    }
    if (sortBy === 'preco-desc') {
      return precoB - precoA;
    }
    if (sortBy === 'nome-asc') {
      return a.nome.localeCompare(b.nome);
    }
    if (sortBy === 'nome-desc') {
      return b.nome.localeCompare(a.nome);
    }
    return 0;
  });

  return (
    <div className={styles.container}>
      {/* Banner da Loja */}
      <div className={styles.bannerContainer}>
        <div style={{ position: 'absolute', top: '50%', left: '20px', transform: 'translateY(-50%)', zIndex: 10, display: 'flex', gap: '8px' }}>
          <button 
            type="button"
            className={`${styles.desktopCartButton} ${styles.desktopTopButton}`}
            style={{ 
              background: 'rgba(255, 255, 255, 0.95)', 
              border: '1px solid #cbd5e1', 
              color: '#C29E7A', 
              borderRadius: '6px', 
              fontWeight: 600, 
              cursor: 'pointer', 
              boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
            onClick={() => setIsCategoryDrawerOpen(true)}
          >
            ☰ Menu
          </button>
        </div>

        <img 
          src="/banner.png" 
          alt="Ninho de Promessas" 
          className={styles.bannerLogo}
        />

        <div style={{ position: 'absolute', top: '50%', right: '20px', transform: 'translateY(-50%)', display: 'flex', alignItems: 'center', gap: '10px', zIndex: 10 }}>
          <button 
            type="button"
            className={`${styles.desktopCartButton} ${styles.desktopCartTopButton}`}
            style={{ 
              background: 'rgba(255, 255, 255, 0.95)', 
              color: '#C29E7A', 
              border: '1px solid #cbd5e1', 
              fontWeight: 600, 
              cursor: 'pointer', 
              boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
            }}
            onClick={() => setIsCartOpen(true)}
          >
            🛒 ({totalItems})
          </button>

          {user ? (
            <button 
              type="button"
              className={`${styles.desktopCartButton} ${styles.desktopTopButton}`}
              style={{ 
                background: 'rgba(255, 255, 255, 0.95)', 
                border: '1px solid #cbd5e1', 
                cursor: 'pointer', 
                fontWeight: 600, 
                color: '#4a5568', 
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
                backgroundColor: '#d6bfa8', 
                border: '1px solid #cbd5e1', 
                width: '38px',
                height: '38px',
                borderRadius: '50%', 
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer', 
                boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
              }}
              onClick={() => navigate('/login')}
              title="Entrar na sua conta"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#171718" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                <circle cx="12" cy="7" r="4"></circle>
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Área de Pesquisa e Indicador de Filtros Ativos */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.6rem', padding: '1.2rem 5%', backgroundColor: '#fcfcfc', borderBottom: '1px solid #e2e8f0' }}>
        <div style={{ display: 'flex', alignItems: 'center', backgroundColor: '#ffffff', border: '1px solid #ced4da', borderRadius: '20px', padding: '0.5rem 1.2rem', width: '100%', maxWidth: '450px', boxShadow: '0 2px 6px rgba(0,0,0,0.03)' }}>
          <span style={{ marginRight: '8px', color: '#D7B796' }}>🔍</span>
          <input
            type="text"
            placeholder="O que você está procurando ?"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ border: 'none', background: 'transparent', outline: 'none', width: '100%', fontSize: '0.95rem', color: '#333' }}
          />
        </div>

        {(filtroTamanho !== 'Todos' || filtroGenero !== 'Todos' || filtroCor !== 'Todos' || precoMin > 0 || precoMax < 500) && (
          <div style={{ fontSize: '0.85rem', color: '#666', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <span>Filtros ativos aplicados.</span>
            <button 
              type="button" 
              onClick={() => {
                setPrecoMin(0);
                setPrecoMax(500);
                setFiltroTamanho('Todos');
                setFiltroGenero('Todos');
                setFiltroCor('Todos');
              }}
              style={{ background: 'none', border: 'none', color: '#D7B796', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 'bold', textDecoration: 'underline' }}
            >
              Limpar Todos os Filtros
            </button>
          </div>
        )}
      </div>

      {/* Gaveta / Modal de Filtros Avançados */}
      {isFilterDrawerOpen && (
        <div className={styles.filterDrawerOverlay} onClick={() => setIsFilterDrawerOpen(false)}>
          <div className={styles.filterDrawerContent} onClick={(e) => e.stopPropagation()}>
            <div className={styles.filterDrawerHeader}>
              <h3>Filtros de Busca</h3>
              <button type="button" onClick={() => setIsFilterDrawerOpen(false)} style={{ background: 'none', border: 'none', fontSize: '1.3rem', cursor: 'pointer' }}>×</button>
            </div>

            {/* 1. FILTRO DE PREÇO */}
            <div className={styles.filterGroup}>
              <label className={styles.filterGroupLabel}>
                Faixa de Preço: <strong>R$ {precoMin.toFixed(2)}</strong> até <strong>R$ {precoMax.toFixed(2)}</strong>
              </label>
              
              <div className={styles.dualSliderContainer}>
                <div className={styles.dualSliderTrack}></div>
                
                <div 
                  className={styles.dualSliderRange} 
                  style={{ 
                    left: `${(precoMin / 500) * 100}%`, 
                    right: `${100 - (precoMax / 500) * 100}%` 
                  }}
                ></div>
                
                <input 
                  type="range" 
                  min="0" 
                  max="500" 
                  step="10"
                  value={precoMin} 
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    if (val <= precoMax - 10) setPrecoMin(val);
                  }}
                  className={styles.dualSliderInput}
                  style={{ zIndex: precoMin > 400 ? 3 : 2 }}
                />

                <input 
                  type="range" 
                  min="0" 
                  max="500" 
                  step="10"
                  value={precoMax} 
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    if (val >= precoMin + 10) setPrecoMax(val);
                  }}
                  className={styles.dualSliderInput}
                  style={{ zIndex: 2 }}
                />
              </div>
            </div>

            {/* 2. FILTRO DE TAMANHO */}
            <div className={styles.filterGroup}>
              <label className={styles.filterGroupLabel}>Tamanho</label>
              <div className={styles.filterSizeGrid}>
                <button 
                  type="button" 
                  className={`${styles.filterChip} ${filtroTamanho === 'Todos' ? styles.filterChipActive : ''}`}
                  onClick={() => setFiltroTamanho('Todos')}
                >
                  Todos
                </button>
                {sortedDbSizes.map(tamanho => (
                  <button 
                    key={tamanho}
                    type="button" 
                    className={`${styles.filterChip} ${filtroTamanho === tamanho ? styles.filterChipActive : ''}`}
                    onClick={() => setFiltroTamanho(tamanho)}
                  >
                    {tamanho}
                  </button>
                ))}
              </div>
            </div>

            {/* 3. FILTRO DE GÊNERO */}
            <div className={styles.filterGroup}>
              <label className={styles.filterGroupLabel}>Gênero</label>
              <div className={styles.filterSizeGrid}>
                {['Todos', 'Masculino', 'Feminino', 'Unissex'].map(genero => (
                  <button 
                    key={genero}
                    type="button" 
                    className={`${styles.filterChip} ${filtroGenero === genero ? styles.filterChipActive : ''}`}
                    onClick={() => setFiltroGenero(genero)}
                  >
                    {genero}
                  </button>
                ))}
              </div>
            </div>

            {/* 4. FILTRO DE COR */}
            <div className={styles.filterGroup}>
              <label className={styles.filterGroupLabel}>Cor</label>
              <div className={styles.filterColorList}>
                <button 
                  type="button" 
                  className={`${styles.filterChip} ${filtroCor === 'Todos' ? styles.filterChipActive : ''}`}
                  onClick={() => setFiltroCor('Todos')}
                >
                  Todas
                </button>
                {dbColorsList.map((cor: any) => {
                  const isSelected = filtroCor === cor.id;
                  return (
                    <button 
                      key={cor.id}
                      type="button" 
                      className={`${styles.filterColorItem} ${isSelected ? styles.filterChipActive : ''}`}
                      onClick={() => setFiltroCor(cor.id)}
                    >
                      <span className={styles.filterColorDot} style={{ backgroundColor: cor.hex || '#000' }}></span>
                      {cor.nome}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className={styles.filterActionsFooter}>
              <button 
                type="button" 
                className={styles.actionButton}
                onClick={() => setIsFilterDrawerOpen(false)}
              >
                Ver Produtos ({sortedAndFilteredProducts.length})
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Vitrine de Produtos */}
      <main className={styles.productsSection}>
        {/* Botão de Filtros e Seletor de Ordenação lado a lado (à esquerda) */}
        <div style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <button 
            type="button"
            style={{ 
              background: 'rgba(255, 255, 255, 0.95)', 
              border: '1px solid #cbd5e1', 
              color: '#C29E7A', 
              borderRadius: '6px', 
              fontWeight: 600, 
              cursor: 'pointer', 
              padding: '0.5rem 1.2rem',
              boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
            onClick={() => setIsFilterDrawerOpen(true)}
          >
            Filtros
          </button>

          {/* Seletor de Ordenação ao lado direito do botão de Filtros */}
          <select 
            value={sortBy} 
            onChange={(e) => setSortBy(e.target.value)}
            className={styles.sortSelect}
          >
            <option value="novidades">✨ Novidades</option>
            <option value="preco-asc">💲 Menor preço</option>
            <option value="preco-desc">💲 Maior preço</option>
            <option value="nome-asc">🔤 Nome A-Z</option>
            <option value="nome-desc">🔤 Nome Z-A</option>
          </select>
        </div>

        <h2>Produtos em Destaque</h2>
        <div className={styles.grid}>
          {sortedAndFilteredProducts.length === 0 ? (
            <p style={{ color: '#666', gridColumn: '1 / -1', textAlign: 'center', padding: '2rem 0' }}>
              Nenhum produto encontrado com os filtros selecionados.
            </p>
          ) : (
            sortedAndFilteredProducts.map(product => {
              const coresCardMap = new Map();
              product.estoques?.forEach((item: any) => {
                if (item.cor) {
                  coresCardMap.set(item.cor.id, item.cor);
                }
              });
              const coresCardList = Array.from(coresCardMap.values()) as any[];
              const currentCardColor = selectedSizes[`color-${product.id}`] || coresCardList[0]?.id;

              const imagensDaCorSelecionada = product.imagens?.filter((img: any) => {
                const imgCorId = img.corId || img.cor?.id;
                return !currentCardColor || imgCorId === currentCardColor;
              }) || [];

              const listaImagensOrdenadas = [...imagensDaCorSelecionada].sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));
              const listaImagensCard = listaImagensOrdenadas.length > 0 
                ? listaImagensOrdenadas 
                : [...(product.imagens || [])].sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));
              
              const cardImgIndex = cardImageIndexes[product.id] || 0;
              const imagemAtualCardUrl = listaImagensCard[cardImgIndex]?.url || listaImagensCard[0]?.url || '';
              const imageUrl = getImageUrl(imagemAtualCardUrl);

              const tamanhosDoCard = product.estoques?.filter((item: any) => {
                return !currentCardColor || item.cor?.id === currentCardColor;
              }) || [];
              
              const rawAvailableSizes = tamanhosDoCard.length > 0 
                ? Array.from(new Set(tamanhosDoCard.map((e: any) => e.tamanho?.nome).filter(Boolean)))
                : (product.estoques && product.estoques.length > 0 
                    ? Array.from(new Set(product.estoques.map((e: any) => e.tamanho?.nome).filter(Boolean)))
                    : ['U']);
              
              const availableSizes = sortSizes(rawAvailableSizes as string[]);

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
                                className={`${styles.cardColorButton} ${isSelected ? styles.cardColorButtonSelected : styles.cardColorButtonUnselected}`}
                                style={{
                                  backgroundColor: c.hex || '#000'
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

                  const listaImagensOrdenadasModal = [...imagensModalDaCor].sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));
                  const listaImagensModal = listaImagensOrdenadasModal.length > 0 
                    ? listaImagensOrdenadasModal 
                    : [...(selectedProduct.imagens || [])].sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));

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

                      const rawAvailableSizes = Array.from(new Set(tamanhosDaCor.map((e: any) => e.tamanho?.nome).filter(Boolean)));
                      const availableSizes = sortSizes(rawAvailableSizes as string[]);

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
                            className={isSelected ? styles.modalSizeButtonSelected : styles.modalSizeButtonUnselected}
                            style={{ opacity: estoqueDisp === 0 ? 0.4 : 1, cursor: estoqueDisp === 0 ? 'not-allowed' : 'pointer' }}
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
                      const rawAvailableSizes = selectedProduct.estoques && selectedProduct.estoques.length > 0 
                        ? Array.from(new Set(selectedProduct.estoques.map((e: any) => e.tamanho?.nome).filter(Boolean)))
                        : ['U'];
                      const availableSizes = sortSizes(rawAvailableSizes as string[]);
                      
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
                      const rawAvailableSizes = selectedProduct.estoques && selectedProduct.estoques.length > 0 
                        ? Array.from(new Set(selectedProduct.estoques.map((e: any) => e.tamanho?.nome).filter(Boolean)))
                        : ['U'];
                      const availableSizes = sortSizes(rawAvailableSizes as string[]);

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