import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import styles from './RegisterForm.module.css';
import {
  formatarCep,
  formatarCnpjAlfanumerico,
  formatarCpf,
  formatarTelefone,
  validarCnpjAlfanumerico,
} from '../../../../utils/documento'; // ajuste o caminho relativo conforme a pasta do RegisterForm.tsx

axios.defaults.withCredentials = true;

const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const API_URL = isLocal
  ? 'http://localhost:3333'
  : 'https://ninhoback.tamaralr.com.br';

type TipoPessoa = 'PF' | 'PJ';
type IndicadorIE = 'CONTRIBUINTE' | 'ISENTO' | 'NAO_CONTRIBUINTE';

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

export const RegisterForm: React.FC = () => {
  const navigate = useNavigate();

  const [tipoPessoa, setTipoPessoa] = useState<TipoPessoa>('PF');

  const [formData, setFormData] = useState({
    // Dados pessoais / responsável
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

    // Dados Pessoa Jurídica (NF-e / Bling)
    cnpj: '',
    razaoSocial: '',
    nomeFantasia: '',
    indicadorIE: 'NAO_CONTRIBUINTE' as IndicadorIE,
    inscricaoEstadual: '',

    // Endereço Fiscal (PJ)
    cep: '',
    rua: '',
    numero: '',
    complemento: '',
    bairro: '',
    cidade: '',
    estado: '',
  });

  const [birthParts, setBirthParts] = useState({
    dia: '',
    mes: '',
    ano: '',
  });

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const anoAtual = new Date().getFullYear();
  const anos = Array.from({ length: 110 }, (_, i) => String(anoAtual - i));

  const getDaysInMonth = (anoStr: string, mesStr: string) => {
    if (!mesStr) return 31;
    const anoNum = anoStr ? Number(anoStr) : 2000;
    return new Date(anoNum, Number(mesStr), 0).getDate();
  };

  const handleBirthChange = (part: 'dia' | 'mes' | 'ano', value: string) => {
    const nextParts = { ...birthParts, [part]: value };

    const maxDays = getDaysInMonth(nextParts.ano, nextParts.mes);
    if (nextParts.dia && Number(nextParts.dia) > maxDays) {
      nextParts.dia = '';
    }

    setBirthParts(nextParts);

    if (nextParts.dia && nextParts.mes && nextParts.ano) {
      const formattedDate = `${nextParts.ano}-${nextParts.mes}-${nextParts.dia}`;
      setFormData(prev => ({ ...prev, dataNascimento: formattedDate }));
    } else {
      setFormData(prev => ({ ...prev, dataNascimento: '' }));
    }
  };

  const handleTipoPessoaChange = (novoTipo: TipoPessoa) => {
    setTipoPessoa(novoTipo);
    setErrorMessage(null);
  };

  const handleIndicadorIEChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value as IndicadorIE;
    setFormData(prev => ({
      ...prev,
      indicadorIE: value,
      inscricaoEstadual: value === 'CONTRIBUINTE' ? prev.inscricaoEstadual : '',
    }));
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;

    if (type === 'checkbox') {
      const { checked } = e.target as HTMLInputElement;
      setFormData(prev => ({ ...prev, [name]: checked }));
    } else if (name === 'cpf') {
      setFormData(prev => ({ ...prev, cpf: formatarCpf(value) }));
    } else if (name === 'cnpj') {
      setFormData(prev => ({ ...prev, cnpj: formatarCnpjAlfanumerico(value) }));
    } else if (name === 'telefone') {
      setFormData(prev => ({ ...prev, telefone: formatarTelefone(value) }));
    } else if (name === 'cep') {
      setFormData(prev => ({ ...prev, cep: formatarCep(value) }));
    } else if (name === 'estado') {
      setFormData(prev => ({ ...prev, estado: value.toUpperCase() }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMessage(null);

    const hasAnyBirthPart = Boolean(birthParts.dia || birthParts.mes || birthParts.ano);
    const hasAllBirthParts = Boolean(birthParts.dia && birthParts.mes && birthParts.ano);

    if (tipoPessoa === 'PF' && hasAnyBirthPart && !hasAllBirthParts) {
      setErrorMessage('Preencha dia, mês e ano de nascimento completos ou deixe todos em branco.');
      return;
    }

    if (tipoPessoa === 'PJ' && !validarCnpjAlfanumerico(formData.cnpj)) {
      setErrorMessage('Informe um CNPJ válido com 14 caracteres (números ou letras/números).');
      return;
    }

    if (tipoPessoa === 'PJ' && formData.indicadorIE === 'CONTRIBUINTE' && !formData.inscricaoEstadual.trim()) {
      setErrorMessage('Informe a Inscrição Estadual para contribuintes do ICMS.');
      return;
    }

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

      const payload =
        tipoPessoa === 'PF'
          ? {
              tipoPessoa: 'PF',
              nome: formData.nome,
              sobrenome: formData.sobrenome,
              cpf: formData.cpf,
              email: formData.email,
              telefone: formData.telefone,
              senha: formData.senha,
              confirmarSenha: formData.confirmarSenha,
              dataNascimento: formData.dataNascimento,
              sexo: formData.sexo,
              receberNovidades: formData.receberNovidades,
            }
          : {
              tipoPessoa: 'PJ',
              nome: formData.nome,
              sobrenome: formData.sobrenome,
              cpf: formData.cpf,
              email: formData.email,
              telefone: formData.telefone,
              senha: formData.senha,
              confirmarSenha: formData.confirmarSenha,
              receberNovidades: formData.receberNovidades,
              cnpj: formData.cnpj,
              razaoSocial: formData.razaoSocial,
              nomeFantasia: formData.nomeFantasia,
              indicadorIE: formData.indicadorIE,
              inscricaoEstadual:
                formData.indicadorIE === 'CONTRIBUINTE' ? formData.inscricaoEstadual : null,
              cep: formData.cep,
              rua: formData.rua,
              numero: formData.numero,
              complemento: formData.complemento,
              bairro: formData.bairro,
              cidade: formData.cidade,
              estado: formData.estado,
            };

      await axios.post(`${API_URL}/api/register`, payload);

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
      {/* LADO ESQUERDO: Formulário de Cadastro */}
      <div className={styles.leftSide}>
        <span className={styles.backLink} onClick={() => navigate('/')}>
          ← Voltar para a loja
        </span>

        <h2 className={styles.title}>Crie sua conta</h2>
        <p className={styles.subtitle}>Insira seus dados para começar a comprar</p>

        {/* Seletor Pessoa Física / Pessoa Jurídica */}
        <div className={styles.personTypeSwitch} role="tablist" aria-label="Tipo de cadastro">
          <button
            type="button"
            className={`${styles.personTypeButton} ${tipoPessoa === 'PF' ? styles.personTypeActive : ''}`}
            onClick={() => handleTipoPessoaChange('PF')}
          >
            Pessoa Física
          </button>
          <button
            type="button"
            className={`${styles.personTypeButton} ${tipoPessoa === 'PJ' ? styles.personTypeActive : ''}`}
            onClick={() => handleTipoPessoaChange('PJ')}
          >
            Pessoa Jurídica
          </button>
        </div>

        {errorMessage && (
          <div style={{ color: '#d9534f', marginBottom: '1rem', fontSize: '0.9rem', fontWeight: 'bold' }}>
            {errorMessage}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {tipoPessoa === 'PJ' && (
            <h3 className={styles.sectionHeading}>Dados do responsável pela conta</h3>
          )}

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
            <label className={styles.label}>
              {tipoPessoa === 'PJ' ? 'CPF do responsável *' : 'CPF *'}
            </label>
            <input
              type="text"
              name="cpf"
              className={styles.input}
              value={formData.cpf}
              onChange={handleChange}
              placeholder="000.000.000-00"
              maxLength={14}
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
              maxLength={15}
              required
            />
          </div>

          {tipoPessoa === 'PF' ? (
            <>
              <div className={styles.formGroup}>
                <label className={styles.label}>Data de Nascimento (Opcional)</label>
                <div className={styles.birthDateRow}>
                  <select
                    aria-label="Dia de nascimento"
                    className={`${styles.input} ${styles.birthSelect}`}
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
                    className={`${styles.input} ${styles.birthSelect}`}
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
                    className={`${styles.input} ${styles.birthSelect}`}
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
            </>
          ) : (
            <>
              <h3 className={styles.sectionHeading}>Dados da empresa (NF-e)</h3>

              <div className={styles.formGroup}>
                <label className={styles.label}>CNPJ *</label>
                <input
                  type="text"
                  name="cnpj"
                  className={styles.input}
                  value={formData.cnpj}
                  onChange={handleChange}
                  placeholder="00.000.000/0000-00"
                  maxLength={18}
                  required
                />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label}>Razão Social *</label>
                <input
                  type="text"
                  name="razaoSocial"
                  className={styles.input}
                  value={formData.razaoSocial}
                  onChange={handleChange}
                  placeholder="Ex: Empresa Exemplo Ltda"
                  required
                />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label}>Nome Fantasia (Opcional)</label>
                <input
                  type="text"
                  name="nomeFantasia"
                  className={styles.input}
                  value={formData.nomeFantasia}
                  onChange={handleChange}
                  placeholder="Ex: Loja Exemplo"
                />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label}>Indicador de Inscrição Estadual *</label>
                <select
                  name="indicadorIE"
                  className={styles.input}
                  value={formData.indicadorIE}
                  onChange={handleIndicadorIEChange}
                  required
                >
                  <option value="NAO_CONTRIBUINTE">Não contribuinte</option>
                  <option value="CONTRIBUINTE">Contribuinte ICMS</option>
                  <option value="ISENTO">Isento</option>
                </select>
              </div>

              {formData.indicadorIE === 'CONTRIBUINTE' && (
                <div className={styles.formGroup}>
                  <label className={styles.label}>Inscrição Estadual *</label>
                  <input
                    type="text"
                    name="inscricaoEstadual"
                    className={styles.input}
                    value={formData.inscricaoEstadual}
                    onChange={handleChange}
                    placeholder="Digite a Inscrição Estadual"
                    required
                  />
                </div>
              )}

              <h3 className={styles.sectionHeading}>Endereço fiscal</h3>

              <div className={styles.addressGrid}>
                <div className={styles.formGroup}>
                  <label className={styles.label}>CEP *</label>
                  <input
                    type="text"
                    name="cep"
                    className={styles.input}
                    value={formData.cep}
                    onChange={handleChange}
                    placeholder="00000-000"
                    maxLength={9}
                    required
                  />
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.label}>UF *</label>
                  <select
                    name="estado"
                    className={styles.input}
                    value={formData.estado}
                    onChange={handleChange}
                    required
                  >
                    <option value="">UF</option>
                    {UFS.map((uf) => (
                      <option key={uf} value={uf}>
                        {uf}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label}>Cidade (Município) *</label>
                <input
                  type="text"
                  name="cidade"
                  className={styles.input}
                  value={formData.cidade}
                  onChange={handleChange}
                  placeholder="Ex: Palhoça"
                  required
                />
              </div>

              <div className={styles.streetGrid}>
                <div className={styles.formGroup}>
                  <label className={styles.label}>Rua / Logradouro *</label>
                  <input
                    type="text"
                    name="rua"
                    className={styles.input}
                    value={formData.rua}
                    onChange={handleChange}
                    placeholder="Ex: Rua das Flores"
                    required
                  />
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.label}>Número *</label>
                  <input
                    type="text"
                    name="numero"
                    className={styles.input}
                    value={formData.numero}
                    onChange={handleChange}
                    placeholder="123 ou S/N"
                    required
                  />
                </div>
              </div>

              <div className={styles.streetGrid}>
                <div className={styles.formGroup}>
                  <label className={styles.label}>Bairro *</label>
                  <input
                    type="text"
                    name="bairro"
                    className={styles.input}
                    value={formData.bairro}
                    onChange={handleChange}
                    placeholder="Ex: Centro"
                    required
                  />
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.label}>Complemento (Opcional)</label>
                  <input
                    type="text"
                    name="complemento"
                    className={styles.input}
                    value={formData.complemento}
                    onChange={handleChange}
                    placeholder="Sala, Bloco..."
                  />
                </div>
              </div>

              <h3 className={styles.sectionHeading}>Dados de acesso</h3>
            </>
          )}

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