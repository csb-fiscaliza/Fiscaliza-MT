// ==============================================================================
// ARQUIVO: src/services/supabase.ts
// Camada de Autenticação Segura e Sincronização de Produtos do FISCALIZA (CSB/SEMA-MT)
// Regras de Segurança Reforçadas:
// - ZERO senhas padrão, ZERO e-mails pessoais hardcoded, ZERO login anônimo
// - Contingência offline protegida com hash PBKDF2-SHA256 (nunca texto plano)
// - Separação Ecossistema: Produtos no Fiscaliza + Mestres no Administra
// ==============================================================================

import { SupabaseClient } from '@supabase/supabase-js';
import {
  VistoriaAggregate,
  ItemAvaliadoEntity,
  DocumentoGeradoEntity,
  InspectionData,
  ComponentInspectionData,
  InspectionPhoto,
  SistemaOrigem
} from '../types/inspection';
import { parseGmsToDecimal } from '../utils/geoCoordinates';
import {
  fiscalizaSupabase,
  isFiscalizaSupabaseConfigured,
  isAdministraSupabaseConfigured,
  getEcosystemStatus,
  EcosystemNodeStatus
} from './ecosystemConfig';
import {
  canFiscalizaEditMasterEntity,
  registerFiscalizaProductsFromInspection,
  upsertMasterEntitiesFromInspection
} from './administraEcosystemService';
import {
  hashPasswordSecure,
  verifyPasswordSecure,
  validatePasswordStrength,
  maskEmail
} from '../utils/securityCrypto';

export const isSupabaseConfigured = isFiscalizaSupabaseConfigured;
export const supabase: SupabaseClient | null = fiscalizaSupabase;

const SESSION_STORAGE_KEY = 'fiscaliza_csb_active_session_v2';
const LEGACY_SESSION_KEY = 'fiscaliza_csb_active_session_v1';
const LEGACY_PWD_PREFIX = 'fiscaliza_csb_pwd_';
const AUTH_HASH_PREFIX = 'fiscaliza_csb_auth_hash_v2_';
const USERS_STORAGE_KEY = 'fiscaliza_csb_users_catalog_v1';
const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 horas de validade da sessão

const BOOTSTRAP_ADMIN_EMAIL = (import.meta.env.VITE_BOOTSTRAP_ADMIN_EMAIL || '').trim().toLowerCase();

/**
 * Remove imediatamente quaisquer resquícios legados de senha em texto plano do navegador
 */
export function purgeLegacyPlaintextCredentials(): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(LEGACY_PWD_PREFIX)) {
        keysToRemove.push(k);
      }
    }
    keysToRemove.forEach(k => localStorage.removeItem(k));
    localStorage.removeItem(LEGACY_SESSION_KEY);
  } catch {
    // ignore storage access issues
  }
}

// Executa limpeza preventiva no carregamento do módulo
purgeLegacyPlaintextCredentials();

// Helpers para preservação estrita de zero numérico ao converter campos vazios para null
const toNullableNumber = (val: number | string | null | undefined): number | null => {
  if (val === undefined || val === null || val === '') return null;
  const num = typeof val === 'number' ? val : Number(val);
  return isNaN(num) ? null : num;
};

const toNullableString = (val: string | null | undefined): string | null => {
  if (val === undefined || val === null) return null;
  const trimmed = val.trim();
  return trimmed === '' ? null : trimmed;
};

