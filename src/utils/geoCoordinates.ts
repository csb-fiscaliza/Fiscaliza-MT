// ==============================================================================
// UTILITÁRIO: CONVERSÃO E FORMATAÇÃO DE COORDENADAS GEOGRÁFICAS EM GMS
// Padrão CSB / SEMA-MT (Datum SIRGAS 2000)
// Formato estrito: xxºxx'xx,xx" (ex: 16º15'26,64" S ou 16º15'26,64")
// ==============================================================================

export interface GmsCoordinate {
  graus: number;
  minutos: number;
  segundos: number;
  hemisferio: 'N' | 'S' | 'E' | 'W';
}

/**
 * Converte valor numérico decimal para objeto estruturado GMS
 */
export function decimalToGms(decimal: number | null | undefined, isLatitude: boolean): GmsCoordinate | null {
  if (decimal === null || decimal === undefined || isNaN(decimal)) {
    return null;
  }

  const hemisferio: 'N' | 'S' | 'E' | 'W' = isLatitude
    ? decimal >= 0 ? 'N' : 'S'
    : decimal >= 0 ? 'E' : 'W';

  const abs = Math.abs(decimal);
  let graus = Math.floor(abs);
  const minutosDecimal = (abs - graus) * 60;
  let minutos = Math.floor(minutosDecimal);
  let segundos = parseFloat(((minutosDecimal - minutos) * 60).toFixed(2));

  // Ajuste de arredondamento em borda (ex: 59.999s -> 60.00s)
  if (segundos >= 59.995) {
    segundos = 0;
    minutos += 1;
    if (minutos >= 60) {
      minutos = 0;
      graus += 1;
    }
  }

  return { graus, minutos, segundos, hemisferio };
}

/**
 * Converte qualquer representação (GMS string ou decimal) em decimal com sinal
 * Suporta formatos:
 * - 16º15'26,64" S
 * - 16º15'26,64"
 * - -16.2574
 * - 16°15'26.64" S
 * - 16 15 26.64
 */
export function parseGmsToDecimal(
  input: string | number | null | undefined,
  isLatitude: boolean
): number | null {
  if (input === null || input === undefined || input === '') return null;

  if (typeof input === 'number') {
    return isNaN(input) ? null : input;
  }

  const clean = input.trim();
  if (!clean) return null;

  // Se já for número puro com ponto/vírgula decimal simples
  const directNum = parseFloat(clean.replace(',', '.'));
  if (!isNaN(directNum) && !clean.includes('º') && !clean.includes('°') && !clean.includes("'") && !clean.includes('"')) {
    return directNum;
  }

  // Regex abrangente para extrair Graus, Minutos, Segundos e Hemisfério
  // Suporta formatos: xxºxx'xx,xx", xxºxx'xx", xx°xx'xx.xx", xx 15 26.64, etc.
  const gmsRegex = /([+-]?\d+)[º°\s]+(\d+)(?:['′\s]+(\d+(?:[.,]\d+)?))?[″"\s]*([NnSsEeWwOo])?/;
  const match = clean.match(gmsRegex);

  if (match) {
    let graus = parseInt(match[1], 10);
    const minutos = parseInt(match[2], 10);
    const segundos = match[3] ? parseFloat(match[3].replace(',', '.')) : 0;
    const hemiChar = (match[4] || '').toUpperCase();

    const isNegativeSign = graus < 0 || match[1].startsWith('-');
    graus = Math.abs(graus);

    let decimal = graus + (minutos / 60) + (segundos / 3600);

    let isNegative = isNegativeSign;
    if (hemiChar) {
      if (hemiChar === 'S' || hemiChar === 'W' || hemiChar === 'O') {
        isNegative = true;
      } else if (hemiChar === 'N' || hemiChar === 'E' || hemiChar === 'L') {
        isNegative = false;
      }
    } else {
      // Padrão geográfico de Mato Grosso / Brasil Central:
      // Latitudes são ao Sul (negativas), Longitudes são a Oeste (negativas)
      isNegative = true;
    }

    return isNegative ? -Math.abs(decimal) : Math.abs(decimal);
  }

  // Fallback caso não encontre regex completa
  return !isNaN(directNum) ? directNum : null;
}

/**
 * Formata qualquer entrada de coordenada para o formato oficial GMS: xxºxx'xx,xx"
 * Exemplo padrão: 16º15'26,64" S ou 16º15'26,64"
 */
export function formatGmsString(
  input: string | number | null | undefined,
  isLatitude: boolean,
  includeHemisphere: boolean = false
): string {
  if (input === null || input === undefined || input === '') return '';

  const decimal = typeof input === 'number' ? input : parseGmsToDecimal(input, isLatitude);
  if (decimal === null || isNaN(decimal)) {
    return typeof input === 'string' ? input : '';
  }

  const gms = decimalToGms(decimal, isLatitude);
  if (!gms) return '';

  const gStr = String(gms.graus).padStart(2, '0');
  const mStr = String(gms.minutos).padStart(2, '0');
  const sStr = gms.segundos.toFixed(2).replace('.', ',').padStart(5, '0');
  const hStr = includeHemisphere ? ` ${gms.hemisferio}` : '';

  return `${gStr}º${mStr}'${sStr}"${hStr}`;
}

/**
 * Formata estritamente no padrão xxºxx'xx,xx" (sem hemisfério)
 */
export function formatGmsStrict(
  input: string | number | null | undefined,
  isLatitude: boolean
): string {
  return formatGmsString(input, isLatitude, false);
}

/**
 * Converte GMS para Graus Decimais
 */
export function gmsToDecimal(graus: number, minutos: number, segundos: number, hemisferio: 'N' | 'S' | 'E' | 'W'): number {
  const decimal = Math.abs(graus) + (minutos / 60) + (segundos / 3600);
  return (hemisferio === 'S' || hemisferio === 'W') ? -decimal : decimal;
}
