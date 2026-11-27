import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';
import { startServer } from '../../../server.ts';
import {
  ADMINISTRA_V2_ENDPOINTS,
  canonicalizeQueryParams,
  EMPTY_BODY_SHA256,
  encodeRfc3986,
  fetchAllAdministraBarragensV2,
  getDefaultAdministraS2sConfig,
  isValidS2sKeyId,
  normalizeAdministraApiBaseUrl,
  signS2sV2GetRequest,
  validateV2BarragensPageResponse,
  validateV2HealthResponse
} from '../administraS2sApi.ts';

const IDS = {
  ADMIN: '11111111-1111-4111-8111-111111111111',
  ANALISTA: '22222222-2222-4222-8222-222222222222',
  VISUALIZADOR: '33333333-3333-4333-8333-333333333333',
  INATIVO: '44444444-4444-4444-8444-444444444444',
  SEM_PERFIL: '66666666-6666-4666-8666-666666666666'
};

function generateEphemeralEd25519Keypair() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  return { publicKey, privateKeyPem };
}

function createMockSupabaseAdmin() {
  const tokenUsers: Record<string, { id: string; email: string }> = {
    'token-admin': { id: IDS.ADMIN, email: 'admin@sema.mt.gov.br' },
    'token-analista': { id: IDS.ANALISTA, email: 'analista@sema.mt.gov.br' },
    'token-viewer': { id: IDS.VISUALIZADOR, email: 'viewer@sema.mt.gov.br' },
    'token-inativo': { id: IDS.INATIVO, email: 'inativo@sema.mt.gov.br' },
    'token-sem-perfil': { id: IDS.SEM_PERFIL, email: 'semperfil@sema.mt.gov.br' }
  };

  const profiles = [
    {
      id: IDS.ADMIN,
      email: 'admin@sema.mt.gov.br',
      nome: 'Admin Institucional',
      perfil: 'administrador',
      status: 'ativo'
    },
    {
      id: IDS.ANALISTA,
      email: 'analista@sema.mt.gov.br',
      nome: 'Analista Institucional',
      perfil: 'analista',
      status: 'ativo'
    },
    {
      id: IDS.VISUALIZADOR,
      email: 'viewer@sema.mt.gov.br',
      nome: 'Visualizador Institucional',
      perfil: 'visualizador',
      status: 'ativo'
    },
    {
      id: IDS.INATIVO,
      email: 'inativo@sema.mt.gov.br',
      nome: 'Usuario Inativo',
      perfil: 'analista',
      status: 'inativo'
    }
  ];

  return {
    auth: {
      async getUser(jwt: string) {
        const user = tokenUsers[jwt];
        if (!user) {
          return { data: { user: null }, error: { message: 'Invalid token' } };
        }
        return { data: { user }, error: null };
      }
    },
    from(table: string) {
      assert.equal(table, 'perfis_usuarios');
      let eqCol = '';
      let eqVal = '';
      const chain: any = {
        select() {
          return chain;
        },
        eq(col: string, val: string) {
          eqCol = col;
          eqVal = String(val).toLowerCase();
          return chain;
        },
        ilike(col: string, val: string) {
          eqCol = col;
          eqVal = String(val).toLowerCase();
          return chain;
        },
        async maybeSingle() {
          const found =
            profiles.find(p => String((p as any)[eqCol] || '').toLowerCase() === eqVal) || null;
          return { data: found, error: null };
        }
      };
      return chain;
    }
  } as unknown as SupabaseClient;
}

async function requestJson(
  baseUrl: string,
  reqPath: string,
  options: { method?: string; token?: string; body?: unknown } = {}
): Promise<{ status: number; body: any }> {
  const url = new URL(reqPath, baseUrl);
  return await new Promise((resolve, reject) => {
    const req = http.request(
      url,
      {
        method: options.method || 'GET',
        headers: {
          ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
          ...(options.body ? { 'Content-Type': 'application/json' } : {})
        }
      },
      res => {
        const chunks: Buffer[] = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          let parsed: any = text;
          try {
            parsed = text ? JSON.parse(text) : null;
          } catch {}
          resolve({ status: res.statusCode || 0, body: parsed });
        });
      }
    );
    req.on('error', reject);
    if (options.body) {
      req.write(JSON.stringify(options.body));
    }
    req.end();
  });
}