// Helper para transformar InspectionData em VistoriaAggregate compatível com o esquema do banco de dados
export function convertInspectionDataToAggregate(data: InspectionData): VistoriaAggregate {
  const now = new Date().toISOString();
  const year = data.generalInfo.inspectionDate
    ? parseInt(data.generalInfo.inspectionDate.split('-')[0])
    : new Date().getFullYear();

  const empId = data.empreendedorId || data.id;
  const empOrigin: SistemaOrigem = data.empreendedorOrigemSistema || data.sistemaOrigem || 'fiscaliza';
  const empreendedor = {
    id: empId,
    administraId: empId,
    sistemaOrigem: empOrigin,
    criadoPorEmail: data.createdByEmail || null,
    nomeRazaoSocial:
      data.damIdentification.propertyOrBusinessName ||
      data.damIdentification.damName ||
      'Empreendedor não informado',
    cpfCnpj:
      data.damIdentification.ownerCpfCnpj ||
      data.conclusions.notificationDetails?.destinatario?.cpfCnpj ||
      data.generalInfo.accompaniedBy?.document ||
      null,
    figuraJuridica: data.damIdentification.ownerLegalType || ('empresa_privada' as const),
    processoNumero: data.generalInfo.recordNumber || null,
    endereco:
      data.damIdentification.ownerAddress ||
      data.conclusions.notificationDetails?.destinatario?.enderecoCorrespondencia ||
      'Mato Grosso / MT',
    telefone:
      data.damIdentification.ownerPhone ||
      data.conclusions.notificationDetails?.destinatario?.telefone ||
      data.generalInfo.accompaniedBy?.phone ||
      null,
    email: data.conclusions.notificationDetails?.destinatario?.email || null,
    documentosPessoais: null,
    carNumero: data.damIdentification.regulatoryStatus.carNumber || null,
    declaracaoUsoOutorga: data.damIdentification.regulatoryStatus.permitNumber || null,
    quantidadeBarragens: toNullableNumber(data.damIdentification.damsCountOnProperty) ?? 1,
    comentarios: null,
    createdAt: data.createdAt || now,
    updatedAt: data.updatedAt || now
  };

  const barId = data.barragemId || data.id;
  const barOrigin: SistemaOrigem = data.barragemOrigemSistema || data.sistemaOrigem || 'fiscaliza';
  const barragem = {
    id: barId,
    administraId: barId,
    sistemaOrigem: barOrigin,
    criadoPorEmail: data.createdByEmail || null,
    empreendedorId: empId,
    nome: data.damIdentification.damName || 'Barramento sem nome',
    municipio: data.damIdentification.municipality || 'Cuiabá',
    baciaHidrografica: data.damIdentification.hydrographicBasin || null,
    cursoDagua: data.damIdentification.waterCourse || null,
    coordenadas: {
      latitude: parseGmsToDecimal(data.damIdentification.coordinates.latitude, true),
      longitude: parseGmsToDecimal(data.damIdentification.coordinates.longitude, false),
      horarioCaptura: data.damIdentification.coordinates.captureTimestamp || null,
      acuraciaMetros: data.damIdentification.coordinates.accuracyMeters || null,
      altitudeEstimadaDispositivo: data.damIdentification.coordinates.altitudeMeters || null,
      editadoManualmente: !!data.damIdentification.coordinates.isManualEdit,
      datum: data.damIdentification.coordinates.datum || 'SIRGAS 2000'
    },
    cotaCoroamentoMetros: toNullableNumber(data.damIdentification.estimatedDimensions?.heightMeters),
    anoInicioObra: toNullableNumber(data.damIdentification.workStartYear),
    anoFinalObra: toNullableNumber(data.damIdentification.workEndYear),
    idadeBarragemAnos: null,
    tipoMaterial: data.damIdentification.damType || 'terra_homogenea',
    usoPrincipal: data.damIdentification.mainWaterUse || 'Irrigação',
    usosSecundarios: data.damIdentification.secondaryWaterUses || [],
    createdAt: data.createdAt || now,
    updatedAt: data.updatedAt || now
  };

  const medicoes = {
    id: data.id,
    vistoriaId: data.id,
    alturaBarragemMetros: toNullableNumber(data.damIdentification.estimatedDimensions?.heightMeters),
    distanciaCristaPeMetros: null,
    declividadeTaludeJusanteGraus: null,
    larguraCoroamentoMetros: toNullableNumber(data.damIdentification.estimatedDimensions?.crestWidthMeters),
    extensaoCoroamentoMetros: toNullableNumber(data.damIdentification.estimatedDimensions?.crestLengthMeters),
    bordaLivreMetros: toNullableNumber(data.damIdentification.estimatedDimensions?.freeboardMeters),
    cotaAtualNivelAgua: null,
    espelhoDaguaHectares: toNullableNumber(data.damIdentification.estimatedDimensions?.reservoirAreaHectares),
    volumeEstimadoM3: toNullableNumber(data.damIdentification.estimatedDimensions?.reservoirVolumeM3)
  };

  const itensAvaliados: Record<string, ItemAvaliadoEntity> = {};
  if (data.itensAvaliadosDetalhados) {
    Object.assign(itensAvaliados, data.itensAvaliadosDetalhados);
  } else if (data.componentsData) {
    Object.entries(data.componentsData).forEach(([compKey, val]) => {
      const compVal = val as ComponentInspectionData;
      if (compVal.selectedAnomalies && compVal.selectedAnomalies.length > 0) {
        compVal.selectedAnomalies.forEach((ano: string, idx: number) => {
          itensAvaliados[`${compKey}_${ano}_${idx}`] = {
            id: `${data.id}_${compKey}_${ano}_${idx}`,
            vistoriaId: data.id,
            componenteCodigo: compKey,
            itemCodigo: ano,
            itemRotuloOriginal: ano,
            resposta: 'sim',
            observacaoComplementar: compVal.notes || null
          };
        });
      }
    });
  }

  const isFutura = data.tipoPlanejamento === 'futura' || data.generalInfo?.tipoPlanejamento === 'futura';

  return {
    id: data.id,
    tipoPlanejamento: isFutura ? 'futura' : 'atual',
    itensObservacaoFutura: data.itensObservacaoFutura || [],
    numeroVistoria: isFutura
      ? null
      : data.generalInfo.numeroVistoria || data.generalInfo.recordNumber || `0001/${year}`,
    campanhaAno: year,
    campanhaNumero: `CAMP-${year}`,
    processoNumero: data.generalInfo.recordNumber || null,
    dataVistoria: data.generalInfo.inspectionDate || now.split('T')[0],
    horaInicio: data.generalInfo.startTime || null,
    horaTermino: data.generalInfo.endTime || null,
    condicoesClimaticas: data.generalInfo.weather || 'seco',
    statusVistoria: isFutura ? 'futura_planejada' : data.isDraft ? 'rascunho_campo' : 'concluida_campo',
    empreendedor,
    barragem,
    equipe: (data.generalInfo.inspectors || []).map((insp: any, idx: number) => ({
      id: insp.id || `${data.id}_insp_${idx}`,
      vistoriaId: data.id,
      nome: insp.name,
      cargo: insp.role || 'Fiscal Técnico',
      matricula: insp.registrationNumber || '',
      setor: insp.sector || 'CSB/SEMA-MT'
    })),
    acompanhantes: data.generalInfo.accompaniedBy?.hasAccompaniment
      ? [
          {
            id: data.generalInfo.accompaniedBy.id || `${data.id}_acomp`,
            vistoriaId: data.id,
            nome: data.generalInfo.accompaniedBy.name,
            cpf: data.generalInfo.accompaniedBy.document || null,
            vinculo: data.generalInfo.accompaniedBy.relationship || 'Representante',
            telefone: data.generalInfo.accompaniedBy.phone || null
          }
        ]
      : [],
    medicoes,
    itensAvaliados,
    componentesObservacoes: {},
    fotos: (data.photos || []).map((p: InspectionPhoto) => ({
      id: p.id,
      vistoriaId: data.id,
      componenteCodigo: p.componentId,
      componenteNome: p.componentName,
      dataUrl: p.dataUrl,
      localizacaoPonto: p.locationDescription || null,
      legenda: p.caption || null,
      timestampFoto: p.timestamp || now
    })),
    documentos: {
      auto_inspecao: {
        id: `${data.id}_doc_auto`,
        vistoriaId: data.id,
        tipoDocumento: 'auto_inspecao',
        versao: 1,
        conteudoTexto: data.drafts?.inspectionNotice || '',
        status: 'minuta_revisavel',
        geradoEm: now,
        atualizadoEm: now
      },
      relatorio_tecnico: {
        id: `${data.id}_doc_relat`,
        vistoriaId: data.id,
        tipoDocumento: 'relatorio_tecnico',
        versao: 1,
        conteudoTexto: data.drafts?.technicalReport || '',
        status: 'minuta_revisavel',
        geradoEm: now,
        atualizadoEm: now
      },
      notificacao: {
        id: `${data.id}_doc_notif`,
        vistoriaId: data.id,
        tipoDocumento: 'notificacao',
        versao: 1,
        conteudoTexto: data.drafts?.notificationLetter || '',
        status: 'minuta_revisavel',
        geradoEm: now,
        atualizadoEm: now
      }
    },
    conclusoes: {
      sinteseFatica: data.conclusions.generalFindings || null,
      medidasImediatasSeguranca: data.conclusions.immediateSafetyMeasures || null,
      recomendacoesEmpreendedor: data.conclusions.recommendationsToOwner || null,
      requerNotificacao: !!data.conclusions.requiresNotification,
      notificacaoPrazoDias: toNullableNumber(data.conclusions.notificationDetails?.prazoDias),
      notificacaoAssunto: data.conclusions.notificationDetails?.notificationSubject || null,
      notificacaoExigencias: data.conclusions.notificationDetails?.demandedActions || null
    },
    historicoAlteracoes: data.historicoAlteracoes || [],
    createdAt: data.createdAt || now,
    updatedAt: data.updatedAt || now
  };
}

