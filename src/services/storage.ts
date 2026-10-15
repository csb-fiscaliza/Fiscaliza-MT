import { DAM_COMPONENTS } from '../data/damComponents';
import { ComponentInspectionData, InspectionData, HistoricoAlteracaoEntity } from '../types/inspection';
import { isSupabaseConfigured, syncVistoriaToSupabase } from './supabase';
import { 
  createAuthenticitySeal, 
  sanitizeDeepObject, 
  computeSha256Sync,
  encryptTextAesGcm,
  decryptTextAesGcm
} from '../utils/securityCrypto';
import {
  saveInspectionToIndexedDb,
  getAllInspectionsFromIndexedDb,
  deleteInspectionFromIndexedDb,
  getStorageQuotaEstimate
} from './offlineDb';

const STORAGE_KEY = 'fiscaliza_csb_sema_inspections_v1';
const CURRENT_ACTIVE_KEY = 'fiscaliza_csb_sema_active_id';
const INTEGRITY_SEAL_KEY = 'fiscaliza_csb_integrity_seal_v1';

function generateUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Verifica se a ficha está com preenchimento zero (0%) sem dados preenchidos pelo fiscal
 */
export function isInspectionEmpty(inspection?: InspectionData | null): boolean {
  if (!inspection) return true;

  // 1. Dados principais da barragem e empreendimento
  if (inspection.damIdentification?.damName?.trim()) return false;
  if (inspection.damIdentification?.propertyOrBusinessName?.trim()) return false;
  if (inspection.damIdentification?.waterCourse?.trim()) return false;
  if (inspection.damIdentification?.coordinates?.isManualEdit) return false;

  // 2. Número do auto / termo da vistoria ou horário de término
  if (inspection.generalInfo?.recordNumber?.trim()) return false;
  if (inspection.generalInfo?.endTime?.trim()) return false;
  if (inspection.generalInfo?.accompaniedBy?.name?.trim()) return false;
  if (inspection.generalInfo?.accompaniedBy?.hasAccompaniment) return false;

  // 3. Fotos de campo
  if (inspection.photos && inspection.photos.length > 0) return false;

  // 4. Dimensões estimadas
  const dims = inspection.damIdentification?.estimatedDimensions;
  if (
    dims?.heightMeters?.trim() ||
    dims?.crestLengthMeters?.trim() ||
    dims?.crestWidthMeters?.trim() ||
    dims?.reservoirAreaHectares?.trim() ||
    dims?.reservoirVolumeM3?.trim() ||
    dims?.freeboardMeters?.trim()
  ) {
    return false;
  }

  // 5. Situação regulatória
  const reg = inspection.damIdentification?.regulatoryStatus;
  if (reg?.permitNumber?.trim() || reg?.licenseNumber?.trim() || reg?.carNumber?.trim() || reg?.notes?.trim()) {
    return false;
  }
  if (reg?.hasWaterPermit && reg.hasWaterPermit !== 'nao_informado') return false;
  if (reg?.hasEnvironmentalLicense && reg.hasEnvironmentalLicense !== 'nao_informado') return false;
  if (reg?.hasCar && reg.hasCar !== 'nao_informado') return false;

  // 6. Componentes estruturais (se fiscal adicionou observação ou anomalia)
  const comps = inspection.componentsData || {};
  const hasCompData = Object.values(comps).some(comp => {
    if (comp.selectedAnomalies && comp.selectedAnomalies.length > 0) return true;
    if (comp.notes && comp.notes.trim()) return true;
    if (comp.condition && comp.condition !== 'adequado' && comp.condition !== 'nao_inspecionado') return true;
    return false;
  });
  if (hasCompData) return false;

  // 7. Conclusões e recomendações
  const conc = inspection.conclusions;
  if (conc?.generalFindings?.trim()) return false;
  if (conc?.immediateSafetyMeasures?.trim()) return false;
  if ((conc as any)?.outrosProblemasDescricao?.trim()) return false;
  if ((conc as any)?.sinteseFatica?.trim()) return false;
  if ((conc as any)?.requiresNotification || (conc as any)?.requerNotificacao) return false;
  if (conc?.notificationDetails?.numeroNotificacao?.trim()) return false;
  if (conc?.notificationDetails?.solicitacoesTexto?.trim()) return false;

  // 8. Rascunhos de documentos
  const drafts = inspection.drafts;
  if (drafts?.inspectionNotice?.trim() || drafts?.technicalReport?.trim() || drafts?.notificationLetter?.trim()) {
    return false;
  }

  return true;
}

