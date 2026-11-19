import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';
import { startServer } from '../../../server.ts';
import {
  createPendenciasApp,
  isValidServiceRoleKey,
  maskCpfCnpjInText,
  sanitizeReferenceIdValue
} from '../pendenciasApi.ts';

const IDS = {
  ADMIN: '11111111-1111-4111-8111-111111111111',
  ANALISTA: '22222222-2222-4222-8222-222222222222',
  ANALISTA_MISMATCH_PROFILE: '99999999-9999-4999-8999-999999999999',
  VISUALIZADOR: '33333333-3333-4333-8333-333333333333',
  INATIVO: '44444444-4444-4444-8444-444444444444',
  PEND_MINHA: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  PEND_COLEGA: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  PEND_ABERTA: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  PEND_MISMATCH: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  PEND_LEGADA_DOC_IDS: '12121212-1212-4121-8121-121212121212',
  EMP_UUID: '550e8400-e29b-41d4-a716-446655440000',
  HIST_1: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  HIST_2: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
  HIST_LEGADA_DOC: 'abababab-abab-4bab-8bab-abababababab'
};

interface MockState {
  writesAttempted: Array<{ table: string; op: string; payload?: unknown }>;
  historicoQueries: number;
  profiles: Array<{
    id: string;
    email: string;
    nome: string;
    perfil: string;
    status: string;
  }>;
  pendencias: Array<Record<string, any>>;
  historico: Array<Record<string, any>>;
}

function createBaseMockState(): MockState {
  return {
    writesAttempted: [],
    historicoQueries: 0,
    profiles: [
      {
        id: IDS.ADMIN,
        email: 'admin@sema.mt.gov.br',
        nome: 'Coordenadora Admin',
        perfil: 'administrador',
        status: 'ativo'
      },
      {
        id: IDS.ANALISTA_MISMATCH_PROFILE,
        email: 'analista@sema.mt.gov.br',
        nome: 'Analista Campo',
        perfil: 'analista',
        status: 'ativo'
      },
      {
        id: IDS.VISUALIZADOR,
        email: 'viewer@sema.mt.gov.br',
        nome: 'Auditor Visualizador',
        perfil: 'visualizador',
        status: 'ativo'
      },
      {
        id: IDS.INATIVO,
        email: 'inativo@sema.mt.gov.br',
        nome: 'Ex Servidor',
        perfil: 'administrador',
        status: 'inativo'
      }
    ],
    pendencias: [
      {
        id: IDS.PEND_MINHA,
        origem: 'fiscaliza',
        origem_ref_id: 'VIST-2026-0001',
        tipo: 'vistoria_campo',
        titulo: 'Pendência com CPF 123.456.789-00 no título',
        descricao: 'Verificar CNPJ 12.345.678/0001-99 e contato colega@sema.mt.gov.br',
        situacao: 'direcionada',
        responsavel_id: IDS.ANALISTA,
        direcionado_por: IDS.ADMIN,
        direcionado_em: '2026-11-10T12:00:00Z',
        criado_por: IDS.ADMIN,
        tipo_referencia: 'vistoria',
        referencia_id: 'REF-12345678901',
        empreendedor_id: 'EMP-MT-042',
        barragem_id: 'BAR-12345678901',
        resolvido_por: null,
        resolvido_em: null,
        created_at: '2026-11-10T10:00:00Z',
        updated_at: '2026-11-12T10:00:00Z'
      },
      {
        id: IDS.PEND_COLEGA,
        origem: 'fiscaliza',
        origem_ref_id: 'VIST-2026-0002',
        tipo: 'documentacao',
        titulo: 'Pendência atribuída ao Admin',
        descricao: 'Aguardar revisão final',
        situacao: 'em_analise',
        responsavel_id: IDS.ADMIN,
        direcionado_por: IDS.ADMIN,
        direcionado_em: '2026-11-09T12:00:00Z',
        criado_por: IDS.ADMIN,
        tipo_referencia: 'barragem',
        referencia_id: 'BAR-9988',
        empreendedor_id: null,
        barragem_id: 'BAR-9988',
        resolvido_por: null,
        resolvido_em: null,
        created_at: '2026-11-09T10:00:00Z',
        updated_at: '2026-11-11T10:00:00Z'
      },
      {
        id: IDS.PEND_ABERTA,
        origem: 'fiscaliza',
        origem_ref_id: null,
        tipo: 'anomalia_critica',
        titulo: 'Pendência aberta sem responsável',
        descricao: 'Disponível na lista geral',
        situacao: 'aberta',
        responsavel_id: null,
        direcionado_por: null,
        direcionado_em: null,
        criado_por: IDS.ANALISTA,
        tipo_referencia: null,
        referencia_id: null,
        empreendedor_id: null,
        barragem_id: null,
        resolvido_por: null,
        resolvido_em: null,
        created_at: '2026-11-08T10:00:00Z',
        updated_at: '2026-11-10T10:00:00Z'
      },
      {
        id: IDS.PEND_MISMATCH,
        origem: 'fiscaliza',
        origem_ref_id: 'LEGACY-01',
        tipo: 'outro',
        titulo: 'Pendência apontando para profileId divergente',
        descricao: 'Não deve aparecer em Minhas Pendências para authUser.id',
        situacao: 'direcionada',
        responsavel_id: IDS.ANALISTA_MISMATCH_PROFILE,
        direcionado_por: IDS.ADMIN,
        direcionado_em: '2026-11-07T12:00:00Z',
        criado_por: IDS.ADMIN,
        tipo_referencia: null,
        referencia_id: null,
        empreendedor_id: null,
        barragem_id: null,
        resolvido_por: null,
        resolvido_em: null,
        created_at: '2026-11-07T10:00:00Z',
        updated_at: '2026-11-07T10:00:00Z'
      },
      {
        id: IDS.PEND_LEGADA_DOC_IDS,
        origem: 'fiscaliza',
        origem_ref_id: '11.222.333/0001-44',
        tipo: 'correcao_dados',
        titulo: 'Registro antigo com CPF/CNPJ em colunas de ID',
        descricao: 'Manter IDs não pessoais intactos e ocultar documentos em IDs antigos',
        situacao: 'em_analise',
        responsavel_id: null,
        direcionado_por: null,
        direcionado_em: null,
        criado_por: IDS.ANALISTA,
        tipo_referencia: 'empreendedor',
        referencia_id: '987.654.321-00',
        empreendedor_id: '55566677788',
        barragem_id: '12345678000199',
        resolvido_por: null,
        resolvido_em: null,
        created_at: '2026-11-06T10:00:00Z',
        updated_at: '2026-11-06T10:00:00Z'
      }
    ],
    historico: [
      {
        id: IDS.HIST_1,
        pendencia_id: IDS.PEND_MINHA,
        acao: 'edicao',
        campo: 'barragem_id',
        valor_anterior: 'BAR-00011122233',
        valor_novo: 'BAR-12345678901',
        usuario_id: IDS.ADMIN,
        motivo: 'Conferido CPF 999.888.777-66 e email admin@sema.mt.gov.br na minuta',
        created_at: '2026-11-12T10:00:00Z'
      },
      {
        id: IDS.HIST_2,
        pendencia_id: IDS.PEND_MINHA,
        acao: 'mudanca_situacao',
        campo: 'situacao',
        valor_anterior: 'aberta',
        valor_novo: 'direcionada',
        usuario_id: IDS.ADMIN,
        motivo: 'Direcionado com CPF 11122233344',
        created_at: '2026-11-10T12:00:00Z'
      },
      {
        id: IDS.HIST_LEGADA_DOC,
        pendencia_id: IDS.PEND_LEGADA_DOC_IDS,
        acao: 'edicao',
        campo: 'empreendedor_id',
        valor_anterior: '55566677788',
        valor_novo: 'EMP-MT-042',
        usuario_id: IDS.ANALISTA,
        motivo: 'Migração de identificador antigo para código textual não pessoal',
        created_at: '2026-11-06T11:00:00Z'
      }
    ]
  };
}