export interface SyncVistoriaResponse {
  success: boolean;
  error?: string;
  code?: string;
  isRlsError?: boolean;
  table?: string;
  skippedReadOnlyEntities?: string[];
}

/**
 * Verifica se há sessão autenticada válida no Supabase (SEM fallback anônimo!)
 */
export async function ensureAuthenticatedSession(): Promise<{
  authenticated: boolean;
  email?: string;
  role?: string;
}> {
  if (!fiscalizaSupabase) return { authenticated: false };

  try {
    const {
      data: { session }
    } = await fiscalizaSupabase.auth.getSession();
    if (session?.user) {
      return {
        authenticated: true,
        email: session.user.email,
        role: session.user.user_metadata?.perfil || session.user.user_metadata?.role || 'analista'
      };
    }
  } catch (err) {
    console.warn('[Auth] Falha na verificação de sessão:', err);
  }

  return { authenticated: false };
}

export function getLocalUserProfile(
  email: string
): { role: string; name?: string; status?: string; cargo?: string } | null {
  const cleanEmail = email.trim().toLowerCase();

  try {
    const raw = localStorage.getItem(USERS_STORAGE_KEY);
    if (raw) {
      const list = JSON.parse(raw);
      if (Array.isArray(list)) {
        const found = list.find((u: any) => u.email?.toLowerCase() === cleanEmail);
        if (found) {
          return {
            role: found.role || 'analista',
            name: found.name,
            status: found.status || 'ativo',
            cargo: found.cargo
          };
        }
      }
    }
  } catch {
    // ignore malformed storage
  }

  return null;
}

/**
 * Grava hash criptográfico PBKDF2-SHA256 para contingência offline (nunca senha pura)
 */
export async function storeSecureLocalPasswordHash(email: string, password: string): Promise<void> {
  const cleanEmail = email.trim().toLowerCase();
  const pwdHash = await hashPasswordSecure(password);
  localStorage.setItem(AUTH_HASH_PREFIX + cleanEmail, pwdHash);
}

/**
 * Autenticação Estrita do Fiscal de Barragens (Supabase Auth remoto ou PBKDF2 offline)
 */
