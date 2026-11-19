import {
  CreatePendenciaInput,
  PENDENCIA_SITUACOES,
  PendenciaHistoricoAcao,
  PendenciaHistoricoRecord,
  PendenciaRecord,
  PendenciaSituacao,
  UpdatePendenciaInput
} from '../types/pendencias';
import { fiscalizaSupabase } from './ecosystemConfig';
import { getInspectorSession } from './supabase';
import { getUsers } from './userService';

const SISTEMA_ORIGEM_ATUAL = 'fiscaliza';
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface PendenciasActor {
  userId: string;
  profileId: string | null;
  matchingIds: string[];
  email: string;
  fullName: string;
  role: string;
  isAdmin: boolean;
  canMutate: boolean;
}

export interface PendenciasServiceResult<T = void> {
  success: boolean;
  data?: T;
  error?: string;
}

function normalizeOptionalString(val?: string | null): string | null {
  if (val === undefined || val === null) return null;
  const trimmed = val.trim();
  return trimmed === '' ? null : trimmed;
}

function normalizeOptionalUuid(val?: string | null): { valid: boolean; value: string | null } {
  const cleaned = normalizeOptionalString(val);
  if (!cleaned) return { valid: true, value: null };
  if (!UUID_REGEX.test(cleaned)) {
    return { valid: false, value: null };
  }
  return { valid: true, value: cleaned };
}

function formatSupabaseError(err: any, fallback: string): string {
  const msg = String(err?.message || '').trim();
  const code = String(err?.code || '').trim();
  if (code === '42501' || msg.toLowerCase().includes('row-level security') || msg.toLowerCase().includes('permission denied')) {
    return 'Permissão negada pelas políticas de acesso do banco de dados para esta operação.';
  }
  if (code === '42P01') {
    return 'Tabela de pendências não localizada no banco de dados configurado.';
  }
  return msg || fallback;
}

export async function resolvePendenciasActor(): Promise<PendenciasServiceResult<PendenciasActor>> {
  if (!fiscalizaSupabase) {
    return {
      success: false,
      error: 'Serviço Supabase do Fiscaliza não configurado neste ambiente.'
    };
  }

  try {
    const inspectorSession = await getInspectorSession();
    if (!inspectorSession.authenticated || !inspectorSession.email) {
      return {
        success: false,
        error: 'Sessão institucional autenticada obrigatória para acessar o módulo de pendências.'
      };
    }

    const {
      data: { session },
      error: authErr
    } = await fiscalizaSupabase.auth.getSession();

    if (authErr || !session?.user?.id || !session.user.email) {
      return {
        success: false,
        error: 'Sessão remota Supabase ativa obrigatória para consultar e registrar pendências.'
      };
    }

    const cleanEmail = session.user.email.trim().toLowerCase();
    const { data: profileRow, error: profileError } = await fiscalizaSupabase
      .from('perfis_usuarios')
      .select('id, email, nome, perfil, status')
      .eq('email', cleanEmail)
      .maybeSingle();

    if (
      profileError ||
      !profileRow ||
      String(profileRow.status || '').trim().toLowerCase() !== 'ativo' ||
      !profileRow.perfil
    ) {
      return {
        success: false,
        error: 'Perfil de usuário ativo não encontrado na base institucional.'
      };
    }

    const role = String(profileRow.perfil).trim().toLowerCase();
    const isAdmin = role === 'administrador' || role === 'admin';
    const canMutate = isAdmin || role === 'analista';

    const matchingIds = Array.from(
      new Set([session.user.id, profileRow.id].filter((id): id is string => Boolean(id)))
    );

    return {
      success: true,
      data: {
        userId: session.user.id,
        profileId: profileRow.id || null,
        matchingIds,
        email: cleanEmail,
        fullName: profileRow.nome || inspectorSession.fullName || cleanEmail.split('@')[0],
        role,
        isAdmin,
        canMutate
      }
    };
  } catch (err: any) {
    return {
      success: false,
      error: formatSupabaseError(err, 'Falha ao validar a sessão autenticada.')
    };
  }
}

export function isPendenciaAssignedToActor(
  pendencia: Pick<PendenciaRecord, 'responsavel_id'>,
  actor: Pick<PendenciasActor, 'matchingIds'>
): boolean {
  if (!pendencia.responsavel_id) return false;
  return actor.matchingIds.includes(pendencia.responsavel_id);
}

