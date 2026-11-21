import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { SistemaOrigem } from '../types/inspection.ts';
import {
  SOLICITACAO_VISTORIA_ORIGENS,
  SOLICITACAO_VISTORIA_STATUS_LIST,
  type SolicitacaoVistoriaActorSummary,
  type SolicitacaoVistoriaEquipeMembro,
  type SolicitacaoVistoriaRecord,
  type SolicitacaoVistoriaStatus
} from '../types/solicitacoesVistoria.ts';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UUID_GLOBAL_REGEX = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const MAX_OBSERVACAO_LENGTH = 1000;
const SAFE_PROTECTED_DOC_LABEL = '[documento protegido]';
const SAFE_PROTECTED_EMAIL_LABEL = '[e-mail protegido]';

const DOC_SEP_SRC = '(?:[ \\t]*[.\\-/][ \\t]*|[ \\t]+)';
const CPF_GROUPED_SRC = `(?<!\\d)(?:\\d{3}${DOC_SEP_SRC}\\d{3}${DOC_SEP_SRC}\\d{3}${DOC_SEP_SRC}\\d{2}|\\d{3}${DOC_SEP_SRC}\\d{6}${DOC_SEP_SRC}\\d{2}|\\d{6}${DOC_SEP_SRC}\\d{3}${DOC_SEP_SRC}\\d{2}|\\d{9}${DOC_SEP_SRC}\\d{2})(?!\\d)`;
const CNPJ_GROUPED_SRC = `(?<!\\d)(?:\\d{2}${DOC_SEP_SRC}\\d{3}${DOC_SEP_SRC}\\d{3}${DOC_SEP_SRC}\\d{4}${DOC_SEP_SRC}\\d{2}|\\d{2}${DOC_SEP_SRC}\\d{6}${DOC_SEP_SRC}\\d{4}${DOC_SEP_SRC}\\d{2}|\\d{5}${DOC_SEP_SRC}\\d{3}${DOC_SEP_SRC}\\d{4}${DOC_SEP_SRC}\\d{2}|\\d{8}${DOC_SEP_SRC}\\d{4}${DOC_SEP_SRC}\\d{2})(?!\\d)`;
const LABELED_OPT_SEP_SRC = '(?:[ \\t]*[.\\-/][ \\t]*|[ \\t]+)?';
const LABELED_CNPJ_SRC = `\\b(cnpj)(\\s*[:=\\-\\/]?\\s*)(\\d(?:${LABELED_OPT_SEP_SRC}\\d){13})(?!\\d)`;
const LABELED_CPF_SRC = `\\b(cpf)(\\s*[:=\\-\\/]?\\s*)(\\d(?:${LABELED_OPT_SEP_SRC}\\d){10})(?!\\d)`;
const LABELED_SWAP_DOC_SRC = `\\b(cpf|cnpj)(\\s*[:=\\-\\/]?\\s*)(\\d(?:${LABELED_OPT_SEP_SRC}\\d){13}|\\d(?:${LABELED_OPT_SEP_SRC}\\d){10})(?!\\d)`;

const CPF_GROUPED_TEST = new RegExp(CPF_GROUPED_SRC);
const CNPJ_GROUPED_TEST = new RegExp(CNPJ_GROUPED_SRC);
const CPF_GROUPED_GLOBAL = new RegExp(CPF_GROUPED_SRC, 'g');
const CNPJ_GROUPED_GLOBAL = new RegExp(CNPJ_GROUPED_SRC, 'g');
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

const FORBIDDEN_SPOOF_OR_PERSONAL_KEYS = new Set<string>([
  'id',
  'actor_id',
  'actorId',
  'user_id',
  'userId',
  'usuario_id',
  'usuarioId',
  'perfil',
  'role',
  'isAdmin',
  'is_admin',
  'permissoes',
  'permissions',
  'canMutate',
  'sistema_origem',
  'origem',
  'cpf',
  'cnpj',
  'cpf_cnpj',
  'cpfCnpj',
  'ownerCpfCnpj',
  'documento',
  'documentos_pessoais',
  'email',
  'telefone',
  'endereco',
  'payload',
  'dados',
  '__proto__',
  'constructor',
  'prototype'
]);

const CONCLUIR_ALLOWED_KEYS = new Set<string>([
  'vistoria_id',
  'data_realizacao',
  'equipe',
  'observacao_campo'
]);