function createMockSupabase(state: MockState): SupabaseClient {
  const tokens: Record<string, { id: string; email: string; user_metadata?: Record<string, any> }> = {
    'token-admin': { id: IDS.ADMIN, email: 'admin@sema.mt.gov.br' },
    'token-analista': {
      id: IDS.ANALISTA,
      email: 'analista@sema.mt.gov.br',
      // Spoof attempt inside user_metadata must be ignored
      user_metadata: { perfil: 'administrador', role: 'admin' }
    },
    'token-visualizador': { id: IDS.VISUALIZADOR, email: 'viewer@sema.mt.gov.br' },
    'token-inativo': { id: IDS.INATIVO, email: 'inativo@sema.mt.gov.br' },
    'token-sem-perfil': { id: '55555555-5555-4555-8555-555555555555', email: 'desconhecido@sema.mt.gov.br' }
  };

  function makeQuery(table: string) {
    let rows =
      table === 'perfis_usuarios'
        ? [...state.profiles]
        : table === 'pendencias'
        ? [...state.pendencias]
        : table === 'pendencias_historico'
        ? [...state.historico]
        : [];

    const builder: any = {
      select() {
        if (table === 'pendencias_historico') {
          state.historicoQueries += 1;
        }
        return builder;
      },
      eq(col: string, val: unknown) {
        rows = rows.filter(r => r[col] === val);
        return builder;
      },
      in(col: string, vals: unknown[]) {
        rows = rows.filter(r => vals.includes(r[col]));
        return builder;
      },
      order(col: string, opts?: { ascending?: boolean }) {
        const asc = opts?.ascending !== false;
        rows.sort((a, b) => {
          const av = String(a[col] || '');
          const bv = String(b[col] || '');
          return asc ? av.localeCompare(bv) : bv.localeCompare(av);
        });
        return builder;
      },
      maybeSingle: async () => ({
        data: rows.length > 0 ? rows[0] : null,
        error: null
      }),
      single: async () => ({
        data: rows.length > 0 ? rows[0] : null,
        error: rows.length > 0 ? null : { message: 'Not found' }
      }),
      then(resolve: (val: { data: any[]; error: null }) => void) {
        resolve({ data: rows, error: null });
      },
      insert(payload: unknown) {
        state.writesAttempted.push({ table, op: 'insert', payload });
        return builder;
      },
      update(payload: unknown) {
        state.writesAttempted.push({ table, op: 'update', payload });
        return builder;
      },
      upsert(payload: unknown) {
        state.writesAttempted.push({ table, op: 'upsert', payload });
        return builder;
      },
      delete() {
        state.writesAttempted.push({ table, op: 'delete' });
        return builder;
      }
    };
    return builder;
  }

  return {
    auth: {
      async getUser(token: string) {
        const found = tokens[token];
        if (!found) {
          return { data: { user: null }, error: { message: 'Invalid JWT' } };
        }
        return { data: { user: found }, error: null };
      },
      admin: {
        async getUserById(uid: string) {
          const matched = Object.values(tokens).find(u => u.id === uid);
          if (!matched) {
            return { data: { user: null }, error: { message: 'User not found' } };
          }
          return { data: { user: matched }, error: null };
        }
      }
    },
    from(table: string) {
      return makeQuery(table);
    }
  } as unknown as SupabaseClient;
}