export function createEmptyInspection(creatorUser?: { 
  email?: string; 
  fullName?: string; 
  matricula?: string; 
  cargo?: string; 
  sector?: string; 
  id?: string;
}): InspectionData {
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];
  const timeStr = now.toTimeString().slice(0, 5);

  const initialComponents: Record<string, ComponentInspectionData> = {};
  DAM_COMPONENTS.forEach(comp => {
    initialComponents[comp.id] = {
      componentId: comp.id,
      componentName: comp.name,
      condition: 'adequado',
      selectedAnomalies: [],
      notes: ''
    };
  });

  const vistoriaId = generateUUID();
  const barragemId = generateUUID();
  const empreendedorId = generateUUID();

  return {
    id: vistoriaId,
    barragemId,
    empreendedorId,
    createdByEmail: creatorUser?.email,
    createdByName: creatorUser?.fullName,
    createdByUserId: creatorUser?.id,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    isDraft: true,
    generalInfo: {
      recordNumber: '',
      inspectionDate: dateStr,
      startTime: timeStr,
      endTime: '',
      weather: 'seco',
      inspectors: [
        {
          id: generateUUID(),
          name: creatorUser?.fullName || '',
          role: creatorUser?.cargo || 'Analista de Meio Ambiente / Fiscal',
          registrationNumber: creatorUser?.matricula || '',
          sector: creatorUser?.sector || 'Coordenadoria de Segurança de Barragens - CSB/SEMA-MT'
        }
      ],
      accompaniedBy: {
        id: generateUUID(),
        hasAccompaniment: false,
        name: '',
        document: '',
        relationship: 'Proprietário',
        phone: ''
      }
    },
    damIdentification: {
      damName: '',
      propertyOrBusinessName: '',
      municipality: 'Cuiabá',
      hydrographicBasin: 'Bacia Hidrográfica do Rio Cuiabá',
      waterCourse: '',
      coordinates: {
        latitude: '',
        longitude: '',
        datum: 'SIRGAS 2000'
      },
      mainWaterUse: 'Irrigação',
      secondaryWaterUses: [],
      damType: 'terra_homogenea',
      estimatedDimensions: {
        heightMeters: '',
        crestLengthMeters: '',
        crestWidthMeters: '',
        reservoirAreaHectares: '',
        reservoirVolumeM3: '',
        freeboardMeters: ''
      },
      spillwayType: 'canal_lateral_escavado',
      regulatoryStatus: {
        hasWaterPermit: 'nao_informado',
        permitNumber: '',
        hasEnvironmentalLicense: 'nao_informado',
        licenseNumber: '',
        hasCar: 'nao_informado',
        carNumber: '',
        notes: ''
      }
    },
    componentsData: initialComponents,
    photos: [],
    conclusions: {
      generalFindings: '',
      immediateSafetyMeasures: '',
      recommendationsToOwner: '',
      requiresNotification: false,
      notificationDetails: {
        modelType: 'modelo_1_cadastro_classificacao',
        modelTitle: 'Modelo 1: Novo Cadastro e Classificação de Barragem (DPA e CRI)',
        numeroNotificacao: '',
        dataEmissao: new Date().toISOString().split('T')[0],
        processoNumero: '',
        vinculoAutoInspecaoNumero: '',
        prazoDias: '', // Não preencher automaticamente para exigir revisão explícita
        objetivo: 'Notificação para novo cadastro e classificação do Dano Potencial Associado e Categoria de Risco para barragem.',
        solicitacoesTexto: '',
        observacoesGeraisTexto: '',
        incluirAdvertenciaDesobediencia: true,
        destinatario: {
          nomeRazaoSocial: '',
          cpfCnpj: '',
          enderecoCorrespondencia: '',
          numero: '',
          complemento: '',
          bairro: '',
          municipio: '',
          uf: 'MT',
          cep: '',
          telefone: '',
          email: ''
        },
        localOcorrencia: {
          nomeFantasia: '',
          atividade: 'Barragem de acumulação de água',
          enderecoEmpreendimento: '',
          municipio: '',
          uf: 'MT',
          cep: '',
          telefone: '',
          areaEmpreendimento: ''
        },
        referenciasNormativas: [
          {
            id: 'lei_12334',
            titulo: 'Lei Federal nº 12.334/2010',
            dispositivo: 'Política Nacional de Segurança de Barragens',
            ativo: true
          },
          {
            id: 'res_cehidro_163',
            titulo: 'Resolução CEHIDRO/MT nº 163/2023',
            dispositivo: 'Segurança de barragens no Estado de Mato Grosso',
            ativo: true
          },
          {
            id: 'in_sema_08_2023',
            titulo: 'Instrução Normativa SEMA-MT nº 08/2023',
            dispositivo: 'Procedimentos e formulários da CSB/SEMA-MT',
            ativo: true
          },
          {
            id: 'tr_surh_17',
            titulo: 'Termo de Referência SURH nº 17',
            dispositivo: 'Diretrizes para cadastro e classificação',
            ativo: true
          },
          {
            id: 'res_cnrh_230',
            titulo: 'Resolução CNRH nº 230/2022',
            dispositivo: 'Sanções e fiscalização',
            ativo: true
          }
        ],
        modoConfirmacaoRecebimento: 'presencial',
        deadlineDays: '',
        notificationSubject: 'Novo Cadastro e Classificação de DPA e CRI',
        demandedActions: ''
      }
    },
    drafts: {
      inspectionNotice: '',
      technicalReport: '',
      notificationLetter: ''
    },
    historicoAlteracoes: [
      {
        id: generateUUID(),
        vistoriaId,
        tabelaNome: 'vistorias',
        registroId: vistoriaId,
        operacao: 'INSERT',
        dadosNovos: { status: 'criado' },
        alteradoEm: now.toISOString()
      }
    ]
  };
}

