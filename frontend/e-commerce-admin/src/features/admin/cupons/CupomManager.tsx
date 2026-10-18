import React, { useState, useEffect } from 'react';
import styles from './CupomManager.module.css';

interface Cupom {
  id: string;
  codigo: string;
  tipo: 'PERCENTUAL' | 'FIXO';
  valor: number;
  isPrimeiraCompra: boolean;
  dataValidade?: string;
  ativo: boolean;
}

interface CupomManagerProps {
  apiUrl: string;
}

export const CupomManager: React.FC<CupomManagerProps> = ({ apiUrl }) => {
  const [cupons, setCupons] = useState<Cupom[]>([]);
  const [codigo, setCodigo] = useState('');
  const [tipo, setTipo] = useState<'PERCENTUAL' | 'FIXO'>('PERCENTUAL');
  const [valor, setValor] = useState('');
  const [isPrimeiraCompra, setIsPrimeiraCompra] = useState(false);
  const [dataValidade, setDataValidade] = useState('');
  const [loading, setLoading] = useState(false);

  const carregarCupons = async () => {
    try {
      const response = await fetch(`${apiUrl}/cupons`, { credentials: 'include' });
      if (response.ok) {
        const data = await response.json();
        setCupons(data);
      }
    } catch (err) {
      console.error('Erro ao carregar cupons', err);
    }
  };

  useEffect(() => {
    carregarCupons();
  }, []);

  const handleSalvarCupom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!codigo || !valor) {
      alert('Preencha o código e o valor do cupom.');
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(`${apiUrl}/cupons`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          codigo: codigo.toUpperCase().trim(),
          tipo,
          valor: Number(valor),
          isPrimeiraCompra,
          dataValidade: dataValidade ? new Date(dataValidade).toISOString() : null,
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Erro ao cadastrar cupom.');

      alert('Cupom cadastrado com sucesso!');
      setCodigo('');
      setValor('');
      setIsPrimeiraCompra(false);
      setDataValidade('');
      carregarCupons();
    } catch (err: any) {
      alert(err.message || 'Erro ao conectar com o servidor.');
    } finally {
      setLoading(false);
    }
  };

  const handleAlternarStatus = async (id: string) => {
    try {
      const response = await fetch(`${apiUrl}/cupons/${id}/status`, {
        method: 'PATCH',
        credentials: 'include',
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Erro ao alterar status.');

      alert(data.message);
      carregarCupons();
    } catch (err: any) {
      alert(err.message || 'Erro ao conectar com o servidor.');
    }
  };

  return (
    <div className={styles.singleContainer}>
      <section className={styles.card}>
        <h3>🎟️ Gerenciador de Cupons de Desconto</h3>
        <p className={styles.infoText}>
          Cadastre cupons de primeira compra ou defina datas de validade para campanhas sazonais.
        </p>

        <form onSubmit={handleSalvarCupom} className={styles.form}>
          <div className={styles.gridContainerPrice}>
            <div className={styles.group}>
              <label>Código do Cupom</label>
              <input 
                type="text" 
                value={codigo} 
                onChange={e => setCodigo(e.target.value)} 
                placeholder="Ex: PRIMEIRACOMPRA ou VERAO2026" 
                required 
              />
            </div>

            <div className={styles.group}>
              <label>Tipo de Desconto</label>
              <select value={tipo} onChange={e => setTipo(e.target.value as any)}>
                <option value="PERCENTUAL">Porcentagem (% OFF)</option>
                <option value="FIXO">Valor Fixo (R$)</option>
              </select>
            </div>
          </div>

          <div className={styles.gridContainerPrice}>
            <div className={styles.group}>
              <label>{tipo === 'PERCENTUAL' ? 'Valor (% Desconto)' : 'Valor (R$ Desconto)'}</label>
              <input 
                type="number" 
                step={tipo === 'PERCENTUAL' ? '1' : '0.01'} 
                min="0"
                max={tipo === 'PERCENTUAL' ? '100' : undefined}
                value={valor} 
                onChange={e => setValor(e.target.value)} 
                placeholder={tipo === 'PERCENTUAL' ? 'Ex: 10' : 'Ex: 25.00'} 
                required 
              />
            </div>

            <div className={styles.group}>
              <label>Data de Validade (Opcional para Campanhas)</label>
              <input 
                type="date" 
                value={dataValidade} 
                onChange={e => setDataValidade(e.target.value)} 
              />
              <small className={styles.slugPreviewText}>Deixe em branco para cupons sem prazo de expiração.</small>
            </div>
          </div>

          <div className={styles.group}>
            <label className={styles.sizeCheckboxLabel}>
              <input 
                type="checkbox" 
                checked={isPrimeiraCompra} 
                onChange={e => setIsPrimeiraCompra(e.target.checked)} 
              />
              ⭐ Restringir exclusivamente para a <strong>Primeira Compra</strong> do cliente
            </label>
          </div>

          <button type="submit" className={styles.btnPrimary} disabled={loading}>
            {loading ? 'Salvando...' : 'Cadastrar Cupom'}
          </button>
        </form>

        <div className={styles.listSectionWrapper}>
          <h4 className={styles.listSubheading}>Cupons Cadastrados</h4>
          {cupons.length === 0 ? (
            <p className={styles.emptyNotice}>Nenhum cupom cadastrado no momento.</p>
          ) : (
            <div className={styles.dashboardTableWrapper}>
              <table className={styles.dashboardTableElement}>
                <thead>
                  <tr className={styles.dashboardTableHeaderRow}>
                    <th className={styles.dashboardTableCell}>Código</th>
                    <th className={styles.dashboardTableCell}>Desconto</th>
                    <th className={styles.dashboardTableCell}>Regra / Campanha</th>
                    <th className={styles.dashboardTableCell}>Validade</th>
                    <th className={styles.dashboardTableCell}>Status</th>
                    <th className={styles.dashboardTableCell}>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {cupons.map(cupom => (
                    <tr key={cupom.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                      <td className={styles.dashboardTableCell}><strong>{cupom.codigo}</strong></td>
                      <td className={styles.dashboardTableCell}>{cupom.tipo === 'PERCENTUAL' ? `${cupom.valor}% OFF` : `R$ ${cupom.valor.toFixed(2)}`}</td>
                      <td className={styles.dashboardTableCell}>
                        {cupom.isPrimeiraCompra ? (
                          <span className={styles.badgePrimeiraCompra}>
                            Primeira Compra
                          </span>
                        ) : (
                          <span className={styles.textGeralCampanha}>Geral / Campanha</span>
                        )}
                      </td>
                      <td className={styles.dashboardTableCell}>
                        {cupom.dataValidade ? new Date(cupom.dataValidade).toLocaleDateString('pt-BR') : 'Sem prazo'}
                      </td>
                      <td className={styles.dashboardTableCell}>
                        <span className={cupom.ativo ? styles.statusAtivo : styles.statusInativo}>
                          {cupom.ativo ? '🟢 Ativo' : '🔴 Inativo'}
                        </span>
                      </td>
                      <td className={styles.dashboardTableCell}>
                        <button 
                          type="button" 
                          onClick={() => handleAlternarStatus(cupom.id)}
                          className={`${styles.btnActionTable} ${cupom.ativo ? styles.btnDesativar : styles.btnAtivar}`}
                        >
                          {cupom.ativo ? '🚫 Desativar' : '✅ Ativar'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </div>
  );
};