export function canActorResolvePendencia(
  pendencia: Pick<PendenciaRecord, 'responsavel_id' | 'situacao'>,
  actor: PendenciasActor
): boolean {
  if (!actor.canMutate) return false;
  if (pendencia.situacao === 'resolvida' || pendencia.situacao === 'cancelada') return false;
  if (actor.isAdmin) return true;
  if (!pendencia.responsavel_id) return true;
  return isPendenciaAssignedToActor(pendencia, actor);
}

export function canActorEditPendencia(
  pendencia: Pick<PendenciaRecord, 'responsavel_id' | 'criado_por' | 'situacao'>,
  actor: PendenciasActor
): boolean {
  if (!actor.canMutate) return false;
  if (actor.isAdmin) return true;
  if (pendencia.situacao === 'resolvida' || pendencia.situacao === 'cancelada') return false;
  if (pendencia.responsavel_id) {
    return isPendenciaAssignedToActor(pendencia, actor);
  }
  return Boolean(pendencia.criado_por && actor.matchingIds.includes(pendencia.criado_por));
}

async function insertHistoricoEntries(
  entries: Array<{
    pendencia_id: string;
    acao: PendenciaHistoricoAcao;
    campo: string | null;
    valor_anterior: string | null;
    valor_novo: string | null;
    usuario_id: string;
    motivo: string | null;
  }>
): Promise<PendenciasServiceResult> {
  if (!fiscalizaSupabase) {
    return { success: false, error: 'Cliente Supabase indisponível.' };
  }
  if (entries.length === 0) return { success: true };

  const { error } = await fiscalizaSupabase.from('pendencias_historico').insert(entries);
  if (error) {
    return {
      success: false,
      error: formatSupabaseError(error, 'Falha ao registrar entrada no histórico de pendências.')
    };
  }
  return { success: true };
}

export async function listPendencias(): Promise<PendenciasServiceResult<PendenciaRecord[]>> {
  const actorRes = await resolvePendenciasActor();
  if (!actorRes.success || !actorRes.data) {
    return { success: false, error: actorRes.error };
  }

  const { data, error } = await fiscalizaSupabase!
    .from('pendencias')
    .select(
      'id, origem, origem_ref_id, tipo, titulo, descricao, situacao, responsavel_id, direcionado_por, direcionado_em, criado_por, tipo_referencia, referencia_id, empreendedor_id, barragem_id, resolvido_por, resolvido_em, created_at, updated_at'
    )
    .order('updated_at', { ascending: false });

  if (error) {
    return {
      success: false,
      error: formatSupabaseError(error, 'Erro ao carregar a lista de pendências.')
    };
  }

  return {
    success: true,
    data: (data || []) as PendenciaRecord[]
  };
}

export async function listPendenciaHistorico(
  pendenciaId: string
): Promise<PendenciasServiceResult<PendenciaHistoricoRecord[]>> {
  const actorRes = await resolvePendenciasActor();
  if (!actorRes.success || !actorRes.data) {
    return { success: false, error: actorRes.error };
  }

  if (!UUID_REGEX.test(pendenciaId)) {
    return { success: false, error: 'Identificador de pendência inválido.' };
  }

  const { data, error } = await fiscalizaSupabase!
    .from('pendencias_historico')
    .select('id, pendencia_id, acao, campo, valor_anterior, valor_novo, usuario_id, motivo, created_at')
    .eq('pendencia_id', pendenciaId)
    .order('created_at', { ascending: false });

  if (error) {
    return {
      success: false,
      error: formatSupabaseError(error, 'Erro ao carregar o histórico da pendência.')
    };
  }

  return {
    success: true,
    data: (data || []) as PendenciaHistoricoRecord[]
  };
}