export async function signInInspector(
  email: string,
  password: string
): Promise<{ success: boolean; error?: string; email?: string; fullName?: string; role?: string }> {
  const cleanEmail = email.trim().toLowerCase();

  if (!cleanEmail || !cleanEmail.includes('@')) {
    return { success: false, error: 'Informe um e-mail institucional válido.' };
  }
  if (!password) {
    return { success: false, error: 'Informe sua senha de acesso.' };
  }

  purgeLegacyPlaintextCredentials();

  // 1. Consulta perfil remoto quando Supabase estiver configurado
  let remoteProfile: any = null;
  if (fiscalizaSupabase) {
    try {
      const { data, error } = await fiscalizaSupabase
        .from('perfis_usuarios')
        .select('*')
        .eq('email', cleanEmail)
        .maybeSingle();

      if (!error && data) {
        remoteProfile = data;
        try {
          const raw = localStorage.getItem(USERS_STORAGE_KEY);
          const list = raw ? JSON.parse(raw) : [];
          if (Array.isArray(list)) {
            const idx = list.findIndex((u: any) => u.email?.toLowerCase() === cleanEmail);
            if (idx !== -1) {
              list[idx] = {
                ...list[idx],
                status: data.status,
                role: data.perfil || list[idx].role,
                name: data.nome || list[idx].name,
                cargo: data.cargo || list[idx].cargo,
                matricula: data.matricula || list[idx].matricula,
                updatedAt: data.updated_at || new Date().toISOString()
              };
            } else {
              list.push({
                id: data.id,
                email: cleanEmail,
                name: data.nome || cleanEmail.split('@')[0],
                role: data.perfil || 'analista',
                status: data.status || 'ativo',
                cargo: data.cargo || 'Fiscal Técnico CSB',
                matricula: data.matricula || '',
                setor: data.setor || 'Coordenadoria de Segurança de Barragens - CSB/SEMA-MT',
                createdAt: data.created_at || new Date().toISOString(),
                updatedAt: data.updated_at || new Date().toISOString()
              });
            }
            localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(list));
          }
        } catch {
          // ignore cache update error
        }
      }
    } catch (e) {
      console.warn(`[Auth] Falha ao consultar perfil remoto para ${maskEmail(cleanEmail)}:`, e);
    }
  }

  const profile = getLocalUserProfile(cleanEmail);
  const effectiveStatus = remoteProfile?.status || profile?.status;

  if (!remoteProfile && !profile) {
    // Sem cadastro conhecido
    if (!fiscalizaSupabase) {
      return {
        success: false,
        error: 'Usuário não cadastrado neste dispositivo. Utilize "Novo Fiscal (Solicitar Acesso)" ou configure o Administrador inicial.'
      };
    }
  }

  const effectiveRole =
    remoteProfile?.perfil ||
    profile?.role ||
    (BOOTSTRAP_ADMIN_EMAIL && cleanEmail === BOOTSTRAP_ADMIN_EMAIL ? 'administrador' : 'analista');
  const effectiveName = remoteProfile?.nome || profile?.name || cleanEmail.split('@')[0];
  const effectiveCargo =
    remoteProfile?.cargo ||
    profile?.cargo ||
    (effectiveRole === 'administrador' ? 'Coordenador(a) de Segurança de Barragens' : 'Fiscal Técnico CSB');

  // 2. Validação de status
  if (effectiveStatus === 'inativo') {
    return {
      success: false,
      error: 'Usuário inativo. Seu acesso foi suspenso pela administração da CSB/SEMA-MT.'
    };
  }
  if (effectiveStatus === 'reprovado') {
    return {
      success: false,
      error: 'Solicitação de acesso indeferida pela administração da CSB/SEMA-MT.'
    };
  }
  if (effectiveStatus === 'pendente') {
    return {
      success: false,
      error: 'Solicitação de acesso em análise. Aguarde homologação de um Administrador da CSB/SEMA-MT.'
    };
  }

  const createLocalSession = async () => {
    try {
      await storeSecureLocalPasswordHash(cleanEmail, password);
    } catch {
      // ignore if subtle unavailable
    }

    const nowMs = Date.now();
    const localSession = {
      authenticated: true,
      email: cleanEmail,
      fullName: effectiveName,
      role: effectiveRole,
      cargo: effectiveCargo,
      loggedAt: new Date(nowMs).toISOString(),
      expiresAt: nowMs + SESSION_TTL_MS
    };
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(localSession));
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('csb:auth_state_changed', { detail: localSession }));
    }
    return { success: true, email: cleanEmail, fullName: effectiveName, role: effectiveRole };
  };

  // 3. Autenticação remota obrigatória quando Supabase está configurado e dispositivo está online
  if (fiscalizaSupabase) {
    try {
      const { data, error } = await fiscalizaSupabase.auth.signInWithPassword({
        email: cleanEmail,
        password
      });
      if (!error && data?.user) {
        return createLocalSession();
      }
      if (error && navigator.onLine) {
        // Permite fallback por hash apenas se conta local ainda aguarda provisionamento no Supabase Auth,
        // mas NUNCA aceita senha vazia ou hardcoded
        const storedHash = localStorage.getItem(AUTH_HASH_PREFIX + cleanEmail);
        if (storedHash && effectiveStatus === 'ativo' && (await verifyPasswordSecure(password, storedHash))) {
          return createLocalSession();
        }
        return {
          success: false,
          error: 'E-mail ou senha incorretos. Verifique suas credenciais institucionais.'
        };
      }
    } catch {
      // Em falha de rede (campo sem internet), segue para validação por hash offline
    }
  }

  // 4. Modo local / contingência offline com verificação PBKDF2-SHA256
  const storedHash = localStorage.getItem(AUTH_HASH_PREFIX + cleanEmail);
  if (!storedHash) {
    return {
      success: false,
      error:
        'Credencial local não encontrada para este dispositivo. Conecte-se à internet para o primeiro acesso ou solicite redefinição ao Administrador.'
    };
  }

  const isValidHash = await verifyPasswordSecure(password, storedHash);
  if (isValidHash) {
    return createLocalSession();
  }

  return {
    success: false,
    error: 'Credenciais inválidas. Verifique seu e-mail e senha.'
  };
}

/**
 * Solicitação prévia de acesso de novo Fiscal de Campo (exige senha forte definida pelo usuário)
 */
