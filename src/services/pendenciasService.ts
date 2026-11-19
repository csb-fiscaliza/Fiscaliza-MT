import type {
  PendenciaDetailPayload,
  PendenciaHistoricoPayload,
  PendenciasListPayload,
  PendenciasTab
} from '../types/pendencias';
import { fiscalizaSupabase } from './ecosystemConfig';

export interface PendenciasServiceResult<T = void> {
  success: boolean;
  status?: number;
  data?: T;
  error?: string;
}

async function getRemoteAccessToken(): Promise<{ token?: string; error?: string }> {
  if (!fiscalizaSupabase) {
    return {
      error: 'Serviço Supabase do Fiscaliza não configurado neste ambiente.'
    };
  }

  try {
    const {
      data: { session },
      error
    } = await fiscalizaSupabase.auth.getSession();

    if (error || !session?.access_token) {
      return {
        error: 'Sessão remota autenticada obrigatória para consultar o módulo de pendências.'
      };
    }

    return { token: session.access_token };
  } catch {
    return {
      error: 'Falha ao obter o token de sessão autenticada.'
    };
  }
}

async function fetchPendenciasEndpoint<T>(path: string): Promise<PendenciasServiceResult<T>> {
  const tokenRes = await getRemoteAccessToken();
  if (!tokenRes.token) {
    return {
      success: false,
      status: 401,
      error: tokenRes.error
    };
  }

  try {
    const response = await fetch(path, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${tokenRes.token}`,
        Accept: 'application/json'
      }
    });

    const contentType = response.headers.get('content-type') || '';
    const payload = contentType.includes('application/json')
      ? await response.json().catch(() => null)
      : null;

    if (!response.ok) {
      return {
        success: false,
        status: response.status,
        error:
          (payload && typeof payload.error === 'string' && payload.error) ||
          `Falha ao consultar o servidor (${response.status}).`
      };
    }

    if (!payload) {
      return {
        success: false,
        status: response.status,
        error: 'Resposta inválida do servidor de pendências.'
      };
    }

    return {
      success: true,
      status: response.status,
      data: payload as T
    };
  } catch {
    return {
      success: false,
      error: 'Não foi possível comunicar com o servidor do módulo de pendências.'
    };
  }
}

export async function fetchPendenciasList(
  tab: PendenciasTab = 'geral'
): Promise<PendenciasServiceResult<PendenciasListPayload>> {
  const safeTab: PendenciasTab =
    tab === 'minhas' || tab === 'direcionado' || tab === 'geral' ? tab : 'geral';
  return fetchPendenciasEndpoint<PendenciasListPayload>(
    `/api/pendencias?tab=${encodeURIComponent(safeTab)}`
  );
}

export async function fetchPendenciaDetail(
  pendenciaId: string
): Promise<PendenciasServiceResult<PendenciaDetailPayload>> {
  return fetchPendenciasEndpoint<PendenciaDetailPayload>(
    `/api/pendencias/${encodeURIComponent(pendenciaId)}`
  );
}

export async function fetchPendenciaHistorico(
  pendenciaId: string
): Promise<PendenciasServiceResult<PendenciaHistoricoPayload>> {
  return fetchPendenciasEndpoint<PendenciaHistoricoPayload>(
    `/api/pendencias/${encodeURIComponent(pendenciaId)}/historico`
  );
}