test('codifica RFC 3986 antes de ordenar e normaliza ADMINISTRA_API_URL com ou sem sufixo /api/v2 contra vetor independente', () => {
  assert.equal(
    EMPTY_BODY_SHA256,
    'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
  );
  assert.equal(encodeRfc3986("a!b'c(d)e*f "), 'a%21b%27c%28d%29e%2Af%20');

  // Encoding-before-sorting: '/' (%2F, charCode 37) ordena antes de '-' (charCode 45)
  const encodedSorted = canonicalizeQueryParams([
    ['a-1', 'v'],
    ['a/1', 'v'],
    ['cursor', 'id-1'],
    ['cursor', 'id/2'],
    ['special', "!'()* "],
    ['z', '1']
  ]);
  assert.equal(
    encodedSorted,
    'a%2F1=v&a-1=v&cursor=id%2F2&cursor=id-1&special=%21%27%28%29%2A%20&z=1'
  );

  // Normalização de URL base sem duplicar /api/v2
  assert.equal(
    normalizeAdministraApiBaseUrl('https://administra.exemplo.invalid'),
    'https://administra.exemplo.invalid'
  );
  assert.equal(
    normalizeAdministraApiBaseUrl('https://administra.exemplo.invalid/api/v2'),
    'https://administra.exemplo.invalid'
  );
  assert.equal(
    normalizeAdministraApiBaseUrl('https://administra.exemplo.invalid/api/v2/'),
    'https://administra.exemplo.invalid'
  );
  assert.equal(
    normalizeAdministraApiBaseUrl('https://gateway.exemplo.invalid/proxy/api/v2/'),
    'https://gateway.exemplo.invalid/proxy'
  );

  const { publicKey, privateKeyPem } = generateEphemeralEd25519Keypair();
  const fixedJti = '11111111-1111-4111-8111-111111111111';

  // Vetor independente literal (construído manualmente sem usar helpers do cliente)
  const independentCanonicalBarragens =
    'S2S-V2\n' +
    'GET\n' +
    '/api/v2/barragens\n' +
    'cursor=cur%2F2%20%21%28a%29&limit=500\n' +
    '\n' +
    'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855\n' +
    'kid-fiscaliza-test\n' +
    '1732560000\n' +
    '11111111-1111-4111-8111-111111111111\n' +
    '|';

  for (const apiUrl of [
    'https://administra.exemplo.invalid',
    'https://administra.exemplo.invalid/api/v2',
    'https://administra.exemplo.invalid/api/v2/'
  ]) {
    const signed = signS2sV2GetRequest({
      config: {
        apiUrl,
        keyId: 'kid-fiscaliza-test',
        privateKeyPem
      },
      endpoint: ADMINISTRA_V2_ENDPOINTS.BARRAGENS,
      queryParams: { limit: 500, cursor: 'cur/2 !(a)', q: 'ignorado' },
      nowSeconds: () => 1732560000,
      randomUuid: () => fixedJti
    });

    assert.equal(
      signed.url,
      'https://administra.exemplo.invalid/api/v2/barragens?cursor=cur%2F2%20%21%28a%29&limit=500'
    );
    assert.equal(signed.canonicalMessage, independentCanonicalBarragens);
    assert.equal(
      crypto.verify(
        null,
        Buffer.from(independentCanonicalBarragens, 'utf8'),
        publicKey,
        Buffer.from(signed.headers['x-s2s-signature'], 'base64url')
      ),
      true
    );
  }

  // Vetor independente literal para /api/v2/health com sufixo /api/v2 na URL base
  const independentCanonicalHealth =
    'S2S-V2\n' +
    'GET\n' +
    '/api/v2/health\n' +
    '\n' +
    '\n' +
    'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855\n' +
    'kid-fiscaliza-test\n' +
    '1732560005\n' +
    '22222222-2222-4222-8222-222222222222\n' +
    '|';

  const signedHealth = signS2sV2GetRequest({
    config: {
      apiUrl: 'https://administra.exemplo.invalid/api/v2/',
      keyId: 'kid-fiscaliza-test',
      privateKeyPem
    },
    endpoint: ADMINISTRA_V2_ENDPOINTS.HEALTH,
    nowSeconds: () => 1732560005,
    randomUuid: () => '22222222-2222-4222-8222-222222222222'
  });
  assert.equal(signedHealth.url, 'https://administra.exemplo.invalid/api/v2/health');
  assert.equal(
    crypto.verify(
      null,
      Buffer.from(independentCanonicalHealth, 'utf8'),
      publicKey,
      Buffer.from(signedHealth.headers['x-s2s-signature'], 'base64url')
    ),
    true
  );
});

