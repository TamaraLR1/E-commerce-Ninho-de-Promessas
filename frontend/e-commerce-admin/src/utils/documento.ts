export type TipoPessoa = 'PF' | 'PJ';

/**
 * Remove máscara mantendo letras e números (ideal para CNPJ alfanumérico)
 */
export function limparDocumento(valor: string): string {
  return (valor || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 14);
}

/**
 * Formata CPF (11 dígitos) ou CNPJ alfanumérico (14 caracteres: XX.XXX.XXX/XXXX-DD)
 */
export function formatarCnpjAlfanumerico(valor: string): string {
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
export function validarCnpjAlfanumerico(valor: string): boolean {
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