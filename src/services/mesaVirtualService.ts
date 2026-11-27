import {
  ConflitoSincronizacaoBarragem,
  DamLinkClassification,
  DocumentType,
  HistoricoAlteracaoEntity,
  InspectionData,
  MesaSyncState,
  PhotoQueueStatus,
  ProdutoEcossistema,
  RetificacaoDocumentoRecord,
  SistemaOrigem,
  SolicitacaoMultiEntidadeItem,
  SolicitacaoRedistribuicaoAuditRecord,
  SolicitacaoRevisaoAdministrativaRecord
} from '../types/inspection';
import {
  classifyDamLinkStatus,
  findProductsByDamOrOwner,
  loadLocalAdministraCatalog
} from './administraEcosystemService';
import {
  canUserEditInspection,
  canUserRectifyCompletedInspection,
  isInspectionAuthorOrTeam
} from './userService';
import type { SolicitacaoVistoriaRecord } from '../types/solicitacoesVistoria';

function generateUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function normalizeText(value?: string | null): string {
  return (value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

export interface PhotoQueueStateEntry {
  vistoriaId: string;
  status: PhotoQueueStatus;
}

export interface SyncStateSummary {
  state: MesaSyncState;
  label: string;
  detail: string;
  pendingPhotoCount: number;
  errorPhotoCount: number;
  activeConflictCount: number;
}

/**
 * Classificação rigorosa do estado de sincronização:
 * Nunca exibe "Sincronizado" sem confirmação explícita do servidor e ausência de
 * pendências de fotos ou conflitos ativos.
 */
export function classifyInspectionSyncState(
  inspection: InspectionData,
  photoQueueEntries: PhotoQueueStateEntry[] = []
): SyncStateSummary {
  const relatedPhotos = photoQueueEntries.filter(p => p.vistoriaId === inspection.id);
  const pendingPhotoCount = relatedPhotos.filter(
    p => p.status === 'pending' || p.status === 'uploading'
  ).length;
  const errorPhotoCount = relatedPhotos.filter(p => p.status === 'error').length;
  const activeConflictCount = (inspection.conflitosSincronizacao || []).filter(
    c => c.status === 'pendente'
  ).length;

  if (inspection.syncStatus === 'error' || errorPhotoCount > 0 || activeConflictCount > 0) {
    const reasons: string[] = [];
    if (activeConflictCount > 0) reasons.push(`${activeConflictCount} conflito(s) de dados`);
    if (errorPhotoCount > 0) reasons.push(`${errorPhotoCount} foto(s) com falha`);
    if (inspection.syncStatus === 'error' && inspection.syncError) {
      reasons.push(inspection.syncError);
    }
    return {
      state: 'falha_conflito',
      label: 'Falha/Conflito',
      detail: reasons.join(' · ') || 'Falha na sincronização remota; dados preservados localmente.',
      pendingPhotoCount,
      errorPhotoCount,
      activeConflictCount
    };
  }

  if (
    inspection.syncStatus === 'syncing' ||
    pendingPhotoCount > 0 ||
    (Boolean(inspection.lastSyncedAt) && (!inspection.syncStatus || inspection.syncStatus === 'local'))
  ) {
    return {
      state: 'pendente_sincronizacao',
      label: 'Pendente de sincronização',
      detail:
        pendingPhotoCount > 0
          ? `${pendingPhotoCount} foto(s) aguardando envio para conclusão da sincronização.`
          : 'Alterações locais aguardando confirmação do servidor.',
      pendingPhotoCount,
      errorPhotoCount,
      activeConflictCount
    };
  }

  if (inspection.syncStatus === 'synced') {
    return {
      state: 'sincronizado',
      label: 'Sincronizado',
      detail: inspection.lastSyncedAt
        ? `Confirmado no servidor em ${new Date(inspection.lastSyncedAt).toLocaleString('pt-BR')}.`
        : 'Confirmado no servidor.',
      pendingPhotoCount,
      errorPhotoCount,
      activeConflictCount
    };
  }

  return {
    state: 'salvo_localmente',
    label: 'Salvo localmente',
    detail: 'Registro gravado apenas neste dispositivo; ainda não sincronizado com o servidor.',
    pendingPhotoCount,
    errorPhotoCount,
    activeConflictCount
  };
}

export type MesaDocumentTypeFilter =
  | 'todos'
  | 'vistoria_atual'
  | 'vistoria_futura'
  | 'auto_inspecao'
  | 'relatorio_tecnico'
  | 'notificacao';

export type MesaDocumentStatusFilter = 'todos' | 'rascunho' | 'concluida';

export interface MesaVirtualFilters {
  tipo?: MesaDocumentTypeFilter;
  status?: MesaDocumentStatusFilter;
  autor?: string;
  periodoInicio?: string;
  periodoFim?: string;
  processo?: string;
  municipio?: string;
  barragem?: string;
  empreendedor?: string;
  syncState?: 'todos' | MesaSyncState;
  somenteComAnomalias?: boolean;
  searchText?: string;
}

export interface MesaVirtualItem {
  id: string;
  sistema: 'fiscaliza';
  inspection: InspectionData;
  barragemNome: string;
  empreendedorNome: string;
  municipio: string;
  processoNumero: string;
  numeroVistoria: string;
  dataReferencia: string;
  autorNome: string;
  autorEmail: string;
  tipoPlanejamento: 'atual' | 'futura';
  statusLabel: 'Rascunho' | 'Concluída';
  hasAutoInspecao: boolean;
  hasRelatorioTecnico: boolean;
  hasNotificacao: boolean;
  hasAnomalias: boolean;
  anomaliasCriticasCount: number;
  anomaliasAlertaCount: number;
  syncSummary: SyncStateSummary;
  linkClassification: DamLinkClassification;
  canDirectEdit: boolean;
  canRectify: boolean;
  canDelete: boolean;
  readOnlyReason?: string;
  retificacoesCount: number;
  hasUnresolvedConflict: boolean;
}

export interface MesaVirtualCatalogResult {
  items: MesaVirtualItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  counts: {
    meusTotal: number;
    todosFiscalizaTotal: number;
    rascunhos: number;
    concluidas: number;
    pendentesOuLocais: number;
    falhasOuConflitos: number;
    comAnomalias: number;
  };
}

export function inspectionHasAnomalies(inspection: InspectionData): {
  hasAnomalies: boolean;
  criticalCount: number;
  alertCount: number;
} {
  const comps = Object.values(inspection.componentsData || {});
  let criticalCount = 0;
  let alertCount = 0;
  for (const comp of comps) {
    if (comp.condition === 'critico') criticalCount++;
    else if (comp.condition === 'alerta') alertCount++;
    else if ((comp.selectedAnomalies || []).length > 0) alertCount++;
  }
  return {
    hasAnomalies: criticalCount > 0 || alertCount > 0,
    criticalCount,
    alertCount
  };
}

/**
 * Constrói a listagem da Mesa Virtual para o sistema Fiscaliza.
 * REGRA DE ESCOPO: No Fiscaliza, ambas as abas ("Meus documentos" e "Todos documentos CSB")
 * exibem exclusivamente documentos e vistorias deste sistema (Fiscaliza).
 */
export function buildMesaVirtualCatalog(params: {
  inspections: InspectionData[];
  currentUser: { id?: string; email?: string; fullName?: string; role?: string } | null;
  tab: 'meus' | 'todos_csb';
  photoQueueEntries?: PhotoQueueStateEntry[];
  filters?: MesaVirtualFilters;
  page?: number;
  pageSize?: number;
}): MesaVirtualCatalogResult {
  const {
    inspections,
    currentUser,
    tab,
    photoQueueEntries = [],
    filters = {}
  } = params;
  const pageSize = Math.max(1, Math.min(50, params.pageSize || 10));
  const rawPage = Math.max(1, params.page || 1);

  const catalog = loadLocalAdministraCatalog();
  const damById = new Map(catalog.barragens.map(b => [b.id, b]));
  const empById = new Map(catalog.empreendedores.map(e => [e.id, e]));

  let meusTotal = 0;
  let rascunhos = 0;
  let concluidas = 0;
  let pendentesOuLocais = 0;
  let falhasOuConflitos = 0;
  let comAnomalias = 0;

  const enrichedAll: { item: MesaVirtualItem; isMine: boolean }[] = inspections.map(insp => {
    const isMine = isInspectionAuthorOrTeam(currentUser, insp);
    if (isMine) meusTotal++;

    const syncSummary = classifyInspectionSyncState(insp, photoQueueEntries);
    if (insp.isDraft) rascunhos++;
    else concluidas++;

    if (
      syncSummary.state === 'salvo_localmente' ||
      syncSummary.state === 'pendente_sincronizacao'
    ) {
      pendentesOuLocais++;
    } else if (syncSummary.state === 'falha_conflito') {
      falhasOuConflitos++;
    }

    const anomalyStats = inspectionHasAnomalies(insp);
    if (anomalyStats.hasAnomalies) comAnomalias++;

    const linkedDam = insp.barragemId ? damById.get(insp.barragemId) || null : null;
    const linkedEmp = insp.empreendedorId ? empById.get(insp.empreendedorId) || null : null;
    const linkClassification = classifyDamLinkStatus({
      dam: linkedDam,
      empreendedor: linkedEmp,
      inspection: insp
    });

    const editPerm = canUserEditInspection(currentUser, insp);
    const rectifyPerm = canUserRectifyCompletedInspection(currentUser, insp);
    const role = (currentUser?.role || '').toLowerCase();
    const isAdmin = role === 'administrador' || role === 'admin';

    const canDirectEdit = editPerm.allowed && insp.isDraft !== false;
    const canRectify = rectifyPerm.allowed;
    const canDelete = editPerm.allowed && (insp.isDraft !== false || isAdmin);

    const hasAutoInspecao = Boolean(insp.drafts?.inspectionNotice?.trim());
    const hasRelatorioTecnico = Boolean(insp.drafts?.technicalReport?.trim());
    const hasNotificacao = Boolean(
      insp.conclusions?.requiresNotification || insp.drafts?.notificationLetter?.trim()
    );

    const isFutura =
      insp.tipoPlanejamento === 'futura' || insp.generalInfo?.tipoPlanejamento === 'futura';

    const item: MesaVirtualItem = {
      id: insp.id,
      sistema: 'fiscaliza',
      inspection: insp,
      barragemNome: insp.damIdentification?.damName?.trim() || 'Barragem não informada',
      empreendedorNome:
        insp.damIdentification?.propertyOrBusinessName?.trim() || 'Empreendedor não informado',
      municipio: insp.damIdentification?.municipality?.trim() || 'Mato Grosso',
      processoNumero: insp.generalInfo?.recordNumber?.trim() || '',
      numeroVistoria: insp.generalInfo?.numeroVistoria?.trim() || '',
      dataReferencia:
        insp.generalInfo?.inspectionDate?.trim() || (insp.createdAt ? insp.createdAt.slice(0, 10) : ''),
      autorNome:
        insp.createdByName?.trim() ||
        insp.generalInfo?.inspectors?.[0]?.name?.trim() ||
        insp.createdByEmail ||
        'Autor não identificado',
      autorEmail: insp.createdByEmail || '',
      tipoPlanejamento: isFutura ? 'futura' : 'atual',
      statusLabel: insp.isDraft ? 'Rascunho' : 'Concluída',
      hasAutoInspecao,
      hasRelatorioTecnico,
      hasNotificacao,
      hasAnomalias: anomalyStats.hasAnomalies,
      anomaliasCriticasCount: anomalyStats.criticalCount,
      anomaliasAlertaCount: anomalyStats.alertCount,
      syncSummary,
      linkClassification,
      canDirectEdit,
      canRectify,
      canDelete,
      readOnlyReason: !editPerm.allowed
        ? editPerm.reason
        : insp.isDraft === false
        ? 'Documento concluído: edição silenciosa bloqueada; utilize Retificação Auditável.'
        : undefined,
      retificacoesCount: (insp.retificacoesHistorico || []).length,
      hasUnresolvedConflict: syncSummary.activeConflictCount > 0
    };

    return { item, isMine };
  });

  const scoped =
    tab === 'meus'
      ? enrichedAll.filter(e => e.isMine).map(e => e.item)
      : enrichedAll.map(e => e.item);

  const fTipo = filters.tipo || 'todos';
  const fStatus = filters.status || 'todos';
  const fAutor = normalizeText(filters.autor);
  const fInicio = (filters.periodoInicio || '').trim();
  const fFim = (filters.periodoFim || '').trim();
  const fProc = normalizeText(filters.processo);
  const fMun = normalizeText(filters.municipio);
  const fBar = normalizeText(filters.barragem);
  const fEmp = normalizeText(filters.empreendedor);
  const fSync = filters.syncState || 'todos';
  const fSearch = normalizeText(filters.searchText);

  const filtered = scoped.filter(item => {
    if (fTipo === 'vistoria_atual' && item.tipoPlanejamento !== 'atual') return false;
    if (fTipo === 'vistoria_futura' && item.tipoPlanejamento !== 'futura') return false;
    if (fTipo === 'auto_inspecao' && !item.hasAutoInspecao) return false;
    if (fTipo === 'relatorio_tecnico' && !item.hasRelatorioTecnico) return false;
    if (fTipo === 'notificacao' && !item.hasNotificacao) return false;

    if (fStatus === 'rascunho' && !item.inspection.isDraft) return false;
    if (fStatus === 'concluida' && item.inspection.isDraft) return false;

    if (fAutor) {
      const autorHaystack = normalizeText(
        `${item.autorNome} ${item.autorEmail} ${(item.inspection.generalInfo?.inspectors || [])
          .map(i => i.name)
          .join(' ')}`
      );
      if (!autorHaystack.includes(fAutor)) return false;
    }

    if (fInicio && item.dataReferencia && item.dataReferencia < fInicio) return false;
    if (fFim && item.dataReferencia && item.dataReferencia > fFim) return false;

    if (fProc && !normalizeText(item.processoNumero).includes(fProc)) return false;
    if (fMun && !normalizeText(item.municipio).includes(fMun)) return false;
    if (fBar && !normalizeText(item.barragemNome).includes(fBar)) return false;
    if (fEmp && !normalizeText(item.empreendedorNome).includes(fEmp)) return false;
    if (fSync !== 'todos' && item.syncSummary.state !== fSync) return false;
    if (filters.somenteComAnomalias && !item.hasAnomalias) return false;

    if (fSearch) {
      const fullHaystack = normalizeText(
        [
          item.barragemNome,
          item.empreendedorNome,
          item.municipio,
          item.processoNumero,
          item.numeroVistoria,
          item.autorNome,
          item.autorEmail,
          item.id
        ].join(' ')
      );
      if (!fullHaystack.includes(fSearch)) return false;
    }

    return true;
  });

  filtered.sort((a, b) => {
    const dateB = b.inspection.updatedAt || b.dataReferencia || b.inspection.createdAt || '';
    const dateA = a.inspection.updatedAt || a.dataReferencia || a.inspection.createdAt || '';
    return dateB.localeCompare(dateA);
  });

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(rawPage, totalPages);
  const start = (safePage - 1) * pageSize;

  return {
    items: filtered.slice(start, start + pageSize),
    total,
    page: safePage,
    pageSize,
    totalPages,
    counts: {
      meusTotal,
      todosFiscalizaTotal: inspections.length,
      rascunhos,
      concluidas,
      pendentesOuLocais,
      falhasOuConflitos,
      comAnomalias
    }
  };
}

export interface NewerCompletedInspectionMatch {
  id: string;
  numeroVistoria: string;
  inspectionDate: string;
  updatedAt: string;
  autorNome: string;
  barragemNome: string;
  processoNumero: string;
  matchBasis: 'id_estavel' | 'texto_auxiliar';
}

/**
 * Verifica se há vistoria concluída mais recente para a mesma barragem (usando IDs estáveis
 * `barragemId`/`administraId` como chave canônica). Correspondências apenas por processo/nome
 * são retornadas separadamente como referência auxiliar não conclusiva.
 */
export function findNewerCompletedInspectionsAlert(params: {
  currentInspection: InspectionData;
  allInspections: InspectionData[];
}): {
  hasNewerOfficialMatch: boolean;
  officialMatches: NewerCompletedInspectionMatch[];
  auxiliaryTextMatches: NewerCompletedInspectionMatch[];
} {
  const { currentInspection, allInspections } = params;
  const curBarId = (currentInspection.barragemId || '').trim();
  const hasRegisteredBar = Boolean(
    curBarId && currentInspection.administraCadastroStatus?.barragem?.cadastrado
  );
  const curRefDate =
    currentInspection.generalInfo?.inspectionDate || currentInspection.createdAt || '';
  const curProc = normalizeText(currentInspection.generalInfo?.recordNumber);
  const curDamName = normalizeText(currentInspection.damIdentification?.damName);

  const officialMatches: NewerCompletedInspectionMatch[] = [];
  const auxiliaryTextMatches: NewerCompletedInspectionMatch[] = [];

  for (const other of allInspections) {
    if (other.id === currentInspection.id) continue;
    if (other.isDraft !== false) continue;

    const otherRefDate = other.generalInfo?.inspectionDate || other.createdAt || '';
    const isSameOrNewer = !curRefDate || otherRefDate >= curRefDate || other.updatedAt > currentInspection.updatedAt;
    if (!isSameOrNewer) continue;

    const entryBase = {
      id: other.id,
      numeroVistoria: other.generalInfo?.numeroVistoria || 'S/N',
      inspectionDate: other.generalInfo?.inspectionDate || '',
      updatedAt: other.updatedAt || other.createdAt || '',
      autorNome: other.createdByName || other.createdByEmail || 'Fiscal CSB',
      barragemNome: other.damIdentification?.damName || 'Barragem',
      processoNumero: other.generalInfo?.recordNumber || ''
    };

    const otherBarId = (other.barragemId || '').trim();
    if (curBarId && otherBarId && curBarId === otherBarId && (hasRegisteredBar || other.administraCadastroStatus?.barragem?.cadastrado)) {
      officialMatches.push({ ...entryBase, matchBasis: 'id_estavel' });
      continue;
    }

    const procMatch = Boolean(curProc && normalizeText(other.generalInfo?.recordNumber) === curProc);
    const nameMatch = Boolean(
      curDamName &&
        curDamName.length >= 4 &&
        normalizeText(other.damIdentification?.damName) === curDamName
    );
    if (procMatch || nameMatch) {
      auxiliaryTextMatches.push({ ...entryBase, matchBasis: 'texto_auxiliar' });
    }
  }

  return {
    hasNewerOfficialMatch: officialMatches.length > 0,
    officialMatches,
    auxiliaryTextMatches
  };
}

export interface RelatedContextSummary {
  queriedAt: string;
  relatedInspections: {
    id: string;
    numeroVistoria: string;
    processoNumero: string;
    barragemNome: string;
    dataVistoria: string;
    status: 'Rascunho' | 'Concluída';
    autor: string;
    matchType: 'id_estavel' | 'texto_auxiliar';
  }[];
  relatedEcosystemProducts: ProdutoEcossistema[];
}

/**
 * Consulta sob demanda um resumo leve de documentos e produtos relacionados
 * à barragem, empreendedor ou processo informado — sem copiar anexos nem misturar
 * documentos de outros sistemas na lista principal do Fiscaliza.
 */
export async function queryRelatedContextSummaryOnDemand(params: {
  barragemId?: string | null;
  empreendedorId?: string | null;
  barragemNome?: string | null;
  empreendedorNome?: string | null;
  processoNumero?: string | null;
  excludeVistoriaId?: string | null;
  localInspections: InspectionData[];
}): Promise<RelatedContextSummary> {
  const {
    barragemId,
    empreendedorId,
    barragemNome,
    empreendedorNome,
    processoNumero,
    excludeVistoriaId,
    localInspections
  } = params;

  const normProc = normalizeText(processoNumero);
  const normBar = normalizeText(barragemNome);
  const normEmp = normalizeText(empreendedorNome);

  const relatedInspections: RelatedContextSummary['relatedInspections'] = [];

  for (const insp of localInspections) {
    if (excludeVistoriaId && insp.id === excludeVistoriaId) continue;

    const stableMatch =
      (barragemId && insp.barragemId === barragemId) ||
      (empreendedorId && insp.empreendedorId === empreendedorId);

    const auxMatch =
      (normProc && normalizeText(insp.generalInfo?.recordNumber) === normProc) ||
      (normBar && normBar.length >= 4 && normalizeText(insp.damIdentification?.damName).includes(normBar)) ||
      (normEmp &&
        normEmp.length >= 4 &&
        normalizeText(insp.damIdentification?.propertyOrBusinessName).includes(normEmp));

    if (!stableMatch && !auxMatch) continue;

    relatedInspections.push({
      id: insp.id,
      numeroVistoria: insp.generalInfo?.numeroVistoria || 'S/N',
      processoNumero: insp.generalInfo?.recordNumber || '—',
      barragemNome: insp.damIdentification?.damName || 'Sem denominação',
      dataVistoria: insp.generalInfo?.inspectionDate || (insp.createdAt || '').slice(0, 10),
      status: insp.isDraft ? 'Rascunho' : 'Concluída',
      autor: insp.createdByName || insp.createdByEmail || 'Fiscal CSB',
      matchType: stableMatch ? 'id_estavel' : 'texto_auxiliar'
    });
  }

  let relatedEcosystemProducts: ProdutoEcossistema[] = [];
  try {
    const prods = await findProductsByDamOrOwner({
      barragemId: barragemId || undefined,
      empreendedorId: empreendedorId || undefined,
      barragemNome: barragemNome || undefined,
      empreendedorNome: empreendedorNome || undefined
    });
    relatedEcosystemProducts = prods
      .filter(p => !excludeVistoriaId || p.origemRegistroId !== excludeVistoriaId)
      .slice(0, 12);
  } catch {
    relatedEcosystemProducts = [];
  }

  return {
    queriedAt: new Date().toISOString(),
    relatedInspections: relatedInspections.slice(0, 12),
    relatedEcosystemProducts
  };
}

/**
 * Fluxo auditável de revisão/retificação de documento concluído.
 * Nunca edita silenciosamente: grava registro detalhado com autor, data, justificativa,
 * resumo de alterações e incremento de versão de revisão.
 */
export function applyCompletedDocumentRectification(params: {
  inspection: InspectionData;
  currentUser: { id?: string; email?: string; fullName?: string; role?: string } | null;
  documentoTipo: DocumentType | 'ficha_vistoria';
  justificativa: string;
  resumoAlteracoes: string;
  novoConteudoTexto?: string;
  camposAlterados?: RetificacaoDocumentoRecord['camposAlterados'];
}): { success: boolean; updatedInspection?: InspectionData; record?: RetificacaoDocumentoRecord; error?: string } {
  const perm = canUserRectifyCompletedInspection(params.currentUser, params.inspection);
  if (!perm.allowed) {
    return { success: false, error: perm.reason || 'Sem permissão para retificar este documento.' };
  }

  const justificativa = (params.justificativa || '').trim();
  const resumoAlteracoes = (params.resumoAlteracoes || '').trim();
  if (justificativa.length < 8) {
    return {
      success: false,
      error: 'Informe uma justificativa técnica detalhada (mínimo de 8 caracteres) para a retificação.'
    };
  }
  if (!resumoAlteracoes) {
    return {
      success: false,
      error: 'Descreva objetivamente o que foi retificado.'
    };
  }

  const now = new Date().toISOString();
  const nextVersion = (params.inspection.revisaoVersao || 1) + 1;
  const record: RetificacaoDocumentoRecord = {
    id: generateUUID(),
    vistoriaId: params.inspection.id,
    documentoTipo: params.documentoTipo,
    versao: nextVersion,
    autorId: params.currentUser?.id || null,
    autorEmail: (params.currentUser?.email || '').trim().toLowerCase(),
    autorNome: (params.currentUser?.fullName || params.currentUser?.email || 'Fiscal Técnico').trim(),
    justificativa,
    resumoAlteracoes,
    camposAlterados: params.camposAlterados,
    alteradoEm: now
  };

  const nextDrafts = { ...params.inspection.drafts };
  if (params.novoConteudoTexto !== undefined) {
    if (params.documentoTipo === 'auto_inspecao') {
      nextDrafts.inspectionNotice = params.novoConteudoTexto;
    } else if (params.documentoTipo === 'relatorio_tecnico') {
      nextDrafts.technicalReport = params.novoConteudoTexto;
    } else if (params.documentoTipo === 'notificacao') {
      nextDrafts.notificationLetter = params.novoConteudoTexto;
    }
  }

  const historyEntry: HistoricoAlteracaoEntity = {
    id: generateUUID(),
    vistoriaId: params.inspection.id,
    tabelaNome: 'retificacoes_documentos',
    registroId: record.id,
    operacao: 'UPDATE',
    dadosAnteriores: {
      revisaoVersao: params.inspection.revisaoVersao || 1
    },
    dadosNovos: {
      versao: nextVersion,
      documentoTipo: params.documentoTipo,
      autorEmail: record.autorEmail,
      justificativa,
      resumoAlteracoes
    },
    alteradoEm: now
  };

  const updatedInspection: InspectionData = {
    ...params.inspection,
    revisaoVersao: nextVersion,
    drafts: nextDrafts,
    retificacoesHistorico: [record, ...(params.inspection.retificacoesHistorico || [])],
    historicoAlteracoes: [historyEntry, ...(params.inspection.historicoAlteracoes || [])],
    updatedAt: now,
    syncStatus: params.inspection.syncStatus === 'synced' ? 'local' : params.inspection.syncStatus
  };

  return {
    success: true,
    updatedInspection,
    record
  };
}

// ==============================================================================
// STORE AUDITÁVEL LOCAL DE WORKFLOW DE SOLICITAÇÕES (REDISTRIBUIÇÃO "GERAL",
// REVISÃO ADMINISTRATIVA E DESPACHO MULTI-ENTIDADE)
// ==============================================================================

const SOLICITACOES_WORKFLOW_STORAGE_KEY = 'fiscaliza_csb_solicitacoes_workflow_v1';

export interface MultiEntitySolicitacaoPlanRecord {
  id: string;
  processoNumero: string;
  justificativaGeral: string;
  itens: SolicitacaoMultiEntidadeItem[];
  solicitanteEmail: string;
  solicitanteNome: string;
  criadoEm: string;
  statusIntegracaoRemota: 'aguardando_contrato_administra';
}

export interface SolicitacoesWorkflowState {
  destinosBySolicitacaoId: Record<string, string>;
  redistribuicoes: SolicitacaoRedistribuicaoAuditRecord[];
  revisoes: SolicitacaoRevisaoAdministrativaRecord[];
  multiEntityPlans: MultiEntitySolicitacaoPlanRecord[];
}

function emptyWorkflowState(): SolicitacoesWorkflowState {
  return {
    destinosBySolicitacaoId: {},
    redistribuicoes: [],
    revisoes: [],
    multiEntityPlans: []
  };
}

export function loadSolicitacoesWorkflowState(): SolicitacoesWorkflowState {
  try {
    if (typeof localStorage === 'undefined') return emptyWorkflowState();
    const raw = localStorage.getItem(SOLICITACOES_WORKFLOW_STORAGE_KEY);
    if (!raw) return emptyWorkflowState();
    const parsed = JSON.parse(raw) as Partial<SolicitacoesWorkflowState>;
    return {
      destinosBySolicitacaoId:
        parsed.destinosBySolicitacaoId && typeof parsed.destinosBySolicitacaoId === 'object'
          ? parsed.destinosBySolicitacaoId
          : {},
      redistribuicoes: Array.isArray(parsed.redistribuicoes) ? parsed.redistribuicoes : [],
      revisoes: Array.isArray(parsed.revisoes) ? parsed.revisoes : [],
      multiEntityPlans: Array.isArray(parsed.multiEntityPlans) ? parsed.multiEntityPlans : []
    };
  } catch {
    return emptyWorkflowState();
  }
}

export function saveSolicitacoesWorkflowState(state: SolicitacoesWorkflowState): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(SOLICITACOES_WORKFLOW_STORAGE_KEY, JSON.stringify(state));
  } catch {}
}

