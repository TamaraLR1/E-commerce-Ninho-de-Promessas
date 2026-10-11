"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.motivoController = void 0;
const prisma_1 = require("../lib/prisma");
exports.motivoController = {
    async criar(req, res) {
        try {
            const { nome, tipo } = req.body;
            // Captura o ID do admin logado
            const rawAdminId = req.admin?.id || req.admin?.adminId || req.user?.id || req.user?.adminId;
            const adminId = rawAdminId ? Number(rawAdminId) : null;
            // Validação básica
            if (!nome || !tipo) {
                return res.status(400).json({ message: 'Nome e tipo (ENTRADA ou SAIDA) são obrigatórios.' });
            }
            // Valida se o tipo é válido
            const tipoUpper = tipo.toUpperCase();
            if (tipoUpper !== 'ENTRADA' && tipoUpper !== 'SAIDA') {
                return res.status(400).json({ message: 'O tipo deve ser "ENTRADA" ou "SAIDA".' });
            }
            // Verifica se já existe um motivo com esse nome exato
            const motivoExiste = await prisma_1.prisma.motivoEstoque.findUnique({
                where: { nome }
            });
            if (motivoExiste) {
                return res.status(400).json({ message: 'Já existe um motivo cadastrado com esse nome.' });
            }
            // Cria o novo motivo no banco
            const novoMotivo = await prisma_1.prisma.motivoEstoque.create({
                data: {
                    nome,
                    tipo: tipoUpper,
                },
            });
            // 📝 Registra o log de cadastro do motivo
            if (adminId) {
                await prisma_1.prisma.logAtividade.create({
                    data: {
                        adminId: adminId,
                        acao: `Cadastrou o motivo de estoque "${novoMotivo.nome}" (${novoMotivo.tipo})`
                    }
                });
            }
            return res.status(201).json({
                message: 'Motivo de estoque cadastrado com sucesso!',
                motivo: novoMotivo,
            });
        }
        catch (error) {
            console.error('Erro ao cadastrar motivo de estoque:', error);
            return res.status(500).json({ message: 'Erro interno ao cadastrar motivo.' });
        }
    },
    async editar(req, res) {
        try {
            const id = String(req.params.id);
            const { nome, tipo } = req.body;
            // Captura o ID do admin logado
            const rawAdminId = req.admin?.id || req.admin?.adminId || req.user?.id || req.user?.adminId;
            const adminId = rawAdminId ? Number(rawAdminId) : null;
            // Validação básica
            if (!nome || !tipo) {
                return res.status(400).json({ message: 'Nome e tipo (ENTRADA ou SAIDA) são obrigatórios.' });
            }
            // Valida se o tipo é válido
            const tipoUpper = tipo.toUpperCase();
            if (tipoUpper !== 'ENTRADA' && tipoUpper !== 'SAIDA') {
                return res.status(400).json({ message: 'O tipo deve ser "ENTRADA" ou "SAIDA".' });
            }
            // Verifica se o motivo a ser editado existe
            const motivoExistente = await prisma_1.prisma.motivoEstoque.findUnique({
                where: { id }
            });
            if (!motivoExistente) {
                return res.status(404).json({ message: 'Motivo de estoque não encontrado.' });
            }
            // Verifica se já existe OUTRO motivo com o mesmo nome que está tentando atualizar
            const nomeDuplicado = await prisma_1.prisma.motivoEstoque.findFirst({
                where: {
                    nome,
                    NOT: { id }
                }
            });
            if (nomeDuplicado) {
                return res.status(400).json({ message: 'Já existe outro motivo cadastrado com esse nome.' });
            }
            // Atualiza o motivo no banco
            const motivoAtualizado = await prisma_1.prisma.motivoEstoque.update({
                where: { id },
                data: {
                    nome,
                    tipo: tipoUpper,
                },
            });
            // 📝 Registra o log de atualização do motivo
            if (adminId) {
                await prisma_1.prisma.logAtividade.create({
                    data: {
                        adminId: adminId,
                        acao: `Atualizou o motivo de estoque "${motivoExistente.nome}" para "${motivoAtualizado.nome}" (${motivoAtualizado.tipo})`
                    }
                });
            }
            return res.status(200).json({
                message: 'Motivo de estoque atualizado com sucesso!',
                motivo: motivoAtualizado,
            });
        }
        catch (error) {
            console.error('Erro ao atualizar motivo de estoque:', error);
            return res.status(500).json({ message: 'Erro interno ao atualizar motivo.' });
        }
    },
    async listarMotivos(req, res) {
        try {
            const { tipo } = req.query;
            const whereClause = tipo ? { tipo: String(tipo).toUpperCase() } : {};
            const motivos = await prisma_1.prisma.motivoEstoque.findMany({
                where: whereClause,
                orderBy: { nome: 'asc' },
            });
            return res.json(motivos);
        }
        catch (error) {
            console.error('Erro ao listar motivos de estoque:', error);
            return res.status(500).json({ error: 'Erro interno ao buscar motivos.' });
        }
    },
    async inativar(req, res) {
        try {
            const id = String(req.params.id);
            // Captura o ID do admin logado
            const rawAdminId = req.admin?.id || req.admin?.adminId || req.user?.id || req.user?.adminId;
            const adminId = rawAdminId ? Number(rawAdminId) : null;
            // Verifica se o motivo existe no banco
            const motivoExistente = await prisma_1.prisma.motivoEstoque.findUnique({
                where: { id },
            });
            if (!motivoExistente) {
                return res.status(404).json({ message: 'Motivo de estoque não encontrado.' });
            }
            // 1. Verifica se existem movimentações vinculadas a este motivo
            const movimentacoesVinculadas = await prisma_1.prisma.movimentacaoEstoque.findMany({
                where: { motivoId: id },
                select: { id: true }
            });
            // 2. Se não houver vínculos, exclui permanentemente do banco de dados
            if (movimentacoesVinculadas.length === 0) {
                await prisma_1.prisma.motivoEstoque.delete({
                    where: { id }
                });
                // 📝 Registra o log de exclusão permanente do motivo
                if (adminId) {
                    await prisma_1.prisma.logAtividade.create({
                        data: {
                            adminId: adminId,
                            acao: `Excluiu permanentemente o motivo de estoque "${motivoExistente.nome || id}"`
                        }
                    });
                }
                return res.status(200).json({
                    message: 'Motivo de estoque sem vínculos foi excluído permanentemente com sucesso!'
                });
            }
            // 3. Se houver vínculos, alterna o status de 'ativo' (inativação / reativação)
            const motivoAtualizado = await prisma_1.prisma.motivoEstoque.update({
                where: { id },
                data: {
                    ativo: !motivoExistente.ativo,
                },
            });
            const acao = motivoAtualizado.ativo ? 'reativado' : 'inativado';
            // 📝 Registra o log de inativação ou reativação
            if (adminId) {
                const nomeMotivo = motivoAtualizado.nome || id;
                await prisma_1.prisma.logAtividade.create({
                    data: {
                        adminId: adminId,
                        acao: `${motivoAtualizado.ativo ? 'Reativou' : 'Inativou'} o motivo de estoque "${nomeMotivo}"`
                    }
                });
            }
            return res.status(200).json({
                message: `Motivo de estoque ${acao} com sucesso!`,
                motivo: motivoAtualizado,
            });
        }
        catch (error) {
            console.error('Erro ao processar motivo de estoque:', error);
            return res.status(500).json({ message: 'Erro interno ao processar motivo de estoque.' });
        }
    },
};