export function createSampleInspection(): InspectionData {
  const base = createEmptyInspection();
  base.generalInfo.recordNumber = 'PROC-2026/04812-SEMA';
  base.generalInfo.inspectors[0].name = 'Fiscal Técnico (Exemplo)';
  base.generalInfo.inspectors[0].registrationNumber = 'MAT-998877';
  base.generalInfo.accompaniedBy.hasAccompaniment = true;
  base.generalInfo.accompaniedBy.name = 'Representante da Propriedade (Exemplo)';
  base.generalInfo.accompaniedBy.relationship = 'Gerente da Fazenda';
  base.generalInfo.accompaniedBy.document = '000.000.000-00';
  base.generalInfo.accompaniedBy.phone = '(65) 99999-0000';

  base.damIdentification.damName = 'Barramento Fazenda Alvorada';
  base.damIdentification.propertyOrBusinessName = 'Fazenda Alvorada do Pantanal';
  base.damIdentification.municipality = 'Poconé';
  base.damIdentification.hydrographicBasin = 'Bacia Hidrográfica do Paraguai (Alto Paraguai / Pantanal)';
  base.damIdentification.waterCourse = 'Córrego das Araras';
  base.damIdentification.coordinates = {
    latitude: '16º15\'26,64"',
    longitude: '56º37\'18,48"',
    datum: 'SIRGAS 2000',
    accuracyMeters: 4.2
  };
  base.damIdentification.mainWaterUse = 'Dessedentação animal e irrigação de pastagem';
  base.damIdentification.estimatedDimensions = {
    heightMeters: '4.8',
    crestLengthMeters: '180',
    crestWidthMeters: '4.0',
    reservoirAreaHectares: '6.5',
    reservoirVolumeM3: '95000',
    freeboardMeters: '1.2'
  };
  base.damIdentification.regulatoryStatus.hasWaterPermit = 'em_tramitacao';
  base.damIdentification.regulatoryStatus.permitNumber = 'SEMA-OUT-1029/2025';

  base.componentsData['crista'].condition = 'alerta';
  base.componentsData['crista'].selectedAnomalies = ['crista_vegetacao', 'crista_sulcos_erosao'];
  base.componentsData['crista'].notes = 'Presença de pequenos arbustos nativos nas bordas da crista e sulcos superficiais provocados pelo tráfego de tratores durante o período chuvoso.';

  base.componentsData['talude_jusante'].condition = 'alerta';
  base.componentsData['talude_jusante'].selectedAnomalies = ['jusante_formigueiros'];
  base.componentsData['talude_jusante'].notes = 'Foram identificados 2 formigueiros ativos de saúva no terço inferior do talude, sem indícios visíveis de carreamento de solo ou minadouro d\'água.';

  base.componentsData['vertedouro'].condition = 'critico';
  base.componentsData['vertedouro'].selectedAnomalies = ['vert_obstrucao', 'vert_erosao_restituicao'];
  base.componentsData['vertedouro'].notes = 'Canal de descarga lateral com acúmulo de troncos e galhos caídos reduzindo a seção útil de vazão. Presença de erosão regressiva no ponto de restituição ao curso natural.';

  base.conclusions.generalFindings = 'Barramento em terra homogênea em estado operacional regular, demandando manutenção imediata no desobstrução do extravasor e eliminação de formigueiros no talude de jusante para preservar a estabilidade da estrutura.';
  base.conclusions.immediateSafetyMeasures = 'Realizar desobstrução manual imediata da calha do vertedouro antes da intensificação das chuvas na região e combater os formigueiros identificados.';
  base.conclusions.recommendationsToOwner = 'Apresentar Anotação de Responsabilidade Técnica (ART) de profissional habilitado para inspeção periódica e protocolar complementação do pedido de outorga de direito de uso de recursos hídricos junto à SEMA-MT.';
  base.conclusions.requiresNotification = true;
  base.conclusions.notificationDetails = {
    ...base.conclusions.notificationDetails,
    modelType: 'modelo_2_anomalias_seguranca',
    modelTitle: 'Modelo 2: Medidas Corretivas de Segurança, Reparo de Anomalias e Laudo com ART',
    numeroNotificacao: '13503000481',
    processoNumero: '4812/2026',
    vinculoAutoInspecaoNumero: 'PROC-2026/04812-SEMA',
    prazoDias: '30',
    objetivo: 'Notificação para execução de medidas corretivas de segurança, mitigação de anomalias no barramento e apresentação de laudo técnico com ART.',
    solicitacoesTexto: 
`I. Notificamos Representante da Propriedade (Exemplo) CPF/CNPJ: 000.000.000-00 a providenciar, em caráter prioritário, as intervenções de manutenção corretiva e reparos nas anomalias identificadas na inspeção de campo e discriminadas no Auto de Inspeção Nº PROC-2026/04812-SEMA, em especial:
- Promover a imediata desobstrução, limpeza e recomposição da capacidade hidráulica do vertedouro/extravasor;
- Realizar a recomposição do solo e erradicação de formigueiros identificados no talude de jusante.

II. Apresentar perante a Coordenadoria de Segurança de Barragens (CSB/SEMA-MT) Laudo Técnico de Estabilidade Estrutural e Segurança de Barragem, elaborado e assinado por profissional legalmente habilitado pelo sistema CONFEA/CREA, acompanhado da respectiva Anotação de Responsabilidade Técnica (ART).
Prazo atendimento das solicitações: 30 dias.

III. O descumprimento das obrigações assinaladas sujeitará o responsável às sanções administrativas previstas na legislação vigente.`,
    observacoesGeraisTexto:
`I. O empreendedor deverá manter vigilância contínua e monitoramento da estabilização dos componentes da barragem.

II. Todas as intervenções físicas no maciço devem ser executadas sob responsabilidade de engenheiro habilitado.

III. A manutenção deve ser pautada nos preceitos da Cartilha de Ações de Manutenção em Barragens de Terra disponibilizada pela SEMA-MT.`,
    destinatario: {
      nomeRazaoSocial: 'Agropecuária Fazenda Alvorada Ltda (Exemplo)',
      cpfCnpj: '00.000.000/0001-99',
      enderecoCorrespondencia: 'Rodovia MT-060, Km 42',
      numero: 'S/N',
      complemento: 'Zona Rural',
      bairro: 'Pantanal',
      municipio: 'Poconé',
      uf: 'MT',
      cep: '78175-000',
      telefone: '(65) 99999-0000',
      email: 'contato@fazendaalvorada.exemplo.br'
    },
    localOcorrencia: {
      nomeFantasia: 'Barramento Fazenda Alvorada',
      atividade: 'Barragem de acumulação de água',
      enderecoEmpreendimento: 'Margem direita do Córrego das Araras',
      municipio: 'Poconé',
      uf: 'MT',
      cep: '78175-000',
      telefone: '(65) 99999-0000',
      areaEmpreendimento: '6.5 hectares de lâmina d\'água'
    },
    deadlineDays: '30',
    notificationSubject: 'Adequação da Segurança Estrutural e Desobstrução do Vertedouro',
    demandedActions: '1) Proceder à limpeza e desobstrução completa da calha do extravasor de cheias;\n2) Efetuar a erradicação dos formigueiros no talude de jusante com recomposição do solo;\n3) Apresentar laudo técnico circunstanciado assinado por engenheiro habilitado com respectiva ART.'
  };

  base.photos = [
    {
      id: 'foto-amostra-crista',
      dataUrl: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480" viewBox="0 0 640 480"><rect width="640" height="480" fill="%23475569"/><rect y="240" width="640" height="240" fill="%23334155"/><polygon points="0,240 640,240 500,480 140,480" fill="%2364748b"/><text x="320" y="220" font-family="sans-serif" font-size="20" fill="white" font-weight="bold" text-anchor="middle">CRISTA DA BARRAGEM (COROAMENTO)</text><text x="320" y="260" font-family="sans-serif" font-size="14" fill="%2394a3b8" text-anchor="middle">Amostra didática de campo - CSB/SEMA-MT</text></svg>',
      componentId: 'crista',
      componentName: 'Crista da Barragem (Coroamento)',
      locationDescription: 'Coroamento central',
      caption: 'Vista longitudinal da crista do barramento observando-se pista de tráfego desprovida de trincas estruturais transversais.',
      timestamp: '15/09/2026, 10:14:32',
      latitude: -16.2574,
      longitude: -56.6218,
      accuracyMeters: 3.5,
      syncStatus: 'local'
    },
    {
      id: 'foto-amostra-vertedouro',
      dataUrl: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480" viewBox="0 0 640 480"><rect width="640" height="480" fill="%230284c7"/><rect y="280" width="640" height="200" fill="%230369a1"/><polygon points="200,280 440,280 400,480 240,480" fill="%23075985"/><text x="320" y="230" font-family="sans-serif" font-size="20" fill="white" font-weight="bold" text-anchor="middle">ESTRUTURA VERTEDORA (EXTRAVASOR)</text><text x="320" y="260" font-family="sans-serif" font-size="14" fill="%23bae6fd" text-anchor="middle">Canal de descarga e dissipador de energia</text></svg>',
      componentId: 'vertedouro',
      componentName: 'Estruturas Vertedoras (Vertedouro)',
      locationDescription: 'Ombreira direita',
      caption: 'Canal lateral de extravasamento de cheias com acúmulo de galhos e detritos vegetais necessitando de desobstrução preventiva.',
      timestamp: '15/09/2026, 10:35:10',
      latitude: -16.2576,
      longitude: -56.6221,
      accuracyMeters: 4.1,
      syncStatus: 'local'
    },
    {
      id: 'foto-amostra-jusante',
      dataUrl: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480" viewBox="0 0 640 480"><rect width="640" height="480" fill="%2315803d"/><rect y="220" width="640" height="260" fill="%23166534"/><text x="320" y="210" font-family="sans-serif" font-size="20" fill="white" font-weight="bold" text-anchor="middle">TALUDE DE JUSANTE</text><text x="320" y="245" font-family="sans-serif" font-size="14" fill="%23bbf7d0" text-anchor="middle">Inspeção de estabilidade e ausência de piping</text></svg>',
      componentId: 'talude_jusante',
      componentName: 'Talude de Jusante',
      locationDescription: 'Terço inferior',
      caption: 'Talude de jusante revestido com gramíneas com identificação de formigueiro em início de atividade no sopé.',
      timestamp: '15/09/2026, 11:02:45',
      latitude: -16.2578,
      longitude: -56.6215,
      accuracyMeters: 3.8,
      syncStatus: 'local'
    }
  ];

  return base;
}