async function withTestServer(
  mockClient: SupabaseClient | null,
  fn: (baseUrl: string) => Promise<void>
) {
  const app = createPendenciasApp({
    getSupabaseAdmin: () => mockClient
  });
  const server = http.createServer(app);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert(address && typeof address === 'object');
  const baseUrl = `http://127.0.0.1:${address.port}`;
  try {
    await fn(baseUrl);
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
}

async function requestJson(
  baseUrl: string,
  method: string,
  path: string,
  token?: string,
  body?: unknown
): Promise<{ status: number; json: any }> {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {})
    },
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

function makeFakeJwt(role: string): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ role, iss: 'supabase' })).toString('base64url');
  return `${header}.${payload}.signature_placeholder_12345`;
}

test('service_role key validation accepts service_role/sb_secret and rejects anon/publishable', () => {
  assert.equal(isValidServiceRoleKey(makeFakeJwt('service_role')), true);
  assert.equal(isValidServiceRoleKey('sb_secret_abcdef1234567890abcdef'), true);
  assert.equal(isValidServiceRoleKey(makeFakeJwt('anon')), false);
  assert.equal(isValidServiceRoleKey('sb_publishable_abcdef1234567890'), false);
  assert.equal(isValidServiceRoleKey(''), false);
});

test('fail closed 503 when server Supabase config is missing', async () => {
  await withTestServer(null, async baseUrl => {
    const res = await requestJson(baseUrl, 'GET', '/api/pendencias', 'token-admin');
    assert.equal(res.status, 503);
  });
});

test('authentication and active profile enforcement (401 / 403)', async () => {
  const state = createBaseMockState();
  const mock = createMockSupabase(state);

  await withTestServer(mock, async baseUrl => {
    const noAuth = await requestJson(baseUrl, 'GET', '/api/pendencias');
    assert.equal(noAuth.status, 401);

    const badToken = await requestJson(baseUrl, 'GET', '/api/pendencias', 'token-invalido');
    assert.equal(badToken.status, 401);

    const inactive = await requestJson(baseUrl, 'GET', '/api/pendencias', 'token-inativo');
    assert.equal(inactive.status, 403);

    const noProfile = await requestJson(baseUrl, 'GET', '/api/pendencias', 'token-sem-perfil');
    assert.equal(noProfile.status, 403);

    // Analista with spoofed admin in user_metadata must NOT become admin
    const analistaGeral = await requestJson(baseUrl, 'GET', '/api/pendencias?tab=geral', 'token-analista');
    assert.equal(analistaGeral.status, 200);
    assert.equal(analistaGeral.json.currentUser.isAdmin, false);
    assert.equal(analistaGeral.json.currentUser.perfil, 'analista');
  });
});

