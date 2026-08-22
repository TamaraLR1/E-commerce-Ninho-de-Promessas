import React, { useState } from 'react';
import styles from './ProductForm.module.css';

export const ProductForm: React.FC = () => {
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
    console.log('Enviando para o banco de dados do sistema:', productData);
    alert('Produto cadastrado com sucesso no painel gerencial!');
    // Limpa o formulário após salvar
    setProductData({ name: '', price: '', rating: '5', image: '' });
  };

  return (
    <div className={styles.container}>
      <nav className={styles.navbar}>
        <div className={styles.logo}>Painel Administrativo</div>
        <div className={styles.userSection}>Olá, Administrador</div>
      </nav>
      
      <div className={styles.content}>
        <div className={styles.card}>
          <h2 className={styles.title}>Cadastrar Novo Produto</h2>
          <p className={styles.subtitle}>Insira as informações básicas da mercadoria para enviar à vitrine</p>

          <form onSubmit={handleSubmit}>
            <div className={styles.formGroup}>
              <label htmlFor="name" className={styles.label}>Nome do Produto</label>
              <input type="text" id="name" name="name" className={styles.input} value={productData.name} onChange={handleChange} placeholder="Ex: Teclado Mecânico RGB" required />
            </div>

            <div className={styles.formGroup}>
              <label htmlFor="price" className={styles.label}>Preço de Venda (R$)</label>
              <input type="text" id="price" name="price" className={styles.input} value={productData.price} onChange={handleChange} placeholder="Ex: R$ 299,90" required />
            </div>

            <div className={styles.formGroup}>
              <label htmlFor="rating" className={styles.label}>Avaliação Inicial (Estrelas)</label>
              <select id="rating" name="rating" className={styles.select} value={productData.rating} onChange={handleChange}>
                <option value="5">5 Estrelas (Excelente)</option>
                <option value="4">4 Estrelas (Ótimo)</option>
                <option value="3">3 Estrelas (Regular)</option>
                <option value="2">2 Estrelas (Ruim)</option>
                <option value="1">1 Estrela (Péssimo)</option>
              </select>
            </div>

            <div className={styles.formGroup}>
              <label htmlFor="image" className={styles.label}>URL da Imagem do Produto</label>
              <input type="text" id="image" name="image" className={styles.input} value={productData.image} onChange={handleChange} placeholder="https://images.unsplash.com/..." required />
            </div>

            <button type="submit" className={styles.saveButton}>
              Publicar na Loja Principal
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};