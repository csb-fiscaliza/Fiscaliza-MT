import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  PENDENCIA_SITUACOES,
  type PendenciaHistoricoRecord,
  type PendenciaRecord,
  type PendenciaSituacao,
  type PendenciaUsuarioResumo,
  type PendenciasActorSummary,
  type PendenciasTab
} from '../types/pendencias.ts';

export const SISTEMA_ORIGEM_FISCALIZA = 'fiscaliza' as const;

export const PENDENCIA_WRITE_BLOCK_REASON =
  'Operação de escrita bloqueada (HTTP 409): não há mecanismo transacional confirmado no banco de dados para gravar public.pendencias e public.pendencias_historico de forma atômica. Módulo operando em modo somente leitura.';

const SAFE_PROTECTED_DOC_LABEL = '[documento protegido]';
const SAFE_PROTECTED_EMAIL_LABEL = '[e-mail protegido]';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UUID_GLOBAL_REGEX = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
const DOC_SEP_SRC = '(?:[ \\t]*[.\\-/][ \\t]*|[ \\t]+)';
const CPF_GROUPED_SRC = `(?<!\\d)(?:\\d{3}${DOC_SEP_SRC}\\d{3}${DOC_SEP_SRC}\\d{3}${DOC_SEP_SRC}\\d{2}|\\d{3}${DOC_SEP_SRC}\\d{6}${DOC_SEP_SRC}\\d{2}|\\d{6}${DOC_SEP_SRC}\\d{3}${DOC_SEP_SRC}\\d{2}|\\d{9}${DOC_SEP_SRC}\\d{2})(?!\\d)`;
const CNPJ_GROUPED_SRC = `(?<!\\d)(?:\\d{2}${DOC_SEP_SRC}\\d{3}${DOC_SEP_SRC}\\d{3}${DOC_SEP_SRC}\\d{4}${DOC_SEP_SRC}\\d{2}|\\d{2}${DOC_SEP_SRC}\\d{6}${DOC_SEP_SRC}\\d{4}${DOC_SEP_SRC}\\d{2}|\\d{5}${DOC_SEP_SRC}\\d{3}${DOC_SEP_SRC}\\d{4}${DOC_SEP_SRC}\\d{2}|\\d{8}${DOC_SEP_SRC}\\d{4}${DOC_SEP_SRC}\\d{2})(?!\\d)`;
const CPF_GROUPED_TEST = new RegExp(CPF_GROUPED_SRC);
const CNPJ_GROUPED_TEST = new RegExp(CNPJ_GROUPED_SRC);
const CPF_GROUPED_GLOBAL = new RegExp(CPF_GROUPED_SRC, 'g');
const CNPJ_GROUPED_GLOBAL = new RegExp(CNPJ_GROUPED_SRC, 'g');
const LABELED_OPT_SEP_SRC = '(?:[ \\t]*[.\\-/][ \\t]*|[ \\t]+)?';
const LABELED_CNPJ_SRC = `\\b(cnpj)(\\s*[:=\\-\\/]?\\s*)(\\d(?:${LABELED_OPT_SEP_SRC}\\d){13})(?!\\d)`;
const LABELED_CPF_SRC = `\\b(cpf)(\\s*[:=\\-\\/]?\\s*)(\\d(?:${LABELED_OPT_SEP_SRC}\\d){10})(?!\\d)`;
const LABELED_SWAP_DOC_SRC = `\\b(cpf|cnpj)(\\s*[:=\\-\\/]?\\s*)(\\d(?:${LABELED_OPT_SEP_SRC}\\d){13}|\\d(?:${LABELED_OPT_SEP_SRC}\\d){10})(?!\\d)`;
const LABELED_CNPJ_TEST = new RegExp(LABELED_CNPJ_SRC, 'i');
const LABELED_CPF_TEST = new RegExp(LABELED_CPF_SRC, 'i');
const LABELED_SWAP_DOC_TEST = new RegExp(LABELED_SWAP_DOC_SRC, 'i');
const LABELED_CNPJ_GLOBAL = new RegExp(LABELED_CNPJ_SRC, 'gi');
const LABELED_CPF_GLOBAL = new RegExp(LABELED_CPF_SRC, 'gi');
const LABELED_SWAP_DOC_GLOBAL = new RegExp(LABELED_SWAP_DOC_SRC, 'gi');
const RAW_CNPJ_TEST = /(?<![A-Za-z0-9_-])\d{14}(?![A-Za-z0-9_-])/;
const RAW_CPF_TEST = /(?<![A-Za-z0-9_-])\d{11}(?![A-Za-z0-9_-])/;
const RAW_CNPJ_GLOBAL = /(?<![A-Za-z0-9_-])(\d{14})(?![A-Za-z0-9_-])/g;
const RAW_CPF_GLOBAL = /(?<![A-Za-z0-9_-])(\d{11})(?![A-Za-z0-9_-])/g;

const PENDENCIA_SELECT_COLUMNS =
  'id, origem, origem_ref_id, tipo, titulo, descricao, situacao, responsavel_id, direcionado_por, direcionado_em, criado_por, tipo_referencia, referencia_id, empreendedor_id, barragem_id, resolvido_por, resolvido_em, created_at, updated_at';

const HISTORICO_SELECT_COLUMNS =
  'id, pendencia_id, acao, campo, valor_anterior, valor_novo, usuario_id, motivo, created_at';

const ID_FIELDS = new Set<string>([
  'id',
  'pendencia_id',
  'origem_ref_id',
  'referencia_id',
  'empreendedor_id',
  'barragem_id',
  'responsavel_id',
  'direcionado_por',
  'criado_por',
  'resolvido_por',
  'usuario_id'
]);

const TEXT_REFERENCE_ID_FIELDS = new Set<string>([
  'origem_ref_id',
  'referencia_id',
  'empreendedor_id',
  'barragem_id'
]);