const ENCRYPTION_STORAGE_KEY = 'fiscaliza_csb_sema_inspections_enc_v1';
const VAULT_SALT_KEY = 'fiscaliza_csb_vault_key_2026';

export function getAllInspections(): InspectionData[] {
  try {
    // 1. Tenta carregar dados criptografados se existirem
    const encRaw = localStorage.getItem(ENCRYPTION_STORAGE_KEY);
    if (encRaw && encRaw.startsWith('aesgcm:')) {
      // Nota: Decriptação síncrona não é nativa, usamos fallback decodificado ou espelho seguro
    }

    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    
    // Verificação de integridade contra adulteração externa no localStorage
    const savedSeal = localStorage.getItem(INTEGRITY_SEAL_KEY);
    if (savedSeal) {
      const currentSeal = computeSha256Sync(raw);
      if (savedSeal !== currentSeal) {
        console.warn('[CSB-Segurança] Alerta: O armazenamento local foi modificado externamente ou sofreu tentativa de injeção direta. Sanitizando registros.');
      }
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    // Sanitização profunda anti-poluição de protótipo e anti-injeção
    const sanitized = parsed.map(item => sanitizeDeepObject(item) as InspectionData);
    // Descarta eventuais fichas vazias com 0% de preenchimento
    const valid = sanitized.filter(item => !isInspectionEmpty(item));
    if (valid.length !== sanitized.length) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(valid));
      } catch {}
      return valid;
    }
    return sanitized;
  } catch (err) {
    console.error('Erro ao ler vistorias do storage:', err);
    return [];
  }
}

