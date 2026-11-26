export type TipoPessoa = 'PF' | 'PJ';

/**
 * Remove máscara mantendo letras e números (ideal para CNPJ alfanumérico)
 */
export function limparDocumento(valor?: string | null): string {
  return (valor || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 14);
}

/**
 * Formata CPF (000.000.000-00)
 */
export function formatarCpf(valor?: string | null): string {
  const digits = (valor || '').replace(/\D/g, '').slice(0, 11);

  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9, 11)}`;
}

/**
 * Formata telefone celular ((00) 00000-0000) ou fixo ((00) 0000-0000)
 */
export function formatarTelefone(valor?: string | null): string {
  const digits = (valor || '').replace(/\D/g, '').slice(0, 11);

  if (digits.length === 0) return '';
  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7, 11)}`;
}

/**
 * Formata CEP (00000-000)
 */
export function formatarCep(valor?: string | null): string {
  const digits = (valor || '').replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 5) return digits;
  return `${digits.slice(0, 5)}-${digits.slice(5, 8)}`;
}

/**
 * Formata CNPJ numérico ou alfanumérico (14 caracteres: XX.XXX.XXX/XXXX-DD)
 */
export function formatarCnpjAlfanumerico(valor?: string | null): string {
  const limpo = limparDocumento(valor);

  if (limpo.length <= 2) return limpo;
  if (limpo.length <= 5) return `${limpo.slice(0, 2)}.${limpo.slice(2)}`;
  if (limpo.length <= 8) return `${limpo.slice(0, 2)}.${limpo.slice(2, 5)}.${limpo.slice(5)}`;
  if (limpo.length <= 12) {
    return `${limpo.slice(0, 2)}.${limpo.slice(2, 5)}.${limpo.slice(5, 8)}/${limpo.slice(8)}`;
  }

  return `${limpo.slice(0, 2)}.${limpo.slice(2, 5)}.${limpo.slice(5, 8)}/${limpo.slice(8, 12)}-${limpo.slice(12, 14)}`;
}

/**
 * Converte caractere alfanumérico para valor numérico da tabela ASCII (- 48)
 * Ex.: '0' -> 0 | 'A' -> 17 (65 - 48)
 */
function valorCaractereCnpj(char: string): number {
  const code = char.charCodeAt(0);
  if (code >= 48 && code <= 57) return code - 48; // 0-9
  if (code >= 65 && code <= 90) return code - 48; // A-Z (17 a 42)
  return -1;
}

/**
 * Valida CNPJ numérico ou alfanumérico (14 caracteres, 2 últimos dígitos numéricos)
 */
export function validarCnpjAlfanumerico(valor?: string | null): boolean {
  const cnpj = limparDocumento(valor);

  if (cnpj.length !== 14) return false;

  // Os 12 primeiros podem ser A-Z ou 0-9; os 2 últimos (DV) são obrigatoriamente 0-9
  const base12 = cnpj.slice(0, 12);
  const dvInformado = cnpj.slice(12, 14);

  if (!/^[A-Z0-9]{12}$/.test(base12)) return false;
  if (!/^[0-9]{2}$/.test(dvInformado)) return false;

  // Rejeita sequências repetidas inválidas
  if (/^([A-Z0-9])\1{13}$/.test(cnpj)) return false;

  const pesosDv1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const pesosDv2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

  let soma1 = 0;
  for (let i = 0; i < 12; i++) {
    const val = valorCaractereCnpj(base12[i]);
    if (val < 0) return false;
    soma1 += val * pesosDv1[i];
  }
  const resto1 = soma1 % 11;
  const dv1Calculado = resto1 < 2 ? 0 : 11 - resto1;

  const base13 = `${base12}${dv1Calculado}`;
  let soma2 = 0;
  for (let i = 0; i < 13; i++) {
    const val = valorCaractereCnpj(base13[i]);
    if (val < 0) return false;
    soma2 += val * pesosDv2[i];
  }
  const resto2 = soma2 % 11;
  const dv2Calculado = resto2 < 2 ? 0 : 11 - resto2;

  return dvInformado === `${dv1Calculado}${dv2Calculado}`;
}

/**
 * Retorna documento numérico para o campo identification do Mercado Pago.
 * Se for CNPJ alfanumérico, converte de forma determinística para 14 dígitos numéricos
 * sem alterar o CNPJ original salvo no pedido, banco ou NF-e.
 */
export function normalizarDocumentoMercadoPago(
  tipo: TipoPessoa,
  documento?: string | null
): string {
  if (tipo === 'PF') {
    return (documento || '').replace(/\D/g, '').slice(0, 11);
  }

  const limpo = limparDocumento(documento);
  const apenasDigitos = limpo.replace(/\D/g, '');
  if (apenasDigitos.length === 14) {
    return apenasDigitos;
  }

  const expandido = limpo
    .split('')
    .map((char) => String(valorCaractereCnpj(char)))
    .join('');

  const base12 = expandido.padEnd(12, '0').slice(0, 12).split('').map(Number);
  const pesos1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const soma1 = base12.reduce((acc, n, idx) => acc + n * pesos1[idx], 0);
  const resto1 = soma1 % 11;
  const dv1 = resto1 < 2 ? 0 : 11 - resto1;

  const base13 = [...base12, dv1];
  const pesos2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const soma2 = base13.reduce((acc, n, idx) => acc + n * pesos2[idx], 0);
  const resto2 = soma2 % 11;
  const dv2 = resto2 < 2 ? 0 : 11 - resto2;

  return `${base13.join('')}${dv2}`;
}