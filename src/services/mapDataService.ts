// ==============================================================================
// SERVIÇO: CARREGAMENTO E NORMALIZAÇÃO DE DADOS GEOESPACIAIS (CSB / SEMA-MT)
// Consome:
// 1. Notificações XLSX (Google Sheets público)
// 2. Barragens SNISB CSV (ANA)
// 3. Barragens ANEEL CSV
// 4. Malha GeoJSON Municípios de Mato Grosso
// ==============================================================================

import * as XLSX from 'xlsx';

export interface NotificationItem {
  id: string;
  source: 'notificacao';
  numero: string;
  cpfCnpj?: string;
  empreendedor: string;
  propriedade?: string;
  car?: string;
  dataEmissao?: string;
  dataEmissaoDate?: Date | null;
  prazoDias?: number;
  dataFinal?: string;
  dataFinalDate?: Date | null;
  lat: number;
  lng: number;
  latRaw: string;
  lngRaw: string;
  municipio: string;
  resposta?: string;
  atendidoStatus: 'SIM' | 'NÃO' | 'OUTRO';
  status: 'pendente' | 'cumprida' | 'atrasada' | 'arquivada';
  diasAtraso?: number;
  obs?: string;
  anoPlanilha?: string;
}

export interface SnisbItem {
  id: string;
  source: 'snisb';
  codigoSnisb: string;
  nome: string;
  nomeSecundario?: string;
  empreendedor: string;
  tipoEmpreendedor?: string;
  municipio: string;
  usoPrincipal?: string;
  codEntidadeFiscal?: string;
  dpa: 'Alto' | 'Médio' | 'Baixo' | 'Não Classificado';
  cri?: string;
  classe?: string;
  lat: number;
  lng: number;
  cursoDagua?: string;
  reguladaPnsb?: string;
}

export interface AneelItem {
  id: string;
  source: 'aneel';
  codigoSnisb: string;
  nome: string;
  empreendedor: string;
  municipio: string;
  usoPrincipal?: string;
  lat: number;
  lng: number;
  dpa?: 'Alto' | 'Médio' | 'Baixo' | 'Não Classificado';
}

export interface GeoJsonMunicipalityFeature {
  type: 'Feature';
  properties: {
    id: string;
    name: string;
    description?: string;
  };
  geometry: any;
}

export interface GeoJsonMunicipalityCollection {
  type: 'FeatureCollection';
  features: GeoJsonMunicipalityFeature[];
}

/**
 * Converte qualquer representação de coordenada (GMS com :, com graus, decimal) para decimal negativo
 */