test('gera novo jti por chamada, omite q/Authorization/apikey/x-consumer-* e bloqueia endpoints não autorizados', () => {
  const { privateKeyPem } = generateEphemeralEd25519Keypair();
  const config = {
    apiUrl: 'https://administra.exemplo.invalid/api/v2',
    keyId: 'kid-ephemeral-1',
    privateKeyPem
  };

  const sign1 = signS2sV2GetRequest({
    config,
    endpoint: ADMINISTRA_V2_ENDPOINTS.BARRAGENS,
    queryParams: { limit: 500, cursor: 'page(2)!', q: 'proibido' },
    nowSeconds: () => 1732560100
  });
  const sign2 = signS2sV2GetRequest({
    config,
    endpoint: ADMINISTRA_V2_ENDPOINTS.BARRAGENS,
    queryParams: { limit: 500, cursor: 'page(2)!' },
    nowSeconds: () => 1732560100
  });

  const url1 = new URL(sign1.url);
  assert.equal(url1.pathname, '/api/v2/barragens');
  assert.equal(url1.searchParams.has('q'), false);
  assert.equal(sign1.headers['x-s2s-key-id'], 'kid-ephemeral-1');
  assert.equal(sign1.headers['x-s2s-timestamp'], '1732560100');
  assert.equal(sign1.headers['x-s2s-body-sha256'], EMPTY_BODY_SHA256);
  assert.match(
    sign1.headers['x-s2s-jti'],
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  );
  assert.notEqual(sign1.headers['x-s2s-jti'], sign2.headers['x-s2s-jti']);

  const lowerHeaderKeys = Object.keys(sign1.headers).map(k => k.toLowerCase());
  assert.equal(lowerHeaderKeys.includes('authorization'), false);
  assert.equal(lowerHeaderKeys.includes('apikey'), false);
  assert.equal(lowerHeaderKeys.includes('content-type'), false);
  assert.equal(lowerHeaderKeys.some(k => k.startsWith('x-consumer-')), false);

  assert.throws(() =>
    signS2sV2GetRequest({
      config,
      endpoint: '/api/v2/empreendedores' as any
    })
  );
});

