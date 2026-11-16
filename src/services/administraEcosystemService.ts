// ==============================================================================
// ARQUIVO: src/services/administraEcosystemService.ts
// Serviço de Integração do Ecossistema CSB/SEMA-MT:
// - Administra Barragens: Repositório Mestre de Empreendedores, Barragens e RTs
// - Regra de Propriedade Estrita:
//     * Todo cadastro novo/editável de Empreendedor, Barragem ou RT feito no
//       Fiscaliza é gravado na base do Administra marcado com sistema_origem='fiscaliza'.
//     * O Fiscaliza NUNCA edita diretamente registros com sistema_origem !== 'fiscaliza'.
//     * Para registros oriundos do Administra, Classifica ou Notifica, o Fiscaliza
//       emite uma Solicitação Formal de Alteração para aprovação/reprovação do
//       analista/administrador detentor (ou do Administra).
// - Catálogo Unificado de Produtos: Permite identificar se qualquer barragem ou
//   empreendedor já possui documentos/produtos no Fiscaliza, Classifica, Notifica
//   ou Administra.
// ==============================================================================

import {
  BarragemEntity,
  EmpreendedorEntity,
  EntidadeMestreTipo,
  ImportedFieldOriginRecord,
  InspectionData,
  NotificacaoAnalistaEcossistema,
  ProdutoEcossistema,
  ResponsavelTecnicoEntity,
  SistemaOrigem,
  SolicitacaoAlteracaoCampo,
  SolicitacaoAlteracaoEcossistema,
  SolicitacaoAlteracaoStatus
} from '../types/inspection';
import {
  administraSupabase,
  classificaSupabase,
  fiscalizaSupabase,
  notificaSupabase
} from './ecosystemConfig';
import { sanitizeDeepObject } from '../utils/securityCrypto';
import { parseGmsToDecimal } from '../utils/geoCoordinates';

const ADMINISTRA_CACHE_KEY = 'fiscaliza_csb_administra_cache_v1';
const ALTERATION_REQUESTS_KEY = 'fiscaliza_csb_alteration_requests_v1';
const ECOSYSTEM_PRODUCTS_KEY = 'fiscaliza_csb_ecosystem_products_v1';
const NOTIFICACOES_ANALISTA_KEY = 'fiscaliza_csb_analyst_inbox_v1';
const ECOSYSTEM_EVENT = 'csb:ecosystem_updated';

export interface AdministraMasterCatalog {
  empreendedores: EmpreendedorEntity[];
  barragens: BarragemEntity[];
  responsaveisTecnicos: ResponsavelTecnicoEntity[];
  updatedAt: string;
}

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

export function normalizeDocumentDigits(doc?: string | null): string {
  return (doc || '').replace(/\D/g, '');
}

function normalizeNameForMatch(name?: string | null): string {
  return (name || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

function emitEcosystemUpdate() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(ECOSYSTEM_EVENT));
  }
}

export function subscribeEcosystemUpdates(callback: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(ECOSYSTEM_EVENT, callback);
  return () => window.removeEventListener(ECOSYSTEM_EVENT, callback);
}

// ==============================================================================
// 1. CONTROLE DE PROPRIEDADE ENTRE SISTEMAS (ESCRITA SOMENTE NO PRÓPRIO DOMÍNIO)
// ==============================================================================

/**
 * Verifica se o sistema Fiscaliza pode editar diretamente uma entidade mestre
 * (Empreendedor, Barragem ou Responsável Técnico).
 * REGRA DO ECOSSISTEMA:
 * - O Fiscaliza só pode alterar diretamente o que foi inserido pelo próprio Fiscaliza.
 * - Registros inseridos pelo Administra, Classifica ou Notifica são somente leitura
 *   no Fiscaliza e exigem Solicitação de Alteração formal para o sistema detentor.
 */
export function canFiscalizaEditMasterEntity(
  sistemaOrigem?: SistemaOrigem | null
): { allowed: boolean; sistemaDetentor: SistemaOrigem; motivo?: string } {
  const origin: SistemaOrigem = sistemaOrigem || 'fiscaliza';
  if (origin === 'fiscaliza') {
    return { allowed: true, sistemaDetentor: 'fiscaliza' };
  }
  const labelMap: Record<SistemaOrigem, string> = {
    administra: 'Administra Barragens',
    classifica: 'Classifica Barragens',
    notifica: 'Notifica Barragens',
    fiscaliza: 'Fiscaliza Barragens'
  };
  return {
    allowed: false,
    sistemaDetentor: origin,
    motivo: `Registro sob titularidade do sistema "${labelMap[origin]}". Para preservar a integridade entre sistemas, edições diretas são bloqueadas; envie uma Solicitação de Alteração.`
  };
}

// ==============================================================================
// 2. ARMAZENAMENTO LOCAL RESILIENTE + CLIENTE REMOTO DO ADMINISTRA
// ==============================================================================

export function loadLocalAdministraCatalog(): AdministraMasterCatalog {
  try {
    const raw = localStorage.getItem(ADMINISTRA_CACHE_KEY);
    if (raw) {
      const parsed = sanitizeDeepObject(JSON.parse(raw)) as Partial<AdministraMasterCatalog>;
      return {
        empreendedores: Array.isArray(parsed.empreendedores) ? parsed.empreendedores : [],
        barragens: Array.isArray(parsed.barragens) ? parsed.barragens : [],
        responsaveisTecnicos: Array.isArray(parsed.responsaveisTecnicos) ? parsed.responsaveisTecnicos : [],
        updatedAt: parsed.updatedAt || new Date().toISOString()
      };
    }
  } catch (err) {
    console.warn('[Ecossistema] Falha ao ler cache local do Administra:', err);
  }
  return {
    empreendedores: [],
    barragens: [],
    responsaveisTecnicos: [],
    updatedAt: new Date().toISOString()
  };
}

function saveLocalAdministraCatalog(catalog: AdministraMasterCatalog): void {
  try {
    const sanitized = sanitizeDeepObject({
      ...catalog,
      updatedAt: new Date().toISOString()
    });
    localStorage.setItem(ADMINISTRA_CACHE_KEY, JSON.stringify(sanitized));
    emitEcosystemUpdate();
  } catch (err) {
    console.warn('[Ecossistema] Falha ao salvar cache local do Administra:', err);
  }
}

/**
 * Busca catálogo padronizado do Administra Barragens (remoto se configurado, mesclado ao cache local).
 */
export async function fetchAdministraMasterCatalog(): Promise<AdministraMasterCatalog> {
  const localCatalog = loadLocalAdministraCatalog();

  if (!administraSupabase) {
    return localCatalog;
  }

  try {
    const [empRes, barRes, rtRes] = await Promise.all([
      administraSupabase.from('empreendedores').select('*').limit(500),
      administraSupabase.from('barragens').select('*').limit(500),
      administraSupabase.from('responsaveis_tecnicos').select('*').limit(500)
    ]);

    const empMap = new Map<string, EmpreendedorEntity>();
    localCatalog.empreendedores.forEach(e => empMap.set(e.id, e));
    if (!empRes.error && Array.isArray(empRes.data)) {
      empRes.data.forEach((row: any) => {
        empMap.set(row.id, {
          id: row.id,
          administraId: row.administra_id || row.id,
          sistemaOrigem: (row.sistema_origem || 'administra') as SistemaOrigem,
          criadoPorEmail: row.criado_por_email || null,
          nomeRazaoSocial: row.nome_razao_social,
          cpfCnpj: row.cpf_cnpj,
          figuraJuridica: row.figura_juridica || 'empresa_privada',
          processoNumero: row.processo_numero || null,
          endereco: row.endereco || '',
          municipio: row.municipio || null,
          uf: row.uf || 'MT',
          telefone: row.telefone || null,
          email: row.email || null,
          documentosPessoais: row.documentos_pessoais || null,
          carNumero: row.car_numero || null,
          declaracaoUsoOutorga: row.declaracao_uso || null,
          quantidadeBarragens: row.quantidade_barragens_propriedade ?? 1,
          comentarios: row.comentarios || null,
          sincronizadoAdministraEm: row.updated_at || new Date().toISOString(),
          createdAt: row.created_at || new Date().toISOString(),
          updatedAt: row.updated_at || new Date().toISOString()
        });
      });
    }

    const barMap = new Map<string, BarragemEntity>();
    localCatalog.barragens.forEach(b => barMap.set(b.id, b));
    if (!barRes.error && Array.isArray(barRes.data)) {
      barRes.data.forEach((row: any) => {
        barMap.set(row.id, {
          id: row.id,
          administraId: row.administra_id || row.id,
          sistemaOrigem: (row.sistema_origem || 'administra') as SistemaOrigem,
          criadoPorEmail: row.criado_por_email || null,
          empreendedorId: row.empreendedor_id,
          nome: row.nome,
          municipio: row.municipio || '',
          baciaHidrografica: row.bacia_hidrografica || null,
          cursoDagua: row.curso_dagua || null,
          coordenadas: {
            latitude: row.latitude_decimal ?? null,
            longitude: row.longitude_decimal ?? null,
            horarioCaptura: row.updated_at || null,
            acuraciaMetros: null,
            altitudeEstimadaDispositivo: null,
            editadoManualmente: true,
            datum: row.datum || 'SIRGAS 2000'
          },
          cotaCoroamentoMetros: row.cota_coroamento_metros ?? null,
          anoInicioObra: row.ano_inicio_obra ?? null,
          anoFinalObra: row.ano_final_obra ?? null,
          idadeBarragemAnos: null,
          tipoMaterial: row.tipo_barragem_material || 'terra_homogenea',
          usoPrincipal: row.uso_principal || '',
          usosSecundarios: Array.isArray(row.usos_secundarios) ? row.usos_secundarios : [],
          sincronizadoAdministraEm: row.updated_at || new Date().toISOString(),
          createdAt: row.created_at || new Date().toISOString(),
          updatedAt: row.updated_at || new Date().toISOString()
        });
      });
    }

    const rtMap = new Map<string, ResponsavelTecnicoEntity>();
    localCatalog.responsaveisTecnicos.forEach(rt => rtMap.set(rt.id, rt));
    if (!rtRes.error && Array.isArray(rtRes.data)) {
      rtRes.data.forEach((row: any) => {
        rtMap.set(row.id, {
          id: row.id,
          administraId: row.administra_id || row.id,
          sistemaOrigem: (row.sistema_origem || 'administra') as SistemaOrigem,
          criadoPorEmail: row.criado_por_email || null,
          empreendedorId: row.empreendedor_id || null,
          barragemId: row.barragem_id || null,
          nome: row.nome,
          cpf: row.cpf || null,
          registroProfissional: row.registro_profissional || null,
          ufRegistro: row.uf_registro || 'MT',
          artNumero: row.art_numero || null,
          especialidade: row.especialidade || null,
          telefone: row.telefone || null,
          email: row.email || null,
          sincronizadoAdministraEm: row.updated_at || new Date().toISOString(),
          createdAt: row.created_at || new Date().toISOString(),
          updatedAt: row.updated_at || new Date().toISOString()
        });
      });
    }

    const merged: AdministraMasterCatalog = {
      empreendedores: Array.from(empMap.values()),
      barragens: Array.from(barMap.values()),
      responsaveisTecnicos: Array.from(rtMap.values()),
      updatedAt: new Date().toISOString()
    };
    saveLocalAdministraCatalog(merged);
    return merged;
  } catch (err) {
    console.warn('[Ecossistema] Usando cache local do Administra (remoto indisponível):', err);
    return localCatalog;
  }
}