export async function createPendencia(
  input: CreatePendenciaInput
): Promise<PendenciasServiceResult<PendenciaRecord>> {
  const actorRes = await resolvePendenciasActor();
  if (!actorRes.success || !actorRes.data) {
    return { success: false, error: actorRes.error };
  }
  const actor = actorRes.data;

  if (!actor.canMutate) {
    return {
      success: false,
      error: 'Seu perfil possui acesso somente leitura e não pode criar pendências.'
    };
  }

  const titulo = input.titulo.trim();
  const tipo = input.tipo.trim();
  if (!titulo) {
    return { success: false, error: 'Informe o título da pendência.' };
  }
  if (!tipo) {
    return { success: false, error: 'Informe o tipo da pendência.' };
  }

  const requestedResponsavel = normalizeOptionalString(input.responsavel_id);
  if (requestedResponsavel && !actor.isAdmin) {
    return {
      success: false,
      error: 'Apenas administradores podem escolher ou direcionar um responsável.'
    };
  }

  let validatedResponsavelId: string | null = null;
  if (requestedResponsavel) {
    if (!UUID_REGEX.test(requestedResponsavel)) {
      return { success: false, error: 'Identificador do usuário responsável inválido.' };
    }
    const users = await getUsers();
    const targetUser = users.find(u => u.id === requestedResponsavel && u.status === 'ativo');
    if (!targetUser) {
      return { success: false, error: 'Usuário responsável selecionado não encontrado ou inativo.' };
    }
    validatedResponsavelId = targetUser.id;
  }

  const origemRefCheck = normalizeOptionalUuid(input.origem_ref_id);
  const refIdCheck = normalizeOptionalUuid(input.referencia_id);
  const empIdCheck = normalizeOptionalUuid(input.empreendedor_id);
  const barIdCheck = normalizeOptionalUuid(input.barragem_id);

  if (!origemRefCheck.valid || !refIdCheck.valid || !empIdCheck.valid || !barIdCheck.valid) {
    return {
      success: false,
      error: 'Os campos de referência (ID) devem conter UUIDs válidos ou permanecer vazios.'
    };
  }

  const now = new Date().toISOString();
  const initialSituacao: PendenciaSituacao = validatedResponsavelId ? 'direcionada' : 'aberta';

  const insertPayload = {
    origem: SISTEMA_ORIGEM_ATUAL,
    origem_ref_id: origemRefCheck.value,
    tipo,
    titulo,
    descricao: normalizeOptionalString(input.descricao),
    situacao: initialSituacao,
    responsavel_id: validatedResponsavelId,
    direcionado_por: validatedResponsavelId ? actor.userId : null,
    direcionado_em: validatedResponsavelId ? now : null,
    criado_por: actor.userId,
    tipo_referencia: normalizeOptionalString(input.tipo_referencia),
    referencia_id: refIdCheck.value,
    empreendedor_id: empIdCheck.value,
    barragem_id: barIdCheck.value
  };

  const { data: created, error } = await fiscalizaSupabase!
    .from('pendencias')
    .insert(insertPayload)
    .select(
      'id, origem, origem_ref_id, tipo, titulo, descricao, situacao, responsavel_id, direcionado_por, direcionado_em, criado_por, tipo_referencia, referencia_id, empreendedor_id, barragem_id, resolvido_por, resolvido_em, created_at, updated_at'
    )
    .single();

  if (error || !created) {
    return {
      success: false,
      error: formatSupabaseError(error, 'Não foi possível criar a pendência.')
    };
  }

  const motivo = normalizeOptionalString(input.motivo);
  const historyRows: Array<{
    pendencia_id: string;
    acao: PendenciaHistoricoAcao;
    campo: string | null;
    valor_anterior: string | null;
    valor_novo: string | null;
    usuario_id: string;
    motivo: string | null;
  }> = [
    {
      pendencia_id: created.id,
      acao: 'criacao',
      campo: 'situacao',
      valor_anterior: null,
      valor_novo: initialSituacao,
      usuario_id: actor.userId,
      motivo: motivo || 'Registro inicial da pendência'
    }
  ];

  if (validatedResponsavelId) {
    historyRows.push({
      pendencia_id: created.id,
      acao: 'direcionamento',
      campo: 'responsavel_id',
      valor_anterior: null,
      valor_novo: validatedResponsavelId,
      usuario_id: actor.userId,
      motivo
    });
  }

  const histRes = await insertHistoricoEntries(historyRows);
  if (!histRes.success) {
    return {
      success: false,
      data: created as PendenciaRecord,
      error: `Pendência criada, mas houve falha ao gravar o histórico: ${histRes.error}`
    };
  }

  return {
    success: true,
    data: created as PendenciaRecord
  };
}