export function getEffectiveSolicitacaoDestino(
  solicitacao: SolicitacaoVistoriaRecord,
  state: SolicitacoesWorkflowState
): string {
  const override = state.destinosBySolicitacaoId[solicitacao.id];
  if (override) return override;
  const fromEquipe = solicitacao.equipe?.[0]?.nome || solicitacao.equipe?.[0]?.usuario_id;
  if (fromEquipe) return fromEquipe;
  return 'GERAL';
}

export function createMultiEntitySolicitacaoPlan(
  state: SolicitacoesWorkflowState,
  params: {
    processoNumero: string;
    justificativaGeral: string;
    itens: SolicitacaoMultiEntidadeItem[];
    actorEmail: string;
    actorName: string;
  }
): { success: boolean; state: SolicitacoesWorkflowState; plan?: MultiEntitySolicitacaoPlanRecord; error?: string } {
  const proc = (params.processoNumero || '').trim();
  const just = (params.justificativaGeral || '').trim();
  if (!proc) {
    return { success: false, state, error: 'Informe o número do processo.' };
  }
  if (!params.itens || params.itens.length === 0) {
    return { success: false, state, error: 'Selecione ao menos uma entidade ou sistema destino.' };
  }
  if (just.length < 5 && params.itens.some(i => !(i.justificativaEspecifica || '').trim())) {
    return {
      success: false,
      state,
      error: 'Informe uma justificativa geral ou justificativas específicas para cada destino selecionado.'
    };
  }

  const plan: MultiEntitySolicitacaoPlanRecord = {
    id: generateUUID(),
    processoNumero: proc,
    justificativaGeral: just,
    itens: params.itens,
    solicitanteEmail: params.actorEmail.trim().toLowerCase(),
    solicitanteNome: params.actorName.trim() || params.actorEmail,
    criadoEm: new Date().toISOString(),
    statusIntegracaoRemota: 'aguardando_contrato_administra'
  };

  const next: SolicitacoesWorkflowState = {
    ...state,
    multiEntityPlans: [plan, ...state.multiEntityPlans]
  };
  saveSolicitacoesWorkflowState(next);
  return { success: true, state: next, plan };
}

