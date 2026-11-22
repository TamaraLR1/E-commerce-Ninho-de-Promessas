"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EmpresaController = void 0;
const prisma_1 = require("../lib/prisma");
const documento_1 = require("../utils/documento");
const UFS_VALIDAS = new Set([
    'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO',
    'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI',
    'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
]);
const onlyDigits = (value) => (value ? value.replace(/\D/g, '') : '');
const cleanText = (value) => (typeof value === 'string' ? value.trim() : '');
class EmpresaController {
    async getEmpresa(req, res) {
        try {
            const userId = req.userId;
            const empresa = await prisma_1.prisma.empresa.findUnique({
                where: { userId },
                include: {
                    enderecoFiscal: true,
                },
            });
            const enderecoFiscalAvulso = !empresa
                ? await prisma_1.prisma.endereco.findFirst({
                    where: {
                        userId,
                        tipo: { in: ['FISCAL', 'AMBOS'] },
                    },
                    orderBy: { updatedAt: 'desc' },
                })
                : null;
            return res.json({
                empresa,
                enderecoFiscal: empresa?.enderecoFiscal ?? enderecoFiscalAvulso,
            });
        }
        catch (error) {
            console.error('Erro ao buscar dados da empresa:', error);
            return res.status(500).json({ error: 'Erro interno ao buscar dados fiscais.' });
        }
    }
    async upsertEmpresa(req, res) {
        try {
            const userId = req.userId;
            const { cnpj, razaoSocial, nomeFantasia, indicadorIE = 'NAO_CONTRIBUINTE', inscricaoEstadual, 
            // Endereço fiscal
            cep, rua, numero, complemento, bairro, cidade, estado, codigoIbge, } = req.body;
            const cleanCnpj = (0, documento_1.limparDocumento)(cnpj);
            const cleanCep = onlyDigits(cep);
            const razaoSocialLimpa = cleanText(razaoSocial);
            const nomeFantasiaLimpo = cleanText(nomeFantasia);
            const ruaLimpa = cleanText(rua);
            const numeroLimpo = cleanText(numero);
            const complementoLimpo = cleanText(complemento);
            const bairroLimpo = cleanText(bairro);
            const cidadeLimpa = cleanText(cidade);
            const ufLimpa = cleanText(estado).toUpperCase();
            const ieLimpa = cleanText(inscricaoEstadual);
            const ibgeLimpo = onlyDigits(codigoIbge);
            if (!razaoSocialLimpa ||
                cleanCep.length !== 8 ||
                !ruaLimpa ||
                !numeroLimpo ||
                !bairroLimpo ||
                !cidadeLimpa ||
                !UFS_VALIDAS.has(ufLimpa)) {
                return res.status(400).json({
                    error: 'Preencha Razão Social e o endereço fiscal completo com CEP (8 dígitos) e UF válidos.',
                });
            }
            if (indicadorIE === 'CONTRIBUINTE' && ieLimpa.length < 2) {
                return res.status(400).json({
                    error: 'Informe uma Inscrição Estadual válida para contribuintes do ICMS.',
                });
            }
            const empresaExistente = await prisma_1.prisma.empresa.findUnique({
                where: { userId },
                include: { enderecoFiscal: true },
            });
            if (!empresaExistente) {
                if (!(0, documento_1.validarCnpjAlfanumerico)(cleanCnpj)) {
                    return res.status(400).json({
                        error: 'Informe um CNPJ válido com 14 caracteres (números ou letras/números).',
                    });
                }
                const cnpjEmUso = await prisma_1.prisma.empresa.findUnique({
                    where: { cnpj: cleanCnpj },
                });
                if (cnpjEmUso) {
                    return res.status(400).json({ error: 'Este CNPJ já está cadastrado em outra conta.' });
                }
            }
            const resultado = await prisma_1.prisma.$transaction(async (tx) => {
                let enderecoFiscalId = empresaExistente?.enderecoFiscalId ?? null;
                if (enderecoFiscalId) {
                    await tx.endereco.update({
                        where: { id: enderecoFiscalId },
                        data: {
                            tipo: 'FISCAL',
                            principal: true,
                            destinatario: razaoSocialLimpa,
                            cep: cleanCep,
                            rua: ruaLimpa,
                            numero: numeroLimpo,
                            complemento: complementoLimpo || null,
                            bairro: bairroLimpo,
                            cidade: cidadeLimpa,
                            estado: ufLimpa,
                            codigoIbge: ibgeLimpo || null,
                        },
                    });
                }
                else {
                    const novoEnderecoFiscal = await tx.endereco.create({
                        data: {
                            tipo: 'FISCAL',
                            principal: true,
                            destinatario: razaoSocialLimpa,
                            cep: cleanCep,
                            rua: ruaLimpa,
                            numero: numeroLimpo,
                            complemento: complementoLimpo || null,
                            bairro: bairroLimpo,
                            cidade: cidadeLimpa,
                            estado: ufLimpa,
                            codigoIbge: ibgeLimpo || null,
                            userId,
                        },
                    });
                    enderecoFiscalId = novoEnderecoFiscal.id;
                }
                if (empresaExistente) {
                    return tx.empresa.update({
                        where: { id: empresaExistente.id },
                        data: {
                            razaoSocial: razaoSocialLimpa,
                            nomeFantasia: nomeFantasiaLimpo || null,
                            indicadorIE,
                            inscricaoEstadual: indicadorIE === 'CONTRIBUINTE' ? ieLimpa : null,
                            enderecoFiscalId,
                        },
                        include: {
                            enderecoFiscal: true,
                        },
                    });
                }
                return tx.empresa.create({
                    data: {
                        userId,
                        cnpj: cleanCnpj,
                        razaoSocial: razaoSocialLimpa,
                        nomeFantasia: nomeFantasiaLimpo || null,
                        indicadorIE,
                        inscricaoEstadual: indicadorIE === 'CONTRIBUINTE' ? ieLimpa : null,
                        enderecoFiscalId,
                    },
                    include: {
                        enderecoFiscal: true,
                    },
                });
            });
            return res.status(empresaExistente ? 200 : 201).json({
                message: empresaExistente
                    ? 'Dados da empresa atualizados com sucesso!'
                    : 'Empresa cadastrada com sucesso!',
                empresa: resultado,
            });
        }
        catch (error) {
            if (error.code === 'P2002') {
                return res.status(400).json({ error: 'Este CNPJ já está cadastrado no sistema.' });
            }
            console.error('Erro ao salvar dados da empresa:', error);
            return res.status(500).json({ error: 'Erro interno ao salvar dados da empresa.' });
        }
    }
    async upsertEnderecoFiscal(req, res) {
        try {
            const userId = req.userId;
            const { destinatario, cep, rua, numero, complemento, bairro, cidade, estado, codigoIbge, } = req.body;
            const cleanCep = onlyDigits(cep);
            const ruaLimpa = cleanText(rua);
            const numeroLimpo = cleanText(numero);
            const complementoLimpo = cleanText(complemento);
            const bairroLimpo = cleanText(bairro);
            const cidadeLimpa = cleanText(cidade);
            const ufLimpa = cleanText(estado).toUpperCase();
            const ibgeLimpo = onlyDigits(codigoIbge);
            if (cleanCep.length !== 8 ||
                !ruaLimpa ||
                !numeroLimpo ||
                !bairroLimpo ||
                !cidadeLimpa ||
                !UFS_VALIDAS.has(ufLimpa)) {
                return res.status(400).json({
                    error: 'Preencha todos os campos obrigatórios do endereço fiscal com CEP (8 dígitos) e UF válidos.',
                });
            }
            const user = await prisma_1.prisma.user.findUnique({
                where: { id: userId },
                include: { empresa: true },
            });
            if (!user) {
                return res.status(404).json({ error: 'Usuário não encontrado.' });
            }
            const nomePadrao = cleanText(destinatario) ||
                user.empresa?.razaoSocial ||
                `${user.nome} ${user.sobrenome}`.trim();
            const enderecoExistente = user.empresa?.enderecoFiscalId
                ? await prisma_1.prisma.endereco.findUnique({ where: { id: user.empresa.enderecoFiscalId } })
                : await prisma_1.prisma.endereco.findFirst({
                    where: { userId, tipo: 'FISCAL' },
                });
            const enderecoFiscal = enderecoExistente
                ? await prisma_1.prisma.endereco.update({
                    where: { id: enderecoExistente.id },
                    data: {
                        tipo: 'FISCAL',
                        destinatario: nomePadrao,
                        cep: cleanCep,
                        rua: ruaLimpa,
                        numero: numeroLimpo,
                        complemento: complementoLimpo || null,
                        bairro: bairroLimpo,
                        cidade: cidadeLimpa,
                        estado: ufLimpa,
                        codigoIbge: ibgeLimpo || null,
                    },
                })
                : await prisma_1.prisma.endereco.create({
                    data: {
                        tipo: 'FISCAL',
                        principal: false,
                        destinatario: nomePadrao,
                        cep: cleanCep,
                        rua: ruaLimpa,
                        numero: numeroLimpo,
                        complemento: complementoLimpo || null,
                        bairro: bairroLimpo,
                        cidade: cidadeLimpa,
                        estado: ufLimpa,
                        codigoIbge: ibgeLimpo || null,
                        userId,
                    },
                });
            if (user.empresa && !user.empresa.enderecoFiscalId) {
                await prisma_1.prisma.empresa.update({
                    where: { id: user.empresa.id },
                    data: { enderecoFiscalId: enderecoFiscal.id },
                });
            }
            return res.json({
                message: 'Endereço fiscal salvo com sucesso!',
                enderecoFiscal,
            });
        }
        catch (error) {
            console.error('Erro ao salvar endereço fiscal:', error);
            return res.status(500).json({ error: 'Erro interno ao salvar endereço fiscal.' });
        }
    }
}
exports.EmpresaController = EmpresaController;
