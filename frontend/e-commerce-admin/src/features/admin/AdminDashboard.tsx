import React, { useState, useEffect } from 'react';
import styles from './AdminDashboard.module.css';

interface ProductMaster {
  id: string;
  name: string;
  category: string;
  description: string;
  images: string[];
  originalPrice: number;
  isVisible: boolean;
  hasOffer: boolean;
  offerPrice: number;
  sizes: string[];
  colors: any[];
  rawSizes?: { tamanhoId: string; corId?: string; estoque?: number; ativo?: boolean; tamanho?: { nome: string }; cor?: { nome: string } }[];
  rawColors?: { corId: string; id?: string; cor?: { nome: string }; nome?: string }[];
}

interface StockMovement {
  id: string;
  productId: string;
  colorName: string;
  size: string;
  type: 'ENTRADA' | 'SAIDA';
  quantity: number;
  reason: string;
  date: string;
}

interface Categoria {
  id: string;
  nome: string;
  slug: string;
}

interface Tamanho {
  id: string;
  nome: string;
  slug: string;
}

interface Cor {
  id: string;
  nome: string;
  slug: string;
  hex?: string;
}

interface MotivoEstoque {
  id: string;
  nome: string;
  tipo: 'ENTRADA' | 'SAIDA';
}

interface ColorSizeConfig {
  corId: string;
  tamanhosIds: string[];
  estoques?: { [tamanhoId: string]: string };
}

interface DashboardData {
  cards: {
    totalProdutosAtivos: number;
    quantidadeFisicaTotal: number;
    entradasNoMes: number;
    saidasNoMes: number;
  };
  ultimasMovimentacoes: Array<{
    id: string;
    corNome: string;
    tamanho: string;
    tipo: 'ENTRADA' | 'SAIDA';
    quantidade: number;
    data: string;
    produto?: { nome: string; name?: string };
    motivo?: { nome: string };
  }>;
}