export function redistributeGeralSolicitacao(
  state: SolicitacoesWorkflowState,
  params: {
    solicitacao: SolicitacaoVistoriaRecord;
    novoDestino: string;
    motivo: string;
    actor: { email?: string; fullName?: string; role?: string } | null;
  }
): { success: boolean; state: SolicitacoesWorkflowState; error?: string } {
  const role = (params.actor?.role || '').toLowerCase();
  if (role !== 'administrador' && role !== 'admin') {
    return {
      success: false,
      state,
      error: 'Somente um Administrador autorizado pode redistribuir solicitações da caixa GERAL.'
    };
  }
  const novoDestino = (params.novoDestino || '').trim();
  const motivo = (params.motivo || '').trim();
  if (!novoDestino || !motivo) {
    return {
      success: false,
      state,
      error: 'Informe o novo destinatário/equipe e o motivo da redistribuição.'
    };
  }

  const destinoAnterior = getEffectiveSolicitacaoDestino(params.solicitacao, state);
  const audit: SolicitacaoRedistribuicaoAuditRecord = {
    id: generateUUID(),
    solicitacaoId: params.solicitacao.id,
    destinoAnterior,
    novoDestino,
    autorEmail: (params.actor?.email || '').trim().toLowerCase(),
    autorNome: (params.actor?.fullName || params.actor?.email || 'Administrador').trim(),
    motivo,
    alteradoEm: new Date().toISOString()
  };

  const next: SolicitacoesWorkflowState = {
    ...state,
    destinosBySolicitacaoId: {
      ...state.destinosBySolicitacaoId,
      [params.solicitacao.id]: novoDestino
    },
    redistribuicoes: [audit, ...state.redistribuicoes]
  };
  saveSolicitacoesWorkflowState(next);
  return { success: true, state: next };
}