export async function signUpInspector(
  email: string,
  password: string,
  fullName?: string,
  cargo?: string,
  matricula?: string
): Promise<{ success: boolean; error?: string; message?: string }> {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail || !cleanEmail.includes('@')) {
    return { success: false, error: 'Informe um e-mail institucional válido.' };
  }

  const strength = validatePasswordStrength(password);
  if (!strength.valid) {
    return { success: false, error: strength.reason };
  }

  const finalName = fullName?.trim() || cleanEmail.split('@')[0];
  const finalCargo = cargo?.trim() || 'Fiscal Técnico CSB';
  const finalMatricula = matricula?.trim() || 'CSB-' + Math.floor(100 + Math.random() * 900);

  await storeSecureLocalPasswordHash(cleanEmail, password);

  const validId =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
          const r = (Math.random() * 16) | 0;
          return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
        });

  try {
    const raw = localStorage.getItem(USERS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    const list = Array.isArray(parsed) ? parsed : [];

    const exists = list.find((u: any) => u.email?.toLowerCase() === cleanEmail);
    if (exists) {
      if (exists.status === 'pendente') {
        return {
          success: false,
          error: 'Já existe uma solicitação de acesso em análise para este e-mail.'
        };
      }
      if (exists.status === 'ativo') {
        return {
          success: false,
          error: 'Este e-mail já possui cadastro ativo no sistema. Faça login diretamente.'
        };
      }
    }

    const now = new Date().toISOString();
    const newEntry = {
      id: validId,
      email: cleanEmail,
      name: finalName,
      role: 'analista',
      status: 'pendente',
      cargo: finalCargo,
      matricula: finalMatricula,
      setor: 'Coordenadoria de Segurança de Barragens - CSB/SEMA-MT',
      createdAt: now,
      updatedAt: now,
      requestedAt: now
    };

    const updatedList = [newEntry, ...list.filter((u: any) => u.email?.toLowerCase() !== cleanEmail)];
    localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(updatedList));

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('csb:users_updated'));
    }
  } catch (e) {
    console.warn('[Auth] Erro ao atualizar catálogo local de usuários:', e);
  }

  if (fiscalizaSupabase) {
    try {
      await fiscalizaSupabase.auth.signUp({
        email: cleanEmail,
        password,
        options: {
          data: {
            full_name: finalName,
            cargo: finalCargo,
            matricula: finalMatricula,
            perfil: 'analista'
          }
        }
      });

      const { error: insErr } = await fiscalizaSupabase.from('perfis_usuarios').insert({
        id: validId,
        email: cleanEmail,
        nome: finalName,
        perfil: 'analista',
        status: 'pendente',
        cargo: finalCargo,
        matricula: finalMatricula,
        setor: 'Coordenadoria de Segurança de Barragens - CSB/SEMA-MT'
      });

      if (insErr && (insErr.code === '23505' || insErr.message?.includes('duplicate'))) {
        await fiscalizaSupabase
          .from('perfis_usuarios')
          .update({
            nome: finalName,
            status: 'pendente',
            cargo: finalCargo,
            matricula: finalMatricula,
            updated_at: new Date().toISOString()
          })
          .eq('email', cleanEmail);
      }
    } catch (e) {
      console.warn('[Auth] Falha ao enviar solicitação para o Supabase:', e);
    }
  }

  return {
    success: true,
    message:
      'Solicitação de acesso enviada com sucesso! O cadastro foi encaminhado para análise de um Administrador da CSB/SEMA-MT.'
  };
}

/**
 * Atualiza a senha do Fiscal logado (exige política de força)
 */
export async function updateInspectorPassword(
  newPassword: string
): Promise<{ success: boolean; error?: string }> {
  const strength = validatePasswordStrength(newPassword);
  if (!strength.valid) {
    return { success: false, error: strength.reason };
  }

  let sessionEmail = '';
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      sessionEmail = parsed.email || '';
    }
  } catch {}

  if (sessionEmail) {
    await storeSecureLocalPasswordHash(sessionEmail, newPassword);
  }

  if (fiscalizaSupabase) {
    try {
      const {
        data: { session }
      } = await fiscalizaSupabase.auth.getSession();
      if (session?.user) {
        const { error } = await fiscalizaSupabase.auth.updateUser({
          password: newPassword
        });
        if (error) throw error;
      }
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Falha ao alterar senha no servidor.' };
    }
  }

  return { success: true };
}

/**
 * Encerra a sessão do Fiscal e limpa tokens locais
 */
export async function signOutInspector(): Promise<void> {
  try {
    if (fiscalizaSupabase) {
      await fiscalizaSupabase.auth.signOut();
    }
  } catch (e) {
    console.error('[Auth] Erro ao encerrar sessão:', e);
  } finally {
    localStorage.removeItem(SESSION_STORAGE_KEY);
    localStorage.removeItem(LEGACY_SESSION_KEY);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('csb:auth_state_changed', { detail: { authenticated: false } }));
    }
  }
}

/**
 * Retorna o estado atual da sessão do Fiscal (verificando expiração TTL)
 */
