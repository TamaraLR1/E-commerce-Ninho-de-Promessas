import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import styles from './LoginForm.module.css';

// Configuração para garantir o envio e recebimento de cookies HTTP-only
axios.defaults.withCredentials = true;

export const LoginForm: React.FC = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMessage(null);
    
    try {
      // Faz a requisição real para o seu backend Express + Prisma
      const response = await axios.post('http://localhost:3333/api/login', {
        email,
        senha: password // Ajustado para corresponder ao campo 'senha' esperado pelo seu AuthController
      });

      if (response.status === 200) {
        // Login efetuado com sucesso de forma silenciosa (sem alertas)
        navigate('/'); // Redireciona de volta para a vitrine da loja
      }
    } catch (error: any) {
      // Exibe a mensagem de erro retornada pelo backend (ex: "E-mail ou senha inválidos.")
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

      {/* LADO DIREITO: Banner Visual & Suporte */}
      <div className={styles.rightSide}>
        <div className={styles.brandContainer}>
          <h1 className={styles.brandName}>MinhaLoja</h1>
          <p className={styles.brandTagline}>
            A melhor seleção de eletrônicos e periféricos com entrega expressa para todo o Brasil.
          </p>
        </div>

        <div className={styles.contactFooter}>
          <p className={styles.contactLabel}>Precisa de ajuda ou suporte?</p>
          <p className={styles.contactPhone}>📞 0800 123 4567</p>
        </div>
      </div>

    </div>
  );
};