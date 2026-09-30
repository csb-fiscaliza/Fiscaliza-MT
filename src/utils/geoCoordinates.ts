// ==============================================================================
// UTILITÁRIO: CONVERSÃO, VALIDAÇÃO E MÁSCARA GMS (xxºxx'xx,xx")
// DOMÍNIO TERRITORIAL: ESTADO DE MATO GROSSO (SEMA-MT / CSB - SIRGAS 2000)
// ==============================================================================

export interface GmsCoordinate {
  graus: number;
  minutos: number;
  segundos: number;
  hemisferio: 'N' | 'S' | 'E' | 'W';
}

/**
 * Limites Geográficos Territoriais do Estado de Mato Grosso (Datum SIRGAS 2000)
 * - Latitude: ~07º00'00" S a ~18º10'00" S (Graus: 07 a 18 | Hemisfério: Sul)
 * - Longitude: ~50º00'00" W a ~62º00'00" W (Graus: 50 a 62 | Hemisfério: Oeste)
 */
export const MATO_GROSSO_BOUNDS = {
  latitude: {
    minDeg: 7,
    maxDeg: 18,
    minDecimal: -18.15,
    maxDecimal: -7.00,
    hemisferio: 'S' as const,
    label: '07º a 18º S'
  },
  longitude: {
    minDeg: 50,
    maxDeg: 62,
    minDecimal: -62.00,
    maxDecimal: -50.00,
    hemisferio: 'W' as const,
    label: '50º a 62º W'
  }
};

/**
 * Identifica automaticamente se uma coordenada pertence à Latitude ou Longitude no domínio de Mato Grosso
 */
export function detectMatoGrossoCoordType(input: string | number): 'latitude' | 'longitude' | null {
  const digits = String(input).replace(/\D/g, '');
  if (!digits || digits.length < 2) return null;
  const firstTwo = parseInt(digits.slice(0, 2), 10);
  if (firstTwo >= 7 && firstTwo <= 18) return 'latitude';
  if (firstTwo >= 50 && firstTwo <= 62) return 'longitude';
  return null;
}

/**
 * Converte valor numérico decimal para objeto estruturado GMS.
 * No domínio territorial de Mato Grosso:
 * - Latitude é sempre ao Sul ('S')
 * - Longitude é sempre a Oeste ('W')
 */