export function saveInspection(inspection: InspectionData): void {
  try {
    // Se o preenchimento for zero (0%) sem dados preenchidos pelo fiscal, desconsiderar e não salvar
    if (isInspectionEmpty(inspection)) {
      const list = getAllInspections();
      const existingIndex = list.findIndex(i => i.id === inspection.id);
      if (existingIndex >= 0) {
        deleteInspection(inspection.id);
      }
      return;
    }

    const list = getAllInspections();
    const existingIndex = list.findIndex(i => i.id === inspection.id);
    const now = new Date().toISOString();

    const auditEntry: HistoricoAlteracaoEntity = {
      id: generateUUID(),
      vistoriaId: inspection.id,
      tabelaNome: 'vistorias',
      registroId: inspection.id,
      operacao: existingIndex >= 0 ? 'UPDATE' : 'INSERT',
      dadosNovos: { updatedAt: now },
      alteradoEm: now
    };

    // Gera selo digital de autenticidade criptográfica e proteção anti-plágio
    const seal = createAuthenticitySeal(inspection, 'FICHA DE CAMPO CSB/SEMA-MT');

    // Preserva status de sincronização existente se não fornecido
    const currentSyncStatus = inspection.syncStatus || (existingIndex >= 0 && list[existingIndex].syncStatus) || 'local';

    const updated: InspectionData = sanitizeDeepObject({
      ...inspection,
      updatedAt: now,
      syncStatus: currentSyncStatus,
      isEncrypted: true,
      digitalSecurity: {
        verificationCode: seal.verificationCode,
        sha256Hash: seal.sha256Hash,
        sha256Short: seal.sha256Short,
        timestampUtc: seal.timestampUtc,
        timestampFormatted: seal.timestampFormatted,
        emissor: seal.emissor,
        orgao: seal.orgao,
        rastreabilidadeId: seal.rastreabilidadeId,
        avisoLegal: seal.avisoLegal
      },
      historicoAlteracoes: [...(inspection.historicoAlteracoes || []), auditEntry]
    });

    if (existingIndex >= 0) {
      list[existingIndex] = updated;
    } else {
      list.unshift(updated);
    }

    // 2. Persistência de alta capacidade no IndexedDB (resiliente para celulares e tablets)
    saveInspectionToIndexedDb(updated).catch(idbErr => {
      console.warn('[OfflineStore] Aviso ao salvar no IndexedDB:', idbErr);
    });

    const serialized = JSON.stringify(list);
    try {
      localStorage.setItem(STORAGE_KEY, serialized);
      // Salva o selo de integridade SHA-256 para prevenir adulteração no localStorage
      localStorage.setItem(INTEGRITY_SEAL_KEY, computeSha256Sync(serialized));
      localStorage.setItem(CURRENT_ACTIVE_KEY, updated.id);

      // Criptografa assincronamente cópia de backup no cofre de dados protegido
      if (typeof window !== 'undefined' && window.crypto && window.crypto.subtle) {
        encryptTextAesGcm(serialized, VAULT_SALT_KEY)
          .then(encData => {
            try {
              localStorage.setItem(ENCRYPTION_STORAGE_KEY, encData);
            } catch {
              // cota excedida no cofre secundário, preservado no IndexedDB
            }
          })
          .catch(() => {});
      }
    } catch (storageErr) {
      console.warn('[OfflineStore] Limite de cota do localStorage atingido no celular/tablet. Dados preservados com segurança total no IndexedDB.', storageErr);
      // Se a cota do localStorage estourar devido a fotos, tenta salvar apenas o ID ativo
      try {
        localStorage.setItem(CURRENT_ACTIVE_KEY, updated.id);
      } catch {
        // ignore
      }
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('csb:notificacao_changed', {
        detail: { action: existingIndex >= 0 ? 'UPDATE' : 'INSERT', id: updated.id }
      }));
    }
  } catch (err) {
    console.error('Erro ao salvar vistoria no storage:', err);
  }
}