test('pagina /api/v2/barragens com DTO confirmado de 21 campos, valida assinatura independente e rejeita respostas inválidas', async () => {
  const { publicKey, privateKeyPem } = generateEphemeralEd25519Keypair();
  const config = {
    apiUrl: 'https://administra.exemplo.invalid/api/v2',
    keyId: 'kid-ephemeral-2',
    privateKeyPem
  };

  const seenJtis = new Set<string>();
  const requestedUrls: string[] = [];

  const fetchPaged: typeof fetch = async (input, init) => {
    const urlStr = String(input);
    requestedUrls.push(urlStr);
    const parsedUrl = new URL(urlStr);
    assert.equal(parsedUrl.pathname, '/api/v2/barragens');
    assert.equal(parsedUrl.searchParams.get('limit'), '500');
    assert.equal(parsedUrl.searchParams.has('q'), false);

    const headers = (init?.headers || {}) as Record<string, string>;
    const jti = headers['x-s2s-jti'];
    assert.equal(seenJtis.has(jti), false);
    seenJtis.add(jti);

    const cursor = parsedUrl.searchParams.get('cursor');
    const expectedQuery = cursor ? `cursor=${cursor}&limit=500` : 'limit=500';
    const expectedCanonicalLiteral =
      `S2S-V2\nGET\n/api/v2/barragens\n${expectedQuery}\n\n` +
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855\n' +
      `kid-ephemeral-2\n1732560200\n${jti}\n|`;

    assert.equal(
      crypto.verify(
        null,
        Buffer.from(expectedCanonicalLiteral, 'utf8'),
        publicKey,
        Buffer.from(headers['x-s2s-signature'], 'base64url')
      ),
      true
    );

    if (!cursor) {
      return new Response(
        JSON.stringify({
          success: true,
          apiVersion: '2.0',
          items: [
            {
              id: 'bar-1',
              nome: 'Barragem P1',
              car: 'MT-5107909-AAA111',
              uf: 'MT',
              municipio: 'Sinop',
              municipioIbge: '5107909',
              empreendedorId: 'emp-1',
              empreendimento: 'Empreendimento ***',
              processo: 'PROC-2026/001',
              snisb: 'SNISB-101',
              cursoAgua: 'Córrego Um',
              latitude: -11.8641,
              longitude: -55.5023,
              altura: 14.2,
              volume: 420000,
              danoPotencial: 'Médio',
              categoriaRisco: 'Baixo',
              classificadaEm: '2026-06-10T12:00:00.000Z',
              situacao: 'Ativa',
              createdAt: '2026-01-10T10:00:00.000Z',
              updatedAt: '2026-10-15T14:30:00.000Z'
            }
          ],
          pagination: {
            limit: 500,
            hasMore: true,
            nextCursor: 'cursor-page-2'
          },
          maskingPolicy: 'masked_pii_v2'
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    assert.equal(cursor, 'cursor-page-2');
    return new Response(
      JSON.stringify({
        success: true,
        apiVersion: '2.0',
        items: [
          {
            id: 'bar-2',
            nome: 'Barragem P2',
            car: null,
            uf: 'MT',
            municipio: 'Sorriso',
            municipioIbge: null,
            empreendedorId: null,
            empreendimento: null,
            processo: null,
            snisb: null,
            cursoAgua: null,
            latitude: null,
            longitude: null,
            altura: null,
            volume: null,
            danoPotencial: null,
            categoriaRisco: null,
            classificadaEm: null,
            situacao: null,
            createdAt: null,
            updatedAt: null
          }
        ],
        pagination: {
          limit: 500,
          hasMore: false,
          nextCursor: null
        },
        maskingPolicy: 'masked_pii_v2'
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  };

  const okRes = await fetchAllAdministraBarragensV2({
    fetchFn: fetchPaged,
    config,
    nowSeconds: () => 1732560200
  });
  assert.equal(okRes.ok, true);
  if (okRes.ok) {
    assert.equal(okRes.pagesFetched, 2);
    assert.equal(okRes.items.length, 2);
    assert.equal(okRes.items[0].cursoAgua, 'Córrego Um');
    assert.equal(okRes.items[0].altura, 14.2);
    assert.equal(okRes.items[0].volume, 420000);
    assert.equal(okRes.items[0].car, 'MT-5107909-AAA111');
    assert.equal(okRes.items[0].municipioIbge, '5107909');
    assert.equal(okRes.items[0].snisb, 'SNISB-101');
    assert.equal('cotaCoroamentoMetros' in okRes.items[0], false);
    assert.equal('administraId' in okRes.items[0], false);
    assert.equal('sistemaOrigem' in okRes.items[0], false);
    assert.equal('baciaHidrografica' in okRes.items[0], false);
    assert.equal('coordenadas' in okRes.items[0], false);
    assert.equal(okRes.items[1].nome, 'Barragem P2');
    assert.equal(okRes.items[1].cursoAgua, null);
  }
  assert.equal(seenJtis.size, 2);
  assert.equal(requestedUrls.some(u => u.includes('empreendedores')), false);

  const fetchRepeatedCursor: typeof fetch = async () =>
    new Response(
      JSON.stringify({
        success: true,
        apiVersion: '2.0',
        items: [{ id: 'bar-1', nome: 'Barragem Repetida' }],
        pagination: { limit: 500, hasMore: true, nextCursor: 'loop-cursor' },
        maskingPolicy: 'masked_pii_v2'
      }),
      { status: 200 }
    );
  const repeatedRes = await fetchAllAdministraBarragensV2({
    fetchFn: fetchRepeatedCursor,
    config
  });
  assert.equal(repeatedRes.ok, false);
  if (!repeatedRes.ok) {
    assert.equal(repeatedRes.code, 'REPEATED_CURSOR');
  }

  let pageCounter = 0;
  const fetchTooManyPages: typeof fetch = async () => {
    pageCounter += 1;
    return new Response(
      JSON.stringify({
        success: true,
        apiVersion: '2.0',
        items: [{ id: `bar-${pageCounter}`, nome: `Barragem ${pageCounter}` }],
        pagination: { limit: 500, hasMore: true, nextCursor: `cur-${pageCounter}` },
        maskingPolicy: 'masked_pii_v2'
      }),
      { status: 200 }
    );
  };
  const limitRes = await fetchAllAdministraBarragensV2({
    fetchFn: fetchTooManyPages,
    config,
    maxPages: 2
  });
  assert.equal(limitRes.ok, false);
  if (!limitRes.ok) {
    assert.equal(limitRes.code, 'PAGINATION_LIMIT_EXCEEDED');
  }

  assert.equal(validateV2HealthResponse({ success: false, apiVersion: '2.0' }).valid, false);
  assert.equal(validateV2HealthResponse({ success: true, apiVersion: '1.0' }).valid, false);
  assert.equal(validateV2HealthResponse({ success: true, apiVersion: '2.0' }).valid, true);

  assert.equal(
    validateV2BarragensPageResponse({
      success: true,
      apiVersion: '2.0',
      items: [{ id: '1', nome: 'X', altura: 'invalido' }],
      pagination: { limit: 500, hasMore: false, nextCursor: null },
      maskingPolicy: 'masked'
    }).valid,
    false
  );
  assert.equal(
    validateV2BarragensPageResponse({
      success: true,
      apiVersion: '2.0',
      items: [{ id: '1', nome: 'X', latitude: 'nao-numero' }],
      pagination: { limit: 500, hasMore: false, nextCursor: null },
      maskingPolicy: 'masked'
    }).valid,
    false
  );
  assert.equal(
    validateV2BarragensPageResponse({
      success: true,
      apiVersion: '2.0',
      items: [{ id: '1', nome: 'X' }],
      pagination: { limit: 500, hasMore: true, nextCursor: null },
      maskingPolicy: 'masked'
    }).valid,
    false
  );
});

test('rotas /api/administra exigem sessão, mantêm modo local sem chamadas externas quando não configurado e mapeiam 401/403/409/timeout', async () => {
  const { privateKeyPem } = generateEphemeralEd25519Keypair();
  const mockSupabase = createMockSupabaseAdmin();

  const prevApiUrl = process.env.ADMINISTRA_API_URL;
  const prevKeyId = process.env.FISCALIZA_S2S_KEY_ID;
  const prevPem = process.env.FISCALIZA_S2S_PRIVATE_KEY_PEM;
  const prevLegacyKey = process.env.FISCALIZA_S2S_PRIVATE_KEY;
  const prevForbiddenToken = process.env.ADMINISTRA_API_TOKEN;
  const prevSolicToken = process.env.SOLICITACOES_SERVICE_TOKEN;
  delete process.env.ADMINISTRA_API_URL;
  delete process.env.FISCALIZA_S2S_KEY_ID;
  delete process.env.FISCALIZA_S2S_PRIVATE_KEY_PEM;
  process.env.FISCALIZA_S2S_PRIVATE_KEY = privateKeyPem;
  process.env.ADMINISTRA_API_TOKEN = '__DUMMY_LEGACY_TOKEN__';
  process.env.SOLICITACOES_SERVICE_TOKEN = '__DUMMY_SOLIC_TOKEN__';

  // Sem _PEM não configura mesmo que FISCALIZA_S2S_PRIVATE_KEY exista
  process.env.ADMINISTRA_API_URL = 'https://administra.exemplo.invalid/api/v2';
  process.env.FISCALIZA_S2S_KEY_ID = 'kid-no-pem-suffix';
  assert.equal(getDefaultAdministraS2sConfig(), null);

  delete process.env.ADMINISTRA_API_URL;
  delete process.env.FISCALIZA_S2S_KEY_ID;
  delete process.env.FISCALIZA_S2S_PRIVATE_KEY;

  let unconfiguredFetchCalls = 0;
  const serverUnconfigured = await startServer({
    isProduction: true,
    port: 0,
    host: '127.0.0.1',
    administraDeps: {
      getSupabaseAdmin: () => mockSupabase,
      fetchImpl: async () => {
        unconfiguredFetchCalls += 1;
        throw new Error('fetch externo não deve ser chamado sem configuração S2S válida');
      }
    }
  });

  try {
    const addr = serverUnconfigured.address() as any;
    const baseUrl = `http://127.0.0.1:${addr.port}`;

    assert.equal((await requestJson(baseUrl, '/api/administra/health')).status, 401);
    assert.equal(
      (await requestJson(baseUrl, '/api/administra/barragens', { token: 'token-inativo' })).status,
      403
    );
    assert.equal(
      (await requestJson(baseUrl, '/api/administra/barragens', { token: 'token-sem-perfil' })).status,
      403
    );
    assert.equal(
      (
        await requestJson(baseUrl, '/api/administra/barragens', {
          method: 'POST',
          token: 'token-admin',
          body: {}
        })
      ).status,
      405
    );

    const healthLocal = await requestJson(baseUrl, '/api/administra/health', {
      token: 'token-viewer'
    });
    assert.equal(healthLocal.status, 200);
    assert.equal(healthLocal.body.configured, false);
    assert.equal(healthLocal.body.mode, 'local');

    const barragensLocal = await requestJson(baseUrl, '/api/administra/barragens', {
      token: 'token-analista'
    });
    assert.equal(barragensLocal.status, 200);
    assert.equal(barragensLocal.body.configured, false);
    assert.equal(barragensLocal.body.mode, 'local');
    assert.deepEqual(barragensLocal.body.items, []);
    assert.equal(unconfiguredFetchCalls, 0);
  } finally {
    await new Promise<void>(resolve => serverUnconfigured.close(() => resolve()));
    if (prevApiUrl === undefined) delete process.env.ADMINISTRA_API_URL;
    else process.env.ADMINISTRA_API_URL = prevApiUrl;
    if (prevKeyId === undefined) delete process.env.FISCALIZA_S2S_KEY_ID;
    else process.env.FISCALIZA_S2S_KEY_ID = prevKeyId;
    if (prevPem === undefined) delete process.env.FISCALIZA_S2S_PRIVATE_KEY_PEM;
    else process.env.FISCALIZA_S2S_PRIVATE_KEY_PEM = prevPem;
    if (prevLegacyKey === undefined) delete process.env.FISCALIZA_S2S_PRIVATE_KEY;
    else process.env.FISCALIZA_S2S_PRIVATE_KEY = prevLegacyKey;
    if (prevForbiddenToken === undefined) delete process.env.ADMINISTRA_API_TOKEN;
    else process.env.ADMINISTRA_API_TOKEN = prevForbiddenToken;
    if (prevSolicToken === undefined) delete process.env.SOLICITACOES_SERVICE_TOKEN;
    else process.env.SOLICITACOES_SERVICE_TOKEN = prevSolicToken;
  }

  let upstreamMode: 'ok' | '401' | '403' | '409' | 'invalid' | 'timeout' = 'ok';

  const serverConfigured = await startServer({
    isProduction: true,
    port: 0,
    host: '127.0.0.1',
    administraDeps: {
      getSupabaseAdmin: () => mockSupabase,
      getS2sConfig: () => ({
        apiUrl: 'https://administra.exemplo.invalid/api/v2',
        keyId: 'kid-server-test',
        privateKeyPem
      }),
      timeoutMs: 40,
      fetchImpl: async (input, init) => {
        const url = new URL(String(input));
        assert.equal(url.pathname.startsWith('/api/v2/api/v2'), false);
        if (upstreamMode === '401') {
          return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 });
        }
        if (upstreamMode === '403') {
          return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403 });
        }
        if (upstreamMode === '409') {
          return new Response(JSON.stringify({ error: 'replay conflict' }), { status: 409 });
        }
        if (upstreamMode === 'invalid') {
          return new Response('{bad-json', { status: 200 });
        }
        if (upstreamMode === 'timeout') {
          return await new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => {
              const err = new Error('The operation was aborted');
              err.name = 'AbortError';
              reject(err);
            });
          });
        }

        if (url.pathname === '/api/v2/health') {
          return new Response(JSON.stringify({ success: true, apiVersion: '2.0' }), {
            status: 200
          });
        }

        return new Response(
          JSON.stringify({
            success: true,
            apiVersion: '2.0',
            items: [
              {
                id: 'bar-ok',
                nome: 'Barragem V2',
                uf: 'MT',
                municipio: 'Cuiabá',
                cursoAgua: 'Rio Coxipó',
                altura: 11.5
              }
            ],
            pagination: { limit: 500, hasMore: false, nextCursor: null },
            maskingPolicy: 'masked_pii_v2'
          }),
          { status: 200 }
        );
      }
    }
  });

  try {
    const addr = serverConfigured.address() as any;
    const baseUrl = `http://127.0.0.1:${addr.port}`;

    upstreamMode = 'ok';
    const healthOk = await requestJson(baseUrl, '/api/administra/health', { token: 'token-admin' });
    assert.equal(healthOk.status, 200);
    assert.equal(healthOk.body.configured, true);
    assert.equal(healthOk.body.reachable, true);

    const barOk = await requestJson(baseUrl, '/api/administra/barragens', { token: 'token-analista' });
    assert.equal(barOk.status, 200);
    assert.equal(barOk.body.items.length, 1);
    assert.equal(barOk.body.items[0].nome, 'Barragem V2');
    assert.equal(barOk.body.items[0].cursoAgua, 'Rio Coxipó');

    upstreamMode = '401';
    const res401 = await requestJson(baseUrl, '/api/administra/barragens', { token: 'token-analista' });
    assert.equal(res401.status, 502);
    assert.equal(res401.body.code, 'S2S_AUTH_REJECTED');

    upstreamMode = '403';
    const res403 = await requestJson(baseUrl, '/api/administra/health', { token: 'token-analista' });
    assert.equal(res403.status, 502);
    assert.equal(res403.body.code, 'S2S_AUTH_REJECTED');

    upstreamMode = '409';
    const res409 = await requestJson(baseUrl, '/api/administra/barragens', { token: 'token-analista' });
    assert.equal(res409.status, 409);
    assert.equal(res409.body.code, 'ADMINISTRA_CONFLICT');

    upstreamMode = 'invalid';
    const resInvalid = await requestJson(baseUrl, '/api/administra/barragens', {
      token: 'token-analista'
    });
    assert.equal(resInvalid.status, 502);
    assert.equal(resInvalid.body.code, 'INVALID_UPSTREAM_RESPONSE');

    upstreamMode = 'timeout';
    const resTimeout = await requestJson(baseUrl, '/api/administra/barragens', {
      token: 'token-analista'
    });
    assert.equal(resTimeout.status, 504);
    assert.equal(resTimeout.body.code, 'ADMINISTRA_TIMEOUT');
  } finally {
    await new Promise<void>(resolve => serverConfigured.close(() => resolve()));
  }
});