export function decimalToGms(decimal: number | null | undefined, isLatitude: boolean): GmsCoordinate | null {
  if (decimal === null || decimal === undefined || isNaN(decimal)) {
    return null;
  }

  // Domínio territorial de Mato Grosso: Latitude é sempre Sul (S) e Longitude é sempre Oeste (W)
  const hemisferio: 'N' | 'S' | 'E' | 'W' = isLatitude ? 'S' : 'W';

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
 * Converte qualquer representação (GMS string ou decimal) em decimal com sinal.
 * Compreende automaticamente o domínio de Mato Grosso:
 * Latitudes são sempre negativas (Sul) e Longitudes são sempre negativas (Oeste).
 */
export function parseGmsToDecimal(
  input: string | number | null | undefined,
  isLatitude: boolean
): number | null {
  if (input === null || input === undefined || input === '') return null;

  if (typeof input === 'number') {
    if (isNaN(input)) return null;
    // No domínio de Mato Grosso, latitudes e longitudes são sempre negativas
    return -Math.abs(input);
  }

  const clean = input.trim();
  if (!clean) return null;

  // Se já for número puro com ponto/vírgula decimal simples (ex: 16.2574 ou -16.2574)
  const directNum = parseFloat(clean.replace(',', '.'));
  if (!isNaN(directNum) && !clean.includes('º') && !clean.includes('°') && !clean.includes("'") && !clean.includes('"')) {
    // Domínio de Mato Grosso: sempre negativo (S/W)
    return -Math.abs(directNum);
  }

  // Regex para extrair Graus, Minutos, Segundos e Hemisfério opcional
  const gmsRegex = /([+-]?\d+)[º°\s]+(\d+)(?:['′\s]+(\d+(?:[.,]\d+)?))?[″"\s]*([NnSsEeWwOo])?/;
  const match = clean.match(gmsRegex);

  if (match) {
    let graus = parseInt(match[1], 10);
    const minutos = parseInt(match[2], 10);
    const segundos = match[3] ? parseFloat(match[3].replace(',', '.')) : 0;
    const hemiChar = (match[4] || '').toUpperCase();

    graus = Math.abs(graus);
    const decimal = graus + (minutos / 60) + (segundos / 3600);

    // Domínio Mato Grosso: sempre Sul / Oeste, a não ser que explicitamente especificado N ou E
    if (hemiChar === 'N' || hemiChar === 'E' || hemiChar === 'L') {
      return Math.abs(decimal);
    }
    return -Math.abs(decimal);
  }

  return !isNaN(directNum) ? -Math.abs(directNum) : null;
}

/**
 * Formata qualquer entrada de coordenada para o formato oficial GMS: xxºxx'xx,xx"
 */
export function formatGmsString(
  input: string | number | null | undefined,
  isLatitude: boolean,
  includeHemisphere: boolean = false
): string {
  if (input === null || input === undefined || input === '') return '';

  const decimal = typeof input === 'number' ? -Math.abs(input) : parseGmsToDecimal(input, isLatitude);
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
 * Converte GMS para Graus Decimais no domínio territorial de Mato Grosso (sempre negativo)
 */
export function gmsToDecimal(graus: number, minutos: number, segundos: number, hemisferio?: 'N' | 'S' | 'E' | 'W'): number {
  const decimal = Math.abs(graus) + (minutos / 60) + (segundos / 3600);
  if (hemisferio === 'N' || hemisferio === 'E') {
    return decimal;
  }
  return -decimal;
}

/**
 * Validação rigorosa no domínio territorial do Estado de Mato Grosso (CSB / SEMA-MT)
 * - Padrão GMS: xxºxx'xx,xx"
 * - Latitude MT: 07º00'00" a 18º10'00" S
 * - Longitude MT: 50º00'00" a 62º00'00" W
 */
export function validateGms(
  input: string | null | undefined,
  isLatitude: boolean,
  enforceMatoGrosso: boolean = true
): { isValid: boolean; error?: string } {
  if (!input || !input.trim()) {
    return { isValid: false, error: 'Coordenada obrigatória' };
  }

  const clean = input.trim();
  const bounds = isLatitude ? MATO_GROSSO_BOUNDS.latitude : MATO_GROSSO_BOUNDS.longitude;
  const label = isLatitude ? 'Latitude' : 'Longitude';

  // Se for decimal direto (ex: -16.2574 ou 16.2574)
  const directDec = parseFloat(clean.replace(',', '.'));
  if (!isNaN(directDec) && !clean.includes('º') && !clean.includes('°') && !clean.includes("'")) {
    const valInMT = -Math.abs(directDec);
    if (enforceMatoGrosso) {
      if (valInMT < bounds.minDecimal || valInMT > bounds.maxDecimal) {
        return { 
          isValid: false, 
          error: `${label} fora dos limites de Mato Grosso (${bounds.label})` 
        };
      }
    }
    return { isValid: true };
  }

  // Regex para formato GMS (xxºxx'xx,xx")
  const regex = /^(\d{1,3})[º°\s](\d{1,2})['′\s](\d{1,2}(?:[.,]\d{1,2})?)[″"\s]*([NSEWnsew])?$/;
  const match = clean.match(regex);

  if (!match) {
    return { isValid: false, error: 'Formato inválido. Utilize o padrão xxºxx\'xx,xx"' };
  }

  const graus = parseInt(match[1], 10);
  const minutos = parseInt(match[2], 10);
  const segundos = parseFloat(match[3].replace(',', '.'));

  if (minutos >= 60 || minutos < 0) {
    return { isValid: false, error: 'Minutos devem estar entre 0 e 59' };
  }
  if (segundos >= 60 || segundos < 0) {
    return { isValid: false, error: 'Segundos devem estar entre 0 e 59,99' };
  }

  // Validação dos limites territoriais de Mato Grosso
  if (enforceMatoGrosso) {
    if (graus < bounds.minDeg || graus > bounds.maxDeg) {
      return { 
        isValid: false, 
        error: `${label} fora dos limites de Mato Grosso (${bounds.label})` 
      };
    }
  }

  return { isValid: true };
}

/**
 * Aplica máscara de digitação interativa para coordenadas no padrão GMS: xxºxx'xx,xx"
 * Compreende automaticamente o domínio de Mato Grosso:
 * - Digitação contínua (ex: 16152664 -> 16º15'26,64" | 56371848 -> 56º37'18,48")
 * - Graus Decimais (ex: -16.2574 ou 16.2574)
 */
export function maskGms(val: string): string {
  if (!val) return '';

  const clean = val.trim();
  const isNegative = clean.startsWith('-');
  const unsigned = clean.replace(/^-/, '');

  // Preserva entrada decimal com ponto enquanto o usuário digita (ex: -16.2574)
  if (unsigned.includes('.') && !unsigned.includes('º') && !unsigned.includes('°') && !unsigned.includes("'")) {
    return isNegative ? `-${unsigned}` : unsigned;
  }

  // Se o usuário colou coordenadas completas com espaços (ex: "16 15 26.64" ou "16 15 26,64")
  const spaceParts = unsigned.split(/\s+/).filter(Boolean);
  if (spaceParts.length >= 3 && !unsigned.includes('º')) {
    const deg = spaceParts[0].padStart(2, '0');
    const min = spaceParts[1].padStart(2, '0');
    const sec = parseFloat(spaceParts[2].replace(',', '.')).toFixed(2).replace('.', ',').padStart(5, '0');
    return `${deg}º${min}'${sec}"`;
  }

  // Remove tudo que não for dígito
  const digits = unsigned.replace(/\D/g, '');
  if (!digits) {
    return isNegative ? '-' : '';
  }

  // No domínio de Mato Grosso, graus são sempre de 2 dígitos (Lat 07-18, Lon 50-62)
  const degLen = (digits.length >= 9 && digits.startsWith('0')) ? 3 : 2;

  if (digits.length <= degLen) {
    return digits;
  }
  if (digits.length <= degLen + 2) {
    return `${digits.slice(0, degLen)}º${digits.slice(degLen)}`;
  }
  if (digits.length <= degLen + 4) {
    return `${digits.slice(0, degLen)}º${digits.slice(degLen, degLen + 2)}'${digits.slice(degLen + 2)}`;
  }
  if (digits.length < degLen + 6) {
    return `${digits.slice(0, degLen)}º${digits.slice(degLen, degLen + 2)}'${digits.slice(degLen + 2, degLen + 4)},${digits.slice(degLen + 4)}`;
  }

  // 8 dígitos contínuos (ex: 16152664 -> 16º15'26,64" / 56371848 -> 56º37'18,48")
  const deg = digits.slice(0, degLen);
  const min = digits.slice(degLen, degLen + 2);
  const secInt = digits.slice(degLen + 2, degLen + 4);
  const secDec = digits.slice(degLen + 4, degLen + 6);
  return `${deg}º${min}'${secInt},${secDec}"`;
}