/**
 * Persiste Empreendedor, Barragem e Responsável Técnico preenchidos em formulários do Fiscaliza
 * DIRETAMENTE na base do Administra Barragens (ou cache local de migração se chave ainda ausente),
 * RESPEITANDO estritamente a regra de não sobrescrever registros inseridos por outros sistemas.
 */
export async function upsertMasterEntitiesFromInspection(
  inspection: InspectionData,
  actorEmail?: string
): Promise<{
  savedToAdministraRemote: boolean;
  skippedReadOnlyEntities: string[];
  warnings: string[];
}> {
  const now = new Date().toISOString();
  const catalog = loadLocalAdministraCatalog();
  const skippedReadOnlyEntities: string[] = [];
  const warnings: string[] = [];

  const damName = (inspection.damIdentification?.damName || '').trim();
  const empName = (inspection.damIdentification?.propertyOrBusinessName || '').trim();
  const empDocDigits = normalizeDocumentDigits(
    inspection.damIdentification?.ownerCpfCnpj || inspection.generalInfo?.accompaniedBy?.document
  );
  const rtName = (inspection.responsavelTecnico?.nome || '').trim();

  if (!damName && !empName && !rtName) {
    return { savedToAdministraRemote: false, skippedReadOnlyEntities, warnings };
  }

  // --------------------------------------------------------------------------
  // A. EMPREENDEDOR
  // --------------------------------------------------------------------------
  const empId = inspection.empreendedorId || inspection.id;
  const existingEmp = catalog.empreendedores.find(
    e =>
      e.id === empId ||
      (empDocDigits && empDocDigits.length >= 11 && normalizeDocumentDigits(e.cpfCnpj) === empDocDigits)
  );
  const resolvedEmpOrigin: SistemaOrigem =
    existingEmp?.sistemaOrigem || inspection.empreendedorOrigemSistema || 'fiscaliza';
  const empPerm = canFiscalizaEditMasterEntity(resolvedEmpOrigin);

  let empPayloadForRemote: Record<string, any> | null = null;
  if (empName) {
    if (!empPerm.allowed) {
      skippedReadOnlyEntities.push(`Empreendedor (${resolvedEmpOrigin})`);
    } else {
      const targetEmpId = existingEmp?.id || empId;
      const empEntity: EmpreendedorEntity = {
        id: targetEmpId,
        administraId: existingEmp?.administraId || targetEmpId,
        sistemaOrigem: 'fiscaliza',
        criadoPorEmail: existingEmp?.criadoPorEmail || actorEmail || inspection.createdByEmail || null,
        nomeRazaoSocial: empName,
        cpfCnpj:
          inspection.damIdentification?.ownerCpfCnpj ||
          inspection.conclusions?.notificationDetails?.destinatario?.cpfCnpj ||
          existingEmp?.cpfCnpj ||
          null,
        figuraJuridica: inspection.damIdentification?.ownerLegalType || existingEmp?.figuraJuridica || 'empresa_privada',
        processoNumero: inspection.generalInfo?.recordNumber || existingEmp?.processoNumero || null,
        endereco:
          inspection.damIdentification?.ownerAddress ||
          inspection.conclusions?.notificationDetails?.destinatario?.enderecoCorrespondencia ||
          existingEmp?.endereco ||
          '',
        municipio: inspection.damIdentification?.municipality || existingEmp?.municipio || null,
        uf: 'MT',
        telefone:
          inspection.damIdentification?.ownerPhone ||
          inspection.conclusions?.notificationDetails?.destinatario?.telefone ||
          existingEmp?.telefone ||
          null,
        email:
          inspection.conclusions?.notificationDetails?.destinatario?.email ||
          existingEmp?.email ||
          null,
        documentosPessoais: null,
        carNumero: inspection.damIdentification?.regulatoryStatus?.carNumber || existingEmp?.carNumero || null,
        declaracaoUsoOutorga:
          inspection.damIdentification?.regulatoryStatus?.permitNumber || existingEmp?.declaracaoUsoOutorga || null,
        quantidadeBarragens: inspection.damIdentification?.damsCountOnProperty
          ? Number(inspection.damIdentification.damsCountOnProperty) || 1
          : existingEmp?.quantidadeBarragens || 1,
        comentarios: null,
        sincronizadoAdministraEm: administraSupabase ? now : existingEmp?.sincronizadoAdministraEm || null,
        createdAt: existingEmp?.createdAt || inspection.createdAt || now,
        updatedAt: now
      };

      const empIdx = catalog.empreendedores.findIndex(e => e.id === targetEmpId);
      if (empIdx >= 0) catalog.empreendedores[empIdx] = empEntity;
      else catalog.empreendedores.unshift(empEntity);

      empPayloadForRemote = {
        id: empEntity.id,
        administra_id: empEntity.administraId,
        sistema_origem: 'fiscaliza',
        criado_por_email: empEntity.criadoPorEmail,
        nome_razao_social: empEntity.nomeRazaoSocial,
        cpf_cnpj: empEntity.cpfCnpj,
        figura_juridica: empEntity.figuraJuridica,
        endereco: empEntity.endereco,
        telefone: empEntity.telefone,
        email: empEntity.email,
        car_numero: empEntity.carNumero,
        declaracao_uso: empEntity.declaracaoUsoOutorga,
        quantidade_barragens_propriedade: empEntity.quantidadeBarragens,
        updated_at: now
      };
    }
  }

  // --------------------------------------------------------------------------
  // B. BARRAGEM
  // --------------------------------------------------------------------------
  const barId = inspection.barragemId || inspection.id;
  const existingBar = catalog.barragens.find(
    b =>
      b.id === barId ||
      (damName &&
        normalizeNameForMatch(b.nome) === normalizeNameForMatch(damName) &&
        normalizeNameForMatch(b.municipio) === normalizeNameForMatch(inspection.damIdentification?.municipality))
  );
  const resolvedBarOrigin: SistemaOrigem =
    existingBar?.sistemaOrigem || inspection.barragemOrigemSistema || 'fiscaliza';
  const barPerm = canFiscalizaEditMasterEntity(resolvedBarOrigin);

  let barPayloadForRemote: Record<string, any> | null = null;
  if (damName) {
    if (!barPerm.allowed) {
      skippedReadOnlyEntities.push(`Barragem (${resolvedBarOrigin})`);
    } else {
      const targetBarId = existingBar?.id || barId;
      const latDec = parseGmsToDecimal(inspection.damIdentification?.coordinates?.latitude || '', true);
      const lngDec = parseGmsToDecimal(inspection.damIdentification?.coordinates?.longitude || '', false);
      const startYr = inspection.damIdentification?.workStartYear
        ? parseInt(inspection.damIdentification.workStartYear, 10)
        : null;
      const endYr = inspection.damIdentification?.workEndYear
        ? parseInt(inspection.damIdentification.workEndYear, 10)
        : null;

      const barEntity: BarragemEntity = {
        id: targetBarId,
        administraId: existingBar?.administraId || targetBarId,
        sistemaOrigem: 'fiscaliza',
        criadoPorEmail: existingBar?.criadoPorEmail || actorEmail || inspection.createdByEmail || null,
        empreendedorId: existingEmp?.id || empId,
        nome: damName,
        municipio: inspection.damIdentification?.municipality || existingBar?.municipio || '',
        baciaHidrografica: inspection.damIdentification?.hydrographicBasin || existingBar?.baciaHidrografica || null,
        cursoDagua: inspection.damIdentification?.waterCourse || existingBar?.cursoDagua || null,
        coordenadas: {
          latitude: latDec,
          longitude: lngDec,
          horarioCaptura: inspection.damIdentification?.coordinates?.captureTimestamp || now,
          acuraciaMetros: inspection.damIdentification?.coordinates?.accuracyMeters || null,
          altitudeEstimadaDispositivo: inspection.damIdentification?.coordinates?.altitudeMeters || null,
          editadoManualmente: !!inspection.damIdentification?.coordinates?.isManualEdit,
          datum: inspection.damIdentification?.coordinates?.datum || 'SIRGAS 2000'
        },
        latitudeGms: inspection.damIdentification?.coordinates?.latitude || null,
        longitudeGms: inspection.damIdentification?.coordinates?.longitude || null,
        cotaCoroamentoMetros: inspection.damIdentification?.estimatedDimensions?.heightMeters
          ? Number(inspection.damIdentification.estimatedDimensions.heightMeters) || null
          : existingBar?.cotaCoroamentoMetros || null,
        anoInicioObra: !isNaN(Number(startYr)) ? startYr : existingBar?.anoInicioObra || null,
        anoFinalObra: !isNaN(Number(endYr)) ? endYr : existingBar?.anoFinalObra || null,
        idadeBarragemAnos: null,
        tipoMaterial: inspection.damIdentification?.damType || existingBar?.tipoMaterial || 'terra_homogenea',
        usoPrincipal: inspection.damIdentification?.mainWaterUse || existingBar?.usoPrincipal || '',
        usosSecundarios: inspection.damIdentification?.secondaryWaterUses || existingBar?.usosSecundarios || [],
        sincronizadoAdministraEm: administraSupabase ? now : existingBar?.sincronizadoAdministraEm || null,
        createdAt: existingBar?.createdAt || inspection.createdAt || now,
        updatedAt: now
      };

      const barIdx = catalog.barragens.findIndex(b => b.id === targetBarId);
      if (barIdx >= 0) catalog.barragens[barIdx] = barEntity;
      else catalog.barragens.unshift(barEntity);

      barPayloadForRemote = {
        id: barEntity.id,
        administra_id: barEntity.administraId,
        sistema_origem: 'fiscaliza',
        criado_por_email: barEntity.criadoPorEmail,
        empreendedor_id: barEntity.empreendedorId,
        nome: barEntity.nome,
        municipio: barEntity.municipio,
        bacia_hidrografica: barEntity.baciaHidrografica,
        curso_dagua: barEntity.cursoDagua,
        latitude_decimal: barEntity.coordenadas.latitude,
        longitude_decimal: barEntity.coordenadas.longitude,
        datum: barEntity.coordenadas.datum,
        cota_coroamento_metros: barEntity.cotaCoroamentoMetros,
        ano_inicio_obra: barEntity.anoInicioObra,
        ano_final_obra: barEntity.anoFinalObra,
        tipo_barragem_material: barEntity.tipoMaterial,
        uso_principal: barEntity.usoPrincipal,
        usos_secundarios: barEntity.usosSecundarios,
        updated_at: now
      };
    }
  }

  // --------------------------------------------------------------------------
  // C. RESPONSÁVEL TÉCNICO
  // --------------------------------------------------------------------------
  const rtId = inspection.responsavelTecnicoId || inspection.responsavelTecnico?.id || `${inspection.id}_rt`;
  const rtCpfDigits = normalizeDocumentDigits(inspection.responsavelTecnico?.cpf);
  const existingRt = catalog.responsaveisTecnicos.find(
    r => r.id === rtId || (rtCpfDigits && rtCpfDigits.length === 11 && normalizeDocumentDigits(r.cpf) === rtCpfDigits)
  );
  const resolvedRtOrigin: SistemaOrigem =
    existingRt?.sistemaOrigem ||
    inspection.responsavelTecnicoOrigemSistema ||
    inspection.responsavelTecnico?.sistemaOrigem ||
    'fiscaliza';
  const rtPerm = canFiscalizaEditMasterEntity(resolvedRtOrigin);

  let rtPayloadForRemote: Record<string, any> | null = null;
  if (rtName) {
    if (!rtPerm.allowed) {
      skippedReadOnlyEntities.push(`Responsável Técnico (${resolvedRtOrigin})`);
    } else {
      const targetRtId = existingRt?.id || rtId;
      const rtEntity: ResponsavelTecnicoEntity = {
        id: targetRtId,
        administraId: existingRt?.administraId || targetRtId,
        sistemaOrigem: 'fiscaliza',
        criadoPorEmail: existingRt?.criadoPorEmail || actorEmail || inspection.createdByEmail || null,
        empreendedorId: existingEmp?.id || empId,
        barragemId: existingBar?.id || barId,
        nome: rtName,
        cpf: inspection.responsavelTecnico?.cpf || existingRt?.cpf || null,
        registroProfissional:
          inspection.responsavelTecnico?.registroProfissional || existingRt?.registroProfissional || null,
        ufRegistro: 'MT',
        artNumero: inspection.responsavelTecnico?.artNumero || existingRt?.artNumero || null,
        especialidade: inspection.responsavelTecnico?.especialidade || existingRt?.especialidade || null,
        telefone: inspection.responsavelTecnico?.telefone || existingRt?.telefone || null,
        email: inspection.responsavelTecnico?.email || existingRt?.email || null,
        sincronizadoAdministraEm: administraSupabase ? now : existingRt?.sincronizadoAdministraEm || null,
        createdAt: existingRt?.createdAt || now,
        updatedAt: now
      };

      const rtIdx = catalog.responsaveisTecnicos.findIndex(r => r.id === targetRtId);
      if (rtIdx >= 0) catalog.responsaveisTecnicos[rtIdx] = rtEntity;
      else catalog.responsaveisTecnicos.unshift(rtEntity);

      rtPayloadForRemote = {
        id: rtEntity.id,
        administra_id: rtEntity.administraId,
        sistema_origem: 'fiscaliza',
        criado_por_email: rtEntity.criadoPorEmail,
        empreendedor_id: rtEntity.empreendedorId,
        barragem_id: rtEntity.barragemId,
        nome: rtEntity.nome,
        cpf: rtEntity.cpf,
        registro_profissional: rtEntity.registroProfissional,
        uf_registro: rtEntity.ufRegistro,
        art_numero: rtEntity.artNumero,
        especialidade: rtEntity.especialidade,
        telefone: rtEntity.telefone,
        email: rtEntity.email,
        updated_at: now
      };
    }
  }

  saveLocalAdministraCatalog(catalog);

  // Grava no projeto Supabase do ADMINISTRA quando configurado
  let savedToAdministraRemote = false;
  if (administraSupabase) {
    try {
      if (empPayloadForRemote) {
        const { error } = await administraSupabase.from('empreendedores').upsert(empPayloadForRemote);
        if (error) warnings.push(`Administra Empreendedor: ${error.message}`);
      }
      if (barPayloadForRemote) {
        const { error } = await administraSupabase.from('barragens').upsert(barPayloadForRemote);
        if (error) warnings.push(`Administra Barragem: ${error.message}`);
      }
      if (rtPayloadForRemote) {
        const { error } = await administraSupabase.from('responsaveis_tecnicos').upsert(rtPayloadForRemote);
        if (error) warnings.push(`Administra Responsável Técnico: ${error.message}`);
      }
      savedToAdministraRemote = warnings.length === 0;
    } catch (err: any) {
      warnings.push(err?.message || 'Falha de comunicação com a base central do Administra.');
    }
  }

  // Aplica superioridade de campo da Vistoria para qualquer dado importado que o fiscal tenha alterado
  if (inspection.importedFieldsOrigin && Object.keys(inspection.importedFieldsOrigin).length > 0) {
    const supRes = await applyVistoriaSuperiorityUpdates(
      inspection,
      actorEmail || inspection.createdByEmail || '',
      inspection.createdByName || inspection.generalInfo?.inspectors?.[0]?.name || 'Fiscal de Campo'
    );
    if (supRes.warnings.length > 0) {
      warnings.push(...supRes.warnings);
    }
  }

  return {
    savedToAdministraRemote,
    skippedReadOnlyEntities,
    warnings
  };
}

