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
  buildS2sV2CanonicalMessage,
  canonicalizeQueryParams,
  EMPTY_BODY_SHA256,
  encodeRfc3986,
  fetchAllAdministraBarragensV2,
  getDefaultAdministraS2sConfig,
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

test('gera mensagem canônica S2S-V2 de 10 linhas LF com query RFC 3986 ordenada e vetor fixo', () => {
  assert.equal(
    EMPTY_BODY_SHA256,
    'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
  );
  assert.equal(encodeRfc3986("a!b'c(d)e*f "), 'a%21b%27c%28d%29e%2Af%20');

  const sortedQuery = canonicalizeQueryParams([
    ['limit', '500'],
    ['cursor', 'z!2'],
    ['cursor', 'a(1)'],
    ['alpha', 'x*y']
  ]);
  assert.equal(sortedQuery, 'alpha=x%2Ay&cursor=a%281%29&cursor=z%212&limit=500');

  const fixedMessage = buildS2sV2CanonicalMessage({
    method: 'get',
    path: '/api/v2/barragens',
    query: 'cursor=cur%211%20%28v2%29&limit=500',
    contentType: 'application/json',
    bodySha256: EMPTY_BODY_SHA256,
    keyId: 'kid-fiscaliza-test',
    timestamp: '1732560000',
    jti: '11111111-1111-4111-8111-111111111111'
  });

  const expectedVector = [
    'S2S-V2',
    'GET',
    '/api/v2/barragens',
    'cursor=cur%211%20%28v2%29&limit=500',
    '',
    'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    'kid-fiscaliza-test',
    '1732560000',
    '11111111-1111-4111-8111-111111111111',
    '|'
  ].join('\n');

  assert.equal(fixedMessage, expectedVector);
  assert.equal(fixedMessage.split('\n').length, 10);
});