test('verifica .env.example e uso exato de FISCALIZA_S2S_PRIVATE_KEY_PEM sem resíduos do Supabase do Administra', () => {
  const envExample = fs.readFileSync(path.resolve(process.cwd(), '.env.example'), 'utf8');
  assert.match(envExample, /^ADMINISTRA_API_URL=/m);
  assert.match(envExample, /^FISCALIZA_S2S_KEY_ID=/m);
  assert.match(envExample, /^FISCALIZA_S2S_PRIVATE_KEY_PEM=/m);
  assert.equal(/FISCALIZA_S2S_PRIVATE_KEY(?!=|_PEM)/.test(envExample), false);
  assert.equal(
    /VITE_ADMINISTRA_SUPABASE_|VITE_FISCALIZA_S2S|VITE_ADMINISTRA_API|ADMINISTRA_API_TOKEN/.test(
      envExample
    ),
    false
  );

  const s2sSrc = fs.readFileSync(
    path.resolve(process.cwd(), 'src/server/administraS2sApi.ts'),
    'utf8'
  );
  assert.equal(/FISCALIZA_S2S_PRIVATE_KEY(?!_PEM)/.test(s2sSrc), false);
  assert.equal(/ADMINISTRA_API_TOKEN|SOLICITACOES_SERVICE_TOKEN|empreendedores:read|VITE_/.test(s2sSrc), false);
});