export async function getInspectorSession(): Promise<{
  authenticated: boolean;
  email?: string;
  fullName?: string;
  role?: string;
}> {
  let sessionEmail = '';
  let sessionFullName = '';
  let sessionRole = '';

  if (fiscalizaSupabase) {
    try {
      const {
        data: { session }
      } = await fiscalizaSupabase.auth.getSession();
      if (session?.user) {
        sessionEmail = session.user.email || '';
        sessionFullName = session.user.user_metadata?.full_name || session.user.user_metadata?.name || '';
        sessionRole = session.user.user_metadata?.perfil || session.user.user_metadata?.role || '';
      }
    } catch {
      // Fallback para sessão local válida dentro do TTL
    }
  }

  if (!sessionEmail) {
    try {
      const raw = localStorage.getItem(SESSION_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.authenticated && parsed.email) {
          if (parsed.expiresAt && Date.now() > parsed.expiresAt) {
            localStorage.removeItem(SESSION_STORAGE_KEY);
            return { authenticated: false };
          }
          sessionEmail = parsed.email;
          sessionFullName = parsed.fullName || '';
          sessionRole = parsed.role || '';
        }
      }
    } catch {}
  }

  if (!sessionEmail) {
    return { authenticated: false };
  }

  const profile = getLocalUserProfile(sessionEmail);
  if (profile && profile.status === 'inativo') {
    await signOutInspector();
    return { authenticated: false };
  }

  const isEnvBootstrapAdmin =
    BOOTSTRAP_ADMIN_EMAIL.length > 0 && sessionEmail.trim().toLowerCase() === BOOTSTRAP_ADMIN_EMAIL;

  const finalRole = isEnvBootstrapAdmin
    ? 'administrador'
    : profile?.role || sessionRole || 'analista';

  const finalName = profile?.name || sessionFullName || sessionEmail.split('@')[0];

  return {
    authenticated: true,
    email: sessionEmail,
    fullName: finalName,
    role: finalRole
  };
}

/**
 * Salva a Vistoria no Ecossistema:
 * 1) Roteia Empreendedor, Barragem e Responsável Técnico para a base do ADMINISTRA
 *    (somente inserindo/atualizando registros com sistema_origem = 'fiscaliza'; nunca
 *     sobrescreve registros de titularidade do Administra, Classifica ou Notifica).
 * 2) Grava os produtos gerados pelo Fiscaliza (vistorias, medições, itens, documentos)
 *    no banco de dados do FISCALIZA.
 * 3) Atualiza o catálogo unificado de produtos do ecossistema.
 */
