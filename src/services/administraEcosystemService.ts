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
  AdministraCadastroStatus,
  AdministraEntityCadastroState,
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
import type { SupabaseClient } from '@supabase/supabase-js';
import {
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

function isLegacySampleEntity(obj: unknown): boolean {
  try {
    const s = JSON.stringify(obj);
    return (
      s.includes('Fazenda Alvorada') ||
      s.includes('(Exemplo)') ||
      s.includes('fazendaalvorada') ||
      s.includes('00.000.000/0001-99') ||
      s.includes('00.000.000/0001-00') ||
      s.includes('12.345.678/0001-') ||
      s.includes('Córrego das Araras') ||
      s.includes('PROC-2026/04812-SEMA') ||
      s.includes('Empreendedor Exemplo') ||
      s.includes('Barragem Exemplo') ||
      s.includes('Empreendedor sem nome') ||
      s.includes('Empreendedor não informado') ||
      s.includes('Empreendedor vinculado') ||
      s.includes('Barramento sem nome')
    );
  } catch {
    return false;
  }
}

export function loadLocalAdministraCatalog(): AdministraMasterCatalog {
  try {
    const raw = localStorage.getItem(ADMINISTRA_CACHE_KEY);
    if (raw) {
      const parsed = sanitizeDeepObject(JSON.parse(raw)) as Partial<AdministraMasterCatalog>;
      return {
        empreendedores: Array.isArray(parsed.empreendedores)
          ? parsed.empreendedores.filter(e => !isLegacySampleEntity(e))
          : [],
        barragens: Array.isArray(parsed.barragens)
          ? parsed.barragens.filter(b => !isLegacySampleEntity(b))
          : [],
        responsaveisTecnicos: Array.isArray(parsed.responsaveisTecnicos)
          ? parsed.responsaveisTecnicos.filter(r => !isLegacySampleEntity(r))
          : [],
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

function saveLocalAdministraCatalog(catalog: AdministraMasterCatalog, silent: boolean = false): void {
  try {
    const sanitized = sanitizeDeepObject({
      ...catalog,
      updatedAt: new Date().toISOString()
    });
    localStorage.setItem(ADMINISTRA_CACHE_KEY, JSON.stringify(sanitized));
    if (!silent) {
      emitEcosystemUpdate();
    }
  } catch (err) {
    console.warn('[Ecossistema] Falha ao salvar cache local do Administra:', err);
  }
}

function pickFirstString(row: Record<string, any>, keys: string[]): string | null {
  for (const k of keys) {
    const v = row?.[k];
    if (v !== undefined && v !== null && String(v).trim() !== '') {
      return String(v).trim();
    }
  }
  return null;
}

function pickFirstNumber(row: Record<string, any>, keys: string[]): number | null {
  for (const k of keys) {
    const v = row?.[k];
    if (v !== undefined && v !== null && v !== '' && !isNaN(Number(v))) {
      return Number(v);
    }
  }
  return null;
}

function formatCpfDigits(d: string): string {
  return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
}

function formatCnpjDigits(d: string): string {
  return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
}

function mapRawEmpreendedor(row: Record<string, any>, defaultOrigin: SistemaOrigem = 'administra'): EmpreendedorEntity | null {
  const id = pickFirstString(row, ['id', 'empreendedor_id', 'uid', 'uuid']);
  const nome = pickFirstString(row, [
    'nome_razao_social',
    'nome',
    'razao_social',
    'nome_empreendedor',
    'empreendedor',
    'proprietario',
    'nome_proprietario',
    'nome_completo',
    'nomeRazaoSocial'
  ]);
  const doc = pickFirstString(row, [
    'cpf_cnpj',
    'cpf',
    'cnpj',
    'cpfCnpj',
    'documento',
    'nr_cpf_cnpj',
    'cpf_cnpj_empreendedor'
  ]);
  const car = pickFirstString(row, [
    'car_numero',
    'car',
    'numero_car',
    'codigo_car',
    'cod_imovel',
    'recibo_car',
    'registro_car',
    'car_mt',
    'carNumero'
  ]);
  if (!id && !nome && !doc && !car) return null;
  const resolvedId = id || `${defaultOrigin}_emp_${normalizeDocumentDigits(doc) || normalizeNameForMatch(nome) || generateUUID()}`;
  const now = new Date().toISOString();
  return {
    id: resolvedId,
    administraId: pickFirstString(row, ['administra_id']) || resolvedId,
    sistemaOrigem: (pickFirstString(row, ['sistema_origem']) || defaultOrigin) as SistemaOrigem,
    criadoPorEmail: pickFirstString(row, ['criado_por_email', 'email_analista', 'usuario_email', 'created_by']),
    nomeRazaoSocial: nome || '',
    cpfCnpj: doc,
    figuraJuridica: (pickFirstString(row, ['figura_juridica', 'tipo_pessoa', 'natureza_juridica']) ||
      '') as EmpreendedorEntity['figuraJuridica'],
    processoNumero: pickFirstString(row, ['processo_numero', 'processo_sema', 'numero_processo']),
    endereco: pickFirstString(row, ['endereco', 'logradouro', 'endereco_correspondencia', 'localizacao']) || '',
    municipio: pickFirstString(row, ['municipio', 'cidade']),
    uf: pickFirstString(row, ['uf', 'estado']),
    telefone: pickFirstString(row, ['telefone', 'celular', 'whatsapp', 'fone']),
    email: pickFirstString(row, ['email', 'e_mail']),
    documentosPessoais: pickFirstString(row, ['documentos_pessoais']),
    carNumero: car,
    declaracaoUsoOutorga: pickFirstString(row, ['declaracao_uso', 'outorga', 'declaracao_uso_outorga']),
    quantidadeBarragens: pickFirstNumber(row, ['quantidade_barragens_propriedade', 'quantidade_barragens', 'qtd_barragens']),
    comentarios: pickFirstString(row, ['comentarios', 'observacoes']),
    sincronizadoAdministraEm: row.updated_at || now,
    createdAt: row.created_at || now,
    updatedAt: row.updated_at || now
  };
}

function mapRawBarragem(row: Record<string, any>, defaultOrigin: SistemaOrigem = 'administra'): BarragemEntity | null {
  const id = pickFirstString(row, ['id', 'barragem_id', 'uid', 'uuid']);
  const nome = pickFirstString(row, ['nome', 'nome_barragem', 'barragem_nome', 'titulo', 'nome_barramento']);
  if (!id && !nome) return null;
  const resolvedId = id || `${defaultOrigin}_bar_${normalizeNameForMatch(nome) || generateUUID()}`;
  const now = new Date().toISOString();
  return {
    id: resolvedId,
    administraId: pickFirstString(row, ['administra_id']) || resolvedId,
    sistemaOrigem: (pickFirstString(row, ['sistema_origem']) || defaultOrigin) as SistemaOrigem,
    criadoPorEmail: pickFirstString(row, ['criado_por_email', 'email_analista', 'usuario_email']),
    empreendedorId: pickFirstString(row, ['empreendedor_id', 'id_empreendedor', 'proprietario_id', 'owner_id']) || '',
    nome: nome || '',
    municipio: pickFirstString(row, ['municipio', 'cidade']) || '',
    baciaHidrografica: pickFirstString(row, ['bacia_hidrografica', 'bacia']),
    cursoDagua: pickFirstString(row, ['curso_dagua', 'rio', 'corrego', 'curso_agua']),
    coordenadas: {
      latitude: pickFirstNumber(row, ['latitude_decimal', 'latitude', 'lat']),
      longitude: pickFirstNumber(row, ['longitude_decimal', 'longitude', 'lng', 'lon']),
      horarioCaptura: row.updated_at || null,
      acuraciaMetros: null,
      altitudeEstimadaDispositivo: null,
      editadoManualmente: true,
      datum: pickFirstString(row, ['datum']) || 'SIRGAS 2000'
    },
    cotaCoroamentoMetros: pickFirstNumber(row, ['cota_coroamento_metros']),
    anoInicioObra: pickFirstNumber(row, ['ano_inicio_obra']),
    anoFinalObra: pickFirstNumber(row, ['ano_final_obra']),
    idadeBarragemAnos: null,
    tipoMaterial: (pickFirstString(row, ['tipo_barragem_material', 'tipo_material', 'material']) ||
      '') as BarragemEntity['tipoMaterial'],
    usoPrincipal: pickFirstString(row, ['uso_principal', 'finalidade', 'uso']) || '',
    usosSecundarios: Array.isArray(row.usos_secundarios) ? row.usos_secundarios : [],
    sincronizadoAdministraEm: row.updated_at || now,
    createdAt: row.created_at || now,
    updatedAt: row.updated_at || now
  };
}

function mapRawRt(row: Record<string, any>, defaultOrigin: SistemaOrigem = 'administra'): ResponsavelTecnicoEntity | null {
  const id = pickFirstString(row, ['id', 'rt_id', 'uid']);
  const nome = pickFirstString(row, ['nome', 'nome_rt', 'responsavel_tecnico']);
  if (!id && !nome) return null;
  const resolvedId = id || `${defaultOrigin}_rt_${normalizeNameForMatch(nome) || generateUUID()}`;
  const now = new Date().toISOString();
  return {
    id: resolvedId,
    administraId: pickFirstString(row, ['administra_id']) || resolvedId,
    sistemaOrigem: (pickFirstString(row, ['sistema_origem']) || defaultOrigin) as SistemaOrigem,
    criadoPorEmail: pickFirstString(row, ['criado_por_email', 'email_analista']),
    empreendedorId: pickFirstString(row, ['empreendedor_id', 'id_empreendedor']),
    barragemId: pickFirstString(row, ['barragem_id', 'id_barragem']),
    nome: nome || '',
    cpf: pickFirstString(row, ['cpf', 'cpf_rt', 'documento']),
    registroProfissional: pickFirstString(row, ['registro_profissional', 'crea', 'registro']),
    ufRegistro: pickFirstString(row, ['uf_registro']),
    artNumero: pickFirstString(row, ['art_numero', 'art']),
    especialidade: pickFirstString(row, ['especialidade', 'formacao']),
    telefone: pickFirstString(row, ['telefone', 'celular', 'fone']),
    email: pickFirstString(row, ['email']),
    sincronizadoAdministraEm: row.updated_at || now,
    createdAt: row.created_at || now,
    updatedAt: row.updated_at || now
  };
}

const MISSING_TABLE_CACHE = new Set<string>();

function isMissingRemoteTableError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const code = String((err as any).code || '').trim().toUpperCase();
  const status = Number((err as any).status || 0);
  const msg = String((err as any).message || '').toLowerCase();
  return (
    status === 404 ||
    code === 'PGRST205' ||
    code === '42P01' ||
    msg.includes('does not exist') ||
    msg.includes('could not find the table')
  );
}

function mapApiV2BarragemDto(dto: Record<string, any>): BarragemEntity | null {
  const id = typeof dto.id === 'string' ? dto.id.trim() : '';
  const nome = typeof dto.nome === 'string' ? dto.nome.trim() : '';
  if (!id || !nome) return null;

  const now = new Date().toISOString();
  const coordObj =
    dto.coordenadas && typeof dto.coordenadas === 'object' ? dto.coordenadas : null;

  const latDec =
    toNullableNum(coordObj?.latitude) ??
    toNullableNum(dto.latitudeDecimal) ??
    toNullableNum(dto.latitude);
  const lngDec =
    toNullableNum(coordObj?.longitude) ??
    toNullableNum(dto.longitudeDecimal) ??
    toNullableNum(dto.longitude);

  return {
    id,
    administraId:
      typeof dto.administraId === 'string' && dto.administraId.trim()
        ? dto.administraId.trim()
        : id,
    sistemaOrigem: 'administra',
    criadoPorEmail: null,
    empreendedorId:
      typeof dto.empreendedorId === 'string' ? dto.empreendedorId.trim() : '',
    nome,
    municipio: typeof dto.municipio === 'string' ? dto.municipio.trim() : '',
    baciaHidrografica:
      typeof dto.baciaHidrografica === 'string' && dto.baciaHidrografica.trim()
        ? dto.baciaHidrografica.trim()
        : null,
    cursoDagua:
      typeof dto.cursoDagua === 'string' && dto.cursoDagua.trim()
        ? dto.cursoDagua.trim()
        : null,
    coordenadas: {
      latitude: latDec,
      longitude: lngDec,
      horarioCaptura: typeof dto.updatedAt === 'string' ? dto.updatedAt : null,
      acuraciaMetros: null,
      altitudeEstimadaDispositivo: null,
      editadoManualmente: true,
      datum:
        (typeof coordObj?.datum === 'string' && coordObj.datum.trim()) ||
        (typeof dto.datum === 'string' && dto.datum.trim()) ||
        'SIRGAS 2000'
    },
    latitudeGms:
      typeof dto.latitudeGms === 'string' && dto.latitudeGms.trim()
        ? dto.latitudeGms.trim()
        : null,
    longitudeGms:
      typeof dto.longitudeGms === 'string' && dto.longitudeGms.trim()
        ? dto.longitudeGms.trim()
        : null,
    cotaCoroamentoMetros: toNullableNum(dto.cotaCoroamentoMetros),
    anoInicioObra: toNullableInt(dto.anoInicioObra),
    anoFinalObra: toNullableInt(dto.anoFinalObra),
    idadeBarragemAnos: null,
    tipoMaterial: (typeof dto.tipoMaterial === 'string'
      ? dto.tipoMaterial.trim()
      : '') as BarragemEntity['tipoMaterial'],
    usoPrincipal: typeof dto.usoPrincipal === 'string' ? dto.usoPrincipal.trim() : '',
    usosSecundarios: Array.isArray(dto.usosSecundarios)
      ? dto.usosSecundarios.map(s => String(s).trim()).filter(Boolean)
      : [],
    sincronizadoAdministraEm:
      (typeof dto.updatedAt === 'string' && dto.updatedAt) || now,
    createdAt: (typeof dto.createdAt === 'string' && dto.createdAt) || now,
    updatedAt: (typeof dto.updatedAt === 'string' && dto.updatedAt) || now
  };
}

async function fetchAdministraBarragensViaBackend(): Promise<BarragemEntity[]> {
  const online = typeof navigator !== 'undefined' ? navigator.onLine : true;
  if (!online || !fiscalizaSupabase || typeof fetch !== 'function' || typeof window === 'undefined') {
    return [];
  }

  try {
    const {
      data: { session }
    } = await fiscalizaSupabase.auth.getSession();
    const token = session?.access_token;
    if (!token) {
      return [];
    }

    const res = await fetch('/api/administra/barragens', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json'
      }
    });
    if (!res.ok) {
      return [];
    }

    const payload = await res.json().catch(() => null);
    if (!payload || !Array.isArray(payload.items)) {
      return [];
    }

    const mapped: BarragemEntity[] = [];
    for (const rawItem of payload.items) {
      if (rawItem && typeof rawItem === 'object') {
        const entity = mapApiV2BarragemDto(rawItem as Record<string, any>);
        if (entity) {
          mapped.push(entity);
        }
      }
    }
    return mapped;
  } catch {
    return [];
  }
}

async function queryTableWithOptionalFilter(
  client: SupabaseClient,
  nodeKey: string,
  tableCandidates: string[],
  searchTerms: string[]
): Promise<{ rows: Record<string, any>[]; tableName: string | null; authBlocked: boolean }> {
  let authBlocked = false;

  for (const table of tableCandidates) {
    const cacheKey = `${nodeKey}:${table}`;
    if (MISSING_TABLE_CACHE.has(cacheKey)) continue;

    try {
      const { data: baseRows, error: baseError } = await client.from(table).select('*').limit(1000);
      if (baseError) {
        const msg = String(baseError.message || '').toLowerCase();
        if (
          baseError.code === 'PGRST205' ||
          baseError.code === '42P01' ||
          msg.includes('does not exist') ||
          msg.includes('could not find the table')
        ) {
          MISSING_TABLE_CACHE.add(cacheKey);
          continue;
        }
        if (baseError.code === '42501' || baseError.code === 'PGRST301') {
          authBlocked = true;
          continue;
        }
        continue;
      }

      const rows = Array.isArray(baseRows) ? [...baseRows] : [];
      if (searchTerms.length > 0 && rows.length > 0) {
        const sample = rows[0];
        const sampleKeys = Object.keys(sample);
        const textCols = sampleKeys.filter(
          k =>
            (typeof sample[k] === 'string' || sample[k] === null) &&
            /nome|razao|proprietar|empreend|cpf|cnpj|doc|car|imovel|recibo|municip|cidade|barragem|titulo/i.test(k)
        );
        const numericCols = sampleKeys.filter(
          k =>
            typeof sample[k] === 'number' &&
            /cpf|cnpj|doc|car|codigo|imovel/i.test(k)
        );

        const orParts: string[] = [];
        for (const col of textCols.slice(0, 8)) {
          for (const term of searchTerms.slice(0, 4)) {
            const cleanTerm = term.replace(/[,().*%\\'"]/g, '').trim();
            if (cleanTerm.length >= 2) {
              orParts.push(`${col}.ilike.%${cleanTerm}%`);
            }
          }
        }
        const digitsOnlyTerms = searchTerms.filter(t => /^\d{6,14}$/.test(t));
        for (const col of numericCols.slice(0, 3)) {
          for (const dTerm of digitsOnlyTerms.slice(0, 2)) {
            orParts.push(`${col}.eq.${dTerm}`);
          }
        }

        if (orParts.length > 0) {
          const { data: filteredRows } = await client
            .from(table)
            .select('*')
            .or(orParts.join(','))
            .limit(100);
          if (Array.isArray(filteredRows) && filteredRows.length > 0) {
            const byId = new Map<string, Record<string, any>>();
            filteredRows.forEach((r, idx) => byId.set(String(r.id || `f_${idx}`), r));
            rows.forEach((r, idx) => {
              const k = String(r.id || `b_${idx}`);
              if (!byId.has(k)) byId.set(k, r);
            });
            return { rows: Array.from(byId.values()), tableName: table, authBlocked };
          }
        }
      } else if (searchTerms.length > 0 && rows.length === 0) {
        const fallbackCols = ['nome_razao_social', 'nome', 'razao_social', 'cpf_cnpj', 'cpf', 'cnpj', 'car_numero', 'car', 'cod_imovel'];
        for (const col of fallbackCols) {
          for (const term of searchTerms.slice(0, 4)) {
            const cleanTerm = term.replace(/[,().*%\\'"]/g, '').trim();
            if (cleanTerm.length < 2) continue;
            const { data: singleTry, error: singleErr } = await client
              .from(table)
              .select('*')
              .ilike(col, `%${cleanTerm}%`)
              .limit(50);
            if (!singleErr && Array.isArray(singleTry) && singleTry.length > 0) {
              return { rows: singleTry, tableName: table, authBlocked };
            }
          }
        }
      }

      return { rows, tableName: table, authBlocked };
    } catch {
      continue;
    }
  }

  return { rows: [], tableName: null, authBlocked };
}

function mergeNonEmptyStr(incoming: string | null | undefined, existing: string | null | undefined): string | null {
  const clean = incoming !== undefined && incoming !== null ? String(incoming).trim() : '';
  if (clean !== '') return clean;
  return existing ?? null;
}

function mergeEmpreendedorPreservingExisting(
  existing: EmpreendedorEntity | undefined,
  incoming: EmpreendedorEntity
): EmpreendedorEntity {
  if (!existing) return incoming;
  return {
    ...existing,
    ...incoming,
    administraId: incoming.administraId || existing.administraId,
    criadoPorEmail: incoming.criadoPorEmail || existing.criadoPorEmail || null,
    nomeRazaoSocial: (incoming.nomeRazaoSocial || '').trim() || existing.nomeRazaoSocial,
    cpfCnpj: mergeNonEmptyStr(incoming.cpfCnpj, existing.cpfCnpj),
    figuraJuridica: incoming.figuraJuridica || existing.figuraJuridica,
    processoNumero: mergeNonEmptyStr(incoming.processoNumero, existing.processoNumero),
    endereco: (incoming.endereco || '').trim() || existing.endereco,
    municipio: mergeNonEmptyStr(incoming.municipio, existing.municipio),
    uf: mergeNonEmptyStr(incoming.uf, existing.uf),
    telefone: mergeNonEmptyStr(incoming.telefone, existing.telefone),
    email: mergeNonEmptyStr(incoming.email, existing.email),
    documentosPessoais: mergeNonEmptyStr(incoming.documentosPessoais, existing.documentosPessoais),
    carNumero: mergeNonEmptyStr(incoming.carNumero, existing.carNumero),
    declaracaoUsoOutorga: mergeNonEmptyStr(incoming.declaracaoUsoOutorga, existing.declaracaoUsoOutorga),
    quantidadeBarragens: incoming.quantidadeBarragens ?? existing.quantidadeBarragens ?? null,
    comentarios: mergeNonEmptyStr(incoming.comentarios, existing.comentarios)
  };
}

function mergeBarragemPreservingExisting(
  existing: BarragemEntity | undefined,
  incoming: BarragemEntity
): BarragemEntity {
  if (!existing) return incoming;
  return {
    ...existing,
    ...incoming,
    administraId: incoming.administraId || existing.administraId,
    criadoPorEmail: incoming.criadoPorEmail || existing.criadoPorEmail || null,
    empreendedorId: (incoming.empreendedorId || '').trim() || existing.empreendedorId,
    nome: (incoming.nome || '').trim() || existing.nome,
    municipio: (incoming.municipio || '').trim() || existing.municipio,
    baciaHidrografica: mergeNonEmptyStr(incoming.baciaHidrografica, existing.baciaHidrografica),
    cursoDagua: mergeNonEmptyStr(incoming.cursoDagua, existing.cursoDagua),
    coordenadas: {
      latitude: incoming.coordenadas?.latitude ?? existing.coordenadas?.latitude ?? null,
      longitude: incoming.coordenadas?.longitude ?? existing.coordenadas?.longitude ?? null,
      horarioCaptura: incoming.coordenadas?.horarioCaptura || existing.coordenadas?.horarioCaptura || null,
      acuraciaMetros: incoming.coordenadas?.acuraciaMetros ?? existing.coordenadas?.acuraciaMetros ?? null,
      altitudeEstimadaDispositivo:
        incoming.coordenadas?.altitudeEstimadaDispositivo ??
        existing.coordenadas?.altitudeEstimadaDispositivo ??
        null,
      editadoManualmente: incoming.coordenadas?.editadoManualmente ?? existing.coordenadas?.editadoManualmente,
      datum: incoming.coordenadas?.datum || existing.coordenadas?.datum || 'SIRGAS 2000'
    },
    latitudeGms: mergeNonEmptyStr(incoming.latitudeGms, existing.latitudeGms),
    longitudeGms: mergeNonEmptyStr(incoming.longitudeGms, existing.longitudeGms),
    cotaCoroamentoMetros: incoming.cotaCoroamentoMetros ?? existing.cotaCoroamentoMetros ?? null,
    anoInicioObra: incoming.anoInicioObra ?? existing.anoInicioObra ?? null,
    anoFinalObra: incoming.anoFinalObra ?? existing.anoFinalObra ?? null,
    idadeBarragemAnos: incoming.idadeBarragemAnos ?? existing.idadeBarragemAnos ?? null,
    tipoMaterial: incoming.tipoMaterial || existing.tipoMaterial,
    usoPrincipal: (incoming.usoPrincipal || '').trim() || existing.usoPrincipal,
    usosSecundarios:
      incoming.usosSecundarios && incoming.usosSecundarios.length > 0
        ? incoming.usosSecundarios
        : existing.usosSecundarios || []
  };
}

function mergeRtPreservingExisting(
  existing: ResponsavelTecnicoEntity | undefined,
  incoming: ResponsavelTecnicoEntity
): ResponsavelTecnicoEntity {
  if (!existing) return incoming;
  return {
    ...existing,
    ...incoming,
    administraId: incoming.administraId || existing.administraId,
    criadoPorEmail: incoming.criadoPorEmail || existing.criadoPorEmail || null,
    empreendedorId: mergeNonEmptyStr(incoming.empreendedorId, existing.empreendedorId),
    barragemId: mergeNonEmptyStr(incoming.barragemId, existing.barragemId),
    nome: (incoming.nome || '').trim() || existing.nome,
    cpf: mergeNonEmptyStr(incoming.cpf, existing.cpf),
    registroProfissional: mergeNonEmptyStr(incoming.registroProfissional, existing.registroProfissional),
    ufRegistro: mergeNonEmptyStr(incoming.ufRegistro, existing.ufRegistro),
    artNumero: mergeNonEmptyStr(incoming.artNumero, existing.artNumero),
    especialidade: mergeNonEmptyStr(incoming.especialidade, existing.especialidade),
    telefone: mergeNonEmptyStr(incoming.telefone, existing.telefone),
    email: mergeNonEmptyStr(incoming.email, existing.email)
  };
}

/**
 * Busca catálogo padronizado do Administra Barragens (via backend Fiscaliza API 2.0 S2S)
 * e nós integrados (mesclado ao cache local).
 */
export async function fetchAdministraMasterCatalog(searchTerms: string[] = []): Promise<AdministraMasterCatalog> {
  const localCatalog = loadLocalAdministraCatalog();

  const clientsToQuery = [
    { key: 'fiscaliza', client: fiscalizaSupabase, defaultOrigin: 'fiscaliza' as SistemaOrigem },
    { key: 'classifica', client: classificaSupabase, defaultOrigin: 'classifica' as SistemaOrigem },
    { key: 'notifica', client: notificaSupabase, defaultOrigin: 'notifica' as SistemaOrigem }
  ].filter(c => c.client !== null);

  if (clientsToQuery.length === 0) {
    return localCatalog;
  }

  try {
    const empMap = new Map<string, EmpreendedorEntity>();
    localCatalog.empreendedores.forEach(e => empMap.set(e.id, e));

    const barMap = new Map<string, BarragemEntity>();
    localCatalog.barragens.forEach(b => barMap.set(b.id, b));

    const rtMap = new Map<string, ResponsavelTecnicoEntity>();
    localCatalog.responsaveisTecnicos.forEach(rt => rtMap.set(rt.id, rt));

    let anyAuthBlocked = false;

    const [administraV2Barragens] = await Promise.all([
      fetchAdministraBarragensViaBackend(),
      ...clientsToQuery.map(async ({ key, client, defaultOrigin }) => {
        if (!client) return;
        try {
          const [empQ, barQ, rtQ, propQ] = await Promise.all([
            queryTableWithOptionalFilter(
              client,
              key,
              ['empreendedores', 'empreendedor', 'proprietarios', 'cadastros_empreendedores'],
              searchTerms
            ),
            queryTableWithOptionalFilter(
              client,
              key,
              ['barragens', 'barragem', 'barramentos'],
              searchTerms
            ),
            queryTableWithOptionalFilter(
              client,
              key,
              ['responsaveis_tecnicos', 'responsavel_tecnico'],
              searchTerms
            ),
            queryTableWithOptionalFilter(
              client,
              key,
              ['propriedades', 'imoveis', 'imoveis_rurais'],
              searchTerms
            )
          ]);

          if (empQ.authBlocked || barQ.authBlocked || rtQ.authBlocked) {
            anyAuthBlocked = true;
          }

          empQ.rows.forEach(row => {
            const mapped = mapRawEmpreendedor(row, defaultOrigin);
            if (mapped) empMap.set(mapped.id, mergeEmpreendedorPreservingExisting(empMap.get(mapped.id), mapped));
          });

          propQ.rows.forEach(row => {
            const mapped = mapRawEmpreendedor(row, defaultOrigin);
            if (mapped) empMap.set(mapped.id, mergeEmpreendedorPreservingExisting(empMap.get(mapped.id), mapped));
          });

          barQ.rows.forEach(row => {
            const mapped = mapRawBarragem(row, defaultOrigin);
            if (mapped) {
              barMap.set(mapped.id, mergeBarragemPreservingExisting(barMap.get(mapped.id), mapped));
              // Caso a tabela de barragens traga CAR ou dados denormalizados do empreendedor
              const inlineCar = pickFirstString(row, ['car_numero', 'car', 'numero_car', 'codigo_car']);
              const inlineEmpName = pickFirstString(row, ['empreendedor_nome', 'proprietario', 'razao_social']);
              const inlineEmpDoc = pickFirstString(row, ['cpf_cnpj_empreendedor', 'cpf_empreendedor', 'cpf_cnpj']);
              if (inlineEmpName && mapped.empreendedorId && !empMap.has(mapped.empreendedorId)) {
                const syntheticEmp = mapRawEmpreendedor(
                  {
                    id: mapped.empreendedorId,
                    nome_razao_social: inlineEmpName,
                    cpf_cnpj: inlineEmpDoc,
                    car_numero: inlineCar,
                    municipio: mapped.municipio,
                    sistema_origem: mapped.sistemaOrigem
                  },
                  defaultOrigin
                );
                if (syntheticEmp) {
                  empMap.set(
                    syntheticEmp.id,
                    mergeEmpreendedorPreservingExisting(empMap.get(syntheticEmp.id), syntheticEmp)
                  );
                }
              }
            }
          });

          rtQ.rows.forEach(row => {
            const mapped = mapRawRt(row, defaultOrigin);
            if (mapped) rtMap.set(mapped.id, mergeRtPreservingExisting(rtMap.get(mapped.id), mapped));
          });
        } catch {
          // Mantém resultados dos demais nós e do cache local em caso de falha isolada
        }
      })
    ]);

    administraV2Barragens.forEach(bar => {
      barMap.set(bar.id, mergeBarragemPreservingExisting(barMap.get(bar.id), bar));
    });

    const merged: AdministraMasterCatalog & { authBlocked?: boolean } = {
      empreendedores: Array.from(empMap.values()),
      barragens: Array.from(barMap.values()),
      responsaveisTecnicos: Array.from(rtMap.values()),
      updatedAt: new Date().toISOString(),
      authBlocked: anyAuthBlocked
    };
    saveLocalAdministraCatalog(merged, true);
    return merged;
  } catch (err) {
    console.warn('[Ecossistema] Usando cache local:', err);
    return localCatalog;
  }
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function ensureValidUuid(candidate?: string | null): string {
  if (candidate && UUID_REGEX.test(candidate.trim())) {
    return candidate.trim();
  }
  return generateUUID();
}

function toNullableStr(val?: string | null): string | null {
  if (val === undefined || val === null) return null;
  const trimmed = String(val).trim();
  return trimmed === '' ? null : trimmed;
}

function toNullableNum(val?: string | number | null): number | null {
  if (val === undefined || val === null || val === '') return null;
  const parsed = typeof val === 'number' ? val : Number(String(val).replace(',', '.').trim());
  return isNaN(parsed) ? null : parsed;
}

function toNullableInt(val?: string | number | null): number | null {
  const num = toNullableNum(val);
  return num === null ? null : Math.trunc(num);
}

export function hasEntityDataInForm(inspection: InspectionData, tipo: EntidadeMestreTipo): boolean {
  const d = inspection.damIdentification;
  if (tipo === 'empreendedor') {
    return Boolean(
      d?.propertyOrBusinessName?.trim() ||
        d?.ownerCpfCnpj?.trim() ||
        d?.ownerAddress?.trim() ||
        d?.ownerPhone?.trim() ||
        d?.regulatoryStatus?.carNumber?.trim() ||
        inspection.conclusions?.notificationDetails?.destinatario?.email?.trim()
    );
  }
  if (tipo === 'barragem') {
    return Boolean(
      d?.damName?.trim() ||
        d?.municipality?.trim() ||
        d?.waterCourse?.trim() ||
        d?.hydrographicBasin?.trim() ||
        d?.workStartYear?.trim() ||
        d?.workEndYear?.trim() ||
        d?.mainWaterUse?.trim() ||
        d?.coordinates?.isManualEdit ||
        (d?.coordinates?.latitude?.trim() && d?.coordinates?.longitude?.trim())
    );
  }
  const rt = inspection.responsavelTecnico;
  return Boolean(
    rt?.nome?.trim() ||
      rt?.cpf?.trim() ||
      rt?.registroProfissional?.trim() ||
      rt?.artNumero?.trim() ||
      rt?.especialidade?.trim() ||
      rt?.telefone?.trim() ||
      rt?.email?.trim()
  );
}

export function getEntityCadastroStatus(
  inspection: InspectionData,
  tipo: EntidadeMestreTipo
): AdministraEntityCadastroState {
  const statusMap = inspection.administraCadastroStatus;
  const statusKey: keyof AdministraCadastroStatus =
    tipo === 'empreendedor'
      ? 'empreendedor'
      : tipo === 'barragem'
      ? 'barragem'
      : 'responsavelTecnico';

  const explicit = statusMap?.[statusKey];
  if (explicit !== undefined) {
    return {
      ...explicit,
      cadastrado: explicit.cadastrado === true
    };
  }

  // Retrocompatibilidade para fichas antigas sem `administraCadastroStatus`
  const importedOriginEntries = Object.values(inspection.importedFieldsOrigin || {});
  if (importedOriginEntries.some(entry => entry.entidadeTipo === tipo)) {
    const first = importedOriginEntries.find(entry => entry.entidadeTipo === tipo)!;
    return {
      cadastrado: true,
      modo: 'vinculado_existente',
      entidadeId: first.entidadeId,
      sistemaOrigem: first.sourceSystem,
      registradoEm: first.importedAt
    };
  }

  const origin =
    tipo === 'empreendedor'
      ? inspection.empreendedorOrigemSistema
      : tipo === 'barragem'
      ? inspection.barragemOrigemSistema
      : inspection.responsavelTecnicoOrigemSistema || inspection.responsavelTecnico?.sistemaOrigem;

  const entidadeId =
    tipo === 'empreendedor'
      ? inspection.empreendedorId
      : tipo === 'barragem'
      ? inspection.barragemId
      : inspection.responsavelTecnicoId || inspection.responsavelTecnico?.id;

  if (origin && origin !== 'fiscaliza' && entidadeId) {
    return {
      cadastrado: true,
      modo: 'vinculado_existente',
      entidadeId,
      sistemaOrigem: origin
    };
  }

  if (entidadeId && hasEntityDataInForm(inspection, tipo)) {
    const catalog = loadLocalAdministraCatalog();
    const existsInCatalog =
      tipo === 'empreendedor'
        ? catalog.empreendedores.some(e => e.id === entidadeId)
        : tipo === 'barragem'
        ? catalog.barragens.some(b => b.id === entidadeId)
        : catalog.responsaveisTecnicos.some(r => r.id === entidadeId);
    if (existsInCatalog || inspection.syncStatus === 'synced') {
      return {
        cadastrado: true,
        modo: 'cadastrado_manual',
        entidadeId,
        sistemaOrigem: origin || 'fiscaliza'
      };
    }
  }

  return { cadastrado: false };
}

export function isEntityRegisteredInAdministra(
  inspection: InspectionData,
  tipo: EntidadeMestreTipo
): boolean {
  return getEntityCadastroStatus(inspection, tipo).cadastrado === true;
}

export interface AdministraConclusionValidation {
  canConclude: boolean;
  missingEntities: {
    tipo: EntidadeMestreTipo;
    label: string;
    usedInForm: boolean;
    hasMinimumFields: boolean;
    missingFields: string[];
    reason: string;
  }[];
  summaryMessage: string;
}

export function getAdministraConclusionValidation(
  inspection: InspectionData
): AdministraConclusionValidation {
  const missingEntities: AdministraConclusionValidation['missingEntities'] = [];

  const damName = (inspection.damIdentification?.damName || '').trim();
  const damMun = (inspection.damIdentification?.municipality || '').trim();
  const damMissingFields: string[] = [];
  if (!damName) damMissingFields.push('Nome da Barragem');
  if (!damMun) damMissingFields.push('Município');
  if (!isEntityRegisteredInAdministra(inspection, 'barragem')) {
    missingEntities.push({
      tipo: 'barragem',
      label: 'Barragem',
      usedInForm: hasEntityDataInForm(inspection, 'barragem'),
      hasMinimumFields: damMissingFields.length === 0,
      missingFields: damMissingFields,
      reason:
        damMissingFields.length > 0
          ? `Preencha (${damMissingFields.join(', ')}) e clique em "Cadastrar Barragem na Base de Dados" (ou vincule uma existente).`
          : 'A barragem preenchida manualmente ainda não foi cadastrada na base do Administra. Clique em "Cadastrar Barragem na Base de Dados".'
    });
  }

  const empName = (inspection.damIdentification?.propertyOrBusinessName || '').trim();
  const empMissingFields: string[] = [];
  if (!empName) empMissingFields.push('Nome do Empreendedor / Razão Social');
  if (!isEntityRegisteredInAdministra(inspection, 'empreendedor')) {
    missingEntities.push({
      tipo: 'empreendedor',
      label: 'Empreendedor',
      usedInForm: hasEntityDataInForm(inspection, 'empreendedor'),
      hasMinimumFields: empMissingFields.length === 0,
      missingFields: empMissingFields,
      reason:
        empMissingFields.length > 0
          ? `Preencha (${empMissingFields.join(', ')}) e clique em "Cadastrar Empreendedor na Base de Dados" (ou vincule um existente).`
          : 'O empreendedor preenchido manualmente ainda não foi cadastrado na base do Administra. Clique em "Cadastrar Empreendedor na Base de Dados".'
    });
  }

  const rtUsed = hasEntityDataInForm(inspection, 'responsavel_tecnico');
  if (rtUsed && !isEntityRegisteredInAdministra(inspection, 'responsavel_tecnico')) {
    const rtName = (inspection.responsavelTecnico?.nome || '').trim();
    const rtMissingFields = rtName ? [] : ['Nome do Responsável Técnico'];
    missingEntities.push({
      tipo: 'responsavel_tecnico',
      label: 'Responsável Técnico (RT)',
      usedInForm: true,
      hasMinimumFields: rtMissingFields.length === 0,
      missingFields: rtMissingFields,
      reason:
        rtMissingFields.length > 0
          ? `Preencha (${rtMissingFields.join(', ')}) e clique em "Cadastrar Responsável Técnico na Base de Dados" (ou limpe os campos de RT se não aplicável).`
          : 'O Responsável Técnico informado manualmente ainda não foi cadastrado na base do Administra. Clique em "Cadastrar Responsável Técnico na Base de Dados".'
    });
  }

  const canConclude = missingEntities.length === 0;
  const summaryMessage = canConclude
    ? 'Todos os cadastros utilizados estão efetivamente registrados na base do Administra.'
    : `Não é possível concluir a vistoria enquanto houver dados não cadastrados na base do Administra (${missingEntities
        .map(m => m.label)
        .join(', ')}). Você pode salvar como rascunho temporário até efetivar os cadastros.`;

  return {
    canConclude,
    missingEntities,
    summaryMessage
  };
}

function buildEmpreendedorFromInspection(
  inspection: InspectionData,
  existingEmp?: EmpreendedorEntity,
  actorEmail?: string,
  now: string = new Date().toISOString()
): { entity: EmpreendedorEntity; payload: Record<string, any> } {
  const targetEmpId = ensureValidUuid(existingEmp?.id || inspection.empreendedorId);
  const empName = (inspection.damIdentification?.propertyOrBusinessName || '').trim();
  const empEntity: EmpreendedorEntity = {
    id: targetEmpId,
    administraId: existingEmp?.administraId || targetEmpId,
    sistemaOrigem: existingEmp?.sistemaOrigem || 'fiscaliza',
    criadoPorEmail: existingEmp?.criadoPorEmail || actorEmail || inspection.createdByEmail || null,
    nomeRazaoSocial: empName || existingEmp?.nomeRazaoSocial || '',
    cpfCnpj:
      toNullableStr(inspection.damIdentification?.ownerCpfCnpj) ||
      toNullableStr(inspection.conclusions?.notificationDetails?.destinatario?.cpfCnpj) ||
      existingEmp?.cpfCnpj ||
      null,
    figuraJuridica:
      inspection.damIdentification?.ownerLegalType || existingEmp?.figuraJuridica || '',
    processoNumero: toNullableStr(inspection.generalInfo?.recordNumber) || existingEmp?.processoNumero || null,
    endereco:
      toNullableStr(inspection.damIdentification?.ownerAddress) ||
      toNullableStr(inspection.conclusions?.notificationDetails?.destinatario?.enderecoCorrespondencia) ||
      existingEmp?.endereco ||
      '',
    municipio: toNullableStr(inspection.damIdentification?.municipality) || existingEmp?.municipio || null,
    uf: existingEmp?.uf || null,
    telefone:
      toNullableStr(inspection.damIdentification?.ownerPhone) ||
      toNullableStr(inspection.conclusions?.notificationDetails?.destinatario?.telefone) ||
      existingEmp?.telefone ||
      null,
    email:
      toNullableStr(inspection.conclusions?.notificationDetails?.destinatario?.email) ||
      existingEmp?.email ||
      null,
    documentosPessoais: existingEmp?.documentosPessoais || null,
    carNumero:
      toNullableStr(inspection.damIdentification?.regulatoryStatus?.carNumber) || existingEmp?.carNumero || null,
    declaracaoUsoOutorga:
      toNullableStr(inspection.damIdentification?.regulatoryStatus?.permitNumber) ||
      existingEmp?.declaracaoUsoOutorga ||
      null,
    quantidadeBarragens:
      toNullableInt(inspection.damIdentification?.damsCountOnProperty) ??
      existingEmp?.quantidadeBarragens ??
      null,
    comentarios: toNullableStr(inspection.sectionComments?.sec2) || existingEmp?.comentarios || null,
    sincronizadoAdministraEm: now,
    createdAt: existingEmp?.createdAt || inspection.createdAt || now,
    updatedAt: now
  };

  const payload: Record<string, any> = {
    id: empEntity.id,
    administra_id: empEntity.administraId,
    sistema_origem: empEntity.sistemaOrigem,
    criado_por_email: empEntity.criadoPorEmail,
    nome_razao_social: empEntity.nomeRazaoSocial,
    cpf_cnpj: empEntity.cpfCnpj,
    figura_juridica: toNullableStr(empEntity.figuraJuridica),
    processo_numero: empEntity.processoNumero,
    endereco: toNullableStr(empEntity.endereco),
    municipio: empEntity.municipio,
    uf: toNullableStr(empEntity.uf),
    telefone: empEntity.telefone,
    email: empEntity.email,
    car_numero: empEntity.carNumero,
    declaracao_uso: empEntity.declaracaoUsoOutorga,
    quantidade_barragens_propriedade: empEntity.quantidadeBarragens,
    comentarios: empEntity.comentarios,
    sincronizado_administra_em: now,
    updated_at: now
  };

  return { entity: empEntity, payload };
}

function buildBarragemFromInspection(
  inspection: InspectionData,
  existingBar?: BarragemEntity,
  registeredEmpId?: string | null,
  actorEmail?: string,
  now: string = new Date().toISOString()
): { entity: BarragemEntity; payload: Record<string, any> } {
  const targetBarId = ensureValidUuid(existingBar?.id || inspection.barragemId);
  const damName = (inspection.damIdentification?.damName || '').trim();
  const latDec = parseGmsToDecimal(inspection.damIdentification?.coordinates?.latitude || '', true);
  const lngDec = parseGmsToDecimal(inspection.damIdentification?.coordinates?.longitude || '', false);
  const startYr = toNullableInt(inspection.damIdentification?.workStartYear);
  const endYr = toNullableInt(inspection.damIdentification?.workEndYear);

  const barEntity: BarragemEntity = {
    id: targetBarId,
    administraId: existingBar?.administraId || targetBarId,
    sistemaOrigem: existingBar?.sistemaOrigem || 'fiscaliza',
    criadoPorEmail: existingBar?.criadoPorEmail || actorEmail || inspection.createdByEmail || null,
    empreendedorId: registeredEmpId ?? existingBar?.empreendedorId ?? '',
    nome: damName || existingBar?.nome || '',
    municipio: (inspection.damIdentification?.municipality || existingBar?.municipio || '').trim(),
    baciaHidrografica:
      toNullableStr(inspection.damIdentification?.hydrographicBasin) || existingBar?.baciaHidrografica || null,
    cursoDagua: toNullableStr(inspection.damIdentification?.waterCourse) || existingBar?.cursoDagua || null,
    coordenadas: {
      latitude: latDec ?? existingBar?.coordenadas?.latitude ?? null,
      longitude: lngDec ?? existingBar?.coordenadas?.longitude ?? null,
      horarioCaptura:
        latDec !== null && lngDec !== null
          ? inspection.damIdentification?.coordinates?.captureTimestamp || existingBar?.coordenadas?.horarioCaptura || now
          : existingBar?.coordenadas?.horarioCaptura || now,
      acuraciaMetros:
        toNullableNum(inspection.damIdentification?.coordinates?.accuracyMeters) ??
        existingBar?.coordenadas?.acuraciaMetros ??
        null,
      altitudeEstimadaDispositivo:
        toNullableNum(inspection.damIdentification?.coordinates?.altitudeMeters) ??
        existingBar?.coordenadas?.altitudeEstimadaDispositivo ??
        null,
      editadoManualmente:
        latDec !== null && lngDec !== null
          ? !!inspection.damIdentification?.coordinates?.isManualEdit
          : !!existingBar?.coordenadas?.editadoManualmente,
      datum: inspection.damIdentification?.coordinates?.datum || existingBar?.coordenadas?.datum || 'SIRGAS 2000'
    },
    latitudeGms: toNullableStr(inspection.damIdentification?.coordinates?.latitude) || existingBar?.latitudeGms || null,
    longitudeGms: toNullableStr(inspection.damIdentification?.coordinates?.longitude) || existingBar?.longitudeGms || null,
    cotaCoroamentoMetros: existingBar?.cotaCoroamentoMetros ?? null,
    anoInicioObra: startYr ?? existingBar?.anoInicioObra ?? null,
    anoFinalObra: endYr ?? existingBar?.anoFinalObra ?? null,
    idadeBarragemAnos: existingBar?.idadeBarragemAnos ?? null,
    tipoMaterial: inspection.damIdentification?.damType || existingBar?.tipoMaterial || '',
    usoPrincipal:
      toNullableStr(inspection.damIdentification?.mainWaterUse) || existingBar?.usoPrincipal || '',
    usosSecundarios:
      inspection.damIdentification?.secondaryWaterUses &&
      inspection.damIdentification.secondaryWaterUses.length > 0
        ? inspection.damIdentification.secondaryWaterUses
        : existingBar?.usosSecundarios || [],
    sincronizadoAdministraEm: now,
    createdAt: existingBar?.createdAt || inspection.createdAt || now,
    updatedAt: now
  };

  const payload: Record<string, any> = {
    id: barEntity.id,
    administra_id: barEntity.administraId,
    sistema_origem: barEntity.sistemaOrigem,
    criado_por_email: barEntity.criadoPorEmail,
    empreendedor_id: registeredEmpId || null,
    nome: barEntity.nome,
    municipio: barEntity.municipio,
    bacia_hidrografica: barEntity.baciaHidrografica,
    curso_dagua: barEntity.cursoDagua,
    latitude_decimal: barEntity.coordenadas.latitude,
    longitude_decimal: barEntity.coordenadas.longitude,
    latitude_gms: barEntity.latitudeGms || null,
    longitude_gms: barEntity.longitudeGms || null,
    datum: barEntity.coordenadas.datum,
    acuracia_metros: barEntity.coordenadas.acuraciaMetros,
    altitude_metros: barEntity.coordenadas.altitudeEstimadaDispositivo,
    cota_coroamento_metros: barEntity.cotaCoroamentoMetros,
    ano_inicio_obra: barEntity.anoInicioObra,
    ano_final_obra: barEntity.anoFinalObra,
    tipo_barragem_material: toNullableStr(barEntity.tipoMaterial),
    uso_principal: toNullableStr(barEntity.usoPrincipal),
    usos_secundarios: barEntity.usosSecundarios,
    vertedouro_tipo: toNullableStr(inspection.damIdentification?.spillwayType),
    outorga_possui: inspection.damIdentification?.regulatoryStatus?.hasWaterPermit || 'nao_informado',
    outorga_numero: toNullableStr(inspection.damIdentification?.regulatoryStatus?.permitNumber),
    licenca_ambiental_possui:
      inspection.damIdentification?.regulatoryStatus?.hasEnvironmentalLicense || 'nao_informado',
    licenca_ambiental_numero: toNullableStr(inspection.damIdentification?.regulatoryStatus?.licenseNumber),
    car_possui: inspection.damIdentification?.regulatoryStatus?.hasCar || 'nao_informado',
    car_numero: toNullableStr(inspection.damIdentification?.regulatoryStatus?.carNumber),
    sincronizado_administra_em: now,
    updated_at: now
  };

  return { entity: barEntity, payload };
}

function buildRtFromInspection(
  inspection: InspectionData,
  existingRt?: ResponsavelTecnicoEntity,
  registeredEmpId?: string | null,
  registeredBarId?: string | null,
  actorEmail?: string,
  now: string = new Date().toISOString()
): { entity: ResponsavelTecnicoEntity; payload: Record<string, any> } {
  const targetRtId = ensureValidUuid(
    existingRt?.id || inspection.responsavelTecnicoId || inspection.responsavelTecnico?.id
  );
  const rtName = (inspection.responsavelTecnico?.nome || '').trim();

  const rtEntity: ResponsavelTecnicoEntity = {
    id: targetRtId,
    administraId: existingRt?.administraId || targetRtId,
    sistemaOrigem: existingRt?.sistemaOrigem || 'fiscaliza',
    criadoPorEmail: existingRt?.criadoPorEmail || actorEmail || inspection.createdByEmail || null,
    empreendedorId: registeredEmpId ?? existingRt?.empreendedorId ?? null,
    barragemId: registeredBarId ?? existingRt?.barragemId ?? null,
    nome: rtName || existingRt?.nome || '',
    cpf: toNullableStr(inspection.responsavelTecnico?.cpf) || existingRt?.cpf || null,
    registroProfissional:
      toNullableStr(inspection.responsavelTecnico?.registroProfissional) ||
      existingRt?.registroProfissional ||
      null,
    ufRegistro: existingRt?.ufRegistro || null,
    artNumero: toNullableStr(inspection.responsavelTecnico?.artNumero) || existingRt?.artNumero || null,
    especialidade:
      toNullableStr(inspection.responsavelTecnico?.especialidade) || existingRt?.especialidade || null,
    telefone: toNullableStr(inspection.responsavelTecnico?.telefone) || existingRt?.telefone || null,
    email: toNullableStr(inspection.responsavelTecnico?.email) || existingRt?.email || null,
    sincronizadoAdministraEm: now,
    createdAt: existingRt?.createdAt || now,
    updatedAt: now
  };

  const payload: Record<string, any> = {
    id: rtEntity.id,
    administra_id: rtEntity.administraId,
    sistema_origem: rtEntity.sistemaOrigem,
    criado_por_email: rtEntity.criadoPorEmail,
    empreendedor_id: registeredEmpId || null,
    barragem_id: registeredBarId || null,
    nome: rtEntity.nome,
    cpf: rtEntity.cpf,
    registro_profissional: rtEntity.registroProfissional,
    uf_registro: rtEntity.ufRegistro,
    art_numero: rtEntity.artNumero,
    especialidade: rtEntity.especialidade,
    telefone: rtEntity.telefone,
    email: rtEntity.email,
    sincronizado_administra_em: now,
    updated_at: now
  };

  return { entity: rtEntity, payload };
}

/**
 * Cadastra EXPLICITAMENTE uma única entidade (Empreendedor, Barragem ou RT) preenchida
 * manualmente no formulário diretamente na base do Administra (local + remota),
 * mantendo o histórico e os vínculos atualizados na ficha.
 */
export async function registerSingleEntityToAdministra(params: {
  tipo: EntidadeMestreTipo;
  inspection: InspectionData;
  actorEmail?: string;
}): Promise<{
  success: boolean;
  updatedInspection?: InspectionData;
  entidadeId?: string;
  savedRemote: boolean;
  error?: string;
}> {
  const { tipo, inspection, actorEmail } = params;
  const now = new Date().toISOString();
  const catalog = loadLocalAdministraCatalog();

  // 1. Validação dos campos obrigatórios por tipo
  if (tipo === 'empreendedor') {
    if (!(inspection.damIdentification?.propertyOrBusinessName || '').trim()) {
      return {
        success: false,
        savedRemote: false,
        error: 'Informe o Nome do Empreendedor / Razão Social antes de cadastrar na base do Administra.'
      };
    }
  } else if (tipo === 'barragem') {
    if (!(inspection.damIdentification?.damName || '').trim()) {
      return {
        success: false,
        savedRemote: false,
        error: 'Informe o Nome da Barragem antes de cadastrar na base do Administra.'
      };
    }
    if (!(inspection.damIdentification?.municipality || '').trim()) {
      return {
        success: false,
        savedRemote: false,
        error: 'Selecione o Município (MT) da barragem antes de cadastrar na base do Administra.'
      };
    }
  } else if (tipo === 'responsavel_tecnico') {
    if (!(inspection.responsavelTecnico?.nome || '').trim()) {
      return {
        success: false,
        savedRemote: false,
        error: 'Informe o Nome do Responsável Técnico antes de cadastrar na base do Administra.'
      };
    }
  }

  // 2. Se servidor remoto do Fiscaliza está configurado mas o aparelho está offline, mantém no rascunho local
  //    (escritas diretas no cliente Supabase externo do Administra estão desativadas aguardando integração via API 2.0)
  const remoteClient = fiscalizaSupabase;
  if (remoteClient && typeof navigator !== 'undefined' && !navigator.onLine) {
    return {
      success: false,
      savedRemote: false,
      error:
        'Dispositivo sem internet no momento. O formulário segue salvo temporariamente no rascunho local; conecte-se para efetivar o cadastro na base do Administra.'
    };
  }

  const empRegistered = isEntityRegisteredInAdministra(inspection, 'empreendedor');
  const barRegistered = isEntityRegisteredInAdministra(inspection, 'barragem');

  let targetId = '';
  let tableName = '';
  let remotePayload: Record<string, any> = {};
  const statusKey: keyof AdministraCadastroStatus =
    tipo === 'empreendedor'
      ? 'empreendedor'
      : tipo === 'barragem'
      ? 'barragem'
      : 'responsavelTecnico';

  if (tipo === 'empreendedor') {
    tableName = 'empreendedores';
    const empDocDigits = normalizeDocumentDigits(inspection.damIdentification?.ownerCpfCnpj);
    const existingEmp = catalog.empreendedores.find(
      e =>
        (inspection.empreendedorId && e.id === inspection.empreendedorId) ||
        (empDocDigits.length >= 11 && normalizeDocumentDigits(e.cpfCnpj) === empDocDigits)
    );
    if (existingEmp && existingEmp.sistemaOrigem !== 'fiscaliza') {
      const perm = canFiscalizaEditMasterEntity(existingEmp.sistemaOrigem);
      if (!perm.allowed) {
        // Caso já exista vínculo sob outra titularidade, atualiza via superioridade de vistoria
        targetId = existingEmp.id;
      }
    }
    const { entity, payload } = buildEmpreendedorFromInspection(inspection, existingEmp, actorEmail, now);
    targetId = entity.id;
    remotePayload = payload;

    const empIdx = catalog.empreendedores.findIndex(e => e.id === targetId);
    if (empIdx >= 0) catalog.empreendedores[empIdx] = entity;
    else catalog.empreendedores.unshift(entity);

    // Se a barragem da mesma vistoria já estiver cadastrada no Administra, vincula o empreendedor_id nela
    if (barRegistered && inspection.barragemId) {
      const bIdx = catalog.barragens.findIndex(b => b.id === inspection.barragemId);
      if (bIdx >= 0) {
        catalog.barragens[bIdx] = { ...catalog.barragens[bIdx], empreendedorId: targetId, updatedAt: now };
      }
    }
  } else if (tipo === 'barragem') {
    tableName = 'barragens';
    const damName = (inspection.damIdentification?.damName || '').trim();
    const damMun = (inspection.damIdentification?.municipality || '').trim();
    const existingBar = catalog.barragens.find(
      b =>
        (inspection.barragemId && b.id === inspection.barragemId) ||
        (damName &&
          normalizeNameForMatch(b.nome) === normalizeNameForMatch(damName) &&
          normalizeNameForMatch(b.municipio) === normalizeNameForMatch(damMun))
    );
    const regEmpId = empRegistered && inspection.empreendedorId ? ensureValidUuid(inspection.empreendedorId) : null;
    const { entity, payload } = buildBarragemFromInspection(inspection, existingBar, regEmpId, actorEmail, now);
    targetId = entity.id;
    remotePayload = payload;

    const barIdx = catalog.barragens.findIndex(b => b.id === targetId);
    if (barIdx >= 0) catalog.barragens[barIdx] = entity;
    else catalog.barragens.unshift(entity);
  } else {
    tableName = 'responsaveis_tecnicos';
    const rtCpfDigits = normalizeDocumentDigits(inspection.responsavelTecnico?.cpf);
    const existingRt = catalog.responsaveisTecnicos.find(
      r =>
        (inspection.responsavelTecnicoId && r.id === inspection.responsavelTecnicoId) ||
        (rtCpfDigits.length === 11 && normalizeDocumentDigits(r.cpf) === rtCpfDigits)
    );
    const regEmpId = empRegistered && inspection.empreendedorId ? ensureValidUuid(inspection.empreendedorId) : null;
    const regBarId = barRegistered && inspection.barragemId ? ensureValidUuid(inspection.barragemId) : null;
    const { entity, payload } = buildRtFromInspection(
      inspection,
      existingRt,
      regEmpId,
      regBarId,
      actorEmail,
      now
    );
    targetId = entity.id;
    remotePayload = payload;

    const rtIdx = catalog.responsaveisTecnicos.findIndex(r => r.id === targetId);
    if (rtIdx >= 0) catalog.responsaveisTecnicos[rtIdx] = entity;
    else catalog.responsaveisTecnicos.unshift(entity);
  }

  let savedRemote = false;
  if (remoteClient) {
    try {
      const { error } = await remoteClient.from(tableName).upsert(remotePayload);
      if (error) {
        // Fallback para RPC segura caso o gatilho cross-system ou esquema exija invocação privilegiada
        const { error: rpcError } = await remoteClient.rpc('rpc_cadastrar_entidade_administra', {
          p_entidade_tipo: tipo,
          p_dados: remotePayload,
          p_vistoria_id: inspection.id && UUID_REGEX.test(inspection.id) ? inspection.id : null
        });
        if (rpcError) {
          return {
            success: false,
            savedRemote: false,
            error:
              error.code === '42501' || error.message?.includes('row-level security')
                ? 'Sessão autenticada necessária para gravar na base do Administra. Verifique seu login institucional e tente novamente.'
                : `Falha ao cadastrar na base do Administra: ${error.message}`
          };
        }
      }
      savedRemote = true;

      // Propaga vínculo nas entidades filhas já registradas se necessário
      if (tipo === 'empreendedor' && barRegistered && inspection.barragemId) {
        await remoteClient
          .from('barragens')
          .update({ empreendedor_id: targetId, updated_at: now })
          .eq('id', inspection.barragemId);
      }
      if (tipo !== 'responsavel_tecnico' && isEntityRegisteredInAdministra(inspection, 'responsavel_tecnico')) {
        const rtTargetId = inspection.responsavelTecnicoId || inspection.responsavelTecnico?.id;
        if (rtTargetId && UUID_REGEX.test(rtTargetId)) {
          const patch =
            tipo === 'empreendedor'
              ? { empreendedor_id: targetId, updated_at: now }
              : { barragem_id: targetId, updated_at: now };
          await remoteClient.from('responsaveis_tecnicos').update(patch).eq('id', rtTargetId);
        }
      }
    } catch (err: any) {
      return {
        success: false,
        savedRemote: false,
        error: err?.message || 'Erro de comunicação ao cadastrar na base do Administra.'
      };
    }
  }

  saveLocalAdministraCatalog(catalog);

  const prevStatus = inspection.administraCadastroStatus || {};
  const newEntityState: AdministraEntityCadastroState = {
    cadastrado: true,
    modo: 'cadastrado_manual',
    entidadeId: targetId,
    sistemaOrigem: 'fiscaliza',
    registradoEm: now,
    registradoPorEmail: actorEmail || inspection.createdByEmail || null
  };

  const updatedInspection: InspectionData = {
    ...inspection,
    empreendedorId: tipo === 'empreendedor' ? targetId : inspection.empreendedorId,
    barragemId: tipo === 'barragem' ? targetId : inspection.barragemId,
    responsavelTecnicoId: tipo === 'responsavel_tecnico' ? targetId : inspection.responsavelTecnicoId,
    empreendedorOrigemSistema: tipo === 'empreendedor' ? 'fiscaliza' : inspection.empreendedorOrigemSistema,
    barragemOrigemSistema: tipo === 'barragem' ? 'fiscaliza' : inspection.barragemOrigemSistema,
    responsavelTecnicoOrigemSistema:
      tipo === 'responsavel_tecnico' ? 'fiscaliza' : inspection.responsavelTecnicoOrigemSistema,
    responsavelTecnico:
      tipo === 'responsavel_tecnico' && inspection.responsavelTecnico
        ? {
            ...inspection.responsavelTecnico,
            id: targetId,
            sistemaOrigem: 'fiscaliza'
          }
        : inspection.responsavelTecnico,
    administraCadastroStatus: {
      ...prevStatus,
      [statusKey]: newEntityState
    }
  };

  return {
    success: true,
    updatedInspection,
    entidadeId: targetId,
    savedRemote
  };
}

/**
 * Persiste APENAS entidades já efetivamente cadastradas/vinculadas ao Administra.
 * Dados preenchidos manualmente ainda no rascunho permanecem exclusivamente locais
 * na ficha até que o analista acione o botão explícito de cadastro na base de dados.
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

  const empRegistered = isEntityRegisteredInAdministra(inspection, 'empreendedor');
  const barRegistered = isEntityRegisteredInAdministra(inspection, 'barragem');
  const rtRegistered = isEntityRegisteredInAdministra(inspection, 'responsavel_tecnico');

  const damName = (inspection.damIdentification?.damName || '').trim();
  const empName = (inspection.damIdentification?.propertyOrBusinessName || '').trim();
  const rtName = (inspection.responsavelTecnico?.nome || '').trim();

  if (!empRegistered && !barRegistered && !rtRegistered) {
    return { savedToAdministraRemote: false, skippedReadOnlyEntities, warnings };
  }

  // A. EMPREENDEDOR (somente se já cadastrado/vinculado no Administra)
  let resolvedRegisteredEmpId: string | null = null;
  if (empRegistered && empName) {
    const empId = ensureValidUuid(inspection.empreendedorId);
    const empDocDigits = normalizeDocumentDigits(
      inspection.damIdentification?.ownerCpfCnpj || inspection.generalInfo?.accompaniedBy?.document
    );
    const existingEmp = catalog.empreendedores.find(
      e =>
        e.id === empId ||
        (empDocDigits && empDocDigits.length >= 11 && normalizeDocumentDigits(e.cpfCnpj) === empDocDigits)
    );
    const resolvedEmpOrigin: SistemaOrigem =
      existingEmp?.sistemaOrigem || inspection.empreendedorOrigemSistema || 'fiscaliza';
    const empPerm = canFiscalizaEditMasterEntity(resolvedEmpOrigin);

    if (!empPerm.allowed) {
      skippedReadOnlyEntities.push(`Empreendedor (${resolvedEmpOrigin})`);
      resolvedRegisteredEmpId = existingEmp?.id || empId;
    } else {
      const { entity } = buildEmpreendedorFromInspection(inspection, existingEmp, actorEmail, now);
      resolvedRegisteredEmpId = entity.id;
      const empIdx = catalog.empreendedores.findIndex(e => e.id === entity.id);
      if (empIdx >= 0) catalog.empreendedores[empIdx] = entity;
      else catalog.empreendedores.unshift(entity);
    }
  }

  // B. BARRAGEM (somente se já cadastrada/vinculada no Administra)
  let resolvedRegisteredBarId: string | null = null;
  if (barRegistered && damName) {
    const barId = ensureValidUuid(inspection.barragemId);
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

    if (!barPerm.allowed) {
      skippedReadOnlyEntities.push(`Barragem (${resolvedBarOrigin})`);
      resolvedRegisteredBarId = existingBar?.id || barId;
    } else {
      const { entity } = buildBarragemFromInspection(
        inspection,
        existingBar,
        resolvedRegisteredEmpId,
        actorEmail,
        now
      );
      resolvedRegisteredBarId = entity.id;
      const barIdx = catalog.barragens.findIndex(b => b.id === entity.id);
      if (barIdx >= 0) catalog.barragens[barIdx] = entity;
      else catalog.barragens.unshift(entity);
    }
  }

  // C. RESPONSÁVEL TÉCNICO (somente se já cadastrado/vinculado no Administra)
  if (rtRegistered && rtName) {
    const rtId = ensureValidUuid(inspection.responsavelTecnicoId || inspection.responsavelTecnico?.id);
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

    if (!rtPerm.allowed) {
      skippedReadOnlyEntities.push(`Responsável Técnico (${resolvedRtOrigin})`);
    } else {
      const { entity } = buildRtFromInspection(
        inspection,
        existingRt,
        resolvedRegisteredEmpId,
        resolvedRegisteredBarId,
        actorEmail,
        now
      );
      const rtIdx = catalog.responsaveisTecnicos.findIndex(r => r.id === entity.id);
      if (rtIdx >= 0) catalog.responsaveisTecnicos[rtIdx] = entity;
      else catalog.responsaveisTecnicos.unshift(entity);
    }
  }

  saveLocalAdministraCatalog(catalog);

  // Escritas diretas no Supabase externo do Administra foram desativadas em preparação à API 2.0.
  const savedToAdministraRemote = false;

  const isFutura =
    inspection.tipoPlanejamento === 'futura' || inspection.generalInfo?.tipoPlanejamento === 'futura';
  if (
    inspection.isDraft === false &&
    !isFutura &&
    inspection.importedFieldsOrigin &&
    Object.keys(inspection.importedFieldsOrigin).length > 0
  ) {
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
      return Array.isArray(parsed) ? parsed.filter(p => !isLegacySampleEntity(p)) : [];
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
  inspection: InspectionData,
  options: { syncRemote?: boolean } = {}
): Promise<void> {
  const barragemNome = (inspection.damIdentification?.damName || '').trim();
  const empNome = (inspection.damIdentification?.propertyOrBusinessName || '').trim();
  if (!barragemNome && !empNome) return;

  const barReg = isEntityRegisteredInAdministra(inspection, 'barragem');
  const empReg = isEntityRegisteredInAdministra(inspection, 'empreendedor');
  const rtReg = isEntityRegisteredInAdministra(inspection, 'responsavel_tecnico');

  const barragemId = barReg && inspection.barragemId && UUID_REGEX.test(inspection.barragemId) ? inspection.barragemId : '';
  const empreendedorId =
    empReg && inspection.empreendedorId && UUID_REGEX.test(inspection.empreendedorId) ? inspection.empreendedorId : '';
  const rtId =
    rtReg && (inspection.responsavelTecnicoId || inspection.responsavelTecnico?.id) &&
    UUID_REGEX.test((inspection.responsavelTecnicoId || inspection.responsavelTecnico?.id)!)
      ? (inspection.responsavelTecnicoId || inspection.responsavelTecnico?.id)!
      : null;

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
      barragemNome,
      empreendedorId,
      empreendedorNome: empNome,
      responsavelTecnicoId: rtId,
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
      barragemNome,
      empreendedorId,
      empreendedorNome: empNome,
      responsavelTecnicoId: rtId,
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
      barragemNome,
      empreendedorId,
      empreendedorNome: empNome,
      responsavelTecnicoId: rtId,
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
      barragemNome,
      empreendedorId,
      empreendedorNome: empNome,
      responsavelTecnicoId: rtId,
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

  // Sincroniza índice remoto somente na base do próprio Fiscaliza quando habilitado
  const remoteClient = options.syncRemote !== false ? fiscalizaSupabase : null;
  if (remoteClient && !MISSING_TABLE_CACHE.has('fiscaliza:produtos_ecossistema')) {
    try {
      const payload = productsToRegister.map(p => ({
        id: p.id,
        sistema_origem: p.sistemaOrigem,
        tipo_produto: p.tipoProduto,
        titulo: p.titulo,
        numero_documento: p.numeroDocumento,
        processo_numero: p.processoNumero,
        barragem_id: p.barragemId && UUID_REGEX.test(p.barragemId) ? p.barragemId : null,
        barragem_nome: p.barragemNome,
        empreendedor_id: p.empreendedorId && UUID_REGEX.test(p.empreendedorId) ? p.empreendedorId : null,
        empreendedor_nome: p.empreendedorNome,
        responsavel_tecnico_id:
          p.responsavelTecnicoId && UUID_REGEX.test(p.responsavelTecnicoId) ? p.responsavelTecnicoId : null,
        origem_registro_id: p.origemRegistroId,
        status_produto: p.statusProduto,
        data_emissao: p.dataEmissao,
        autor_email: p.autorEmail,
        autor_nome: p.autorNome,
        resumo: p.resumo,
        atualizado_em: p.atualizadoEm
      }));
      const { error } = await remoteClient.from('produtos_ecossistema').upsert(payload);
      if (isMissingRemoteTableError(error)) {
        MISSING_TABLE_CACHE.add('fiscaliza:produtos_ecossistema');
      }
    } catch {
      // Silencioso se estrutura remota estiver pendente
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
    { client: fiscalizaSupabase, source: 'fiscaliza' as SistemaOrigem },
    { client: classificaSupabase, source: 'classifica' as SistemaOrigem },
    { client: notificaSupabase, source: 'notifica' as SistemaOrigem }
  ].filter(item => item.client !== null);

  await Promise.all(
    clientsToQuery.map(async ({ client, source }) => {
      if (!client) return;
      const cacheKey = `${source}:produtos_ecossistema`;
      if (MISSING_TABLE_CACHE.has(cacheKey)) return;
      try {
        const { data, error } = await client
          .from('produtos_ecossistema')
          .select('*')
          .limit(200);
        if (error) {
          if (isMissingRemoteTableError(error)) {
            MISSING_TABLE_CACHE.add(cacheKey);
          }
          return;
        }
        if (Array.isArray(data)) {
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

function saveLocalAlterationRequests(list: SolicitacaoAlteracaoEcossistema[], silent: boolean = false): void {
  try {
    localStorage.setItem(ALTERATION_REQUESTS_KEY, JSON.stringify(sanitizeDeepObject(list)));
    if (!silent) {
      emitEcosystemUpdate();
    }
  } catch {}
}

export async function listAlterationRequests(): Promise<SolicitacaoAlteracaoEcossistema[]> {
  const map = new Map<string, SolicitacaoAlteracaoEcossistema>();
  loadLocalAlterationRequests().forEach(r => map.set(r.id, r));

  const remoteClient = fiscalizaSupabase;
  const nodeKey = 'fiscaliza';
  const cacheKey = `${nodeKey}:solicitacoes_alteracao_ecossistema`;

  if (remoteClient && !MISSING_TABLE_CACHE.has(cacheKey)) {
    try {
      const { data: sessData } = await remoteClient.auth.getSession();
      if (sessData?.session) {
        const { data, error } = await remoteClient
          .from('solicitacoes_alteracao_ecossistema')
          .select('*')
          .order('criado_em', { ascending: false })
          .limit(200);

        if (error) {
          if (isMissingRemoteTableError(error)) {
            MISSING_TABLE_CACHE.add(cacheKey);
          }
        } else if (Array.isArray(data)) {
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
      }
    } catch {
      // Fallback para lista local
    }
  }

  const merged = Array.from(map.values()).sort(
    (a, b) => new Date(b.criadoEm).getTime() - new Date(a.criadoEm).getTime()
  );
  saveLocalAlterationRequests(merged, true);
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

  const remoteClient = fiscalizaSupabase;
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

  const remoteClient = fiscalizaSupabase;
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
  authBlocked?: boolean;
}> {
  const trimmed = (query || '').trim();
  const qDigits = normalizeDocumentDigits(trimmed);
  const searchTerms: string[] = [];
  if (trimmed) searchTerms.push(trimmed);
  if (qDigits && qDigits !== trimmed) searchTerms.push(qDigits);
  if (qDigits.length === 11) searchTerms.push(formatCpfDigits(qDigits));
  if (qDigits.length === 14) searchTerms.push(formatCnpjDigits(qDigits));

  const catalog = (await fetchAdministraMasterCatalog(searchTerms)) as AdministraMasterCatalog & {
    authBlocked?: boolean;
  };
  const q = normalizeNameForMatch(trimmed);

  const matchDam = (b: BarragemEntity) => {
    if (!q) return false;
    return (
      normalizeNameForMatch(b.nome).includes(q) ||
      normalizeNameForMatch(b.municipio).includes(q) ||
      normalizeNameForMatch(b.cursoDagua).includes(q)
    );
  };

  const directlyMatchedDamEmpIds = new Set(
    catalog.barragens.filter(matchDam).map(b => b.empreendedorId).filter(Boolean)
  );

  const matchEmp = (e: EmpreendedorEntity) => {
    if (!q && !qDigits) return true;
    if (directlyMatchedDamEmpIds.has(e.id)) return true;
    const nameMatch = q ? normalizeNameForMatch(e.nomeRazaoSocial).includes(q) : false;
    const munMatch = q ? normalizeNameForMatch(e.municipio).includes(q) : false;
    const carNorm = normalizeNameForMatch(e.carNumero);
    const carMatch = q ? carNorm.includes(q) || carNorm.replace(/[^a-z0-9]/g, '').includes(q.replace(/[^a-z0-9]/g, '')) : false;
    const docDigits = normalizeDocumentDigits(e.cpfCnpj);
    const docMatch = qDigits && qDigits.length >= 3 ? docDigits.includes(qDigits) : false;
    const rawDocMatch = q ? normalizeNameForMatch(e.cpfCnpj).includes(q) : false;
    return nameMatch || munMatch || carMatch || docMatch || rawDocMatch;
  };

  const matchedEmps = catalog.empreendedores.filter(matchEmp);
  const matchedEmpIds = new Set(matchedEmps.map(e => e.id));

  const matchedBars = catalog.barragens.filter(b => {
    if (matchedEmpIds.has(b.empreendedorId)) return true;
    if (!q) return true;
    return matchDam(b);
  });

  return {
    empreendedores: matchedEmps,
    barragens: matchedBars,
    responsaveisTecnicos: catalog.responsaveisTecnicos,
    queriedRemote: !!(fiscalizaSupabase || classificaSupabase || notificaSupabase),
    authBlocked: !!catalog.authBlocked
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

function saveLocalAnalystInbox(list: NotificacaoAnalistaEcossistema[], silent: boolean = false): void {
  try {
    localStorage.setItem(NOTIFICACOES_ANALISTA_KEY, JSON.stringify(sanitizeDeepObject(list)));
    if (!silent) {
      emitEcosystemUpdate();
    }
  } catch {}
}

export async function listAnalystInboxNotifications(): Promise<NotificacaoAnalistaEcossistema[]> {
  const map = new Map<string, NotificacaoAnalistaEcossistema>();
  loadLocalAnalystInbox().forEach(n => map.set(n.id, n));

  const clientEntries = [
    { key: 'fiscaliza', client: fiscalizaSupabase },
    { key: 'classifica', client: classificaSupabase },
    { key: 'notifica', client: notificaSupabase }
  ].filter((item): item is { key: string; client: SupabaseClient } => item.client !== null);

  await Promise.all(
    clientEntries.map(async ({ key, client }) => {
      const cacheKey = `${key}:notificacoes_analista_ecossistema`;
      if (MISSING_TABLE_CACHE.has(cacheKey)) return;
      try {
        const { data, error } = await client
          .from('notificacoes_analista_ecossistema')
          .select('*')
          .order('criada_em', { ascending: false })
          .limit(200);
        if (error) {
          if (isMissingRemoteTableError(error)) {
            MISSING_TABLE_CACHE.add(cacheKey);
          }
          return;
        }
        if (Array.isArray(data)) {
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
  saveLocalAnalystInbox(merged, true);
  return merged;
}

export async function markAnalystNotificationRead(id: string): Promise<void> {
  const list = loadLocalAnalystInbox();
  const next = list.map(n => (n.id === id ? { ...n, lida: true } : n));
  saveLocalAnalystInbox(next);
  if (fiscalizaSupabase) {
    try {
      await fiscalizaSupabase.from('notificacoes_analista_ecossistema').update({ lida: true }).eq('id', id);
    } catch {}
  }
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

// Campos físicos aferidos em campo expressamente autorizados para atualização por superioridade de vistoria
const AUTHORIZED_SUPERIORITY_BARRAGEM_FIELDS: Record<string, { dbColumn: 'curso_dagua' }> = {
  waterCourse: { dbColumn: 'curso_dagua' }
};

/**
 * Aplica a SUPERIORIDADE DOS DADOS DE VISTORIA sobre campos importados de outros sistemas:
 * - Restrita exclusivamente a Vistoria Atual concluída (`isDraft === false` e `tipoPlanejamento !== 'futura'`).
 * - Restrita aos campos físicos aferidos em campo autorizados pelo fluxo (`waterCourse` -> `curso_dagua` da barragem),
 *   nunca sobrescrevendo dados cadastrais/identidade (nome, município, anos de obra), regulatórios, de titularidade,
 *   PII de empreendedor ou responsável técnico, nem enviando valores vazios.
 * - Não executa escritas diretas em clientes Supabase de sistemas externos (Administra, Classifica ou Notifica).
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
  const isFutura =
    inspection.tipoPlanejamento === 'futura' ||
    inspection.generalInfo?.tipoPlanejamento === 'futura';
  if (inspection.isDraft !== false || isFutura) {
    return { updatedCount: 0, notificationsSent: [], warnings: [] };
  }

  const importedMap = inspection.importedFieldsOrigin || {};
  const notificationsSent: NotificacaoAnalistaEcossistema[] = [];
  const warnings: string[] = [];
  const existingInbox = loadLocalAnalystInbox();
  const existingReqs = loadLocalAlterationRequests();
  const newAuditReqs: SolicitacaoAlteracaoEcossistema[] = [];
  const seenFieldKeys = new Set<string>();
  const catalog = loadLocalAdministraCatalog();
  const now = new Date().toISOString();
  const linkedBarId = (inspection.barragemId || '').trim();
  const barPatch: Record<string, any> = {};
  let updatedCount = 0;

  for (const [fieldKey, meta] of Object.entries(importedMap) as [string, ImportedFieldOriginRecord][]) {
    if (seenFieldKeys.has(fieldKey)) continue;
    const authRule = AUTHORIZED_SUPERIORITY_BARRAGEM_FIELDS[fieldKey];
    if (!authRule || meta?.entidadeTipo !== 'barragem') continue;
    if (!meta.entidadeId || !linkedBarId || meta.entidadeId !== linkedBarId) continue;

    const liveVal = getLiveInspectionFieldValue(inspection, fieldKey).trim();
    const origVal = (meta.originalValue || '').trim();
    if (!liveVal || liveVal === origVal) continue;

    // Evita reenviar notificação idêntica já registrada para exatamente o mesmo valor
    const alreadyNotifiedSameValue = existingInbox.some(
      n =>
        n.vistoriaId === inspection.id &&
        n.campoAlterado === fieldKey &&
        n.valorAtualizadoVistoria.trim() === liveVal
    );
    if (alreadyNotifiedSameValue) continue;

    seenFieldKeys.add(fieldKey);
    updatedCount++;

    // 1. Atualiza somente o campo autorizado da barragem no catálogo local
    const idx = catalog.barragens.findIndex(b => b.id === meta.entidadeId);
    if (idx >= 0) {
      const target = { ...catalog.barragens[idx] };
      if (fieldKey === 'waterCourse') {
        target.cursoDagua = liveVal;
      }
      target.updatedAt = now;
      catalog.barragens[idx] = target;
    }

    barPatch[authRule.dbColumn] = liveVal;

    const entidadeNome = inspection.damIdentification.damName || 'Barragem';

    const notif: NotificacaoAnalistaEcossistema = {
      id: generateUUID(),
      sistemaDestino: meta.sourceSystem,
      sistemaOrigem: 'fiscaliza',
      destinatarioAnalistaEmail: (meta.originalAnalystEmail || 'nao-informado@sistema.local').toLowerCase(),
      entidadeTipo: 'barragem',
      entidadeId: meta.entidadeId,
      entidadeNome,
      vistoriaId: inspection.id,
      numeroVistoria: inspection.generalInfo?.numeroVistoria || null,
      campoAlterado: fieldKey,
      campoRotulo: meta.fieldLabel,
      valorAnterior: origVal,
      valorAtualizadoVistoria: liveVal,
      alteradoPorEmail: (actorEmail || inspection.createdByEmail || 'nao-informado@sistema.local').toLowerCase(),
      alteradoPorNome: actorName || 'Fiscal de Campo',
      motivoSuperioridade:
        'Alteração aferida in loco na Vistoria Presencial em Campo e registrada apenas na base do Fiscaliza (sistema de origem externo não atualizado automaticamente).',
      lida: false,
      criadaEm: now
    };

    notificationsSent.push(notif);

    if (fiscalizaSupabase) {
      try {
        const { error: notifErr } = await fiscalizaSupabase
          .from('notificacoes_analista_ecossistema')
          .insert({
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
        if (notifErr) {
          warnings.push(`Notificação registrada localmente (${meta.sourceSystem}): ${notifErr.message || 'pendente de migração no Fiscaliza'}`);
        }
      } catch (err: any) {
        warnings.push(`Notificação registrada localmente (${meta.sourceSystem}): ${err?.message || 'pendente de migração no Fiscaliza'}`);
      }
    }

    const auditReq: SolicitacaoAlteracaoEcossistema = {
      id: generateUUID(),
      entidadeTipo: 'barragem',
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
      status: 'pendente',
      respostaMotivo:
        'Registrado exclusivamente na base do Fiscaliza por aferição em campo; sistema de origem externo não modificado automaticamente.',
      analisadoPorEmail: notif.alteradoPorEmail,
      analisadoPorNome: notif.alteradoPorNome,
      analisadoEm: now,
      criadoEm: now,
      atualizadoEm: now
    };
    newAuditReqs.push(auditReq);
  }

  if (updatedCount > 0) {
    saveLocalAlterationRequests([...newAuditReqs, ...existingReqs]);
    saveLocalAdministraCatalog(catalog);
    saveLocalAnalystInbox([...notificationsSent, ...existingInbox]);

    // Grava exclusivamente os campos autorizados alterados no projeto do próprio Fiscaliza (sem escritas em sistemas externos)
    if (fiscalizaSupabase && linkedBarId && Object.keys(barPatch).length > 0) {
      try {
        const patchPayload = { ...barPatch, updated_at: now };
        const { error: rpcErr } = await fiscalizaSupabase.rpc('rpc_aplicar_edicao_vistoria', {
          p_entidade_tipo: 'barragem',
          p_entidade_id: linkedBarId,
          p_dados: patchPayload
        });
        if (rpcErr) {
          const { error: updateErr } = await fiscalizaSupabase
            .from('barragens')
            .update(patchPayload)
            .eq('id', linkedBarId);
          if (updateErr) {
            warnings.push(`Registro de campo na base do Fiscaliza: ${updateErr.message || 'sincronização pendente'}`);
          }
        }
      } catch (err: any) {
        warnings.push(`Registro de campo na base do Fiscaliza: ${err?.message || 'sincronização pendente'}`);
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
    administraCadastroStatus: {
      ...(prev.administraCadastroStatus || {})
    },
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
    originMap[fieldKey] = {
      fieldKey,
      fieldLabel,
      entidadeTipo,
      entidadeId,
      sourceSystem,
      originalAnalystEmail: originalAnalystEmail || null,
      originalValue: value || '',
      currentValue: value || '',
      importedAt: now,
      modifiedInVistoria: false
    };
  };

  const preserveIfBlank = (incoming: string | null | undefined, existing: string | undefined): string => {
    const clean = incoming !== undefined && incoming !== null ? String(incoming).trim() : '';
    return clean !== '' ? clean : existing ?? '';
  };

  if (payload.empreendedor) {
    const emp = payload.empreendedor;
    next.empreendedorId = emp.id;
    next.empreendedorOrigemSistema = emp.sistemaOrigem;
    next.administraCadastroStatus = {
      ...(next.administraCadastroStatus || {}),
      empreendedor: {
        cadastrado: true,
        modo: 'vinculado_existente',
        entidadeId: emp.id,
        sistemaOrigem: emp.sistemaOrigem,
        registradoEm: emp.sincronizadoAdministraEm || now
      }
    };
    next.damIdentification.propertyOrBusinessName = preserveIfBlank(
      emp.nomeRazaoSocial,
      prev.damIdentification.propertyOrBusinessName
    );
    next.damIdentification.ownerCpfCnpj = preserveIfBlank(emp.cpfCnpj, prev.damIdentification.ownerCpfCnpj);
    next.damIdentification.ownerLegalType = (preserveIfBlank(
      emp.figuraJuridica,
      prev.damIdentification.ownerLegalType
    ) || '') as any;
    next.damIdentification.ownerPhone = preserveIfBlank(emp.telefone, prev.damIdentification.ownerPhone);
    next.damIdentification.ownerAddress = preserveIfBlank(emp.endereco, prev.damIdentification.ownerAddress);
    next.damIdentification.damsCountOnProperty =
      emp.quantidadeBarragens !== null && emp.quantidadeBarragens !== undefined && emp.quantidadeBarragens > 0
        ? String(emp.quantidadeBarragens)
        : prev.damIdentification.damsCountOnProperty || '';

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
      nomeRazaoSocial: preserveIfBlank(
        emp.nomeRazaoSocial,
        prev.conclusions.notificationDetails.destinatario?.nomeRazaoSocial
      ),
      cpfCnpj: preserveIfBlank(emp.cpfCnpj, prev.conclusions.notificationDetails.destinatario?.cpfCnpj),
      enderecoCorrespondencia: preserveIfBlank(
        emp.endereco,
        prev.conclusions.notificationDetails.destinatario?.enderecoCorrespondencia
      ),
      telefone: preserveIfBlank(emp.telefone, prev.conclusions.notificationDetails.destinatario?.telefone),
      email: preserveIfBlank(emp.email, prev.conclusions.notificationDetails.destinatario?.email),
      municipio: preserveIfBlank(
        emp.municipio,
        prev.conclusions.notificationDetails.destinatario?.municipio || next.damIdentification.municipality
      )
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
      emp.quantidadeBarragens ? String(emp.quantidadeBarragens) : ''
    );
  }

  if (payload.barragem) {
    const bar = payload.barragem;
    next.barragemId = bar.id;
    next.barragemOrigemSistema = bar.sistemaOrigem;
    next.sistemaOrigem = bar.sistemaOrigem;
    next.administraCadastroStatus = {
      ...(next.administraCadastroStatus || {}),
      barragem: {
        cadastrado: true,
        modo: 'vinculado_existente',
        entidadeId: bar.id,
        sistemaOrigem: bar.sistemaOrigem,
        registradoEm: bar.sincronizadoAdministraEm || now
      }
    };
    if (bar.empreendedorId && !next.empreendedorId) {
      next.empreendedorId = bar.empreendedorId;
    }
    next.damIdentification.damName = preserveIfBlank(bar.nome, prev.damIdentification.damName);
    next.damIdentification.municipality = preserveIfBlank(bar.municipio, prev.damIdentification.municipality);
    next.damIdentification.hydrographicBasin = preserveIfBlank(
      bar.baciaHidrografica,
      prev.damIdentification.hydrographicBasin
    );
    next.damIdentification.waterCourse = preserveIfBlank(bar.cursoDagua, prev.damIdentification.waterCourse);
    next.damIdentification.workStartYear =
      bar.anoInicioObra !== null && bar.anoInicioObra !== undefined && bar.anoInicioObra > 0
        ? String(bar.anoInicioObra)
        : prev.damIdentification.workStartYear || '';
    next.damIdentification.workEndYear =
      bar.anoFinalObra !== null && bar.anoFinalObra !== undefined && bar.anoFinalObra > 0
        ? String(bar.anoFinalObra)
        : prev.damIdentification.workEndYear || '';
    next.damIdentification.damType = (preserveIfBlank(bar.tipoMaterial, prev.damIdentification.damType) || '') as any;
    next.damIdentification.mainWaterUse = preserveIfBlank(
      bar.usoPrincipal,
      prev.damIdentification.mainWaterUse
    );
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
    next.administraCadastroStatus = {
      ...(next.administraCadastroStatus || {}),
      responsavelTecnico: {
        cadastrado: true,
        modo: 'vinculado_existente',
        entidadeId: rt.id,
        sistemaOrigem: rt.sistemaOrigem,
        registradoEm: rt.sincronizadoAdministraEm || now
      }
    };
    next.responsavelTecnico = {
      id: rt.id,
      nome: preserveIfBlank(rt.nome, prev.responsavelTecnico?.nome),
      cpf: preserveIfBlank(rt.cpf, prev.responsavelTecnico?.cpf),
      registroProfissional: preserveIfBlank(
        rt.registroProfissional,
        prev.responsavelTecnico?.registroProfissional
      ),
      artNumero: preserveIfBlank(rt.artNumero, prev.responsavelTecnico?.artNumero),
      especialidade: preserveIfBlank(rt.especialidade, prev.responsavelTecnico?.especialidade),
      telefone: preserveIfBlank(rt.telefone, prev.responsavelTecnico?.telefone),
      email: preserveIfBlank(rt.email, prev.responsavelTecnico?.email),
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