test('tabs behavior: minhas (canonical session id only), geral, and direcionado (admin only)', async () => {
  const state = createBaseMockState();
  const mock = createMockSupabase(state);

  await withTestServer(mock, async baseUrl => {
    // Minhas pendências: analista receives ONLY PEND_MINHA (canonical session id), not PEND_MISMATCH/PEND_COLEGA/PEND_ABERTA
    const minhas = await requestJson(baseUrl, 'GET', '/api/pendencias?tab=minhas', 'token-analista');
    assert.equal(minhas.status, 200);
    assert.deepEqual(
      minhas.json.pendencias.map((p: any) => p.id),
      [IDS.PEND_MINHA]
    );
    assert.equal(minhas.json.counts.minhas, 1);
    assert.equal(minhas.json.counts.direcionado, undefined);

    // Lista geral: analista and visualizador see all visible pendencias including colleagues
    const geralAnalista = await requestJson(baseUrl, 'GET', '/api/pendencias?tab=geral', 'token-analista');
    assert.equal(geralAnalista.status, 200);
    assert.equal(geralAnalista.json.pendencias.length, 5);

    const geralViewer = await requestJson(baseUrl, 'GET', '/api/pendencias?tab=geral', 'token-visualizador');
    assert.equal(geralViewer.status, 200);
    assert.equal(geralViewer.json.pendencias.length, 5);
    assert.equal(geralViewer.json.currentUser.canMutate, false);
    assert.equal(geralViewer.json.readOnlyMode, true);
    // Canonical referenced user name (Analista, whose profileId differs from authUser.id) must resolve via auth email -> perfis_usuarios without exposing emails
    assert.equal(geralViewer.json.usuariosResumo[IDS.ANALISTA]?.nome, 'Analista Campo');
    assert.equal(geralViewer.json.usuariosResumo[IDS.ANALISTA]?.email, undefined);
    assert.equal(JSON.stringify(geralViewer.json).includes('@'), false);

    // Admin sees user name and email for canonical authUser.id
    const geralAdmin = await requestJson(baseUrl, 'GET', '/api/pendencias?tab=geral', 'token-admin');
    assert.equal(geralAdmin.status, 200);
    assert.equal(geralAdmin.json.usuariosResumo[IDS.ANALISTA]?.nome, 'Analista Campo');
    assert.equal(geralAdmin.json.usuariosResumo[IDS.ANALISTA]?.email, 'analista@sema.mt.gov.br');

    // Direcionado tab blocked (403) for non-admins
    const dirAnalista = await requestJson(baseUrl, 'GET', '/api/pendencias?tab=direcionado', 'token-analista');
    assert.equal(dirAnalista.status, 403);
    const dirViewer = await requestJson(baseUrl, 'GET', '/api/pendencias?tab=direcionado', 'token-visualizador');
    assert.equal(dirViewer.status, 403);

    // Direcionado tab allowed for admin
    const dirAdmin = await requestJson(baseUrl, 'GET', '/api/pendencias?tab=direcionado', 'token-admin');
    assert.equal(dirAdmin.status, 200);
    assert.equal(dirAdmin.json.pendencias.length, 3);
    assert.equal(dirAdmin.json.counts.direcionado, 3);
  });
});

