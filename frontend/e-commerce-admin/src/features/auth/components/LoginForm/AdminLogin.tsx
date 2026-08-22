import React, { useState } from 'react';
import styles from './AdminLogin.module.css';

interface AdminLoginProps {
  onLoginSuccess: () => void;
}

export const AdminLogin: React.FC<AdminLoginProps> = ({ onLoginSuccess }) => {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await fetch('http://localhost:3333/api/admin/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        // Importante: Permite que o navegador salve e envie cookies nas requisições cross-origin (se necessário)
        credentials: 'include', 
        body: JSON.stringify({ email, senha }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Erro ao realizar login.');
      }

      // Como o cookie já foi salvo automaticamente pelo navegador, 
      // apenas avisamos o componente pai que o login deu certo.
      onLoginSuccess();

    } catch (err: any) {
      setError(err.message || 'Credenciais inválidas ou erro de conexão.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.loginContainer}>
      <div className={styles.loginCard}>
        <div className={styles.loginHeader}>
          <h2>Painel Administrativo</h2>
          <p>Acesso restrito a gestores</p>
        </div>

        {error && <div className={styles.errorMessage}>{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className={styles.formGroup}>
            <label>E-mail de Administrador</label>
            <input 
              type="email" 
              value={email} 
              onChange={e => setEmail(e.target.value)} 
              placeholder="admin1@sualoja.com" 
              required 
            />
          </div>

          <div className={styles.formGroup}>
            <label>Senha</label>
            <input 
              type="password" 
              value={senha} 
              onChange={e => setSenha(e.target.value)} 
              placeholder="••••••••" 
              required 
            />
          </div>

          <button type="submit" className={styles.btnLogin} disabled={loading}>
            {loading ? 'Entrando...' : 'Entrar no Painel'}
          </button>
        </form>
      </div>
    </div>
  );
};