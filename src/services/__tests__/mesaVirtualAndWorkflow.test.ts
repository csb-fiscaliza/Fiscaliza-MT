import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyCompletedDocumentRectification,
  buildMesaVirtualCatalog,
  classifyInspectionSyncState,
  createMultiEntitySolicitacaoPlan,
  decideSolicitacaoAdministrativeReview,
  findNewerCompletedInspectionsAlert,
  getEffectiveSolicitacaoDestino,
  loadSolicitacoesWorkflowState,
  queryRelatedContextSummaryOnDemand,
  redistributeGeralSolicitacao,
  requestSolicitacaoAdministrativeReview
} from '../mesaVirtualService.ts';
import {
  classifyDamLinkStatus,
  detectDamSyncConflicts,
  resolveDamSyncConflict,
  searchDamCatalogPaginated
} from '../administraEcosystemService.ts';
import type { AdministraMasterCatalog } from '../administraEcosystemService.ts';
import {
  getPendingExternalLayerFetches,
  INITIAL_MAP_LAYER_FLAGS
} from '../mapDataService.ts';
import {
  canUserDeleteInspection,
  canUserEditInspection,
  canUserEditInspectionDirectly,
  canUserRectifyCompletedInspection
} from '../userService.ts';
import { createEmptyInspection } from '../storage.ts';
import type { BarragemEntity, EmpreendedorEntity, InspectionData } from '../../types/inspection.ts';
import type { SolicitacaoVistoriaRecord } from '../../types/solicitacoesVistoria.ts';

