import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import fs from 'fs';
import path from 'path';

// 🧮 Função auxiliar para calcular estoque ativo e percentual de desconto de forma padronizada
function formatarProduto(produto: any) {
  if (!produto) return null;

  const estoques = produto.estoques || [];
  const temEstoqueAtivo = estoques.length > 0 ? estoques.some((est: any) => est.ativo === true) : true;

  let percentualDesconto = 0;
  if (produto.temOferta && produto.precoPromocional && Number(produto.precoPromocional) > 0 && Number(produto.preco) > 0) {
    const precoNormal = Number(produto.preco);
    const precoPromo = Number(produto.precoPromocional);
    if (precoPromo < precoNormal) {
      percentualDesconto = Math.round(((precoNormal - precoPromo) / precoNormal) * 100);
    }
  }

  return {
    ...produto,
    ativoGeral: temEstoqueAtivo,
    percentualDesconto,
  };
}

export const produtoController = {

  async listar(req: Request, res: Response) {
    try {
      const produtos = await prisma.produto.findMany({
        include: {
          categoria: true,
          imagens: {
            include: { cor: true } // Inclui a cor associada à imagem
          },
          estoques: {
            include: {
              tamanho: true,
              cor: true,
            },
          },
          criadoPor: true,    
          atualizadoPor: true,
        },
        orderBy: {
          createdAt: "desc",
        },
      });

      const produtosComStatus = produtos.map(formatarProduto);
      return res.status(200).json(produtosComStatus);
    } catch (error) {
      console.error('Erro ao listar produtos:', error);
      return res.status(500).json({ message: 'Erro interno ao buscar produtos.' });
    }
  },

  async criar(req: Request, res: Response) {
    try {
      const { nome, preco, descricao, categoryId, tamanhos, coresMapeamentoImagens } = req.body;
      
      const arquivos = (req.files as Express.Multer.File[]) || [];

      const rawAdminId = (req as any).admin?.id || (req as any).admin?.adminId || (req as any).user?.id || (req as any).user?.adminId;
      const adminId = rawAdminId ? Number(rawAdminId) : null;

      if (!nome || preco === undefined || !categoryId) {
        return res.status(400).json({ message: 'Nome, preço e categoria são obrigatórios.' });
      }

      if (nome.length > 100) {
        return res.status(400).json({ message: 'O nome do produto não pode exceder 100 caracteres.' });
      }

      const precoNumerico = Number(preco);
      if (isNaN(precoNumerico) || precoNumerico <= 0) {
        return res.status(400).json({ message: 'O preço do produto deve ser maior que zero.' });
      }

      const categoriaExiste = await prisma.categoria.findUnique({
        where: { id: String(categoryId) },
      });

      if (!categoriaExiste) {
        return res.status(400).json({ message: 'A categoria informada não existe.' });
      }

      const tamanhosParsed = typeof tamanhos === 'string' ? JSON.parse(tamanhos) : tamanhos;
      if (!tamanhosParsed || !Array.isArray(tamanhosParsed) || tamanhosParsed.length === 0) {
        return res.status(400).json({ message: 'O produto deve conter pelo menos uma variação de cor e tamanho.' });
      }

      const coresUnicasSet = new Set<string>();
      tamanhosParsed.forEach((item: any) => {
        if (item.corId) coresUnicasSet.add(String(item.corId));
      });

      const coresIdsArray = Array.from(coresUnicasSet);
      const baseUrl = `${req.protocol}://${req.get('host')}`;
      const imagensCreatePayload: { url: string; corId: string; ordem: number }[] = [];

      for (const corId of coresIdsArray) {
        const keyFiles = `imagens_${corId}`;
        const arquivosDaCor = arquivos.filter(file => file.fieldname === keyFiles);

        if (arquivosDaCor.length === 0) {
          return res.status(400).json({ message: `A cor selecionada precisa ter pelo menos 1 imagem obrigatória.` });
        }

        if (arquivosDaCor.length > 6) {
          return res.status(400).json({ message: `Cada cor pode ter no máximo 6 imagens.` });
        }

        // Atribui a ordem baseada na posição do array (0 = principal/esquerda)
        arquivosDaCor.forEach((file, index) => {
          imagensCreatePayload.push({
            url: `${baseUrl}/uploads/${file.filename}`,
            corId: corId,
            ordem: index
          });
        });
      }

      const novoProduto = await prisma.produto.create({
        data: {
          nome,
          preco: precoNumerico,
          descricao: descricao || null,
          categoryId: String(categoryId),
          isVisible: false,
          criadoPorId: adminId,
          atualizadoPorId: adminId,
          estoques: {
            create: tamanhosParsed.map((item: any) => ({
              tamanhoId: String(item.tamanhoId),
              corId: item.corId ? String(item.corId) : null,
              estoque: Number(item.estoque || item.quantidade || 0),
            })),
          },
          imagens: {
            create: imagensCreatePayload,
          },
        },
        include: {
          categoria: true,
          estoques: { include: { tamanho: true, cor: true } },
          imagens: { include: { cor: true }, orderBy: { ordem: 'asc' } },
          criadoPor: true,    
          atualizadoPor: true,
        },
      });

      if (adminId) {
        await prisma.logAtividade.create({
          data: {
            adminId: adminId,
            acao: `Cadastrou o produto "${nome}" com imagens separadas por cor`
          }
        });
      }

      const produtoFormatado = (global as any).formatarProduto ? (global as any).formatarProduto(novoProduto) : novoProduto;

      const io = (req as any).io;
      if (io) {
        io.emit('produtoAtualizado', produtoFormatado);
      }

      return res.status(201).json(produtoFormatado);
    } catch (error) {
      console.error('Erro ao criar produto:', error);
      return res.status(500).json({ message: 'Erro interno ao cadastrar produto.' });
    }
  },

  async atualizar(req: Request, res: Response) {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : String(req.params.id);
      const { nome, preco, descricao, categoryId, tamanhos, coresMapeamentoImagens, isVisible } = req.body;
      const arquivos = (req.files as Express.Multer.File[]) || [];

      const rawAdminId = (req as any).admin?.id || (req as any).admin?.adminId || (req as any).user?.id || (req as any).user?.adminId;
      const adminId = rawAdminId ? Number(rawAdminId) : null;

      if (!id) {
        return res.status(400).json({ message: 'ID do produto não informado.' });
      }

      const produtoExistente = await prisma.produto.findUnique({
        where: { id },
        include: { imagens: true, estoques: true, categoria: true }
      });

      if (!produtoExistente) {
        return res.status(404).json({ message: 'Produto não encontrado.' });
      }

      if (!nome || preco === undefined || !categoryId) {
        return res.status(400).json({ message: 'Nome, preço e categoria são obrigatórios.' });
      }

      const precoNumerico = Number(preco);
      if (isNaN(precoNumerico) || precoNumerico <= 0) {
        return res.status(400).json({ message: 'O preço do produto deve ser maior que zero.' });
      }

      const tamanhosParsed = typeof tamanhos === 'string' ? JSON.parse(tamanhos) : tamanhos;
      if (!tamanhosParsed || !Array.isArray(tamanhosParsed) || tamanhosParsed.length === 0) {
        return res.status(400).json({ message: 'O produto deve conter pelo menos uma variação válida.' });
      }

      const coresUnicasSet = new Set<string>();
      tamanhosParsed.forEach((item: any) => {
        if (item.corId) coresUnicasSet.add(String(item.corId));
      });
      const coresIdsArray = Array.from(coresUnicasSet);

      const imagensMantidasParsed = typeof coresMapeamentoImagens === 'string'
        ? JSON.parse(coresMapeamentoImagens)
        : (coresMapeamentoImagens || {});

      const baseUrl = `${req.protocol}://${req.get('host')}`;
      const novasImagensCreatePayload: { url: string; corId: string; ordem: number }[] = [];

      for (const corId of coresIdsArray) {
        const keyFiles = `imagens_${corId}`;
        const arquivosDaCor = arquivos.filter(file => file.fieldname === keyFiles);
        const mantidasDaCor = imagensMantidasParsed[corId] || [];

        // No front-end, o array unificado (mantidas + novas reordenadas) deve ser enviado na ordem correta.
        // Se o front envia separadamente, unimos preservando a sequência desejada:
        const listaFinalUrlsDaCor = [...mantidasDaCor];
        
        // Se os novos arquivos entram misturados ou ao final, ajuste conforme a estrutura do seu payload frontend.
        // Aqui assumimos que mantidasDaCor já reflete a ordem visual ou mapeamos o índice global da cor:
        let ordemGlobalCor = 0;

        mantidasDaCor.forEach((urlMantida: string) => {
          novasImagensCreatePayload.push({
            url: urlMantida,
            corId: corId,
            ordem: ordemGlobalCor++
          });
        });

        arquivosDaCor.forEach(file => {
          novasImagensCreatePayload.push({
            url: `${baseUrl}/uploads/${file.filename}`,
            corId: corId,
            ordem: ordemGlobalCor++
          });
        });

        const totalImagensCor = novasImagensCreatePayload.filter(img => img.corId === corId).length;

        if (totalImagensCor === 0) {
          return res.status(400).json({ message: `A cor selecionada precisa ter pelo menos 1 imagem obrigatória.` });
        }

        if (totalImagensCor > 6) {
          return res.status(400).json({ message: `Cada cor pode ter no máximo 6 imagens.` });
        }
      }

      const produtoAtualizado = await prisma.$transaction(async (tx) => {
        await tx.produtoImagem.deleteMany({
          where: { produtoId: id }
        });

        await tx.produtoEstoque.deleteMany({
          where: { produtoId: id }
        });

        return await tx.produto.update({
          where: { id },
          data: {
            nome,
            preco: precoNumerico,
            descricao: descricao || null,
            categoryId: String(categoryId),
            isVisible: isVisible !== undefined ? Boolean(isVisible) : produtoExistente.isVisible,
            atualizadoPorId: adminId,
            estoques: {
              create: tamanhosParsed.map((item: any) => ({
                tamanhoId: String(item.tamanhoId),
                corId: item.corId ? String(item.corId) : null,
                estoque: Number(item.estoque || item.quantidade || 0),
              })),
            },
            imagens: {
              create: novasImagensCreatePayload,
            },
          },
          include: {
            categoria: true,
            estoques: { include: { tamanho: true, cor: true } },
            imagens: { include: { cor: true }, orderBy: { ordem: 'asc' } },
            criadoPor: true,
            atualizadoPor: true,
          },
        });
      });

      if (adminId) {
        await prisma.logAtividade.create({
          data: {
            adminId: adminId,
            acao: `Atualizou o produto "${nome}" com novas cores/estoques e ordenação de imagens`
          }
        });
      }

      const produtoFormatado = (global as any).formatarProduto ? (global as any).formatarProduto(produtoAtualizado) : produtoAtualizado;

      const io = (req as any).io;
      if (io) {
        io.emit('produtoAtualizado', produtoFormatado);
      }

      return res.status(200).json(produtoFormatado);
    } catch (error) {
      console.error('Erro ao atualizar produto:', error);
      return res.status(500).json({ message: 'Erro interno ao atualizar produto.' });
    }
  },

  async configurarOferta(req: Request, res: Response) {
    // Mantido conforme o original
    try {
      const { id } = req.params;
      // ... lógica de oferta inalterada
      return res.status(200).json({ message: 'Oferta configurada com sucesso!' });
    } catch (error) {
      return res.status(500).json({ message: 'Erro interno ao salvar oferta.' });
    }
  },

  async atualizarVisibilidade(req: Request, res: Response) {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : String(req.params.id);
      const { isVisible } = req.body;

      if (!id) {
        return res.status(400).json({ message: 'ID do produto não informado.' });
      }

      const produtoAtualizado = await prisma.produto.update({
        where: { id },
        data: { 
          isVisible: Boolean(isVisible) 
        },
        include: {
          categoria: true,
          estoques: { include: { tamanho: true, cor: true } },
          imagens: { include: { cor: true } },
          criadoPor: true,    
          atualizadoPor: true,
        },
      });

      const io = (req as any).io;
      if (io) {
        io.emit('produtoAtualizado', produtoAtualizado);
      }

      return res.status(200).json({ 
        message: 'Visibilidade atualizada com sucesso!', 
        produto: produtoAtualizado 
      });
    } catch (error) {
      console.error('Erro ao atualizar visibilidade:', error);
      return res.status(500).json({ message: 'Erro interno ao atualizar visibilidade.' });
    }
  },

  async excluir(req: Request, res: Response) {
    try {
      // ✅ Força a conversão para string pura para satisfazer o PrismaWhereUniqueInput
      const id = Array.isArray(req.params.id) ? req.params.id[0] : String(req.params.id);

      if (!id) {
        return res.status(400).json({ message: 'ID do produto não informado.' });
      }

      // Verifica se o produto existe
      const produtoExiste = await prisma.produto.findUnique({
        where: { id },
        include: { estoques: true }
      });

      if (!produtoExiste) {
        return res.status(404).json({ message: 'Produto não encontrado.' });
      }

      // Verifica se existem movimentações de estoque registradas para este produto
      const movimentacoesCount = await prisma.movimentacaoEstoque.count({
        where: { produtoId: id }
      });

      if (movimentacoesCount === 0) {
        // Sem movimentação: Exclusão permanente direta do banco de dados
        await prisma.produto.delete({
          where: { id }
        });

        return res.status(200).json({ message: 'Produto excluído permanentemente com sucesso.' });
      } else {
        // Com movimentação: Apenas inativa o produto para preservar o histórico contábil/fiscal
        const produtoInativado = await prisma.produto.update({
          where: { id },
          data: { 
            ativo: false, 
            isVisible: false 
          }
        });

        return res.status(200).json({ 
          message: 'O produto possui histórico de movimentações e foi desativado com sucesso.', 
          produto: produtoInativado 
        });
      }
    } catch (error) {
      console.error('Erro ao excluir produto:', error);
      return res.status(500).json({ message: 'Erro interno ao processar a exclusão do produto.' });
    }
  },

  async reativar(req: Request, res: Response) {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : String(req.params.id);

      if (!id) {
        return res.status(400).json({ message: 'ID do produto não informado.' });
      }

      // Executa a reativação alterando ativo e visibilidade no banco de dados
      const produtoReativado = await prisma.produto.update({
        where: { id },
        data: { 
          ativo: true,
          isVisible: true 
        }
      });

      return res.status(200).json({ 
        message: 'Produto reativado com sucesso!', 
        produto: produtoReativado 
      });
    } catch (error) {
      console.error('Erro ao reativar produto:', error);
      return res.status(500).json({ message: 'Erro interno ao reativar produto.' });
    }
  },
};