// ==============================================================================
// 3. REGISTRO DE PRODUTOS DO ECOSSISTEMA (RASTREAMENTO ENTRE OS 4 SISTEMAS)
// ==============================================================================

export function loadLocalEcosystemProducts(): ProdutoEcossistema[] {
  try {
    const raw = localStorage.getItem(ECOSYSTEM_PRODUCTS_KEY);
    if (raw) {
      const parsed = sanitizeDeepObject(JSON.parse(raw));
      return Array.isArray(parsed) ? parsed : [];
    }
  } catch {}
  return [];
}

function saveLocalEcosystemProducts(list: ProdutoEcossistema[]): void {
  try {
    localStorage.setItem(ECOSYSTEM_PRODUCTS_KEY, JSON.stringify(sanitizeDeepObject(list)));
    emitEcosystemUpdate();
  } catch {}
}

/**
 * Registra os produtos gerados pelo Fiscaliza (Vistoria, Auto de Inspeção,
 * Relatório Técnico e Notificação) para que Classifica, Notifica e Administra
 * identifiquem instantaneamente que já existem documentos sobre aquela barragem
 * ou empreendedor.
 */
export async function registerFiscalizaProductsFromInspection(
  inspection: InspectionData
): Promise<void> {
  const barragemNome = (inspection.damIdentification?.damName || '').trim();
  const empNome = (inspection.damIdentification?.propertyOrBusinessName || '').trim();
  if (!barragemNome && !empNome) return;

  const barragemId = inspection.barragemId || inspection.id;
  const empreendedorId = inspection.empreendedorId || inspection.id;
  const now = new Date().toISOString();
  const isFutura = inspection.tipoPlanejamento === 'futura';
  const numVistoria = isFutura
    ? 'Vistoria Futura'
    : inspection.generalInfo?.numeroVistoria || inspection.generalInfo?.recordNumber || null;

  const productsToRegister: ProdutoEcossistema[] = [
    {
      id: `${inspection.id}_prod_vistoria`,
      sistemaOrigem: 'fiscaliza',
      tipoProduto: 'vistoria_campo',
      titulo: isFutura
        ? `Pré-Cadastro / Vistoria Futura: ${barragemNome || empNome}`
        : `Ficha de Vistoria de Campo ${numVistoria || ''}`.trim(),
      numeroDocumento: numVistoria,
      processoNumero: inspection.generalInfo?.recordNumber || null,
      barragemId,
      barragemNome: barragemNome || 'Barragem sem nome',
      empreendedorId,
      empreendedorNome: empNome || 'Empreendedor não informado',
      responsavelTecnicoId: inspection.responsavelTecnicoId || null,
      origemRegistroId: inspection.id,
      statusProduto: isFutura ? 'futura_planejada' : inspection.isDraft ? 'em_andamento' : 'concluida',
      dataEmissao: inspection.generalInfo?.inspectionDate || now.split('T')[0],
      autorEmail: inspection.createdByEmail || null,
      autorNome: inspection.createdByName || inspection.generalInfo?.inspectors?.[0]?.name || null,
      resumo: inspection.conclusions?.generalFindings?.slice(0, 180) || null,
      atualizadoEm: now
    }
  ];

  if (inspection.drafts?.inspectionNotice?.trim()) {
    productsToRegister.push({
      id: `${inspection.id}_prod_auto`,
      sistemaOrigem: 'fiscaliza',
      tipoProduto: 'auto_inspecao',
      titulo: `Auto de Inspeção ${numVistoria || ''}`.trim(),
      numeroDocumento: numVistoria,
      processoNumero: inspection.generalInfo?.recordNumber || null,
      barragemId,
      barragemNome: barragemNome || 'Barragem sem nome',
      empreendedorId,
      empreendedorNome: empNome || 'Empreendedor não informado',
      responsavelTecnicoId: inspection.responsavelTecnicoId || null,
      origemRegistroId: inspection.id,
      statusProduto: 'minuta_gerada',
      dataEmissao: inspection.generalInfo?.inspectionDate || now.split('T')[0],
      autorEmail: inspection.createdByEmail || null,
      autorNome: inspection.createdByName || null,
      atualizadoEm: now
    });
  }

  if (inspection.drafts?.technicalReport?.trim()) {
    productsToRegister.push({
      id: `${inspection.id}_prod_relatorio`,
      sistemaOrigem: 'fiscaliza',
      tipoProduto: 'relatorio_tecnico',
      titulo: `Relatório Técnico de Segurança de Barragem ${numVistoria || ''}`.trim(),
      numeroDocumento: numVistoria,
      processoNumero: inspection.generalInfo?.recordNumber || null,
      barragemId,
      barragemNome: barragemNome || 'Barragem sem nome',
      empreendedorId,
      empreendedorNome: empNome || 'Empreendedor não informado',
      responsavelTecnicoId: inspection.responsavelTecnicoId || null,
      origemRegistroId: inspection.id,
      statusProduto: 'minuta_gerada',
      dataEmissao: inspection.generalInfo?.inspectionDate || now.split('T')[0],
      autorEmail: inspection.createdByEmail || null,
      autorNome: inspection.createdByName || null,
      atualizadoEm: now
    });
  }

  if (inspection.conclusions?.requiresNotification || inspection.drafts?.notificationLetter?.trim()) {
    productsToRegister.push({
      id: `${inspection.id}_prod_notificacao`,
      sistemaOrigem: 'fiscaliza',
      tipoProduto: 'notificacao',
      titulo: `Notificação de Campo ${inspection.conclusions?.notificationDetails?.numeroNotificacao || ''}`.trim(),
      numeroDocumento: inspection.conclusions?.notificationDetails?.numeroNotificacao || null,
      processoNumero: inspection.generalInfo?.recordNumber || null,
      barragemId,
      barragemNome: barragemNome || 'Barragem sem nome',
      empreendedorId,
      empreendedorNome: empNome || 'Empreendedor não informado',
      responsavelTecnicoId: inspection.responsavelTecnicoId || null,
      origemRegistroId: inspection.id,
      statusProduto: inspection.drafts?.notificationLetter?.trim() ? 'minuta_gerada' : 'requerida',
      dataEmissao: inspection.conclusions?.notificationDetails?.dataEmissao || now.split('T')[0],
      autorEmail: inspection.createdByEmail || null,
      autorNome: inspection.createdByName || null,
      atualizadoEm: now
    });
  }

  const current = loadLocalEcosystemProducts();
  const map = new Map<string, ProdutoEcossistema>();
  current.forEach(p => map.set(p.id, p));
  productsToRegister.forEach(p => map.set(p.id, p));
  saveLocalEcosystemProducts(Array.from(map.values()));

  // Sincroniza índice no Supabase se configurado
  const remoteClient = administraSupabase || fiscalizaSupabase;
  if (remoteClient) {
    try {
      const payload = productsToRegister.map(p => ({
        id: p.id,
        sistema_origem: p.sistemaOrigem,
        tipo_produto: p.tipoProduto,
        titulo: p.titulo,
        numero_documento: p.numeroDocumento,
        processo_numero: p.processoNumero,
        barragem_id: p.barragemId,
        barragem_nome: p.barragemNome,
        empreendedor_id: p.empreendedorId,
        empreendedor_nome: p.empreendedorNome,
        responsavel_tecnico_id: p.responsavelTecnicoId,
        origem_registro_id: p.origemRegistroId,
        status_produto: p.statusProduto,
        data_emissao: p.dataEmissao,
        autor_email: p.autorEmail,
        autor_nome: p.autorNome,
        resumo: p.resumo,
        atualizado_em: p.atualizadoEm
      }));
      await remoteClient.from('produtos_ecossistema').upsert(payload);
    } catch {
      // Tabela pode ainda não estar migrada no Supabase destino
    }
  }
}