export async function direcionarPendencia(
  pendenciaId: string,
  responsavelId: string,
  motivo?: string | null
): Promise<PendenciasServiceResult<PendenciaRecord>> {
  const actorRes = await resolvePendenciasActor();
  if (!actorRes.success || !actorRes.data) {
    return { success: false, error: actorRes.error };
  }
  const actor = actorRes.data;

  if (!actor.isAdmin) {
    return {
      success: false,
      error: 'Apenas administradores podem atribuir ou alterar o responsável por uma pendência.'
    };
  }

  if (!UUID_REGEX.test(pendenciaId) || !UUID_REGEX.test(responsavelId)) {
    return { success: false, error: 'Identificador inválido para direcionamento.' };
  }

  const users = await getUsers();
  const targetUser = users.find(u => u.id === responsavelId && u.status === 'ativo');
  if (!targetUser) {
    return { success: false, error: 'Usuário destinatário não encontrado ou inativo.' };
  }

  const { data: existing, error: fetchErr } = await fiscalizaSupabase!
    .from('pendencias')
    .select(
      'id, situacao, responsavel_id, direcionado_por, direcionado_em'
    )
    .eq('id', pendenciaId)
    .maybeSingle();

  if (fetchErr || !existing) {
    return {
      success: false,
      error: formatSupabaseError(fetchErr, 'Pendência não localizada.')
    };
  }

  if (existing.situacao === 'resolvida' || existing.situacao === 'cancelada') {
    return {
      success: false,
      error: 'Não é possível direcionar uma pendência já resolvida ou cancelada.'
    };
  }

  if (existing.responsavel_id === targetUser.id) {
    return {
      success: false,
      error: 'A pendência já está direcionada para este usuário.'
    };
  }

  const now = new Date().toISOString();
  const nextSituacao: PendenciaSituacao =
    existing.situacao === 'aberta' ? 'direcionada' : (existing.situacao as PendenciaSituacao);

  const { data: updated, error: updateErr } = await fiscalizaSupabase!
    .from('pendencias')
    .update({
      responsavel_id: targetUser.id,
      direcionado_por: actor.userId,
      direcionado_em: now,
      situacao: nextSituacao,
      updated_at: now
    })
    .eq('id', pendenciaId)
    .select(
      'id, origem, origem_ref_id, tipo, titulo, descricao, situacao, responsavel_id, direcionado_por, direcionado_em, criado_por, tipo_referencia, referencia_id, empreendedor_id, barragem_id, resolvido_por, resolvido_em, created_at, updated_at'
    )
    .single();

  if (updateErr || !updated) {
    return {
      success: false,
      error: formatSupabaseError(updateErr, 'Erro ao direcionar pendência.')
    };
  }

  const cleanedMotivo = normalizeOptionalString(motivo);
  const histEntries: Array<{
    pendencia_id: string;
    acao: PendenciaHistoricoAcao;
    campo: string | null;
    valor_anterior: string | null;
    valor_novo: string | null;
    usuario_id: string;
    motivo: string | null;
  }> = [
    {
      pendencia_id: pendenciaId,
      acao: 'direcionamento',
      campo: 'responsavel_id',
      valor_anterior: existing.responsavel_id || null,
      valor_novo: targetUser.id,
      usuario_id: actor.userId,
      motivo: cleanedMotivo
    }
  ];

  if (nextSituacao !== existing.situacao) {
    histEntries.push({
      pendencia_id: pendenciaId,
      acao: 'mudanca_situacao',
      campo: 'situacao',
      valor_anterior: existing.situacao,
      valor_novo: nextSituacao,
      usuario_id: actor.userId,
      motivo: cleanedMotivo
    });
  }

  const histRes = await insertHistoricoEntries(histEntries);
  if (!histRes.success) {
    return {
      success: false,
      data: updated as PendenciaRecord,
      error: `Responsável atualizado, mas houve falha ao gravar o histórico: ${histRes.error}`
    };
  }

  return {
    success: true,
    data: updated as PendenciaRecord
  };
}