export const AdminDashboard: React.FC = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'cadastro' | 'lista' | 'oferta' | 'estoque' | 'historico-estoque' | 'categorias' | 'tamanhos' | 'cores' | 'motivos'>('dashboard');

  const [products, setProducts] = useState<ProductMaster[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [motivosEstoqueList, setMotivosEstoqueList] = useState<MotivoEstoque[]>([]);
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(false);

  const [searchTerm, setSearchTerm] = useState('');
  const [stockSearchQuery, setStockSearchQuery] = useState('');
  const [historySearchQuery, setHistorySearchQuery] = useState('');
  const [stockFilter, setStockFilter] = useState<'todos' | 'esgotado' | 'baixo'>('todos');

  const [selectedProductDetails, setSelectedProductDetails] = useState<ProductMaster | null>(null);
  const [selectedColorForDetails, setSelectedColorForDetails] = useState<string | null>(null);
  const [activeImageIndex, setActiveImageIndex] = useState<number>(0);

  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [newCategoryId, setNewCategoryId] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newPrice, setNewPrice] = useState('');
  
  const [tempImages, setTempImages] = useState<string[]>([]);
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  
  const [selectedColors, setSelectedColors] = useState<string[]>([]);
  const [colorSizeConfigs, setColorSizeConfigs] = useState<ColorSizeConfig[]>([]);

  // Estados de Categorias
  const [categoriasList, setCategoriasList] = useState<Categoria[]>([]);
  const [novaCategoriaNome, setNovaCategoriaNome] = useState('');
  const [categoriaLoading, setCategoriaLoading] = useState(false);
  const [categoriaError, setCategoriaError] = useState('');
  const [editingCategoriaId, setEditingCategoriaId] = useState<string | null>(null);

  // Estados de Tamanhos
  const [tamanhosList, setTamanhosList] = useState<Tamanho[]>([]);
  const [novoTamanhoNome, setNovoTamanhoNome] = useState('');
  const [tamanhoLoading, setTamanhoLoading] = useState(false);
  const [tamanhoError, setTamanhoError] = useState('');
  const [editingTamanhoId, setEditingTamanhoId] = useState<string | null>(null);

  // Estados de Cores
  const [coresList, setCoresList] = useState<Cor[]>([]);
  const [novaCorNome, setNovaCorNome] = useState('');
  const [novaCorHex, setNovaCorHex] = useState('#000000');
  const [corLoading, setCorLoading] = useState(false);
  const [corError, setCorError] = useState('');
  const [editingCorId, setEditingCorId] = useState<string | null>(null);

  // Estados de Motivos de Estoque
  const [novoMotivoNome, setNovoMotivoNome] = useState('');
  const [novoMotivoTipo, setNovoMotivoTipo] = useState<'ENTRADA' | 'SAIDA'>('ENTRADA');
  const [motivoLoading, setMotivoLoading] = useState(false);
  const [motivoError, setMotivoError] = useState('');
  const [editingMotivoId, setEditingMotivoId] = useState<string | null>(null);

  const [searchOfferId, setSearchOfferId] = useState('');
  const [promoPrice, setPromoPrice] = useState<string>('');

  const [stockInputValues, setStockInputValues] = useState<{ [key: string]: string }>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);
  
  const API_URL = 'http://localhost:3333/api';

  useEffect(() => {
    carregarCategorias();
    carregarTamanhos();
    carregarCores();
    carregarProdutos();
    carregarMovimentacoes();
    carregarMotivosEstoque();
    carregarDashboard();
  }, []);

  useEffect(() => {
    if (activeTab === 'dashboard') {
      carregarDashboard();
    }
  }, [activeTab]);

  useEffect(() => {
    setColorSizeConfigs(prevConfigs => {
      return selectedColors.map(corId => {
        const configExistente = prevConfigs.find(c => c.corId === corId);
        if (configExistente) {
          return configExistente;
        }
        return {
          corId,
          tamanhosIds: [],
          estoques: {}
        };
      });
    });
  }, [selectedColors]);

  const carregarDashboard = async () => {
    setDashboardLoading(true);
    try {
      const response = await fetch(`${API_URL}/estoque/dashboard`, { credentials: 'include' });
      if (response.ok) {
        const data = await response.json();
        setDashboardData(data);
      }
    } catch (err) {
      console.error('Erro ao carregar dados do dashboard', err);
    } finally {
      setDashboardLoading(false);
    }
  };

  const carregarCategorias = async () => {
    try {
      const response = await fetch(`${API_URL}/categorias`, { credentials: 'include' });
      if (response.ok) {
        const data = await response.json();
        setCategoriasList(data);
        if (data.length > 0 && !newCategoryId) {
          setNewCategoryId(data[0].id);
        }
      }
    } catch (err) {
      console.error('Erro ao carregar categorias', err);
    }
  };

  const carregarTamanhos = async () => {
    try {
      const response = await fetch(`${API_URL}/tamanhos`, { credentials: 'include' });
      if (response.ok) {
        const data = await response.json();
        setTamanhosList(data);
      }
    } catch (err) {
      console.error('Erro ao carregar tamanhos', err);
    }
  };

  const carregarCores = async () => {
    try {
      const response = await fetch(`${API_URL}/cores`, { credentials: 'include' });
      if (response.ok) {
        const data = await response.json();
        setCoresList(data);
      }
    } catch (err) {
      console.error('Erro ao carregar cores', err);
    }
  };

  const carregarMotivosEstoque = async () => {
    try {
      const response = await fetch(`${API_URL}/motivos-estoque`, { credentials: 'include' });
      if (response.ok) {
        const data = await response.json();
        setMotivosEstoqueList(data);
      }
    } catch (err) {
      console.error('Erro ao carregar motivos de estoque', err);
    }
  };

  const carregarProdutos = async () => {
    try {
      const response = await fetch(`${API_URL}/produtos`, { credentials: 'include' });
      if (response.ok) {
        const data = await response.json();
        const formattedProducts: ProductMaster[] = data.map((p: any) => {
          const estoqueList = p.estoques || p.tamanhos || [];
          const coresUnicasMap = new Map();
          
          estoqueList.forEach((item: any) => {
            if (item.cor) {
              coresUnicasMap.set(item.cor.id, {
                id: item.cor.id,
                nome: item.cor.nome,
                hex: item.cor.hex || '#000000'
              });
            }
          });

          const coresFormatadas = Array.from(coresUnicasMap.values());

          return {
            id: p.id,
            name: p.nome,
            category: p.categoria?.nome || 'Geral',
            description: p.descricao || '',
            images: p.imagens && p.imagens.length > 0 ? p.imagens.map((img: any) => img.url) : ['https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?q=80&w=200'],
            originalPrice: Number(p.preco),
            isVisible: true,
            hasOffer: false,
            offerPrice: 0,
            sizes: estoqueList.map((t: any) => t.tamanho?.nome || t.tamanhoId),
            colors: coresFormatadas.length > 0 ? coresFormatadas : (p.cores ? p.cores.map((c: any) => ({ nome: c.cor?.nome || c.nome, hex: c.cor?.hex || '#000000' })) : []),
            rawSizes: estoqueList,
            rawColors: p.cores || []
          };
        });
        setProducts(formattedProducts);
      }
    } catch (err) {
      console.error('Erro ao carregar produtos', err);
    }
  };

  const carregarMovimentacoes = async () => {
    try {
      const response = await fetch(`${API_URL}/movimentacoes`, { credentials: 'include' });
      if (response.ok) {
        const data = await response.json();
        const formattedMovements: StockMovement[] = data.map((m: any) => ({
          id: m.id,
          productId: m.produtoId,
          colorName: m.corNome,
          size: m.tamanho,
          type: m.tipo,
          quantity: m.quantidade,
          reason: m.motivo?.nome || m.motivo || 'Manual',
          date: new Date(m.data).toLocaleDateString('pt-BR')
        }));
        setMovements(formattedMovements);
      }
    } catch (err) {
      console.error('Erro ao carregar movimentações', err);
    }
  };

  const gerarSlug = (texto: string) => {
    return texto
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\w\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-');
  };

  const handleSaveCategoria = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!novaCategoriaNome) return;
    setCategoriaError('');
    setCategoriaLoading(true);

    const slug = gerarSlug(novaCategoriaNome);

    try {
      const url = editingCategoriaId ? `${API_URL}/categorias/${editingCategoriaId}` : `${API_URL}/categorias`;
      const method = editingCategoriaId ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ nome: novaCategoriaNome, slug }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Erro ao salvar categoria.');

      setNovaCategoriaNome('');
      setEditingCategoriaId(null);
      carregarCategorias();
      alert(editingCategoriaId ? 'Categoria atualizada com sucesso!' : 'Categoria cadastrada com sucesso!');
    } catch (err: any) {
      setCategoriaError(err.message || 'Erro ao conectar com o servidor.');
    } finally {
      setCategoriaLoading(false);
    }
  };

  const handleStartEditCategoria = (cat: Categoria) => {
    setEditingCategoriaId(cat.id);
    setNovaCategoriaNome(cat.nome);
  };

  const handleDeleteCategoria = async (id: string) => {
    if (!window.confirm('Tem certeza que deseja excluir esta categoria?')) return;
    try {
      const response = await fetch(`${API_URL}/categorias/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Erro ao excluir categoria.');
      alert('Categoria excluída com sucesso!');
      carregarCategorias();
    } catch (err: any) {
      alert(err.message || 'Erro ao excluir categoria.');
    }
  };

  const handleSaveTamanho = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!novoTamanhoNome) return;
    setTamanhoError('');
    setTamanhoLoading(true);

    const slug = gerarSlug(novoTamanhoNome);

    try {
      const url = editingTamanhoId ? `${API_URL}/tamanhos/${editingTamanhoId}` : `${API_URL}/tamanhos`;
      const method = editingTamanhoId ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ nome: novoTamanhoNome, slug }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Erro ao salvar tamanho.');

      setNovoTamanhoNome('');
      setEditingTamanhoId(null);
      carregarTamanhos();
      alert(editingTamanhoId ? 'Tamanho atualizado com sucesso!' : 'Tamanho cadastrado com sucesso!');
    } catch (err: any) {
      setTamanhoError(err.message || 'Erro ao conectar com o servidor.');
    } finally {
      setTamanhoLoading(false);
    }
  };

  const handleStartEditTamanho = (tam: Tamanho) => {
    setEditingTamanhoId(tam.id);
    setNovoTamanhoNome(tam.nome);
  };

  const handleDeleteTamanho = async (id: string) => {
    if (!window.confirm('Tem certeza que deseja excluir este tamanho?')) return;
    try {
      const response = await fetch(`${API_URL}/tamanhos/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Erro ao excluir tamanho.');
      alert('Tamanho excluído com sucesso!');
      carregarTamanhos();
    } catch (err: any) {
      alert(err.message || 'Erro ao excluir tamanho.');
    }
  };

  const handleSaveCor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!novaCorNome) return;
    setCorError('');
    setCorLoading(true);

    const slug = gerarSlug(novaCorNome);

    try {
      const url = editingCorId ? `${API_URL}/cores/${editingCorId}` : `${API_URL}/cores`;
      const method = editingCorId ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ nome: novaCorNome, slug, hex: novaCorHex }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Erro ao salvar cor.');

      setNovaCorNome('');
      setNovaCorHex('#000000');
      setEditingCorId(null);
      carregarCores();
      alert(editingCorId ? 'Cor atualizada com sucesso!' : 'Cor cadastrada com sucesso!');
    } catch (err: any) {
      setCorError(err.message || 'Erro ao conectar com o servidor.');
    } finally {
      setCorLoading(false);
    }
  };

  const handleStartEditCor = (cor: Cor) => {
    setEditingCorId(cor.id);
    setNovaCorNome(cor.nome);
    setNovaCorHex(cor.hex || '#000000');
  };

  const handleDeleteCor = async (id: string) => {
    if (!window.confirm('Tem certeza que deseja excluir esta cor?')) return;
    try {
      const response = await fetch(`${API_URL}/cores/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Erro ao excluir cor.');
      alert('Cor excluída com sucesso!');
      carregarCores();
    } catch (err: any) {
      alert(err.message || 'Erro ao excluir cor.');
    }
  };

  const handleSaveMotivo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!novoMotivoNome) return;
    setMotivoError('');
    setMotivoLoading(true);

    try {
      const url = editingMotivoId ? `${API_URL}/motivos-estoque/${editingMotivoId}` : `${API_URL}/motivos-estoque`;
      const method = editingMotivoId ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ nome: novoMotivoNome, tipo: novoMotivoTipo }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Erro ao salvar motivo de estoque.');

      setNovoMotivoNome('');
      setNovoMotivoTipo('ENTRADA');
      setEditingMotivoId(null);
      carregarMotivosEstoque();
      alert(editingMotivoId ? 'Motivo atualizado com sucesso!' : 'Motivo cadastrado com sucesso!');
    } catch (err: any) {
      setMotivoError(err.message || 'Erro ao conectar com o servidor.');
    } finally {
      setMotivoLoading(false);
    }
  };

  const handleStartEditMotivo = (motivo: MotivoEstoque) => {
    setEditingMotivoId(motivo.id);
    setNovoMotivoNome(motivo.nome);
    setNovoMotivoTipo(motivo.tipo);
  };

  const handleDeleteMotivo = async (id: string) => {
    if (!window.confirm('Tem certeza que deseja excluir este motivo de estoque?')) return;
    try {
      const response = await fetch(`${API_URL}/motivos-estoque/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Erro ao excluir motivo.');
      alert('Motivo excluído com sucesso!');
      carregarMotivosEstoque();
    } catch (err: any) {
      alert(err.message || 'Erro ao excluir motivo.');
    }
  };

  const getAvailableStockByColorAndSize = (productId: string, colorName: string, size: string, initialStock: number = 0) => {
    const prodMovements = movements.filter(m => m.productId === productId && m.colorName === colorName && m.size === size);
    const totalEntradas = prodMovements.filter(m => m.type === 'ENTRADA').reduce((sum, m) => sum + m.quantity, 0);
    const totalSaidas = prodMovements.filter(m => m.type === 'SAIDA').reduce((sum, m) => sum + m.quantity, 0);
    return initialStock + totalEntradas - totalSaidas;
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const filesArray = Array.from(e.target.files);
    
    if (imageFiles.length + filesArray.length > 10) {
      alert('Máximo de 10 imagens por produto!');
      return;
    }

    setImageFiles(prev => [...prev, ...filesArray]);
    const newImageUrls = filesArray.map(file => URL.createObjectURL(file));
    setTempImages(prev => [...prev, ...newImageUrls]);
  };

  const removeImage = (index: number) => {
    setTempImages(tempImages.filter((_, i) => i !== index));
    setImageFiles(imageFiles.filter((_, i) => i !== index));
  };

  const handleColorToggle = (corId: string) => {
    if (selectedColors.includes(corId)) {
      setSelectedColors(selectedColors.filter(c => c !== corId));
    } else {
      setSelectedColors([...selectedColors, corId]);
    }
  };

  const handleToggleSizeForColor = (corId: string, tamanhoId: string) => {
    setColorSizeConfigs(prev => prev.map(config => {
      if (config.corId === corId) {
        const tamanhosAtuais = [...config.tamanhosIds];
        const index = tamanhosAtuais.indexOf(tamanhoId);
        const novosEstoques = { ...(config.estoques || {}) };

        if (index > -1) {
          tamanhosAtuais.splice(index, 1);
          delete novosEstoques[tamanhoId];
        } else {
          tamanhosAtuais.push(tamanhoId);
          if (!novosEstoques[tamanhoId]) {
            novosEstoques[tamanhoId] = '';
          }
        }
        return { ...config, tamanhosIds: tamanhosAtuais, estoques: novosEstoques };
      }
      return config;
    }));
  };

  const handleStockChangeForSize = (corId: string, tamanhoId: string, valor: string) => {
    setColorSizeConfigs(prev => prev.map(config => {
      if (config.corId === corId) {
        return {
          ...config,
          estoques: {
            ...(config.estoques || {}),
            [tamanhoId]: valor
          }
        };
      }
      return config;
    }));
  };

  const handleSelectAllSizesForColor = (corId: string) => {
    setColorSizeConfigs(prev => prev.map(config => {
      if (config.corId === corId) {
        const todosIds = tamanhosList.map(t => t.id);
        const novosEstoques = { ...(config.estoques || {}) };
        todosIds.forEach(id => {
          if (!novosEstoques[id]) novosEstoques[id] = '';
        });
        return { ...config, tamanhosIds: todosIds, estoques: novosEstoques };
      }
      return config;
    }));
  };

  const handleClearAllSizesForColor = (corId: string) => {
    setColorSizeConfigs(prev => prev.map(config => {
      if (config.corId === corId) {
        return { ...config, tamanhosIds: [], estoques: {} };
      }
      return config;
    }));
  };

  const handleExcluirCorConfig = (corId: string) => {
    setSelectedColors(selectedColors.filter(cId => cId !== corId));
    setColorSizeConfigs(colorSizeConfigs.filter(cfg => cfg.corId !== corId));
  };

  const handleStartEdit = (prod: ProductMaster) => {
    setEditingProductId(prod.id);
    setNewName(prod.name);
    setNewDesc(prod.description);
    setNewPrice(prod.originalPrice.toString());
    
    const catMatch = categoriasList.find(c => c.nome === prod.category);
    if (catMatch) {
      setNewCategoryId(catMatch.id);
    }

    const rawSizesAtivos = prod.rawSizes ? prod.rawSizes.filter((item: any) => item.ativo !== false) : [];

    const coresIds: string[] = rawSizesAtivos.length > 0 
      ? rawSizesAtivos.map(t => t.corId).filter((id): id is string => Boolean(id))
      : (prod.colors || []).map((c: any) => c.id).filter((id): id is string => Boolean(id));
    const uniqueColors = Array.from(new Set(coresIds));
    setSelectedColors(uniqueColors);

    if (rawSizesAtivos.length > 0) {
      const mapaConfig = new Map<string, string[]>();
      
      rawSizesAtivos.forEach((item: any) => {
        const cId = item.corId || item.cor?.id || '';
        const tId = item.tamanhoId;

        if (cId && tId) {
          if (!mapaConfig.has(cId)) {
            mapaConfig.set(cId, []);
          }
          const lista = mapaConfig.get(cId)!;
          if (!lista.includes(tId)) {
            lista.push(tId);
          }
        }
      });

      const configsCarregadas: ColorSizeConfig[] = [];
      mapaConfig.forEach((tamanhosIds, corId) => {
        configsCarregadas.push({ corId, tamanhosIds, estoques: {} });
      });
      setColorSizeConfigs(configsCarregadas);
    } else {
      setColorSizeConfigs([]);
    }

    setTempImages(prod.images);
    setImageFiles([]);
    setActiveTab('cadastro');
  };

  const handleCancelEdit = () => {
    setEditingProductId(null);
    setSelectedColors([]);
    setColorSizeConfigs([]);
    setTempImages([]);
    setImageFiles([]);
    setActiveTab('lista'); 
  };

  const handleCreateOrUpdateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName || !newPrice || !newCategoryId) {
      alert('Preencha o nome, preço e selecione uma categoria.');
      return;
    }
    
    const imagensAntigasMantidas = tempImages.filter(img => img.startsWith('http') || img.startsWith('/uploads/'));
    const totalImagensFinais = imagensAntigasMantidas.length + imageFiles.length;
    
    if (totalImagensFinais === 0) {
      alert('É necessário pelo menos 1 imagem para o produto.');
      return;
    }

    if (totalImagensFinais > 10) {
      alert('Um produto pode ter no máximo 10 imagens.');
      return;
    }

    if (selectedColors.length === 0) {
      alert('Selecione pelo menos uma cor/estampa para o produto.');
      return;
    }

    const arrayPlanoTamanhos: { tamanhoId: string; corId?: string; estoque: number }[] = [];
    const setCoresGeraisGeral = new Set<string>();

    const produtoAntigo = editingProductId ? products.find(p => p.id === editingProductId) : null;

    colorSizeConfigs.forEach(config => {
      setCoresGeraisGeral.add(config.corId);
      const tamanhosIds = config.tamanhosIds || [];
      const estoquesMap = config.estoques || {};
      
      if (tamanhosIds.length === 0) {
        const inputVal = estoquesMap[''] || '0';
        let qtdEstoque = parseInt(inputVal, 10);
        if (isNaN(qtdEstoque)) qtdEstoque = 0;

        if (editingProductId && produtoAntigo) {
          const itemExistente = produtoAntigo.rawSizes?.find(
            s => s.corId === config.corId && (!s.tamanhoId || s.tamanhoId === '')
          );
          
          if (itemExistente) {
            qtdEstoque = itemExistente.estoque ?? 0;
          }
        }

        arrayPlanoTamanhos.push({
          tamanhoId: '',
          corId: config.corId,
          estoque: qtdEstoque
        });
      } else {
        tamanhosIds.forEach(tamanhoId => {
          const inputVal = estoquesMap[tamanhoId] || '0';
          let qtdEstoque = parseInt(inputVal, 10);
          if (isNaN(qtdEstoque)) qtdEstoque = 0;

          if (editingProductId && produtoAntigo) {
            const itemExistente = produtoAntigo.rawSizes?.find(
              s => s.corId === config.corId && s.tamanhoId === tamanhoId
            );
            
            if (itemExistente) {
              qtdEstoque = itemExistente.estoque ?? 0;
            }
          }

          arrayPlanoTamanhos.push({
            tamanhoId: tamanhoId,
            corId: config.corId,
            estoque: qtdEstoque
          });
        });
      }
    });

    try {
      const formData = new FormData();
      formData.append('nome', newName);
      formData.append('preco', newPrice);
      formData.append('descricao', newDesc);
      formData.append('categoryId', newCategoryId);
      
      if (editingProductId) {
        formData.append('imagensMantidas', JSON.stringify(imagensAntigasMantidas));
      }
      
      formData.append('tamanhos', JSON.stringify(arrayPlanoTamanhos));

      formData.append('cores', JSON.stringify(
        Array.from(setCoresGeraisGeral).map(cId => ({
          corId: cId
        }))
      ));

      imageFiles.forEach(file => {
        formData.append('imagens', file);
      });

      const url = editingProductId ? `${API_URL}/produtos/${editingProductId}` : `${API_URL}/produtos`;
      const method = editingProductId ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method: method,
        body: formData,
        credentials: 'include',
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Erro ao salvar produto no servidor.');

      alert(editingProductId ? 'Produto atualizado com sucesso!' : 'Produto cadastrado com sucesso!');
      
      handleCancelEdit();
      carregarProdutos();
      setActiveTab('lista');
    } catch (err: any) {
      alert(err.message || 'Erro ao conectar com o servidor.');
    }
  };

  const matchedProductForOffer = products.find(p => p.id === searchOfferId);

  const filteredProducts = products.filter(prod => 
    prod.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    prod.category.toLowerCase().includes(searchTerm.toLowerCase()) ||
    prod.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
    prod.id.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredStockProducts = products.filter(prod => {
    const matchesSearch = stockSearchQuery.trim() === '' || 
      prod.name.toLowerCase().includes(stockSearchQuery.toLowerCase()) ||
      prod.id.toLowerCase().includes(stockSearchQuery.toLowerCase());

    if (!matchesSearch) return false;
    if (stockFilter === 'todos') return true;

    const rawList = prod.rawSizes || [];
    let temEsgotado = false;
    let temBaixo = false;

    if (rawList.length > 0) {
      rawList.forEach((item: any) => {
        const cName = item.cor?.nome || 'Padrão';
        const sName = item.tamanho?.nome || item.tamanhoId || 'Único';
        const baseEstoque = item.estoque ?? 0;
        const currentStockVal = getAvailableStockByColorAndSize(prod.id, cName, sName, baseEstoque);

        if (currentStockVal === 0) temEsgotado = true;
        if (currentStockVal > 0 && currentStockVal <= 3) temBaixo = true;
      });
    } else {
      prod.sizes.forEach(sz => {
        const currentStockVal = getAvailableStockByColorAndSize(prod.id, 'Padrão', sz, 0);
        if (currentStockVal === 0) temEsgotado = true;
        if (currentStockVal > 0 && currentStockVal <= 3) temBaixo = true;
      });
    }

    if (stockFilter === 'esgotado') return temEsgotado;
    if (stockFilter === 'baixo') return temBaixo;

    return true;
  });

  const filteredMovements = movements.filter(mov => {
    if (!historySearchQuery.trim()) return true;
    const query = historySearchQuery.toLowerCase();
    const produtoEncontrado = products.find(p => p.id === mov.productId);
    const nomeProduto = produtoEncontrado ? produtoEncontrado.name.toLowerCase() : '';
    const idProduto = mov.productId.toLowerCase();

    return nomeProduto.includes(query) || idProduto.includes(query);
  });

  const handleDeleteProductDirect = async (productId: string) => {
    const confirmacao = window.confirm('Tem certeza que deseja excluir este produto? Esta ação não pode ser desfeita.');
    if (!confirmacao) return;

    try {
      const response = await fetch(`${API_URL}/produtos/${productId}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Erro ao excluir o produto.');

      alert('Produto excluído com sucesso!');
      carregarProdutos();
    } catch (err: any) {
      alert(err.message || 'Erro ao conectar com o servidor para exclusão.');
    }
  };

  const handleCopyId = (id: string) => {
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => {
      setCopiedId(null);
    }, 1500);
  };    

  return (
    <div className={styles.adminContainer}>
      <div className={styles.mobileHeader}>
        <h2>Painel Admin</h2>
        <button className={styles.hamburgerBtn} onClick={() => setIsMenuOpen(true)}>☰</button>
      </div>

      {isMenuOpen && <div className={styles.sidebarOverlay} onClick={() => setIsMenuOpen(false)} />}

      <aside className={`${styles.sidebar} ${isMenuOpen ? styles.sidebarOpen : ''}`}>
        <h2>Painel Admin</h2>
        <nav>
          <div className={`${styles.navItem} ${activeTab === 'dashboard' ? styles.active : ''}`} onClick={() => { setActiveTab('dashboard'); setIsMenuOpen(false); }}>📊 Dashboard</div>
          <div 
            className={`${styles.navItem} ${activeTab === 'cadastro' && !editingProductId ? styles.active : ''}`} 
            onClick={() => { 
              setEditingProductId(null);
              setSelectedColors([]);
              setColorSizeConfigs([]);
              setTempImages([]);
              setImageFiles([]);
              setNewName('');
              setNewDesc('');
              setNewPrice('');
              setActiveTab('cadastro'); 
              setIsMenuOpen(false); 
            }}
          >
            ➕ Cadastrar Produto
          </div>
          <div className={`${styles.navItem} ${activeTab === 'categorias' ? styles.active : ''}`} onClick={() => { setActiveTab('categorias'); setIsMenuOpen(false); }}>📂 Gerenciar Categorias</div>
          <div className={`${styles.navItem} ${activeTab === 'tamanhos' ? styles.active : ''}`} onClick={() => { setActiveTab('tamanhos'); setIsMenuOpen(false); }}>📏 Gerenciar Tamanhos</div>
          <div className={`${styles.navItem} ${activeTab === 'cores' ? styles.active : ''}`} onClick={() => { setActiveTab('cores'); setIsMenuOpen(false); }}>🎨 Gerenciar Cores</div>
          <div className={`${styles.navItem} ${activeTab === 'motivos' ? styles.active : ''}`} onClick={() => { setActiveTab('motivos'); setIsMenuOpen(false); }}>📝 Gerenciar Motivos</div>
          <div className={`${styles.navItem} ${activeTab === 'oferta' ? styles.active : ''}`} onClick={() => { setActiveTab('oferta'); setIsMenuOpen(false); }}>🏷️ Configurar Oferta</div>
          <div className={`${styles.navItem} ${activeTab === 'lista' ? styles.active : ''}`} onClick={() => { setActiveTab('lista'); setIsMenuOpen(false); }}>📋 Lista & Vitrine ({products.length})</div>
          <div className={`${styles.navItem} ${activeTab === 'estoque' ? styles.active : ''}`} onClick={() => { setActiveTab('estoque'); setIsMenuOpen(false); }}>📦 Controle de Estoque</div>
          <div className={`${styles.navItem} ${activeTab === 'historico-estoque' ? styles.active : ''}`} onClick={() => { setActiveTab('historico-estoque'); setIsMenuOpen(false); }}>📜 Histórico de Estoque</div>
        </nav>
      </aside>

      <main className={styles.mainContent}>
        
        {activeTab === 'dashboard' && (
          <div className={styles.singleContainer}>
            <section className={styles.card}>
              <div className={styles.headerBetween}>
                <h3>Dashboard de Estoque</h3>
                <button type="button" onClick={carregarDashboard} className={styles.btnSecondary} disabled={dashboardLoading}>
                  {dashboardLoading ? 'Atualizando...' : '🔄 Atualizar Dados'}
                </button>
              </div>
              <p className={styles.infoText}>Visão geral dos indicadores e últimas movimentações do estoque.</p>

              {dashboardLoading && !dashboardData ? (
                <p className={styles.emptyNotice}>Carregando dados do dashboard...</p>
              ) : dashboardData ? (
                <>
                  {/* CARDS DE INDICADORES */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', margin: '20px 0' }}>
                    <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                      <p style={{ fontSize: '0.85rem', color: '#64748b', margin: 0 }}>Produtos Ativos</p>
                      <p style={{ fontSize: '1.8rem', fontWeight: 'bold', color: '#1e293b', margin: '8px 0 0 0' }}>{dashboardData.cards.totalProdutosAtivos}</p>
                    </div>

                    <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                      <p style={{ fontSize: '0.85rem', color: '#64748b', margin: 0 }}>Volume Total em Estoque</p>
                      <p style={{ fontSize: '1.8rem', fontWeight: 'bold', color: '#2563eb', margin: '8px 0 0 0' }}>{dashboardData.cards.quantidadeFisicaTotal}</p>
                    </div>

                    <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                      <p style={{ fontSize: '0.85rem', color: '#64748b', margin: 0 }}>Entradas (Este Mês)</p>
                      <p style={{ fontSize: '1.8rem', fontWeight: 'bold', color: '#059669', margin: '8px 0 0 0' }}>+{dashboardData.cards.entradasNoMes}</p>
                    </div>

                    <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                      <p style={{ fontSize: '0.85rem', color: '#64748b', margin: 0 }}>Saídas (Este Mês)</p>
                      <p style={{ fontSize: '1.8rem', fontWeight: 'bold', color: '#dc2626', margin: '8px 0 0 0' }}>-{dashboardData.cards.saidasNoMes}</p>
                    </div>
                  </div>

                  {/* TABELA DE ÚLTIMAS MOVIMENTAÇÕES */}
                  <div style={{ marginTop: '30px' }}>
                    <h4 className={styles.listSubheading}>Últimas Movimentações</h4>
                    {dashboardData.ultimasMovimentacoes.length === 0 ? (
                      <p className={styles.emptyNotice}>Nenhuma movimentação registrada recentemente.</p>
                    ) : (
                      <div style={{ overflowX: 'auto', marginTop: '10px' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', textAlign: 'left' }}>
                          <thead>
                            <tr style={{ borderBottom: '2px solid #cbd5e1', color: '#475569' }}>
                              <th style={{ padding: '8px' }}>Data</th>
                              <th style={{ padding: '8px' }}>Produto</th>
                              <th style={{ padding: '8px' }}>Variação (Cor / Tam)</th>
                              <th style={{ padding: '8px' }}>Tipo</th>
                              <th style={{ padding: '8px' }}>Qtd</th>
                              <th style={{ padding: '8px' }}>Motivo</th>
                            </tr>
                          </thead>
                          <tbody>
                            {dashboardData.ultimasMovimentacoes.map((item) => (
                              <tr key={item.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                                <td style={{ padding: '8px', color: '#64748b' }}>
                                  {new Date(item.data).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                </td>
                                <td style={{ padding: '8px', fontWeight: 600, color: '#1e293b' }}>
                                  {item.produto?.nome || item.produto?.name || 'Produto'}
                                </td>
                                <td style={{ padding: '8px', color: '#334155' }}>
                                  {item.corNome} / {item.tamanho}
                                </td>
                                <td style={{ padding: '8px' }}>
                                  <span style={{
                                    padding: '2px 8px',
                                    borderRadius: '4px',
                                    fontSize: '0.75rem',
                                    fontWeight: 'bold',
                                    background: item.tipo === 'ENTRADA' ? '#d1fae5' : '#fee2e2',
                                    color: item.tipo === 'ENTRADA' ? '#065f46' : '#991b1b'
                                  }}>
                                    {item.tipo}
                                  </span>
                                </td>
                                <td style={{ padding: '8px', fontWeight: 'bold', color: item.tipo === 'ENTRADA' ? '#059669' : '#dc2626' }}>
                                  {item.tipo === 'ENTRADA' ? `+${item.quantidade}` : `-${item.quantidade}`}
                                </td>
                                <td style={{ padding: '8px', color: '#475569' }}>{item.motivo?.nome || '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <p className={styles.emptyNotice} style={{ color: '#dc2626' }}>Erro ao carregar dados do dashboard.</p>
              )}
            </section>
          </div>
        )}

        {activeTab === 'cadastro' && (
          <div className={styles.singleContainer}>
            <section className={styles.card}>
              <div className={styles.headerBetween}>
                <h3>{editingProductId ? 'Editar Produto' : 'Cadastro de Novo Produto'}</h3>
                {editingProductId && (
                  <button type="button" onClick={handleCancelEdit} className={styles.btnSecondary}>
                    Cancelar
                  </button>
                )}
              </div>
              <p className={styles.infoText}>* Preencha os campos abaixo para salvar o produto diretamente no banco de dados.</p>
              
              <form onSubmit={handleCreateOrUpdateProduct} className={styles.form}>
                <div className={styles.gridContainerPrice}>
                  <div className={styles.group}>
                    <label>Nome do Produto (Até 100 caracteres)</label>
                    <input type="text" maxLength={100} value={newName} onChange={e => setNewName(e.target.value)} placeholder="Ex: Body Algodão Estampado" required />
                  </div>
                  <div className={styles.group}>
                    <label>Preço Original (R$)</label>
                    <input type="number" value={newPrice} onChange={e => setNewPrice(e.target.value)} placeholder="0.00" step="0.01" required />
                  </div>
                </div>

                <div className={styles.group}>
                  <label>Categoria</label>
                  <select value={newCategoryId} onChange={e => setNewCategoryId(e.target.value)} required>
                    <option value="">Selecione uma categoria...</option>
                    {categoriasList.map(cat => <option key={cat.id} value={cat.id}>{cat.nome}</option>)}
                  </select>
                </div>

                <div className={styles.group}>
                  <label>1. Selecione as Cores / Estampas Disponíveis</label>
                  <div className={styles.sizesGrid}>
                    {coresList.length === 0 ? (
                      <p className={styles.emptyNotice}>Nenhuma cor cadastrada. Vá na aba "Gerenciar Cores" primeiro.</p>
                    ) : (
                      coresList.map(cor => (
                        <label key={cor.id} className={styles.sizeCheckboxLabel}>
                          <input 
                            type="checkbox" 
                            checked={selectedColors.includes(cor.id)} 
                            onChange={() => handleColorToggle(cor.id)} 
                          />
                          {cor.hex && (
                            <span 
                              className={styles.colorDotIndicator}
                              style={{ backgroundColor: cor.hex }}
                            ></span>
                          )}
                          {cor.nome}
                        </label>
                      ))
                    )}
                  </div>
                </div>

                {selectedColors.length > 0 && (
                  <div className={styles.colorStockConfigCard}>
                    <label className={styles.colorStockTitle}>
                      2. Marcar Tamanhos por Cor/Estampa
                    </label>
                    <p className={styles.colorStockSubtitle}>
                      Para cada cor escolhida acima, selecione os tamanhos disponíveis.
                    </p>
                    
                    <div className={styles.colorStockList}>
                      {selectedColors.map(cId => {
                        const corObj = coresList.find(c => c.id === cId);
                        const configCurrent = colorSizeConfigs.find(c => c.corId === cId) || { corId: cId, tamanhosIds: [], estoques: {} };
                        const nenhumTamanhoSelecionado = configCurrent.tamanhosIds.length === 0;
                        
                        return (
                          <div key={cId} className={styles.colorStockItem}>
                            <div className={styles.colorStockHeader}>
                              <div className={styles.colorStockHeaderLeft}>
                                {corObj?.hex && (
                                  <span 
                                    className={styles.colorDotIndicatorLarge}
                                    style={{ backgroundColor: corObj.hex }}
                                  ></span>
                                )}
                                <strong className={styles.colorNameLabel}>
                                  🎨 Cor: {corObj?.nome || cId}
                                </strong>
                              </div>
                              <div className={styles.colorActionButtonsGroup}>
                                <button 
                                  type="button" 
                                  onClick={() => handleSelectAllSizesForColor(cId)}
                                  className={styles.btnSmallAction}
                                >
                                  Marcar Todos
                                </button>
                                <button 
                                  type="button" 
                                  onClick={() => handleClearAllSizesForColor(cId)}
                                  className={styles.btnSmallActionDanger}
                                >
                                  Desmarcar Todos
                                </button>
                                
                                {nenhumTamanhoSelecionado && (
                                  <button 
                                    type="button" 
                                    onClick={() => handleExcluirCorConfig(cId)}
                                    className={styles.btnSmallActionDanger}
                                    style={{ backgroundColor: '#dc2626', color: '#fff' }}
                                    title="Excluir esta cor por não ter tamanhos selecionados"
                                  >
                                    🗑️ Excluir Cor
                                  </button>
                                )}
                              </div>
                            </div>

                            {tamanhosList.length === 0 ? (
                              <p className={styles.emptyNotice}>Nenhum tamanho cadastrado no sistema.</p>
                            ) : (
                              <div className={styles.sizeConfigGrid}>
                                {tamanhosList.map(tam => {
                                  const isChecked = configCurrent.tamanhosIds.includes(tam.id);
                                  const estoqueValor = configCurrent.estoques?.[tam.id] || '';

                                  const produtoOriginal = editingProductId ? products.find(p => p.id === editingProductId) : null;
                                  const itemJaExistia = produtoOriginal?.rawSizes?.some(
                                    s => s.corId === cId && s.tamanhoId === tam.id
                                  );

                                  return (
                                    <div 
                                      key={tam.id} 
                                      className={`${styles.sizeConfigBox} ${isChecked ? styles.sizeBoxChecked : styles.sizeBoxUnchecked}`}
                                    >
                                      <div className={styles.sizeCheckboxRow}>
                                        <label className={styles.sizeInnerLabel}>
                                          <input 
                                            type="checkbox" 
                                            checked={isChecked}
                                            onChange={() => handleToggleSizeForColor(cId, tam.id)}
                                          />
                                          📐 Tamanho: {tam.nome}
                                        </label>
                                      </div>

                                      {isChecked && (!editingProductId || !itemJaExistia) && (
                                        <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                          <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#475569' }}>
                                            Estoque Inicial (Novo Item):
                                          </label>
                                          <input 
                                            type="number" 
                                            min="0"
                                            placeholder="0"
                                            value={estoqueValor}
                                            onChange={(e) => handleStockChangeForSize(cId, tam.id, e.target.value)}
                                            style={{ padding: '4px 8px', fontSize: '0.85rem', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                                          />
                                        </div>
                                      )}

                                      {isChecked && editingProductId && itemJaExistia && (
                                        <div style={{ marginTop: '6px', fontSize: '0.7rem', color: '#059669', fontStyle: 'italic' }}>
                                          ✓ Item existente (Estoque preservado)
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className={styles.group}>
                  <label className={styles.fileLabel}>
                    📂 Escolher Fotos Locais ({tempImages.length}/10)
                    <input type="file" multiple accept="image/*" onChange={handleFileChange} className={styles.fileInput} />
                  </label>
                  {tempImages.length > 0 && (
                    <div className={styles.imagesPreviewList}>
                      {tempImages.map((img, index) => (
                        <div key={index} className={styles.previewThumbContainer}>
                          <img src={img} alt="" className={styles.imageThumb} />
                          <button type="button" onClick={() => removeImage(index)} className={styles.btnRemoveThumb}>×</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className={styles.group}>
                  <label>Descrição</label>
                  <textarea value={newDesc} onChange={e => setNewDesc(e.target.value)} rows={3} placeholder="Detalhes do tecido, composição..." />
                </div>

                <button type="submit" className={styles.btnPrimary}>
                  {editingProductId ? 'Salvar Alterações' : 'Cadastrar produto'}
                </button>
              </form>
            </section>
          </div>
        )}

        {activeTab === 'categorias' && (
          <div className={styles.singleContainer}>
            <section className={styles.card}>
              <div className={styles.headerBetween}>
                <h3>{editingCategoriaId ? 'Editar Categoria' : 'Gerenciar Categorias'}</h3>
                {editingCategoriaId && (
                  <button type="button" onClick={() => { setEditingCategoriaId(null); setNovaCategoriaNome(''); }} className={styles.btnSecondary}>
                    Cancelar Edição
                  </button>
                )}
              </div>
              <p className={styles.infoText}>Cadastre novas categorias para organizar os produtos no backend ou edite/exclua as existentes.</p>
              
              {categoriaError && <div className={styles.errorTextNotice}>{categoriaError}</div>}

              <form onSubmit={handleSaveCategoria} className={styles.form}>
                <div className={styles.group}>
                  <label>Nome da Categoria</label>
                  <input 
                    type="text" 
                    value={novaCategoriaNome} 
                    onChange={e => setNovaCategoriaNome(e.target.value)} 
                    placeholder="Ex: Vestidos ou Calçados" 
                    required 
                  />
                  <small className={styles.slugPreviewText}>
                    Slug gerado: <b>{novaCategoriaNome ? gerarSlug(novaCategoriaNome) : '...'}</b>
                  </small>
                </div>

                <button type="submit" className={styles.btnPrimary} disabled={categoriaLoading}>
                  {categoriaLoading ? 'Salvando...' : editingCategoriaId ? 'Atualizar Categoria' : 'Adicionar Categoria'}
                </button>
              </form>

              <div className={styles.listSectionWrapper}>
                <h4 className={styles.listSubheading}>Categorias Cadastradas</h4>
                {categoriasList.length === 0 ? (
                  <p className={styles.emptyNotice}>Nenhuma categoria cadastrada ainda.</p>
                ) : (
                  <ul className={styles.simpleDataList}>
                    {categoriasList.map(cat => (
                      <li key={cat.id} className={styles.simpleDataListItem} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <span><strong>{cat.nome}</strong></span>
                          <code className={styles.slugCodeBadge} style={{ marginLeft: '10px' }}>slug: {cat.slug}</code>
                        </div>
                        <div className={styles.cardActions} style={{ display: 'flex', gap: '8px' }}>
                          <button type="button" onClick={() => handleStartEditCategoria(cat)} className={styles.btnEditTable}>
                            ✏️ Editar
                          </button>
                          <button type="button" onClick={() => handleDeleteCategoria(cat.id)} className={styles.btnDeleteTable}>
                            🗑️ Excluir
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>
          </div>
        )}

        {activeTab === 'tamanhos' && (
          <div className={styles.singleContainer}>
            <section className={styles.card}>
              <div className={styles.headerBetween}>
                <h3>{editingTamanhoId ? 'Editar Tamanho' : 'Gerenciar Tamanhos'}</h3>
                {editingTamanhoId && (
                  <button type="button" onClick={() => { setEditingTamanhoId(null); setNovoTamanhoNome(''); }} className={styles.btnSecondary}>
                    Cancelar Edição
                  </button>
                )}
              </div>
              <p className={styles.infoText}>Cadastre variações de tamanhos (ex: P, M, G, 1 ano, 2 anos) ou edite/exclua existentes.</p>
              
              {tamanhoError && <div className={styles.errorTextNotice}>{tamanhoError}</div>}

              <form onSubmit={handleSaveTamanho} className={styles.form}>
                <div className={styles.group}>
                  <label>Nome do Tamanho</label>
                  <input 
                    type="text" 
                    value={novoTamanhoNome} 
                    onChange={e => setNovoTamanhoNome(e.target.value)} 
                    placeholder="Ex: 1 ano ou P" 
                    required 
                  />
                  <small className={styles.slugPreviewText}>
                    Slug gerado: <b>{novoTamanhoNome ? gerarSlug(novoTamanhoNome) : '...'}</b>
                  </small>
                </div>

                <button type="submit" className={styles.btnPrimary} disabled={tamanhoLoading}>
                  {tamanhoLoading ? 'Salvando...' : editingTamanhoId ? 'Atualizar Tamanho' : 'Adicionar Tamanho'}
                </button>
              </form>

              <div className={styles.listSectionWrapper}>
                <h4 className={styles.listSubheading}>Tamanhos Cadastrados</h4>
                {tamanhosList.length === 0 ? (
                  <p className={styles.emptyNotice}>Nenhum tamanho cadastrado ainda.</p>
                ) : (
                  <ul className={styles.simpleDataList}>
                    {tamanhosList.map(tam => (
                      <li key={tam.id} className={styles.simpleDataListItem} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <span><strong>{tam.nome}</strong></span>
                          <code className={styles.slugCodeBadge} style={{ marginLeft: '10px' }}>slug: {tam.slug}</code>
                        </div>
                        <div className={styles.cardActions} style={{ display: 'flex', gap: '8px' }}>
                          <button type="button" onClick={() => handleStartEditTamanho(tam)} className={styles.btnEditTable}>
                            ✏️ Editar
                          </button>
                          <button type="button" onClick={() => handleDeleteTamanho(tam.id)} className={styles.btnDeleteTable}>
                            🗑️ Excluir
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>
          </div>
        )}

        {activeTab === 'cores' && (
          <div className={styles.singleContainer}>
            <section className={styles.card}>
              <div className={styles.headerBetween}>
                <h3>{editingCorId ? 'Editar Cor' : 'Gerenciar Cores'}</h3>
                {editingCorId && (
                  <button type="button" onClick={() => { setEditingCorId(null); setNovaCorNome(''); setNovaCorHex('#000000'); }} className={styles.btnSecondary}>
                    Cancelar Edição
                  </button>
                )}
              </div>
              <p className={styles.infoText}>Cadastre as opções de cores disponíveis para os produtos ou edite/exclua existentes.</p>
              
              {corError && <div className={styles.errorTextNotice}>{corError}</div>}

              <form onSubmit={handleSaveCor} className={styles.form}>
                <div className={styles.group}>
                  <label>Nome da Cor</label>
                  <input 
                    type="text" 
                    value={novaCorNome} 
                    onChange={e => setNovaCorNome(e.target.value)} 
                    placeholder="Ex: Rosa Bebê ou Azul Marinho" 
                    required 
                  />
                </div>

                <div className={styles.group}>
                  <label>Cor de Referência (HEX)</label>
                  <div className={styles.colorPickerRow}>
                    <input 
                      type="color" 
                      value={novaCorHex} 
                      onChange={e => setNovaCorHex(e.target.value)} 
                      className={styles.colorPickerNative}
                    />
                    <input 
                      type="text" 
                      value={novaCorHex} 
                      onChange={e => setNovaCorHex(e.target.value)} 
                      placeholder="#000000" 
                    />
                  </div>
                  <small className={styles.slugPreviewText}>
                    Slug gerado: <b>{novaCorNome ? gerarSlug(novaCorNome) : '...'}</b>
                  </small>
                </div>

                <button type="submit" className={styles.btnPrimary} disabled={corLoading}>
                  {corLoading ? 'Salvando...' : editingCorId ? 'Atualizar Cor' : 'Adicionar Cor'}
                </button>
              </form>

              <div className={styles.listSectionWrapper}>
                <h4 className={styles.listSubheading}>Cores Cadastradas</h4>
                {coresList.length === 0 ? (
                  <p className={styles.emptyNotice}>Nenhuma cor cadastrada ainda.</p>
                ) : (
                  <ul className={styles.simpleDataList}>
                    {coresList.map(cor => (
                      <li key={cor.id} className={styles.simpleDataListItem} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div className={styles.colorItemLeft}>
                          {cor.hex && (
                            <span 
                              className={styles.colorDotIndicator}
                              style={{ backgroundColor: cor.hex }}
                            ></span>
                          )}
                          <span><strong>{cor.nome}</strong></span>
                          <code className={styles.slugCodeBadge} style={{ marginLeft: '10px' }}>slug: {cor.slug}</code>
                        </div>
                        <div className={styles.cardActions} style={{ display: 'flex', gap: '8px' }}>
                          <button type="button" onClick={() => handleStartEditCor(cor)} className={styles.btnEditTable}>
                            ✏️ Editar
                          </button>
                          <button type="button" onClick={() => handleDeleteCor(cor.id)} className={styles.btnDeleteTable}>
                            🗑️ Excluir
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>
          </div>
        )}

        {activeTab === 'motivos' && (
          <div className={styles.singleContainer}>
            <section className={styles.card}>
              <div className={styles.headerBetween}>
                <h3>{editingMotivoId ? 'Editar Motivo de Estoque' : 'Gerenciar Motivos de Estoque'}</h3>
                {editingMotivoId && (
                  <button type="button" onClick={() => { setEditingMotivoId(null); setNovoMotivoNome(''); setNovoMotivoTipo('ENTRADA'); }} className={styles.btnSecondary}>
                    Cancelar Edição
                  </button>
                )}
              </div>
              <p className={styles.infoText}>Cadastre os motivos exibidos no controle de estoque e consulte abaixo o guia de referência rápida.</p>
              
              {motivoError && <div className={styles.errorTextNotice}>{motivoError}</div>}

              <form onSubmit={handleSaveMotivo} className={styles.form}>
                <div className={styles.group}>
                  <label>Nome do Motivo</label>
                  <input 
                    type="text" 
                    value={novoMotivoNome} 
                    onChange={e => setNovoMotivoNome(e.target.value)} 
                    placeholder="Ex: Compra de Fornecedor ou Venda" 
                    required 
                  />
                </div>

                <div className={styles.group}>
                  <label>Tipo de Movimentação</label>
                  <select 
                    value={novoMotivoTipo} 
                    onChange={e => setNovoMotivoTipo(e.target.value as 'ENTRADA' | 'SAIDA')} 
                    required
                  >
                    <option value="ENTRADA">Entrada</option>
                    <option value="SAIDA">Saída</option>
                  </select>
                </div>

                <button type="submit" className={styles.btnPrimary} disabled={motivoLoading}>
                  {motivoLoading ? 'Salvando...' : editingMotivoId ? 'Atualizar Motivo' : 'Adicionar Motivo'}
                </button>
              </form>

              {/* GUIA DE REFERÊNCIA DE MOTIVOS */}
              <div style={{ marginTop: '30px', borderTop: '2px dashed #cbd5e1', paddingTop: '20px' }}>
                <h4 style={{ fontSize: '1rem', color: '#1e293b', marginBottom: '14px' }}>📖 Guia de Referência dos Motivos de Estoque</h4>
                
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
                  
                  {/* Bloco Entradas */}
                  <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                    <h5 style={{ color: '#059669', fontSize: '0.95rem', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      📥 Motivos para Entrada de Estoque
                    </h5>
                    <ul style={{ paddingLeft: '16px', fontSize: '0.8rem', color: '#475569', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      <li><strong>Compra de Fornecedores / Reposição:</strong> Recebimento de novos lotes de mercadorias adquiridas de fabricantes ou fornecedores para reabastecer a vitrine.</li>
                      <li><strong>Devolução de Clientes:</strong> Retorno de um produto enviado ao cliente (por desistência, defeito ou troca de tamanho/cor) que retorna em condições de ser recomercializado.</li>
                      <li><strong>Estorno ou Cancelamento de Pedido:</strong> Retorno físico de itens cujos pedidos foram cancelados antes da expedição definitiva ou que voltaram da transportadora.</li>
                      <li><strong>Ajuste de Inventário (Sobra):</strong> Correção positiva após uma contagem física (inventário) que identificou produtos fisicamente disponíveis além do que constava no sistema.</li>
                      <li><strong>Brindes ou Amostras Recebidas:</strong> Entrada de itens promocionais ou brindes enviados por fornecedores para acompanhamento de vendas.</li>
                      <li><strong>Produção Própria / Fabricação:</strong> Adição de produtos recém-confeccionados ou manufaturados internamente (comum em marcas próprias ou artesanato).</li>
                    </ul>
                  </div>

                  {/* Bloco Saídas */}
                  <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                    <h5 style={{ color: '#dc2626', fontSize: '0.95rem', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      📤 Motivos para Saída de Estoque
                    </h5>
                    <ul style={{ paddingLeft: '16px', fontSize: '0.8rem', color: '#475569', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      <li><strong>Vendas Realizadas:</strong> Baixa automática gerada pela finalização de um pedido no e-commerce (geralmente integrada ao gateway de pagamento ou emissão de nota fiscal).</li>
                      <li><strong>Trocas e Garantias:</strong> Saída de um produto novo enviado para substituir outro com defeito ou trocado pelo cliente.</li>
                      <li><strong>Avarias e Danos:</strong> Produtos que sofreram danos no armazém (queda, vazamento, umidade, pragas) e tornaram-se imprestáveis para venda.</li>
                      <li><strong>Perdas e Extravios:</strong> Mercadorias furtadas, extraviadas dentro do centro de distribuição ou perdidas por transportadoras.</li>
                      <li><strong>Ajuste de Inventário (Falta):</strong> Baixa corretiva após uma auditoria física que detectou divergência (quebra de estoque ou furto interno/externo).</li>
                      <li><strong>Uso Interno / Brindes / Marketing:</strong> Retirada de itens para envio de assessoria de imprensa, influenciadores, ações promocionais, brindes ou uso pela própria equipe.</li>
                    </ul>
                  </div>

                </div>
              </div>

              <div className={styles.listSectionWrapper} style={{ marginTop: '30px' }}>
                <h4 className={styles.listSubheading}>Motivos Cadastrados no Sistema</h4>
                {motivosEstoqueList.length === 0 ? (
                  <p className={styles.emptyNotice}>Nenhum motivo cadastrado ainda.</p>
                ) : (
                  <ul className={styles.simpleDataList}>
                    {motivosEstoqueList.map(motivo => (
                      <li key={motivo.id} className={styles.simpleDataListItem} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <span style={{
                            padding: '2px 8px',
                            borderRadius: '4px',
                            fontSize: '0.7rem',
                            fontWeight: 'bold',
                            background: motivo.tipo === 'ENTRADA' ? '#d1fae5' : '#fee2e2',
                            color: motivo.tipo === 'ENTRADA' ? '#065f46' : '#991b1b'
                          }}>
                            {motivo.tipo}
                          </span>
                          <span><strong>{motivo.nome}</strong></span>
                        </div>
                        <div className={styles.cardActions} style={{ display: 'flex', gap: '8px' }}>
                          <button type="button" onClick={() => handleStartEditMotivo(motivo)} className={styles.btnEditTable}>
                            ✏️ Editar
                          </button>
                          <button type="button" onClick={() => handleDeleteMotivo(motivo.id)} className={styles.btnDeleteTable}>
                            🗑️ Excluir
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>
          </div>
        )}

        {activeTab === 'oferta' && (
          <div className={styles.singleContainer}>
            <section className={styles.card}>
              <h3>Configurar Oferta Comercial</h3>
              <form onSubmit={(e) => {
                e.preventDefault();
                if (!matchedProductForOffer || !promoPrice) return;
                setProducts(products.map(p => p.id === matchedProductForOffer.id ? { ...p, offerPrice: Number(promoPrice), hasOffer: true } : p));
                setSearchOfferId(''); setPromoPrice(''); alert('Oferta salva!'); setActiveTab('lista');
              }} className={styles.form}>
                <div className={styles.group}>
                  <label>Digite o ID do Produto (UUID)</label>
                  <input type="text" value={searchOfferId} onChange={e => setSearchOfferId(e.target.value)} placeholder="Cole o ID do produto aqui..." required />
                </div>
                {searchOfferId.length > 5 && (
                  <div className={styles.searchFeedbackBox}>
                    {matchedProductForOffer ? (
                      <div className={styles.productMatchDetail}>
                        <img src={matchedProductForOffer.images[0]} alt="" className={styles.matchThumb} />
                        <div>
                          <p className={styles.matchName}><strong>{matchedProductForOffer.name}</strong></p>
                          <p className={styles.matchPrice}>Tabela: R$ {matchedProductForOffer.originalPrice.toFixed(2)}</p>
                        </div>
                      </div>
                    ) : (
                      <p className={styles.matchError}>❌ ID não localizado.</p>
                    )}
                  </div>
                )}
                <div className={styles.group}>
                  <label>Preço Promocional (R$)</label>
                  <input type="number" value={promoPrice} onChange={e => setPromoPrice(e.target.value)} placeholder="0.00" step="0.01" disabled={!matchedProductForOffer} required />
                </div>
                <button type="submit" className={styles.btnSuccess} disabled={!matchedProductForOffer}>Ativar Preço Promocional</button>
              </form>
            </section>
          </div>
        )}

        {activeTab === 'lista' && (
          <div className={styles.singleContainer}>
            <div className={styles.searchSection}>
              <input type="text" className={styles.searchInput} placeholder="🔍 Buscar por nome, categoria, descrição ou ID..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
            </div>
            <section className={styles.card}>
              <h3>Vitrine de Controle Comercial</h3>
              <div className={styles.catalogGrid}>
                {filteredProducts.map(prod => (
                  <div 
                    key={prod.id} 
                    className={`${styles.catalogCard} ${!prod.isVisible ? styles.cardHidden : ''}`}
                    onClick={() => {
                      setSelectedProductDetails(prod);
                      setActiveImageIndex(0);
                      const primeiraCorId = prod.colors?.[0]?.id || prod.rawSizes?.find(s => s.corId)?.corId || null;
                      setSelectedColorForDetails(primeiraCorId);
                    }}
                  >
                    <div className={styles.carouselContainer}>
                      <img src={prod.images[0]} alt="" className={styles.catalogCardImage} />
                    </div>
                    <div className={styles.catalogCardInfo}>
                      <span className={styles.badgeCategory}>{prod.category}</span>
                      <h4>{prod.name}</h4>
          
                      <div className={styles.priceDisplayArea}>
                        {prod.hasOffer ? (
                          <div className={styles.priceContainer}>
                            <span className={styles.oldPrice}>De: R$ {prod.originalPrice.toFixed(2)}</span>
                            <span className={styles.newPrice}>Por: R$ {prod.offerPrice.toFixed(2)}</span>
                          </div>
                        ) : (
                          <span className={styles.normalPrice}>R$ {prod.originalPrice.toFixed(2)}</span>
                        )}
                      </div>
                      
                      <div className={styles.controlsRow} onClick={(e) => e.stopPropagation()}>
                        <label className={styles.toggleLabel}>
                          <input type="checkbox" checked={prod.isVisible} onChange={() => setProducts(products.map(p => p.id === prod.id ? { ...p, isVisible: !p.isVisible } : p))} />
                          {prod.isVisible ? '🟢 Visível' : '🔴 Oculto'}
                        </label>

                        <button 
                          type="button"
                          onClick={() => handleCopyId(prod.id)}
                          className={styles.idCopyButton}
                          title={`Copiar ID completo: ${prod.id}`}
                        >
                          {copiedId === prod.id ? '✅ ID Copiado!' : `📋 ID: ${prod.id.slice(0, 6)}...`}
                        </button>
                      
                        <div className={styles.cardActions}>
                          <button 
                            type="button" 
                            onClick={() => handleStartEdit(prod)}
                            className={styles.btnEditTable}
                          >
                            ✏️ Editar
                          </button>

                          <button 
                            type="button" 
                            onClick={() => handleDeleteProductDirect(prod.id)}
                            className={styles.btnDeleteTable}
                          >
                            🗑️ Excluir
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {selectedProductDetails && (
              <div className={styles.modalOverlay} onClick={() => setSelectedProductDetails(null)}>
                <div className={styles.modalContentBox} onClick={(e) => e.stopPropagation()}>
                  
                  <button 
                    onClick={() => setSelectedProductDetails(null)}
                    className={styles.modalCloseButton}
                  >
                    ✕
                  </button>

                  <div className={styles.modalGridContainer}>
                    <div>
                      <img 
                        src={selectedProductDetails.images[activeImageIndex] || selectedProductDetails.images[0]} 
                        alt={selectedProductDetails.name} 
                        className={styles.modalMainImage} 
                      />
                      {selectedProductDetails.images.length > 1 && (
                        <div className={styles.modalThumbnailsList}>
                          {selectedProductDetails.images.map((img, idx) => {
                            const isSelectedThumb = activeImageIndex === idx;
                            return (
                              <img 
                                key={idx} 
                                src={img} 
                                alt="" 
                                onClick={() => setActiveImageIndex(idx)}
                                className={`${styles.modalThumbItem} ${isSelectedThumb ? styles.modalThumbActive : styles.modalThumbInactive}`} 
                              />
                            );
                          })}
                        </div>
                      )}
                    </div>

                    <div>
                      <span className={styles.modalCategoryBadge}>
                        {selectedProductDetails.category}
                      </span>
                      <h2 className={styles.modalProductTitle}>{selectedProductDetails.name}</h2>
                      
                      <div className={styles.modalPriceBlock}>
                        {selectedProductDetails.hasOffer ? (
                          <div className={styles.modalOfferFlex}>
                            <span className={styles.modalOldPrice}>R$ {selectedProductDetails.originalPrice.toFixed(2)}</span>
                            <span className={styles.modalNewPrice}>R$ {selectedProductDetails.offerPrice.toFixed(2)}</span>
                          </div>
                        ) : (
                          <span className={styles.modalNormalPrice}>R$ {selectedProductDetails.originalPrice.toFixed(2)}</span>
                        )}
                      </div>

                      <p className={styles.modalDescriptionText}>
                        {selectedProductDetails.description || 'Nenhuma descrição informada.'}
                      </p>

                      <div className={styles.modalSectionGroup}>
                        <label className={styles.modalSectionLabel}>
                          🎨 Escolha a Cor / Estampa:
                        </label>
                        <div className={styles.modalColorsList}>
                          {selectedProductDetails.colors && selectedProductDetails.colors.length > 0 ? (
                            selectedProductDetails.colors.map((c: any) => {
                              const cId = c.id || c.corId;
                              const isSelected = selectedColorForDetails === cId;
                              return (
                                <button
                                  key={cId}
                                  type="button"
                                  onClick={() => setSelectedColorForDetails(cId)}
                                  className={`${styles.modalColorButton} ${isSelected ? styles.modalColorButtonSelected : styles.modalColorButtonUnselected}`}
                                >
                                  {c.hex && (
                                    <span 
                                      className={styles.modalColorDot}
                                      style={{ backgroundColor: c.hex }}
                                    ></span>
                                  )}
                                  {c.nome}
                                </button>
                              );
                            })
                          ) : (
                            <span className={styles.emptyNotice}>Cor única padrão</span>
                          )}
                        </div>
                      </div>

                      <div>
                        <label className={styles.modalSectionLabel}>
                          📏 Tamanhos Disponíveis para a Cor Selecionada:
                        </label>
                        <div className={styles.modalSizesGrid}>
                          {(() => {
                            if (!selectedProductDetails.rawSizes || selectedProductDetails.rawSizes.length === 0) {
                              return <span className={styles.emptyNotice}>Tamanho único</span>;
                            }

                            const tamanhosDaCor = selectedProductDetails.rawSizes.filter((item: any) => {
                              const itemCorId = item.corId || item.cor?.id;
                              return !selectedColorForDetails || itemCorId === selectedColorForDetails;
                            });

                            if (tamanhosDaCor.length === 0) {
                              return <span className={styles.emptyNotice}>Nenhum tamanho cadastrado para esta cor.</span>;
                            }

                            return tamanhosDaCor.map((item: any, idx: number) => {
                              const nomeTamanho = item.tamanho?.nome || item.tamanhoId || `Tam ${idx+1}`;
                              const estoqueDisp = getAvailableStockByColorAndSize(
                                selectedProductDetails.id, 
                                item.cor?.nome || 'Padrão', 
                                nomeTamanho, 
                                item.estoque ?? 0
                              );

                              return (
                                <div 
                                  key={idx}
                                  className={`${styles.modalSizeItemBox} ${estoqueDisp > 0 ? styles.sizeBoxAvailable : styles.sizeBoxSoldOut}`}
                                >
                                  <div className={styles.modalSizeName}>{nomeTamanho}</div>
                                  <div className={`${styles.modalSizeStockQty} ${estoqueDisp > 0 ? styles.textGreen : styles.textRed}`}>
                                    {estoqueDisp > 0 ? `${estoqueDisp} un` : 'Esgotado'}
                                  </div>
                                </div>
                              );
                            });
                          })()}
                        </div>
                      </div>

                    </div>
                  </div>

                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'estoque' && (
          <div className={styles.singleContainer}>
            <section className={styles.card}>
              <h3>Controle de Estoque</h3>
              <p className={styles.infoText}>Utilize os filtros rápidos abaixo para focar imediatamente nos itens que exigem atenção ou pesquise por nome/ID.</p>
              
              <div className={styles.searchSection} style={{ marginBottom: '15px' }}>
                <input 
                  type="text" 
                  className={styles.searchInput} 
                  placeholder="🔍 Digite o nome ou ID do produto..." 
                  value={stockSearchQuery} 
                  onChange={e => setStockSearchQuery(e.target.value)} 
                />
              </div>

              <div className={styles.stockFilterButtonsRow}>
                <button 
                  type="button" 
                  className={`${styles.stockFilterBtn} ${stockFilter === 'todos' ? styles.stockFilterBtnActive : ''}`}
                  onClick={() => setStockFilter('todos')}
                >
                  📋 Todos os Produtos
                </button>
                <button 
                  type="button" 
                  className={`${styles.stockFilterBtn} ${stockFilter === 'baixo' ? styles.stockFilterBtnActive : ''}`}
                  onClick={() => setStockFilter('baixo')}
                >
                  ⚠️ Estoque Baixo (≤ 3)
                </button>
                <button 
                  type="button" 
                  className={`${styles.stockFilterBtn} ${stockFilter === 'esgotado' ? styles.stockFilterBtnActive : ''}`}
                  onClick={() => setStockFilter('esgotado')}
                >
                  🔴 Esgotados (0)
                </button>
              </div>

              {filteredStockProducts.length === 0 ? (
                <p className={styles.emptyNotice}>Nenhum produto encontrado com os critérios selecionados.</p>
              ) : (
                <div className={styles.stockVariationMatrix}>
                  {filteredStockProducts.map(prod => {
                    const rawList = prod.rawSizes || [];
                    const colorMap = new Map<string, { colorName: string; colorHex: string; sizes: { size: string; stock: number }[] }>();

                    if (rawList.length > 0) {
                      rawList.forEach((item: any) => {
                        const cName = item.cor?.nome || 'Padrão';
                        const cHex = item.cor?.hex || '#000000';
                        const sName = item.tamanho?.nome || item.tamanhoId || 'Único';
                        const baseEstoque = item.estoque ?? 0;
                        
                        if (!colorMap.has(cName)) {
                          colorMap.set(cName, { colorName: cName, colorHex: cHex, sizes: [] });
                        }

                        const existingSizes = colorMap.get(cName)?.sizes;
                        const alreadyExists = existingSizes?.some(s => s.size === sName);

                        if (!alreadyExists) {
                          const currentStockVal = getAvailableStockByColorAndSize(prod.id, cName, sName, baseEstoque);
                          existingSizes?.push({ size: sName, stock: currentStockVal });
                        }
                      });
                    } else {
                      colorMap.set('Padrão', {
                        colorName: 'Padrão',
                        colorHex: '#000000',
                        sizes: prod.sizes.map(sz => ({ size: sz, stock: getAvailableStockByColorAndSize(prod.id, 'Padrão', sz, 0) }))
                      });
                    }

                    const colorStockData = Array.from(colorMap.values()).map(colorItem => {
                      const filteredSizes = colorItem.sizes.filter(sizeItem => {
                        if (stockFilter === 'esgotado') return sizeItem.stock === 0;
                        if (stockFilter === 'baixo') return sizeItem.stock > 0 && sizeItem.stock <= 3;
                        return true;
                      });
                      return { ...colorItem, sizes: filteredSizes };
                    }).filter(colorItem => colorItem.sizes.length > 0);

                    if (colorStockData.length === 0) return null;

                    return (
                      <div key={prod.id} className={styles.stockProductBlockCard} style={{ marginTop: '20px', padding: '16px', border: '1px solid #e2e8f0', borderRadius: '8px', background: '#fafafa' }}>
                        <div className={styles.headerBetween} style={{ marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <img src={prod.images[0]} alt="" style={{ width: '40px', height: '40px', objectFit: 'cover', borderRadius: '4px' }} />
                          <div>
                            <h4 style={{ margin: 0, fontSize: '1rem', color: '#1e293b' }}>{prod.name}</h4>
                            <span style={{ fontSize: '0.8rem', color: '#64748b' }}>ID: {prod.id} | Categoria: {prod.category}</span>
                          </div>
                        </div>

                        <div className={styles.stockVariationMatrix}>
                          {colorStockData.map(colorItem => (
                            <div key={colorItem.colorName} className={styles.stockColorGroupCard}>
                              
                              <div className={styles.stockColorHeaderRow}>
                                <span
                                  className={styles.stockColorDotBox}
                                  style={{ backgroundColor: colorItem.colorHex }}
                                />
                                <span className={styles.stockColorNameHeading}>Cor: {colorItem.colorName}</span>
                              </div>

                              <div className={styles.stockSizesGridUX}>
                                {colorItem.sizes.map(sizeItem => {
                                  const mapKey = `${prod.id}-${colorItem.colorName}-${sizeItem.size}`;
                                  const currentInputValue = stockInputValues[mapKey] || '';
                                  const currentTypeKey = `${mapKey}-type`;
                                  const currentMotivoIdKey = `${mapKey}-motivoId`;
                                  
                                  const stockType = stockInputValues[currentTypeKey] || 'ENTRADA';
                                  const stockMotivoId = stockInputValues[currentMotivoIdKey] || '';
                                  
                                  const stockStatusClass = sizeItem.stock === 0 ? styles.redStock : sizeItem.stock <= 3 ? styles.yellowStock : styles.greenStock;

                                  const motivosFiltrados = motivosEstoqueList.filter(m => m.tipo === stockType);

                                  return (
                                    <div key={sizeItem.size} className={styles.sizeConfigBox} style={{ background: '#fff', padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                      
                                      <div className={styles.stockSizeCardHeader}>
                                        <span className={styles.stockSizeBadgeLabel}>Tam: {sizeItem.size}</span>
                                        <span className={`${styles.stockCounter} ${stockStatusClass}`}>
                                          Atual: {sizeItem.stock} un
                                        </span>
                                      </div>

                                      <div style={{ display: 'flex', gap: '12px', alignItems: 'center', fontSize: '0.85rem', padding: '2px 0' }}>
                                        <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', color: '#10b981', fontWeight: 600 }}>
                                          <input
                                            type="radio"
                                            name={currentTypeKey}
                                            value="ENTRADA"
                                            checked={stockType === 'ENTRADA'}
                                            onChange={() => {
                                              setStockInputValues(prev => ({
                                                ...prev,
                                                [currentTypeKey]: 'ENTRADA',
                                                [currentMotivoIdKey]: ''
                                              }));
                                            }}
                                          />
                                          Entrada
                                        </label>
                                        <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', color: '#ef4444', fontWeight: 600 }}>
                                          <input
                                            type="radio"
                                            name={currentTypeKey}
                                            value="SAIDA"
                                            checked={stockType === 'SAIDA'}
                                            onChange={() => {
                                              setStockInputValues(prev => ({
                                                ...prev,
                                                [currentTypeKey]: 'SAIDA',
                                                [currentMotivoIdKey]: ''
                                              }));
                                            }}
                                          />
                                          Saída
                                        </label>
                                      </div>

                                      <div className={styles.quantityControlGroup}>
                                        <button
                                          type="button"
                                          className={styles.qtyButton}
                                          onClick={() => {
                                            const atual = parseInt(currentInputValue || '0', 10);
                                            const novoValor = Math.max(0, atual - 1);
                                            setStockInputValues(prev => ({ ...prev, [mapKey]: novoValor === 0 ? '' : novoValor.toString() }));
                                          }}
                                        >
                                          -
                                        </button>

                                        <input
                                          type="text"
                                          inputMode="numeric"
                                          pattern="[0-9]*"
                                          placeholder="Qtd"
                                          className={styles.stockQuickInputNumber}
                                          value={currentInputValue}
                                          onChange={(e) => {
                                            const valorLimpo = e.target.value.replace(/\D/g, '');
                                            setStockInputValues(prev => ({ ...prev, [mapKey]: valorLimpo }));
                                          }}
                                        />

                                        <button
                                          type="button"
                                          className={styles.qtyButton}
                                          onClick={() => {
                                            const atual = parseInt(currentInputValue || '0', 10);
                                            const novoValor = atual + 1;
                                            setStockInputValues(prev => ({ ...prev, [mapKey]: novoValor.toString() }));
                                          }}
                                        >
                                          +
                                        </button>
                                      </div>

                                      <select
                                        value={stockMotivoId}
                                        onChange={(e) => setStockInputValues(prev => ({ ...prev, [currentMotivoIdKey]: e.target.value }))}
                                        style={{ padding: '6px', fontSize: '0.8rem', borderRadius: '4px', border: '1px solid #cbd5e1', width: '100%', background: '#fff' }}
                                        required
                                      >
                                        <option value="">Selecione o motivo...</option>
                                        {motivosFiltrados.map(motivo => (
                                          <option key={motivo.id} value={motivo.id}>
                                            {motivo.nome}
                                          </option>
                                        ))}
                                      </select>

                                      <button
                                        type="button"
                                        style={{
                                          background: stockType === 'ENTRADA' ? '#10b981' : '#ef4444',
                                          color: '#fff',
                                          border: 'none',
                                          padding: '6px',
                                          borderRadius: '4px',
                                          fontWeight: 'bold',
                                          cursor: 'pointer',
                                          fontSize: '0.8rem'
                                        }}
                                        onClick={async () => {
                                          const qtyInput = parseInt(currentInputValue, 10);
                                          if (isNaN(qtyInput) || qtyInput <= 0) {
                                            alert('Insira uma quantidade válida.');
                                            return;
                                          }
                                          if (!stockMotivoId) {
                                            alert('Selecione um motivo para a movimentação.');
                                            return;
                                          }
                                          if (stockType === 'SAIDA' && sizeItem.stock < qtyInput) {
                                            alert('Estoque insuficiente para esta saída!');
                                            return;
                                          }

                                          try {
                                            const response = await fetch(`${API_URL}/movimentacoes`, {
                                              method: 'POST',
                                              headers: { 'Content-Type': 'application/json' },
                                              credentials: 'include',
                                              body: JSON.stringify({
                                                produtoId: prod.id,
                                                corNome: colorItem.colorName,
                                                tamanho: sizeItem.size,
                                                tipo: stockType,
                                                quantidade: qtyInput,
                                                motivoId: stockMotivoId
                                              })
                                            });

                                            const data = await response.json();
                                            if (!response.ok) throw new Error(data.message || 'Erro ao registrar movimentação.');

                                            await Promise.all([
                                              carregarMovimentacoes(),
                                              carregarProdutos(),
                                              carregarDashboard()
                                            ]);
                                            
                                            setStockInputValues(prev => ({
                                              ...prev,
                                              [mapKey]: '',
                                              [currentMotivoIdKey]: ''
                                            }));
                                          } catch (err: any) {
                                            alert(err.message || 'Erro ao conectar com o servidor.');
                                          }
                                        }}
                                      >
                                        Registrar {stockType === 'ENTRADA' ? 'Entrada' : 'Saída'}
                                      </button>

                                    </div>
                                  );
                                })}
                              </div>

                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        )}

        {activeTab === 'historico-estoque' && (
          <div className={styles.singleContainer}>
            <section className={styles.card}>
              <h3>📜 Histórico de Movimentações de Estoque</h3>
              <p className={styles.infoText}>Registro completo de todas as entradas e saídas realizadas no sistema.</p>

              <div className={styles.searchSection} style={{ marginTop: '15px', marginBottom: '15px' }}>
                <input 
                  type="text" 
                  className={styles.searchInput} 
                  placeholder="🔍 Pesquisar pelo nome ou ID do produto..." 
                  value={historySearchQuery} 
                  onChange={e => setHistorySearchQuery(e.target.value)} 
                />
              </div>

              {filteredMovements.length === 0 ? (
                <p className={styles.emptyNotice}>Nenhuma movimentação encontrada com os critérios informados.</p>
              ) : (
                <div style={{ overflowX: 'auto', marginTop: '15px' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', textAlign: 'left' }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid #cbd5e1', color: '#475569' }}>
                        <th style={{ padding: '8px' }}>Data</th>
                        <th style={{ padding: '8px' }}>Produto</th>
                        <th style={{ padding: '8px' }}>Cor / Tam</th>
                        <th style={{ padding: '8px' }}>Tipo</th>
                        <th style={{ padding: '8px' }}>Qtd</th>
                        <th style={{ padding: '8px' }}>Motivo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredMovements.map((mov) => {
                        const produtoEncontrado = products.find(p => p.id === mov.productId);
                        return (
                          <tr key={mov.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                            <td style={{ padding: '8px', color: '#64748b' }}>{mov.date}</td>
                            <td style={{ padding: '8px', fontWeight: 600, color: '#1e293b' }}>
                              {produtoEncontrado ? produtoEncontrado.name : `ID: ${mov.productId.slice(0, 6)}...`}
                            </td>
                            <td style={{ padding: '8px', color: '#334155' }}>
                              {mov.colorName} / {mov.size || 'Único'}
                            </td>
                            <td style={{ padding: '8px' }}>
                              <span style={{
                                padding: '2px 8px',
                                borderRadius: '4px',
                                fontSize: '0.75rem',
                                fontWeight: 'bold',
                                background: mov.type === 'ENTRADA' ? '#d1fae5' : '#fee2e2',
                                color: mov.type === 'ENTRADA' ? '#065f46' : '#991b1b'
                              }}>
                                {mov.type}
                              </span>
                            </td>
                            <td style={{ padding: '8px', fontWeight: 'bold', color: mov.type === 'ENTRADA' ? '#059669' : '#dc2626' }}>
                              {mov.type === 'ENTRADA' ? `+${mov.quantity}` : `-${mov.quantity}`}
                            </td>
                            <td style={{ padding: '8px', color: '#475569' }}>{mov.reason}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        )}
      </main>
    </div>
  );
};