/**
 * Consulta produtos existentes no ecossistema (Fiscaliza, Classifica, Notifica e Administra)
 * filtrando por barragemId, empreendedorId ou nomes equivalentes.
 */
export async function findProductsByDamOrOwner(params: {
  barragemId?: string;
  empreendedorId?: string;
  barragemNome?: string;
  empreendedorNome?: string;
}): Promise<ProdutoEcossistema[]> {
  const map = new Map<string, ProdutoEcossistema>();

  const matchesTarget = (p: ProdutoEcossistema): boolean => {
    if (params.barragemId && p.barragemId === params.barragemId) return true;
    if (params.empreendedorId && p.empreendedorId === params.empreendedorId) return true;
    const bTarget = normalizeNameForMatch(params.barragemNome);
    const eTarget = normalizeNameForMatch(params.empreendedorNome);
    if (bTarget && normalizeNameForMatch(p.barragemNome) === bTarget) return true;
    if (eTarget && normalizeNameForMatch(p.empreendedorNome) === eTarget) return true;
    return false;
  };

  loadLocalEcosystemProducts().forEach(p => {
    if (matchesTarget(p)) map.set(p.id, p);
  });

  const clientsToQuery = [
    { client: administraSupabase, source: 'administra' as SistemaOrigem },
    { client: fiscalizaSupabase, source: 'fiscaliza' as SistemaOrigem },
    { client: classificaSupabase, source: 'classifica' as SistemaOrigem },
    { client: notificaSupabase, source: 'notifica' as SistemaOrigem }
  ].filter(item => item.client !== null);

  await Promise.all(
    clientsToQuery.map(async ({ client, source }) => {
      if (!client) return;
      try {
        const { data, error } = await client
          .from('produtos_ecossistema')
          .select('*')
          .limit(200);
        if (!error && Array.isArray(data)) {
          data.forEach((row: any) => {
            const prod: ProdutoEcossistema = {
              id: row.id,
              sistemaOrigem: (row.sistema_origem || source) as SistemaOrigem,
              tipoProduto: row.tipo_produto || 'outro',
              titulo: row.titulo || 'Documento Institucional',
              numeroDocumento: row.numero_documento || null,
              processoNumero: row.processo_numero || null,
              barragemId: row.barragem_id || '',
              barragemNome: row.barragem_nome || '',
              empreendedorId: row.empreendedor_id || '',
              empreendedorNome: row.empreendedor_nome || '',
              responsavelTecnicoId: row.responsavel_tecnico_id || null,
              origemRegistroId: row.origem_registro_id || row.id,
              statusProduto: row.status_produto || 'emitido',
              dataEmissao: row.data_emissao || row.atualizado_em || '',
              autorEmail: row.autor_email || null,
              autorNome: row.autor_nome || null,
              resumo: row.resumo || null,
              atualizadoEm: row.atualizado_em || new Date().toISOString()
            };
            if (matchesTarget(prod)) {
              map.set(prod.id, prod);
            }
          });
        }
      } catch {
        // Silencioso se o outro sistema ainda não estiver no ar
      }
    })
  );

  return Array.from(map.values()).sort(
    (a, b) => new Date(b.atualizadoEm).getTime() - new Date(a.atualizadoEm).getTime()
  );
}