const OBSERVACAO_ALLOWED_KEYS = new Set<string>(['observacao_campo']);

export interface CentralSolicitacoesConfig {
  url: string;
  token: string;
}

export interface SolicitacoesVistoriaServerDeps {
  getSupabaseAdmin?: () => SupabaseClient | null;
  getCentralConfig?: () => CentralSolicitacoesConfig | null;
  fetchImpl?: typeof fetch;
}

interface ResolvedActor extends SolicitacaoVistoriaActorSummary {
  perfilId: string | null;
  email: string;
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
    lower.includes('meu_token')
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

function isValidServiceRoleKey(key: string): boolean {
  const trimmed = key.trim();
  if (!trimmed || isPlaceholderValue(trimmed) || trimmed.length < 20) return false;
  if (trimmed.startsWith('sb_publishable_')) return false;
  const jwtRole = decodeJwtRole(trimmed);
  if (jwtRole !== null) {
    return jwtRole === 'service_role';
  }
  return trimmed.startsWith('sb_secret_');
}

function createFiscalizaServiceRoleClient(): SupabaseClient | null {
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

export function getDefaultCentralSolicitacoesConfig(): CentralSolicitacoesConfig | null {
  const rawUrl = (process.env.ADMINISTRA_SOLICITACOES_URL || '').trim();
  const token = (process.env.SOLICITACOES_SERVICE_TOKEN || '').trim();

  if (!rawUrl || isPlaceholderValue(rawUrl) || !token || isPlaceholderValue(token) || token.length < 12) {
    return null;
  }

  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return null;
    }
    return {
      url: rawUrl.replace(/\/+$/, ''),
      token
    };
  } catch {
    return null;
  }
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
      if (/^\{.*"[^"]+"\s*:/.test(trimmed) || /^\[\s*\{/.test(trimmed)) {
        return true;
      }
    }
  }

  if (/"(damIdentification|generalInfo|componentsData|dados_rascunho_locais|cpfCnpj|cpf_cnpj)"\s*:/.test(trimmed)) {
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

function transformOutsideUuids(text: string, transformSegment: (segment: string) => string): string {
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

function maskSensitiveText(text: string | null | undefined): string | null {
  if (text === undefined || text === null) return null;
  const str = String(text);
  if (!str.trim()) return null;
  if (UUID_REGEX.test(str.trim())) return str.trim();
  const maskedDoc = transformOutsideUuids(str, maskSegmentCpfCnpj);
  return maskedDoc.replace(
    /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
    SAFE_PROTECTED_EMAIL_LABEL
  );
}

function sanitizeOptionalId(val: unknown): string | null {
  if (val === undefined || val === null) return null;
  const trimmed = String(val).trim();
  if (!trimmed) return null;
  if (UUID_REGEX.test(trimmed)) return trimmed;
  if (isExactCpfOrCnpj(trimmed)) return SAFE_PROTECTED_DOC_LABEL;
  return maskSensitiveText(trimmed);
}

function isValidIsoDate(val: string): boolean {
  if (!ISO_DATE_REGEX.test(val)) return false;
  const [y, m, d] = val.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  );
}

function normalizeStatus(raw: unknown): SolicitacaoVistoriaStatus {
  const lower = String(raw || '').trim().toLowerCase();
  if ((SOLICITACAO_VISTORIA_STATUS_LIST as readonly string[]).includes(lower)) {
    return lower as SolicitacaoVistoriaStatus;
  }
  return 'pendente';
}

function normalizeOrigem(raw: unknown): SistemaOrigem {
  const lower = String(raw || '').trim().toLowerCase();
  if ((SOLICITACAO_VISTORIA_ORIGENS as readonly string[]).includes(lower)) {
    return lower as SistemaOrigem;
  }
  return 'administra';
}

function sanitizeEquipeOutput(rawEquipe: unknown): SolicitacaoVistoriaEquipeMembro[] {
  if (!Array.isArray(rawEquipe)) return [];
  const seen = new Set<string>();
  const result: SolicitacaoVistoriaEquipeMembro[] = [];

  for (const item of rawEquipe) {
    if (typeof item === 'string') {
      const uid = item.trim();
      if (UUID_REGEX.test(uid) && !seen.has(uid.toLowerCase())) {
        seen.add(uid.toLowerCase());
        result.push({ usuario_id: uid, nome: null });
      }
      continue;
    }

    if (item && typeof item === 'object') {
      const obj = item as Record<string, unknown>;
      const rawId = obj.usuario_id ?? obj.id;
      const uid = typeof rawId === 'string' ? rawId.trim() : '';
      if (!UUID_REGEX.test(uid)) continue;
      if (seen.has(uid.toLowerCase())) continue;
      seen.add(uid.toLowerCase());
      const nome =
        typeof obj.nome === 'string' ? maskSensitiveText(obj.nome) : null;
      result.push({
        usuario_id: uid,
        nome
      });
    }
  }

  return result;
}

function sanitizeSolicitacaoOutput(row: any): SolicitacaoVistoriaRecord {
  const rawLat = row?.latitude !== undefined && row?.latitude !== null ? String(row.latitude).trim() : null;
  const rawLng = row?.longitude !== undefined && row?.longitude !== null ? String(row.longitude).trim() : null;

  return {
    id: String(row?.id || ''),
    sistema_origem: normalizeOrigem(row?.sistema_origem ?? row?.origem),
    status: normalizeStatus(row?.status),
    protocolo: maskSensitiveText(row?.protocolo ?? null),
    solicitante_nome: maskSensitiveText(row?.solicitante_nome ?? 'Equipe CSB') || 'Equipe CSB',
    solicitado_em: String(row?.solicitado_em ?? row?.created_at ?? ''),
    relato_resumido:
      maskSensitiveText(row?.relato_resumido ?? row?.relato ?? '') || '',
    processo_numero: maskSensitiveText(row?.processo_numero ?? null),
    classificacao_resumo: maskSensitiveText(row?.classificacao_resumo ?? null),
    empreendedor_id: sanitizeOptionalId(row?.empreendedor_id ?? null),
    empreendedor_nome: maskSensitiveText(row?.empreendedor_nome ?? null),
    barragem_id: sanitizeOptionalId(row?.barragem_id ?? null),
    barragem_nome: maskSensitiveText(row?.barragem_nome ?? null),
    municipio: maskSensitiveText(row?.municipio ?? null),
    curso_dagua: maskSensitiveText(row?.curso_dagua ?? null),
    latitude: rawLat ? maskSensitiveText(rawLat) : null,
    longitude: rawLng ? maskSensitiveText(rawLng) : null,
    vistoria_id: sanitizeOptionalId(row?.vistoria_id ?? null),
    data_realizacao:
      typeof row?.data_realizacao === 'string' && row.data_realizacao.trim()
        ? row.data_realizacao.trim()
        : null,
    equipe: sanitizeEquipeOutput(row?.equipe),
    observacao_campo:
      row?.observacao_campo !== undefined && row?.observacao_campo !== null
        ? maskSensitiveText(String(row.observacao_campo)) ?? ''
        : null,
    updated_at: row?.updated_at ? String(row.updated_at) : null
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

  const role = rawRole;
  const perfilId =
    profileRow.id && UUID_REGEX.test(String(profileRow.id)) ? String(profileRow.id) : null;

  return {
    status: 200,
    actor: {
      userId: authUser.id,
      perfilId,
      email: normalizedEmail,
      nome: String(profileRow.nome || 'Usuário CSB').trim() || 'Usuário CSB',
      perfil: role,
      isAdmin: role === 'administrador',
      canMutate: role === 'administrador' || role === 'analista'
    }
  };
}

function isActorMemberOfEquipe(
  equipe: SolicitacaoVistoriaEquipeMembro[],
  actor: ResolvedActor
): boolean {
  const actorUserId = actor.userId.toLowerCase();
  const actorPerfilId = actor.perfilId ? actor.perfilId.toLowerCase() : null;

  return equipe.some(membro => {
    const memberId = String(membro.usuario_id || '').trim().toLowerCase();
    if (!memberId || !UUID_REGEX.test(memberId)) return false;
    if (memberId === actorUserId) return true;
    if (actorPerfilId && memberId === actorPerfilId) return true;
    return false;
  });
}

function validateAndSanitizeEquipeInput(
  rawEquipe: unknown,
  actor: ResolvedActor
): { valid: boolean; error?: string; equipe?: SolicitacaoVistoriaEquipeMembro[] } {
  if (rawEquipe === undefined || rawEquipe === null) {
    return {
      valid: true,
      equipe: [{ usuario_id: actor.userId, nome: actor.nome }]
    };
  }

  if (!Array.isArray(rawEquipe)) {
    return {
      valid: false,
      error: 'O campo "equipe" deve ser uma lista de integrantes identificados por ID institucional (UUID).'
    };
  }

  if (rawEquipe.length > 25) {
    return {
      valid: false,
      error: 'O campo "equipe" excede o limite máximo de 25 integrantes.'
    };
  }

  const normalized = new Map<string, SolicitacaoVistoriaEquipeMembro>();

  for (const entry of rawEquipe) {
    if (typeof entry === 'string') {
      const trimmed = entry.trim();
      if (!UUID_REGEX.test(trimmed)) {
        return {
          valid: false,
          error:
            'A equipe enviada na conclusão deve usar IDs institucionais válidos (UUID) e não apenas nomes digitados.'
        };
      }
      const key = trimmed.toLowerCase();
      if (!normalized.has(key)) {
        normalized.set(key, {
          usuario_id: trimmed,
          nome: key === actor.userId.toLowerCase() ? actor.nome : null
        });
      }
      continue;
    }

    if (!isPlainRecord(entry)) {
      return {
        valid: false,
        error: 'Cada integrante de "equipe" deve informar um ID institucional válido (usuario_id UUID).'
      };
    }

    for (const k of Object.keys(entry)) {
      if (k !== 'usuario_id' && k !== 'id' && k !== 'nome') {
        return {
          valid: false,
          error: `Campo não permitido em integrante da equipe: "${k}".`
        };
      }
    }

    const rawId = entry.usuario_id ?? entry.id;
    const uid = typeof rawId === 'string' ? rawId.trim() : '';
    if (!UUID_REGEX.test(uid)) {
      return {
        valid: false,
        error:
          'Todo integrante da equipe na conclusão exige ID institucional válido (UUID); nomes digitados isoladamente não são aceitos.'
      };
    }

    let sanitizedNome: string | null = null;
    if (entry.nome !== undefined && entry.nome !== null) {
      if (typeof entry.nome !== 'string') {
        return { valid: false, error: 'O nome opcional do integrante da equipe deve ser texto simples.' };
      }
      if (entry.nome.length > 200 || looksLikeSerializedJson(entry.nome) || containsCpfOrCnpj(entry.nome)) {
        return {
          valid: false,
          error: 'O nome de integrante da equipe contém formato inválido ou CPF/CNPJ não permitido.'
        };
      }
      sanitizedNome = entry.nome.trim() || null;
    }

    const key = uid.toLowerCase();
    if (!normalized.has(key)) {
      normalized.set(key, {
        usuario_id: uid,
        nome: key === actor.userId.toLowerCase() ? actor.nome : sanitizedNome
      });
    }
  }

  // Sempre garante a presença do ID institucional autenticado que concluiu no servidor
  const actorKey = actor.userId.toLowerCase();
  if (!normalized.has(actorKey)) {
    normalized.set(actorKey, {
      usuario_id: actor.userId,
      nome: actor.nome
    });
  }

  return {
    valid: true,
    equipe: Array.from(normalized.values())
  };
}

function validateAllowedKeys(
  body: unknown,
  allowedKeys: Set<string>
): { valid: boolean; error?: string; record?: Record<string, unknown> } {
  if (body === undefined || body === null) {
    return { valid: true, record: {} };
  }
  if (!isPlainRecord(body)) {
    return { valid: false, error: 'Corpo da requisição inválido.' };
  }

  for (const key of Object.keys(body)) {
    if (FORBIDDEN_SPOOF_OR_PERSONAL_KEYS.has(key)) {
      return {
        valid: false,
        error: `Campo não permitido pelo servidor: "${key}".`
      };
    }
    if (!allowedKeys.has(key)) {
      return {
        valid: false,
        error: `Campo não permitido para esta operação: "${key}".`
      };
    }
  }

  return { valid: true, record: body };
}

interface UpstreamCallResult {
  ok: boolean;
  status: number;
  data?: any;
  errorBody?: any;
  networkError?: boolean;
}

async function callCentralAdministraApi(
  fetchFn: typeof fetch,
  config: CentralSolicitacoesConfig,
  pathWithQuery: string,
  init: { method: 'GET' | 'POST' | 'PATCH'; body?: unknown }
): Promise<UpstreamCallResult> {
  const suffix =
    !pathWithQuery || pathWithQuery.startsWith('/') || pathWithQuery.startsWith('?')
      ? pathWithQuery
      : `/${pathWithQuery}`;
  const targetUrl = `${config.url}${suffix}`;
  try {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${config.token}`,
      Accept: 'application/json'
    };
    if (init.body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }

    const res = await fetchFn(targetUrl, {
      method: init.method,
      headers,
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
        ? AbortSignal.timeout(15000)
        : undefined
    });

    const text = await res.text();
    let parsed: any = null;
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = { message: text };
      }
    }

    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        errorBody: parsed
      };
    }

    return {
      ok: true,
      status: res.status,
      data: parsed
    };
  } catch {
    return {
      ok: false,
      status: 503,
      networkError: true
    };
  }
}

function mapUpstreamFailure(result: UpstreamCallResult): { status: number; payload: Record<string, unknown> } {
  if (result.networkError) {
    return {
      status: 503,
      payload: {
        error: 'Serviço central de solicitações de vistoria no Administra temporariamente indisponível.',
        code: 'CENTRAL_UNAVAILABLE'
      }
    };
  }

  const upstreamCode = String(result.errorBody?.code || '').toUpperCase();
  const upstreamMsg = String(
    result.errorBody?.error || result.errorBody?.message || result.errorBody?.details || ''
  );

  const isMissingDbFunction =
    upstreamCode === 'PGRST202' ||
    upstreamCode === '42883' ||
    upstreamCode === '42P01' ||
    upstreamCode === 'ADMINISTRA_FUNCTIONS_NOT_DEPLOYED' ||
    /function .* does not exist|could not find the function|could not find the table|not deployed|não implantad|rpc.*inexistent|endpoint.*not found/i.test(
      upstreamMsg
    );

  if (isMissingDbFunction || result.status === 409 || result.status === 501) {
    return {
      status: 409,
      payload: {
        error:
          maskSensitiveText(
            upstreamMsg && result.status === 409
              ? upstreamMsg
              : 'As funções de banco ou API central de solicitações no Administra ainda não estão implantadas.'
          ) || 'Funções centrais de solicitações no Administra não implantadas.',
        code: 'ADMINISTRA_FUNCTIONS_NOT_DEPLOYED'
      }
    };
  }

  if (result.status === 404) {
    const isGenuineRecordNotFound =
      upstreamCode === 'NOT_FOUND' || /solicitação.*não encontrada|registro não encontrado/i.test(upstreamMsg);
    if (isGenuineRecordNotFound) {
      return {
        status: 404,
        payload: {
          error: 'Solicitação de vistoria não encontrada na base central do Administra.',
          code: 'NOT_FOUND'
        }
      };
    }

    return {
      status: 409,
      payload: {
        error: 'As funções ou rota central de solicitações no Administra ainda não estão implantadas.',
        code: 'ADMINISTRA_FUNCTIONS_NOT_DEPLOYED'
      }
    };
  }

  if (result.status === 400 || result.status === 422) {
    return {
      status: 400,
      payload: {
        error: maskSensitiveText(upstreamMsg) || 'Dados inválidos para a operação solicitada.',
        code: 'INVALID_UPSTREAM_REQUEST'
      }
    };
  }

  if (result.status === 401 || result.status === 403) {
    return {
      status: 503,
      payload: {
        error: 'Falha de autenticação servidor-a-servidor na integração com o Administra.',
        code: 'CENTRAL_AUTH_ERROR'
      }
    };
  }

  return {
    status: 503,
    payload: {
      error: 'Serviço central de solicitações de vistoria no Administra temporariamente indisponível.',
      code: 'CENTRAL_UNAVAILABLE'
    }
  };
}

export function createSolicitacoesVistoriaRouter(deps: SolicitacoesVistoriaServerDeps = {}) {
  const router = express.Router();
  router.use(express.json({ limit: '64kb' }));

  router.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    if (err && (err instanceof SyntaxError || err.type === 'entity.parse.failed')) {
      res.status(400).json({ error: 'JSON inválido no corpo da requisição.' });
      return;
    }
    next(err);
  });

  const resolveAuthAndConfig = async (
    req: Request,
    res: Response
  ): Promise<{
    actor: ResolvedActor;
    centralConfig: CentralSolicitacoesConfig;
    fetchFn: typeof fetch;
  } | null> => {
    const supabaseAdmin = deps.getSupabaseAdmin
      ? deps.getSupabaseAdmin()
      : createFiscalizaServiceRoleClient();

    if (!supabaseAdmin) {
      res.status(503).json({
        error:
          'Serviço de autenticação institucional do Fiscaliza não configurado no servidor.',
        code: 'SERVICE_UNAVAILABLE'
      });
      return null;
    }

    const authRes = await resolveServerActor(req, supabaseAdmin);
    if (!authRes.actor) {
      res.status(authRes.status).json({ error: authRes.error || 'Não autorizado.' });
      return null;
    }

    const centralConfig = deps.getCentralConfig
      ? deps.getCentralConfig()
      : getDefaultCentralSolicitacoesConfig();

    if (!centralConfig) {
      res.status(503).json({
        error:
          'Integração central com solicitações de vistoria no Administra não configurada no servidor.',
        code: 'CENTRAL_CONFIG_MISSING'
      });
      return null;
    }

    const fetchFn = deps.fetchImpl || globalThis.fetch;
    if (typeof fetchFn !== 'function') {
      res.status(503).json({
        error: 'Cliente HTTP indisponível no servidor.',
        code: 'CENTRAL_UNAVAILABLE'
      });
      return null;
    }

    return { actor: authRes.actor, centralConfig, fetchFn };
  };

  // 1. GET /api/solicitacoes-vistoria
  router.get('/', async (req: Request, res: Response) => {
    try {
      const ctx = await resolveAuthAndConfig(req, res);
      if (!ctx) return;

      const rawStatus = typeof req.query.status === 'string' ? req.query.status.trim().toLowerCase() : '';
      const rawOrigem =
        typeof req.query.sistema_origem === 'string' ? req.query.sistema_origem.trim().toLowerCase() : '';

      if (rawStatus && rawStatus !== 'todos' && rawStatus !== 'todas') {
        if (containsCpfOrCnpj(rawStatus) || looksLikeSerializedJson(rawStatus)) {
          res.status(400).json({ error: 'Parâmetro "status" inválido.' });
          return;
        }
        if (!(SOLICITACAO_VISTORIA_STATUS_LIST as readonly string[]).includes(rawStatus)) {
          res.status(400).json({ error: 'Filtro "status" inválido.' });
          return;
        }
      }

      if (rawOrigem && rawOrigem !== 'todos' && rawOrigem !== 'todas') {
        if (containsCpfOrCnpj(rawOrigem) || looksLikeSerializedJson(rawOrigem)) {
          res.status(400).json({ error: 'Parâmetro "sistema_origem" inválido.' });
          return;
        }
        if (!(SOLICITACAO_VISTORIA_ORIGENS as readonly string[]).includes(rawOrigem)) {
          res.status(400).json({ error: 'Filtro "sistema_origem" inválido.' });
          return;
        }
      }

      const qs = new URLSearchParams();
      if (rawStatus && rawStatus !== 'todos' && rawStatus !== 'todas') {
        qs.set('status', rawStatus);
      }
      if (rawOrigem && rawOrigem !== 'todos' && rawOrigem !== 'todas') {
        qs.set('sistema_origem', rawOrigem);
      }

      const pathSuffix = qs.toString() ? `?${qs.toString()}` : '';
      const upstream = await callCentralAdministraApi(ctx.fetchFn, ctx.centralConfig, pathSuffix, {
        method: 'GET'
      });

      if (!upstream.ok) {
        const mapped = mapUpstreamFailure(upstream);
        res.status(mapped.status).json(mapped.payload);
        return;
      }

      const rawList = Array.isArray(upstream.data)
        ? upstream.data
        : Array.isArray(upstream.data?.solicitacoes)
        ? upstream.data.solicitacoes
        : [];

      const solicitacoes = rawList.map(sanitizeSolicitacaoOutput);
      const actorSummary: SolicitacaoVistoriaActorSummary = {
        userId: ctx.actor.userId,
        nome: ctx.actor.nome,
        perfil: ctx.actor.perfil,
        isAdmin: ctx.actor.isAdmin,
        canMutate: ctx.actor.canMutate
      };

      res.json({ solicitacoes, actor: actorSummary });
    } catch {
      res.status(500).json({ error: 'Erro interno ao consultar solicitações de vistoria.' });
    }
  });

  // 2. POST /api/solicitacoes-vistoria/:id/iniciar
  router.post('/:id/iniciar', async (req: Request, res: Response) => {
    try {
      const ctx = await resolveAuthAndConfig(req, res);
      if (!ctx) return;

      if (!ctx.actor.canMutate) {
        res.status(403).json({
          error: 'Perfil Visualizador possui acesso somente leitura e não pode iniciar planejamento.'
        });
        return;
      }

      const id = String(req.params.id || '').trim();
      if (!UUID_REGEX.test(id)) {
        res.status(400).json({ error: 'Identificador de solicitação inválido (UUID obrigatório).' });
        return;
      }

      const shape = validateAllowedKeys(req.body, new Set<string>());
      if (!shape.valid) {
        res.status(400).json({ error: shape.error });
        return;
      }

      const upstream = await callCentralAdministraApi(
        ctx.fetchFn,
        ctx.centralConfig,
        `/${id}/iniciar`,
        {
          method: 'POST',
          body: {
            status: 'em_planejamento',
            usuario_id: ctx.actor.userId
          }
        }
      );

      if (!upstream.ok) {
        const mapped = mapUpstreamFailure(upstream);
        res.status(mapped.status).json(mapped.payload);
        return;
      }

      const rawItem = upstream.data?.solicitacao ?? upstream.data;
      res.json({ solicitacao: sanitizeSolicitacaoOutput(rawItem) });
    } catch {
      res.status(500).json({ error: 'Erro interno ao iniciar planejamento da solicitação.' });
    }
  });

  // 3. POST /api/solicitacoes-vistoria/:id/concluir
  router.post('/:id/concluir', async (req: Request, res: Response) => {
    try {
      const ctx = await resolveAuthAndConfig(req, res);
      if (!ctx) return;

      if (!ctx.actor.canMutate) {
        res.status(403).json({
          error: 'Perfil Visualizador possui acesso somente leitura e não pode concluir solicitações.'
        });
        return;
      }

      const id = String(req.params.id || '').trim();
      if (!UUID_REGEX.test(id)) {
        res.status(400).json({ error: 'Identificador de solicitação inválido (UUID obrigatório).' });
        return;
      }

      if (!isPlainRecord(req.body)) {
        res.status(400).json({ error: 'Corpo da requisição inválido.' });
        return;
      }

      const shape = validateAllowedKeys(req.body, CONCLUIR_ALLOWED_KEYS);
      if (!shape.valid || !shape.record) {
        res.status(400).json({ error: shape.error });
        return;
      }

      const vistoriaId =
        typeof shape.record.vistoria_id === 'string' ? shape.record.vistoria_id.trim() : '';
      if (!UUID_REGEX.test(vistoriaId)) {
        res.status(400).json({ error: 'O campo "vistoria_id" deve ser um UUID válido.' });
        return;
      }

      const dataRealizacao =
        typeof shape.record.data_realizacao === 'string' ? shape.record.data_realizacao.trim() : '';
      if (!isValidIsoDate(dataRealizacao)) {
        res.status(400).json({
          error: 'O campo "data_realizacao" é obrigatório no formato AAAA-MM-DD.'
        });
        return;
      }

      let observacaoCampo = '';
      if (shape.record.observacao_campo !== undefined && shape.record.observacao_campo !== null) {
        if (typeof shape.record.observacao_campo !== 'string') {
          res.status(400).json({ error: 'O campo "observacao_campo" deve ser texto simples.' });
          return;
        }
        const trimmedObs = shape.record.observacao_campo.trim();
        if (trimmedObs.length > MAX_OBSERVACAO_LENGTH) {
          res.status(400).json({
            error: `O campo "observacao_campo" não pode ultrapassar ${MAX_OBSERVACAO_LENGTH} caracteres.`
          });
          return;
        }
        if (looksLikeSerializedJson(trimmedObs)) {
          res.status(400).json({
            error: 'O campo "observacao_campo" não pode conter JSON serializado.'
          });
          return;
        }
        if (containsCpfOrCnpj(trimmedObs)) {
          res.status(400).json({
            error: 'CPF/CNPJ não é permitido em "observacao_campo".'
          });
          return;
        }
        observacaoCampo = trimmedObs;
      }

      const equipeCheck = validateAndSanitizeEquipeInput(shape.record.equipe, ctx.actor);
      if (!equipeCheck.valid || !equipeCheck.equipe) {
        res.status(400).json({ error: equipeCheck.error });
        return;
      }

      const upstream = await callCentralAdministraApi(
        ctx.fetchFn,
        ctx.centralConfig,
        `/${id}/concluir`,
        {
          method: 'POST',
          body: {
            vistoria_id: vistoriaId,
            data_realizacao: dataRealizacao,
            equipe: equipeCheck.equipe,
            observacao_campo: observacaoCampo,
            concluido_por_usuario_id: ctx.actor.userId
          }
        }
      );

      if (!upstream.ok) {
        const mapped = mapUpstreamFailure(upstream);
        res.status(mapped.status).json(mapped.payload);
        return;
      }

      const rawItem = upstream.data?.solicitacao ?? upstream.data;
      res.json({ solicitacao: sanitizeSolicitacaoOutput(rawItem) });
    } catch {
      res.status(500).json({ error: 'Erro interno ao concluir solicitação de vistoria.' });
    }
  });

  // 4. PATCH /api/solicitacoes-vistoria/:id/observacao
  router.patch('/:id/observacao', async (req: Request, res: Response) => {
    try {
      const ctx = await resolveAuthAndConfig(req, res);
      if (!ctx) return;

      if (!ctx.actor.canMutate) {
        res.status(403).json({
          error: 'Perfil Visualizador possui acesso somente leitura e não pode editar observações.'
        });
        return;
      }

      const id = String(req.params.id || '').trim();
      if (!UUID_REGEX.test(id)) {
        res.status(400).json({ error: 'Identificador de solicitação inválido (UUID obrigatório).' });
        return;
      }

      if (!isPlainRecord(req.body)) {
        res.status(400).json({ error: 'Corpo da requisição inválido.' });
        return;
      }

      const shape = validateAllowedKeys(req.body, OBSERVACAO_ALLOWED_KEYS);
      if (!shape.valid || !shape.record) {
        res.status(400).json({ error: shape.error });
        return;
      }

      if (typeof shape.record.observacao_campo !== 'string') {
        res.status(400).json({ error: 'O campo "observacao_campo" deve ser texto simples.' });
        return;
      }

      const observacaoCampo = shape.record.observacao_campo.trim();
      if (observacaoCampo.length > MAX_OBSERVACAO_LENGTH) {
        res.status(400).json({
          error: `O campo "observacao_campo" não pode ultrapassar ${MAX_OBSERVACAO_LENGTH} caracteres.`
        });
        return;
      }
      if (looksLikeSerializedJson(observacaoCampo)) {
        res.status(400).json({
          error: 'O campo "observacao_campo" não pode conter JSON serializado.'
        });
        return;
      }
      if (containsCpfOrCnpj(observacaoCampo)) {
        res.status(400).json({
          error: 'CPF/CNPJ não é permitido em "observacao_campo".'
        });
        return;
      }

      // Consulta estado atual na API central para conferir conclusão e autoria/equipe executora
      const currentRes = await callCentralAdministraApi(
        ctx.fetchFn,
        ctx.centralConfig,
        `/${id}`,
        { method: 'GET' }
      );

      if (!currentRes.ok) {
        const mapped = mapUpstreamFailure(currentRes);
        res.status(mapped.status).json(mapped.payload);
        return;
      }

      const currentItem = sanitizeSolicitacaoOutput(currentRes.data?.solicitacao ?? currentRes.data);
      if (currentItem.status !== 'concluida') {
        res.status(409).json({
          error: 'A observação de campo pós-conclusão só pode ser editada quando a solicitação estiver concluída.',
          code: 'SOLICITACAO_NOT_CONCLUDED'
        });
        return;
      }

      if (!ctx.actor.isAdmin && !isActorMemberOfEquipe(currentItem.equipe, ctx.actor)) {
        res.status(403).json({
          error:
            'Apenas Administrador ou integrante da equipe executora (validado por ID institucional) pode editar a observação de campo.'
        });
        return;
      }

      const upstream = await callCentralAdministraApi(
        ctx.fetchFn,
        ctx.centralConfig,
        `/${id}/observacao`,
        {
          method: 'PATCH',
          body: {
            observacao_campo: observacaoCampo,
            atualizado_por_usuario_id: ctx.actor.userId
          }
        }
      );

      if (!upstream.ok) {
        const mapped = mapUpstreamFailure(upstream);
        res.status(mapped.status).json(mapped.payload);
        return;
      }

      const rawItem = upstream.data?.solicitacao ?? upstream.data;
      res.json({ solicitacao: sanitizeSolicitacaoOutput(rawItem) });
    } catch {
      res.status(500).json({ error: 'Erro interno ao atualizar observação de campo.' });
    }
  });

  return router;
}
