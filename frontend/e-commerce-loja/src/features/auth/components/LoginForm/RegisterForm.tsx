import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import styles from './RegisterForm.module.css';

axios.defaults.withCredentials = true;

export const RegisterForm: React.FC = () => {
  const navigate = useNavigate();
  
  const [formData, setFormData] = useState({
    nome: '',
    sobrenome: '',
    cpf: '',
    email: '',
    telefone: '',
    senha: '',
    confirmarSenha: '',
    dataNascimento: '',
    sexo: '',
    receberNovidades: false,
  });

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    
    if (type === 'checkbox') {
      const { checked } = e.target as HTMLInputElement;
      setFormData(prev => ({ ...prev, [name]: checked }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMessage(null);

    if (formData.senha.length < 8) {
      setErrorMessage('A senha deve ter no mínimo 8 dígitos.');
      return;
    }

    if (formData.senha !== formData.confirmarSenha) {
      setErrorMessage('As senhas não coincidem!');
      return;
    }

    try {
      setLoading(true);
      await axios.post('http://localhost:3333/api/register', {
        ...formData,
      });
      
      navigate('/login');
    } catch (error: any) {
      const errorData = error.response?.data;
      
      if (errorData && typeof errorData === 'object' && errorData.error) {
        setErrorMessage(errorData.error);
      } else if (typeof errorData === 'string') {
        setErrorMessage(errorData);
      } else {
        setErrorMessage('Erro ao realizar cadastro. Tente novamente.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      
      {/* LADO ESQUERDO: Formulário Espelhado do Login */}
      <div className={styles.leftSide}>
        <span className={styles.backLink} onClick={() => navigate('/')}>
          ← Voltar para a loja
        </span>
        
        <h2 className={styles.title}>Crie sua conta</h2>
        <p className={styles.subtitle}>Insira seus dados para começar a comprar</p>

        {errorMessage && (
          <div style={{ color: '#d9534f', marginBottom: '1rem', fontSize: '0.9rem', fontWeight: 'bold' }}>
            {errorMessage}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className={styles.formGroup}>
            <label className={styles.label}>Nome *</label>
            <input
              type="text"
              name="nome"
              className={styles.input}
              value={formData.nome}
              onChange={handleChange}
              placeholder="Ex: Maria"
              required
            />
          </div>

          <div className={styles.formGroup}>
            <label className={styles.label}>Sobrenome *</label>
            <input
              type="text"
              name="sobrenome"
              className={styles.input}
              value={formData.sobrenome}
              onChange={handleChange}
              placeholder="Ex: Silva"
              required
            />
          </div>

          <div className={styles.formGroup}>
            <label className={styles.label}>CPF *</label>
            <input
              type="text"
              name="cpf"
              className={styles.input}
              value={formData.cpf}
              onChange={handleChange}
              placeholder="000.000.000-00"
              required
            />
          </div>

          <div className={styles.formGroup}>
            <label className={styles.label}>E-mail *</label>
            <input
              type="email"
              name="email"
              className={styles.input}
              value={formData.email}
              onChange={handleChange}
              placeholder="seu-email@exemplo.com"
              required
            />
          </div>

          <div className={styles.formGroup}>
            <label className={styles.label}>Telefone *</label>
            <input
              type="text"
              name="telefone"
              className={styles.input}
              value={formData.telefone}
              onChange={handleChange}
              placeholder="(00) 00000-0000"
              required
            />
          </div>

          <div className={styles.formGroup}>
            <label className={styles.label}>Data de Nascimento (Opcional)</label>
            <input
              type="date"
              name="dataNascimento"
              className={styles.input}
              value={formData.dataNascimento}
              onChange={handleChange}
            />
          </div>

          <div className={styles.formGroup}>
            <label className={styles.label}>Sexo (Opcional)</label>
            <select
              name="sexo"
              className={styles.input}
              value={formData.sexo}
              onChange={handleChange}
            >
              <option value="">Selecione</option>
              <option value="Masculino">Masculino</option>
              <option value="Feminino">Feminino</option>
            </select>
          </div>

          <div className={styles.formGroup}>
            <label className={styles.label}>Senha *</label>
            <input
              type="password"
              name="senha"
              className={styles.input}
              value={formData.senha}
              onChange={handleChange}
              placeholder="Mínimo 8 dígitos"
              minLength={8}
              required
            />
          </div>

          <div className={styles.formGroup}>
            <label className={styles.label}>Confirmar Senha *</label>
            <input
              type="password"
              name="confirmarSenha"
              className={styles.input}
              value={formData.confirmarSenha}
              onChange={handleChange}
              placeholder="Mínimo 8 dígitos"
              required
            />
            {formData.confirmarSenha && formData.senha !== formData.confirmarSenha && (
              <span style={{ color: '#d9534f', fontSize: '0.8rem', marginTop: '4px', display: 'block' }}>
                As senhas não coincidem!
              </span>
            )}
          </div>

          <div className={styles.checkboxGroup} style={{ marginBottom: '0.8rem' }}>
            <input
              type="checkbox"
              id="novidades"
              name="receberNovidades"
              className={styles.checkbox}
              checked={formData.receberNovidades}
              onChange={handleChange}
            />
            <label htmlFor="novidades" className={styles.checkboxLabel}>
              Deseja receber novidades e ofertas por e-mail?
            </label>
          </div>

          <button type="submit" className={styles.registerButton} disabled={loading}>
            {loading ? 'Cadastrando...' : 'Cadastrar Conta'}
          </button>
        </form>

        <p className={styles.loginText}>
          Já tem uma conta?{' '}
          <span className={styles.loginLink} onClick={() => navigate('/login')}>
            Faça login aqui
          </span>
        </p>
      </div>

      {/* LADO DIREITO: Idêntico ao Login */}
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