export async function syncVistoriaToSupabase(
  input: VistoriaAggregate | InspectionData
): Promise<SyncVistoriaResponse> {
  const vistoria: VistoriaAggregate =
    'generalInfo' in input ? convertInspectionDataToAggregate(input as InspectionData) : (input as VistoriaAggregate);

  // Etapa 1: Sincronização de Entidades Mestres no Administra (respeitando propriedade cruzada)
  let skippedReadOnlyEntities: string[] = [];
  if ('generalInfo' in input) {
    const masterSync = await upsertMasterEntitiesFromInspection(input as InspectionData);
    skippedReadOnlyEntities = masterSync.skippedReadOnlyEntities;
    await registerFiscalizaProductsFromInspection(input as InspectionData);
  }

  if (!fiscalizaSupabase) {
    return {
      success: false,
      skippedReadOnlyEntities,
      error:
        'Chaves do Supabase ainda não configuradas para o ambiente de nuvem. Seus dados e produtos estão salvos com criptografia localmente e preparados no espelho de migração do Ecossistema.'
    };
  }

  const sessionCheck = await ensureAuthenticatedSession();
  if (!sessionCheck.authenticated) {
    return {
      success: false,
      isRlsError: true,
      code: 'AUTH_REQUIRED',
      error:
        'Autenticação obrigatória para transmissão ao banco de dados em nuvem (RLS ativo). Entre com sua conta institucional ou aguarde a configuração das chaves de produção.'
    };
  }

  const handleDbError = (err: any, tableName: string) => {
    if (!err) return;
    const code = err.code || err.status;
    const msg = String(err.message || '');
    if (code === '42501' || msg.includes('row-level security') || msg.includes('violates row-level')) {
      const e = new Error(
        `Permissão de Segurança (RLS 42501 na tabela "${tableName}"): O banco exige sessão autenticada de usuário ativo. Seus dados seguem protegidos localmente.`
      );
      (e as any).code = '42501';
      (e as any).isRlsError = true;
      (e as any).table = tableName;
      throw e;
    }
    throw err;
  };

  try {
    // Caso o Administra ainda compartilhe schema de transição no mesmo projeto Fiscaliza,
    // só grava em empreendedores/barragens locais SE o sistema_origem for 'fiscaliza'
    if (!isAdministraSupabaseConfigured()) {
      const empPerm = canFiscalizaEditMasterEntity(vistoria.empreendedor.sistemaOrigem);
      if (empPerm.allowed) {
        const { error: empError } = await fiscalizaSupabase.from('empreendedores').upsert({
          id: vistoria.empreendedor.id,
          sistema_origem: 'fiscaliza',
          administra_id: vistoria.empreendedor.administraId || vistoria.empreendedor.id,
          nome_razao_social: vistoria.empreendedor.nomeRazaoSocial,
          cpf_cnpj: toNullableString(vistoria.empreendedor.cpfCnpj),
          figura_juridica: vistoria.empreendedor.figuraJuridica,
          endereco: toNullableString(vistoria.empreendedor.endereco),
          telefone: toNullableString(vistoria.empreendedor.telefone),
          email: toNullableString(vistoria.empreendedor.email),
          documentos_pessoais: toNullableString(vistoria.empreendedor.documentosPessoais),
          car_numero: toNullableString(vistoria.empreendedor.carNumero),
          declaracao_uso: toNullableString(vistoria.empreendedor.declaracaoUsoOutorga),
          quantidade_barragens_propriedade: toNullableNumber(vistoria.empreendedor.quantidadeBarragens),
          updated_at: new Date().toISOString()
        });
        handleDbError(empError, 'empreendedores');
      }

      const barPerm = canFiscalizaEditMasterEntity(vistoria.barragem.sistemaOrigem);
      if (barPerm.allowed) {
        const { error: barError } = await fiscalizaSupabase.from('barragens').upsert({
          id: vistoria.barragem.id,
          sistema_origem: 'fiscaliza',
          administra_id: vistoria.barragem.administraId || vistoria.barragem.id,
          empreendedor_id: vistoria.empreendedor.id,
          nome: vistoria.barragem.nome,
          municipio: vistoria.barragem.municipio,
          bacia_hidrografica: toNullableString(vistoria.barragem.baciaHidrografica),
          curso_dagua: toNullableString(vistoria.barragem.cursoDagua),
          latitude_decimal: vistoria.barragem.coordenadas.latitude,
          longitude_decimal: vistoria.barragem.coordenadas.longitude,
          datum: vistoria.barragem.coordenadas.datum || 'SIRGAS 2000',
          cota_coroamento_metros: toNullableNumber(vistoria.barragem.cotaCoroamentoMetros),
          ano_inicio_obra: toNullableNumber(vistoria.barragem.anoInicioObra),
          ano_final_obra: toNullableNumber(vistoria.barragem.anoFinalObra),
          tipo_barragem_material: vistoria.barragem.tipoMaterial,
          uso_principal: vistoria.barragem.usoPrincipal,
          usos_secundarios: vistoria.barragem.usosSecundarios || [],
          updated_at: new Date().toISOString()
        });
        handleDbError(barError, 'barragens');
      }
    }

    // Produtos exclusivos da base do FISCALIZA: Vistorias, Medições, Itens e Documentos
    const { error: visError } = await fiscalizaSupabase.from('vistorias').upsert({
      id: vistoria.id,
      barragem_id: vistoria.barragem.id,
      sistema_origem: 'fiscaliza',
      tipo_planejamento: vistoria.tipoPlanejamento || 'atual',
      itens_observacao_futura: vistoria.itensObservacaoFutura || [],
      numero_vistoria: vistoria.numeroVistoria || null,
      campanha_ano: vistoria.campanhaAno,
      campanha_numero: vistoria.campanhaNumero,
      processo_sema: toNullableString(vistoria.processoNumero),
      data_vistoria: vistoria.dataVistoria,
      hora_inicio: toNullableString(vistoria.horaInicio),
      hora_termino: toNullableString(vistoria.horaTermino),
      condicoes_climaticas: vistoria.condicoesClimaticas,
      cota_atual_nivel_agua: toNullableNumber(vistoria.medicoes.cotaAtualNivelAgua),
      status_vistoria: vistoria.statusVistoria,
      outros_problemas_descricao: toNullableString(vistoria.conclusoes.outrosProblemasDescricao),
      conclusoes_sintese_fatica: toNullableString(vistoria.conclusoes.sinteseFatica),
      medidas_imediatas_seguranca: toNullableString(vistoria.conclusoes.medidasImediatasSeguranca),
      recomendacoes_empreendedor: toNullableString(vistoria.conclusoes.recomendacoesEmpreendedor),
      requer_notificacao: vistoria.conclusoes.requerNotificacao,
      notificacao_prazo_dias: toNullableNumber(vistoria.conclusoes.notificacaoPrazoDias),
      notificacao_assunto: toNullableString(vistoria.conclusoes.notificacaoAssunto),
      notificacao_exigencias: toNullableString(vistoria.conclusoes.notificacaoExigencias),
      updated_at: new Date().toISOString()
    });
    handleDbError(visError, 'vistorias');

    const { error: medError } = await fiscalizaSupabase.from('vistoria_medicoes').upsert({
      id: vistoria.medicoes.id,
      vistoria_id: vistoria.id,
      altura_barragem_metros: toNullableNumber(vistoria.medicoes.alturaBarragemMetros),
      distancia_crista_pe_metros: toNullableNumber(vistoria.medicoes.distanciaCristaPeMetros),
      declividade_talude_jusante_graus: toNullableNumber(vistoria.medicoes.declividadeTaludeJusanteGraus),
      largura_coroamento_metros: toNullableNumber(vistoria.medicoes.larguraCoroamentoMetros),
      extensao_coroamento_metros: toNullableNumber(vistoria.medicoes.extensaoCoroamentoMetros),
      borda_livre_medida_metros: toNullableNumber(vistoria.medicoes.bordaLivreMetros),
      espelho_dagua_hectares: toNullableNumber(vistoria.medicoes.espelhoDaguaHectares),
      volume_estimado_m3: toNullableNumber(vistoria.medicoes.volumeEstimadoM3),
      updated_at: new Date().toISOString()
    });
    handleDbError(medError, 'vistoria_medicoes');

    const itens = Object.values(vistoria.itensAvaliados || {}) as ItemAvaliadoEntity[];
    const itensArray = itens.map(item => ({
      id: item.id,
      vistoria_id: vistoria.id,
      componente_codigo: item.componenteCodigo,
      item_codigo: item.itemCodigo,
      item_rotulo_original: item.itemRotuloOriginal,
      resposta: item.resposta,
      localizacao_detalhe: item.localizacaoDetalhe || null,
      estado_conservacao: item.estadoConservacao || null,
      observacao_complementar: item.observacaoComplementar || null,
      updated_at: new Date().toISOString()
    }));

    if (itensArray.length > 0) {
      const { error: itensError } = await fiscalizaSupabase.from('vistoria_itens_avaliados').upsert(itensArray);
      handleDbError(itensError, 'vistoria_itens_avaliados');
    }

    const docs = Object.values(vistoria.documentos || {}) as DocumentoGeradoEntity[];
    const docsArray = docs.map(doc => ({
      id: doc.id,
      vistoria_id: vistoria.id,
      tipo_documento: doc.tipoDocumento,
      versao: doc.versao,
      conteudo_texto: doc.conteudoTexto,
      status_documento: doc.status,
      atualizado_em: new Date().toISOString()
    }));

    if (docsArray.length > 0) {
      const { error: docError } = await fiscalizaSupabase.from('vistoria_documentos').upsert(docsArray);
      handleDbError(docError, 'vistoria_documentos');
    }

    return { success: true, skippedReadOnlyEntities };
  } catch (err: any) {
    console.error('[Sync] Erro ao sincronizar com banco de dados:', err?.message || err);
    const code = err?.code || '';
    const isRls =
      code === '42501' ||
      err?.isRlsError ||
      String(err?.message || '').includes('row-level security') ||
      String(err?.message || '').includes('violates row-level');

    return {
      success: false,
      error: err?.message || 'Falha na comunicação segura com o banco de dados.',
      code: String(code),
      isRlsError: !!isRls,
      table: err?.table || 'vistorias',
      skippedReadOnlyEntities
    };
  }
}

