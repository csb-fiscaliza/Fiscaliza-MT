import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { startServer } from '../../../server.ts';
import { createEmptyInspection } from '../../services/storage.ts';
import { buildFutureInspectionFromSolicitacao } from '../../services/solicitacoesVistoriaService.ts';
import {
  SolicitacoesVistoriaStep,
  canActorEditSolicitacaoObservacao
} from '../../components/SolicitacoesVistoriaStep.tsx';
import { VistoriaConclusaoBar } from '../../components/VistoriaConclusaoBar.tsx';
import type { SolicitacaoVistoriaRecord } from '../../types/solicitacoesVistoria.ts';

const IDS = {
  ADMIN: '11111111-1111-4111-8111-111111111111',
  ANALISTA_EQUIPE: '22222222-2222-4222-8222-222222222222',
  ANALISTA_OUTRO: '55555555-5555-4555-8555-555555555555',
  VISUALIZADOR: '33333333-3333-4333-8333-333333333333',
  INATIVO: '44444444-4444-4444-8444-444444444444',
  SEM_PERFIL: '66666666-6666-4666-8666-666666666666',
  SOL_PENDENTE: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  SOL_PLANEJAMENTO: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  SOL_CONCLUIDA: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  VISTORIA: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  BARRAGEM: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  EMPREENDEDOR: 'ffffffff-ffff-4fff-8fff-ffffffffffff'
};

interface MockUpstreamCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: any;
}

