import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import styles from './Navbar.module.css';

interface Category {
  id: string;
  nome: string;
  slug: string;
}

interface NavbarProps {
  user: any;
  categories: Category[];
  selectedCategory: string;
  onSelectCategory: (categoryName: string) => void;
  searchTerm: string;
  onSearchChange: (term: string) => void;
  cartItemCount: number;
  onOpenCart: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  user,
  categories,
  selectedCategory,
  onSelectCategory,
  searchTerm,
  onSearchChange,
  cartItemCount,
  onOpenCart
}) => {
  const navigate = useNavigate();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  return (
    <header>
      {/* Linha Superior: Pesquisa, Logo e Ações (Login / Carrinho) */}
      <div className={styles.headerTop}>
        {/* Barra de Pesquisa */}
        <div className={styles.searchContainer}>
          <span className={styles.searchIcon}>🔍</span>
          <input
            type="text"
            placeholder="Pesquisar produtos..."
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            className={styles.searchInput}
          />
        </div>

        {/* Logo Centralizada */}
        <div className={styles.logo} onClick={() => navigate('/')}>
          Ninho de Promessas
        </div>

        {/* Ações de Conta e Carrinho */}
        <div className={styles.userActions}>
          {user ? (
            <button className={styles.iconButton} onClick={() => navigate('/perfil')}>
              👤 Olá, {user.nome.split(' ')[0]}
            </button>
          ) : (
            <button className={styles.loginButton} onClick={() => navigate('/login')}>
              Entrar
            </button>
          )}

          <button className={styles.iconButton} onClick={onOpenCart}>
            🛒 ({cartItemCount})
          </button>
        </div>
      </div>

      {/* Linha Inferior: Botão de Categorias Dropdown e Atalhos */}
      <div className={styles.headerBottom}>
        <div className={styles.categoryDropdownWrapper}>
          <button 
            className={styles.categoryDropdownButton}
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
          >
            📂 Categorias ▼
          </button>

          {isDropdownOpen && (
            <div className={styles.dropdownContent}>
              <button 
                className={styles.dropdownItem} 
                onClick={() => { onSelectCategory('Todos'); setIsDropdownOpen(false); }}
              >
                Todos
              </button>
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  className={styles.dropdownItem}
                  onClick={() => { onSelectCategory(cat.nome); setIsDropdownOpen(false); }}
                >
                  {cat.nome}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Atalhos rápidos opcionais na barra */}
        <div style={{ display: 'flex', gap: '10px', overflowX: 'auto' }}>
          <span style={{ fontSize: '0.85rem', color: '#666', alignSelf: 'center' }}>
            Categoria ativa: <strong>{selectedCategory}</strong>
          </span>
        </div>
      </div>
    </header>
  );
};