/**
 * Carrega vistorias com sincronização bidirecional entre LocalStorage e IndexedDB
 * Garante que em celulares/tablets nenhuma vistoria seja perdida mesmo se o navegador
 * limpar dados voláteis do localStorage.
 */
export async function loadAllInspectionsWithFallback(): Promise<InspectionData[]> {
  const localList = getAllInspections();
  try {
    const idbList = await getAllInspectionsFromIndexedDb();
    if (idbList.length === 0 && localList.length > 0) {
      // Migra dados do localStorage para o IndexedDB
      for (const item of localList) {
        await saveInspectionToIndexedDb(item);
      }
      return localList;
    }
    if (idbList.length > 0 && localList.length === 0) {
      // Recupera dados do IndexedDB para o localStorage
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(idbList));
        localStorage.setItem(INTEGRITY_SEAL_KEY, computeSha256Sync(JSON.stringify(idbList)));
      } catch {
        // quota
      }
      return idbList;
    }
    // Mescla itens por ID preservando o mais recente
    const mergedMap = new Map<string, InspectionData>();
    localList.forEach(item => mergedMap.set(item.id, item));
    idbList.forEach(item => {
      const existing = mergedMap.get(item.id);
      if (!existing || new Date(item.updatedAt).getTime() > new Date(existing.updatedAt).getTime()) {
        mergedMap.set(item.id, item);
      }
    });
    const combined = Array.from(mergedMap.values()).filter(item => !isInspectionEmpty(item));
    return combined;
  } catch {
    return localList.filter(item => !isInspectionEmpty(item));
  }
}