export function requestSolicitacaoAdministrativeReview(
  state: SolicitacoesWorkflowState,
  params: {
    solicitacaoId: string;
    justificativa: string;
    destinoSolicitado: string;
    actor: { email?: string; fullName?: string; role?: string } | null;
  }
): { success: boolean; state: SolicitacoesWorkflowState; record?: SolicitacaoRevisaoAdministrativaRecord; error?: string } {
  const role = (params.actor?.role || '').toLowerCase();
  if (!params.actor?.email || role === 'visualizador') {
    return {
      success: false,
      state,
      error: 'Perfil sem permissão para solicitar revisão administrativa.'
    };
  }
  const just = (params.justificativa || '').trim();
  if (just.length < 6) {
    return {
      success: false,
      state,
      error: 'Informe uma justificativa com ao menos 6 caracteres para solicitar revisão administrativa.'
    };
  }

  const record: SolicitacaoRevisaoAdministrativaRecord = {
    id: generateUUID(),
    solicitacaoId: params.solicitacaoId,
    solicitanteEmail: params.actor.email.trim().toLowerCase(),
    solicitanteNome: (params.actor.fullName || params.actor.email).trim(),
    justificativa: just,
    destinoSolicitado: (params.destinoSolicitado || 'GERAL').trim(),
    status: 'pendente',
    criadoEm: new Date().toISOString()
  };

  const next: SolicitacoesWorkflowState = {
    ...state,
    revisoes: [record, ...state.revisoes]
  };
  saveSolicitacoesWorkflowState(next);
  return { success: true, state: next, record };
}

