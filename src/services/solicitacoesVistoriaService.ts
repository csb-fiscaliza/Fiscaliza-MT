import type {
  InspectionData,
  ItemObservacaoFutura,
  SistemaOrigem
} from '../types/inspection';
import type {
  ConcluirSolicitacaoVistoriaPayload,
  SolicitacaoVistoriaMutationResponse,
  SolicitacaoVistoriaRecord,
  SolicitacoesVistoriaListResponse
} from '../types/solicitacoesVistoria';
import { fiscalizaSupabase } from './ecosystemConfig';
import { createEmptyInspection } from './storage';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface SolicitacoesVistoriaServiceResult<T = void> {
  success: boolean;
  status?: number;
  code?: string;
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
        error: 'Sessão remota autenticada obrigatória para acessar Solicitações de Vistoria.'
      };
    }

    return { token: session.access_token };
  } catch {
    return {
      error: 'Falha ao obter o token da sessão autenticada.'
    };
  }
}

async function callSolicitacoesEndpoint<T>(
  path: string,
  init: { method: 'GET' | 'POST' | 'PATCH'; body?: unknown }
): Promise<SolicitacoesVistoriaServiceResult<T>> {
  const tokenRes = await getRemoteAccessToken();
  if (!tokenRes.token) {
    return {
      success: false,
      status: 401,
      error: tokenRes.error
    };
  }

  try {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${tokenRes.token}`,
      Accept: 'application/json'
    };
    if (init.body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }

    const response = await fetch(path, {
      method: init.method,
      headers,
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined
    });

    const contentType = response.headers.get('content-type') || '';
    const payload = contentType.includes('application/json')
      ? await response.json().catch(() => null)
      : null;

    if (!response.ok) {
      return {
        success: false,
        status: response.status,
        code: typeof payload?.code === 'string' ? payload.code : undefined,
        error:
          (payload && typeof payload.error === 'string' && payload.error) ||
          `Falha ao comunicar com o servidor (${response.status}).`
      };
    }

    if (!payload) {
      return {
        success: false,
        status: response.status,
        error: 'Resposta inválida do servidor de Solicitações de Vistoria.'
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
      error: 'Não foi possível comunicar com o servidor do Fiscaliza para Solicitações de Vistoria.'
    };
  }
}

export async function fetchSolicitacoesVistoria(filters?: {
  status?: string;
  sistema_origem?: string;
}): Promise<SolicitacoesVistoriaServiceResult<SolicitacoesVistoriaListResponse>> {
  const qs = new URLSearchParams();
  if (filters?.status && filters.status !== 'todos') {
    qs.set('status', filters.status);
  }
  if (filters?.sistema_origem && filters.sistema_origem !== 'todos') {
    qs.set('sistema_origem', filters.sistema_origem);
  }
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  return callSolicitacoesEndpoint<SolicitacoesVistoriaListResponse>(
    `/api/solicitacoes-vistoria${suffix}`,
    { method: 'GET' }
  );
}

export async function iniciarSolicitacaoVistoria(
  id: string
): Promise<SolicitacoesVistoriaServiceResult<SolicitacaoVistoriaMutationResponse>> {
  return callSolicitacoesEndpoint<SolicitacaoVistoriaMutationResponse>(
    `/api/solicitacoes-vistoria/${encodeURIComponent(id)}/iniciar`,
    { method: 'POST', body: {} }
  );
}

export async function concluirSolicitacaoVistoria(
  id: string,
  payload: ConcluirSolicitacaoVistoriaPayload
): Promise<SolicitacoesVistoriaServiceResult<SolicitacaoVistoriaMutationResponse>> {
  return callSolicitacoesEndpoint<SolicitacaoVistoriaMutationResponse>(
    `/api/solicitacoes-vistoria/${encodeURIComponent(id)}/concluir`,
    { method: 'POST', body: payload }
  );
}

export async function atualizarObservacaoSolicitacaoVistoria(
  id: string,
  observacao_campo: string
): Promise<SolicitacoesVistoriaServiceResult<SolicitacaoVistoriaMutationResponse>> {
  return callSolicitacoesEndpoint<SolicitacaoVistoriaMutationResponse>(
    `/api/solicitacoes-vistoria/${encodeURIComponent(id)}/observacao`,
    { method: 'PATCH', body: { observacao_campo } }
  );
}

/**
 * Constrói uma nova ficha de Vistoria Futura pré-preenchida SOMENTE com os dados
 * permitidos da solicitação (sem copiar CPF/CNPJ nem decidir classificação final).
 */
export function buildFutureInspectionFromSolicitacao(
  solicitacao: SolicitacaoVistoriaRecord,
  creatorUser?: {
    email?: string;
    fullName?: string;
    id?: string;
    cargo?: string;
    matricula?: string;
    sector?: string;
  }
): InspectionData {
  const base = createEmptyInspection(creatorUser);
  const nowIso = new Date().toISOString();
  const origin: SistemaOrigem = solicitacao.sistema_origem || 'administra';
  const linkedOrigin: SistemaOrigem = origin === 'fiscaliza' ? 'administra' : origin;

  const hasValidBarragemId = Boolean(
    solicitacao.barragem_id && UUID_REGEX.test(solicitacao.barragem_id.trim())
  );
  const hasValidEmpreendedorId = Boolean(
    solicitacao.empreendedor_id && UUID_REGEX.test(solicitacao.empreendedor_id.trim())
  );

  const obsItems: ItemObservacaoFutura[] = [];
  if (solicitacao.relato_resumido?.trim()) {
    obsItems.push({
      id: `sol-relato-${solicitacao.id}`,
      texto: `Contexto da solicitação (${origin.toUpperCase()}): ${solicitacao.relato_resumido.trim()}`,
      concluido: false,
      criadoEm: nowIso
    });
  }
  if (solicitacao.classificacao_resumo?.trim()) {
    obsItems.push({
      id: `sol-class-${solicitacao.id}`,
      texto: `Classificação informada como contexto: ${solicitacao.classificacao_resumo.trim()}`,
      concluido: false,
      criadoEm: nowIso
    });
  }

  const hasCoords = Boolean(solicitacao.latitude?.trim() && solicitacao.longitude?.trim());

  const firstInspector = base.generalInfo.inspectors[0];
  const updatedInspectors = firstInspector
    ? [
        {
          ...firstInspector,
          id:
            creatorUser?.id && UUID_REGEX.test(creatorUser.id)
              ? creatorUser.id
              : firstInspector.id
        }
      ]
    : [];

  return {
    ...base,
    barragemId: hasValidBarragemId ? solicitacao.barragem_id!.trim() : base.barragemId,
    empreendedorId: hasValidEmpreendedorId
      ? solicitacao.empreendedor_id!.trim()
      : base.empreendedorId,
    sistemaOrigem: linkedOrigin,
    barragemOrigemSistema: hasValidBarragemId ? linkedOrigin : 'fiscaliza',
    empreendedorOrigemSistema: hasValidEmpreendedorId ? linkedOrigin : 'fiscaliza',
    administraCadastroStatus: {
      barragem: hasValidBarragemId
        ? {
            cadastrado: true,
            modo: 'vinculado_existente',
            entidadeId: solicitacao.barragem_id!.trim(),
            sistemaOrigem: linkedOrigin
          }
        : { cadastrado: false },
      empreendedor: hasValidEmpreendedorId
        ? {
            cadastrado: true,
            modo: 'vinculado_existente',
            entidadeId: solicitacao.empreendedor_id!.trim(),
            sistemaOrigem: linkedOrigin
          }
        : { cadastrado: false },
      responsavelTecnico: { cadastrado: false }
    },
    isDraft: true,
    tipoPlanejamento: 'futura',
    itensObservacaoFutura: obsItems,
    solicitacaoVistoriaId: solicitacao.id,
    solicitacaoOrigem: solicitacao.sistema_origem,
    solicitacaoProtocolo: solicitacao.protocolo || undefined,
    solicitacaoContexto: {
      relatoResumido: solicitacao.relato_resumido || undefined,
      classificacaoResumo: solicitacao.classificacao_resumo || undefined,
      processoNumero: solicitacao.processo_numero || undefined,
      solicitanteNome: solicitacao.solicitante_nome || undefined,
      solicitadoEm: solicitacao.solicitado_em || undefined
    },
    generalInfo: {
      ...base.generalInfo,
      tipoPlanejamento: 'futura',
      numeroVistoria: '',
      inspectionDate: '',
      recordNumber: solicitacao.processo_numero?.trim() || '',
      inspectors: updatedInspectors
    },
    damIdentification: {
      ...base.damIdentification,
      damName: solicitacao.barragem_nome?.trim() || '',
      municipality: solicitacao.municipio?.trim() || '',
      waterCourse: solicitacao.curso_dagua?.trim() || '',
      propertyOrBusinessName: solicitacao.empreendedor_nome?.trim() || '',
      // Nunca copiar CPF/CNPJ da solicitação
      ownerCpfCnpj: '',
      coordinates: {
        ...base.damIdentification.coordinates,
        latitude: solicitacao.latitude?.trim() || '',
        longitude: solicitacao.longitude?.trim() || '',
        isManualEdit: hasCoords
      }
    }
  };
}