const FORBIDDEN_SPOOF_OR_PERSONAL_KEYS = new Set<string>([
  'id',
  'criado_por',
  'criadoPor',
  'direcionado_por',
  'direcionadoPor',
  'direcionado_em',
  'direcionadoEm',
  'resolvido_por',
  'resolvidoPor',
  'resolvido_em',
  'resolvidoEm',
  'usuario_id',
  'usuarioId',
  'user_id',
  'userId',
  'actor_id',
  'actorId',
  'perfil',
  'role',
  'isAdmin',
  'is_admin',
  'permissoes',
  'permissions',
  'canMutate',
  'origem',
  'origem_sistema',
  'sistema_origem',
  'created_at',
  'updated_at',
  'cpf',
  'cnpj',
  'cpf_cnpj',
  'cpfCnpj',
  'email',
  'telefone',
  'endereco',
  'documentos_pessoais',
  'payload',
  'vistoria_payload',
  'dados',
  'dados_rascunho_locais',
  'historico',
  '__proto__',
  'constructor',
  'prototype'
]);

const CREATE_ALLOWED_KEYS = new Set<string>([
  'titulo',
  'tipo',
  'descricao',
  'responsavel_id',
  'tipo_referencia',
  'referencia_id',
  'origem_ref_id',
  'empreendedor_id',
  'barragem_id',
  'motivo'
]);

const EDIT_ALLOWED_KEYS = new Set<string>([
  'titulo',
  'tipo',
  'descricao',
  'tipo_referencia',
  'referencia_id',
  'origem_ref_id',
  'empreendedor_id',
  'barragem_id',
  'motivo'
]);

const DIRECIONAR_ALLOWED_KEYS = new Set<string>(['responsavel_id', 'motivo']);

const SITUACAO_ALLOWED_KEYS = new Set<string>(['situacao', 'motivo']);

export interface ServerActor {
  userId: string;
  email: string;
  fullName: string;
  role: 'administrador' | 'analista' | 'visualizador';
  isAdmin: boolean;
  canRead: boolean;
  canMutate: boolean;
}

export interface PendenciasServerDeps {
  getSupabaseAdmin?: () => SupabaseClient | null;
}

function isPlaceholderValue(val: string): boolean {
  const lower = val.toLowerCase();
  return (
    !val ||
    lower.includes('cole_aqui') ||
    lower.includes('your-project') ||
    lower.includes('seu-projeto') ||
    lower.includes('sua_chave') ||
    lower.includes('sua-url')
  );
}

function decodeJwtRole(token: string): string | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64.padEnd(b64.length + ((4 - (b64.length % 4)) % 4), '=');
    const decoded = JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
    return typeof decoded?.role === 'string' ? decoded.role.toLowerCase() : null;
  } catch {
    return null;
  }
}

export function isValidServiceRoleKey(key: string): boolean {
  const trimmed = key.trim();
  if (!trimmed || isPlaceholderValue(trimmed) || trimmed.length < 20) return false;
  if (trimmed.startsWith('sb_publishable_')) return false;
  const jwtRole = decodeJwtRole(trimmed);
  if (jwtRole !== null) {
    return jwtRole === 'service_role';
  }
  return trimmed.startsWith('sb_secret_');
}

export function createFiscalizaServiceRoleClient(): SupabaseClient | null {
  const rawUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim();
  const url = rawUrl.replace(/\/rest\/v1\/?$/i, '').replace(/\/+$/, '');
  const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

  if (!url || isPlaceholderValue(url)) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
  } catch {
    return null;
  }

  if (!isValidServiceRoleKey(serviceRoleKey)) return null;

  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}

function normalizeOptionalText(val: unknown): string | null {
  if (val === undefined || val === null) return null;
  if (typeof val !== 'string') return null;
  const trimmed = val.trim();
  return trimmed === '' ? null : trimmed;
}

function isPlainRecord(val: unknown): val is Record<string, unknown> {
  if (!val || typeof val !== 'object' || Array.isArray(val)) return false;
  const proto = Object.getPrototypeOf(val);
  return proto === Object.prototype || proto === null;
}

function looksLikeSerializedJson(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;

  if (
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']'))
  ) {
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed !== null && typeof parsed === 'object') {
        return true;
      }
    } catch {
      // Mesmo JSON malformado iniciando como objeto/array serializado suspeito
      if (/^\{.*"[^"]+"\s*:/.test(trimmed) || /^\[\s*\{/.test(trimmed)) {
        return true;
      }
    }
  }

  if (
    /"(damIdentification|generalInfo|componentsData|dados_rascunho_locais|itens_avaliados|itens_observacao_futura)"\s*:/.test(
      trimmed
    )
  ) {
    return true;
  }

  return false;
}

function isExactCpfOrCnpj(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || UUID_REGEX.test(trimmed)) return false;

  const withoutLabel = trimmed.replace(/^(?:cpf|cnpj)\s*[:=\-\/]?\s*/i, '').trim();
  if (!withoutLabel || !/^[\d.\-\/ \t]+$/.test(withoutLabel)) {
    return false;
  }

  const digits = withoutLabel.replace(/\D/g, '');
  return digits.length === 11 || digits.length === 14;
}

function someOutsideUuids(text: string, predicate: (segment: string) => boolean): boolean {
  UUID_GLOBAL_REGEX.lastIndex = 0;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = UUID_GLOBAL_REGEX.exec(text)) !== null) {
    if (match.index > lastIndex && predicate(text.slice(lastIndex, match.index))) {
      return true;
    }
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length && predicate(text.slice(lastIndex))) {
    return true;
  }

  return false;
}

function transformOutsideUuids(
  text: string,
  transformSegment: (segment: string) => string
): string {
  UUID_GLOBAL_REGEX.lastIndex = 0;
  let result = '';
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = UUID_GLOBAL_REGEX.exec(text)) !== null) {
    if (match.index > lastIndex) {
      result += transformSegment(text.slice(lastIndex, match.index));
    }
    result += match[0];
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    result += transformSegment(text.slice(lastIndex));
  }

  return result;
}

function segmentContainsCpfOrCnpj(segment: string): boolean {
  if (CNPJ_GROUPED_TEST.test(segment)) return true;
  if (CPF_GROUPED_TEST.test(segment)) return true;
  if (RAW_CNPJ_TEST.test(segment)) return true;
  if (RAW_CPF_TEST.test(segment)) return true;
  if (LABELED_CNPJ_TEST.test(segment)) return true;
  if (LABELED_CPF_TEST.test(segment)) return true;
  if (LABELED_SWAP_DOC_TEST.test(segment)) return true;
  return false;
}

function maskSegmentCpfCnpj(segment: string): string {
  let masked = segment;
  masked = masked.replace(CNPJ_GROUPED_GLOBAL, '**.***.***/****-**');
  masked = masked.replace(CPF_GROUPED_GLOBAL, '***.***.***-**');
  masked = masked.replace(RAW_CNPJ_GLOBAL, '**.***.***/****-**');
  masked = masked.replace(RAW_CPF_GLOBAL, '***.***.***-**');
  masked = masked.replace(
    LABELED_CNPJ_GLOBAL,
    (_full, label: string, sep: string) => `${label}${sep}**.***.***/****-**`
  );
  masked = masked.replace(
    LABELED_CPF_GLOBAL,
    (_full, label: string, sep: string) => `${label}${sep}***.***.***-**`
  );
  masked = masked.replace(
    LABELED_SWAP_DOC_GLOBAL,
    (full, label: string, sep: string, candidate: string) => {
      const digits = candidate.replace(/\D/g, '');
      if (digits.length === 14) return `${label}${sep}**.***.***/****-**`;
      if (digits.length === 11) return `${label}${sep}***.***.***-**`;
      return full;
    }
  );
  return masked;
}

function containsCpfOrCnpj(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || UUID_REGEX.test(trimmed)) return false;

  if (isExactCpfOrCnpj(trimmed)) return true;

  return someOutsideUuids(trimmed, segmentContainsCpfOrCnpj);
}

export function maskCpfCnpjInText(text: string | null | undefined): string | null {
  if (text === undefined || text === null) return null;
  if (UUID_REGEX.test(text.trim())) return text;
  return transformOutsideUuids(text, maskSegmentCpfCnpj);
}

function maskEmailInText(text: string | null | undefined): string | null {
  if (text === undefined || text === null) return null;
  return text.replace(
    /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
    SAFE_PROTECTED_EMAIL_LABEL
  );
}

function sanitizeDescriptiveText(
  text: string | null | undefined,
  includeEmail: boolean
): string | null {
  const maskedDoc = maskCpfCnpjInText(text);
  if (maskedDoc === null) return null;
  return includeEmail ? maskedDoc : maskEmailInText(maskedDoc);
}

export function sanitizeReferenceIdValue(
  raw: unknown,
  includeEmail: boolean = false
): string | null {
  if (raw === undefined || raw === null) return null;
  const text = String(raw);
  const trimmed = text.trim();
  if (!trimmed) return null;

  if (UUID_REGEX.test(trimmed)) {
    return trimmed;
  }

  if (isExactCpfOrCnpj(trimmed)) {
    return SAFE_PROTECTED_DOC_LABEL;
  }

  const sanitized = sanitizeDescriptiveText(trimmed, includeEmail);
  return sanitized && sanitized.trim() ? sanitized : null;
}

function sanitizePendenciaOutput(row: any, actor: ServerActor): PendenciaRecord {
  return {
    id: String(row.id),
    origem: String(row.origem || SISTEMA_ORIGEM_FISCALIZA),
    origem_ref_id: sanitizeReferenceIdValue(row.origem_ref_id, actor.isAdmin),
    tipo: sanitizeDescriptiveText(String(row.tipo || ''), actor.isAdmin) || '',
    titulo: sanitizeDescriptiveText(String(row.titulo || ''), actor.isAdmin) || '',
    descricao: sanitizeDescriptiveText(row.descricao ?? null, actor.isAdmin),
    situacao: row.situacao as PendenciaSituacao,
    responsavel_id: sanitizeReferenceIdValue(row.responsavel_id, actor.isAdmin),
    direcionado_por: sanitizeReferenceIdValue(row.direcionado_por, actor.isAdmin),
    direcionado_em: row.direcionado_em ?? null,
    criado_por: sanitizeReferenceIdValue(row.criado_por, actor.isAdmin),
    tipo_referencia: sanitizeDescriptiveText(row.tipo_referencia ?? null, actor.isAdmin),
    referencia_id: sanitizeReferenceIdValue(row.referencia_id, actor.isAdmin),
    empreendedor_id: sanitizeReferenceIdValue(row.empreendedor_id, actor.isAdmin),
    barragem_id: sanitizeReferenceIdValue(row.barragem_id, actor.isAdmin),
    resolvido_por: sanitizeReferenceIdValue(row.resolvido_por, actor.isAdmin),
    resolvido_em: row.resolvido_em ?? null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at)
  };
}

function sanitizeHistoricoOutput(row: any, actor: ServerActor): PendenciaHistoricoRecord {
  const campo = row.campo ?? null;
  const isIdDiff = Boolean(campo && ID_FIELDS.has(String(campo)));

  return {
    id: String(row.id),
    pendencia_id: String(row.pendencia_id),
    acao: sanitizeDescriptiveText(String(row.acao || ''), actor.isAdmin) || '',
    campo,
    valor_anterior: isIdDiff
      ? sanitizeReferenceIdValue(row.valor_anterior, actor.isAdmin)
      : sanitizeDescriptiveText(row.valor_anterior ?? null, actor.isAdmin),
    valor_novo: isIdDiff
      ? sanitizeReferenceIdValue(row.valor_novo, actor.isAdmin)
      : sanitizeDescriptiveText(row.valor_novo ?? null, actor.isAdmin),
    usuario_id: sanitizeReferenceIdValue(row.usuario_id, actor.isAdmin),
    motivo: sanitizeDescriptiveText(row.motivo ?? null, actor.isAdmin),
    created_at: String(row.created_at)
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
): Promise<{ status: number; error?: string; actor?: ServerActor }> {
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

  const role = rawRole;
  const isAdmin = role === 'administrador';
  const canMutate = role === 'administrador' || role === 'analista';

  return {
    status: 200,
    actor: {
      userId: authUser.id,
      email: normalizedEmail,
      fullName: String(profileRow.nome || 'Usuário CSB').trim() || 'Usuário CSB',
      role,
      isAdmin,
      canRead: true,
      canMutate
    }
  };
}

function validateRequestBodyShape(
  body: unknown,
  allowedKeys: Set<string>
): { valid: boolean; error?: string } {
  if (!isPlainRecord(body)) {
    return { valid: false, error: 'Corpo da requisição inválido.' };
  }

  for (const key of Object.keys(body)) {
    if (FORBIDDEN_SPOOF_OR_PERSONAL_KEYS.has(key)) {
      return {
        valid: false,
        error: `Campo não permitido pelo servidor: "${key}". Autoria, perfil, origem e dados pessoais não podem ser enviados.`
      };
    }
    if (!allowedKeys.has(key)) {
      return {
        valid: false,
        error: `Campo desconhecido na requisição: "${key}".`
      };
    }

    const val = body[key];
    if (val !== undefined && val !== null && typeof val !== 'string') {
      return {
        valid: false,
        error: `O campo "${key}" deve ser texto simples; objetos aninhados ou payloads estruturados não são permitidos.`
      };
    }

    if (typeof val === 'string') {
      if (val.length > 4000 || (TEXT_REFERENCE_ID_FIELDS.has(key) && val.trim().length > 200)) {
        return {
          valid: false,
          error: `O campo "${key}" excede o tamanho máximo permitido.`
        };
      }
      if (looksLikeSerializedJson(val)) {
        return {
          valid: false,
          error: `O campo "${key}" contém JSON serializado ou payload copiado, o que é bloqueado.`
        };
      }
      if (containsCpfOrCnpj(val)) {
        return {
          valid: false,
          error: `CPF/CNPJ não é permitido no módulo de pendências (campo "${key}").`
        };
      }
    }
  }

  return { valid: true };
}

function canActorReadPendencia(_pendencia: Pick<PendenciaRecord, 'id'>, actor: ServerActor): boolean {
  return actor.canRead;
}

function canActorMutatePendencia(
  pendencia: Pick<PendenciaRecord, 'responsavel_id'>,
  actor: ServerActor
): boolean {
  if (!actor.canMutate) return false;
  if (actor.isAdmin) return true;
  return pendencia.responsavel_id === null || pendencia.responsavel_id === actor.userId;
}

function buildActorSummary(actor: ServerActor): PendenciasActorSummary {
  const safeNome = sanitizeDescriptiveText(actor.fullName, actor.isAdmin) || 'Usuário CSB';
  const summary: PendenciasActorSummary = {
    id: actor.userId,
    nome: safeNome,
    perfil: actor.role,
    isAdmin: actor.isAdmin,
    canMutate: actor.canMutate,
    readOnlyMode: true
  };
  if (actor.isAdmin) {
    summary.email = actor.email;
  }
  return summary;
}

async function buildUsuariosResumo(
  supabaseAdmin: SupabaseClient,
  actor: ServerActor,
  ids: Iterable<string | null | undefined>
): Promise<Record<string, PendenciaUsuarioResumo>> {
  const result: Record<string, PendenciaUsuarioResumo> = {};
  const uniqueIds = Array.from(
    new Set(
      Array.from(ids).filter((id): id is string => Boolean(id && UUID_REGEX.test(id)))
    )
  );

  const actorName = sanitizeDescriptiveText(actor.fullName, actor.isAdmin) || 'Usuário CSB';
  result[actor.userId] = actor.isAdmin
    ? { id: actor.userId, nome: actorName, perfil: actor.role, email: actor.email }
    : { id: actor.userId, nome: actorName };

  const otherIds = uniqueIds.filter(id => id !== actor.userId);
  if (otherIds.length === 0) return result;

  const authUserMap = new Map<string, { email: string; metaName: string | null }>();
  const getUserByIdFn = (supabaseAdmin.auth as any)?.admin?.getUserById;

  if (typeof getUserByIdFn === 'function') {
    const authLookups = await Promise.allSettled(
      otherIds.map(async uid => {
        const res = await getUserByIdFn.call(supabaseAdmin.auth.admin, uid);
        const u = res?.data?.user;
        if (u?.email) {
          const rawMetaName =
            (typeof u.user_metadata?.full_name === 'string' && u.user_metadata.full_name.trim()) ||
            (typeof u.user_metadata?.name === 'string' && u.user_metadata.name.trim()) ||
            null;
          return {
            uid,
            email: String(u.email).trim().toLowerCase(),
            metaName: rawMetaName
          };
        }
        return null;
      })
    );
    for (const item of authLookups) {
      if (item.status === 'fulfilled' && item.value) {
        authUserMap.set(item.value.uid, {
          email: item.value.email,
          metaName: item.value.metaName
        });
      }
    }
  }

  const emailsToFetch = Array.from(
    new Set(Array.from(authUserMap.values()).map(v => v.email).filter(Boolean))
  );
  const profileByEmail = new Map<string, { nome: string; email?: string; perfil?: string }>();

  if (emailsToFetch.length > 0) {
    const { data: rowsByEmail, error } = await supabaseAdmin
      .from('perfis_usuarios')
      .select('id, email, nome, perfil')
      .in('email', emailsToFetch);

    if (!error && Array.isArray(rowsByEmail)) {
      for (const r of rowsByEmail) {
        if (!r?.email) continue;
        profileByEmail.set(String(r.email).trim().toLowerCase(), {
          nome: String(r.nome || '').trim(),
          email: String(r.email).trim().toLowerCase(),
          perfil: r.perfil ? String(r.perfil) : undefined
        });
      }
    }

    for (const email of emailsToFetch) {
      if (!profileByEmail.has(email)) {
        const fallbackProfile = await findPerfilByEmail(supabaseAdmin, email);
        if (fallbackProfile?.email) {
          profileByEmail.set(email, {
            nome: String(fallbackProfile.nome || '').trim(),
            email: String(fallbackProfile.email).trim().toLowerCase(),
            perfil: fallbackProfile.perfil ? String(fallbackProfile.perfil) : undefined
          });
        }
      }
    }
  }

  // Fallback apenas quando o ID não existe em auth.users (ex.: registro legado sem conta Auth)
  const idsWithoutAuthUser = otherIds.filter(uid => !authUserMap.has(uid));
  const profileById = new Map<string, { nome: string; email?: string; perfil?: string }>();
  if (idsWithoutAuthUser.length > 0) {
    const { data: rowsById, error } = await supabaseAdmin
      .from('perfis_usuarios')
      .select('id, email, nome, perfil')
      .in('id', idsWithoutAuthUser);

    if (!error && Array.isArray(rowsById)) {
      for (const r of rowsById) {
        if (!r?.id) continue;
        profileById.set(String(r.id), {
          nome: String(r.nome || '').trim(),
          email: r.email ? String(r.email).trim().toLowerCase() : undefined,
          perfil: r.perfil ? String(r.perfil) : undefined
        });
      }
    }
  }

  for (const uid of otherIds) {
    const authInfo = authUserMap.get(uid);
    const prof = authInfo ? profileByEmail.get(authInfo.email) : profileById.get(uid);
    if (!authInfo && !prof) continue;

    const rawNome = prof?.nome || authInfo?.metaName || 'Usuário CSB';
    const safeNome = sanitizeDescriptiveText(rawNome, actor.isAdmin) || 'Usuário CSB';

    const entry: PendenciaUsuarioResumo = {
      id: uid,
      nome: safeNome
    };

    if (actor.isAdmin) {
      if (prof?.perfil) entry.perfil = prof.perfil;
      const resolvedEmail = prof?.email || authInfo?.email;
      if (resolvedEmail) entry.email = resolvedEmail;
    }

    result[uid] = entry;
  }

  return result;
}

async function verifyActiveTargetUser(
  supabaseAdmin: SupabaseClient,
  targetUserId: string
): Promise<{ valid: boolean; error?: string }> {
  if (!UUID_REGEX.test(targetUserId)) {
    return { valid: false, error: 'Identificador de usuário responsável deve ser um UUID válido.' };
  }

  const getUserByIdFn = (supabaseAdmin.auth as any)?.admin?.getUserById;
  if (typeof getUserByIdFn !== 'function') {
    return { valid: false, error: 'Serviço de validação de usuário responsável indisponível.' };
  }

  const authRes = await getUserByIdFn.call(supabaseAdmin.auth.admin, targetUserId);
  const authUser = authRes?.data?.user;
  if (authRes?.error || !authUser?.id || !authUser?.email) {
    return { valid: false, error: 'Usuário responsável não encontrado na sessão institucional.' };
  }

  const profile = await findPerfilByEmail(supabaseAdmin, String(authUser.email));
  if (!profile) {
    return { valid: false, error: 'Perfil do usuário responsável não encontrado.' };
  }

  if (String(profile.status || '').trim().toLowerCase() !== 'ativo') {
    return { valid: false, error: 'O usuário responsável selecionado está inativo.' };
  }

  return { valid: true };
}

export function createPendenciasRouter(deps: PendenciasServerDeps = {}): express.Router {
  const router = express.Router();
  const resolveClient = deps.getSupabaseAdmin || createFiscalizaServiceRoleClient;

  router.use(express.json({ limit: '64kb' }));
  router.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    if (err && err.type === 'entity.parse.failed') {
      res.status(400).json({ error: 'JSON inválido na requisição.' });
      return;
    }
    next(err);
  });

  // Middleware de falha fechada (config + token + perfil ativo no servidor)
  router.use(async (req: Request, res: Response, next: NextFunction) => {
    const supabaseAdmin = resolveClient();
    if (!supabaseAdmin) {
      res.status(503).json({
        error: 'Serviço de pendências indisponível: configuração segura do servidor ausente ou inválida.'
      });
      return;
    }

    const authResult = await resolveServerActor(req, supabaseAdmin);
    if (!authResult.actor) {
      res.status(authResult.status).json({ error: authResult.error || 'Não autorizado.' });
      return;
    }

    res.locals.supabaseAdmin = supabaseAdmin;
    res.locals.actor = authResult.actor;
    next();
  });

  // GET /api/pendencias?tab=minhas|geral|direcionado
  router.get('/', async (req: Request, res: Response) => {
    const supabaseAdmin = res.locals.supabaseAdmin as SupabaseClient;
    const actor = res.locals.actor as ServerActor;

    if (Array.isArray(req.query.tab)) {
      res.status(400).json({ error: 'Parâmetro tab inválido.' });
      return;
    }
    const rawTab =
      req.query.tab === undefined
        ? 'geral'
        : typeof req.query.tab === 'string'
        ? req.query.tab.trim().toLowerCase()
        : '';
    if (rawTab !== 'minhas' && rawTab !== 'geral' && rawTab !== 'direcionado') {
      res.status(400).json({ error: 'Aba solicitada inválida.' });
      return;
    }
    const tab = rawTab as PendenciasTab;

    if (tab === 'direcionado' && !actor.isAdmin) {
      res.status(403).json({ error: 'Aba "Direcionado" é exclusiva de administradores.' });
      return;
    }

    const { data, error } = await supabaseAdmin
      .from('pendencias')
      .select(PENDENCIA_SELECT_COLUMNS)
      .order('updated_at', { ascending: false });

    if (error) {
      res.status(500).json({ error: 'Falha ao consultar pendências no servidor.' });
      return;
    }

    const visibleRows = (data || [])
      .filter((row: any) => canActorReadPendencia({ id: String(row.id) }, actor))
      .map((row: any) => sanitizePendenciaOutput(row, actor));

    const minhasRows = visibleRows.filter(p => p.responsavel_id === actor.userId);
    const direcionadoRows = actor.isAdmin
      ? visibleRows.filter(p => Boolean(p.responsavel_id))
      : [];

    const filteredRows =
      tab === 'minhas' ? minhasRows : tab === 'direcionado' ? direcionadoRows : visibleRows;

    const referencedIds: Array<string | null> = [];
    for (const p of filteredRows) {
      referencedIds.push(p.responsavel_id, p.criado_por, p.direcionado_por, p.resolvido_por);
    }

    const usuariosResumo = await buildUsuariosResumo(supabaseAdmin, actor, referencedIds);

    const counts = actor.isAdmin
      ? {
          minhas: minhasRows.length,
          geral: visibleRows.length,
          direcionado: direcionadoRows.length
        }
      : {
          minhas: minhasRows.length,
          geral: visibleRows.length
        };

    res.status(200).json({
      pendencias: filteredRows,
      counts,
      currentUser: buildActorSummary(actor),
      usuariosResumo,
      readOnlyMode: true,
      writeBlockReason: PENDENCIA_WRITE_BLOCK_REASON
    });
  });

  // GET /api/pendencias/:id
  router.get('/:id', async (req: Request, res: Response) => {
    const supabaseAdmin = res.locals.supabaseAdmin as SupabaseClient;
    const actor = res.locals.actor as ServerActor;
    const pendenciaId = String(req.params.id || '').trim();

    if (!UUID_REGEX.test(pendenciaId)) {
      res.status(400).json({ error: 'Identificador de pendência inválido.' });
      return;
    }

    const { data: row, error } = await supabaseAdmin
      .from('pendencias')
      .select(PENDENCIA_SELECT_COLUMNS)
      .eq('id', pendenciaId)
      .maybeSingle();

    if (error) {
      res.status(500).json({ error: 'Falha ao consultar detalhe da pendência.' });
      return;
    }

    if (!row) {
      res.status(404).json({ error: 'Pendência não encontrada.' });
      return;
    }

    if (!canActorReadPendencia({ id: String(row.id) }, actor)) {
      res.status(403).json({ error: 'Você não tem permissão para visualizar esta pendência.' });
      return;
    }

    const pendencia = sanitizePendenciaOutput(row, actor);
    const usuariosResumo = await buildUsuariosResumo(supabaseAdmin, actor, [
      pendencia.responsavel_id,
      pendencia.criado_por,
      pendencia.direcionado_por,
      pendencia.resolvido_por
    ]);

    res.status(200).json({
      pendencia,
      currentUser: buildActorSummary(actor),
      usuariosResumo,
      readOnlyMode: true,
      writeBlockReason: PENDENCIA_WRITE_BLOCK_REASON
    });
  });

  // GET /api/pendencias/:id/historico
  router.get('/:id/historico', async (req: Request, res: Response) => {
    const supabaseAdmin = res.locals.supabaseAdmin as SupabaseClient;
    const actor = res.locals.actor as ServerActor;
    const pendenciaId = String(req.params.id || '').trim();

    if (!UUID_REGEX.test(pendenciaId)) {
      res.status(400).json({ error: 'Identificador de pendência inválido.' });
      return;
    }

    // Valida existência e permissão de leitura da pendência ANTES de consultar o histórico
    const { data: pendenciaRow, error: pendError } = await supabaseAdmin
      .from('pendencias')
      .select(PENDENCIA_SELECT_COLUMNS)
      .eq('id', pendenciaId)
      .maybeSingle();

    if (pendError) {
      res.status(500).json({ error: 'Falha ao validar pendência para leitura do histórico.' });
      return;
    }

    if (!pendenciaRow) {
      res.status(404).json({ error: 'Pendência não encontrada.' });
      return;
    }

    if (!canActorReadPendencia({ id: String(pendenciaRow.id) }, actor)) {
      res.status(403).json({ error: 'Você não tem permissão para acessar o histórico desta pendência.' });
      return;
    }

    const { data: histData, error: histError } = await supabaseAdmin
      .from('pendencias_historico')
      .select(HISTORICO_SELECT_COLUMNS)
      .eq('pendencia_id', pendenciaId)
      .order('created_at', { ascending: false });

    if (histError) {
      res.status(500).json({ error: 'Falha ao consultar o histórico da pendência.' });
      return;
    }

    const pendencia = sanitizePendenciaOutput(pendenciaRow, actor);
    const historico = (histData || []).map((entry: any) => sanitizeHistoricoOutput(entry, actor));

    const referencedIds: Array<string | null> = [
      pendencia.responsavel_id,
      pendencia.criado_por,
      pendencia.direcionado_por,
      pendencia.resolvido_por
    ];
    for (const h of historico) {
      referencedIds.push(h.usuario_id);
      if (
        (h.campo === 'responsavel_id' ||
          h.campo === 'criado_por' ||
          h.campo === 'direcionado_por' ||
          h.campo === 'resolvido_por') &&
        h.valor_anterior
      ) {
        referencedIds.push(h.valor_anterior);
      }
      if (
        (h.campo === 'responsavel_id' ||
          h.campo === 'criado_por' ||
          h.campo === 'direcionado_por' ||
          h.campo === 'resolvido_por') &&
        h.valor_novo
      ) {
        referencedIds.push(h.valor_novo);
      }
    }

    const usuariosResumo = await buildUsuariosResumo(supabaseAdmin, actor, referencedIds);

    res.status(200).json({
      pendencia,
      historico,
      currentUser: buildActorSummary(actor),
      usuariosResumo,
      readOnlyMode: true,
      writeBlockReason: PENDENCIA_WRITE_BLOCK_REASON
    });
  });

  // Histórico é append-only: nunca atualizar nem excluir
  router.put('/:id/historico', (_req: Request, res: Response) => {
    res.status(405).json({ error: 'Histórico de pendências é somente leitura e inclusão.' });
  });
  router.patch('/:id/historico', (_req: Request, res: Response) => {
    res.status(405).json({ error: 'Histórico de pendências é somente leitura e inclusão.' });
  });
  router.delete('/:id/historico', (_req: Request, res: Response) => {
    res.status(405).json({ error: 'Exclusão de registros do histórico não é permitida.' });
  });
  router.delete('/:id', (_req: Request, res: Response) => {
    res.status(405).json({ error: 'Exclusão de pendências não é permitida.' });
  });

  // POST /api/pendencias (criação bloqueada com 409 após validações 401/403/400)
  router.post('/', async (req: Request, res: Response) => {
    const supabaseAdmin = res.locals.supabaseAdmin as SupabaseClient;
    const actor = res.locals.actor as ServerActor;

    if (!actor.canMutate) {
      res.status(403).json({ error: 'Perfil Visualizador possui acesso somente leitura.' });
      return;
    }

    const shapeCheck = validateRequestBodyShape(req.body, CREATE_ALLOWED_KEYS);
    if (!shapeCheck.valid) {
      res.status(400).json({ error: shapeCheck.error });
      return;
    }

    const body = req.body as Record<string, unknown>;
    const responsavelId = normalizeOptionalText(body.responsavel_id);
    if (responsavelId && !actor.isAdmin) {
      res.status(403).json({
        error: 'Apenas administradores podem atribuir responsável na criação da pendência.'
      });
      return;
    }

    const titulo = normalizeOptionalText(body.titulo);
    const tipo = normalizeOptionalText(body.tipo);
    if (!titulo || !tipo) {
      res.status(400).json({ error: 'Título e tipo da pendência são obrigatórios.' });
      return;
    }

    if (responsavelId) {
      const targetCheck = await verifyActiveTargetUser(supabaseAdmin, responsavelId);
      if (!targetCheck.valid) {
        res.status(400).json({ error: targetCheck.error });
        return;
      }
    }

    // Origem sempre forçada internamente para 'fiscaliza' antes do bloqueio 409
    const resolvedOrigem = SISTEMA_ORIGEM_FISCALIZA;
    void resolvedOrigem;

    res.status(409).json({
      error: PENDENCIA_WRITE_BLOCK_REASON,
      code: 'TRANSACTIONAL_AUDIT_REQUIRED',
      readOnlyMode: true
    });
  });

  // PATCH /api/pendencias/:id (edição bloqueada com 409 após validações 401/403/400)
  router.patch('/:id', async (req: Request, res: Response) => {
    const supabaseAdmin = res.locals.supabaseAdmin as SupabaseClient;
    const actor = res.locals.actor as ServerActor;

    if (!actor.canMutate) {
      res.status(403).json({ error: 'Perfil Visualizador possui acesso somente leitura.' });
      return;
    }

    const pendenciaId = String(req.params.id || '').trim();
    if (!UUID_REGEX.test(pendenciaId)) {
      res.status(400).json({ error: 'Identificador de pendência inválido.' });
      return;
    }

    const shapeCheck = validateRequestBodyShape(req.body, EDIT_ALLOWED_KEYS);
    if (!shapeCheck.valid) {
      res.status(400).json({ error: shapeCheck.error });
      return;
    }

    const body = req.body as Record<string, unknown>;
    const editableKeysPresent = Array.from(EDIT_ALLOWED_KEYS).filter(
      k => k !== 'motivo' && Object.prototype.hasOwnProperty.call(body, k)
    );
    if (editableKeysPresent.length === 0) {
      res.status(400).json({ error: 'Nenhum campo editável foi informado.' });
      return;
    }

    if (
      Object.prototype.hasOwnProperty.call(body, 'titulo') &&
      !normalizeOptionalText(body.titulo)
    ) {
      res.status(400).json({ error: 'O título da pendência não pode ficar vazio.' });
      return;
    }
    if (
      Object.prototype.hasOwnProperty.call(body, 'tipo') &&
      !normalizeOptionalText(body.tipo)
    ) {
      res.status(400).json({ error: 'O tipo da pendência não pode ficar vazio.' });
      return;
    }

    const { data: existing, error: fetchErr } = await supabaseAdmin
      .from('pendencias')
      .select(PENDENCIA_SELECT_COLUMNS)
      .eq('id', pendenciaId)
      .maybeSingle();

    if (fetchErr) {
      res.status(500).json({ error: 'Falha ao localizar pendência para validação.' });
      return;
    }
    if (!existing) {
      res.status(404).json({ error: 'Pendência não encontrada.' });
      return;
    }

    if (!canActorMutatePendencia({ responsavel_id: existing.responsavel_id ?? null }, actor)) {
      res.status(403).json({
        error: 'Você só pode agir em pendências sem responsável ou atribuídas ao seu usuário.'
      });
      return;
    }

    if (!actor.isAdmin && (existing.situacao === 'resolvida' || existing.situacao === 'cancelada')) {
      res.status(403).json({
        error: 'Não é permitido editar pendência já resolvida ou cancelada.'
      });
      return;
    }

    res.status(409).json({
      error: PENDENCIA_WRITE_BLOCK_REASON,
      code: 'TRANSACTIONAL_AUDIT_REQUIRED',
      readOnlyMode: true
    });
  });

  // POST /api/pendencias/:id/direcionar (bloqueado com 409 após validações 401/403/400)
  router.post('/:id/direcionar', async (req: Request, res: Response) => {
    const supabaseAdmin = res.locals.supabaseAdmin as SupabaseClient;
    const actor = res.locals.actor as ServerActor;

    if (!actor.isAdmin) {
      res.status(403).json({
        error: 'Apenas administradores podem atribuir ou alterar o responsável por uma pendência.'
      });
      return;
    }

    const pendenciaId = String(req.params.id || '').trim();
    if (!UUID_REGEX.test(pendenciaId)) {
      res.status(400).json({ error: 'Identificador de pendência inválido.' });
      return;
    }

    const shapeCheck = validateRequestBodyShape(req.body, DIRECIONAR_ALLOWED_KEYS);
    if (!shapeCheck.valid) {
      res.status(400).json({ error: shapeCheck.error });
      return;
    }

    const body = req.body as Record<string, unknown>;
    const responsavelId = normalizeOptionalText(body.responsavel_id);
    if (!responsavelId || !UUID_REGEX.test(responsavelId)) {
      res.status(400).json({ error: 'Identificador UUID do usuário responsável é obrigatório.' });
      return;
    }

    const { data: existing, error: fetchErr } = await supabaseAdmin
      .from('pendencias')
      .select('id, situacao, responsavel_id')
      .eq('id', pendenciaId)
      .maybeSingle();

    if (fetchErr) {
      res.status(500).json({ error: 'Falha ao localizar pendência para direcionamento.' });
      return;
    }
    if (!existing) {
      res.status(404).json({ error: 'Pendência não encontrada.' });
      return;
    }

    if (existing.situacao === 'resolvida' || existing.situacao === 'cancelada') {
      res.status(400).json({
        error: 'Não é possível direcionar uma pendência já resolvida ou cancelada.'
      });
      return;
    }

    const targetCheck = await verifyActiveTargetUser(supabaseAdmin, responsavelId);
    if (!targetCheck.valid) {
      res.status(400).json({ error: targetCheck.error });
      return;
    }

    if (existing.responsavel_id === responsavelId) {
      res.status(400).json({ error: 'A pendência já está direcionada para este usuário.' });
      return;
    }

    res.status(409).json({
      error: PENDENCIA_WRITE_BLOCK_REASON,
      code: 'TRANSACTIONAL_AUDIT_REQUIRED',
      readOnlyMode: true
    });
  });

  // PATCH /api/pendencias/:id/situacao (mudança de situação e resolução bloqueadas com 409 após validações 401/403/400)
  router.patch('/:id/situacao', async (req: Request, res: Response) => {
    const supabaseAdmin = res.locals.supabaseAdmin as SupabaseClient;
    const actor = res.locals.actor as ServerActor;

    if (!actor.canMutate) {
      res.status(403).json({ error: 'Perfil Visualizador possui acesso somente leitura.' });
      return;
    }

    const pendenciaId = String(req.params.id || '').trim();
    if (!UUID_REGEX.test(pendenciaId)) {
      res.status(400).json({ error: 'Identificador de pendência inválido.' });
      return;
    }

    const shapeCheck = validateRequestBodyShape(req.body, SITUACAO_ALLOWED_KEYS);
    if (!shapeCheck.valid) {
      res.status(400).json({ error: shapeCheck.error });
      return;
    }

    const body = req.body as Record<string, unknown>;
    const novaSituacao = normalizeOptionalText(body.situacao);
    if (!novaSituacao || !PENDENCIA_SITUACOES.includes(novaSituacao as PendenciaSituacao)) {
      res.status(400).json({ error: 'Situação informada não é permitida.' });
      return;
    }

    if (!actor.isAdmin && novaSituacao === 'direcionada') {
      res.status(403).json({ error: 'Apenas administradores podem definir a situação direcionada.' });
      return;
    }

    const { data: existing, error: fetchErr } = await supabaseAdmin
      .from('pendencias')
      .select('id, situacao, responsavel_id')
      .eq('id', pendenciaId)
      .maybeSingle();

    if (fetchErr) {
      res.status(500).json({ error: 'Falha ao localizar pendência para mudança de situação.' });
      return;
    }
    if (!existing) {
      res.status(404).json({ error: 'Pendência não encontrada.' });
      return;
    }

    if (!canActorMutatePendencia({ responsavel_id: existing.responsavel_id ?? null }, actor)) {
      res.status(403).json({
        error: 'Você só pode agir em pendências sem responsável ou atribuídas ao seu usuário.'
      });
      return;
    }

    if (existing.situacao === novaSituacao) {
      res.status(400).json({ error: 'A pendência já se encontra nesta situação.' });
      return;
    }

    res.status(409).json({
      error: PENDENCIA_WRITE_BLOCK_REASON,
      code: 'TRANSACTIONAL_AUDIT_REQUIRED',
      readOnlyMode: true
    });
  });

  return router;
}

export function createPendenciasApp(deps: PendenciasServerDeps = {}): express.Express {
  const app = express();
  app.use('/api/pendencias', createPendenciasRouter(deps));
  return app;
}