test('assina requisição GET com Ed25519 efêmero, gera novo jti por chamada e proíbe q e cabeçalhos extras', () => {
  const { publicKey, privateKeyPem } = generateEphemeralEd25519Keypair();
  const config = {
    apiUrl: 'https://administra.exemplo.invalid',
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
  assert.equal(sign1.url, 'https://administra.exemplo.invalid/api/v2/barragens?cursor=page%282%29%21&limit=500');

  // Cabeçalhos permitidos e ausência de Authorization/apikey/x-consumer-*
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

  // Verificação criptográfica Ed25519 com chave pública efêmera
  const sig1Valid = crypto.verify(
    null,
    Buffer.from(sign1.canonicalMessage, 'utf8'),
    publicKey,
    Buffer.from(sign1.headers['x-s2s-signature'], 'base64url')
  );
  assert.equal(sig1Valid, true);

  assert.throws(() =>
    signS2sV2GetRequest({
      config,
      endpoint: '/api/v2/empreendedores' as any
    })
  );
});

test('pagina /api/v2/barragens com limit=500 e nextCursor, valida DTO camelCase mascarado e detecta respostas inválidas', async () => {
  const { publicKey, privateKeyPem } = generateEphemeralEd25519Keypair();
  const config = {
    apiUrl: 'https://administra.exemplo.invalid',
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

    const reconstructed = buildS2sV2CanonicalMessage({
      method: 'GET',
      path: parsedUrl.pathname,
      query: parsedUrl.search.replace(/^\?/, ''),
      bodySha256: headers['x-s2s-body-sha256'],
      keyId: headers['x-s2s-key-id'],
      timestamp: headers['x-s2s-timestamp'],
      jti
    });
    assert.equal(
      crypto.verify(
        null,
        Buffer.from(reconstructed, 'utf8'),
        publicKey,
        Buffer.from(headers['x-s2s-signature'], 'base64url')
      ),
      true
    );

    const cursor = parsedUrl.searchParams.get('cursor');
    if (!cursor) {
      return new Response(
        JSON.stringify({
          success: true,
          apiVersion: '2.0',
          items: [
            {
              id: 'bar-1',
              administraId: 'bar-1',
              sistemaOrigem: 'administra',
              empreendedorId: 'emp-1',
              empreendedorNome: '***',
              nome: 'Barragem P1',
              municipio: 'Sinop',
              baciaHidrografica: 'Teles Pires',
              cursoDagua: 'Córrego Um',
              cotaCoroamentoMetros: 312.5,
              anoInicioObra: 2018,
              anoFinalObra: 2019,
              tipoMaterial: 'terra_homogenea',
              usoPrincipal: 'Irrigação',
              usosSecundarios: []
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
            municipio: 'Sorriso'
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
    assert.equal(okRes.items[0].cotaCoroamentoMetros, 312.5);
    assert.equal(okRes.items[1].nome, 'Barragem P2');
  }
  assert.equal(seenJtis.size, 2);
  assert.equal(requestedUrls.some(u => u.includes('empreendedores')), false);

  // Cursor repetido é rejeitado
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

  // Excesso de páginas é rejeitado
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

  // Validação de respostas inválidas
  assert.equal(validateV2HealthResponse({ success: false, apiVersion: '2.0' }).valid, false);
  assert.equal(validateV2HealthResponse({ success: true, apiVersion: '1.0' }).valid, false);
  assert.equal(validateV2HealthResponse({ success: true, apiVersion: '2.0' }).valid, true);

  assert.equal(
    validateV2BarragensPageResponse({
      success: true,
      apiVersion: '2.0',
      items: [{ id: '1', nome: 'X', cotaCoroamentoMetros: 'invalido' }],
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

  // 1. Sem configuração S2S: nenhuma chamada externa, mesmo com tokens de outros fluxos definidos
  const prevApiUrl = process.env.ADMINISTRA_API_URL;
  const prevKeyId = process.env.FISCALIZA_S2S_KEY_ID;
  const prevPem = process.env.FISCALIZA_S2S_PRIVATE_KEY_PEM;
  const prevForbiddenToken = process.env.ADMINISTRA_API_TOKEN;
  const prevSolicToken = process.env.SOLICITACOES_SERVICE_TOKEN;
  delete process.env.ADMINISTRA_API_URL;
  delete process.env.FISCALIZA_S2S_KEY_ID;
  delete process.env.FISCALIZA_S2S_PRIVATE_KEY_PEM;
  process.env.ADMINISTRA_API_TOKEN = '__DUMMY_LEGACY_TOKEN__';
  process.env.SOLICITACOES_SERVICE_TOKEN = '__DUMMY_SOLIC_TOKEN__';

  assert.equal(getDefaultAdministraS2sConfig(), null);

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

    // Fail-closed auth
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

    // Sem config retorna modo local sem chamadas HTTP externas
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
    if (prevForbiddenToken === undefined) delete process.env.ADMINISTRA_API_TOKEN;
    else process.env.ADMINISTRA_API_TOKEN = prevForbiddenToken;
    if (prevSolicToken === undefined) delete process.env.SOLICITACOES_SERVICE_TOKEN;
    else process.env.SOLICITACOES_SERVICE_TOKEN = prevSolicToken;
  }

  // 2. Com configuração S2S: testa 200, 401, 403, 409, resposta inválida e timeout
  let upstreamMode: 'ok' | '401' | '403' | '409' | 'invalid' | 'timeout' = 'ok';

  const serverConfigured = await startServer({
    isProduction: true,
    port: 0,
    host: '127.0.0.1',
    administraDeps: {
      getSupabaseAdmin: () => mockSupabase,
      getS2sConfig: () => ({
        apiUrl: 'https://administra.exemplo.invalid',
        keyId: 'kid-server-test',
        privateKeyPem
      }),
      timeoutMs: 40,
      fetchImpl: async (input, init) => {
        const url = new URL(String(input));
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
            items: [{ id: 'bar-ok', nome: 'Barragem V2', municipio: 'Cuiabá' }],
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

test('verifica .env.example e isolamento de variáveis S2S exclusivamente no backend sem resíduos do Supabase do Administra', () => {
  const envExample = fs.readFileSync(path.resolve(process.cwd(), '.env.example'), 'utf8');
  assert.match(envExample, /^ADMINISTRA_API_URL=/m);
  assert.match(envExample, /^FISCALIZA_S2S_KEY_ID=/m);
  assert.match(envExample, /^FISCALIZA_S2S_PRIVATE_KEY_PEM=/m);
  assert.equal(/VITE_ADMINISTRA_SUPABASE_|VITE_FISCALIZA_S2S|VITE_ADMINISTRA_API|ADMINISTRA_API_TOKEN/.test(envExample), false);

  const s2sSrc = fs.readFileSync(
    path.resolve(process.cwd(), 'src/server/administraS2sApi.ts'),
    'utf8'
  );
  assert.equal(/ADMINISTRA_API_TOKEN|SOLICITACOES_SERVICE_TOKEN|empreendedores:read|VITE_/.test(s2sSrc), false);
});