export async function uploadFotoToSupabaseStorage(
  vistoriaId: string,
  fotoId: string,
  imageBlob: Blob
): Promise<{ success: boolean; storagePath?: string; error?: string }> {
  if (!fiscalizaSupabase) {
    return {
      success: false,
      error: 'Armazenamento em nuvem aguardando configuração de chaves. Foto retida localmente.'
    };
  }

  try {
    const filePath = `vistorias/${vistoriaId}/${fotoId}.jpg`;
    const { data, error } = await fiscalizaSupabase.storage
      .from('fotos_vistorias_csb')
      .upload(filePath, imageBlob, {
        contentType: 'image/jpeg',
        upsert: true
      });

    if (error) throw error;
    return { success: true, storagePath: data.path };
  } catch (err: any) {
    return { success: false, error: err.message || 'Falha ao salvar foto no Storage seguro.' };
  }
}

export async function getSupabaseSecurityDiagnostics(): Promise<{
  configured: boolean;
  authenticated: boolean;
  userEmail?: string;
  role?: string;
  rlsEnforced: boolean;
  privateStorageEnforced: boolean;
  ecosystemNodes: EcosystemNodeStatus[];
  warnings: string[];
}> {
  const ecosystemNodes = getEcosystemStatus();
  const warnings: string[] = [];

  ecosystemNodes.forEach(node => {
    if (node.securityError) {
      warnings.push(`ALERTA CRÍTICO (${node.nomeExibicao}): ${node.securityError}`);
    }
  });

  if (!fiscalizaSupabase) {
    return {
      configured: false,
      authenticated: false,
      rlsEnforced: true,
      privateStorageEnforced: true,
      ecosystemNodes,
      warnings: [
        ...warnings,
        'Chaves do Supabase ainda não inseridas no arquivo .env (migração preparada).',
        'Autenticação reforçada com PBKDF2-SHA256 (120.000 iterações) + zero senhas padrão no código.',
        'Base local operando em espelho seguro pronto para conexão com Administra, Fiscaliza, Classifica e Notifica.'
      ]
    };
  }

  let userEmail: string | undefined;
  let role: string | undefined;
  let authenticated = false;

  try {
    const {
      data: { session }
    } = await fiscalizaSupabase.auth.getSession();
    if (session?.user) {
      authenticated = true;
      userEmail = session.user.email;
      role = session.user.user_metadata?.perfil || session.user.role || 'authenticated';
    } else {
      warnings.push('RLS ativo exigindo sessão autenticada (acesso anônimo desabilitado).');
    }
  } catch (e: any) {
    warnings.push(`Status da checagem de sessão: ${e.message}`);
  }

  return {
    configured: true,
    authenticated,
    userEmail,
    role,
    rlsEnforced: true,
    privateStorageEnforced: true,
    ecosystemNodes,
    warnings
  };
}

export async function fetchLatestNumeroVistoriaFromSupabase(customYear?: number): Promise<string | null> {
  if (!fiscalizaSupabase) return null;
  const year = customYear || new Date().getFullYear();

  try {
    const { data, error } = await fiscalizaSupabase
      .from('vistorias')
      .select('numero_vistoria')
      .or(`campanha_ano.eq.${year},numero_vistoria.ilike.%/${year}`)
      .limit(100);

    if (error || !data || data.length === 0) return null;

    let maxNum = 0;
    data.forEach(row => {
      if (row.numero_vistoria) {
        const match = row.numero_vistoria.trim().match(/^(\d+)\s*\/\s*(\d{4})/);
        if (match && parseInt(match[2], 10) === year) {
          const num = parseInt(match[1], 10);
          if (!isNaN(num) && num > maxNum) maxNum = num;
        }
      }
    });

    if (maxNum > 0) {
      return `${String(maxNum + 1).padStart(4, '0')}/${year}`;
    }
  } catch (e) {
    console.warn('[Vistorias] Erro ao consultar próximo número no Supabase:', e);
  }
  return null;
}