export function parseCoordinate(val: unknown, _isLat: boolean): number | null {
  if (val === null || val === undefined) return null;
  if (typeof val === 'number') {
    if (isNaN(val) || val === 0) return null;
    return -Math.abs(val);
  }
  const s = String(val).trim();
  if (!s) return null;

  // Formato com dois pontos: ex: -10:51:19,10 ou 10:51:19
  const colonMatch = s.match(/^([+-]?\d+)\s*[:]\s*(\d+)\s*[:]\s*(\d+(?:[.,]\d+)?)/);
  if (colonMatch) {
    const deg = Math.abs(parseInt(colonMatch[1], 10));
    const min = parseInt(colonMatch[2], 10);
    const sec = parseFloat(colonMatch[3].replace(',', '.'));
    const dec = deg + min / 60 + sec / 3600;
    return -Math.abs(dec);
  }

  // Formato GMS com graus, minutos, segundos (10º51'19,10" S ou 10° 51' 19")
  const gmsMatch = s.match(/([+-]?\d+)[º°\s]+(\d+)(?:['′\s]+(\d+(?:[.,]\d+)?))?[″"\s]*([NnSsEeWwOo])?/);
  if (gmsMatch) {
    const deg = Math.abs(parseInt(gmsMatch[1], 10));
    const min = parseInt(gmsMatch[2], 10);
    const sec = gmsMatch[3] ? parseFloat(gmsMatch[3].replace(',', '.')) : 0;
    const hemiChar = (gmsMatch[4] || '').toUpperCase();
    const dec = deg + min / 60 + sec / 3600;
    if (hemiChar === 'N' || hemiChar === 'E' || hemiChar === 'L') {
      return dec;
    }
    return -Math.abs(dec);
  }

  // Número puro decimal simples (ex: -11.928888 ou 11.928888)
  const num = parseFloat(s.replace(',', '.'));
  if (!isNaN(num) && num !== 0) {
    return -Math.abs(num);
  }

  return null;
}

/**
 * Converte número serial do Excel para objeto Date
 */
function excelSerialToDate(serial: number): Date | null {
  if (!serial || isNaN(serial) || serial < 1000) return null;
  // Excel base date: Dec 30 1899
  const utcDays = Math.floor(serial - 25569);
  const dateInfo = new Date(utcDays * 86400 * 1000);
  return dateInfo;
}

function formatDateBr(d: Date | null): string {
  if (!d || isNaN(d.getTime())) return '';
  return d.toLocaleDateString('pt-BR');
}

/**
 * Normaliza DPA
 */
export function normalizeDpa(val: string | undefined): 'Alto' | 'Médio' | 'Baixo' | 'Não Classificado' {
  if (!val) return 'Não Classificado';
  const clean = val.trim().toLowerCase();
  if (clean.includes('alto')) return 'Alto';
  if (clean.includes('médio') || clean.includes('medio')) return 'Médio';
  if (clean.includes('baixo')) return 'Baixo';
  return 'Não Classificado';
}

/**
 * 1. Carrega Planilha de Notificações
 */
export async function fetchNotifications(): Promise<NotificationItem[]> {
  const remoteUrl =
    'https://docs.google.com/spreadsheets/d/e/2PACX-1vRsNA_kn1hwAKLrBlErzLUV8yod3P_nRqHlzLHr6cWStOw8sEuodQTQLMycPfOQmA/pub?output=xlsx';
  const localUrl = '/data/notificacoes.xlsx';

  let buffer: ArrayBuffer;
  try {
    const res = await fetch(remoteUrl);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    buffer = await res.arrayBuffer();
  } catch (err) {
    console.warn('[MapDataService] Falha no link remoto de Notificações, tentando fallback local...', err);
    const res = await fetch(localUrl);
    buffer = await res.arrayBuffer();
  }

  const wb = XLSX.read(buffer, { type: 'array' });
  const items: NotificationItem[] = [];
  const now = new Date();

  wb.SheetNames.forEach(sheetName => {
    const sheet = wb.Sheets[sheetName];
    if (!sheet) return;
    const rows = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1 });
    if (!rows || rows.length < 2) return;

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || (!row[1] && !row[3])) continue;

      const numNotif = String(row[1] || '').trim();
      const emp = String(row[3] || '').trim();
      if (!numNotif && !emp) continue;

      const latVal = row[8];
      const lngVal = row[9];
      const lat = parseCoordinate(latVal, true);
      const lng = parseCoordinate(lngVal, false);

      // Validação de limites territoriais de Mato Grosso (~-18.5 a -7.0, ~-62.5 a -50.0)
      if (!lat || !lng || lat > -6 || lat < -19 || lng > -49 || lng < -63) {
        continue;
      }

      const cpfCnpj = row[2] ? String(row[2]).trim() : undefined;
      const propriedade = row[4] ? String(row[4]).trim() : undefined;
      const car = row[5] ? String(row[5]).trim() : undefined;
      const dataSerial = typeof row[6] === 'number' ? row[6] : parseFloat(String(row[6]));
      const dataEmissaoDate = !isNaN(dataSerial) ? excelSerialToDate(dataSerial) : null;
      const prazoDias = typeof row[7] === 'number' ? row[7] : parseInt(String(row[7])) || undefined;

      const finalSerial = typeof row[12] === 'number' ? row[12] : parseFloat(String(row[12]));
      let dataFinalDate = !isNaN(finalSerial) ? excelSerialToDate(finalSerial) : null;
      if (!dataFinalDate && dataEmissaoDate && prazoDias) {
        dataFinalDate = new Date(dataEmissaoDate.getTime() + prazoDias * 86400 * 1000);
      }

      const municipio = String(row[10] || 'Mato Grosso').trim();
      const resposta = row[13] ? String(row[13]).trim() : undefined;
      const atendidoRaw = String(row[14] || '').trim().toUpperCase();
      const obs = row[15] ? String(row[15]).trim() : undefined;

      // Status
      const isAtendido = atendidoRaw === 'SIM';
      const isArquivado =
        (obs && /arquiv|cancel/i.test(obs)) ||
        (resposta && /arquiv|cancel/i.test(resposta));

      let status: 'pendente' | 'cumprida' | 'atrasada' | 'arquivada' = 'pendente';
      let diasAtraso: number | undefined;

      if (isArquivado) {
        status = 'arquivada';
      } else if (isAtendido) {
        status = 'cumprida';
      } else {
        if (dataFinalDate && now.getTime() > dataFinalDate.getTime()) {
          status = 'atrasada';
          const diffMs = now.getTime() - dataFinalDate.getTime();
          diasAtraso = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        } else {
          status = 'pendente';
        }
      }

      items.push({
        id: `notif-${sheetName}-${i}-${numNotif || Math.random()}`,
        source: 'notificacao',
        numero: numNotif || 'Sem Nº',
        cpfCnpj,
        empreendedor: emp,
        propriedade,
        car,
        dataEmissao: formatDateBr(dataEmissaoDate),
        dataEmissaoDate,
        prazoDias,
        dataFinal: formatDateBr(dataFinalDate),
        dataFinalDate,
        lat,
        lng,
        latRaw: String(latVal || ''),
        lngRaw: String(lngVal || ''),
        municipio,
        resposta,
        atendidoStatus: isAtendido ? 'SIM' : atendidoRaw === 'NÃO' || atendidoRaw === 'NAO' ? 'NÃO' : 'OUTRO',
        status,
        diasAtraso,
        obs,
        anoPlanilha: sheetName
      });
    }
  });

  return items;
}

/**
 * Função utilitária para dividir CSV com suporte a aspas
 */
