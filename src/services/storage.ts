import { DAM_COMPONENTS } from '../data/damComponents';
import { ComponentInspectionData, InspectionData, HistoricoAlteracaoEntity } from '../types/inspection';
import { syncVistoriaToSupabase } from './supabase';
import {
  registerFiscalizaProductsFromInspection,
  upsertMasterEntitiesFromInspection
} from './administraEcosystemService';
import { 
  createAuthenticitySeal, 
  sanitizeDeepObject, 
  computeSha256Sync,
  encryptTextAesGcm
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

  // 1. Dados principais da barragem, empreendedor e responsável técnico
  if (inspection.damIdentification?.damName?.trim()) return false;
  if (inspection.damIdentification?.propertyOrBusinessName?.trim()) return false;
  if (inspection.damIdentification?.ownerCpfCnpj?.trim()) return false;
  if (inspection.damIdentification?.waterCourse?.trim()) return false;
  if (inspection.damIdentification?.coordinates?.isManualEdit) return false;
  if (inspection.responsavelTecnico?.nome?.trim()) return false;
  if (inspection.itensObservacaoFutura && inspection.itensObservacaoFutura.length > 0) return false;

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

/**
 * Calcula o próximo número sequencial de vistoria para o ano vigente.
 * Formato padrão: 0001/ANO_VIGENTE (ex: 0001/2026).
 * Busca o maior número já cadastrado em vistorias salvas e continua a contagem (+1).
 * O campo permanece totalmente editável pelo fiscal caso vistorias tenham sido feitas fora do sistema.
 */
export function getNextVistoriaNumber(customYear?: number): string {
  const currentYear = customYear || new Date().getFullYear();
  let maxSeq = 0;

  try {
    const stored: InspectionData[] = getAllInspections();
    stored.forEach((insp: InspectionData) => {
      const num = insp.generalInfo?.numeroVistoria || insp.generalInfo?.recordNumber;
      if (num && typeof num === 'string') {
        const trimmed = num.trim();
        // Identifica formatos como "0001/2026", "14/2026", "0025 / 2026"
        const match = trimmed.match(/^(\d+)\s*\/\s*(\d{4})/);
        if (match) {
          const seq = parseInt(match[1], 10);
          const yr = parseInt(match[2], 10);
          if (yr === currentYear && !isNaN(seq) && seq > maxSeq) {
            maxSeq = seq;
          }
        } else {
          // Caso ano da vistoria seja o atual e inicie com número
          const inspYear = insp.generalInfo?.inspectionDate
            ? new Date(insp.generalInfo.inspectionDate).getFullYear()
            : currentYear;
          if (inspYear === currentYear) {
            const simpleMatch = trimmed.match(/^(\d+)/);
            if (simpleMatch) {
              const seq = parseInt(simpleMatch[1], 10);
              if (!isNaN(seq) && seq > maxSeq) {
                maxSeq = seq;
              }
            }
          }
        }
      }
    });
  } catch (e) {
    console.warn('Erro ao calcular próximo número de vistoria local:', e);
  }

  const nextSeq = maxSeq + 1;
  return `${String(nextSeq).padStart(4, '0')}/${currentYear}`;
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
  const responsavelTecnicoId = generateUUID();

  return {
    id: vistoriaId,
    barragemId,
    empreendedorId,
    responsavelTecnicoId,
    sistemaOrigem: 'fiscaliza',
    empreendedorOrigemSistema: 'fiscaliza',
    barragemOrigemSistema: 'fiscaliza',
    responsavelTecnicoOrigemSistema: 'fiscaliza',
    administraCadastroStatus: {
      empreendedor: { cadastrado: false },
      barragem: { cadastrado: false },
      responsavelTecnico: { cadastrado: false }
    },
    createdByEmail: creatorUser?.email,
    createdByName: creatorUser?.fullName,
    createdByUserId: creatorUser?.id,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    isDraft: true,
    tipoPlanejamento: 'atual',
    itensObservacaoFutura: [],
    generalInfo: {
      tipoPlanejamento: 'atual',
      recordNumber: '',
      numeroVistoria: getNextVistoriaNumber(),
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
      ownerCpfCnpj: '',
      ownerLegalType: 'empresa_privada',
      ownerPhone: '',
      ownerAddress: '',
      damsCountOnProperty: '1',
      workStartYear: '',
      workEndYear: '',
      municipality: '',
      hydrographicBasin: '',
      waterCourse: '',
      coordinates: {
        latitude: '',
        longitude: '',
        datum: 'SIRGAS 2000'
      },
      mainWaterUse: '',
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
    responsavelTecnico: {
      id: responsavelTecnicoId,
      nome: '',
      cpf: '',
      registroProfissional: '',
      artNumero: '',
      especialidade: '',
      telefone: '',
      email: '',
      sistemaOrigem: 'fiscaliza'
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

const ENCRYPTION_STORAGE_KEY = 'fiscaliza_csb_sema_inspections_enc_v1';
const DEVICE_VAULT_SECRET_KEY = 'fiscaliza_csb_device_secret_v2';

function getOrCreateDeviceVaultSecret(): string | null {
  if (typeof window === 'undefined' || !window.localStorage || !window.crypto?.getRandomValues) {
    return null;
  }
  try {
    let secret = localStorage.getItem(DEVICE_VAULT_SECRET_KEY);
    if (!secret || secret.length < 32) {
      const bytes = new Uint8Array(32);
      crypto.getRandomValues(bytes);
      secret = Array.from(bytes)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
      localStorage.setItem(DEVICE_VAULT_SECRET_KEY, secret);
    }
    return secret;
  } catch {
    return null;
  }
}

export function isSampleInspection(item?: InspectionData | null): boolean {
  if (!item) return false;
  try {
    const strItem = JSON.stringify(item);
    if (
      strItem.includes('Fazenda Alvorada') ||
      strItem.includes('(Exemplo)') ||
      strItem.includes('fazendaalvorada') ||
      strItem.includes('00.000.000/0001-99') ||
      strItem.includes('Córrego das Araras') ||
      strItem.includes('PROC-2026/04812-SEMA') ||
      strItem.includes('Rodovia MT-060') ||
      strItem.includes('contato@fazendaalvorada') ||
      (strItem.includes('99999-0000') && strItem.includes('Alvorada'))
    ) {
      return true;
    }
  } catch {}

  const d = item.damIdentification;
  const g = item.generalInfo;
  const notif = item.conclusions?.notificationDetails;
  const drafts = item.drafts;
  return (
    d?.damName?.includes('Fazenda Alvorada') === true ||
    d?.propertyOrBusinessName?.includes('Fazenda Alvorada') === true ||
    notif?.destinatario?.nomeRazaoSocial?.includes('Fazenda Alvorada') === true ||
    notif?.destinatario?.email?.includes('fazendaalvorada') === true ||
    g?.recordNumber === 'PROC-2026/04812-SEMA' ||
    (Array.isArray(g?.inspectors) && g.inspectors.some(insp => insp.name?.includes('(Exemplo)'))) ||
    g?.accompaniedBy?.name?.includes('(Exemplo)') === true ||
    drafts?.technicalReport?.includes('Fazenda Alvorada') === true ||
    drafts?.technicalReport?.includes('(Exemplo)') === true
  );
}

function containsLegacyExampleMarker(raw: string): boolean {
  return (
    raw.includes('Fazenda Alvorada') ||
    raw.includes('(Exemplo)') ||
    raw.includes('fazendaalvorada') ||
    raw.includes('00.000.000/0001-99') ||
    raw.includes('Córrego das Araras') ||
    raw.includes('PROC-2026/04812-SEMA')
  );
}

export async function purgeAllMockData(): Promise<void> {
  try {
    // 1. Limpa localStorage de qualquer resquício de dados de exemplo
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          const clean = parsed.filter(item => !isSampleInspection(item) && !isInspectionEmpty(item));
          if (clean.length !== parsed.length) {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(clean));
            localStorage.setItem(INTEGRITY_SEAL_KEY, computeSha256Sync(JSON.stringify(clean)));
            localStorage.removeItem(ENCRYPTION_STORAGE_KEY);
          }
        } else if (containsLegacyExampleMarker(raw)) {
          localStorage.removeItem(STORAGE_KEY);
          localStorage.removeItem(ENCRYPTION_STORAGE_KEY);
        }
      } catch {
        if (containsLegacyExampleMarker(raw)) {
          localStorage.removeItem(STORAGE_KEY);
          localStorage.removeItem(ENCRYPTION_STORAGE_KEY);
        }
      }
    }

    // 2. Limpa cache local do Administra e produtos se contiver registros legados de exemplo
    const adminCacheRaw = localStorage.getItem('fiscaliza_csb_administra_cache_v1');
    if (adminCacheRaw && containsLegacyExampleMarker(adminCacheRaw)) {
      try {
        const parsed = JSON.parse(adminCacheRaw);
        const filterOut = (arr: any[]) =>
          Array.isArray(arr) ? arr.filter(x => !containsLegacyExampleMarker(JSON.stringify(x))) : [];
        localStorage.setItem(
          'fiscaliza_csb_administra_cache_v1',
          JSON.stringify({
            ...parsed,
            empreendedores: filterOut(parsed?.empreendedores),
            barragens: filterOut(parsed?.barragens),
            responsaveisTecnicos: filterOut(parsed?.responsaveisTecnicos)
          })
        );
      } catch {
        localStorage.removeItem('fiscaliza_csb_administra_cache_v1');
      }
    }

    const ecoProdsRaw = localStorage.getItem('fiscaliza_csb_ecosystem_products_v1');
    if (ecoProdsRaw && containsLegacyExampleMarker(ecoProdsRaw)) {
      try {
        const parsed = JSON.parse(ecoProdsRaw);
        if (Array.isArray(parsed)) {
          const clean = parsed.filter(x => !containsLegacyExampleMarker(JSON.stringify(x)));
          localStorage.setItem('fiscaliza_csb_ecosystem_products_v1', JSON.stringify(clean));
        }
      } catch {
        localStorage.removeItem('fiscaliza_csb_ecosystem_products_v1');
      }
    }

    // 3. Limpa activeId se apontar para registro de exemplo
    const activeId = localStorage.getItem(CURRENT_ACTIVE_KEY);
    if (activeId) {
      const all = getAllInspections();
      if (!all.some(i => i.id === activeId) || all.find(i => i.id === activeId && isSampleInspection(i))) {
        localStorage.removeItem(CURRENT_ACTIVE_KEY);
      }
    }

    // 4. Limpa IndexedDB
    const idbList = await getAllInspectionsFromIndexedDb();
    for (const item of idbList) {
      if (isSampleInspection(item)) {
        await deleteInspectionFromIndexedDb(item.id);
      }
    }
  } catch (err) {
    console.warn('[Storage] Erro ao expurgar dados fictícios:', err);
  }
}

export function getAllInspections(): InspectionData[] {
  try {
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
    // Descarta eventuais fichas vazias com 0% de preenchimento e expurga fichas de exemplo
    const valid = sanitized.filter(item => !isInspectionEmpty(item) && !isSampleInspection(item));
    if (valid.length !== sanitized.length) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(valid));
        localStorage.setItem(INTEGRITY_SEAL_KEY, computeSha256Sync(JSON.stringify(valid)));
      } catch {}
      return valid;
    }
    return valid;
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

      // Criptografa cópia de backup usando segredo aleatório exclusivo do dispositivo (nunca chave fixa em código)
      const deviceSecret = getOrCreateDeviceVaultSecret();
      if (deviceSecret && typeof window !== 'undefined' && window.crypto && window.crypto.subtle) {
        encryptTextAesGcm(serialized, deviceSecret)
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
      console.warn('[OfflineStore] Limite de cota do localStorage atingido no dispositivo. Dados preservados no IndexedDB.', storageErr);
      try {
        localStorage.setItem(CURRENT_ACTIVE_KEY, updated.id);
      } catch {
        // ignore
      }
    }

    // Atualiza o catálogo central do Administra (cache local/remoto respeitando propriedade) e índice de produtos
    upsertMasterEntitiesFromInspection(updated, updated.createdByEmail).catch(() => {});
    registerFiscalizaProductsFromInspection(updated).catch(() => {});

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
    const rawIdbList = await getAllInspectionsFromIndexedDb();
    
    // Purga ativamente quaisquer registros fictícios remanescentes no IndexedDB
    for (const item of rawIdbList) {
      if (isSampleInspection(item) || isInspectionEmpty(item)) {
        await deleteInspectionFromIndexedDb(item.id);
      }
    }

    const idbList = rawIdbList.filter(item => !isInspectionEmpty(item) && !isSampleInspection(item));

    if (idbList.length === 0 && localList.length > 0) {
      // Migra dados limpos do localStorage para o IndexedDB
      for (const item of localList) {
        await saveInspectionToIndexedDb(item);
      }
      return localList;
    }
    if (idbList.length > 0 && localList.length === 0) {
      // Recupera dados limpos do IndexedDB para o localStorage
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
    const combined = Array.from(mergedMap.values()).filter(item => !isInspectionEmpty(item) && !isSampleInspection(item));
    return combined;
  } catch {
    return localList.filter(item => !isInspectionEmpty(item) && !isSampleInspection(item));
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
 * Exportação com Criptografia AES-GCM 256-bit (Exige frase-chave fornecida pelo usuário)
 */
export async function exportEncryptedInspectionToJson(inspection: InspectionData, passphrase: string): Promise<void> {
  if (!passphrase || passphrase.trim().length < 6) {
    throw new Error('Informe uma senha de proteção com no mínimo 6 caracteres para exportar o arquivo criptografado.');
  }

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
  const encrypted = await encryptTextAesGcm(rawJson, passphrase.trim());
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