function createMockSupabaseAdmin() {
  const tokenUsers: Record<string, { id: string; email: string }> = {
    'token-admin': { id: IDS.ADMIN, email: 'admin@sema.mt.gov.br' },
    'token-equipe': { id: IDS.ANALISTA_EQUIPE, email: 'analista.equipe@sema.mt.gov.br' },
    'token-outro': { id: IDS.ANALISTA_OUTRO, email: 'analista.outro@sema.mt.gov.br' },
    'token-viewer': { id: IDS.VISUALIZADOR, email: 'viewer@sema.mt.gov.br' },
    'token-inativo': { id: IDS.INATIVO, email: 'inativo@sema.mt.gov.br' },
    'token-sem-perfil': { id: IDS.SEM_PERFIL, email: 'semperfil@sema.mt.gov.br' }
  };

  const profiles = [
    {
      id: IDS.ADMIN,
      email: 'admin@sema.mt.gov.br',
      nome: 'Coordenadora Admin',
      perfil: 'administrador',
      status: 'ativo'
    },
    {
      id: IDS.ANALISTA_EQUIPE,
      email: 'analista.equipe@sema.mt.gov.br',
      nome: 'Fiscal Homonimo',
      perfil: 'analista',
      status: 'ativo'
    },
    {
      id: IDS.ANALISTA_OUTRO,
      email: 'analista.outro@sema.mt.gov.br',
      nome: 'Fiscal Homonimo',
      perfil: 'analista',
      status: 'ativo'
    },
    {
      id: IDS.VISUALIZADOR,
      email: 'viewer@sema.mt.gov.br',
      nome: 'Leitor Institucional',
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

  const client: any = {
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
  };

  return client as SupabaseClient;
}

function createBaseSolicitacoes(): any[] {
  return [
    {
      id: IDS.SOL_PENDENTE,
      sistema_origem: 'classifica',
      status: 'pendente',
      protocolo: 'CLA-2026-001',
      solicitante_nome: 'Triagem Classifica',
      solicitado_em: '2026-11-18T10:00:00Z',
      relato_resumido: 'Verificar anomalia em talude e vertedouro. Contato CPF 123.456.789-00.',
      processo_numero: 'SEMA-PRO-2026/0010',
      classificacao_resumo: 'DPA Alto / CRI Médio',
      empreendedor_id: IDS.EMPREENDEDOR,
      empreendedor_nome: 'Agropecuária Rio Claro Ltda',
      empreendedor_cpf_cnpj: '12.345.678/0001-99',
      cpf_cnpj: '12.345.678/0001-99',
      barragem_id: IDS.BARRAGEM,
      barragem_nome: 'Barragem Fazenda Rio Claro',
      municipio: 'Sorriso',
      curso_dagua: 'Rio Lira',
      latitude: '-12.543210',
      longitude: '-55.712340',
      equipe: [],
      observacao_campo: null
    },
    {
      id: IDS.SOL_PLANEJAMENTO,
      sistema_origem: 'notifica',
      status: 'em_planejamento',
      protocolo: 'NOT-2026-002',
      solicitante_nome: 'Núcleo Notifica',
      solicitado_em: '2026-11-19T14:00:00Z',
      relato_resumido: 'Inspeção técnica de acompanhamento pós-notificação.',
      processo_numero: 'SEMA-PRO-2026/0022',
      classificacao_resumo: null,
      empreendedor_id: null,
      empreendedor_nome: 'Empreendedor Rural',
      barragem_id: null,
      barragem_nome: 'Reservatório Paiaguás',
      municipio: 'Cuiabá',
      curso_dagua: 'Córrego Barbado',
      latitude: '-15.601000',
      longitude: '-56.097000',
      equipe: [],
      observacao_campo: null
    },
    {
      id: IDS.SOL_CONCLUIDA,
      sistema_origem: 'administra',
      status: 'concluida',
      protocolo: 'ADM-2026-003',
      solicitante_nome: 'Diretoria Administra',
      solicitado_em: '2026-11-10T09:00:00Z',
      relato_resumido: 'Vistoria conjunta executada em campo.',
      processo_numero: 'SEMA-PRO-2026/0003',
      classificacao_resumo: 'CRI Baixo',
      empreendedor_id: IDS.EMPREENDEDOR,
      empreendedor_nome: 'Consórcio Teles Pires',
      barragem_id: IDS.BARRAGEM,
      barragem_nome: 'Barragem Teles Pires IV',
      municipio: 'Sinop',
      curso_dagua: 'Rio Teles Pires',
      latitude: '-11.860000',
      longitude: '-55.500000',
      vistoria_id: IDS.VISTORIA,
      data_realizacao: '2026-11-15',
      equipe: [{ usuario_id: IDS.ANALISTA_EQUIPE, nome: 'Fiscal Homonimo' }],
      observacao_campo: 'Estruturas estáveis na data da vistoria.',
      updated_at: '2026-11-15T18:00:00Z'
    }
  ];
}

async function requestJson(
  server: http.Server,
  method: string,
  reqPath: string,
  options: { token?: string; body?: unknown } = {}
): Promise<{ status: number; body: any }> {
  const addr = server.address();
  assert.ok(addr && typeof addr === 'object');
  const baseUrl = `http://127.0.0.1:${addr.port}`;
  const headers: Record<string, string> = {
    Accept: 'application/json'
  };
  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(`${baseUrl}${reqPath}`, {
    method,
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined
  });

  const text = await res.text();
  let parsed: any = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }
  return { status: res.status, body: parsed };
}

test('Solicitações API: autenticação, fail-closed, 503 sem config e 409 se funções ausentes no Administra', async t => {
  const state = createBaseSolicitacoes();
  const upstreamCalls: MockUpstreamCall[] = [];
  let forceUpstreamError: { status: number; body: any } | null = null;
  let configPresent = true;

  const mockFetch: typeof fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input.toString();
    const method = (init?.method || 'GET').toUpperCase();
    const headers = (init?.headers as Record<string, string>) || {};
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    upstreamCalls.push({ url, method, headers, body });

    if (forceUpstreamError) {
      return new Response(JSON.stringify(forceUpstreamError.body), {
        status: forceUpstreamError.status,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const parsedUrl = new URL(url);
    const pathname = parsedUrl.pathname;

    if (method === 'GET' && pathname === '/central/solicitacoes') {
      return new Response(JSON.stringify({ solicitacoes: state }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const getMatch = pathname.match(/^\/central\/solicitacoes\/([0-9a-f-]+)$/i);
    if (method === 'GET' && getMatch) {
      const found = state.find(s => s.id === getMatch[1]);
      if (!found) {
        return new Response(JSON.stringify({ code: 'NOT_FOUND', error: 'Solicitação não encontrada' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      return new Response(JSON.stringify({ solicitacao: found }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ error: 'Not mocked' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  };

  const server = await startServer({
    isProduction: true,
    port: 0,
    host: '127.0.0.1',
    solicitacoesDeps: {
      getSupabaseAdmin: () => createMockSupabaseAdmin(),
      getCentralConfig: () =>
        configPresent
          ? { url: 'https://administra.internal/central/solicitacoes', token: 'srv-token-super-secret' }
          : null,
      fetchImpl: mockFetch
    }
  });
  t.after(() => new Promise<void>(resolve => server.close(() => resolve())));

  // Sem token -> 401 (prova também que rota foi montada ANTES do catch-all 404 de /api)
  const unauth = await requestJson(server, 'GET', '/api/solicitacoes-vistoria');
  assert.equal(unauth.status, 401);

  // Token inativo / sem perfil -> 403 fail-closed
  const inactiveRes = await requestJson(server, 'GET', '/api/solicitacoes-vistoria', {
    token: 'token-inativo'
  });
  assert.equal(inactiveRes.status, 403);

  const noProfileRes = await requestJson(server, 'GET', '/api/solicitacoes-vistoria', {
    token: 'token-sem-perfil'
  });
  assert.equal(noProfileRes.status, 403);

  // Sem configuração central -> 503 sem vazar segredo
  configPresent = false;
  const missingCfgRes = await requestJson(server, 'GET', '/api/solicitacoes-vistoria', {
    token: 'token-equipe'
  });
  assert.equal(missingCfgRes.status, 503);
  assert.equal(missingCfgRes.body.code, 'CENTRAL_CONFIG_MISSING');
  assert.equal(upstreamCalls.length, 0);

  // Com configuração central: Visualizador lê lista (somente leitura) com CPF/CNPJ mascarado e campos extras removidos
  configPresent = true;
  const viewerList = await requestJson(server, 'GET', '/api/solicitacoes-vistoria', {
    token: 'token-viewer'
  });
  assert.equal(viewerList.status, 200);
  assert.equal(viewerList.body.actor.perfil, 'visualizador');
  assert.equal(viewerList.body.actor.canMutate, false);
  assert.equal(viewerList.body.solicitacoes.length, 3);
  assert.equal('cpf_cnpj' in viewerList.body.solicitacoes[0], false);
  assert.equal('empreendedor_cpf_cnpj' in viewerList.body.solicitacoes[0], false);
  assert.equal(viewerList.body.solicitacoes[0].relato_resumido.includes('123.456.789-00'), false);
  assert.equal(upstreamCalls[0].headers.Authorization, 'Bearer srv-token-super-secret');

  // Visualizador é bloqueado em todas as mutações (403)
  const viewerStart = await requestJson(
    server,
    'POST',
    `/api/solicitacoes-vistoria/${IDS.SOL_PENDENTE}/iniciar`,
    { token: 'token-viewer', body: {} }
  );
  assert.equal(viewerStart.status, 403);

  const viewerConcluir = await requestJson(
    server,
    'POST',
    `/api/solicitacoes-vistoria/${IDS.SOL_PLANEJAMENTO}/concluir`,
    {
      token: 'token-viewer',
      body: {
        vistoria_id: IDS.VISTORIA,
        data_realizacao: '2026-11-20',
        equipe: [{ usuario_id: IDS.VISUALIZADOR }],
        observacao_campo: 'Tentativa'
      }
    }
  );
  assert.equal(viewerConcluir.status, 403);

  const viewerPatch = await requestJson(
    server,
    'PATCH',
    `/api/solicitacoes-vistoria/${IDS.SOL_CONCLUIDA}/observacao`,
    { token: 'token-viewer', body: { observacao_campo: 'Tentativa' } }
  );
  assert.equal(viewerPatch.status, 403);

  // Funções não implantadas no Administra (PGRST202 / 404 sem NOT_FOUND) -> HTTP 409
  forceUpstreamError = {
    status: 404,
    body: { code: 'PGRST202', message: 'Could not find the function public.solicitacoes_vistoria' }
  };
  const notDeployedRes = await requestJson(server, 'GET', '/api/solicitacoes-vistoria', {
    token: 'token-admin'
  });
  assert.equal(notDeployedRes.status, 409);
  assert.equal(notDeployedRes.body.code, 'ADMINISTRA_FUNCTIONS_NOT_DEPLOYED');
});

test('Solicitações API: iniciar, concluir e editar observação pós-conclusão por ID institucional', async t => {
  const state = createBaseSolicitacoes();
  const upstreamCalls: MockUpstreamCall[] = [];

  const mockFetch: typeof fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input.toString();
    const method = (init?.method || 'GET').toUpperCase();
    const headers = (init?.headers as Record<string, string>) || {};
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    upstreamCalls.push({ url, method, headers, body });

    const parsedUrl = new URL(url);
    const pathname = parsedUrl.pathname;

    const getMatch = pathname.match(/^\/central\/solicitacoes\/([0-9a-f-]+)$/i);
    if (method === 'GET' && getMatch) {
      const found = state.find(s => s.id === getMatch[1]);
      if (!found) {
        return new Response(JSON.stringify({ code: 'NOT_FOUND' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      return new Response(JSON.stringify({ solicitacao: found }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const startMatch = pathname.match(/^\/central\/solicitacoes\/([0-9a-f-]+)\/iniciar$/i);
    if (method === 'POST' && startMatch) {
      const found = state.find(s => s.id === startMatch[1]);
      found.status = 'em_planejamento';
      found.updated_at = '2026-11-20T10:00:00Z';
      return new Response(JSON.stringify({ solicitacao: found }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const concluirMatch = pathname.match(/^\/central\/solicitacoes\/([0-9a-f-]+)\/concluir$/i);
    if (method === 'POST' && concluirMatch) {
      const found = state.find(s => s.id === concluirMatch[1]);
      found.status = 'concluida';
      found.vistoria_id = body.vistoria_id;
      found.data_realizacao = body.data_realizacao;
      found.equipe = body.equipe;
      found.observacao_campo = body.observacao_campo;
      found.updated_at = '2026-11-20T12:00:00Z';
      return new Response(JSON.stringify({ solicitacao: found }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const obsMatch = pathname.match(/^\/central\/solicitacoes\/([0-9a-f-]+)\/observacao$/i);
    if (method === 'PATCH' && obsMatch) {
      const found = state.find(s => s.id === obsMatch[1]);
      found.observacao_campo = body.observacao_campo;
      found.updated_at = '2026-11-20T15:00:00Z';
      return new Response(JSON.stringify({ solicitacao: found }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ error: 'Not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  };

  const server = await startServer({
    isProduction: true,
    port: 0,
    host: '127.0.0.1',
    solicitacoesDeps: {
      getSupabaseAdmin: () => createMockSupabaseAdmin(),
      getCentralConfig: () => ({
        url: 'https://administra.internal/central/solicitacoes',
        token: 'srv-token-super-secret'
      }),
      fetchImpl: mockFetch
    }
  });
  t.after(() => new Promise<void>(resolve => server.close(() => resolve())));

  // 1. Iniciar planejamento
  const iniciarRes = await requestJson(
    server,
    'POST',
    `/api/solicitacoes-vistoria/${IDS.SOL_PENDENTE}/iniciar`,
    { token: 'token-equipe', body: {} }
  );
  assert.equal(iniciarRes.status, 200);
  assert.equal(iniciarRes.body.solicitacao.status, 'em_planejamento');

  // 2. Validações de conclusão: rejeita >1000 chars, CPF/CNPJ, JSON serializado e equipe sem UUID
  const tooLong = 'x'.repeat(1001);
  const resTooLong = await requestJson(
    server,
    'POST',
    `/api/solicitacoes-vistoria/${IDS.SOL_PLANEJAMENTO}/concluir`,
    {
      token: 'token-equipe',
      body: {
        vistoria_id: IDS.VISTORIA,
        data_realizacao: '2026-11-20',
        equipe: [{ usuario_id: IDS.ANALISTA_EQUIPE, nome: 'Fiscal Homonimo' }],
        observacao_campo: tooLong
      }
    }
  );
  assert.equal(resTooLong.status, 400);

  const resCpf = await requestJson(
    server,
    'POST',
    `/api/solicitacoes-vistoria/${IDS.SOL_PLANEJAMENTO}/concluir`,
    {
      token: 'token-equipe',
      body: {
        vistoria_id: IDS.VISTORIA,
        data_realizacao: '2026-11-20',
        equipe: [{ usuario_id: IDS.ANALISTA_EQUIPE }],
        observacao_campo: 'Responsável CPF 123.456.789-00 presente'
      }
    }
  );
  assert.equal(resCpf.status, 400);

  const resJson = await requestJson(
    server,
    'POST',
    `/api/solicitacoes-vistoria/${IDS.SOL_PLANEJAMENTO}/concluir`,
    {
      token: 'token-equipe',
      body: {
        vistoria_id: IDS.VISTORIA,
        data_realizacao: '2026-11-20',
        equipe: [{ usuario_id: IDS.ANALISTA_EQUIPE }],
        observacao_campo: '{"damIdentification":{"damName":"Teste"}}'
      }
    }
  );
  assert.equal(resJson.status, 400);

  const resNameOnlyTeam = await requestJson(
    server,
    'POST',
    `/api/solicitacoes-vistoria/${IDS.SOL_PLANEJAMENTO}/concluir`,
    {
      token: 'token-equipe',
      body: {
        vistoria_id: IDS.VISTORIA,
        data_realizacao: '2026-11-20',
        equipe: [{ nome: 'Fiscal Digitado Sem UUID' }]
      }
    }
  );
  assert.equal(resNameOnlyTeam.status, 400);

  // 3. Concluir sem observacao_campo (campo opcional) + garantindo inclusão do ID do ator na equipe
  const okConcluir = await requestJson(
    server,
    'POST',
    `/api/solicitacoes-vistoria/${IDS.SOL_PLANEJAMENTO}/concluir`,
    {
      token: 'token-equipe',
      body: {
        vistoria_id: IDS.VISTORIA,
        data_realizacao: '2026-11-20',
        equipe: []
      }
    }
  );
  assert.equal(okConcluir.status, 200);
  assert.equal(okConcluir.body.solicitacao.status, 'concluida');
  assert.equal(okConcluir.body.solicitacao.data_realizacao, '2026-11-20');
  assert.equal(okConcluir.body.solicitacao.observacao_campo, '');
  assert.ok(
    okConcluir.body.solicitacao.equipe.some(
      (m: any) => m.usuario_id === IDS.ANALISTA_EQUIPE
    )
  );

  // 4. Pós-conclusão: Analista fora da equipe (MESMO com nome idêntico!) é bloqueado com 403
  const otherAnalystPatch = await requestJson(
    server,
    'PATCH',
    `/api/solicitacoes-vistoria/${IDS.SOL_CONCLUIDA}/observacao`,
    {
      token: 'token-outro',
      body: { observacao_campo: 'Tentativa por homônimo fora da equipe' }
    }
  );
  assert.equal(otherAnalystPatch.status, 403);

  // 5. Rejeita tentativa de alterar data_realizacao / status via PATCH observacao
  const tamperPatch = await requestJson(
    server,
    'PATCH',
    `/api/solicitacoes-vistoria/${IDS.SOL_CONCLUIDA}/observacao`,
    {
      token: 'token-admin',
      body: { observacao_campo: 'OK', data_realizacao: '2026-01-01' }
    }
  );
  assert.equal(tamperPatch.status, 400);

  // 6. Integrante da equipe (por ID institucional) pode editar observacao_campo
  const equipePatch = await requestJson(
    server,
    'PATCH',
    `/api/solicitacoes-vistoria/${IDS.SOL_CONCLUIDA}/observacao`,
    {
      token: 'token-equipe',
      body: { observacao_campo: 'Complemento técnico após retorno ao escritório.' }
    }
  );
  assert.equal(equipePatch.status, 200);
  assert.equal(
    equipePatch.body.solicitacao.observacao_campo,
    'Complemento técnico após retorno ao escritório.'
  );
  assert.equal(equipePatch.body.solicitacao.data_realizacao, '2026-11-15');

  // 7. Administrador também pode editar observacao_campo mesmo não estando na equipe executora
  const adminPatch = await requestJson(
    server,
    'PATCH',
    `/api/solicitacoes-vistoria/${IDS.SOL_CONCLUIDA}/observacao`,
    {
      token: 'token-admin',
      body: { observacao_campo: 'Nota complementar da coordenação.' }
    }
  );
  assert.equal(adminPatch.status, 200);
  assert.equal(adminPatch.body.solicitacao.observacao_campo, 'Nota complementar da coordenação.');
});

test('Frontend helpers & UI: Vistoria Futura sem CPF/CNPJ, campo condicional em VistoriaConclusaoBar e sem segredos em VITE_*', () => {
  const solicitacao: SolicitacaoVistoriaRecord & { cpf_cnpj?: string } = {
    id: IDS.SOL_PENDENTE,
    sistema_origem: 'classifica',
    status: 'em_planejamento',
    protocolo: 'CLA-2026-099',
    solicitante_nome: 'Equipe Classifica',
    solicitado_em: '2026-11-20T09:00:00Z',
    relato_resumido: 'Verificar crista e dreno de pé',
    processo_numero: 'SEMA-2026/999',
    classificacao_resumo: 'DPA Médio',
    empreendedor_id: IDS.EMPREENDEDOR,
    empreendedor_nome: 'Empreendimento Exemplo S.A.',
    barragem_id: IDS.BARRAGEM,
    barragem_nome: 'Barragem Norte I',
    municipio: 'Lucas do Rio Verde',
    curso_dagua: 'Rio Verde',
    latitude: '-13.0500',
    longitude: '-55.9100',
    equipe: [],
    cpf_cnpj: '11.222.333/0001-81'
  };

  const inspFutura = buildFutureInspectionFromSolicitacao(solicitacao, {
    id: IDS.ANALISTA_EQUIPE,
    email: 'analista.equipe@sema.mt.gov.br',
    fullName: 'Fiscal Homonimo'
  });

  assert.equal(inspFutura.tipoPlanejamento, 'futura');
  assert.equal(inspFutura.generalInfo.tipoPlanejamento, 'futura');
  assert.equal(inspFutura.generalInfo.numeroVistoria, '');
  assert.equal(inspFutura.isDraft, true);
  assert.equal(inspFutura.solicitacaoVistoriaId, IDS.SOL_PENDENTE);
  assert.equal(inspFutura.solicitacaoOrigem, 'classifica');
  assert.equal(inspFutura.damIdentification.damName, 'Barragem Norte I');
  assert.equal(inspFutura.damIdentification.municipality, 'Lucas do Rio Verde');
  assert.equal(inspFutura.damIdentification.waterCourse, 'Rio Verde');
  assert.equal(inspFutura.damIdentification.propertyOrBusinessName, 'Empreendimento Exemplo S.A.');
  // Nunca copia CPF/CNPJ
  assert.equal(inspFutura.damIdentification.ownerCpfCnpj, '');
  assert.equal(inspFutura.responsavelTecnico?.cpf || '', '');

  // Verificação de permissão por ID para edição de observação pós-conclusão
  const concluida: SolicitacaoVistoriaRecord = {
    ...solicitacao,
    status: 'concluida',
    data_realizacao: '2026-11-20',
    equipe: [{ usuario_id: IDS.ANALISTA_EQUIPE, nome: 'Fiscal Homonimo' }]
  };
  assert.equal(
    canActorEditSolicitacaoObservacao(concluida, {
      userId: IDS.ADMIN,
      nome: 'Admin',
      perfil: 'administrador',
      isAdmin: true,
      canMutate: true
    }),
    true
  );
  assert.equal(
    canActorEditSolicitacaoObservacao(concluida, {
      userId: IDS.ANALISTA_EQUIPE,
      nome: 'Fiscal Homonimo',
      perfil: 'analista',
      isAdmin: false,
      canMutate: true
    }),
    true
  );
  assert.equal(
    canActorEditSolicitacaoObservacao(concluida, {
      userId: IDS.ANALISTA_OUTRO,
      nome: 'Fiscal Homonimo',
      perfil: 'analista',
      isAdmin: false,
      canMutate: true
    }),
    false
  );
  assert.equal(
    canActorEditSolicitacaoObservacao(concluida, {
      userId: IDS.VISUALIZADOR,
      nome: 'Viewer',
      perfil: 'visualizador',
      isAdmin: false,
      canMutate: false
    }),
    false
  );

  // SSR: VistoriaConclusaoBar exibe "Informações e observações de campo" SOMENTE com solicitação vinculada
  const normalInsp = createEmptyInspection({ fullName: 'Fiscal' });
  const normalHtml = renderToStaticMarkup(
    React.createElement(VistoriaConclusaoBar, {
      data: normalInsp,
      onChange: () => {}
    })
  );
  assert.equal(normalHtml.includes('Informações e observações de campo'), false);

  const linkedHtml = renderToStaticMarkup(
    React.createElement(VistoriaConclusaoBar, {
      data: inspFutura,
      onChange: () => {},
      currentUser: { id: IDS.ANALISTA_EQUIPE, role: 'analista' }
    })
  );
  assert.equal(linkedHtml.includes('Informações e observações de campo (opcional)'), true);

  // SSR: SolicitacoesVistoriaStep mostra aviso Somente leitura para visualizador
  const stepHtml = renderToStaticMarkup(
    React.createElement(SolicitacoesVistoriaStep, {
      currentUser: { id: IDS.VISUALIZADOR, role: 'visualizador' },
      onGoToDashboard: () => {},
      onCreateFutureInspection: () => {}
    })
  );
  assert.equal(stepHtml.includes('Solicitações de Vistoria'), true);
  assert.equal(stepHtml.includes('Somente leitura'), true);

  // Garante que nenhuma chave/token de servidor vaze para o cliente / VITE_*
  const envExample = fs.readFileSync(path.resolve('.env.example'), 'utf8');
  assert.equal(envExample.includes('VITE_SOLICITACOES_SERVICE_TOKEN'), false);
  assert.equal(envExample.includes('VITE_ADMINISTRA_SOLICITACOES_URL'), false);
  assert.equal(envExample.includes('ADMINISTRA_SOLICITACOES_URL=""'), true);
  assert.equal(envExample.includes('SOLICITACOES_SERVICE_TOKEN=""'), true);

  const clientDirs = ['src/components', 'src/services'];
  for (const dir of clientDirs) {
    for (const file of fs.readdirSync(path.resolve(dir))) {
      if (!file.endsWith('.ts') && !file.endsWith('.tsx')) continue;
      const content = fs.readFileSync(path.join(path.resolve(dir), file), 'utf8');
      assert.equal(
        content.includes('SOLICITACOES_SERVICE_TOKEN'),
        false,
        `Token de servidor não pode aparecer em ${dir}/${file}`
      );
      assert.equal(
        content.includes('ADMINISTRA_SOLICITACOES_URL'),
        false,
        `URL privada de servidor não pode aparecer em ${dir}/${file}`
      );
    }
  }
});