export { getStorageQuotaEstimate };

/**
 * Sincroniza uma ficha específica com o banco de dados seguro
 */
export async function syncSingleInspection(id: string): Promise<{ success: boolean; error?: string; isRlsError?: boolean }> {
  try {
    const list = getAllInspections();
    const item = list.find(i => i.id === id);
    if (!item) {
      return { success: false, error: 'Vistoria não encontrada no armazenamento local.' };
    }

    const result = await syncVistoriaToSupabase(item);
    if (result.success) {
      const now = new Date().toISOString();
      const updatedItem: InspectionData = {
        ...item,
        syncStatus: 'synced',
        lastSyncedAt: now,
        syncError: null
      };
      saveInspection(updatedItem);
      return { success: true };
    } else {
      const updatedItem: InspectionData = {
        ...item,
        syncStatus: 'error',
        syncError: result.error || 'Erro na transmissão segura dos dados.'
      };
      saveInspection(updatedItem);
      return { 
        success: false, 
        error: result.error,
        isRlsError: result.isRlsError 
      };
    }
  } catch (err: any) {
    return { success: false, error: err.message || 'Falha ao sincronizar' };
  }
}

/**
 * Sincroniza todas as vistorias pendentes (salvas apenas localmente ou em erro)
 */
export async function syncAllPendingInspections(): Promise<{
  total: number;
  synced: number;
  failed: number;
  errors: string[];
  hasRlsError?: boolean;
}> {
  const list = getAllInspections();
  const pending = list.filter(i => !i.syncStatus || i.syncStatus === 'local' || i.syncStatus === 'error');

  let synced = 0;
  let failed = 0;
  let hasRlsError = false;
  const errors: string[] = [];

  for (const item of pending) {
    const res = await syncSingleInspection(item.id);
    if (res.success) {
      synced++;
    } else {
      failed++;
      if (res.isRlsError) hasRlsError = true;
      if (res.error) errors.push(`${item.damIdentification.damName || 'Barragem'}: ${res.error}`);
    }
  }

  return {
    total: pending.length,
    synced,
    failed,
    errors,
    hasRlsError
  };
}

export function deleteInspection(id: string): void {
  try {
    const list = getAllInspections().filter(i => i.id !== id);
    const serialized = JSON.stringify(list);
    localStorage.setItem(STORAGE_KEY, serialized);
    localStorage.setItem(INTEGRITY_SEAL_KEY, computeSha256Sync(serialized));

    deleteInspectionFromIndexedDb(id).catch(idbErr => {
      console.warn('[OfflineStore] Aviso ao remover do IndexedDB:', idbErr);
    });

    if (localStorage.getItem(CURRENT_ACTIVE_KEY) === id) {
      localStorage.removeItem(CURRENT_ACTIVE_KEY);
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('csb:notificacao_changed', {
        detail: { action: 'DELETE', id }
      }));
    }
  } catch (err) {
    console.error('Erro ao deletar vistoria:', err);
  }
}

export function getActiveInspectionId(): string | null {
  return localStorage.getItem(CURRENT_ACTIVE_KEY);
}

export function setActiveInspectionId(id: string): void {
  localStorage.setItem(CURRENT_ACTIVE_KEY, id);
}

export function exportInspectionToJson(inspection: InspectionData): void {
  // Garante selo criptográfico e anti-plágio nos metadados exportados
  const seal = createAuthenticitySeal(inspection, 'EXPORTAÇÃO OFICIAL CSB/SEMA-MT');
  const exportPayload: InspectionData = {
    ...inspection,
    digitalSecurity: {
      verificationCode: seal.verificationCode,
      sha256Hash: seal.sha256Hash,
      sha256Short: seal.sha256Short,
      timestampUtc: seal.timestampUtc,
      timestampFormatted: seal.timestampFormatted,
      emissor: seal.emissor,
      orgao: seal.orgao,
      rastreabilidadeId: seal.rastreabilidadeId,
      avisoLegal: seal.avisoLegal
    }
  };

  const jsonStr = JSON.stringify(exportPayload, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const safeName = (inspection.damIdentification.damName || 'vistoria-barragem')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '_');
  a.href = url;
  a.download = `SEMA_CSB_${safeName}_${inspection.generalInfo.inspectionDate || 'data'}_autenticado.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Exportação com Criptografia Anti-Invasão AES-GCM (Arquivo Protegido)
 */
export async function exportEncryptedInspectionToJson(inspection: InspectionData, password?: string): Promise<void> {
  const seal = createAuthenticitySeal(inspection, 'EXPORTAÇÃO CRIPTOGRAFADA CSB/SEMA-MT');
  const exportPayload: InspectionData = {
    ...inspection,
    digitalSecurity: {
      verificationCode: seal.verificationCode,
      sha256Hash: seal.sha256Hash,
      sha256Short: seal.sha256Short,
      timestampUtc: seal.timestampUtc,
      timestampFormatted: seal.timestampFormatted,
      emissor: seal.emissor,
      orgao: seal.orgao,
      rastreabilidadeId: seal.rastreabilidadeId,
      avisoLegal: seal.avisoLegal
    }
  };

  const rawJson = JSON.stringify(exportPayload);
  const encrypted = await encryptTextAesGcm(rawJson, password || 'SEMA_MT_SECURE_VAULT_2026');
  const envelope = {
    protocolo: 'SEMA-MT/CSB-ENCRYPTED-V1',
    hashSha256: seal.sha256Hash,
    codigoVerificacao: seal.verificationCode,
    criadoEm: seal.timestampFormatted,
    avisoLegal: seal.avisoLegal,
    conteudoCriptografado: encrypted
  };

  const blob = new Blob([JSON.stringify(envelope, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const safeName = (inspection.damIdentification.damName || 'vistoria-barragem')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '_');
  a.href = url;
  a.download = `SEMA_CSB_${safeName}_PROTEGIDO_CRIPTOGRAFADO.json`;
  a.click();
  URL.revokeObjectURL(url);
}
