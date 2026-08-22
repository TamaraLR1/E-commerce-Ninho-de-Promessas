import 'dotenv/config';
import { prisma } from '../src/lib/prisma';
import bcrypt from 'bcrypt';

async function main() {
  // 1. Criar Administradores
  const senhaHash1 = await bcrypt.hash('Snhteste123ALN@', 10);
  const senhaHash2 = await bcrypt.hash('SnhTeste123GTV@', 10);

  await prisma.admin.upsert({
    where: { email: 'aline@ninhodepromessas.com' },
    update: {},
    create: {
      nome: 'Aline Fabiane de Lima',
      email: 'aline@ninhodepromessas.com',
      senha: senhaHash1,
    },
  });

  await prisma.admin.upsert({
    where: { email: 'gustavo@ninhodepromessas.com' },
    update: {},
    create: {
      nome: 'Gustavo',
      email: 'gustavo@ninhodepromessas.com',
      senha: senhaHash2,
    },
  });

  console.log('Administradores criados com sucesso!');

  // 2. Criar Cores (Ampla variedade)
  const coresData = [
    { nome: 'Branco', slug: 'branco', hex: '#FFFFFF' },
    { nome: 'Preto', slug: 'preto', hex: '#000000' },
    { nome: 'Cinza', slug: 'cinza', hex: '#808080' },
    { nome: 'Rosa Bebê', slug: 'rosa-bebe', hex: '#FFC0CB' },
    { nome: 'Rosa Choque', slug: 'rosa-choque', hex: '#FF1493' },
    { nome: 'Azul Bebê', slug: 'azul-bebe', hex: '#ADD8E6' },
    { nome: 'Azul Marinho', slug: 'azul-marinho', hex: '#000080' },
    { nome: 'Azul Royal', slug: 'azul-royal', hex: '#4169E1' },
    { nome: 'Vermelho', slug: 'vermelho', hex: '#FF0000' },
    { nome: 'Amarelo', slug: 'amarelo', hex: '#FFFF00' },
    { nome: 'Verde Bebê', slug: 'verde-bebe', hex: '#98FB98' },
    { nome: 'Verde Militar', slug: 'verde-militar', hex: '#556B2F' },
    { nome: 'Lilás', slug: 'lilas', hex: '#C8A2C8' },
    { nome: 'Roxo', slug: 'roxo', hex: '#800080' },
    { nome: 'Laranja', slug: 'laranja', hex: '#FFA500' },
    { nome: 'Marrom', slug: 'marrom', hex: '#8B4513' },
    { nome: 'Bege / Nude', slug: 'bege-nude', hex: '#F5F5DC' },
    { nome: 'Salmão', slug: 'salmao', hex: '#FA8072' },
    { nome: 'Marsala', slug: 'marsala', hex: '#8B2252' },
    { nome: 'Tiffany', slug: 'tiffany', hex: '#0ABAB5' },
  ];

  for (const cor of coresData) {
    await prisma.cor.upsert({
      where: { slug: cor.slug },
      update: {},
      create: cor,
    });
  }
  console.log('🎨 Cores cadastradas com sucesso!');

  // 3. Criar Tamanhos até 5 anos de idade
  const tamanhosData = [
    { nome: 'RN (Recém-Nascido)', slug: 'rn' },
    { nome: 'P (0 a 3 Meses)', slug: 'p-0-3m' },
    { nome: 'M (3 a 6 Meses)', slug: 'm-3-6m' },
    { nome: 'G (6 a 9 Meses)', slug: 'g-6-9m' },
    { nome: 'GG (9 a 12 Meses)', slug: 'gg-9-12m' },
    { nome: '1 Ano', slug: '1-ano' },
    { nome: '2 Anos', slug: '2-anos' },
    { nome: '3 Anos', slug: '3-anos' },
    { nome: '4 Anos', slug: '4-anos' },
    { nome: '5 Anos', slug: '5-anos' },
  ];

  for (const tamanho of tamanhosData) {
    await prisma.tamanho.upsert({
      where: { slug: tamanho.slug },
      update: {},
      create: tamanho,
    });
  }
  console.log('👕 Tamanhos até 5 anos cadastrados com sucesso!');

  // 4. Criar Categorias
  console.log('🌱 Iniciando seed de categorias...');

  const categorias = [
    { nome: 'Bodies', slug: 'bodies' },
    { nome: 'Macacões', slug: 'macacoes' },
    { nome: 'Vestidos', slug: 'vestidos' },
    { nome: 'Conjuntos', slug: 'conjuntos' },
    { nome: 'Calças', slug: 'calcas' },
    { nome: 'Camisetas', slug: 'camisetas' },
    { nome: 'Bermudas', slug: 'bermudas' },
  ];

  for (const cat of categorias) {
    const categoriaExistente = await prisma.categoria.findUnique({
      where: { slug: cat.slug },
    });

    if (!categoriaExistente) {
      await prisma.categoria.create({
        data: cat,
      });
      console.log(`✅ Categoria criada: ${cat.nome}`);
    } else {
      console.log(`⚠️ Categoria já existe: ${cat.nome}`);
    }
  }

  console.log('✨ Seed de categorias finalizado com sucesso!');

  // 5. Criar Motivos de Estoque (Entradas e Saídas)
  const motivos = [
    // --- ENTRADAS ---
    { nome: 'Compra de Fornecedores / Reposição', tipo: 'ENTRADA' },
    { nome: 'Devolução de Clientes', tipo: 'ENTRADA' },
    { nome: 'Estorno ou Cancelamento de Pedido', tipo: 'ENTRADA' },
    { nome: 'Ajuste de Inventário (Sobra)', tipo: 'ENTRADA' },
    { nome: 'Brindes ou Amostras Recebidas', tipo: 'ENTRADA' },
    { nome: 'Produção Própria / Fabricação', tipo: 'ENTRADA' },

    // --- SAÍDAS ---
    { nome: 'Vendas Realizadas', tipo: 'SAIDA' },
    { nome: 'Trocas e Garantias', tipo: 'SAIDA' },
    { nome: 'Avarias e Danos', tipo: 'SAIDA' },
    { nome: 'Perdas e Extravios', tipo: 'SAIDA' },
    { nome: 'Ajuste de Inventário (Falta)', tipo: 'SAIDA' },
    { nome: 'Uso Interno / Brindes / Marketing', tipo: 'SAIDA' },
  ];

  console.log('Iniciando o cadastro dos motivos de estoque...');

  for (const motivo of motivos) {
    await prisma.motivoEstoque.upsert({
      where: { nome: motivo.nome },
      update: { tipo: motivo.tipo },
      create: motivo,
    });
  }

  console.log('📦 Motivos de estoque cadastrados com sucesso!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });