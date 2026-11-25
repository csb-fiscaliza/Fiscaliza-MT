import crypto from 'crypto';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createFiscalizaServiceRoleClient } from './pendenciasApi.ts';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const ADMINISTRA_V2_ENDPOINTS = {
  HEALTH: '/api/v2/health',
  BARRAGENS: '/api/v2/barragens'
} as const;

export const ADMINISTRA_V2_PAGE_LIMIT = 500;
export const ADMINISTRA_V2_DEFAULT_MAX_PAGES = 50;
export const ADMINISTRA_V2_DEFAULT_TIMEOUT_MS = 10000;

export const EMPTY_BODY_SHA256 = crypto.createHash('sha256').update('').digest('hex');

export interface AdministraS2sConfig {
  apiUrl: string;
  keyId: string;
  privateKeyPem: string;
}

export interface AdministraBarragemV2Dto {
  id: string;
  administraId?: string | null;
  sistemaOrigem?: string | null;
  empreendedorId?: string | null;
  nome: string;
  municipio?: string | null;
  uf?: string | null;
  baciaHidrografica?: string | null;
  cursoDagua?: string | null;
  latitudeDecimal?: number | null;
  longitudeDecimal?: number | null;
  latitude?: number | null;
  longitude?: number | null;
  latitudeGms?: string | null;
  longitudeGms?: string | null;
  datum?: string | null;
  coordenadas?: {
    latitude?: number | null;
    longitude?: number | null;
    datum?: string | null;
  } | null;
  cotaCoroamentoMetros?: number | null;
  anoInicioObra?: number | null;
  anoFinalObra?: number | null;
  tipoMaterial?: string | null;
  usoPrincipal?: string | null;
  usosSecundarios?: string[] | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface AdministraV2BarragensPageResponse {
  success: true;
  apiVersion: string;
  items: AdministraBarragemV2Dto[];
  pagination: {
    limit: number;
    hasMore: boolean;
    nextCursor: string | null;
  };
  maskingPolicy: string | Record<string, unknown>;
}

export interface AdministraServerDeps {
  getSupabaseAdmin?: () => SupabaseClient | null;
  getS2sConfig?: () => AdministraS2sConfig | null;
  fetchImpl?: typeof fetch;
  nowSeconds?: () => number;
  randomUuid?: () => string;
  timeoutMs?: number;
  maxPages?: number;
}

interface ResolvedActor {
  userId: string;
  email: string;
  nome: string;
  perfil: 'administrador' | 'analista' | 'visualizador';
}

function isPlaceholderValue(val: string): boolean {
  const lower = val.toLowerCase();
  return (
    !val ||
    lower.includes('cole_aqui') ||
    lower.includes('your-project') ||
    lower.includes('seu-projeto') ||
    lower.includes('sua_chave') ||
    lower.includes('sua-url') ||
    lower.includes('seu_token') ||
    lower.includes('meu_token') ||
    lower.includes('my_key') ||
    lower.includes('example')
  );
}

function isPlainRecord(val: unknown): val is Record<string, unknown> {
  if (!val || typeof val !== 'object' || Array.isArray(val)) return false;
  const proto = Object.getPrototypeOf(val);
  return proto === Object.prototype || proto === null;
}

function normalizePem(rawPem: string): string {
  return rawPem.replace(/\\n/g, '\n').trim();
}

function parseEd25519PrivateKey(pem: string): crypto.KeyObject | null {
  try {
    const normalized = normalizePem(pem);
    if (!normalized || !normalized.includes('BEGIN')) return null;
    const keyObj = crypto.createPrivateKey(normalized);
    if (keyObj.asymmetricKeyType !== 'ed25519') {
      return null;
    }
    return keyObj;
  } catch {
    return null;
  }
}

export function getDefaultAdministraS2sConfig(): AdministraS2sConfig | null {
  const rawUrl = (process.env.ADMINISTRA_API_URL || '').trim();
  const keyId = (process.env.FISCALIZA_S2S_KEY_ID || '').trim();
  const rawPem = (process.env.FISCALIZA_S2S_PRIVATE_KEY_PEM || '').trim();

  if (
    !rawUrl ||
    isPlaceholderValue(rawUrl) ||
    !keyId ||
    isPlaceholderValue(keyId) ||
    !rawPem ||
    isPlaceholderValue(rawPem)
  ) {
    return null;
  }

  let normalizedUrl: string;
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return null;
    }
    normalizedUrl = rawUrl.replace(/\/+$/, '');
  } catch {
    return null;
  }

  const normalizedPem = normalizePem(rawPem);
  if (!parseEd25519PrivateKey(normalizedPem)) {
    return null;
  }

  return {
    apiUrl: normalizedUrl,
    keyId,
    privateKeyPem: normalizedPem
  };
}

export function encodeRfc3986(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    ch => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`
  );
}

function compareStringsCodeUnit(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

export function canonicalizeQueryParams(
  params?:
    | Array<[string, string]>
    | Record<string, string | number | boolean | null | undefined>
    | URLSearchParams
): string {
  if (!params) return '';

  const pairs: Array<[string, string]> = [];

  if (params instanceof URLSearchParams) {
    for (const [k, v] of params.entries()) {
      pairs.push([k, v]);
    }
  } else if (Array.isArray(params)) {
    for (const [k, v] of params) {
      pairs.push([String(k), String(v)]);
    }
  } else {
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined || v === null) continue;
      pairs.push([k, String(v)]);
    }
  }

  if (pairs.length === 0) return '';

  pairs.sort((a, b) => {
    const byKey = compareStringsCodeUnit(a[0], b[0]);
    if (byKey !== 0) return byKey;
    return compareStringsCodeUnit(a[1], b[1]);
  });

  return pairs.map(([k, v]) => `${encodeRfc3986(k)}=${encodeRfc3986(v)}`).join('&');
}

export function buildS2sV2CanonicalMessage(params: {
  method: string;
  path: string;
  query?: string;
  contentType?: string;
  bodySha256: string;
  keyId: string;
  timestamp: string;
  jti: string;
  consumerUser?: string;
  consumerRole?: string;
}): string {
  const upperMethod = params.method.toUpperCase();
  const normalizedContentType =
    upperMethod === 'GET' ? '' : (params.contentType || '').trim().toLowerCase();

  const lines = [
    'S2S-V2',
    upperMethod,
    params.path,
    params.query ?? '',
    normalizedContentType,
    params.bodySha256.toLowerCase(),
    params.keyId,
    params.timestamp,
    params.jti,
    `${params.consumerUser ?? ''}|${params.consumerRole ?? ''}`
  ];

  return lines.join('\n');
}

export function signS2sV2GetRequest(params: {
  config: AdministraS2sConfig;
  endpoint: typeof ADMINISTRA_V2_ENDPOINTS.HEALTH | typeof ADMINISTRA_V2_ENDPOINTS.BARRAGENS;
  queryParams?: Record<string, string | number | undefined | null>;
  nowSeconds?: () => number;
  randomUuid?: () => string;
}): {
  url: string;
  canonicalMessage: string;
  headers: Record<string, string>;
} {
  if (
    params.endpoint !== ADMINISTRA_V2_ENDPOINTS.HEALTH &&
    params.endpoint !== ADMINISTRA_V2_ENDPOINTS.BARRAGENS
  ) {
    throw new Error(`Endpoint não permitido na integração Administra V2: ${params.endpoint}`);
  }

  const privateKey = parseEd25519PrivateKey(params.config.privateKeyPem);
  if (!privateKey) {
    throw new Error('Chave privada Ed25519 S2S inválida.');
  }

  const safeQueryEntries: Record<string, string | number | undefined | null> = {};
  if (params.queryParams) {
    for (const [k, v] of Object.entries(params.queryParams)) {
      if (k === 'q') continue;
      if (v !== undefined && v !== null && String(v) !== '') {
        safeQueryEntries[k] = v;
      }
    }
  }

  const canonicalQuery = canonicalizeQueryParams(safeQueryEntries);
  const baseUrl = new URL(params.config.apiUrl);
  const basePath = baseUrl.pathname.replace(/\/+$/, '');
  const fullPath = `${basePath}${params.endpoint}`;
  const fullUrl = `${baseUrl.origin}${fullPath}${canonicalQuery ? `?${canonicalQuery}` : ''}`;

  const timestamp = String(
    Math.floor(params.nowSeconds ? params.nowSeconds() : Date.now() / 1000)
  );
  const jti = params.randomUuid ? params.randomUuid() : crypto.randomUUID();
  const bodySha256 = EMPTY_BODY_SHA256;

  const canonicalMessage = buildS2sV2CanonicalMessage({
    method: 'GET',
    path: fullPath,
    query: canonicalQuery,
    contentType: '',
    bodySha256,
    keyId: params.config.keyId,
    timestamp,
    jti
  });

  const signature = crypto
    .sign(null, Buffer.from(canonicalMessage, 'utf8'), privateKey)
    .toString('base64url');

  const headers: Record<string, string> = {
    Accept: 'application/json',
    'x-s2s-key-id': params.config.keyId,
    'x-s2s-timestamp': timestamp,
    'x-s2s-jti': jti,
    'x-s2s-body-sha256': bodySha256,
    'x-s2s-signature': signature
  };

  return {
    url: fullUrl,
    canonicalMessage,
    headers
  };
}

interface UpstreamResult {
  ok: boolean;
  status: number;
  data?: unknown;
  errorBody?: unknown;
  code?: string;
  error?: string;
  timeout?: boolean;
  networkError?: boolean;
  latencyMs: number;
}

async function callAdministraV2SignedGet(params: {
  fetchFn: typeof fetch;
  config: AdministraS2sConfig;
  endpoint: typeof ADMINISTRA_V2_ENDPOINTS.HEALTH | typeof ADMINISTRA_V2_ENDPOINTS.BARRAGENS;
  queryParams?: Record<string, string | number | undefined | null>;
  nowSeconds?: () => number;
  randomUuid?: () => string;
  timeoutMs?: number;
}): Promise<UpstreamResult> {
  const started = Date.now();
  const signed = signS2sV2GetRequest({
    config: params.config,
    endpoint: params.endpoint,
    queryParams: params.queryParams,
    nowSeconds: params.nowSeconds,
    randomUuid: params.randomUuid
  });

  const timeoutMs = params.timeoutMs ?? ADMINISTRA_V2_DEFAULT_TIMEOUT_MS;
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  if (controller) {
    timer = setTimeout(() => {
      controller.abort(new Error('ADMINISTRA_TIMEOUT'));
    }, timeoutMs);
  }

  try {
    const res = await params.fetchFn(signed.url, {
      method: 'GET',
      headers: signed.headers,
      signal: controller ? controller.signal : undefined
    });

    const text = await res.text();
    let parsed: unknown = null;
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        return {
          ok: false,
          status: res.ok ? 502 : res.status,
          code: 'INVALID_UPSTREAM_RESPONSE',
          error: 'Resposta não-JSON recebida da API 2.0 do Administra.',
          latencyMs: Date.now() - started
        };
      }
    }

    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        errorBody: parsed,
        latencyMs: Date.now() - started
      };
    }

    return {
      ok: true,
      status: res.status,
      data: parsed,
      latencyMs: Date.now() - started
    };
  } catch (err: any) {
    const isAbort =
      err?.name === 'AbortError' ||
      err?.name === 'TimeoutError' ||
      String(err?.message || '').includes('ADMINISTRA_TIMEOUT') ||
      String(err?.cause?.message || '').includes('ADMINISTRA_TIMEOUT');
    if (isAbort) {
      return {
        ok: false,
        status: 504,
        timeout: true,
        code: 'ADMINISTRA_TIMEOUT',
        error: 'Tempo limite excedido na comunicação com a API 2.0 do Administra.',
        latencyMs: Date.now() - started
      };
    }
    return {
      ok: false,
      status: 503,
      networkError: true,
      code: 'ADMINISTRA_UNAVAILABLE',
      error: 'Falha de comunicação com a API 2.0 do Administra.',
      latencyMs: Date.now() - started
    };
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

function isOptionalString(val: unknown): boolean {
  return val === undefined || val === null || typeof val === 'string';
}

function isOptionalFiniteNumber(val: unknown): boolean {
  return val === undefined || val === null || (typeof val === 'number' && Number.isFinite(val));
}

function toOptString(val: unknown): string | null {
  if (val === undefined || val === null) return null;
  const trimmed = String(val).trim();
  return trimmed === '' ? null : trimmed;
}

function toOptNumber(val: unknown): number | null {
  if (val === undefined || val === null) return null;
  return typeof val === 'number' && Number.isFinite(val) ? val : null;
}

export function validateV2HealthResponse(
  data: unknown
): { valid: true; apiVersion: string } | { valid: false; error: string } {
  if (!isPlainRecord(data)) {
    return { valid: false, error: 'Resposta inválida de health da API 2.0 do Administra.' };
  }
  if (data.success !== true) {
    return { valid: false, error: 'Health da API 2.0 não confirmou success=true.' };
  }
  if (typeof data.apiVersion !== 'string' || !data.apiVersion.trim().startsWith('2')) {
    return { valid: false, error: 'Versão apiVersion incompatível na resposta de health.' };
  }
  return { valid: true, apiVersion: data.apiVersion.trim() };
}

function validateAndSanitizeBarragemDto(
  raw: unknown
): { valid: true; dto: AdministraBarragemV2Dto } | { valid: false; error: string } {
  if (!isPlainRecord(raw)) {
    return { valid: false, error: 'Item de barragem inválido no DTO.' };
  }

  if (typeof raw.id !== 'string' || !raw.id.trim()) {
    return { valid: false, error: 'Campo obrigatório "id" ausente ou inválido no DTO de barragem.' };
  }
  if (typeof raw.nome !== 'string' || !raw.nome.trim()) {
    return { valid: false, error: 'Campo obrigatório "nome" ausente ou inválido no DTO de barragem.' };
  }

  const optionalStringFields = [
    'administraId',
    'sistemaOrigem',
    'empreendedorId',
    'empreendedorNome',
    'municipio',
    'uf',
    'baciaHidrografica',
    'cursoDagua',
    'latitudeGms',
    'longitudeGms',
    'datum',
    'tipoMaterial',
    'usoPrincipal',
    'createdAt',
    'updatedAt'
  ];

  for (const field of optionalStringFields) {
    if (!isOptionalString(raw[field])) {
      return { valid: false, error: `Campo camelCase "${field}" com tipo inválido no DTO.` };
    }
  }

  const optionalNumberFields = [
    'latitudeDecimal',
    'longitudeDecimal',
    'latitude',
    'longitude',
    'cotaCoroamentoMetros',
    'anoInicioObra',
    'anoFinalObra'
  ];

  for (const field of optionalNumberFields) {
    if (!isOptionalFiniteNumber(raw[field])) {
      return { valid: false, error: `Campo numérico "${field}" com tipo inválido no DTO.` };
    }
  }

  if (raw.usosSecundarios !== undefined && raw.usosSecundarios !== null) {
    if (!Array.isArray(raw.usosSecundarios) || raw.usosSecundarios.some(u => typeof u !== 'string')) {
      return { valid: false, error: 'Campo "usosSecundarios" com tipo inválido no DTO.' };
    }
  }

  let normalizedCoords: AdministraBarragemV2Dto['coordenadas'] = null;
  if (raw.coordenadas !== undefined && raw.coordenadas !== null) {
    if (!isPlainRecord(raw.coordenadas)) {
      return { valid: false, error: 'Campo "coordenadas" com formato inválido no DTO.' };
    }
    if (
      !isOptionalFiniteNumber(raw.coordenadas.latitude) ||
      !isOptionalFiniteNumber(raw.coordenadas.longitude) ||
      !isOptionalString(raw.coordenadas.datum)
    ) {
      return { valid: false, error: 'Subcampos de "coordenadas" com formato inválido no DTO.' };
    }
    normalizedCoords = {
      latitude: toOptNumber(raw.coordenadas.latitude),
      longitude: toOptNumber(raw.coordenadas.longitude),
      datum: toOptString(raw.coordenadas.datum)
    };
  }

  const dto: AdministraBarragemV2Dto = {
    id: raw.id.trim(),
    administraId: toOptString(raw.administraId) ?? raw.id.trim(),
    sistemaOrigem: toOptString(raw.sistemaOrigem) ?? 'administra',
    empreendedorId: toOptString(raw.empreendedorId),
    nome: raw.nome.trim(),
    municipio: toOptString(raw.municipio),
    uf: toOptString(raw.uf),
    baciaHidrografica: toOptString(raw.baciaHidrografica),
    cursoDagua: toOptString(raw.cursoDagua),
    latitudeDecimal: toOptNumber(raw.latitudeDecimal),
    longitudeDecimal: toOptNumber(raw.longitudeDecimal),
    latitude: toOptNumber(raw.latitude),
    longitude: toOptNumber(raw.longitude),
    latitudeGms: toOptString(raw.latitudeGms),
    longitudeGms: toOptString(raw.longitudeGms),
    datum: toOptString(raw.datum),
    coordenadas: normalizedCoords,
    cotaCoroamentoMetros: toOptNumber(raw.cotaCoroamentoMetros),
    anoInicioObra: toOptNumber(raw.anoInicioObra),
    anoFinalObra: toOptNumber(raw.anoFinalObra),
    tipoMaterial: toOptString(raw.tipoMaterial),
    usoPrincipal: toOptString(raw.usoPrincipal),
    usosSecundarios: Array.isArray(raw.usosSecundarios)
      ? raw.usosSecundarios.map(s => String(s).trim()).filter(Boolean)
      : [],
    createdAt: toOptString(raw.createdAt),
    updatedAt: toOptString(raw.updatedAt)
  };

  return { valid: true, dto };
}

export function validateV2BarragensPageResponse(
  data: unknown
): { valid: true; page: AdministraV2BarragensPageResponse } | { valid: false; error: string } {
  if (!isPlainRecord(data)) {
    return { valid: false, error: 'Envelope de resposta inválido da API 2.0.' };
  }
  if (data.success !== true) {
    return { valid: false, error: 'Resposta da API 2.0 não confirmou success=true.' };
  }
  if (typeof data.apiVersion !== 'string' || !data.apiVersion.trim().startsWith('2')) {
    return { valid: false, error: 'Versão apiVersion ausente ou incompatível na resposta.' };
  }
  if (!Array.isArray(data.items)) {
    return { valid: false, error: 'Lista "items" ausente ou inválida na resposta.' };
  }
  if (!isPlainRecord(data.pagination)) {
    return { valid: false, error: 'Objeto "pagination" ausente ou inválido na resposta.' };
  }
  const { limit, hasMore, nextCursor } = data.pagination;
  if (typeof limit !== 'number' || !Number.isFinite(limit) || limit <= 0) {
    return { valid: false, error: 'Campo "pagination.limit" inválido na resposta.' };
  }
  if (typeof hasMore !== 'boolean') {
    return { valid: false, error: 'Campo "pagination.hasMore" inválido na resposta.' };
  }
  if (nextCursor !== null && typeof nextCursor !== 'string') {
    return { valid: false, error: 'Campo "pagination.nextCursor" inválido na resposta.' };
  }
  if (hasMore && (typeof nextCursor !== 'string' || !nextCursor.trim())) {
    return { valid: false, error: 'Paginação inválida: hasMore=true sem nextCursor válido.' };
  }

  const hasValidMaskingPolicy =
    data.maskingPolicy !== undefined &&
    data.maskingPolicy !== null &&
    (typeof data.maskingPolicy === 'string'
      ? data.maskingPolicy.trim().length > 0
      : isPlainRecord(data.maskingPolicy));

  if (!hasValidMaskingPolicy) {
    return { valid: false, error: 'Campo "maskingPolicy" ausente ou inválido na resposta.' };
  }

  const sanitizedItems: AdministraBarragemV2Dto[] = [];
  for (const rawItem of data.items) {
    const check = validateAndSanitizeBarragemDto(rawItem);
    if (!check.valid) {
      return { valid: false, error: check.error };
    }
    sanitizedItems.push(check.dto);
  }

  return {
    valid: true,
    page: {
      success: true,
      apiVersion: data.apiVersion.trim(),
      items: sanitizedItems,
      pagination: {
        limit,
        hasMore,
        nextCursor: nextCursor ? nextCursor.trim() : null
      },
      maskingPolicy: data.maskingPolicy as string | Record<string, unknown>
    }
  };
}

export async function fetchAllAdministraBarragensV2(params: {
  fetchFn: typeof fetch;
  config: AdministraS2sConfig;
  nowSeconds?: () => number;
  randomUuid?: () => string;
  timeoutMs?: number;
  maxPages?: number;
}): Promise<
  | {
      ok: true;
      items: AdministraBarragemV2Dto[];
      pagesFetched: number;
      apiVersion: string;
      maskingPolicy: string | Record<string, unknown> | null;
    }
  | {
      ok: false;
      status: number;
      code: string;
      error: string;
      timeout?: boolean;
      networkError?: boolean;
      upstreamStatus?: number;
    }
> {
  const maxPages = params.maxPages ?? ADMINISTRA_V2_DEFAULT_MAX_PAGES;
  const allItems: AdministraBarragemV2Dto[] = [];
  const seenCursors = new Set<string>();
  let currentCursor: string | null = null;
  let pagesFetched = 0;
  let apiVersion = '2.0';
  let lastMaskingPolicy: string | Record<string, unknown> | null = null;

  while (true) {
    pagesFetched += 1;
    if (pagesFetched > maxPages) {
      return {
        ok: false,
        status: 502,
        code: 'PAGINATION_LIMIT_EXCEEDED',
        error: 'Limite máximo de páginas excedido ao consultar barragens na API 2.0 do Administra.'
      };
    }

    const queryParams: Record<string, string | number> = {
      limit: ADMINISTRA_V2_PAGE_LIMIT
    };
    if (currentCursor) {
      queryParams.cursor = currentCursor;
    }

    const res = await callAdministraV2SignedGet({
      fetchFn: params.fetchFn,
      config: params.config,
      endpoint: ADMINISTRA_V2_ENDPOINTS.BARRAGENS,
      queryParams,
      nowSeconds: params.nowSeconds,
      randomUuid: params.randomUuid,
      timeoutMs: params.timeoutMs
    });

    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        code: res.code || 'UPSTREAM_ERROR',
        error: res.error || 'Erro ao consultar barragens na API 2.0 do Administra.',
        timeout: res.timeout,
        networkError: res.networkError,
        upstreamStatus: res.status
      };
    }

    const validated = validateV2BarragensPageResponse(res.data);
    if (!validated.valid) {
      return {
        ok: false,
        status: 502,
        code: 'INVALID_UPSTREAM_RESPONSE',
        error: validated.error
      };
    }

    apiVersion = validated.page.apiVersion;
    lastMaskingPolicy = validated.page.maskingPolicy;
    allItems.push(...validated.page.items);

    if (!validated.page.pagination.hasMore) {
      break;
    }

    const nextCursor = validated.page.pagination.nextCursor!.trim();
    if (nextCursor === currentCursor || seenCursors.has(nextCursor)) {
      return {
        ok: false,
        status: 502,
        code: 'REPEATED_CURSOR',
        error: 'Cursor de paginação repetido detectado na resposta da API 2.0 do Administra.'
      };
    }
    seenCursors.add(nextCursor);
    currentCursor = nextCursor;
  }

  return {
    ok: true,
    items: allItems,
    pagesFetched,
    apiVersion,
    maskingPolicy: lastMaskingPolicy
  };
}

function mapAdministraV2UpstreamFailure(failure: {
  status: number;
  code?: string;
  error?: string;
  timeout?: boolean;
  networkError?: boolean;
  upstreamStatus?: number;
}): { status: number; payload: Record<string, unknown> } {
  if (failure.timeout || failure.status === 504) {
    return {
      status: 504,
      payload: {
        error: 'Tempo limite excedido ao consultar a API 2.0 do Administra.',
        code: 'ADMINISTRA_TIMEOUT'
      }
    };
  }

  if (failure.networkError) {
    return {
      status: 503,
      payload: {
        error: 'API 2.0 do Administra temporariamente indisponível.',
        code: 'ADMINISTRA_UNAVAILABLE'
      }
    };
  }

  const upstreamStatus = failure.upstreamStatus ?? failure.status;
  if (upstreamStatus === 401 || upstreamStatus === 403) {
    return {
      status: 502,
      payload: {
        error: 'Falha de autenticação S2S com a API 2.0 do Administra.',
        code: 'S2S_AUTH_REJECTED',
        upstreamStatus
      }
    };
  }

  if (upstreamStatus === 409) {
    return {
      status: 409,
      payload: {
        error: 'Conflito ou pré-condição S2S não atendida na API 2.0 do Administra.',
        code: 'ADMINISTRA_CONFLICT',
        upstreamStatus: 409
      }
    };
  }

  if (
    failure.code === 'INVALID_UPSTREAM_RESPONSE' ||
    failure.code === 'REPEATED_CURSOR' ||
    failure.code === 'PAGINATION_LIMIT_EXCEEDED'
  ) {
    return {
      status: 502,
      payload: {
        error: failure.error || 'Resposta inválida recebida da API 2.0 do Administra.',
        code: failure.code
      }
    };
  }

  return {
    status: 502,
    payload: {
      error: 'Resposta inesperada da API 2.0 do Administra.',
      code: 'ADMINISTRA_UPSTREAM_ERROR',
      upstreamStatus
    }
  };
}

function extractBearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header || typeof header !== 'string') return null;
  const match = header.match(/^Bearer\s+(\S+)$/i);
  if (!match || !match[1]) return null;
  return match[1].trim();
}

async function findPerfilByEmail(
  supabaseAdmin: SupabaseClient,
  email: string
): Promise<{ id?: string; email?: string; nome?: string; perfil?: string; status?: string } | null> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return null;

  const { data: exactRow, error: exactErr } = await supabaseAdmin
    .from('perfis_usuarios')
    .select('id, email, nome, perfil, status')
    .eq('email', normalized)
    .maybeSingle();

  if (!exactErr && exactRow) return exactRow;

  const queryBuilder: any = supabaseAdmin
    .from('perfis_usuarios')
    .select('id, email, nome, perfil, status');

  if (typeof queryBuilder.ilike === 'function') {
    const { data: ilikeRow, error: ilikeErr } = await queryBuilder
      .ilike('email', normalized)
      .maybeSingle();
    if (!ilikeErr && ilikeRow) return ilikeRow;
  }

  return null;
}

async function resolveServerActor(
  req: Request,
  supabaseAdmin: SupabaseClient
): Promise<{ status: number; error?: string; actor?: ResolvedActor }> {
  const token = extractBearerToken(req);
  if (!token) {
    return { status: 401, error: 'Token de sessão ausente ou inválido.' };
  }

  const { data: authData, error: authErr } = await supabaseAdmin.auth.getUser(token);
  const authUser = authData?.user;
  if (authErr || !authUser?.id || !authUser.email || !UUID_REGEX.test(authUser.id)) {
    return { status: 401, error: 'Sessão inválida ou expirada.' };
  }

  const normalizedEmail = authUser.email.trim().toLowerCase();
  const profileRow = await findPerfilByEmail(supabaseAdmin, normalizedEmail);

  if (!profileRow) {
    return { status: 403, error: 'Perfil institucional não encontrado para esta sessão.' };
  }

  const status = String(profileRow.status || '').trim().toLowerCase();
  if (status !== 'ativo') {
    return { status: 403, error: 'Perfil de usuário inativo ou aguardando aprovação.' };
  }

  const rawRole = String(profileRow.perfil || '').trim().toLowerCase();
  if (rawRole !== 'administrador' && rawRole !== 'analista' && rawRole !== 'visualizador') {
    return { status: 403, error: 'Perfil de acesso inválido ou não autorizado.' };
  }

  return {
    status: 200,
    actor: {
      userId: authUser.id,
      email: normalizedEmail,
      nome: String(profileRow.nome || 'Usuário CSB').trim() || 'Usuário CSB',
      perfil: rawRole
    }
  };
}

export function createAdministraRouter(deps: AdministraServerDeps = {}): express.Router {
  const router = express.Router();
  const resolveSupabaseAdmin = deps.getSupabaseAdmin || createFiscalizaServiceRoleClient;
  const resolveS2sConfig = deps.getS2sConfig || getDefaultAdministraS2sConfig;

  router.use(async (req: Request, res: Response, next: NextFunction) => {
    if (req.method !== 'GET') {
      res.status(405).json({ error: 'Operação não permitida: integração Administra 2.0 é somente leitura.' });
      return;
    }

    const supabaseAdmin = resolveSupabaseAdmin();
    if (!supabaseAdmin) {
      res.status(503).json({
        error: 'Serviço de autenticação institucional do Fiscaliza não configurado no servidor.',
        code: 'SERVICE_UNAVAILABLE'
      });
      return;
    }

    const authRes = await resolveServerActor(req, supabaseAdmin);
    if (!authRes.actor) {
      res.status(authRes.status).json({ error: authRes.error || 'Não autorizado.' });
      return;
    }

    res.locals.actor = authRes.actor;
    next();
  });

  // GET /api/administra/health
  router.get('/health', async (_req: Request, res: Response) => {
    try {
      const config = resolveS2sConfig();
      if (!config) {
        res.status(200).json({
          configured: false,
          reachable: false,
          mode: 'local',
          apiVersion: '2.0',
          latencyMs: null,
          statusText: 'Integração S2S Administra 2.0 não configurada no servidor (modo local ativo).'
        });
        return;
      }

      const fetchFn = deps.fetchImpl || globalThis.fetch;
      if (typeof fetchFn !== 'function') {
        res.status(503).json({
          configured: true,
          reachable: false,
          mode: 's2s_v2',
          code: 'ADMINISTRA_UNAVAILABLE',
          error: 'Cliente HTTP indisponível no servidor.'
        });
        return;
      }

      const healthRes = await callAdministraV2SignedGet({
        fetchFn,
        config,
        endpoint: ADMINISTRA_V2_ENDPOINTS.HEALTH,
        nowSeconds: deps.nowSeconds,
        randomUuid: deps.randomUuid,
        timeoutMs: deps.timeoutMs
      });

      if (!healthRes.ok) {
        const mapped = mapAdministraV2UpstreamFailure(healthRes);
        res.status(mapped.status).json({
          configured: true,
          reachable: false,
          mode: 's2s_v2',
          ...mapped.payload
        });
        return;
      }

      const validated = validateV2HealthResponse(healthRes.data);
      if (!validated.valid) {
        res.status(502).json({
          configured: true,
          reachable: false,
          mode: 's2s_v2',
          code: 'INVALID_UPSTREAM_RESPONSE',
          error: validated.error
        });
        return;
      }

      res.status(200).json({
        configured: true,
        reachable: true,
        mode: 's2s_v2',
        apiVersion: validated.apiVersion,
        latencyMs: healthRes.latencyMs,
        statusText: 'Conectado à API 2.0 S2S do Administra'
      });
    } catch {
      res.status(500).json({ error: 'Erro interno ao verificar saúde da API 2.0 do Administra.' });
    }
  });

  // GET /api/administra/barragens
  router.get('/barragens', async (_req: Request, res: Response) => {
    try {
      const config = resolveS2sConfig();
      if (!config) {
        res.status(200).json({
          configured: false,
          mode: 'local',
          apiVersion: '2.0',
          items: [],
          pagination: {
            limit: ADMINISTRA_V2_PAGE_LIMIT,
            hasMore: false,
            nextCursor: null
          },
          maskingPolicy: null
        });
        return;
      }

      const fetchFn = deps.fetchImpl || globalThis.fetch;
      if (typeof fetchFn !== 'function') {
        res.status(503).json({
          code: 'ADMINISTRA_UNAVAILABLE',
          error: 'Cliente HTTP indisponível no servidor.'
        });
        return;
      }

      const result = await fetchAllAdministraBarragensV2({
        fetchFn,
        config,
        nowSeconds: deps.nowSeconds,
        randomUuid: deps.randomUuid,
        timeoutMs: deps.timeoutMs,
        maxPages: deps.maxPages
      });

      if (!result.ok) {
        const mapped = mapAdministraV2UpstreamFailure(result);
        res.status(mapped.status).json(mapped.payload);
        return;
      }

      res.status(200).json({
        configured: true,
        mode: 's2s_v2',
        apiVersion: result.apiVersion,
        items: result.items,
        pagesFetched: result.pagesFetched,
        maskingPolicy: result.maskingPolicy
      });
    } catch {
      res.status(500).json({ error: 'Erro interno ao consultar barragens na API 2.0 do Administra.' });
    }
  });

  return router;
}