export async function updatePendencia(
  pendenciaId: string,
  updates: UpdatePendenciaInput,
  motivo?: string | null
): Promise<PendenciasServiceResult<PendenciaRecord>> {
  const actorRes = await resolvePendenciasActor();
  if (!actorRes.success || !actorRes.data) {
    return { success: false, error: actorRes.error };
  }
  const actor = actorRes.data;

  if (!actor.canMutate) {
    return {
      success: false,
      error: 'Seu perfil possui acesso somente leitura e não pode editar pendências.'
    };
  }

  if (!UUID_REGEX.test(pendenciaId)) {
    return { success: false, error: 'Identificador de pendência inválido.' };
  }

  const { data: existing, error: fetchErr } = await fiscalizaSupabase!
    .from('pendencias')
    .select(
      'id, origem, origem_ref_id, tipo, titulo, descricao, situacao, responsavel_id, direcionado_por, direcionado_em, criado_por, tipo_referencia, referencia_id, empreendedor_id, barragem_id, resolvido_por, resolvido_em, created_at, updated_at'
    )
    .eq('id', pendenciaId)
    .maybeSingle();

  if (fetchErr || !existing) {
    return {
      success: false,
      error: formatSupabaseError(fetchErr, 'Pendência não localizada.')
    };
  }

  if (!canActorEditPendencia(existing as PendenciaRecord, actor)) {
    return {
      success: false,
      error: 'Você não tem permissão para editar esta pendência.'
    };
  }

  const origemRefCheck = normalizeOptionalUuid(
    updates.origem_ref_id !== undefined ? updates.origem_ref_id : existing.origem_ref_id
  );
  const refIdCheck = normalizeOptionalUuid(
    updates.referencia_id !== undefined ? updates.referencia_id : existing.referencia_id
  );
  const empIdCheck = normalizeOptionalUuid(
    updates.empreendedor_id !== undefined ? updates.empreendedor_id : existing.empreendedor_id
  );
  const barIdCheck = normalizeOptionalUuid(
    updates.barragem_id !== undefined ? updates.barragem_id : existing.barragem_id
  );

  if (!origemRefCheck.valid || !refIdCheck.valid || !empIdCheck.valid || !barIdCheck.valid) {
    return {
      success: false,
      error: 'Os campos de referência (ID) devem conter UUIDs válidos ou permanecer vazios.'
    };
  }

  const nextFields = {
    tipo: updates.tipo !== undefined ? updates.tipo.trim() : existing.tipo,
    titulo: updates.titulo !== undefined ? updates.titulo.trim() : existing.titulo,
    descricao: updates.descricao !== undefined ? normalizeOptionalString(updates.descricao) : existing.descricao,
    tipo_referencia:
      updates.tipo_referencia !== undefined
        ? normalizeOptionalString(updates.tipo_referencia)
        : existing.tipo_referencia,
    referencia_id: refIdCheck.value,
    empreendedor_id: empIdCheck.value,
    barragem_id: barIdCheck.value,
    origem_ref_id: origemRefCheck.value
  };

  if (!nextFields.titulo || !nextFields.tipo) {
    return { success: false, error: 'Título e tipo da pendência são obrigatórios.' };
  }

  const trackedFields: Array<keyof typeof nextFields> = [
    'titulo',
    'tipo',
    'descricao',
    'tipo_referencia',
    'referencia_id',
    'empreendedor_id',
    'barragem_id',
    'origem_ref_id'
  ];

  const cleanedMotivo = normalizeOptionalString(motivo);
  const histEntries: Array<{
    pendencia_id: string;
    acao: PendenciaHistoricoAcao;
    campo: string | null;
    valor_anterior: string | null;
    valor_novo: string | null;
    usuario_id: string;
    motivo: string | null;
  }> = [];

  trackedFields.forEach(campo => {
    const prevVal = normalizeOptionalString(existing[campo]);
    const nextVal = normalizeOptionalString(nextFields[campo]);
    if (prevVal !== nextVal) {
      histEntries.push({
        pendencia_id: pendenciaId,
        acao: 'edicao',
        campo,
        valor_anterior: prevVal,
        valor_novo: nextVal,
        usuario_id: actor.userId,
        motivo: cleanedMotivo
      });
    }
  });

  if (histEntries.length === 0) {
    return {
      success: true,
      data: existing as PendenciaRecord
    };
  }

  const { data: updated, error: updateErr } = await fiscalizaSupabase!
    .from('pendencias')
    .update({
      ...nextFields,
      updated_at: new Date().toISOString()
    })
    .eq('id', pendenciaId)
    .select(
      'id, origem, origem_ref_id, tipo, titulo, descricao, situacao, responsavel_id, direcionado_por, direcionado_em, criado_por, tipo_referencia, referencia_id, empreendedor_id, barragem_id, resolvido_por, resolvido_em, created_at, updated_at'
    )
    .single();

  if (updateErr || !updated) {
    return {
      success: false,
      error: formatSupabaseError(updateErr, 'Erro ao salvar alterações da pendência.')
    };
  }

  const histRes = await insertHistoricoEntries(histEntries);
  if (!histRes.success) {
    return {
      success: false,
      data: updated as PendenciaRecord,
      error: `Edição salva, mas houve falha ao gravar o histórico: ${histRes.error}`
    };
  }

  return {
    success: true,
    data: updated as PendenciaRecord
  };
}