// ==============================================================================
// 4. SOLICITAÇÕES DE ALTERAÇÃO CROSS-SYSTEM (APROVAÇÃO / REPROVAÇÃO)
// ==============================================================================

export function loadLocalAlterationRequests(): SolicitacaoAlteracaoEcossistema[] {
  try {
    const raw = localStorage.getItem(ALTERATION_REQUESTS_KEY);
    if (raw) {
      const parsed = sanitizeDeepObject(JSON.parse(raw));
      return Array.isArray(parsed) ? parsed : [];
    }
  } catch {}
  return [];
}

function saveLocalAlterationRequests(list: SolicitacaoAlteracaoEcossistema[]): void {
  try {
    localStorage.setItem(ALTERATION_REQUESTS_KEY, JSON.stringify(sanitizeDeepObject(list)));
    emitEcosystemUpdate();
  } catch {}
}

export async function listAlterationRequests(): Promise<SolicitacaoAlteracaoEcossistema[]> {
  const map = new Map<string, SolicitacaoAlteracaoEcossistema>();
  loadLocalAlterationRequests().forEach(r => map.set(r.id, r));

  const remoteClient = administraSupabase || fiscalizaSupabase;
  if (remoteClient) {
    try {
      const { data, error } = await remoteClient
        .from('solicitacoes_alteracao_ecossistema')
        .select('*')
        .order('criado_em', { ascending: false })
        .limit(200);

      if (!error && Array.isArray(data)) {
        data.forEach((row: any) => {
          map.set(row.id, {
            id: row.id,
            entidadeTipo: row.entidade_tipo as EntidadeMestreTipo,
            entidadeId: row.entidade_id,
            entidadeNome: row.entidade_nome,
            sistemaSolicitante: (row.sistema_solicitante || 'fiscaliza') as SistemaOrigem,
            sistemaDetentor: (row.sistema_detentor || 'administra') as SistemaOrigem,
            solicitanteEmail: row.solicitante_email,
            solicitanteNome: row.solicitante_nome,
            aprovadorDesignadoEmail: row.aprovador_designado_email || null,
            camposAlterados: row.campos_alterados || {},
            justificativa: row.justificativa || '',
            status: (row.status || 'pendente') as SolicitacaoAlteracaoStatus,
            respostaMotivo: row.resposta_motivo || null,
            analisadoPorEmail: row.analisado_por_email || null,
            analisadoPorNome: row.analisado_por_nome || null,
            analisadoEm: row.analisado_em || null,
            criadoEm: row.criado_em || new Date().toISOString(),
            atualizadoEm: row.atualizado_em || new Date().toISOString()
          });
        });
      }
    } catch {
      // Fallback para lista local
    }
  }

  const merged = Array.from(map.values()).sort(
    (a, b) => new Date(b.criadoEm).getTime() - new Date(a.criadoEm).getTime()
  );
  saveLocalAlterationRequests(merged);
  return merged;
}

export async function submitAlterationRequest(params: {
  entidadeTipo: EntidadeMestreTipo;
  entidadeId: string;
  entidadeNome: string;
  sistemaDetentor: SistemaOrigem;
  solicitanteEmail: string;
  solicitanteNome: string;
  aprovadorDesignadoEmail?: string | null;
  camposAlterados: Record<string, SolicitacaoAlteracaoCampo>;
  justificativa: string;
}): Promise<{ success: boolean; request?: SolicitacaoAlteracaoEcossistema; error?: string }> {
  if (!params.justificativa.trim()) {
    return { success: false, error: 'Informe a justificativa técnica para a solicitação de alteração.' };
  }
  if (Object.keys(params.camposAlterados).length === 0) {
    return { success: false, error: 'Informe ao menos um campo com valor proposto para alteração.' };
  }

  const now = new Date().toISOString();
  const newReq: SolicitacaoAlteracaoEcossistema = {
    id: generateUUID(),
    entidadeTipo: params.entidadeTipo,
    entidadeId: params.entidadeId,
    entidadeNome: params.entidadeNome,
    sistemaSolicitante: 'fiscaliza',
    sistemaDetentor: params.sistemaDetentor,
    solicitanteEmail: params.solicitanteEmail.trim().toLowerCase(),
    solicitanteNome: params.solicitanteNome.trim(),
    aprovadorDesignadoEmail: params.aprovadorDesignadoEmail || null,
    camposAlterados: sanitizeDeepObject(params.camposAlterados),
    justificativa: params.justificativa.trim(),
    status: 'pendente',
    criadoEm: now,
    atualizadoEm: now
  };

  const list = loadLocalAlterationRequests();
  saveLocalAlterationRequests([newReq, ...list]);

  const remoteClient = administraSupabase || fiscalizaSupabase;
  if (remoteClient) {
    try {
      await remoteClient.from('solicitacoes_alteracao_ecossistema').insert({
        id: newReq.id,
        entidade_tipo: newReq.entidadeTipo,
        entidade_id: newReq.entidadeId,
        entidade_nome: newReq.entidadeNome,
        sistema_solicitante: newReq.sistemaSolicitante,
        sistema_detentor: newReq.sistemaDetentor,
        solicitante_email: newReq.solicitanteEmail,
        solicitante_nome: newReq.solicitanteNome,
        aprovador_designado_email: newReq.aprovadorDesignadoEmail,
        campos_alterados: newReq.camposAlterados,
        justificativa: newReq.justificativa,
        status: 'pendente',
        criado_em: now,
        atualizado_em: now
      });
    } catch (err) {
      console.warn('[Ecossistema] Solicitação salva localmente; aguardando migração remota:', err);
    }
  }

  return { success: true, request: newReq };
}

/**
 * Aprova ou Reprova uma solicitação de alteração.
 * Somente administradores/analistas do sistema detentor (ou Administra) podem decidir.
 * No Fiscaliza, libera aprovação para solicitações cujo sistemaDetentor === 'fiscaliza'
 * (quando o usuário for Administrador ou o criador/responsável).
 */
export async function resolveAlterationRequest(params: {
  requestId: string;
  decision: 'aprovada' | 'reprovada';
  reviewerEmail: string;
  reviewerName: string;
  reviewerRole?: string;
  respostaMotivo?: string;
}): Promise<{ success: boolean; error?: string }> {
  const requests = await listAlterationRequests();
  const idx = requests.findIndex(r => r.id === params.requestId);
  if (idx === -1) {
    return { success: false, error: 'Solicitação de alteração não localizada.' };
  }

  const req = requests[idx];
  const isAdmin = (params.reviewerRole || '').toLowerCase() === 'administrador';

  // Somente o sistema detentor ou o sistema central Administra pode aprovar/reprovar
  if (req.sistemaDetentor !== 'fiscaliza' && !isAdmin) {
    return {
      success: false,
      error: `Esta solicitação pertence ao sistema detentor "${req.sistemaDetentor}". Somente o analista/administrador responsável daquele sistema ou do Administra pode aprovar ou reprovar.`
    };
  }

  const now = new Date().toISOString();
  const updatedReq: SolicitacaoAlteracaoEcossistema = {
    ...req,
    status: params.decision,
    respostaMotivo: params.respostaMotivo?.trim() || (params.decision === 'aprovada' ? 'Alteração homologada.' : 'Alteração indeferida.'),
    analisadoPorEmail: params.reviewerEmail.trim().toLowerCase(),
    analisadoPorNome: params.reviewerName.trim(),
    analisadoEm: now,
    atualizadoEm: now
  };

  requests[idx] = updatedReq;
  saveLocalAlterationRequests(requests);

  // Se aprovada, aplica as alterações propostas ao catálogo mestre correspondente
  if (params.decision === 'aprovada') {
    const catalog = loadLocalAdministraCatalog();
    const applyFields = <T extends Record<string, any>>(target: T): T => {
      const next = { ...target } as Record<string, any>;
      Object.entries(req.camposAlterados).forEach(([fieldKey, diff]) => {
        if (fieldKey !== 'id' && fieldKey !== 'sistemaOrigem' && diff?.valorProposto !== undefined) {
          next[fieldKey] = diff.valorProposto;
        }
      });
      next.updatedAt = now;
      return next as T;
    };

    if (req.entidadeTipo === 'empreendedor') {
      const eIdx = catalog.empreendedores.findIndex(e => e.id === req.entidadeId);
      if (eIdx >= 0) {
        catalog.empreendedores[eIdx] = applyFields(catalog.empreendedores[eIdx]);
      }
    } else if (req.entidadeTipo === 'barragem') {
      const bIdx = catalog.barragens.findIndex(b => b.id === req.entidadeId);
      if (bIdx >= 0) {
        catalog.barragens[bIdx] = applyFields(catalog.barragens[bIdx]);
      }
    } else if (req.entidadeTipo === 'responsavel_tecnico') {
      const rIdx = catalog.responsaveisTecnicos.findIndex(r => r.id === req.entidadeId);
      if (rIdx >= 0) {
        catalog.responsaveisTecnicos[rIdx] = applyFields(catalog.responsaveisTecnicos[rIdx]);
      }
    }
    saveLocalAdministraCatalog(catalog);
  }

  const remoteClient = administraSupabase || fiscalizaSupabase;
  if (remoteClient) {
    try {
      await remoteClient
        .from('solicitacoes_alteracao_ecossistema')
        .update({
          status: updatedReq.status,
          resposta_motivo: updatedReq.respostaMotivo,
          analisado_por_email: updatedReq.analisadoPorEmail,
          analisado_por_nome: updatedReq.analisadoPorNome,
          analisado_em: updatedReq.analisadoEm,
          atualizado_em: now
        })
        .eq('id', req.id);
    } catch {}
  }

  return { success: true };
}

