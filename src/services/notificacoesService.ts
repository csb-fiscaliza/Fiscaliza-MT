// ==============================================================================
// SERVIÇO: BUSCA E TRATAMENTO DE COORDENADAS (src/services/notificacoesService.ts)
// Integração em tempo real com a tabela 'notificacoes' do banco Supabase
// ==============================================================================

import { supabase, isSupabaseConfigured } from '../lib/supabase';

export interface NotificacaoPontoMapa {
  id: string;
  numNotificacao: string;
  empreendedor: string;
  cpfCnpj: string;
  municipio: string;
  lat: number;
  long: number;
  situacao: string;
  dataEmissao: string;
  prazo: string;
  respostaFinal: string;
  origem: 'Nova';
}

// Converte Decimal ou GMS (ex: 15° 30' 45" S ou -15:30:45) para float numérico
export function parseCoordinate(coord: any): number {
  if (!coord) return NaN;
  if (typeof coord === 'number') {
    if (isNaN(coord)) return NaN;
    return coord > 0 && coord <= 90 ? -coord : coord;
  }
  const str = String(coord).trim();
  if (!str) return NaN;

  // Decimal numérico direto
  const num = parseFloat(str.replace(',', '.'));
  if (!isNaN(num) && /^-?\d+(\.\d+)?$/.test(str.replace(',', '.'))) {
    return num > 0 && num <= 90 ? -num : num;
  }

  // Formato colon (ex: -15:30:45,20 ou 15:30:45)
  const colonMatch = str.match(/^([+-]?\d+)\s*[:]\s*(\d+)\s*[:]\s*(\d+(?:[.,]\d+)?)/);
  if (colonMatch) {
    const deg = Math.abs(parseInt(colonMatch[1], 10));
    const min = parseInt(colonMatch[2], 10);
    const sec = parseFloat(colonMatch[3].replace(',', '.'));
    const dec = deg + min / 60 + sec / 3600;
    return -Math.abs(dec);
  }

  // Formato GMS com graus, minutos, segundos e hemisfério
  const gmsMatch = str.match(/(\d+)[°º\s]+(\d+)['\s]+([0-9.,]+)["\s]*([NSEWOG])?/i);
  if (gmsMatch) {
    const deg = parseFloat(gmsMatch[1]);
    const min = parseFloat(gmsMatch[2]);
    const sec = parseFloat(gmsMatch[3].replace(',', '.'));
    const dir = (gmsMatch[4] || '').toUpperCase();
    let dec = deg + min / 60 + sec / 3600;
    if (dir === 'S' || dir === 'W' || dir === 'O' || !dir) dec = -dec;
    return dec;
  }

  return NaN;
}

/**
 * Converte um registro bruto do Supabase (com payload JSON) em NotificacaoPontoMapa
 */
export function rowToNotificacaoPontoMapa(row: any): NotificacaoPontoMapa | null {
  if (!row) return null;

  const payload = typeof row.payload === 'string' 
    ? (() => {
        try { return JSON.parse(row.payload); } catch { return {}; }
      })() 
    : (row.payload || {});

  const rawLat = payload.lat || payload.latitude || row.lat || row.latitude;
  const rawLong = payload.long || payload.longitude || row.long || row.longitude;

  const lat = parseCoordinate(rawLat);
  const lng = parseCoordinate(rawLong);

  if (isNaN(lat) || isNaN(lng)) {
    return null;
  }

  return {
    id: String(row.id || payload.id || Math.random()),
    numNotificacao: payload.notificacaoGerada ? `Notif. ${payload.notificacaoGerada}` : (row.numero_notificacao || row.processo || 'S/N'),
    empreendedor: row.identificacao_empreendedor || payload.empreendedorNome || payload.empreendedor || 'Não informado',
    cpfCnpj: row.cpf_cnpj || payload.documentoIdentificacao || payload.cpfCnpj || '',
    municipio: row.municipio || payload.municipioEmpreendimento || payload.municipio || '',
    lat,
    long: lng,
    situacao: payload.situacao || row.status || 'Em aberto',
    dataEmissao: payload.dataNotificacao || row.data_emissao || row.created_at?.split('T')[0] || '',
    prazo: payload.prazoVencimento || row.prazo || '',
    respostaFinal: payload.objetivo || payload.resposta || row.resposta || '',
    origem: 'Nova'
  };
}

export async function fetchNovasNotificacoes(): Promise<NotificacaoPontoMapa[]> {
  if (!isSupabaseConfigured) {
    return [];
  }

  try {
    const { data, error } = await supabase
      .from('notificacoes')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      if (error.code === 'PGRST205' || error.message?.includes('schema cache')) {
        console.info('[Supabase Realtime] Tabela "notificacoes" aguardando registros no banco.');
      } else if (error.code === 'PGRST125') {
        console.warn('[Supabase Realtime] Verifique a URL do Supabase no ambiente (.env).');
      } else {
        console.warn('[Supabase Realtime] Aviso ao consultar notificações:', error.message || error);
      }
      return [];
    }

    const pontos: NotificacaoPontoMapa[] = [];

    (data || []).forEach((row) => {
      const ponto = rowToNotificacaoPontoMapa(row);
      if (ponto) {
        pontos.push(ponto);
      }
    });

    return pontos;
  } catch (err) {
    console.error('[Supabase Realtime] Exceção ao buscar notificações:', err);
    return [];
  }
}
