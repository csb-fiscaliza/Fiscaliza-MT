// ==============================================================================
// UTILITÁRIO: CONVERSÃO DE COORDENADAS GEOGRÁFICAS (DECIMAL <-> GMS)
// Formato padrão SEMA-MT (Datum SIRGAS 2000)
// ==============================================================================

export interface GmsCoordinate {
  graus: number;
  minutos: number;
  segundos: number;
  hemisferio: 'N' | 'S' | 'E' | 'W';
}

/**
 * Converte valor decimal para Graus, Minutos e Segundos (GMS)
 */
export function decimalToGms(decimal: number | null | undefined, isLatitude: boolean): GmsCoordinate | null {
  if (decimal === null || decimal === undefined || isNaN(decimal)) {
    return null;
  }

  const hemisferio: 'N' | 'S' | 'E' | 'W' = isLatitude
    ? decimal >= 0 ? 'N' : 'S'
    : decimal >= 0 ? 'E' : 'W';

  const abs = Math.abs(decimal);
  const graus = Math.floor(abs);
  const minutosDecimal = (abs - graus) * 60;
  const minutos = Math.floor(minutosDecimal);
  const segundos = parseFloat(((minutosDecimal - minutos) * 60).toFixed(2));

  return { graus, minutos, segundos, hemisferio };
}

/**
 * Formata GMS em texto legível para documentos oficiais
 * ex: 16° 15' 26.64" S
 */
export function formatGmsString(decimal: number | null | undefined, isLatitude: boolean): string {
  const gms = decimalToGms(decimal, isLatitude);
  if (!gms) return 'Não informada';
  return `${gms.graus}° ${gms.minutos}' ${gms.segundos.toFixed(2)}" ${gms.hemisferio}`;
}

/**
 * Converte GMS para Graus Decimais
 */
export function gmsToDecimal(graus: number, minutos: number, segundos: number, hemisferio: 'N' | 'S' | 'E' | 'W'): number {
  const decimal = Math.abs(graus) + (minutos / 60) + (segundos / 3600);
  return (hemisferio === 'S' || hemisferio === 'W') ? -decimal : decimal;
}
