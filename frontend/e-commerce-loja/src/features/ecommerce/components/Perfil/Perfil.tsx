import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import styles from './Perfil.module.css';

axios.defaults.withCredentials = true;

const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const API_URL = isLocal
  ? 'http://localhost:3333'
  : 'https://ninhoback.tamaralr.com.br';

type IndicadorIE = 'CONTRIBUINTE' | 'ISENTO' | 'NAO_CONTRIBUINTE';

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

interface EmpresaFormData {
  cnpj: string;
  razaoSocial: string;
  nomeFantasia: string;
  indicadorIE: IndicadorIE;
  inscricaoEstadual: string;
  cep: string;
  rua: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  estado: string;
}

const MESES = [
  { value: '01', label: 'Janeiro' },
  { value: '02', label: 'Fevereiro' },
  { value: '03', label: 'Março' },
  { value: '04', label: 'Abril' },
  { value: '05', label: 'Maio' },
  { value: '06', label: 'Junho' },
  { value: '07', label: 'Julho' },
  { value: '08', label: 'Agosto' },
  { value: '09', label: 'Setembro' },
  { value: '10', label: 'Outubro' },
  { value: '11', label: 'Novembro' },
  { value: '12', label: 'Dezembro' },
];

const UFS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO',
  'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI',
  'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
];

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

  const [birthParts, setBirthParts] = useState({
    dia: '',
    mes: '',
    ano: '',
  });

  // Estados da Empresa (PJ) + Endereço Fiscal
  const [possuiEmpresa, setPossuiEmpresa] = useState(false);
  const [exibirFormEmpresa, setExibirFormEmpresa] = useState(false);
  const [savingEmpresa, setSavingEmpresa] = useState(false);
  const [loadingCepEmpresa, setLoadingCepEmpresa] = useState(false);
  const [empresaMessage, setEmpresaMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const [empresaData, setEmpresaData] = useState<EmpresaFormData>({
    cnpj: '',
    razaoSocial: '',
    nomeFantasia: '',
    indicadorIE: 'NAO_CONTRIBUINTE',
    inscricaoEstadual: '',
    cep: '',
    rua: '',
    numero: '',
    complemento: '',
    bairro: '',
    cidade: '',
    estado: '',
  });

  const anoAtual = new Date().getFullYear();
  const anos = Array.from({ length: 110 }, (_, i) => String(anoAtual - i));

  const getDaysInMonth = (anoStr: string, mesStr: string) => {
    if (!mesStr) return 31;
    const anoNum = anoStr ? Number(anoStr) : 2000;
    return new Date(anoNum, Number(mesStr), 0).getDate();
  };

  useEffect(() => {
    const fetchPerfil = async () => {
      try {
        const response = await axios.get<any>(`${API_URL}/api/perfil`);
        if (response.data && response.data.user) {
          const u = response.data.user;
          const dataNascStr = u.dataNascimento ? String(u.dataNascimento).substring(0, 10) : '';

          setFormData({
            nome: u.nome || '',
            sobrenome: u.sobrenome || '',
            cpf: u.cpf || '',
            email: u.email || '',
            telefone: u.telefone || '',
            dataNascimento: dataNascStr,
            sexo: u.sexo || '',
            receberNovidades: !!u.receberNovidades,
          });

          if (dataNascStr && dataNascStr.includes('-')) {
            const [ano, mes, dia] = dataNascStr.split('-');
            setBirthParts({
              ano: ano || '',
              mes: mes || '',
              dia: dia || '',
            });
          }

          if (u.empresa) {
            setPossuiEmpresa(true);
            setExibirFormEmpresa(true);
            const ef = u.empresa.enderecoFiscal || {};
            setEmpresaData({
              cnpj: u.empresa.cnpj || '',
              razaoSocial: u.empresa.razaoSocial || '',
              nomeFantasia: u.empresa.nomeFantasia || '',
              indicadorIE: u.empresa.indicadorIE || 'NAO_CONTRIBUINTE',
              inscricaoEstadual: u.empresa.inscricaoEstadual || '',
              cep: ef.cep || '',
              rua: ef.rua || '',
              numero: ef.numero || '',
              complemento: ef.complemento || '',
              bairro: ef.bairro || '',
              cidade: ef.cidade || '',
              estado: ef.estado || '',
            });
          }
        }
      } catch (error) {
        navigate('/login');
      } finally {
        setLoading(false);
      }
    };

    fetchPerfil();
  }, [navigate]);

  const handleBirthChange = (part: 'dia' | 'mes' | 'ano', value: string) => {
    const nextParts = { ...birthParts, [part]: value };
    const maxDays = getDaysInMonth(nextParts.ano, nextParts.mes);

    if (nextParts.dia && Number(nextParts.dia) > maxDays) {
      nextParts.dia = '';
    }

    setBirthParts(nextParts);

    if (nextParts.dia && nextParts.mes && nextParts.ano) {
      setFormData(prev => ({
        ...prev,
        dataNascimento: `${nextParts.ano}-${nextParts.mes}-${nextParts.dia}`,
      }));
    } else {
      setFormData(prev => ({ ...prev, dataNascimento: '' }));
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    if (type === 'checkbox') {
      const { checked } = e.target as HTMLInputElement;
      setFormData(prev => ({ ...prev, [name]: checked }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleEmpresaChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;

    if (name === 'indicadorIE') {
      const indicador = value as IndicadorIE;
      setEmpresaData(prev => ({
        ...prev,
        indicadorIE: indicador,
        inscricaoEstadual: indicador === 'CONTRIBUINTE' ? prev.inscricaoEstadual : '',
      }));
      return;
    }

    if (name === 'estado') {
      setEmpresaData(prev => ({ ...prev, estado: value.toUpperCase() }));
      return;
    }

    setEmpresaData(prev => ({ ...prev, [name]: value }));
  };

  const handleBuscarCepEmpresa = async (cepInput: string) => {
    setEmpresaData(prev => ({ ...prev, cep: cepInput }));
    const cepLimpo = cepInput.replace(/\D/g, '');

    if (cepLimpo.length === 8) {
      try {
        setLoadingCepEmpresa(true);
        const res = await fetch(`https://viacep.com.br/ws/${cepLimpo}/json/`);
        const data = await res.json();
        if (!data.erro) {
          setEmpresaData(prev => ({
            ...prev,
            cep: cepLimpo,
            rua: data.logradouro || prev.rua,
            bairro: data.bairro || prev.bairro,
            cidade: data.localidade || prev.cidade,
            estado: data.uf || prev.estado,
          }));
        }
      } catch (err) {
        console.error('Erro ao buscar CEP da empresa:', err);
      } finally {
        setLoadingCepEmpresa(false);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    const hasAnyBirth = Boolean(birthParts.dia || birthParts.mes || birthParts.ano);
    const hasAllBirth = Boolean(birthParts.dia && birthParts.mes && birthParts.ano);

    if (hasAnyBirth && !hasAllBirth) {
      setMessage({
        text: 'Preencha dia, mês e ano de nascimento completos ou deixe todos em branco.',
        type: 'error',
      });
      return;
    }

    setSaving(true);

    try {
      await axios.put(`${API_URL}/api/perfil`, formData);
      setMessage({ text: 'Dados pessoais atualizados com sucesso!', type: 'success' });
    } catch (error: any) {
      setMessage({
        text: error.response?.data?.error || 'Erro ao atualizar os dados. Tente novamente.',
        type: 'error',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleSubmitEmpresa = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmpresaMessage(null);

    if (empresaData.indicadorIE === 'CONTRIBUINTE' && !empresaData.inscricaoEstadual.trim()) {
      setEmpresaMessage({
        text: 'Informe a Inscrição Estadual para contribuintes do ICMS.',
        type: 'error',
      });
      return;
    }

    setSavingEmpresa(true);

    try {
      const response = await axios.put(`${API_URL}/api/empresa`, empresaData);
      setPossuiEmpresa(true);
      if (response.data?.empresa?.cnpj) {
        setEmpresaData(prev => ({ ...prev, cnpj: response.data.empresa.cnpj }));
      }
      setEmpresaMessage({
        text: response.data?.message || 'Dados da empresa salvos com sucesso!',
        type: 'success',
      });
    } catch (error: any) {
      setEmpresaMessage({
        text: error.response?.data?.error || 'Erro ao salvar dados da empresa.',
        type: 'error',
      });
    } finally {
      setSavingEmpresa(false);
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

        {/* CARD 1: DADOS PESSOAIS */}
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
                <div className={styles.birthDateRow}>
                  <select
                    aria-label="Dia de nascimento"
                    className={`${styles.select} ${styles.birthSelect}`}
                    value={birthParts.dia}
                    onChange={(e) => handleBirthChange('dia', e.target.value)}
                  >
                    <option value="">Dia</option>
                    {Array.from(
                      { length: getDaysInMonth(birthParts.ano, birthParts.mes) },
                      (_, i) => {
                        const day = String(i + 1).padStart(2, '0');
                        return (
                          <option key={day} value={day}>
                            {day}
                          </option>
                        );
                      }
                    )}
                  </select>

                  <select
                    aria-label="Mês de nascimento"
                    className={`${styles.select} ${styles.birthSelect}`}
                    value={birthParts.mes}
                    onChange={(e) => handleBirthChange('mes', e.target.value)}
                  >
                    <option value="">Mês</option>
                    {MESES.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </select>

                  <select
                    aria-label="Ano de nascimento"
                    className={`${styles.select} ${styles.birthSelect}`}
                    value={birthParts.ano}
                    onChange={(e) => handleBirthChange('ano', e.target.value)}
                  >
                    <option value="">Ano</option>
                    {anos.map((year) => (
                      <option key={year} value={year}>
                        {year}
                      </option>
                    ))}
                  </select>
                </div>
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

        {/* CARD 2: DADOS DA EMPRESA (PESSOA JURÍDICA / NF-e) */}
        <div className={styles.card} style={{ marginTop: '1.75rem' }}>
          <div className={styles.companyHeader}>
            <div>
              <h2 className={styles.sectionTitle}>Dados da Empresa (Pessoa Jurídica / NF-e)</h2>
              <p className={styles.sectionSubtitle}>
                {possuiEmpresa
                  ? 'Dados fiscais utilizados quando você optar por faturar pedidos para CNPJ'
                  : 'Vincule um CNPJ caso queira emitir notas fiscais para Pessoa Jurídica'}
              </p>
            </div>

            {!possuiEmpresa && !exibirFormEmpresa && (
              <button
                type="button"
                className={styles.outlineGoldButton}
                onClick={() => setExibirFormEmpresa(true)}
              >
                + Cadastrar Empresa (CNPJ)
              </button>
            )}
          </div>

          {exibirFormEmpresa && (
            <>
              {empresaMessage && (
                <div
                  className={`${styles.message} ${
                    empresaMessage.type === 'success' ? styles.success : styles.error
                  }`}
                >
                  {empresaMessage.text}
                </div>
              )}

              <form onSubmit={handleSubmitEmpresa}>
                <div className={styles.formGrid}>
                  <div className={styles.formGroup}>
                    <label className={styles.label}>
                      {possuiEmpresa ? 'CNPJ (Não alterável)' : 'CNPJ *'}
                    </label>
                    <input
                      type="text"
                      name="cnpj"
                      value={empresaData.cnpj}
                      onChange={handleEmpresaChange}
                      placeholder="00.000.000/0000-00"
                      disabled={possuiEmpresa}
                      className={styles.input}
                      required
                    />
                  </div>

                  <div className={styles.formGroup}>
                    <label className={styles.label}>Razão Social *</label>
                    <input
                      type="text"
                      name="razaoSocial"
                      value={empresaData.razaoSocial}
                      onChange={handleEmpresaChange}
                      placeholder="Ex: Empresa Exemplo Ltda"
                      className={styles.input}
                      required
                    />
                  </div>

                  <div className={styles.formGroup}>
                    <label className={styles.label}>Nome Fantasia (Opcional)</label>
                    <input
                      type="text"
                      name="nomeFantasia"
                      value={empresaData.nomeFantasia}
                      onChange={handleEmpresaChange}
                      placeholder="Ex: Loja Exemplo"
                      className={styles.input}
                    />
                  </div>

                  <div className={styles.formGroup}>
                    <label className={styles.label}>Indicador de Inscrição Estadual *</label>
                    <select
                      name="indicadorIE"
                      value={empresaData.indicadorIE}
                      onChange={handleEmpresaChange}
                      className={styles.select}
                      required
                    >
                      <option value="NAO_CONTRIBUINTE">Não contribuinte</option>
                      <option value="CONTRIBUINTE">Contribuinte ICMS</option>
                      <option value="ISENTO">Isento</option>
                    </select>
                  </div>

                  {empresaData.indicadorIE === 'CONTRIBUINTE' && (
                    <div className={`${styles.formGroup} ${styles.fullWidth}`}>
                      <label className={styles.label}>Inscrição Estadual *</label>
                      <input
                        type="text"
                        name="inscricaoEstadual"
                        value={empresaData.inscricaoEstadual}
                        onChange={handleEmpresaChange}
                        placeholder="Digite a Inscrição Estadual"
                        className={styles.input}
                        required
                      />
                    </div>
                  )}

                  <div className={`${styles.formGroup} ${styles.fullWidth}`}>
                    <h3 className={styles.subGroupTitle}>Endereço Fiscal da Empresa</h3>
                  </div>

                  <div className={styles.formGroup}>
                    <label className={styles.label}>CEP *</label>
                    <input
                      type="text"
                      name="cep"
                      value={empresaData.cep}
                      onChange={(e) => handleBuscarCepEmpresa(e.target.value)}
                      placeholder="00000-000"
                      className={styles.input}
                      required
                    />
                    {loadingCepEmpresa && (
                      <small style={{ color: '#8f7254', fontSize: '0.78rem' }}>Buscando CEP...</small>
                    )}
                  </div>

                  <div className={styles.formGroup}>
                    <label className={styles.label}>UF *</label>
                    <select
                      name="estado"
                      value={empresaData.estado}
                      onChange={handleEmpresaChange}
                      className={styles.select}
                      required
                    >
                      <option value="">Selecione</option>
                      {UFS.map((uf) => (
                        <option key={uf} value={uf}>
                          {uf}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className={styles.formGroup}>
                    <label className={styles.label}>Cidade (Município) *</label>
                    <input
                      type="text"
                      name="cidade"
                      value={empresaData.cidade}
                      onChange={handleEmpresaChange}
                      placeholder="Ex: Palhoça"
                      className={styles.input}
                      required
                    />
                  </div>

                  <div className={styles.formGroup}>
                    <label className={styles.label}>Bairro *</label>
                    <input
                      type="text"
                      name="bairro"
                      value={empresaData.bairro}
                      onChange={handleEmpresaChange}
                      placeholder="Ex: Centro"
                      className={styles.input}
                      required
                    />
                  </div>

                  <div className={styles.formGroup}>
                    <label className={styles.label}>Rua / Logradouro *</label>
                    <input
                      type="text"
                      name="rua"
                      value={empresaData.rua}
                      onChange={handleEmpresaChange}
                      placeholder="Ex: Rua das Flores"
                      className={styles.input}
                      required
                    />
                  </div>

                  <div className={styles.formGroup}>
                    <label className={styles.label}>Número *</label>
                    <input
                      type="text"
                      name="numero"
                      value={empresaData.numero}
                      onChange={handleEmpresaChange}
                      placeholder="123 ou S/N"
                      className={styles.input}
                      required
                    />
                  </div>

                  <div className={`${styles.formGroup} ${styles.fullWidth}`}>
                    <label className={styles.label}>Complemento (Opcional)</label>
                    <input
                      type="text"
                      name="complemento"
                      value={empresaData.complemento}
                      onChange={handleEmpresaChange}
                      placeholder="Sala, Bloco, Galpão..."
                      className={styles.input}
                    />
                  </div>
                </div>

                <div className={styles.actionsFooter}>
                  <button
                    type="submit"
                    className={styles.saveButton}
                    disabled={savingEmpresa}
                  >
                    {savingEmpresa
                      ? 'A salvar empresa...'
                      : possuiEmpresa
                      ? 'Salvar Dados da Empresa'
                      : 'Cadastrar Empresa'}
                  </button>

                  {!possuiEmpresa && (
                    <button
                      type="button"
                      className={styles.cancelButton}
                      onClick={() => {
                        setExibirFormEmpresa(false);
                        setEmpresaMessage(null);
                      }}
                    >
                      Cancelar
                    </button>
                  )}
                </div>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
};