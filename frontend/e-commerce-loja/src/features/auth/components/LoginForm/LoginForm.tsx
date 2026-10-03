import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import styles from './LoginForm.module.css';

axios.defaults.withCredentials = true;

const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const API_URL = isLocal 
  ? 'http://localhost:3333' 
  : 'https://ninhoback.tamaralr.com.br';

export const LoginForm: React.FC = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMessage(null);
    
    try {
      const response = await axios.post(`${API_URL}/api/login`, {
        email,
        senha: password
      });

      if (response.status === 200) {
        navigate('/'); // Redireciona para a home, onde o useEffect vai puxar o /api/perfil com o cookie salvo
      }
    } catch (error: any) {
      setErrorMessage(error.response?.data?.error || 'Erro ao realizar login.');
    }
  };

  return (
    <div className={styles.container}>
      
      {/* LADO ESQUERDO: Formulário de Entrada */}
      <div className={styles.leftSide}>
        <span className={styles.backLink} onClick={() => navigate('/')}>
          ← Voltar para a loja
        </span>
        
        <h2 className={styles.title}>Acesse sua conta</h2>
        <p className={styles.subtitle}>Insira suas credenciais para gerenciar suas compras</p>

        <form onSubmit={handleSubmit}>
          <div className={styles.formGroup}>
            <label htmlFor="email" className={styles.label}>E-mail</label>
            <input
              type="email"
              id="email"
              className={styles.input}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="seu-email@exemplo.com"
              required
            />
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="password" className={styles.label}>Senha</label>
            <input
              type="password"
              id="password"
              className={styles.input}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </div>

          {errorMessage && (
            <p style={{ color: '#d9534f', fontSize: '0.9rem', marginBottom: '15px' }}>
              {errorMessage}
            </p>
          )}

          <button type="submit" className={styles.loginButton}>
            Entrar na Conta
          </button>
        </form>

        <p className={styles.registerText}>
          Não tem uma conta?{' '}
          <span className={styles.registerLink} onClick={() => navigate('/cadastro')}>
            Cadastre-se aqui
          </span>
        </p>
      </div>

      {/* LADO DIREITO: Gradiente Dourado & Logotipo Fixa */}
      <div className={styles.rightSide}>
        <div className={styles.brandLogoContainer}>
          <img 
            src="/banner.png" 
            alt="Ninho de Promessas" 
            className={styles.brandLogoImage} 
          />
          <p className={styles.brandTagline}>
            Vestindo seu bebê com amor, cuidado e propósito.
          </p>
        </div>

        <div className={styles.contactFooter}>
          <p className={styles.contactLabel}>Precisa de ajuda ou suporte?</p>
          <p className={styles.contactPhone}>📞 (48) 99179-4486</p>
        </div>
      </div>

    </div>
  );
};