export function decideSolicitacaoAdministrativeReview(
  state: SolicitacoesWorkflowState,
  params: {
    revisaoId: string;
    decision: 'aceita' | 'rejeitada';
    parecerDecisao: string;
    actor: { email?: string; fullName?: string; role?: string } | null;
  }
): { success: boolean; state: SolicitacoesWorkflowState; error?: string } {
  const role = (params.actor?.role || '').toLowerCase();
  if (role !== 'administrador' && role !== 'admin') {
    return {
      success: false,
      state,
      error: 'Somente um Administrador autorizado pode aceitar ou rejeitar solicitações de revisão administrativa.'
    };
  }

  const target = state.revisoes.find(r => r.id === params.revisaoId);
  if (!target) {
    return { success: false, state, error: 'Pedido de revisão administrativa não localizado.' };
  }
  if (target.status !== 'pendente') {
    return { success: false, state, error: 'Este pedido de revisão já foi decidido anteriormente.' };
  }

  const now = new Date().toISOString();
  const parecer = (params.parecerDecisao || '').trim() || (
    params.decision === 'aceita' ? 'Revisão administrativa aceita.' : 'Revisão administrativa rejeitada.'
  );

  const nextRevisoes = state.revisoes.map(r =>
    r.id === params.revisaoId
      ? {
          ...r,
          status: params.decision,
          decididoPorEmail: (params.actor?.email || '').trim().toLowerCase(),
          decididoPorNome: (params.actor?.fullName || params.actor?.email || 'Administrador').trim(),
          decididoEm: now,
          parecerDecisao: parecer
        }
      : r
  );

  const nextDestinos = { ...state.destinosBySolicitacaoId };
  const nextRedist = [...state.redistribuicoes];
  if (params.decision === 'aceita' && target.destinoSolicitado) {
    const prevDest = nextDestinos[target.solicitacaoId] || 'GERAL';
    nextDestinos[target.solicitacaoId] = target.destinoSolicitado;
    nextRedist.unshift({
      id: generateUUID(),
      solicitacaoId: target.solicitacaoId,
      destinoAnterior: prevDest,
      novoDestino: target.destinoSolicitado,
      autorEmail: (params.actor?.email || '').trim().toLowerCase(),
      autorNome: (params.actor?.fullName || params.actor?.email || 'Administrador').trim(),
      motivo: `Decisão em revisão administrativa: ${parecer}`,
      alteradoEm: now
    });
  }

  const next: SolicitacoesWorkflowState = {
    ...state,
    destinosBySolicitacaoId: nextDestinos,
    redistribuicoes: nextRedist,
    revisoes: nextRevisoes
  };
  saveSolicitacoesWorkflowState(next);
  return { success: true, state: next };
}
