import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import styles from './ProductForm.module.css';
import navStyles from '../Navbar.module.css';

// Reaproveitando o Navbar para manter a identidade visual
const Navbar = () => {
  const navigate = useNavigate();
  return (
    <nav className={navStyles.navbar}>
      <div className={navStyles.logo} onClick={() => navigate('/')}>MinhaLoja</div>
      <div className={navStyles.navLinks}>
        <span className={navStyles.link} onClick={() => navigate('/')}>Voltar para Loja</span>
      </div>
    </nav>
  );
};

// AQUI ESTÁ A CORREÇÃO: Exportação nomeada explícita para o App.tsx conseguir importar
export const ProductForm: React.FC = () => {
  const navigate = useNavigate();
  const [productData, setProductData] = useState({
    name: '',
    price: '',
    rating: '5',
    image: ''
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setProductData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    console.log('Produto Cadastrado com Sucesso:', productData);
    // Redireciona de volta para a vitrine após simular o salvamento
    navigate('/');
  };

  return (
    <div className={styles.container}>
      <Navbar />
      <div className={styles.content}>
        <div className={styles.card}>
          <h2 className={styles.title}>Cadastrar Novo Produto</h2>
          <p className={styles.subtitle}>Preencha as informações para exibir a mercadoria na vitrine</p>

          <form onSubmit={handleSubmit}>
            <div className={styles.formGroup}>
              <label htmlFor="name" className={styles.label}>Nome do Produto</label>
              <input
                type="text"
                id="name"
                name="name"
                className={styles.input}
                value={productData.name}
                onChange={handleChange}
                placeholder="Ex: Teclado Mecânico RGB"
                required
              />
            </div>

            <div className={styles.formGroup}>
              <label htmlFor="price" className={styles.label}>Preço (R$)</label>
              <input
                type="text"
                id="price"
                name="price"
                className={styles.input}
                value={productData.price}
                onChange={handleChange}
                placeholder="Ex: R$ 299,90"
                required
              />
            </div>

            <div className={styles.formGroup}>
              <label htmlFor="rating" className={styles.label}>Avaliação Inicial (Estrelas)</label>
              <select
                id="rating"
                name="rating"
                className={styles.select}
                value={productData.rating}
                onChange={handleChange}
              >
                <option value="5">5 Estrelas (Excelente)</option>
                <option value="4">4 Estrelas (Ótimo)</option>
                <option value="3">3 Estrelas (Regular)</option>
                <option value="2">2 Estrelas (Ruim)</option>
                <option value="1">1 Estrela (Péssimo)</option>
              </select>
            </div>

            <div className={styles.formGroup}>
              <label htmlFor="image" className={styles.label}>URL da Imagem do Produto</label>
              <input
                type="text"
                id="image"
                name="image"
                className={styles.input}
                value={productData.image}
                onChange={handleChange}
                placeholder="https://images.unsplash.com/..."
                required
              />
            </div>

            <div className={styles.buttonRow}>
              <button type="button" className={styles.cancelButton} onClick={() => navigate('/')}>
                Cancelar
              </button>
              <button type="submit" className={styles.saveButton}>
                Salvar Produto
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};