function parseCsvRows(text: string): string[][] {
  const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
  if (lines.length === 0) return [];

  return lines.map(line => {
    const row: string[] = [];
    let insideQuote = false;
    let entry = '';

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (insideQuote && line[i + 1] === '"') {
          entry += '"';
          i++;
        } else {
          insideQuote = !insideQuote;
        }
      } else if (char === ',' && !insideQuote) {
        row.push(entry);
        entry = '';
      } else {
        entry += char;
      }
    }
    row.push(entry);
    return row;
  });
}

/**
 * 2. Carrega Planilha SNISB (ANA)
 */
export async function fetchSnisbDams(): Promise<SnisbItem[]> {
  const remoteUrl =
    'https://docs.google.com/spreadsheets/d/18VwJZSAAsKU_qoJzAtxK3OxsyPNvkUD_rpZaZ1bdMnA/export?format=csv&gid=0';
  const localUrl = '/data/snisb.csv';

  let text: string;
  try {
    const res = await fetch(remoteUrl);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    text = await res.text();
  } catch (err) {
    console.warn('[MapDataService] Falha no link remoto de SNISB, usando fallback local...', err);
    const res = await fetch(localUrl);
    text = await res.text();
  }

  const rows = parseCsvRows(text);
  if (rows.length < 2) return [];

  const items: SnisbItem[] = [];

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.length < 10) continue;

    const codigoSnisb = r[0]?.trim();
    const nome = r[1]?.trim();
    if (!codigoSnisb && !nome) continue;

    const lat = parseCoordinate(r[20], true);
    const lng = parseCoordinate(r[21], false);

    if (!lat || !lng || lat > -6 || lat < -19 || lng > -49 || lng < -63) {
      continue;
    }

    items.push({
      id: `snisb-${codigoSnisb || i}`,
      source: 'snisb',
      codigoSnisb: codigoSnisb || 'S/N',
      nome: nome || 'Barragem sem denominação',
      nomeSecundario: r[2]?.trim() || undefined,
      empreendedor: r[4]?.trim() || 'Não informado',
      tipoEmpreendedor: r[5]?.trim() || undefined,
      municipio: r[6]?.trim() || 'Mato Grosso',
      codEntidadeFiscal: r[9]?.trim() || undefined,
      usoPrincipal: r[10]?.trim() || undefined,
      dpa: normalizeDpa(r[14]),
      cri: r[13]?.trim() || undefined,
      classe: r[15]?.trim() || undefined,
      lat,
      lng,
      cursoDagua: r[17]?.trim() || undefined,
      reguladaPnsb: r[22]?.trim() || undefined
    });
  }

  return items;
}

/**
 * 3. Carrega Planilha ANEEL
 */
export async function fetchAneelDams(): Promise<AneelItem[]> {
  const remoteUrl =
    'https://docs.google.com/spreadsheets/d/1v0aoi5XIGqwlI7pyhev5bWEoiNW98ToNQbXtXaYCdwc/export?format=csv&gid=0';
  const localUrl = '/data/aneel.csv';

  let text: string;
  try {
    const res = await fetch(remoteUrl);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    text = await res.text();
  } catch (err) {
    console.warn('[MapDataService] Falha no link remoto de ANEEL, usando fallback local...', err);
    const res = await fetch(localUrl);
    text = await res.text();
  }

  const rows = parseCsvRows(text);
  if (rows.length < 2) return [];

  const items: AneelItem[] = [];

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.length < 10) continue;

    const codigoSnisb = r[0]?.trim();
    const nome = r[1]?.trim();
    if (!codigoSnisb && !nome) continue;

    const lat = parseCoordinate(r[20], true);
    const lng = parseCoordinate(r[21], false);

    if (!lat || !lng || lat > -6 || lat < -19 || lng > -49 || lng < -63) {
      continue;
    }

    items.push({
      id: `aneel-${codigoSnisb || i}`,
      source: 'aneel',
      codigoSnisb: codigoSnisb || 'S/N',
      nome: nome || 'UHE/PCH sem denominação',
      empreendedor: r[4]?.trim() || 'Concessionária / Não informado',
      municipio: r[6]?.trim() || 'Mato Grosso',
      usoPrincipal: r[10]?.trim() || 'Hidroelétrica',
      lat,
      lng,
      dpa: normalizeDpa(r[14])
    });
  }

  return items;
}

/**
 * 4. Carrega GeoJSON dos Municípios de MT
 */
export async function fetchMatoGrossoGeoJson(): Promise<GeoJsonMunicipalityCollection | null> {
  const remoteUrl =
    'https://raw.githubusercontent.com/tbrugz/geodata-br/master/geojson/geojs-51-mun.json';
  const localUrl = '/data/mt-mun.json';

  try {
    const res = await fetch(remoteUrl);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    console.warn('[MapDataService] Falha no link remoto do GeoJSON MT, usando fallback local...', err);
    try {
      const res = await fetch(localUrl);
      return await res.json();
    } catch (localErr) {
      console.error('[MapDataService] Falha ao carregar GeoJSON local:', localErr);
      return null;
    }
  }
}