test('valida formato de FISCALIZA_S2S_KEY_ID e endurece normalização de ADMINISTRA_API_URL', () => {
  const { publicKey, privateKeyPem } = generateEphemeralEd25519Keypair();

  // 1. Validação de FISCALIZA_S2S_KEY_ID (^[A-Za-z0-9._:-]{1,128}$)
  assert.equal(isValidS2sKeyId('kid-fiscaliza.prod_01:v2'), true);
  assert.equal(isValidS2sKeyId('a'.repeat(128)), true);
  assert.equal(isValidS2sKeyId(''), false);
  assert.equal(isValidS2sKeyId('a'.repeat(129)), false);
  assert.equal(isValidS2sKeyId('kid invalido'), false);
  assert.equal(isValidS2sKeyId('kid/barra'), false);
  assert.equal(isValidS2sKeyId('kid@host'), false);
  assert.equal(isValidS2sKeyId('kid?query'), false);

  assert.throws(() =>
    signS2sV2GetRequest({
      config: {
        apiUrl: 'https://administra.exemplo.invalid',
        keyId: 'kid invalido!',
        privateKeyPem
      },
      endpoint: ADMINISTRA_V2_ENDPOINTS.HEALTH
    })
  );

  // 2. Normalização de ADMINISTRA_API_URL: credenciais, query string, fragmento, HTTPS em produção e sufixo único /api/v2
  for (const badUrl of [
    'https://user:pass@administra.exemplo.invalid/api/v2',
    'https://user@administra.exemplo.invalid/api/v2',
    'https://@administra.exemplo.invalid/api/v2',
    'https://administra.exemplo.invalid/api/v2?foo=bar',
    'https://administra.exemplo.invalid/api/v2?',
    'https://administra.exemplo.invalid/api/v2#frag',
    'https://administra.exemplo.invalid/api/v2#'
  ]) {
    assert.throws(() => normalizeAdministraApiBaseUrl(badUrl), `URL deveria ser rejeitada: ${badUrl}`);
  }

  assert.throws(() =>
    normalizeAdministraApiBaseUrl('http://administra.exemplo.invalid/api/v2', { requireHttps: true })
  );
  assert.equal(
    normalizeAdministraApiBaseUrl('http://localhost:3001/api/v2', { requireHttps: false }),
    'http://localhost:3001'
  );

  // Remove apenas um sufixo final /api/v2 preservando prefixo legítimo de gateway
  assert.equal(
    normalizeAdministraApiBaseUrl('https://gateway.exemplo.invalid/proxy/api/v2/api/v2/', {
      requireHttps: true
    }),
    'https://gateway.exemplo.invalid/proxy/api/v2'
  );
  assert.equal(
    normalizeAdministraApiBaseUrl('https://gateway.exemplo.invalid/api/v20/', {
      requireHttps: true
    }),
    'https://gateway.exemplo.invalid/api/v20'
  );

  const prevApiUrl = process.env.ADMINISTRA_API_URL;
  const prevKeyId = process.env.FISCALIZA_S2S_KEY_ID;
  const prevPem = process.env.FISCALIZA_S2S_PRIVATE_KEY_PEM;
  const prevNodeEnv = process.env.NODE_ENV;
  const prevVercelEnv = process.env.VERCEL_ENV;

  try {
    process.env.NODE_ENV = 'production';
    delete process.env.VERCEL_ENV;
    process.env.FISCALIZA_S2S_PRIVATE_KEY_PEM = privateKeyPem;

    // HTTP em produção deve ser recusado
    process.env.ADMINISTRA_API_URL = 'http://administra.exemplo.invalid/api/v2';
    process.env.FISCALIZA_S2S_KEY_ID = 'Fiscaliza.key_01:v2';
    assert.equal(getDefaultAdministraS2sConfig(), null);

    // Key ID inválido deve ser recusado
    process.env.ADMINISTRA_API_URL = 'https://gateway.exemplo.invalid/proxy/api/v2/';
    process.env.FISCALIZA_S2S_KEY_ID = 'kid/invalido';
    assert.equal(getDefaultAdministraS2sConfig(), null);

    // URL com query/fragmento/credencial deve ser recusada
    process.env.FISCALIZA_S2S_KEY_ID = 'Fiscaliza.key_01:v2';
    process.env.ADMINISTRA_API_URL = 'https://user@gateway.exemplo.invalid/proxy/api/v2';
    assert.equal(getDefaultAdministraS2sConfig(), null);
    process.env.ADMINISTRA_API_URL = 'https://gateway.exemplo.invalid/proxy/api/v2?env=prod';
    assert.equal(getDefaultAdministraS2sConfig(), null);
    process.env.ADMINISTRA_API_URL = 'https://gateway.exemplo.invalid/proxy/api/v2#top';
    assert.equal(getDefaultAdministraS2sConfig(), null);

    // Configuração HTTPS válida com prefixo de gateway e keyId válido
    process.env.ADMINISTRA_API_URL = 'https://gateway.exemplo.invalid/proxy/api/v2/';
    const cfg = getDefaultAdministraS2sConfig();
    assert.ok(cfg);
    assert.equal(cfg.apiUrl, 'https://gateway.exemplo.invalid/proxy');
    assert.equal(cfg.keyId, 'Fiscaliza.key_01:v2');

    const signedGateway = signS2sV2GetRequest({
      config: cfg,
      endpoint: ADMINISTRA_V2_ENDPOINTS.BARRAGENS,
      queryParams: { limit: 500 },
      nowSeconds: () => 1732560500,
      randomUuid: () => '33333333-3333-4333-8333-333333333333'
    });
    const expectedGatewayCanonical =
      'S2S-V2\n' +
      'GET\n' +
      '/proxy/api/v2/barragens\n' +
      'limit=500\n' +
      '\n' +
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855\n' +
      'Fiscaliza.key_01:v2\n' +
      '1732560500\n' +
      '33333333-3333-4333-8333-333333333333\n' +
      '|';
    assert.equal(signedGateway.url, 'https://gateway.exemplo.invalid/proxy/api/v2/barragens?limit=500');
    assert.equal(signedGateway.canonicalMessage, expectedGatewayCanonical);
    assert.equal(
      crypto.verify(
        null,
        Buffer.from(expectedGatewayCanonical, 'utf8'),
        publicKey,
        Buffer.from(signedGateway.headers['x-s2s-signature'], 'base64url')
      ),
      true
    );
  } finally {
    if (prevApiUrl === undefined) delete process.env.ADMINISTRA_API_URL;
    else process.env.ADMINISTRA_API_URL = prevApiUrl;
    if (prevKeyId === undefined) delete process.env.FISCALIZA_S2S_KEY_ID;
    else process.env.FISCALIZA_S2S_KEY_ID = prevKeyId;
    if (prevPem === undefined) delete process.env.FISCALIZA_S2S_PRIVATE_KEY_PEM;
    else process.env.FISCALIZA_S2S_PRIVATE_KEY_PEM = prevPem;
    if (prevNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = prevNodeEnv;
    if (prevVercelEnv === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = prevVercelEnv;
  }
});