// ==============================================================================
// 5. BUSCA NO ECOSSISTEMA (TÓPICO 2) & SUPERIORIDADE DA VISTORIA SOBRE DADOS IMPORTADOS
// ==============================================================================

export async function searchEcosystemEntrepreneursAndDams(query: string): Promise<{
  empreendedores: EmpreendedorEntity[];
  barragens: BarragemEntity[];
  responsaveisTecnicos: ResponsavelTecnicoEntity[];
  queriedRemote: boolean;
}> {
  const catalog = await fetchAdministraMasterCatalog();
  const q = normalizeNameForMatch(query);
  const qDigits = normalizeDocumentDigits(query);

  const matchEmp = (e: EmpreendedorEntity) => {
    if (!q && !qDigits) return true;
    const nameMatch = normalizeNameForMatch(e.nomeRazaoSocial).includes(q);
    const munMatch = normalizeNameForMatch(e.municipio).includes(q);
    const carMatch = normalizeNameForMatch(e.carNumero).includes(q);
    const docMatch = qDigits ? normalizeDocumentDigits(e.cpfCnpj).includes(qDigits) : false;
    return nameMatch || munMatch || carMatch || docMatch;
  };

  const matchedEmps = catalog.empreendedores.filter(matchEmp);
  const matchedEmpIds = new Set(matchedEmps.map(e => e.id));

  const matchedBars = catalog.barragens.filter(b => {
    if (matchedEmpIds.has(b.empreendedorId)) return true;
    if (!q) return true;
    return (
      normalizeNameForMatch(b.nome).includes(q) ||
      normalizeNameForMatch(b.municipio).includes(q)
    );
  });

  return {
    empreendedores: matchedEmps,
    barragens: matchedBars,
    responsaveisTecnicos: catalog.responsaveisTecnicos,
    queriedRemote: !!administraSupabase
  };
}

export function loadLocalAnalystInbox(): NotificacaoAnalistaEcossistema[] {
  try {
    const raw = localStorage.getItem(NOTIFICACOES_ANALISTA_KEY);
    if (raw) {
      const parsed = sanitizeDeepObject(JSON.parse(raw));
      return Array.isArray(parsed) ? parsed : [];
    }
  } catch {}
  return [];
}

function saveLocalAnalystInbox(list: NotificacaoAnalistaEcossistema[]): void {
  try {
    localStorage.setItem(NOTIFICACOES_ANALISTA_KEY, JSON.stringify(sanitizeDeepObject(list)));
    emitEcosystemUpdate();
  } catch {}
}

export async function listAnalystInboxNotifications(): Promise<NotificacaoAnalistaEcossistema[]> {
  const map = new Map<string, NotificacaoAnalistaEcossistema>();
  loadLocalAnalystInbox().forEach(n => map.set(n.id, n));

  const clients = [administraSupabase, fiscalizaSupabase, classificaSupabase, notificaSupabase].filter(Boolean);
  await Promise.all(
    clients.map(async client => {
      if (!client) return;
      try {
        const { data, error } = await client
          .from('notificacoes_analista_ecossistema')
          .select('*')
          .order('criada_em', { ascending: false })
          .limit(200);
        if (!error && Array.isArray(data)) {
          data.forEach((row: any) => {
            map.set(row.id, {
              id: row.id,
              sistemaDestino: row.sistema_destino,
              sistemaOrigem: row.sistema_origem || 'fiscaliza',
              destinatarioAnalistaEmail: row.destinatario_analista_email,
              entidadeTipo: row.entidade_tipo,
              entidadeId: row.entidade_id,
              entidadeNome: row.entidade_nome,
              vistoriaId: row.vistoria_id,
              numeroVistoria: row.numero_vistoria || null,
              campoAlterado: row.campo_alterado,
              campoRotulo: row.campo_rotulo,
              valorAnterior: row.valor_anterior || '',
              valorAtualizadoVistoria: row.valor_atualizado_vistoria,
              alteradoPorEmail: row.alterado_por_email,
              alteradoPorNome: row.alterado_por_nome,
              motivoSuperioridade: row.motivo_superioridade || '',
              lida: !!row.lida,
              criadaEm: row.criada_em || new Date().toISOString()
            });
          });
        }
      } catch {}
    })
  );

  const merged = Array.from(map.values()).sort(
    (a, b) => new Date(b.criadaEm).getTime() - new Date(a.criadaEm).getTime()
  );
  saveLocalAnalystInbox(merged);
  return merged;
}

export async function markAnalystNotificationRead(id: string): Promise<void> {
  const list = loadLocalAnalystInbox();
  const next = list.map(n => (n.id === id ? { ...n, lida: true } : n));
  saveLocalAnalystInbox(next);
  const clients = [administraSupabase, fiscalizaSupabase, classificaSupabase, notificaSupabase].filter(Boolean);
  await Promise.all(
    clients.map(async client => {
      try {
        await client?.from('notificacoes_analista_ecossistema').update({ lida: true }).eq('id', id);
      } catch {}
    })
  );
}

function getLiveInspectionFieldValue(inspection: InspectionData, fieldKey: string): string {
  switch (fieldKey) {
    case 'propertyOrBusinessName':
      return inspection.damIdentification?.propertyOrBusinessName || '';
    case 'ownerCpfCnpj':
      return inspection.damIdentification?.ownerCpfCnpj || '';
    case 'ownerLegalType':
      return inspection.damIdentification?.ownerLegalType || '';
    case 'ownerPhone':
      return inspection.damIdentification?.ownerPhone || '';
    case 'ownerAddress':
      return inspection.damIdentification?.ownerAddress || '';
    case 'ownerEmail':
      return inspection.conclusions?.notificationDetails?.destinatario?.email || '';
    case 'carNumber':
      return inspection.damIdentification?.regulatoryStatus?.carNumber || '';
    case 'permitNumber':
      return inspection.damIdentification?.regulatoryStatus?.permitNumber || '';
    case 'damsCountOnProperty':
      return inspection.damIdentification?.damsCountOnProperty || '';
    case 'damName':
      return inspection.damIdentification?.damName || '';
    case 'municipality':
      return inspection.damIdentification?.municipality || '';
    case 'waterCourse':
      return inspection.damIdentification?.waterCourse || '';
    case 'workStartYear':
      return inspection.damIdentification?.workStartYear || '';
    case 'workEndYear':
      return inspection.damIdentification?.workEndYear || '';
    case 'rtNome':
      return inspection.responsavelTecnico?.nome || '';
    case 'rtCpf':
      return inspection.responsavelTecnico?.cpf || '';
    case 'rtRegistro':
      return inspection.responsavelTecnico?.registroProfissional || '';
    case 'rtArt':
      return inspection.responsavelTecnico?.artNumero || '';
    case 'rtTelefone':
      return inspection.responsavelTecnico?.telefone || '';
    case 'rtEmail':
      return inspection.responsavelTecnico?.email || '';
    default:
      return '';
  }
}

function getClientForSystem(sys: SistemaOrigem) {
  switch (sys) {
    case 'administra':
      return administraSupabase;
    case 'classifica':
      return classificaSupabase;
    case 'notifica':
      return notificaSupabase;
    case 'fiscaliza':
    default:
      return fiscalizaSupabase;
  }
}

/**
 * Aplica a SUPERIORIDADE DOS DADOS DE VISTORIA sobre campos importados de outros sistemas:
 * - Quando o fiscal altera em campo um dado importado (caixa laranja com *),
 *   esse valor visto presencialmente tem precedência e atualiza o cadastro mestre
 *   no Administra + envia notificação direta para a caixa do analista que inseriu o dado
 *   original dentro do sistema em que ele o cadastrou.
 */
