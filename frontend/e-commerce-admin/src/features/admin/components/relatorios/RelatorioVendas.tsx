import React, { useState, useEffect } from 'react';
import styles from './RelatorioVendas.module.css';

interface ItemRelatorioVenda {
  produtoId: string;
  produtoNome: string;
  tamanhoNome: string;
  corNome: string;
  corHex: string | null;
  quantidadeVendida: number;
  faturamentoTotal: number;
  precoMedioPago: number;
}

interface RelatorioVendasProps {
  apiUrl: string;
}

export const RelatorioVendas: React.FC<RelatorioVendasProps> = ({ apiUrl }) => {
  const [dados, setDados] = useState<ItemRelatorioVenda[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');

  const carregarRelatorio = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${apiUrl}/relatorios/vendas-variacao`, {
        credentials: 'include',
      });

      if (response.ok) {
        const result = await response.json();
        
        // Trata a resposta sendo um array direto ou um objeto { dados: [...] }
        const listaBruta = Array.isArray(result) ? result : result.dados || [];

        // Mapeia e garante a conversão de BigInt/Decimal para Number
        const listaFormatada: ItemRelatorioVenda[] = listaBruta.map((item: any) => ({
          produtoId: item.produtoId || item.produto_id || '',
          produtoNome: item.produtoNome || item.produto_nome || item.nomeProduto || 'Sem nome',
          tamanhoNome: item.tamanhoNome || item.tamanho_nome || 'Sem Tamanho',
          corNome: item.corNome || item.cor_nome || 'Sem Cor',
          corHex: item.corHex || item.cor_hex || null,
          quantidadeVendida: Number(item.quantidadeVendida || item.quantidade_vendida || 0),
          faturamentoTotal: Number(item.faturamentoTotal || item.faturamento_total || 0),
          precoMedioPago: Number(item.precoMedioPago || item.preco_medio_pago || 0),
        }));

        setDados(listaFormatada);
      } else {
        console.error('Erro ao buscar dados do relatório');
      }
    } catch (err) {
      console.error('Erro na requisição do relatório de vendas:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    carregarRelatorio();
  }, []);

  const dadosFiltrados = dados.filter((item) => {
    const q = searchQuery.toLowerCase();
    return (
      item.produtoNome.toLowerCase().includes(q) ||
      item.tamanhoNome.toLowerCase().includes(q) ||
      item.corNome.toLowerCase().includes(q)
    );
  });

  const totalUnidadesVendidas = dados.reduce((acc, curr) => acc + curr.quantidadeVendida, 0);
  const faturamentoTotalGeral = dados.reduce((acc, curr) => acc + curr.faturamentoTotal, 0);

  return (
    <section className={styles.card}>
      <div className={styles.headerBetween}>
        <div>
          <h3>📊 Relatório Detalhado de Vendas por Variação</h3>
          <p className={styles.infoText}>
            Consolidado de unidades vendidas e faturamento agrupado por Produto, Tamanho e Cor.
          </p>
        </div>
        <button
          type="button"
          onClick={carregarRelatorio}
          className={styles.btnSecondary}
          disabled={loading}
        >
          {loading ? 'Atualizando...' : '🔄 Atualizar Relatório'}
        </button>
      </div>

      <div className={styles.summaryGrid}>
        <div className={styles.summaryCard}>
          <span className={styles.summaryLabel}>Total de Peças Vendidas</span>
          <span className={styles.summaryValue}>{totalUnidadesVendidas} un</span>
        </div>
        <div className={styles.summaryCard}>
          <span className={styles.summaryLabel}>Faturamento Bruto</span>
          <span className={styles.summaryValue} style={{ color: '#059669' }}>
            R$ {faturamentoTotalGeral.toFixed(2)}
          </span>
        </div>
      </div>

      <div className={styles.filterBar}>
        <input
          type="text"
          className={styles.searchInput}
          placeholder="🔍 Filtrar por produto, cor ou tamanho..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {loading && dados.length === 0 ? (
        <p className={styles.emptyNotice}>Carregando relatório de vendas...</p>
      ) : dadosFiltrados.length === 0 ? (
        <p className={styles.emptyNotice}>Nenhuma venda encontrada para o filtro informado.</p>
      ) : (
        <div className={styles.tableWrapper}>
          <table className={styles.reportTable}>
            <thead>
              <tr>
                <th>Produto</th>
                <th>Tamanho</th>
                <th>Cor</th>
                <th>Qtd Vendida</th>
                <th>Preço Médio</th>
                <th>Faturamento Total</th>
              </tr>
            </thead>
            <tbody>
              {dadosFiltrados.map((item, index) => (
                <tr key={`${item.produtoId}-${item.tamanhoNome}-${item.corNome}-${index}`}>
                  <td>
                    <strong>{item.produtoNome}</strong>
                  </td>
                  <td>{item.tamanhoNome}</td>
                  <td>
                    {item.corHex && (
                      <span
                        className={styles.colorDot}
                        style={{ backgroundColor: item.corHex }}
                      />
                    )}
                    {item.corNome}
                  </td>
                  <td>
                    <strong>{item.quantidadeVendida} un</strong>
                  </td>
                  <td>R$ {item.precoMedioPago.toFixed(2)}</td>
                  <td className={styles.textGreen}>
                    R$ {item.faturamentoTotal.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
};