function installMockStorage(initial: Record<string, string> = {}) {
  const store = new Map<string, string>(Object.entries(initial));
  const localStorageMock = {
    get length() {
      return store.size;
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    setItem(key: string, value: string) {
      store.set(key, String(value));
    },
    removeItem(key: string) {
      store.delete(key);
    },
    clear() {
      store.clear();
    }
  };

  (globalThis as any).localStorage = localStorageMock;
  (globalThis as any).CustomEvent = class {
    type: string;
    detail: unknown;
    constructor(type: string, init?: { detail?: unknown }) {
      this.type = type;
      this.detail = init?.detail;
    }
  };
  (globalThis as any).window = {
    localStorage: localStorageMock,
    dispatchEvent() {
      return true;
    },
    addEventListener() {},
    removeEventListener() {}
  };
  return store;
}

function makeInspection(overrides: Partial<InspectionData> = {}): InspectionData {
  const base = createEmptyInspection({
    email: overrides.createdByEmail || 'autor@sema.mt.gov.br',
    fullName: overrides.createdByName || 'Fiscal Autor',
    id: overrides.createdByUserId || 'user-autor-1'
  });
  return {
    ...base,
    ...overrides,
    generalInfo: {
      ...base.generalInfo,
      ...(overrides.generalInfo || {})
    },
    damIdentification: {
      ...base.damIdentification,
      ...(overrides.damIdentification || {}),
      coordinates: {
        ...base.damIdentification.coordinates,
        ...(overrides.damIdentification?.coordinates || {})
      },
      regulatoryStatus: {
        ...base.damIdentification.regulatoryStatus,
        ...(overrides.damIdentification?.regulatoryStatus || {})
      }
    },
    conclusions: {
      ...base.conclusions,
      ...(overrides.conclusions || {})
    },
    drafts: {
      ...base.drafts,
      ...(overrides.drafts || {})
    }
  };
}

test('Mesa Virtual: escopo exclusivo Fiscaliza, filtros combinados, paginação e 4 estados de sincronização', () => {
  installMockStorage();

  const mineDraft = makeInspection({
    id: 'insp-1',
    isDraft: true,
    syncStatus: 'local',
    createdByEmail: 'autor@sema.mt.gov.br',
    createdByName: 'Fiscal Autor',
    createdByUserId: 'user-autor-1',
    generalInfo: {
      ...makeInspection().generalInfo,
      recordNumber: 'PROC-2026-001',
      numeroVistoria: '20260001',
      inspectionDate: '2026-06-10',
      startTime: '08:30',
      inspectors: [{ id: '1', name: 'Fiscal Autor', role: 'Analista', registrationNumber: '101', sector: 'CSB' }],
      tipoPlanejamento: 'atual'
    },
    damIdentification: {
      ...makeInspection().damIdentification,
      damName: 'Barragem Norte',
      propertyOrBusinessName: 'Agro Norte Ltda',
      municipality: 'Sinop',
      coordinates: { latitude: '-11.86', longitude: '-55.50', datum: 'SIRGAS 2000', isManualEdit: true }
    },
    componentsData: {
      macico: {
        componentId: 'macico',
        componentName: 'Maciço',
        condition: 'critico',
        selectedAnomalies: ['Trinca longitudinal'],
        notes: 'Observada trinca'
      }
    }
  });

  const colleagueSynced = makeInspection({
    id: 'insp-2',
    isDraft: false,
    syncStatus: 'synced',
    lastSyncedAt: '2026-06-12T10:00:00.000Z',
    createdByEmail: 'colega@sema.mt.gov.br',
    createdByName: 'Colega Fiscal',
    createdByUserId: 'user-colega-2',
    generalInfo: {
      ...makeInspection().generalInfo,
      recordNumber: 'PROC-2026-002',
      numeroVistoria: '20260002',
      inspectionDate: '2026-06-12',
      startTime: '09:00',
      inspectors: [{ id: '2', name: 'Colega Fiscal', role: 'Analista', registrationNumber: '102', sector: 'CSB' }],
      tipoPlanejamento: 'atual'
    },
    damIdentification: {
      ...makeInspection().damIdentification,
      damName: 'Barragem Sul',
      propertyOrBusinessName: 'Fazenda Sul',
      municipality: 'Cuiabá',
      coordinates: { latitude: '-15.60', longitude: '-56.09', datum: 'SIRGAS 2000', isManualEdit: true }
    },
    drafts: {
      inspectionNotice: 'Auto de Inspeção oficial',
      technicalReport: 'Relatório técnico conclusivo',
      notificationLetter: ''
    }
  });

  const mineSyncedButPhotoPending = makeInspection({
    id: 'insp-3',
    isDraft: false,
    syncStatus: 'synced',
    lastSyncedAt: '2026-06-11T10:00:00.000Z',
    createdByEmail: 'autor@sema.mt.gov.br',
    createdByName: 'Fiscal Autor',
    createdByUserId: 'user-autor-1',
    damIdentification: {
      ...makeInspection().damIdentification,
      damName: 'Barragem Leste',
      municipality: 'Sorriso'
    }
  });

  const mineWithConflict = makeInspection({
    id: 'insp-4',
    isDraft: true,
    syncStatus: 'synced',
    createdByEmail: 'autor@sema.mt.gov.br',
    createdByName: 'Fiscal Autor',
    createdByUserId: 'user-autor-1',
    conflitosSincronizacao: [
      {
        id: 'conf-1',
        vistoriaId: 'insp-4',
        entidadeTipo: 'barragem',
        entidadeId: 'dam-x',
        entidadeNome: 'Barragem Oeste',
        status: 'pendente',
        camposDivergentes: [
          {
            campo: 'damName',
            rotulo: 'Nome',
            valorLocal: 'Barragem Oeste',
            valorRemoto: 'Barragem Oeste Oficial',
            origemRemota: 'administra_api'
          }
        ],
        participantesEmails: ['autor@sema.mt.gov.br'],
        detectadoEm: '2026-06-12T12:00:00.000Z'
      }
    ]
  });

  // Nunca exibir "sincronizado" se houver foto pendente ou conflito pendente
  assert.equal(classifyInspectionSyncState(mineDraft, []).state, 'salvo_localmente');
  assert.equal(
    classifyInspectionSyncState(mineSyncedButPhotoPending, [{ vistoriaId: 'insp-3', status: 'pending' }]).state,
    'pendente_sincronizacao'
  );
  assert.equal(classifyInspectionSyncState(colleagueSynced, []).state, 'sincronizado');
  assert.equal(classifyInspectionSyncState(mineWithConflict, []).state, 'falha_conflito');

  const currentUser = { id: 'user-autor-1', email: 'autor@sema.mt.gov.br', fullName: 'Fiscal Autor', role: 'analista' };
  const all = [mineDraft, colleagueSynced, mineSyncedButPhotoPending, mineWithConflict];

  const meusRes = buildMesaVirtualCatalog({
    inspections: all,
    currentUser,
    tab: 'meus',
    photoQueueEntries: [{ vistoriaId: 'insp-3', status: 'pending' }]
  });
  assert.equal(meusRes.total, 3);
  assert.ok(meusRes.items.every(item => item.sistema === 'fiscaliza'));

  const todosRes = buildMesaVirtualCatalog({
    inspections: all,
    currentUser,
    tab: 'todos_csb',
    photoQueueEntries: [{ vistoriaId: 'insp-3', status: 'pending' }],
    page: 1,
    pageSize: 2
  });
  assert.equal(todosRes.total, 4);
  assert.equal(todosRes.totalPages, 2);
  assert.equal(todosRes.items.length, 2);
  assert.ok(todosRes.items.every(item => item.sistema === 'fiscaliza'));

  // Filtros multi-critério combinados
  const filteredCritical = buildMesaVirtualCatalog({
    inspections: all,
    currentUser,
    tab: 'todos_csb',
    filters: {
      municipio: 'Sinop',
      somenteComAnomalias: true,
      syncState: 'salvo_localmente'
    }
  });
  assert.equal(filteredCritical.total, 1);
  assert.equal(filteredCritical.items[0].id, 'insp-1');

  const filteredConcluded = buildMesaVirtualCatalog({
    inspections: all,
    currentUser,
    tab: 'todos_csb',
    filters: {
      tipo: 'relatorio_tecnico',
      status: 'concluida',
      autor: 'Colega'
    }
  });
  assert.equal(filteredConcluded.total, 1);
  assert.equal(filteredConcluded.items[0].id, 'insp-2');
});

test('RBAC e Retificação Auditável: bloqueia edição silenciosa de colegas e documentos concluídos', () => {
  installMockStorage();

  const autor = { id: 'u1', email: 'autor@sema.mt.gov.br', fullName: 'Fiscal Autor', role: 'analista' };
  const colega = { id: 'u2', email: 'colega@sema.mt.gov.br', fullName: 'Colega Fiscal', role: 'analista' };

  const concludedOwn = makeInspection({
    id: 'insp-concluida',
    isDraft: false,
    syncStatus: 'synced',
    revisaoVersao: 1,
    createdByEmail: 'autor@sema.mt.gov.br',
    createdByName: 'Fiscal Autor',
    createdByUserId: 'u1',
    drafts: {
      inspectionNotice: 'Texto inicial',
      technicalReport: 'Relatório inicial',
      notificationLetter: ''
    }
  });

  // Colega não pode editar nem excluir ficha do autor, mas autor pode visualizar e retificar via fluxo auditável
  assert.equal(canUserEditInspection(colega, concludedOwn).allowed, false);
  assert.equal(canUserDeleteInspection(colega, concludedOwn).allowed, false);

  // Mesmo para o autor, documento concluído bloqueia edição silenciosa direta e exige retificação auditável
  const directEdit = canUserEditInspectionDirectly(autor, concludedOwn);
  assert.equal(directEdit.allowed, false);
  assert.equal(directEdit.requiresRectification, true);
  assert.equal(canUserDeleteInspection(autor, concludedOwn).allowed, false);
  assert.equal(canUserRectifyCompletedInspection(autor, concludedOwn).allowed, true);

  // Sem justificativa suficiente, a retificação é recusada
  const invalidRect = applyCompletedDocumentRectification({
    inspection: concludedOwn,
    currentUser: autor,
    documentoTipo: 'relatorio_tecnico',
    justificativa: 'curta',
    resumoAlteracoes: 'Ajuste'
  });
  assert.equal(invalidRect.success, false);

  // Com justificativa e resumo válidos, registra trilha auditável completa e incrementa versão
  const validRect = applyCompletedDocumentRectification({
    inspection: concludedOwn,
    currentUser: autor,
    documentoTipo: 'relatorio_tecnico',
    justificativa: 'Correção de coordenada aferida em conferência cartográfica pós-vistoria.',
    resumoAlteracoes: 'Atualizado parágrafo 2 do relatório técnico com coordenadas conferidas.',
    novoConteudoTexto: 'Relatório revisado v2'
  });
  assert.equal(validRect.success, true);
  assert.ok(validRect.updatedInspection);
  assert.equal(validRect.updatedInspection!.revisaoVersao, 2);
  assert.equal(validRect.updatedInspection!.drafts.technicalReport, 'Relatório revisado v2');
  assert.equal(validRect.updatedInspection!.retificacoesHistorico?.length, 1);
  assert.equal(validRect.updatedInspection!.retificacoesHistorico?.[0].autorEmail, 'autor@sema.mt.gov.br');
  assert.equal(validRect.updatedInspection!.historicoAlteracoes?.[0].tabelaNome, 'retificacoes_documentos');
});

test('Classificação explícita de vínculo de barragem e busca paginada priorizando empreendedor sem ocultar pendentes', () => {
  installMockStorage();

  const emp1: EmpreendedorEntity = {
    id: 'emp-1',
    sistemaOrigem: 'administra',
    nomeRazaoSocial: 'Agropecuária Cuiabá S.A.',
    cpfCnpj: '11.222.333/0001-44',
    figuraJuridica: 'empresa_privada',
    endereco: 'Av. Central, 100',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z'
  };

  const damOficial: BarragemEntity = {
    id: 'dam-oficial',
    administraId: 'adm-dam-1',
    sistemaOrigem: 'administra',
    empreendedorId: 'emp-1',
    nome: 'Barragem Oficial A',
    municipio: 'Cuiabá',
    uf: 'MT',
    snisb: 'SNISB-MT-100',
    car: 'MT-5103403-111122223333',
    processo: 'PROC-100/2026',
    tipoMaterial: 'terra_homogenea',
    usoPrincipal: 'Irrigação',
    usosSecundarios: [],
    coordenadas: {
      latitude: -15.601,
      longitude: -56.097,
      horarioCaptura: '2026-01-01T00:00:00Z',
      acuraciaMetros: 5,
      altitudeEstimadaDispositivo: 180,
      editadoManualmente: false,
      datum: 'SIRGAS 2000'
    },
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z'
  };

  const damSemDonoSemCoords: BarragemEntity = {
    id: 'dam-pendente',
    sistemaOrigem: 'fiscaliza',
    empreendedorId: '',
    nome: 'Barragem Sem Empreendedor',
    municipio: 'Sorriso',
    uf: 'MT',
    snisb: 'SNISB-MT-999',
    processo: 'PROC-999/2026',
    tipoMaterial: 'terra_homogenea',
    usoPrincipal: 'Dessedentação animal',
    usosSecundarios: [],
    coordenadas: {
      latitude: null,
      longitude: null,
      horarioCaptura: null,
      acuraciaMetros: null,
      altitudeEstimadaDispositivo: null,
      editadoManualmente: false,
      datum: 'SIRGAS 2000'
    },
    createdAt: '2026-01-02T00:00:00Z',
    updatedAt: '2026-01-02T00:00:00Z'
  };

  const catalog: AdministraMasterCatalog = {
    empreendedores: [emp1],
    barragens: [damSemDonoSemCoords, damOficial],
    responsaveisTecnicos: [],
    updatedAt: '2026-01-02T00:00:00Z'
  };

  const clsOficial = classifyDamLinkStatus({ dam: damOficial, empreendedor: emp1 });
  assert.equal(clsOficial.status, 'vinculo_oficial');
  assert.equal(clsOficial.coordenadasIndisponiveis, false);

  const clsPendente = classifyDamLinkStatus({ dam: damSemDonoSemCoords, empreendedor: null });
  assert.equal(clsPendente.status, 'vinculo_pendente_revisao');
  assert.equal(clsPendente.coordenadasIndisponiveis, true);

  const clsSemVinculo = classifyDamLinkStatus({ inspection: makeInspection({ barragemId: undefined }) });
  assert.equal(clsSemVinculo.status, 'sem_vinculo');

  // Busca com empreendedor selecionado mantém pendentes pesquisáveis e prioriza vínculo oficial do empreendedor
  const resAll = searchDamCatalogPaginated({
    catalog,
    selectedEmpreendedorId: 'emp-1',
    page: 1,
    pageSize: 5
  });
  assert.equal(resAll.total, 2);
  assert.equal(resAll.items[0].barragem.id, 'dam-oficial');
  assert.equal(resAll.items[0].priorityMatch, 'empreendedor_vinculado');
  assert.equal(resAll.items[1].barragem.id, 'dam-pendente');
  assert.equal(resAll.items[1].linkClassification.status, 'vinculo_pendente_revisao');

  // Busca por SNISB / CAR / processo
  const resSnisb = searchDamCatalogPaginated({ catalog, query: 'SNISB-MT-999' });
  assert.equal(resSnisb.total, 1);
  assert.equal(resSnisb.items[0].barragem.id, 'dam-pendente');

  const resCar = searchDamCatalogPaginated({ catalog, query: '5103403-111122223333' });
  assert.equal(resCar.total, 1);
  assert.equal(resCar.items[0].barragem.id, 'dam-oficial');
});

test('Mapa: camadas externas iniciam desmarcadas e carregam apenas sob demanda', () => {
  assert.deepEqual(INITIAL_MAP_LAYER_FLAGS, {
    showNovas: false,
    showAntigas: false,
    showSnisb: false,
    showAneel: false,
    showGeoJson: false
  });

  const noneLoaded = {
    novas: false,
    antigas: false,
    snisb: false,
    aneel: false,
    geoJson: false
  };

  assert.deepEqual(getPendingExternalLayerFetches(INITIAL_MAP_LAYER_FLAGS, noneLoaded), []);

  assert.deepEqual(
    getPendingExternalLayerFetches({ ...INITIAL_MAP_LAYER_FLAGS, showSnisb: true, showGeoJson: true }, noneLoaded),
    ['snisb', 'geoJson']
  );

  assert.deepEqual(
    getPendingExternalLayerFetches(
      { ...INITIAL_MAP_LAYER_FLAGS, showSnisb: true, showGeoJson: true },
      { ...noneLoaded, snisb: true }
    ),
    ['geoJson']
  );
});

test('Vistorias sem solicitação prévia: alerta de vistoria concluída mais recente e resumo contextual sob demanda', async () => {
  installMockStorage();

  const olderDraft = makeInspection({
    id: 'cur-draft',
    isDraft: true,
    barragemId: 'dam-stable-1',
    administraCadastroStatus: {
      empreendedor: { cadastrado: true, modo: 'vinculado_existente', sistemaOrigem: 'administra', entidadeId: 'emp-1' },
      barragem: { cadastrado: true, modo: 'vinculado_existente', sistemaOrigem: 'administra', entidadeId: 'dam-stable-1' },
      responsavelTecnico: { cadastrado: false }
    },
    generalInfo: {
      ...makeInspection().generalInfo,
      recordNumber: 'PROC-555',
      numeroVistoria: '20260010',
      inspectionDate: '2026-05-01',
      startTime: '08:00',
      inspectors: [],
      tipoPlanejamento: 'atual'
    },
    damIdentification: {
      ...makeInspection().damIdentification,
      damName: 'Barragem Estável'
    }
  });

  const newerCompleted = makeInspection({
    id: 'newer-done',
    isDraft: false,
    barragemId: 'dam-stable-1',
    administraCadastroStatus: {
      empreendedor: { cadastrado: true, modo: 'vinculado_existente', sistemaOrigem: 'administra', entidadeId: 'emp-1' },
      barragem: { cadastrado: true, modo: 'vinculado_existente', sistemaOrigem: 'administra', entidadeId: 'dam-stable-1' },
      responsavelTecnico: { cadastrado: false }
    },
    generalInfo: {
      ...makeInspection().generalInfo,
      recordNumber: 'PROC-555',
      numeroVistoria: '20260020',
      inspectionDate: '2026-06-01',
      startTime: '09:00',
      inspectors: [],
      tipoPlanejamento: 'atual'
    },
    photos: [
      {
        id: 'p1',
        dataUrl: 'data:image/jpeg;base64,AAA',
        locationDescription: 'Crista',
        caption: 'Foto pesada',
        componentId: 'macico',
        componentName: 'Maciço',
        timestamp: '2026-06-01T09:00:00Z'
      }
    ]
  });

  const textOnlyMatch = makeInspection({
    id: 'text-only',
    isDraft: false,
    barragemId: undefined,
    generalInfo: {
      ...makeInspection().generalInfo,
      recordNumber: 'PROC-555',
      numeroVistoria: '20260021',
      inspectionDate: '2026-06-02',
      startTime: '10:00',
      inspectors: [],
      tipoPlanejamento: 'atual'
    }
  });

  const alertRes = findNewerCompletedInspectionsAlert({
    currentInspection: olderDraft,
    allInspections: [olderDraft, newerCompleted, textOnlyMatch]
  });
  assert.equal(alertRes.hasNewerOfficialMatch, true);
  assert.equal(alertRes.officialMatches.length, 1);
  assert.equal(alertRes.officialMatches[0].matchBasis, 'id_estavel');
  assert.equal(alertRes.auxiliaryTextMatches.length, 1);
  assert.equal(alertRes.auxiliaryTextMatches[0].matchBasis, 'texto_auxiliar');

  const summary = await queryRelatedContextSummaryOnDemand({
    barragemId: 'dam-stable-1',
    processoNumero: 'PROC-555',
    excludeVistoriaId: 'cur-draft',
    localInspections: [olderDraft, newerCompleted, textOnlyMatch]
  });
  assert.equal(summary.relatedInspections.length, 2);
  // Resumo leve não carrega blobs de fotos
  assert.equal('photos' in summary.relatedInspections[0], false);
});

test('Conflitos de sincronização: detecção sem sobrescrita automática e resolução auditável', () => {
  installMockStorage();

  const localInsp = makeInspection({
    id: 'insp-conf',
    barragemId: 'dam-1',
    empreendedorId: 'emp-1',
    damIdentification: {
      ...makeInspection().damIdentification,
      damName: 'Barragem Campo Local',
      municipality: 'Rondonópolis',
      propertyOrBusinessName: 'Empreendedor Local Ltda'
    }
  });

  const catalog: AdministraMasterCatalog = {
    empreendedores: [
      {
        id: 'emp-1',
        sistemaOrigem: 'administra',
        nomeRazaoSocial: 'Empreendedor Oficial Administra S.A.',
        cpfCnpj: '00000000000100',
        figuraJuridica: 'empresa_privada',
        endereco: 'Rua A, 10',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z'
      }
    ],
    barragens: [
      {
        id: 'dam-1',
        sistemaOrigem: 'administra',
        empreendedorId: 'emp-1',
        nome: 'Barragem Oficial Administra',
        municipio: 'Rondonópolis',
        uf: 'MT',
        tipoMaterial: 'terra_homogenea',
        usoPrincipal: 'Irrigação',
        usosSecundarios: [],
        coordenadas: {
          latitude: -16.47,
          longitude: -54.63,
          horarioCaptura: '2026-01-01T00:00:00Z',
          acuraciaMetros: 5,
          altitudeEstimadaDispositivo: 220,
          editadoManualmente: false,
          datum: 'SIRGAS 2000'
        },
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z'
      }
    ],
    responsaveisTecnicos: [],
    updatedAt: '2026-01-01T00:00:00Z'
  };

  const conflict = detectDamSyncConflicts(localInsp, catalog);
  assert.ok(conflict);
  assert.equal(conflict!.status, 'pendente');
  assert.equal(conflict!.camposDivergentes.length, 2);
  // Dados locais permanecem intactos durante a detecção
  assert.equal(localInsp.damIdentification.damName, 'Barragem Campo Local');

  const withConflict = {
    ...localInsp,
    conflitosSincronizacao: [conflict!]
  };

  // Resolução sem justificativa falha
  const badResolve = resolveDamSyncConflict({
    inspection: withConflict,
    conflictId: conflict!.id,
    decisao: 'adotar_remoto',
    actorEmail: 'autor@sema.mt.gov.br',
    actorName: 'Fiscal Autor',
    justificativa: '   '
  });
  assert.ok(badResolve.error);

  // Adotar remoto atualiza explicitamente com histórico auditável
  const okResolve = resolveDamSyncConflict({
    inspection: withConflict,
    conflictId: conflict!.id,
    decisao: 'adotar_remoto',
    actorEmail: 'autor@sema.mt.gov.br',
    actorName: 'Fiscal Autor',
    justificativa: 'Confirmado cadastro oficial atualizado no Administra.'
  });
  assert.equal(okResolve.error, undefined);
  assert.equal(okResolve.updatedInspection.damIdentification.damName, 'Barragem Oficial Administra');
  assert.equal(okResolve.updatedInspection.conflitosSincronizacao?.[0].status, 'resolvido');
  assert.equal(okResolve.updatedInspection.historicoAlteracoes?.[0].tabelaNome, 'conflitos_sincronizacao');
});

test('Solicitações: caixa GERAL, despacho multi-entidade, redistribuição admin e revisão administrativa', () => {
  installMockStorage();

  const solGeral: SolicitacaoVistoriaRecord = {
    id: 'sol-1',
    sistema_origem: 'classifica',
    status: 'pendente',
    protocolo: 'PRT-2026-01',
    solicitante_nome: 'Classifica CSB',
    solicitado_em: '2026-06-01T10:00:00Z',
    relato_resumido: 'Verificar classificação',
    equipe: []
  };

  let state = loadSolicitacoesWorkflowState();
  assert.equal(getEffectiveSolicitacaoDestino(solGeral, state), 'GERAL');

  // Analista não pode redistribuir caixa GERAL diretamente
  const analyst = { email: 'analista@sema.mt.gov.br', fullName: 'Analista CSB', role: 'analista' };
  const admin = { email: 'admin@sema.mt.gov.br', fullName: 'Admin CSB', role: 'administrador' };

  const deniedRedist = redistributeGeralSolicitacao(state, {
    solicitacao: solGeral,
    novoDestino: 'equipe-a@sema.mt.gov.br',
    motivo: 'Atribuição direta',
    actor: analyst
  });
  assert.equal(deniedRedist.success, false);

  // Analista solicita revisão administrativa
  const reqRev = requestSolicitacaoAdministrativeReview(state, {
    solicitacaoId: solGeral.id,
    justificativa: 'Solicito direcionamento para equipe norte por proximidade.',
    destinoSolicitado: 'equipe-norte@sema.mt.gov.br',
    actor: analyst
  });
  assert.equal(reqRev.success, true);
  assert.ok(reqRev.record);
  state = reqRev.state;

  // Analista não pode aceitar/rejeitar revisão
  const deniedDecide = decideSolicitacaoAdministrativeReview(state, {
    revisaoId: reqRev.record!.id,
    decision: 'aceita',
    parecerDecisao: 'Tentativa não autorizada',
    actor: analyst
  });
  assert.equal(deniedDecide.success, false);

  // Admin aceita e redistribui com registro auditável
  const okDecide = decideSolicitacaoAdministrativeReview(state, {
    revisaoId: reqRev.record!.id,
    decision: 'aceita',
    parecerDecisao: 'Aprovado pela chefia CSB.',
    actor: admin
  });
  assert.equal(okDecide.success, true);
  state = okDecide.state;
  assert.equal(getEffectiveSolicitacaoDestino(solGeral, state), 'equipe-norte@sema.mt.gov.br');
  assert.equal(state.revisoes[0].status, 'aceita');
  assert.equal(state.redistribuicoes.length, 1);

  // Despacho multi-entidade por processo com justificativa
  const multi = createMultiEntitySolicitacaoPlan(state, {
    processoNumero: 'PROC-2026-888',
    justificativaGeral: 'Ação conjunta Fiscaliza e Notifica para atendimento ao termo.',
    itens: [
      {
        sistemaDestino: 'fiscaliza',
        entidadeTipo: 'barragem',
        entidadeNome: 'Barragem A',
        entidadeId: 'dam-1',
        justificativaEspecifica: 'Vistoria in loco'
      },
      {
        sistemaDestino: 'notifica',
        entidadeTipo: 'empreendedor',
        entidadeNome: 'Empreendedor A',
        entidadeId: 'emp-1',
        justificativaEspecifica: 'Notificação formal de prazo'
      }
    ],
    actorEmail: analyst.email,
    actorName: analyst.fullName
  });
  assert.equal(multi.success, true);
  assert.equal(multi.plan?.itens.length, 2);
});