export async function applyVistoriaSuperiorityUpdates(
  inspection: InspectionData,
  actorEmail: string,
  actorName: string
): Promise<{
  updatedCount: number;
  notificationsSent: NotificacaoAnalistaEcossistema[];
  warnings: string[];
}> {
  const importedMap = inspection.importedFieldsOrigin || {};
  const notificationsSent: NotificacaoAnalistaEcossistema[] = [];
  const warnings: string[] = [];
  const existingInbox = loadLocalAnalystInbox();
  const catalog = loadLocalAdministraCatalog();
  const now = new Date().toISOString();
  let updatedCount = 0;

  for (const [fieldKey, meta] of Object.entries(importedMap) as [string, ImportedFieldOriginRecord][]) {
    const liveVal = getLiveInspectionFieldValue(inspection, fieldKey).trim();
    const origVal = (meta.originalValue || '').trim();
    if (liveVal === origVal) continue;

    // Evita reenviar notificação idêntica já registrada para exatamente o mesmo valor
    const alreadyNotifiedSameValue = existingInbox.some(
      n =>
        n.vistoriaId === inspection.id &&
        n.campoAlterado === fieldKey &&
        n.valorAtualizadoVistoria.trim() === liveVal
    );
    if (alreadyNotifiedSameValue) continue;

    updatedCount++;

    // 1. Atualiza o catálogo local (e Administra remoto) com o dado verificado em vistoria
    if (meta.entidadeTipo === 'empreendedor') {
      const idx = catalog.empreendedores.findIndex(e => e.id === meta.entidadeId);
      if (idx >= 0) {
        const target = { ...catalog.empreendedores[idx] };
        if (fieldKey === 'propertyOrBusinessName') target.nomeRazaoSocial = liveVal;
        if (fieldKey === 'ownerCpfCnpj') target.cpfCnpj = liveVal;
        if (fieldKey === 'ownerLegalType') target.figuraJuridica = liveVal as any;
        if (fieldKey === 'ownerPhone') target.telefone = liveVal;
        if (fieldKey === 'ownerAddress') target.endereco = liveVal;
        if (fieldKey === 'ownerEmail') target.email = liveVal;
        if (fieldKey === 'carNumber') target.carNumero = liveVal;
        if (fieldKey === 'permitNumber') target.declaracaoUsoOutorga = liveVal;
        if (fieldKey === 'damsCountOnProperty') target.quantidadeBarragens = Number(liveVal) || 1;
        target.updatedAt = now;
        catalog.empreendedores[idx] = target;
      }
    } else if (meta.entidadeTipo === 'barragem') {
      const idx = catalog.barragens.findIndex(b => b.id === meta.entidadeId);
      if (idx >= 0) {
        const target = { ...catalog.barragens[idx] };
        if (fieldKey === 'damName') target.nome = liveVal;
        if (fieldKey === 'municipality') target.municipio = liveVal;
        if (fieldKey === 'waterCourse') target.cursoDagua = liveVal;
        if (fieldKey === 'workStartYear') target.anoInicioObra = parseInt(liveVal, 10) || null;
        if (fieldKey === 'workEndYear') target.anoFinalObra = parseInt(liveVal, 10) || null;
        target.updatedAt = now;
        catalog.barragens[idx] = target;
      }
    } else if (meta.entidadeTipo === 'responsavel_tecnico') {
      const idx = catalog.responsaveisTecnicos.findIndex(r => r.id === meta.entidadeId);
      if (idx >= 0) {
        const target = { ...catalog.responsaveisTecnicos[idx] };
        if (fieldKey === 'rtNome') target.nome = liveVal;
        if (fieldKey === 'rtCpf') target.cpf = liveVal;
        if (fieldKey === 'rtRegistro') target.registroProfissional = liveVal;
        if (fieldKey === 'rtArt') target.artNumero = liveVal;
        if (fieldKey === 'rtTelefone') target.telefone = liveVal;
        if (fieldKey === 'rtEmail') target.email = liveVal;
        target.updatedAt = now;
        catalog.responsaveisTecnicos[idx] = target;
      }
    }

    const entidadeNome =
      meta.entidadeTipo === 'barragem'
        ? inspection.damIdentification.damName || 'Barragem'
        : meta.entidadeTipo === 'responsavel_tecnico'
        ? inspection.responsavelTecnico?.nome || 'Responsável Técnico'
        : inspection.damIdentification.propertyOrBusinessName || 'Empreendedor';

    const notif: NotificacaoAnalistaEcossistema = {
      id: generateUUID(),
      sistemaDestino: meta.sourceSystem,
      sistemaOrigem: 'fiscaliza',
      destinatarioAnalistaEmail: (meta.originalAnalystEmail || 'analista.responsavel@csb.sema.mt.gov.br').toLowerCase(),
      entidadeTipo: meta.entidadeTipo,
      entidadeId: meta.entidadeId,
      entidadeNome,
      vistoriaId: inspection.id,
      numeroVistoria: inspection.generalInfo?.numeroVistoria || null,
      campoAlterado: fieldKey,
      campoRotulo: meta.fieldLabel,
      valorAnterior: origVal,
      valorAtualizadoVistoria: liveVal,
      alteradoPorEmail: (actorEmail || 'fiscal@csb.sema.mt.gov.br').toLowerCase(),
      alteradoPorNome: actorName || 'Fiscal de Campo',
      motivoSuperioridade:
        'Alteração aplicada por superioridade da Vistoria Presencial em Campo (dado conferido in loco pelo fiscal).',
      lida: false,
      criadaEm: now
    };

    notificationsSent.push(notif);

    // Envia para a caixa do analista no sistema de origem (e espelho do Administra/Fiscaliza)
    const destClients = Array.from(
      new Set([getClientForSystem(meta.sourceSystem), administraSupabase, fiscalizaSupabase].filter(Boolean))
    );
    await Promise.all(
      destClients.map(async client => {
        if (!client) return;
        try {
          await client.from('notificacoes_analista_ecossistema').insert({
            id: notif.id,
            sistema_destino: notif.sistemaDestino,
            sistema_origem: 'fiscaliza',
            destinatario_analista_email: notif.destinatarioAnalistaEmail,
            entidade_tipo: notif.entidadeTipo,
            entidade_id: notif.entidadeId,
            entidade_nome: notif.entidadeNome,
            vistoria_id: notif.vistoriaId,
            numero_vistoria: notif.numeroVistoria,
            campo_alterado: notif.campoAlterado,
            campo_rotulo: notif.campoRotulo,
            valor_anterior: notif.valorAnterior,
            valor_atualizado_vistoria: notif.valorAtualizadoVistoria,
            alterado_por_email: notif.alteradoPorEmail,
            alterado_por_nome: notif.alteradoPorNome,
            motivo_superioridade: notif.motivoSuperioridade,
            lida: false,
            criada_em: now
          });
        } catch (err: any) {
          warnings.push(`Notificação analista (${meta.sourceSystem}): ${err?.message || 'pendente de migração'}`);
        }
      })
    );

    // Registra histórico de alteração aplicada por superioridade de vistoria
    const existingReqs = loadLocalAlterationRequests();
    const auditReq: SolicitacaoAlteracaoEcossistema = {
      id: generateUUID(),
      entidadeTipo: meta.entidadeTipo,
      entidadeId: meta.entidadeId,
      entidadeNome,
      sistemaSolicitante: 'fiscaliza',
      sistemaDetentor: meta.sourceSystem,
      solicitanteEmail: notif.alteradoPorEmail,
      solicitanteNome: notif.alteradoPorNome,
      aprovadorDesignadoEmail: notif.destinatarioAnalistaEmail,
      camposAlterados: {
        [fieldKey]: {
          rotulo: meta.fieldLabel,
          valorAtual: origVal,
          valorProposto: liveVal
        }
      },
      justificativa: notif.motivoSuperioridade,
      status: 'aplicada_por_vistoria',
      respostaMotivo: 'Atualizado automaticamente por superioridade do dado constatado em vistoria.',
      analisadoPorEmail: notif.alteradoPorEmail,
      analisadoPorNome: notif.alteradoPorNome,
      analisadoEm: now,
      criadoEm: now,
      atualizadoEm: now
    };
    saveLocalAlterationRequests([auditReq, ...existingReqs]);
  }

  if (updatedCount > 0) {
    saveLocalAdministraCatalog(catalog);
    saveLocalAnalystInbox([...notificationsSent, ...existingInbox]);

    // Propaga alterações no Administra e demais servidores configurados
    if (administraSupabase) {
      try {
        const empTarget = catalog.empreendedores.find(e => e.id === inspection.empreendedorId);
        if (empTarget) {
          await administraSupabase
            .from('empreendedores')
            .update({
              nome_razao_social: empTarget.nomeRazaoSocial,
              cpf_cnpj: empTarget.cpfCnpj,
              figura_juridica: empTarget.figuraJuridica,
              endereco: empTarget.endereco,
              telefone: empTarget.telefone,
              email: empTarget.email,
              car_numero: empTarget.carNumero,
              declaracao_uso: empTarget.declaracaoUsoOutorga,
              quantidade_barragens_propriedade: empTarget.quantidadeBarragens,
              updated_at: now
            })
            .eq('id', empTarget.id);
        }
        const barTarget = catalog.barragens.find(b => b.id === inspection.barragemId);
        if (barTarget) {
          await administraSupabase
            .from('barragens')
            .update({
              nome: barTarget.nome,
              municipio: barTarget.municipio,
              curso_dagua: barTarget.cursoDagua,
              ano_inicio_obra: barTarget.anoInicioObra,
              ano_final_obra: barTarget.anoFinalObra,
              updated_at: now
            })
            .eq('id', barTarget.id);
        }
      } catch (err: any) {
        warnings.push(`Propagação Administra: ${err?.message || 'aguardando regra RLS/trigger'}`);
      }
    }
  }

  return { updatedCount, notificationsSent, warnings };
}

