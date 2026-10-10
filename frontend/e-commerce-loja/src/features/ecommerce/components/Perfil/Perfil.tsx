import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import styles from './Perfil.module.css';

axios.defaults.withCredentials = true;

const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const API_URL = isLocal 
  ? 'http://localhost:3333' 
  : 'https://ninhoback.tamaralr.com.br';

interface UserData {
  nome: string;
  sobrenome: string;
  cpf: string;
  email: string;
  telefone: string;
  dataNascimento?: string;
  sexo?: string;
  receberNovidades: boolean;
}

export const Perfil: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const [formData, setFormData] = useState<UserData>({
    nome: '',
    sobrenome: '',
    cpf: '',
    email: '',
    telefone: '',
    dataNascimento: '',
    sexo: '',
    receberNovidades: false,
  });

  useEffect(() => {
    const fetchPerfil = async () => {
      try {
        const response = await axios.get<any>(`${API_URL}/api/perfil`);
        if (response.data && response.data.user) {
          const u = response.data.user;
          setFormData({
            nome: u.nome || '',
            sobrenome: u.sobrenome || '',
            cpf: u.cpf || '',
            email: u.email || '',
            telefone: u.telefone || '',
            dataNascimento: u.dataNascimento ? u.dataNascimento.substring(0, 10) : '',
            sexo: u.sexo || '',
            receberNovidades: !!u.receberNovidades,
          });
        }
      } catch (error) {
        navigate('/login');
      } finally {
        setLoading(false);
      }
    };

    fetchPerfil();
  }, [navigate]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    if (type === 'checkbox') {
      const { checked } = e.target as HTMLInputElement;
      setFormData(prev => ({ ...prev, [name]: checked }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);

    try {
      await axios.put(`${API_URL}/api/perfil`, formData);
      setMessage({ text: 'Dados atualizados com sucesso!', type: 'success' });
    } catch (error: any) {
      setMessage({ 
        text: error.response?.data?.error || 'Erro ao atualizar os dados. Tente novamente.', 
        type: 'error' 
      });
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = async () => {
    try {
      await axios.post(`${API_URL}/api/logout`);
    } catch (err) {
      console.error('Erro ao terminar sessão', err);
    } finally {
      navigate('/');
    }
  };

  if (loading) {
    return (
      <div className={styles.container} style={{ justifyContent: 'center', alignItems: 'center' }}>
        <p>A carregar informações do perfil...</p>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.content}>
        <span className={styles.backLink} onClick={() => navigate('/')}>
          ← Voltar para a loja
        </span>

        <div className={styles.card}>
          <h1 className={styles.title}>Meu Perfil</h1>
          <p className={styles.subtitle}>Visualize e edite as informações da sua conta no Ninho de Promessas</p>

          {message && (
            <div className={`${styles.message} ${message.type === 'success' ? styles.success : styles.error}`}>
              {message.text}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className={styles.formGrid}>
              
              <div className={styles.formGroup}>
                <label className={styles.label}>Nome</label>
                <input
                  type="text"
                  name="nome"
                  value={formData.nome}
                  onChange={handleChange}
                  className={styles.input}
                  required
                />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label}>Sobrenome</label>
                <input
                  type="text"
                  name="sobrenome"
                  value={formData.sobrenome}
                  onChange={handleChange}
                  className={styles.input}
                  required
                />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label}>E-mail (Não alterável)</label>
                <input
                  type="email"
                  value={formData.email}
                  disabled
                  className={styles.input}
                />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label}>CPF (Não alterável)</label>
                <input
                  type="text"
                  value={formData.cpf}
                  disabled
                  className={styles.input}
                />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label}>Telefone / WhatsApp</label>
                <input
                  type="text"
                  name="telefone"
                  value={formData.telefone}
                  onChange={handleChange}
                  className={styles.input}
                  required
                />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label}>Data de Nascimento</label>
                <input
                  type="date"
                  name="dataNascimento"
                  value={formData.dataNascimento}
                  onChange={handleChange}
                  className={styles.input}
                />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label}>Sexo</label>
                <select
                  name="sexo"
                  value={formData.sexo}
                  onChange={handleChange}
                  className={styles.select}
                >
                  <option value="">Selecione...</option>
                  <option value="Masculino">Masculino</option>
                  <option value="Feminino">Feminino</option>
                </select>
              </div>

              <div className={`${styles.formGroup} ${styles.fullWidth}`}>
                <label className={styles.checkboxGroup}>
                  <input
                    type="checkbox"
                    name="receberNovidades"
                    checked={formData.receberNovidades}
                    onChange={handleChange}
                    className={styles.checkbox}
                  />
                  <span>Desejo receber novidades, ofertas e promoções por e-mail.</span>
                </label>
              </div>

            </div>
              <div className={styles.actionsFooter}>
                <button 
                  type="submit" 
                  className={styles.saveButton}
                  disabled={saving}
                >
                  {saving ? 'A salvar...' : 'Salvar Alterações'}
                </button>

                <button 
                  type="button" 
                  className={styles.logoutButton}
                  onClick={handleLogout}
                >
                  Sair da Conta
                </button>
              </div>
          </form>
        </div>
      </div>
    </div>
  );
};