test('detail and historico validation, privacy (emails hidden from non-admins), CPF/CNPJ masking in texts & legacy IDs, and non-personal ID preservation', async () => {
  const state = createBaseMockState();
  const mock = createMockSupabase(state);

  await withTestServer(mock, async baseUrl => {
    const invalidId = await requestJson(baseUrl, 'GET', '/api/pendencias/nao-uuid/historico', 'token-analista');
    assert.equal(invalidId.status, 400);

    const queriesBeforeMissing = state.historicoQueries;
    const missing = await requestJson(
      baseUrl,
      'GET',
      '/api/pendencias/99999999-1111-4111-8111-111111111111/historico',
      'token-analista'
    );
    assert.equal(missing.status, 404);
    assert.equal(state.historicoQueries, queriesBeforeMissing, 'historico must not be queried for non-existent pendencia');

    // Non-admin reading detail + historico: no emails exposed, CPF/CNPJ masked in texts, text IDs preserved
    const histAnalista = await requestJson(
      baseUrl,
      'GET',
      `/api/pendencias/${IDS.PEND_MINHA}/historico`,
      'token-analista'
    );
    assert.equal(histAnalista.status, 200);
    const bodyStr = JSON.stringify(histAnalista.json);
    assert.equal(bodyStr.includes('@'), false, 'non-admin response must not expose emails');
    assert.equal(bodyStr.includes('123.456.789-00'), false);
    assert.equal(bodyStr.includes('12.345.678/0001-99'), false);
    assert.equal(bodyStr.includes('999.888.777-66'), false);
    assert.equal(bodyStr.includes('11122233344'), false);

    // Non-UUID text IDs must remain untouched in pendencia and historico ID diffs
    assert.equal(histAnalista.json.pendencia.origem, 'fiscaliza');
    assert.equal(histAnalista.json.pendencia.origem_ref_id, 'VIST-2026-0001');
    assert.equal(histAnalista.json.pendencia.referencia_id, 'REF-12345678901');
    assert.equal(histAnalista.json.pendencia.empreendedor_id, 'EMP-MT-042');
    assert.equal(histAnalista.json.pendencia.barragem_id, 'BAR-12345678901');
    assert.equal(histAnalista.json.historico[0].valor_anterior, 'BAR-00011122233');
    assert.equal(histAnalista.json.historico[0].valor_novo, 'BAR-12345678901');

    // Legacy pendencia & historico with numeric/formatted CPF/CNPJ in ID columns MUST never return raw document numbers
    const legadoList = await requestJson(baseUrl, 'GET', '/api/pendencias?tab=geral', 'token-admin');
    assert.equal(legadoList.status, 200);
    const legadoListStr = JSON.stringify(legadoList.json);
    assert.equal(legadoListStr.includes('55566677788'), false);
    assert.equal(legadoListStr.includes('12345678000199'), false);
    assert.equal(legadoListStr.includes('987.654.321-00'), false);
    assert.equal(legadoListStr.includes('11.222.333/0001-44'), false);
    assert.equal(legadoListStr.includes('BAR-12345678901'), true);
    assert.equal(legadoListStr.includes('REF-12345678901'), true);

    const legadoDetail = await requestJson(
      baseUrl,
      'GET',
      `/api/pendencias/${IDS.PEND_LEGADA_DOC_IDS}`,
      'token-analista'
    );
    assert.equal(legadoDetail.status, 200);
    assert.equal(legadoDetail.json.pendencia.empreendedor_id, '[documento protegido]');
    assert.equal(legadoDetail.json.pendencia.barragem_id, '[documento protegido]');
    assert.equal(legadoDetail.json.pendencia.referencia_id, '[documento protegido]');
    assert.equal(legadoDetail.json.pendencia.origem_ref_id, '[documento protegido]');

    const legadoHist = await requestJson(
      baseUrl,
      'GET',
      `/api/pendencias/${IDS.PEND_LEGADA_DOC_IDS}/historico`,
      'token-analista'
    );
    assert.equal(legadoHist.status, 200);
    assert.equal(legadoHist.json.historico[0].valor_anterior, '[documento protegido]');
    assert.equal(legadoHist.json.historico[0].valor_novo, 'EMP-MT-042');
    assert.equal(legadoHist.json.usuariosResumo[IDS.ANALISTA]?.nome, 'Analista Campo');
    assert.equal(JSON.stringify(legadoHist.json).includes('55566677788'), false);
    assert.equal(JSON.stringify(legadoHist.json).includes('@'), false);

    // Admin sees user emails in usuariosResumo
    const histAdmin = await requestJson(
      baseUrl,
      'GET',
      `/api/pendencias/${IDS.PEND_MINHA}/historico`,
      'token-admin'
    );
    assert.equal(histAdmin.status, 200);
    assert.equal(histAdmin.json.currentUser.email, 'admin@sema.mt.gov.br');
    assert.equal(histAdmin.json.usuariosResumo[IDS.ADMIN].email, 'admin@sema.mt.gov.br');

    // Historico is append-only / pendencias cannot be deleted
    const delHist = await requestJson(
      baseUrl,
      'DELETE',
      `/api/pendencias/${IDS.PEND_MINHA}/historico`,
      'token-admin'
    );
    assert.equal(delHist.status, 405);
    const delPend = await requestJson(baseUrl, 'DELETE', `/api/pendencias/${IDS.PEND_MINHA}`, 'token-admin');
    assert.equal(delPend.status, 405);
  });
});