export function applyMasterSelectionToInspection(
  prev: InspectionData,
  payload: {
    empreendedor?: EmpreendedorEntity | null;
    barragem?: BarragemEntity | null;
    responsavelTecnico?: ResponsavelTecnicoEntity | null;
  }
): InspectionData {
  const now = new Date().toISOString();
  const originMap: Record<string, ImportedFieldOriginRecord> = {
    ...(prev.importedFieldsOrigin || {})
  };

  const next: InspectionData = {
    ...prev,
    damIdentification: {
      ...prev.damIdentification,
      coordinates: { ...prev.damIdentification.coordinates },
      regulatoryStatus: { ...prev.damIdentification.regulatoryStatus }
    },
    conclusions: {
      ...prev.conclusions,
      notificationDetails: {
        ...prev.conclusions.notificationDetails,
        destinatario: { ...prev.conclusions.notificationDetails.destinatario }
      }
    },
    importedFieldsOrigin: originMap
  };

  const trackField = (
    fieldKey: string,
    fieldLabel: string,
    entidadeTipo: EntidadeMestreTipo,
    entidadeId: string,
    sourceSystem: SistemaOrigem,
    originalAnalystEmail: string | null | undefined,
    value: string
  ) => {
    if (!value) return;
    originMap[fieldKey] = {
      fieldKey,
      fieldLabel,
      entidadeTipo,
      entidadeId,
      sourceSystem,
      originalAnalystEmail: originalAnalystEmail || null,
      originalValue: value,
      currentValue: value,
      importedAt: now,
      modifiedInVistoria: false
    };
  };

  if (payload.empreendedor) {
    const emp = payload.empreendedor;
    next.empreendedorId = emp.id;
    next.empreendedorOrigemSistema = emp.sistemaOrigem;
    next.damIdentification.propertyOrBusinessName = emp.nomeRazaoSocial;
    next.damIdentification.ownerCpfCnpj = emp.cpfCnpj || '';
    next.damIdentification.ownerLegalType = emp.figuraJuridica || 'empresa_privada';
    next.damIdentification.ownerPhone = emp.telefone || '';
    next.damIdentification.ownerAddress = emp.endereco || '';
    next.damIdentification.damsCountOnProperty = emp.quantidadeBarragens
      ? String(emp.quantidadeBarragens)
      : '1';

    if (emp.carNumero) {
      next.damIdentification.regulatoryStatus.carNumber = emp.carNumero;
      next.damIdentification.regulatoryStatus.hasCar = 'sim';
    }
    if (emp.declaracaoUsoOutorga) {
      next.damIdentification.regulatoryStatus.permitNumber = emp.declaracaoUsoOutorga;
      next.damIdentification.regulatoryStatus.hasWaterPermit = 'sim';
    }
    next.conclusions.notificationDetails.destinatario = {
      ...next.conclusions.notificationDetails.destinatario,
      nomeRazaoSocial: emp.nomeRazaoSocial,
      cpfCnpj: emp.cpfCnpj || '',
      enderecoCorrespondencia: emp.endereco || '',
      telefone: emp.telefone || '',
      email: emp.email || '',
      municipio: emp.municipio || next.damIdentification.municipality || ''
    };

    trackField(
      'propertyOrBusinessName',
      'Nome do Empreendedor / Razão Social',
      'empreendedor',
      emp.id,
      emp.sistemaOrigem,
      emp.criadoPorEmail,
      emp.nomeRazaoSocial
    );
    trackField(
      'ownerCpfCnpj',
      'CPF ou CNPJ',
      'empreendedor',
      emp.id,
      emp.sistemaOrigem,
      emp.criadoPorEmail,
      emp.cpfCnpj || ''
    );
    trackField(
      'ownerLegalType',
      'Figura Jurídica',
      'empreendedor',
      emp.id,
      emp.sistemaOrigem,
      emp.criadoPorEmail,
      emp.figuraJuridica || ''
    );
    trackField(
      'ownerPhone',
      'Telefone / WhatsApp',
      'empreendedor',
      emp.id,
      emp.sistemaOrigem,
      emp.criadoPorEmail,
      emp.telefone || ''
    );
    trackField(
      'ownerAddress',
      'Endereço / Localização da Propriedade',
      'empreendedor',
      emp.id,
      emp.sistemaOrigem,
      emp.criadoPorEmail,
      emp.endereco || ''
    );
    trackField(
      'ownerEmail',
      'E-mail do Empreendedor',
      'empreendedor',
      emp.id,
      emp.sistemaOrigem,
      emp.criadoPorEmail,
      emp.email || ''
    );
    trackField(
      'carNumber',
      'CAR / Recibo de Inscrição',
      'empreendedor',
      emp.id,
      emp.sistemaOrigem,
      emp.criadoPorEmail,
      emp.carNumero || ''
    );
    trackField(
      'permitNumber',
      'Declaração de Uso / Outorga',
      'empreendedor',
      emp.id,
      emp.sistemaOrigem,
      emp.criadoPorEmail,
      emp.declaracaoUsoOutorga || ''
    );
    trackField(
      'damsCountOnProperty',
      'Quantidade de Barragens no Imóvel',
      'empreendedor',
      emp.id,
      emp.sistemaOrigem,
      emp.criadoPorEmail,
      emp.quantidadeBarragens ? String(emp.quantidadeBarragens) : '1'
    );
  }

  if (payload.barragem) {
    const bar = payload.barragem;
    next.barragemId = bar.id;
    next.barragemOrigemSistema = bar.sistemaOrigem;
    next.sistemaOrigem = bar.sistemaOrigem;
    if (bar.empreendedorId && !next.empreendedorId) {
      next.empreendedorId = bar.empreendedorId;
    }
    next.damIdentification.damName = bar.nome;
    next.damIdentification.municipality = bar.municipio || next.damIdentification.municipality;
    next.damIdentification.hydrographicBasin =
      bar.baciaHidrografica || next.damIdentification.hydrographicBasin;
    next.damIdentification.waterCourse = bar.cursoDagua || '';
    next.damIdentification.workStartYear = bar.anoInicioObra ? String(bar.anoInicioObra) : '';
    next.damIdentification.workEndYear = bar.anoFinalObra ? String(bar.anoFinalObra) : '';
    next.damIdentification.damType = bar.tipoMaterial || next.damIdentification.damType;
    next.damIdentification.mainWaterUse = bar.usoPrincipal || next.damIdentification.mainWaterUse;
    if (bar.latitudeGms && bar.longitudeGms) {
      next.damIdentification.coordinates.latitude = bar.latitudeGms;
      next.damIdentification.coordinates.longitude = bar.longitudeGms;
    }

    trackField(
      'damName',
      'Nome da Barragem',
      'barragem',
      bar.id,
      bar.sistemaOrigem,
      bar.criadoPorEmail,
      bar.nome
    );
    trackField(
      'municipality',
      'Município (MT)',
      'barragem',
      bar.id,
      bar.sistemaOrigem,
      bar.criadoPorEmail,
      bar.municipio || ''
    );
    trackField(
      'waterCourse',
      "Nome do Curso D'Água Barrado",
      'barragem',
      bar.id,
      bar.sistemaOrigem,
      bar.criadoPorEmail,
      bar.cursoDagua || ''
    );
    trackField(
      'workStartYear',
      'Ano Início da Obra',
      'barragem',
      bar.id,
      bar.sistemaOrigem,
      bar.criadoPorEmail,
      bar.anoInicioObra ? String(bar.anoInicioObra) : ''
    );
    trackField(
      'workEndYear',
      'Ano Final da Obra',
      'barragem',
      bar.id,
      bar.sistemaOrigem,
      bar.criadoPorEmail,
      bar.anoFinalObra ? String(bar.anoFinalObra) : ''
    );
  }

  if (payload.responsavelTecnico) {
    const rt = payload.responsavelTecnico;
    next.responsavelTecnicoId = rt.id;
    next.responsavelTecnicoOrigemSistema = rt.sistemaOrigem;
    next.responsavelTecnico = {
      id: rt.id,
      nome: rt.nome,
      cpf: rt.cpf || '',
      registroProfissional: rt.registroProfissional || '',
      artNumero: rt.artNumero || '',
      especialidade: rt.especialidade || '',
      telefone: rt.telefone || '',
      email: rt.email || '',
      sistemaOrigem: rt.sistemaOrigem
    };

    trackField(
      'rtNome',
      'Nome do Responsável Técnico',
      'responsavel_tecnico',
      rt.id,
      rt.sistemaOrigem,
      rt.criadoPorEmail,
      rt.nome
    );
    trackField(
      'rtRegistro',
      'Registro Profissional (CREA/CONFEA)',
      'responsavel_tecnico',
      rt.id,
      rt.sistemaOrigem,
      rt.criadoPorEmail,
      rt.registroProfissional || ''
    );
    trackField(
      'rtArt',
      'Nº ART / TRT',
      'responsavel_tecnico',
      rt.id,
      rt.sistemaOrigem,
      rt.criadoPorEmail,
      rt.artNumero || ''
    );
    trackField(
      'rtCpf',
      'CPF do RT',
      'responsavel_tecnico',
      rt.id,
      rt.sistemaOrigem,
      rt.criadoPorEmail,
      rt.cpf || ''
    );
    trackField(
      'rtTelefone',
      'Telefone do RT',
      'responsavel_tecnico',
      rt.id,
      rt.sistemaOrigem,
      rt.criadoPorEmail,
      rt.telefone || ''
    );
    trackField(
      'rtEmail',
      'E-mail do RT',
      'responsavel_tecnico',
      rt.id,
      rt.sistemaOrigem,
      rt.criadoPorEmail,
      rt.email || ''
    );
  }

  return next;
}

