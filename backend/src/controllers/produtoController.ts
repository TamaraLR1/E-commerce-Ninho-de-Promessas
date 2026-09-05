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
          imagens: true,
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
      const { nome, preco, descricao, categoryId, tamanhos } = req.body;
      const arquivos = req.files as Express.Multer.File[];

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
          isVisible: false,
          criadoPorId: adminId,
          atualizadoPorId: adminId,

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
          criadoPor: true,    
          atualizadoPor: true,
        },
      });

      if (adminId) {
        await prisma.logAtividade.create({
          data: {
            adminId: adminId,
            acao: `Cadastrou o produto "${nome}"`
          }
        });
      }

      const produtoFormatado = formatarProduto(novoProduto);

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
      const id = String(req.params.id);
      const { nome, preco, descricao, categoryId, tamanhos, imagensMantidas, isVisible } = req.body;
      const novosArquivos = req.files as Express.Multer.File[];

      const rawAdminId = (req as any).admin?.id || (req as any).admin?.adminId || (req as any).user?.id || (req as any).user?.adminId;
      const adminId = rawAdminId ? Number(rawAdminId) : null;

      const produtoExistente = await prisma.produto.findUnique({
        where: { id },
        include: { imagens: true, estoques: true, categoria: true }
      });

      if (!produtoExistente) {
        return res.status(404).json({ message: 'Produto não encontrado.' });
      }

      let houveAlteracaoReal = false;
      const tamanhosParsed = typeof tamanhos === 'string' ? JSON.parse(tamanhos) : tamanhos;

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

      if (novosArquivos && novosArquivos.length > 0) {
        houveAlteracaoReal = true;
      }
      const imagensParaRemover = produtoExistente.imagens.filter(
        img => !imagensMantidasParsed.includes(img.url)
      );
      if (imagensParaRemover.length > 0) {
        houveAlteracaoReal = true;
        const idsParaDeletar = imagensParaRemover.map(img => img.id);
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
      const nomeFinal = nome || produtoExistente.nome;
      const descricaoFinal = descricao !== undefined ? descricao : produtoExistente.descricao;
      const categoryIdFinal = categoryId ? String(categoryId) : produtoExistente.categoryId;
      
      const isVisibleFinal = isVisible !== undefined 
        ? (typeof isVisible === 'string' ? isVisible === 'true' : Boolean(isVisible)) 
        : produtoExistente.isVisible;

      if (
        nomeFinal !== produtoExistente.nome ||
        Number(precoNumerico.toFixed(2)) !== Number(produtoExistente.preco.toFixed(2)) ||
        descricaoFinal !== produtoExistente.descricao ||
        categoryIdFinal !== produtoExistente.categoryId ||
        isVisibleFinal !== produtoExistente.isVisible
      ) {
        houveAlteracaoReal = true;
      }

      await prisma.produto.update({
        where: { id },
        data: {
          nome: nomeFinal,
          preco: precoNumerico,
          descricao: descricaoFinal,
          categoryId: categoryIdFinal,
          isVisible: isVisibleFinal,
          atualizadoPorId: adminId, 
          imagens: {
            create: novasImagensCreate
          }
        }
      });

      for (const estoqueAtual of produtoExistente.estoques) {
        const tAtualId = String(estoqueAtual.tamanhoId || '');
        const cAtualId = estoqueAtual.corId ? String(estoqueAtual.corId) : null;

        const aindaEnviado = itensEnviados.some(
          (item) => item.tamanhoId === tAtualId && item.corId === cAtualId
        );

        if (!aindaEnviado) {
          houveAlteracaoReal = true;
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

          if (itemEncontrado && itemEncontrado.estoque !== estoqueAtual.estoque) {
            houveAlteracaoReal = true;
          }

          await prisma.produtoEstoque.update({
            where: { id: estoqueAtual.id },
            data: { 
              ativo: true,
              estoque: itemEncontrado ? itemEncontrado.estoque : estoqueAtual.estoque
            }
          });
        }
      }

      for (const itemNovo of itensEnviados) {
        const estoqueInativoExistente = produtoExistente.estoques.find(
          e => String(e.tamanhoId) === itemNovo.tamanhoId && 
               (e.corId ? String(e.corId) : null) === itemNovo.corId && 
               e.ativo === false
        );

        if (estoqueInativoExistente) {
          houveAlteracaoReal = true;
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
            houveAlteracaoReal = true;
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

      if (adminId && houveAlteracaoReal) {
        await prisma.logAtividade.create({
          data: {
            adminId: adminId,
            acao: `Atualizou os dados do produto "${nomeFinal}"`
          }
        });
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

      const produtoFormatado = formatarProduto(produtoFinal);

      const io = (req as any).io;
      if (io && produtoFormatado) {
        io.emit('produtoAtualizado', produtoFormatado);
      }

      return res.status(200).json(produtoFinal);
    } catch (error) {
      console.error('Erro ao atualizar produto:', error);
      return res.status(500).json({ message: 'Erro interno ao atualizar produto.' });
    }
  },
  
  async configurarOferta(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { discountType, promoValue } = req.body;

      if (!id) {
        return res.status(400).json({ message: 'O ID do produto é obrigatório.' });
      }

      const rawAdminId = (req as any).admin?.id || (req as any).admin?.adminId || (req as any).user?.id || (req as any).user?.adminId;
      const adminId = rawAdminId ? Number(rawAdminId) : null;

      const produtoExistente = await prisma.produto.findUnique({
        where: { id: String(id) },
      });

      if (!produtoExistente) {
        return res.status(404).json({ message: 'Produto não encontrado.' });
      }

      const precoOriginal = Number(produtoExistente.preco);
      let calculatedPromoPrice = 0;

      if (promoValue === null || promoValue === undefined || promoValue === '') {
        const produtoAtualizado = await prisma.produto.update({
          where: { id: String(id) },
          data: {
            temOferta: false,
            precoPromocional: 0,
          },
          include: {
            categoria: true,
            estoques: { include: { tamanho: true, cor: true } },
            imagens: true,
          },
        });

        if (adminId) {
          await prisma.logAtividade.create({
            data: {
              adminId: adminId,
              acao: `Removeu a oferta do produto "${produtoExistente.nome}"`
            }
          });
        }

        const produtoFormatado = formatarProduto(produtoAtualizado);

        const io = (req as any).io;
        if (io && produtoFormatado) {
          io.emit('produtoAtualizado', produtoFormatado);
        }

        return res.status(200).json({ message: 'Oferta removida com sucesso.', produto: produtoAtualizado });
      }

      const valorNumerico = Number(promoValue);
      if (isNaN(valorNumerico) || valorNumerico <= 0) {
        return res.status(400).json({ message: 'O valor promocional ou desconto deve ser maior que zero.' });
      }

      if (discountType === 'percentual') {
        if (valorNumerico > 100) {
          return res.status(400).json({ message: 'A porcentagem de desconto não pode ser superior a 100%.' });
        }
        calculatedPromoPrice = precoOriginal * (1 - valorNumerico / 100);
      } else if (discountType === 'fixo') {
        if (valorNumerico >= precoOriginal) {
          return res.status(400).json({ message: 'O preço promocional fixo deve ser menor que o preço original do produto.' });
        }
        calculatedPromoPrice = valorNumerico;
      } else {
        return res.status(400).json({ message: 'Tipo de desconto inválido. Use "percentual" ou "fixo".' });
      }

      const produtoAtualizado = await prisma.produto.update({
        where: { id: String(id) },
        data: {
          temOferta: true,
          precoPromocional: Number(calculatedPromoPrice.toFixed(2)),
        },
        include: {
          categoria: true,
          estoques: { include: { tamanho: true, cor: true } },
          imagens: true,
        },
      });

      if (adminId) {
        const descricaoOferta = discountType === 'percentual' 
          ? `${valorNumerico}% de desconto (R$ ${Number(calculatedPromoPrice.toFixed(2))})` 
          : `preço fixo de R$ ${Number(calculatedPromoPrice.toFixed(2))}`;

        await prisma.logAtividade.create({
          data: {
            adminId: adminId,
            acao: `Configurou oferta no produto "${produtoExistente.nome}": ${descricaoOferta}`
          }
        });
      }

      const produtoFormatado = formatarProduto(produtoAtualizado);

      const io = (req as any).io;
      if (io && produtoFormatado) {
        io.emit('produtoAtualizado', produtoFormatado);
      }

      return res.status(200).json({
        message: 'Oferta configurada com sucesso!',
        produto: produtoAtualizado,
      });

    } catch (error) {
      console.error('Erro ao configurar oferta:', error);
      return res.status(500).json({ message: 'Erro interno ao salvar oferta do produto.' });
    }
  },

  async atualizarVisibilidade(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { isVisible } = req.body;

      if (typeof isVisible !== 'boolean') {
        return res.status(400).json({ message: 'O campo isVisible deve ser um booleano (true ou false).' });
      }

      const produtoExistente = await prisma.produto.findUnique({
        where: { id: String(id) },
      });

      if (!produtoExistente) {
        return res.status(404).json({ message: 'Produto não encontrado.' });
      }

      const produtoAtualizado = await prisma.produto.update({
        where: { id: String(id) },
        data: { 
          isVisible: isVisible 
        },
        include: {
          categoria: true,
          estoques: { 
            where: { ativo: true },
            include: { tamanho: true, cor: true } 
          },
          imagens: true,
        }
      });

      // 🚀 Dispara o Socket.io com a formatação correta contendo o percentual de desconto
      const produtoFormatado = formatarProduto(produtoAtualizado);

      const io = (req as any).io;
      if (io && produtoFormatado) {
        io.emit('produtoAtualizado', produtoFormatado);
      }

      return res.status(200).json({ 
        message: 'Visibilidade atualizada com sucesso!', 
        produto: produtoAtualizado 
      });
    } catch (error) {
      console.error('Erro ao atualizar visibilidade do produto:', error);
      return res.status(500).json({ message: 'Erro interno ao atualizar a visibilidade.' });
    }
  },

  async excluir(req: Request, res: Response) {
    try {
      const id = String(req.params.id);

      const rawAdminId = (req as any).admin?.id || (req as any).admin?.adminId || (req as any).user?.id || (req as any).user?.adminId;
      const adminId = rawAdminId ? Number(rawAdminId) : null;

      const produto = await prisma.produto.findUnique({
        where: { id },
        include: { imagens: true }
      });

      if (!produto) {
        return res.status(404).json({ message: 'Produto não encontrado.' });
      }

      const totalMovimentacoes = await prisma.movimentacaoEstoque.count({
        where: { produtoId: id }
      });

      if (totalMovimentacoes > 0) {
        await prisma.produtoEstoque.updateMany({
          where: { produtoId: id },
          data: { ativo: false }
        });

        await prisma.produto.update({
          where: { id },
          data: { ativo: false }
        });

        if (adminId) {
          await prisma.logAtividade.create({
            data: {
              adminId: adminId,
              acao: `Inativou o produto "${produto.nome}"`
            }
          });
        }

        return res.status(200).json({ 
          message: 'Produto possui histórico de movimentações e foi inativado com sucesso.' 
        });
      }

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

      await prisma.produtoEstoque.deleteMany({
        where: { produtoId: id }
      });

      await prisma.produtoImagem.deleteMany({
        where: { produtoId: id }
      });

      await prisma.produto.delete({
        where: { id },
      });

      if (adminId) {
        await prisma.logAtividade.create({
          data: {
            adminId: adminId,
            acao: `Excluiu permanentemente o produto "${produto.nome}"`
          }
        });
      }

      return res.status(200).json({ message: 'Produto nunca foi movimentado e foi excluído completamente com sucesso.' });
    } catch (error) {
      console.error('Erro ao excluir produto:', error);
      return res.status(500).json({ message: 'Erro interno ao excluir produto.' });
    }
  },

  async reativar(req: Request, res: Response) {
    try {
      const { id } = req.params;

      const rawAdminId = (req as any).admin?.id || (req as any).admin?.adminId || (req as any).user?.id || (req as any).user?.adminId;
      const adminId = rawAdminId ? Number(rawAdminId) : null;

      const produto = await prisma.produto.findUnique({
        where: { id: String(id) },
        include: {
          estoques: {
            include: {
              tamanho: true,
              cor: true,
            }
          }
        }
      });

      if (!produto) {
        return res.status(404).json({ message: 'Produto não encontrado.' });
      }

      const temItemValidoParaAtivar = produto.estoques.some((item: any) => {
        const tamanhoAtivo = item.tamanho?.ativo !== false;
        const corAtiva = !item.cor || item.cor.ativo !== false;
        return tamanhoAtivo && corAtiva;
      });

      if (!temItemValidoParaAtivar) {
        return res.status(400).json({ 
          message: 'Não é possível reativar o produto pois ele não possui nenhuma cor ou tamanho ativo vinculado.' 
        });
      }

      const produtoReativado = await prisma.produto.update({
        where: { id: String(id) },
        data: { 
          ativo: true,
          estoques: {
            updateMany: {
              where: { produtoId: String(id) },
              data: { ativo: true }
            }
          }
        },
        include: {
          estoques: { include: { tamanho: true, cor: true } }
        }
      });

      if (adminId) {
        await prisma.logAtividade.create({
          data: {
            adminId: adminId,
            acao: `Reativou o produto "${produto.nome}"`
          }
        });
      }

      return res.status(200).json({ message: 'Produto reativado com sucesso!', produtoReativado });
    } catch (error) {
      console.error('Erro ao reativar produto:', error);
      return res.status(500).json({ message: 'Erro interno ao reativar produto.' });
    }
  },
};