test('sanitizeReferenceIdValue and maskCpfCnpjInText protect CPF/CNPJ including spaces and mixed separators while preserving UUIDs and non-personal text IDs', () => {
  const sample =
    'Barragem BAR-12345678901 UUID 550e8400-e29b-41d4-a716-446655440000 UUID-num 12345678-1234-4123-8123-123456789012 Tel (65) 99999-9999 Data 19/11/2026 CPF 123.456.789-00 CNPJ 12.345.678/0001-99 avulso 12345678901';
  const masked = maskCpfCnpjInText(sample)!;
  assert.ok(masked.includes('BAR-12345678901'));
  assert.ok(masked.includes('550e8400-e29b-41d4-a716-446655440000'));
  assert.ok(masked.includes('12345678-1234-4123-8123-123456789012'));
  assert.ok(masked.includes('(65) 99999-9999'));
  assert.ok(masked.includes('19/11/2026'));
  assert.equal(masked.includes('123.456.789-00'), false);
  assert.equal(masked.includes('12.345.678/0001-99'), false);
  assert.equal(masked.includes(' 12345678901'), false);

  // Formatos com espaços e separadores misturados em texto
  const mixedText =
    'Titular 123 456 789 00, outro 123 . 456 - 789 / 00, curto 123456789 00, empresa A 12 345 678 / 0001 - 99, empresa B 12.345-678 0001/99, empresa C 12345678 0001 99, rotulado CPF: 1234 567 8901 2026 e CNPJ 12 3456 7800 0199; processo PROC-2026/0012';
  const maskedMixed = maskCpfCnpjInText(mixedText)!;
  assert.equal(maskedMixed.includes('123 456 789 00'), false);
  assert.equal(maskedMixed.includes('123 . 456 - 789 / 00'), false);
  assert.equal(maskedMixed.includes('123456789 00'), false);
  assert.equal(maskedMixed.includes('12 345 678 / 0001 - 99'), false);
  assert.equal(maskedMixed.includes('12.345-678 0001/99'), false);
  assert.equal(maskedMixed.includes('12345678 0001 99'), false);
  assert.equal(maskedMixed.includes('1234 567 8901'), false);
  assert.equal(maskedMixed.includes('12 3456 7800 0199'), false);
  assert.ok(maskedMixed.includes('PROC-2026/0012'));
  assert.ok(maskedMixed.includes('2026'));

  // Exact CPF/CNPJ numeric, formatted, spaced or mixed-separator IDs are redacted
  assert.equal(sanitizeReferenceIdValue('12345678901'), '[documento protegido]');
  assert.equal(sanitizeReferenceIdValue('12345678000199'), '[documento protegido]');
  assert.equal(sanitizeReferenceIdValue('123.456.789-00'), '[documento protegido]');
  assert.equal(sanitizeReferenceIdValue('12.345.678/0001-99'), '[documento protegido]');
  assert.equal(sanitizeReferenceIdValue('123 456 789 00'), '[documento protegido]');
  assert.equal(sanitizeReferenceIdValue('123 . 456 - 789 / 00'), '[documento protegido]');
  assert.equal(sanitizeReferenceIdValue('12 345 678 / 0001 - 99'), '[documento protegido]');
  assert.equal(sanitizeReferenceIdValue('12345678 0001 99'), '[documento protegido]');
  assert.equal(sanitizeReferenceIdValue('CPF: 1234 567 8901'), '[documento protegido]');
  assert.equal(sanitizeReferenceIdValue('CNPJ - 12.345 678/0001-99'), '[documento protegido]');
  assert.equal(sanitizeReferenceIdValue('EMP-123.456.789-00'), 'EMP-***.***.***-**');
  assert.equal(sanitizeReferenceIdValue('EMP-123 456 789-00'), 'EMP-***.***.***-**');
  assert.equal(sanitizeReferenceIdValue('REF-12 345 678/0001 99'), 'REF-**.***.***/****-**');

  // Non-personal textual IDs and UUIDs are preserved untouched
  assert.equal(sanitizeReferenceIdValue(IDS.EMP_UUID), IDS.EMP_UUID);
  assert.equal(
    sanitizeReferenceIdValue('12345678-1234-4123-8123-123456789012'),
    '12345678-1234-4123-8123-123456789012'
  );
  assert.equal(sanitizeReferenceIdValue('BAR-12345678901'), 'BAR-12345678901');
  assert.equal(sanitizeReferenceIdValue('EMP-MT-042'), 'EMP-MT-042');
  assert.equal(sanitizeReferenceIdValue('VIST-2026-0001'), 'VIST-2026-0001');
  assert.equal(sanitizeReferenceIdValue('PROC-2026/0012'), 'PROC-2026/0012');
});

