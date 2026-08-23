import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import fs from 'fs';
import path from 'path';

export const produtoController = {
  async listar(req: Request, res: Response) {
    try {
      const produtos = await prisma.produto.findMany({
        // Removido o filtro restritivo "estoques: { some: { ativo: true } }" 
        // para permitir que produtos inativados/sazonais continuem aparecendo na vitrine.
        include: {
          categoria: true,
          imagens: true,
          estoques: {
            include: {
              tamanho: true,
              cor: true,
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
      });

      return res.status(200).json(produtos);
    } catch (error) {
      console.error('Erro ao listar produtos:', error);
      return res.status(500).json({ message: 'Erro interno ao buscar produtos.' });
    }
  },

  async criar(req: Request, res: Response) {
    try {
      const { nome, preco, descricao, categoryId, tamanhos } = req.body;
      const arquivos = req.files as Express.Multer.File[];

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

      if (!arquivos || arquivos.length === 0) {
        return res.status(400).json({ message: 'Envie pelo menos uma imagem para o produto.' });
      }

      if (arquivos.length > 10) {
        return res.status(400).json({ message: 'Um produto pode ter no máximo 10 imagens.' });
      }

      const categoriaExiste = await prisma.categoria.findUnique({
        where: { id: String(categoryId) },
      });

      if (!categoriaExiste) {
        return res.status(400).json({ message: 'A categoria informada não existe.' });
      }

      const tamanhosParsed = typeof tamanhos === 'string' ? JSON.parse(tamanhos) : tamanhos;

      // Validação: Garante que o produto possui pelo menos uma variação válida de cor/tamanho
      if (!tamanhosParsed || !Array.isArray(tamanhosParsed) || tamanhosParsed.length === 0) {
        return res.status(400).json({ message: 'O produto deve conter pelo menos uma variação de cor e tamanho.' });
      }

      const possuiItemInvalido = tamanhosParsed.some((item: any) => !item.tamanhoId || String(item.tamanhoId).trim() === '');
      if (possuiItemInvalido) {
        return res.status(400).json({ message: 'Todas as variações cadastradas devem ter um tamanho válido.' });
      }

      const baseUrl = `${req.protocol}://${req.get('host')}`;
      const imagensPayload = arquivos.map(file => ({
        url: `${baseUrl}/uploads/${file.filename}`
      }));

      const novoProduto = await prisma.produto.create({
        data: {
          nome,
          preco: precoNumerico,
          descricao: descricao || null,
          categoryId: String(categoryId),
          estoques: {
            create: tamanhosParsed.map((item: { tamanhoId: string; corId?: string; estoque?: number; quantidade?: number }) => ({
              tamanhoId: String(item.tamanhoId),
              corId: item.corId ? String(item.corId) : null,
              estoque: Number(item.estoque !== undefined ? item.estoque : (item.quantidade || 0)),
            })),
          },
          imagens: {
            create: imagensPayload,
          },
        },
        include: {
          categoria: true,
          estoques: { include: { tamanho: true, cor: true } },
          imagens: true,
        },
      });

      return res.status(201).json(novoProduto);
    } catch (error) {
      console.error('Erro ao criar produto:', error);
      return res.status(500).json({ message: 'Erro interno ao cadastrar produto.' });
    }
  },

  async atualizar(req: Request, res: Response) {
    try {
      const id = String(req.params.id);
      const { nome, preco, descricao, categoryId, tamanhos, imagensMantidas } = req.body;
      const novosArquivos = req.files as Express.Multer.File[];

      const produtoExistente = await prisma.produto.findUnique({
        where: { id },
        include: { imagens: true, estoques: true }
      });

      if (!produtoExistente) {
        return res.status(404).json({ message: 'Produto não encontrado.' });
      }

      const tamanhosParsed = typeof tamanhos === 'string' ? JSON.parse(tamanhos) : tamanhos;

      // Validação: Garante que na edição não fiquem sem variações válidas
      if (!tamanhosParsed || !Array.isArray(tamanhosParsed) || tamanhosParsed.length === 0) {
        return res.status(400).json({ message: 'O produto deve conter pelo menos uma variação de cor e tamanho.' });
      }

      const itensEnviados = tamanhosParsed
        .filter((item: any) => item && item.tamanhoId && String(item.tamanhoId).trim() !== '')
        .map((item: any) => ({
          tamanhoId: String(item.tamanhoId),
          corId: item.corId && String(item.corId).trim() !== '' ? String(item.corId) : null,
          estoque: Number(item.estoque || 0)
        }));

      if (itensEnviados.length === 0) {
        return res.status(400).json({ message: 'É obrigatório selecionar ao menos um tamanho e cor válidos.' });
      }

      // Parse das imagens mantidas
      const imagensMantidasParsed: string[] = typeof imagensMantidas === 'string' 
        ? JSON.parse(imagensMantidas) 
        : (Array.isArray(imagensMantidas) ? imagensMantidas : produtoExistente.imagens.map(img => img.url));

      const totalImagensFinais = imagensMantidasParsed.length + (novosArquivos ? novosArquivos.length : 0);
      if (totalImagensFinais === 0) {
        return res.status(400).json({ message: 'É necessário pelo menos 1 imagem para o produto.' });
      }
      if (totalImagensFinais > 10) {
        return res.status(400).json({ message: 'Um produto pode ter no máximo 10 imagens.' });
      }

      // 1. Tratamento de remoção de imagens físicas e do banco
      const imagensParaRemover = produtoExistente.imagens.filter(
        img => !imagensMantidasParsed.includes(img.url)
      );
      const idsParaDeletar = imagensParaRemover.map(img => img.id);

      if (idsParaDeletar.length > 0) {
        for (const imgAntiga of imagensParaRemover) {
          try {
            const filename = imgAntiga.url.split('/uploads/')[1];
            if (filename) {
              const filePath = path.resolve(__dirname, '..', '..', 'uploads', filename);
              if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
              }
            }
          } catch (err) {
            console.error('Erro ao apagar arquivo físico:', err);
          }
        }
        await prisma.produtoImagem.deleteMany({
          where: { id: { in: idsParaDeletar } }
        });
      }

      const baseUrl = `${req.protocol}://${req.get('host')}`;
      const novasImagensCreate = novosArquivos && novosArquivos.length > 0 
        ? novosArquivos.map(file => ({ url: `${baseUrl}/uploads/${file.filename}` }))
        : [];

      const precoNumerico = preco !== undefined ? Number(preco) : produtoExistente.preco;

      // 2. Atualizar dados gerais do produto e novas imagens
      await prisma.produto.update({
        where: { id },
        data: {
          nome: nome || produtoExistente.nome,
          preco: precoNumerico,
          descricao: descricao !== undefined ? descricao : produtoExistente.descricao,
          categoryId: categoryId ? String(categoryId) : produtoExistente.categoryId,
          imagens: {
            create: novasImagensCreate
          }
        }
      });

      // 3. Gerenciamento inteligente do Estoque / Vínculos
      for (const estoqueAtual of produtoExistente.estoques) {
        const tAtualId = String(estoqueAtual.tamanhoId || '');
        const cAtualId = estoqueAtual.corId ? String(estoqueAtual.corId) : null;

        const aindaEnviado = itensEnviados.some(
          (item) => item.tamanhoId === tAtualId && item.corId === cAtualId
        );

        if (!aindaEnviado) {
          const corObj = estoqueAtual.corId ? await prisma.cor.findUnique({ where: { id: estoqueAtual.corId } }) : null;
          const corNomeBusca = corObj?.nome || 'Padrão';

          const tamanhoObj = estoqueAtual.tamanhoId ? await prisma.tamanho.findUnique({ where: { id: estoqueAtual.tamanhoId } }) : null;
          const tamanhoNomeBusca = tamanhoObj?.nome || '';

          const movimentacoesCount = await prisma.movimentacaoEstoque.count({
            where: {
              produtoId: id,
              corNome: corNomeBusca,
              tamanho: tamanhoNomeBusca
            }
          });

          if (movimentacoesCount === 0) {
            await prisma.produtoEstoque.delete({
              where: { id: estoqueAtual.id }
            });
          } else {
            await prisma.produtoEstoque.update({
              where: { id: estoqueAtual.id },
              data: { ativo: false }
            });
          }
        } else {
          const itemEncontrado = itensEnviados.find(
            (item) => item.tamanhoId === tAtualId && item.corId === cAtualId
          );

          await prisma.produtoEstoque.update({
            where: { id: estoqueAtual.id },
            data: { 
              ativo: true,
              estoque: itemEncontrado ? itemEncontrado.estoque : estoqueAtual.estoque
            }
          });
        }
      }

      // Adicionar novos itens ou reativar os que estavam com soft delete (ativo: false)
      for (const itemNovo of itensEnviados) {
        const estoqueInativoExistente = produtoExistente.estoques.find(
          e => String(e.tamanhoId) === itemNovo.tamanhoId && 
               (e.corId ? String(e.corId) : null) === itemNovo.corId && 
               e.ativo === false
        );

        if (estoqueInativoExistente) {
          await prisma.produtoEstoque.update({
            where: { id: estoqueInativoExistente.id },
            data: {
              ativo: true,
              estoque: itemNovo.estoque
            }
          });
        } else {
          const jaExisteAtivo = produtoExistente.estoques.some(
            e => String(e.tamanhoId) === itemNovo.tamanhoId && 
                 (e.corId ? String(e.corId) : null) === itemNovo.corId && 
                 e.ativo === true
          );

          if (!jaExisteAtivo) {
            await prisma.produtoEstoque.create({
              data: {
                produtoId: id,
                tamanhoId: itemNovo.tamanhoId,
                corId: itemNovo.corId,
                estoque: itemNovo.estoque,
                ativo: true
              }
            });
          }
        }
      }

      const produtoFinal = await prisma.produto.findUnique({
        where: { id },
        include: {
          categoria: true,
          estoques: { 
            where: { ativo: true },
            include: { tamanho: true, cor: true } 
          },
          imagens: true,
        }
      });

      return res.status(200).json(produtoFinal);
    } catch (error) {
      console.error('Erro ao atualizar produto:', error);
      return res.status(500).json({ message: 'Erro interno ao atualizar produto.' });
    }
  },
  
  async excluir(req: Request, res: Response) {
    try {
      const id = String(req.params.id);

      const produto = await prisma.produto.findUnique({
        where: { id },
        include: { imagens: true }
      });

      if (!produto) {
        return res.status(404).json({ message: 'Produto não encontrado.' });
      }

      // 1. Verifica se o produto possui alguma movimentação de estoque registrada
      const totalMovimentacoes = await prisma.movimentacaoEstoque.count({
        where: { produtoId: id }
      });

      // 2. Se tiver histórico, faz a exclusão lógica (Inativação) e NÃO apaga as imagens físicas nem o registro
      if (totalMovimentacoes > 0) {
        await prisma.produtoEstoque.updateMany({
          where: { produtoId: id },
          data: { ativo: false }
        });

        return res.status(200).json({ 
          message: 'Produto possui histórico de movimentações e foi inativado com sucesso.' 
        });
      }

      // 3. Se NÃO tiver histórico, prossegue com a exclusão completa (código original preservado)
      // Remove os arquivos físicos da pasta uploads do disco local
      produto.imagens.forEach(img => {
        try {
          const filename = img.url.split('/uploads/')[1];
          if (filename) {
            const filePath = path.resolve(__dirname, '..', '..', 'uploads', filename);
            if (fs.existsSync(filePath)) {
              fs.unlinkSync(filePath);
            }
          }
        } catch (err) {
          console.error('Erro ao apagar arquivo de imagem do disco:', err);
        }
      });

      // Remove as dependências antes de apagar o produto (evita erro de chave estrangeira caso não tenha cascade)
      await prisma.produtoEstoque.deleteMany({
        where: { produtoId: id }
      });

      await prisma.produtoImagem.deleteMany({
        where: { produtoId: id }
      });

      await prisma.produto.delete({
        where: { id },
      });

      return res.status(200).json({ message: 'Produto nunca foi movimentado e foi excluído completamente com sucesso.' });
    } catch (error) {
      console.error('Erro ao excluir produto:', error);
      return res.status(500).json({ message: 'Erro interno ao excluir produto.' });
    }
  },
};