export async function updatePendenciaSituacao(
  pendenciaId: string,
  novaSituacao: PendenciaSituacao,
  motivo?: string | null
): Promise<PendenciasServiceResult<PendenciaRecord>> {
  const actorRes = await resolvePendenciasActor();
  if (!actorRes.success || !actorRes.data) {
    return { success: false, error: actorRes.error };
  }
  const actor = actorRes.data;

  if (!actor.canMutate) {
    return {
      success: false,
      error: 'Seu perfil possui acesso somente leitura e não pode alterar situações.'
    };
  }

  if (!PENDENCIA_SITUACOES.includes(novaSituacao)) {
    return { success: false, error: 'Situação informada não é permitida.' };
  }

  if (!UUID_REGEX.test(pendenciaId)) {
    return { success: false, error: 'Identificador de pendência inválido.' };
  }

  const { data: existing, error: fetchErr } = await fiscalizaSupabase!
    .from('pendencias')
    .select(
      'id, origem, origem_ref_id, tipo, titulo, descricao, situacao, responsavel_id, direcionado_por, direcionado_em, criado_por, tipo_referencia, referencia_id, empreendedor_id, barragem_id, resolvido_por, resolvido_em, created_at, updated_at'
    )
    .eq('id', pendenciaId)
    .maybeSingle();

  if (fetchErr || !existing) {
    return {
      success: false,
      error: formatSupabaseError(fetchErr, 'Pendência não localizada.')
    };
  }

  if (existing.situacao === novaSituacao) {
    return {
      success: false,
      error: 'A pendência já se encontra nesta situação.'
    };
  }

  const isAssignedToActor = isPendenciaAssignedToActor(existing as PendenciaRecord, actor);
  const isUnassigned = !existing.responsavel_id;
  const isCreator = Boolean(existing.criado_por && actor.matchingIds.includes(existing.criado_por));

  if (!actor.isAdmin) {
    if (novaSituacao === 'direcionada') {
      return {
        success: false,
        error: 'Apenas administradores podem definir a situação direcionada.'
      };
    }
    if (novaSituacao === 'resolvida') {
      if (!canActorResolvePendencia(existing as PendenciaRecord, actor)) {
        return {
          success: false,
          error: 'Você não possui permissão para resolver uma pendência atribuída a outro responsável.'
        };
      }
    } else if (novaSituacao === 'cancelada') {
      if (!isCreator && !isAssignedToActor) {
        return {
          success: false,
          error: 'Apenas o criador, o responsável ou um administrador pode cancelar esta pendência.'
        };
      }
    } else if (!isUnassigned && !isAssignedToActor) {
      return {
        success: false,
        error: 'Você só pode alterar a situação de pendências atribuídas a você ou sem responsável.'
      };
    }
  }

  const now = new Date().toISOString();
  const isResolving = novaSituacao === 'resolvida';
  const wasResolved = existing.situacao === 'resolvida';

  const updatePayload: Record<string, any> = {
    situacao: novaSituacao,
    updated_at: now
  };

  if (isResolving) {
    updatePayload.resolvido_por = actor.userId;
    updatePayload.resolvido_em = now;
  } else if (wasResolved) {
    updatePayload.resolvido_por = null;
    updatePayload.resolvido_em = null;
  }

  const { data: updated, error: updateErr } = await fiscalizaSupabase!
    .from('pendencias')
    .update(updatePayload)
    .eq('id', pendenciaId)
    .select(
      'id, origem, origem_ref_id, tipo, titulo, descricao, situacao, responsavel_id, direcionado_por, direcionado_em, criado_por, tipo_referencia, referencia_id, empreendedor_id, barragem_id, resolvido_por, resolvido_em, created_at, updated_at'
    )
    .single();

  if (updateErr || !updated) {
    return {
      success: false,
      error: formatSupabaseError(updateErr, 'Erro ao atualizar a situação da pendência.')
    };
  }

  const cleanedMotivo = normalizeOptionalString(motivo);
  const acao: PendenciaHistoricoAcao = isResolving ? 'resolucao' : 'mudanca_situacao';

  const histRes = await insertHistoricoEntries([
    {
      pendencia_id: pendenciaId,
      acao,
      campo: 'situacao',
      valor_anterior: existing.situacao,
      valor_novo: novaSituacao,
      usuario_id: actor.userId,
      motivo: cleanedMotivo
    }
  ]);

  if (!histRes.success) {
    return {
      success: false,
      data: updated as PendenciaRecord,
      error: `Situação alterada, mas houve falha ao gravar o histórico: ${histRes.error}`
    };
  }

  return {
    success: true,
    data: updated as PendenciaRecord
  };
}