test('mutation routes reject spoofing, CPF/CNPJ, nested objects, serialized JSON, enforce RBAC, preserve text IDs, and block with 409 without any writes', async () => {
  const state = createBaseMockState();
  const mock = createMockSupabase(state);

  await withTestServer(mock, async baseUrl => {
    // 1. Visualizador blocked with 403
    const viewerCreate = await requestJson(baseUrl, 'POST', '/api/pendencias', 'token-visualizador', {
      titulo: 'Tentativa visualizador',
      tipo: 'vistoria_campo'
    });
    assert.equal(viewerCreate.status, 403);

    // 2. Spoofing rejected with 400
    const spoofOrigin = await requestJson(baseUrl, 'POST', '/api/pendencias', 'token-admin', {
      titulo: 'Teste spoofing',
      tipo: 'vistoria_campo',
      origem: 'notifica'
    });
    assert.equal(spoofOrigin.status, 400);

    const spoofAuthor = await requestJson(baseUrl, 'POST', '/api/pendencias', 'token-admin', {
      titulo: 'Teste spoofing autor',
      tipo: 'vistoria_campo',
      criado_por: IDS.VISUALIZADOR
    });
    assert.equal(spoofAuthor.status, 400);

    // 3. Nested object & serialized JSON rejected with 400
    const nestedObj = await requestJson(baseUrl, 'POST', '/api/pendencias', 'token-admin', {
      titulo: 'Teste payload',
      tipo: 'vistoria_campo',
      descricao: { nested: true }
    });
    assert.equal(nestedObj.status, 400);

    const serializedJson = await requestJson(baseUrl, 'POST', '/api/pendencias', 'token-admin', {
      titulo: 'Teste json string',
      tipo: 'vistoria_campo',
      descricao: '{"damIdentification":{"damName":"X"}}'
    });
    assert.equal(serializedJson.status, 400);

    // 4. CPF/CNPJ in input rejected with 400 (including spaces and mixed separators)
    const cpfInDesc = await requestJson(baseUrl, 'POST', '/api/pendencias', 'token-admin', {
      titulo: 'Pendência com CPF',
      tipo: 'vistoria_campo',
      descricao: 'Responsável 123.456.789-00'
    });
    assert.equal(cpfInDesc.status, 400);

    const cpfSpacedInDesc = await requestJson(baseUrl, 'POST', '/api/pendencias', 'token-admin', {
      titulo: 'Pendência com CPF espaçado',
      tipo: 'vistoria_campo',
      descricao: 'Documento 123 456 789 - 00 informado'
    });
    assert.equal(cpfSpacedInDesc.status, 400);

    const cnpjMixedInRef = await requestJson(baseUrl, 'POST', '/api/pendencias', 'token-admin', {
      titulo: 'Pendência com CNPJ misto em referência',
      tipo: 'vistoria_campo',
      referencia_id: 'REF-12 345 678/0001-99'
    });
    assert.equal(cnpjMixedInRef.status, 400);

    const cpfInId = await requestJson(baseUrl, 'POST', '/api/pendencias', 'token-admin', {
      titulo: 'Pendência com CPF em ID',
      tipo: 'vistoria_campo',
      empreendedor_id: '12345678901'
    });
    assert.equal(cpfInId.status, 400);

    const cpfSpacedInId = await requestJson(baseUrl, 'POST', '/api/pendencias', 'token-admin', {
      titulo: 'Pendência com CPF espaçado em ID',
      tipo: 'vistoria_campo',
      empreendedor_id: '123 456.789/00'
    });
    assert.equal(cpfSpacedInId.status, 400);

    // 5. Non-admin cannot assign responsavel_id on create (403) or call direcionar (403)
    const analistaAssign = await requestJson(baseUrl, 'POST', '/api/pendencias', 'token-analista', {
      titulo: 'Tentativa atribuir',
      tipo: 'vistoria_campo',
      responsavel_id: IDS.ANALISTA
    });
    assert.equal(analistaAssign.status, 403);

    const analistaDirecionar = await requestJson(
      baseUrl,
      'POST',
      `/api/pendencias/${IDS.PEND_ABERTA}/direcionar`,
      'token-analista',
      { responsavel_id: IDS.ANALISTA }
    );
    assert.equal(analistaDirecionar.status, 403);

    // 6. Non-admin cannot edit or change status of colleague's pendencia (403)
    const analistaEditColega = await requestJson(
      baseUrl,
      'PATCH',
      `/api/pendencias/${IDS.PEND_COLEGA}`,
      'token-analista',
      { titulo: 'Editando colega' }
    );
    assert.equal(analistaEditColega.status, 403);

    const analistaStatusColega = await requestJson(
      baseUrl,
      'PATCH',
      `/api/pendencias/${IDS.PEND_COLEGA}/situacao`,
      'token-analista',
      { situacao: 'resolvida' }
    );
    assert.equal(analistaStatusColega.status, 403);

    // 7. Invalid situacao rejected with 400; invalid target user rejected with 400
    const badSituacao = await requestJson(
      baseUrl,
      'PATCH',
      `/api/pendencias/${IDS.PEND_ABERTA}/situacao`,
      'token-analista',
      { situacao: 'arquivada' }
    );
    assert.equal(badSituacao.status, 400);

    const inactiveTarget = await requestJson(
      baseUrl,
      'POST',
      `/api/pendencias/${IDS.PEND_ABERTA}/direcionar`,
      'token-admin',
      { responsavel_id: IDS.INATIVO }
    );
    assert.equal(inactiveTarget.status, 400);

    // Divergent profileId (non-canonical) must be rejected when canonical authUser.id is required
    const mismatchProfileTarget = await requestJson(
      baseUrl,
      'POST',
      `/api/pendencias/${IDS.PEND_ABERTA}/direcionar`,
      'token-admin',
      { responsavel_id: IDS.ANALISTA_MISMATCH_PROFILE }
    );
    assert.equal(mismatchProfileTarget.status, 400);

    // 8. Valid payloads with non-UUID text IDs pass all 401/403/400 validations and return 409
    const validCreate = await requestJson(baseUrl, 'POST', '/api/pendencias', 'token-analista', {
      titulo: 'Pendência válida com IDs textuais',
      tipo: 'vistoria_campo',
      descricao: 'Acompanhar reparo no maciço',
      tipo_referencia: 'vistoria',
      origem_ref_id: 'VIST-2026-0099',
      referencia_id: 'DOC-SEMA-42',
      empreendedor_id: 'EMP-MT-123',
      barragem_id: 'BAR-12345678901',
      motivo: 'Solicitação inicial'
    });
    assert.equal(validCreate.status, 409);
    assert.equal(validCreate.json.readOnlyMode, true);

    const validEditOwn = await requestJson(
      baseUrl,
      'PATCH',
      `/api/pendencias/${IDS.PEND_MINHA}`,
      'token-analista',
      { barragem_id: 'BAR-NOVO-TEXTO-77', motivo: 'Ajuste de código textual' }
    );
    assert.equal(validEditOwn.status, 409);

    const validDirecionar = await requestJson(
      baseUrl,
      'POST',
      `/api/pendencias/${IDS.PEND_ABERTA}/direcionar`,
      'token-admin',
      { responsavel_id: IDS.ANALISTA, motivo: 'Atribuição para análise' }
    );
    assert.equal(validDirecionar.status, 409);

    const validResolveUnassigned = await requestJson(
      baseUrl,
      'PATCH',
      `/api/pendencias/${IDS.PEND_ABERTA}/situacao`,
      'token-analista',
      { situacao: 'resolvida', motivo: 'Conferência concluída' }
    );
    assert.equal(validResolveUnassigned.status, 409);

    // ZERO writes must have been attempted against Supabase
    assert.equal(state.writesAttempted.length, 0);
  });
});

test('startServer production path mounts real app routes, static datasets, SPA fallback, and /api/pendencias without fake callbacks', async () => {
  // Inspeção do projeto e ausência de repositório .git confirmaram que não existiam rotas /api/*
  // preexistentes no servidor antes de /api/pendencias (os demais módulos operam via SPA,
  // client SDK e arquivos estáticos locais). Nenhuma rota demonstrativa foi criada.
  const state = createBaseMockState();
  const mock = createMockSupabase(state);

  const distIndexPath = path.resolve(process.cwd(), 'dist', 'index.html');
  if (!fs.existsSync(distIndexPath)) {
    const { build } = await import('vite');
    await build({ logLevel: 'silent' });
  }

  const server = await startServer({
    isProduction: true,
    host: '127.0.0.1',
    port: 0,
    pendenciasDeps: { getSupabaseAdmin: () => mock }
  });

  const address = server.address();
  assert(address && typeof address === 'object');
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    const rootRes = await fetch(`${baseUrl}/`);
    assert.equal(rootRes.status, 200);
    const rootHtml = await rootRes.text();
    assert.ok(rootHtml.includes('Fiscaliza'));

    const manifestRes = await requestJson(baseUrl, 'GET', '/manifest.json');
    assert.equal(manifestRes.status, 200);
    assert.equal(manifestRes.json.short_name, 'Fiscaliza MT');

    const swRes = await fetch(`${baseUrl}/sw.js`);
    assert.equal(swRes.status, 200);
    assert.ok((await swRes.text()).includes('CACHE_NAME'));

    const logoRes = await fetch(`${baseUrl}/fiscaliza_logo.png`);
    assert.equal(logoRes.status, 200);
    assert.ok(Number(logoRes.headers.get('content-length')) > 0);

    const snisbRes = await fetch(`${baseUrl}/data/snisb.csv`);
    assert.equal(snisbRes.status, 200);
    assert.ok((await snisbRes.text()).length > 100);

    const aneelRes = await fetch(`${baseUrl}/data/aneel.csv`);
    assert.equal(aneelRes.status, 200);
    assert.ok((await aneelRes.text()).length > 100);

    const notificacoesRes = await fetch(`${baseUrl}/data/notificacoes.xlsx`);
    assert.equal(notificacoesRes.status, 200);
    assert.ok((await notificacoesRes.arrayBuffer()).byteLength > 1000);

    const mtMunRes = await requestJson(baseUrl, 'GET', '/data/mt-mun.json');
    assert.equal(mtMunRes.status, 200);
    assert.equal(mtMunRes.json.type, 'FeatureCollection');

    const pendRes = await requestJson(baseUrl, 'GET', '/api/pendencias?tab=minhas', 'token-analista');
    assert.equal(pendRes.status, 200);
    assert.equal(pendRes.json.pendencias.length, 1);

    const blockedCreateRes = await requestJson(baseUrl, 'POST', '/api/pendencias', 'token-analista', {
      titulo: 'Validacao em startServer prod',
      tipo: 'vistoria_campo'
    });
    assert.equal(blockedCreateRes.status, 409);

    const unknownApiRes = await requestJson(baseUrl, 'GET', '/api/inexistente');
    assert.equal(unknownApiRes.status, 404);

    const spaRes = await fetch(`${baseUrl}/rota-interna-spa`);
    assert.equal(spaRes.status, 200);
    assert.ok((await spaRes.text()).includes('Fiscaliza'));
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});

test('startServer development path preserves Vite routes alongside /api/pendencias', async () => {
  const state = createBaseMockState();
  const mock = createMockSupabase(state);

  const server = await startServer({
    isProduction: false,
    host: '127.0.0.1',
    port: 0,
    pendenciasDeps: { getSupabaseAdmin: () => mock }
  });

  const address = server.address();
  assert(address && typeof address === 'object');
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    const rootRes = await fetch(`${baseUrl}/`);
    assert.equal(rootRes.status, 200);
    assert.ok((await rootRes.text()).includes('Fiscaliza'));

    const snisbRes = await fetch(`${baseUrl}/data/snisb.csv`);
    assert.equal(snisbRes.status, 200);
    assert.ok((await snisbRes.text()).length > 100);

    const pendRes = await requestJson(baseUrl, 'GET', '/api/pendencias?tab=minhas', 'token-analista');
    assert.equal(pendRes.status, 200);
    assert.equal(pendRes.json.pendencias.length, 1);

    const unknownApiRes = await requestJson(baseUrl, 'GET', '/api/inexistente');
    assert.equal(unknownApiRes.status, 404);
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
