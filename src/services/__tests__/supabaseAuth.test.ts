import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  ensureAuthenticatedSession,
  getInspectorSession,
  getSupabaseSecurityDiagnostics,
  signInInspector,
  signOutInspector,
  signUpInspector,
  updateInspectorPassword
} from '../supabase.ts';
import * as userService from '../userService.ts';
import { UsersManagementStep } from '../../components/UsersManagementStep.tsx';

interface MockProfileRow {
  id: string;
  email: string;
  nome: string;
  perfil: string | null;
  status: string;
  cargo?: string;
  matricula?: string;
}

function installMockBrowserStorage(initial: Record<string, string> = {}) {
  const store = new Map<string, string>(Object.entries(initial));
  const events: Array<{ type: string; detail?: unknown }> = [];

  const localStorageMock = {
    get length() {
      return store.size;
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    setItem(key: string, value: string) {
      store.set(key, String(value));
    },
    removeItem(key: string) {
      store.delete(key);
    },
    clear() {
      store.clear();
    }
  };

  class MockCustomEvent {
    type: string;
    detail: unknown;
    constructor(type: string, init?: { detail?: unknown }) {
      this.type = type;
      this.detail = init?.detail;
    }
  }

  (globalThis as any).localStorage = localStorageMock;
  (globalThis as any).CustomEvent = MockCustomEvent;
  (globalThis as any).window = {
    localStorage: localStorageMock,
    dispatchEvent(evt: { type: string; detail?: unknown }) {
      events.push({ type: evt.type, detail: evt.detail });
      return true;
    }
  };

  return { store, events };
}

function cleanupMockBrowserStorage() {
  delete (globalThis as any).window;
  delete (globalThis as any).localStorage;
  delete (globalThis as any).CustomEvent;
}

function createMockSupabaseAuthClient(options: {
  accounts?: Record<
    string,
    {
      password: string;
      user_metadata?: Record<string, any>;
    }
  >;
  profiles?: MockProfileRow[];
  activeSession?: {
    access_token?: string;
    user: {
      id: string;
      email?: string;
      role?: string;
      user_metadata?: Record<string, any>;
    };
  } | null;
  getUserError?: { message: string } | null;
  profileQueryError?: { message: string; code?: string } | null;
  signInThrows?: Error | null;
  signInServiceError?: { message: string; status: number } | null;
}) {
  let currentSession = options.activeSession ?? null;
  let signOutCount = 0;
  let passwordUpdatedTo: string | null = null;
  const profiles = options.profiles ?? [];
  const accounts = options.accounts ?? {};

  const client = {
    auth: {
      async signInWithPassword({ email, password }: { email: string; password: string }) {
        if (options.signInThrows) {
          throw options.signInThrows;
        }
        if (options.signInServiceError) {
          return { data: { user: null, session: null }, error: options.signInServiceError };
        }
        const clean = email.trim().toLowerCase();
        const acct = accounts[clean];
        if (!acct || acct.password !== password) {
          return {
            data: { user: null, session: null },
            error: { message: 'Invalid login credentials', status: 400 }
          };
        }
        const user = {
          id: `auth-${clean}`,
          email: clean,
          role: 'authenticated',
          user_metadata: acct.user_metadata ?? {}
        };
        currentSession = {
          access_token: `tok-${clean}`,
          user
        };
        return { data: { user, session: currentSession }, error: null };
      },
      async getSession() {
        return { data: { session: currentSession }, error: null };
      },
      async getUser() {
        if (options.getUserError) {
          return { data: { user: null }, error: options.getUserError };
        }
        if (!currentSession?.user) {
          return { data: { user: null }, error: { message: 'Invalid JWT' } };
        }
        return { data: { user: currentSession.user }, error: null };
      },
      async signOut() {
        signOutCount += 1;
        currentSession = null;
        return { error: null };
      },
      async updateUser({ password }: { password: string }) {
        passwordUpdatedTo = password;
        return { data: { user: currentSession?.user ?? null }, error: null };
      }
    },
    from(table: string) {
      return {
        select() {
          return {
            eq(col: string, val: string) {
              return {
                async maybeSingle() {
                  if (table !== 'perfis_usuarios') {
                    return { data: null, error: { message: 'Unexpected table' } };
                  }
                  if (options.profileQueryError) {
                    return { data: null, error: options.profileQueryError };
                  }
                  const found =
                    profiles.find(
                      p => String((p as any)[col] ?? '').trim().toLowerCase() === String(val).trim().toLowerCase()
                    ) ?? null;
                  return { data: found, error: null };
                }
              };
            }
          };
        }
      };
    }
  };

  return {
    client: client as unknown as SupabaseClient,
    getSignOutCount: () => signOutCount,
    getCurrentSession: () => currentSession,
    getPasswordUpdatedTo: () => passwordUpdatedTo
  };
}

test('bloqueia fallback offline e sessão forjada em localStorage quando Supabase está indisponível', async () => {
  const { store } = installMockBrowserStorage({
    fiscaliza_csb_active_session_v2: JSON.stringify({
      authenticated: true,
      email: 'admin.local@sema.mt.gov.br',
      fullName: 'Admin Offline',
      role: 'administrador',
      expiresAt: Date.now() + 3600_000
    }),
    fiscaliza_csb_users_catalog_v1: JSON.stringify([
      {
        id: '11111111-1111-4111-8111-111111111111',
        email: 'admin.local@sema.mt.gov.br',
        name: 'Admin Offline',
        role: 'administrador',
        status: 'ativo'
      }
    ])
  });

  try {
    const signInRes = await signInInspector('admin.local@sema.mt.gov.br', 'SenhaForte@2026', {
      client: null
    });
    assert.equal(signInRes.success, false);
    assert.match(signInRes.error || '', /indisponível|bloqueado/i);
    assert.equal(store.has('fiscaliza_csb_active_session_v2'), false);

    const sessionRes = await getInspectorSession({ client: null });
    assert.deepEqual(sessionRes, { authenticated: false });

    const ensureRes = await ensureAuthenticatedSession({ client: null });
    assert.deepEqual(ensureRes, { authenticated: false });

    const diagRes = await getSupabaseSecurityDiagnostics({ client: null });
    assert.equal(diagRes.authenticated, false);
    assert.equal(diagRes.configured, false);

    const pwdRes = await updateInspectorPassword('NovaSenha@2026', { client: null });
    assert.equal(pwdRes.success, false);
  } finally {
    cleanupMockBrowserStorage();
  }
});

test('falha fechado quando serviço remoto lança erro de rede ou HTTP 503 durante signInInspector', async () => {
  installMockBrowserStorage({
    fiscaliza_csb_users_catalog_v1: JSON.stringify([
      {
        id: '11111111-1111-4111-8111-111111111111',
        email: 'fiscal@sema.mt.gov.br',
        name: 'Fiscal Local',
        role: 'administrador',
        status: 'ativo'
      }
    ])
  });

  try {
    const networkMock = createMockSupabaseAuthClient({
      signInThrows: new Error('Failed to fetch')
    });
    const resNetwork = await signInInspector('fiscal@sema.mt.gov.br', 'SenhaForte@2026', {
      client: networkMock.client,
      syncEcosystem: async () => {}
    });
    assert.equal(resNetwork.success, false);
    assert.match(resNetwork.error || '', /conectar|indisponível/i);

    const service503Mock = createMockSupabaseAuthClient({
      signInServiceError: { message: 'Service Unavailable', status: 503 }
    });
    const res503 = await signInInspector('fiscal@sema.mt.gov.br', 'SenhaForte@2026', {
      client: service503Mock.client,
      syncEcosystem: async () => {}
    });
    assert.equal(res503.success, false);
    assert.match(res503.error || '', /indisponível|bloqueado/i);
  } finally {
    cleanupMockBrowserStorage();
  }
});

test('ignora user_metadata e tentativa de promoção por variável de ambiente; papel e nome vêm exclusivamente de perfis_usuarios ativo', async () => {
  installMockBrowserStorage();
  const bootstrapEnvKey = ['VITE_BOOTSTRAP', 'ADMIN_EMAIL'].join('_');
  const prevEnv = process.env[bootstrapEnvKey];
  process.env[bootstrapEnvKey] = 'analista.spoof@sema.mt.gov.br';

  try {
    const mock = createMockSupabaseAuthClient({
      accounts: {
        'analista.spoof@sema.mt.gov.br': {
          password: 'SenhaForte@2026',
          user_metadata: {
            perfil: 'administrador',
            role: 'administrador',
            full_name: 'Admin Forjado Metadata'
          }
        }
      },
      profiles: [
        {
          id: '22222222-2222-4222-8222-222222222222',
          email: 'analista.spoof@sema.mt.gov.br',
          nome: 'Analista Oficial CSB',
          perfil: 'analista',
          status: 'ativo'
        }
      ]
    });

    const loginRes = await signInInspector('analista.spoof@sema.mt.gov.br', 'SenhaForte@2026', {
      client: mock.client,
      syncEcosystem: async () => {}
    });
    assert.equal(loginRes.success, true);
    assert.equal(loginRes.role, 'analista');
    assert.equal(loginRes.fullName, 'Analista Oficial CSB');

    const sessRes = await getInspectorSession({
      client: mock.client,
      ensureEcosystemSession: async () => {}
    });
    assert.equal(sessRes.authenticated, true);
    assert.equal(sessRes.role, 'analista');
    assert.equal(sessRes.fullName, 'Analista Oficial CSB');

    const ensureRes = await ensureAuthenticatedSession({ client: mock.client });
    assert.equal(ensureRes.authenticated, true);
    assert.equal(ensureRes.role, 'analista');

    const diagRes = await getSupabaseSecurityDiagnostics({ client: mock.client });
    assert.equal(diagRes.authenticated, true);
    assert.equal(diagRes.role, 'analista');
  } finally {
    if (prevEnv === undefined) {
      delete process.env[bootstrapEnvKey];
    } else {
      process.env[bootstrapEnvKey] = prevEnv;
    }
    cleanupMockBrowserStorage();
  }
});

test('rejeita perfil ausente, inativo, pendente, reprovado ou com papel inválido e revoga sessão', async () => {
  installMockBrowserStorage();

  try {
    // 1. Perfil ausente (sem promoção nem fallback analista)
    const missingMock = createMockSupabaseAuthClient({
      accounts: {
        'sem.perfil@sema.mt.gov.br': {
          password: 'SenhaForte@2026',
          user_metadata: { perfil: 'administrador' }
        }
      },
      profiles: []
    });
    const missingLogin = await signInInspector('sem.perfil@sema.mt.gov.br', 'SenhaForte@2026', {
      client: missingMock.client,
      syncEcosystem: async () => {}
    });
    assert.equal(missingLogin.success, false);
    assert.equal(missingMock.getSignOutCount(), 1);
    assert.equal(missingMock.getCurrentSession(), null);

    // 2. Perfis pendente, inativo, reprovado e papel inválido
    for (const testCase of [
      { email: 'pendente@sema.mt.gov.br', status: 'pendente', perfil: 'analista' },
      { email: 'inativo@sema.mt.gov.br', status: 'inativo', perfil: 'administrador' },
      { email: 'reprovado@sema.mt.gov.br', status: 'reprovado', perfil: 'analista' },
      { email: 'invalido@sema.mt.gov.br', status: 'ativo', perfil: 'superadmin' }
    ]) {
      const mock = createMockSupabaseAuthClient({
        accounts: {
          [testCase.email]: {
            password: 'SenhaForte@2026',
            user_metadata: { perfil: 'administrador' }
          }
        },
        profiles: [
          {
            id: '33333333-3333-4333-8333-333333333333',
            email: testCase.email,
            nome: 'Servidor Teste',
            perfil: testCase.perfil,
            status: testCase.status
          }
        ]
      });

      const res = await signInInspector(testCase.email, 'SenhaForte@2026', {
        client: mock.client,
        syncEcosystem: async () => {}
      });
      assert.equal(res.success, false, `Esperava bloqueio para status=${testCase.status} perfil=${testCase.perfil}`);
      assert.equal(mock.getSignOutCount(), 1);

      const sessWithActiveJwt = createMockSupabaseAuthClient({
        activeSession: {
          access_token: 'tok-x',
          user: {
            id: 'u-x',
            email: testCase.email,
            user_metadata: { perfil: 'administrador' }
          }
        },
        profiles: [
          {
            id: '33333333-3333-4333-8333-333333333333',
            email: testCase.email,
            nome: 'Servidor Teste',
            perfil: testCase.perfil,
            status: testCase.status
          }
        ]
      });
      const sessRes = await getInspectorSession({ client: sessWithActiveJwt.client });
      assert.deepEqual(sessRes, { authenticated: false });
      const ensureRes = await ensureAuthenticatedSession({ client: sessWithActiveJwt.client });
      assert.deepEqual(ensureRes, { authenticated: false });
    }

    // 3. Token inválido no servidor (auth.getUser falha)
    const invalidTokenMock = createMockSupabaseAuthClient({
      activeSession: {
        access_token: 'expired-tok',
        user: { id: 'u-1', email: 'admin@sema.mt.gov.br' }
      },
      getUserError: { message: 'JWT expired' },
      profiles: [
        {
          id: '11111111-1111-4111-8111-111111111111',
          email: 'admin@sema.mt.gov.br',
          nome: 'Admin Real',
          perfil: 'administrador',
          status: 'ativo'
        }
      ]
    });
    assert.deepEqual(await getInspectorSession({ client: invalidTokenMock.client }), {
      authenticated: false
    });
    assert.deepEqual(await ensureAuthenticatedSession({ client: invalidTokenMock.client }), {
      authenticated: false
    });
  } finally {
    cleanupMockBrowserStorage();
  }
});

test('mantém login legítimo e validação de sessão para perfis ativos (administrador e visualizador) e alteração de senha autenticada', async () => {
  const { events } = installMockBrowserStorage();

  try {
    const adminMock = createMockSupabaseAuthClient({
      accounts: {
        'coord.csb@sema.mt.gov.br': { password: 'SenhaForte@2026' }
      },
      profiles: [
        {
          id: '11111111-1111-4111-8111-111111111111',
          email: 'coord.csb@sema.mt.gov.br',
          nome: 'Coordenador CSB',
          perfil: 'administrador',
          status: 'ativo',
          cargo: 'Coordenador de Segurança de Barragens'
        }
      ]
    });

    const loginRes = await signInInspector('coord.csb@sema.mt.gov.br', 'SenhaForte@2026', {
      client: adminMock.client,
      syncEcosystem: async () => {}
    });
    assert.deepEqual(loginRes, {
      success: true,
      email: 'coord.csb@sema.mt.gov.br',
      fullName: 'Coordenador CSB',
      role: 'administrador'
    });
    assert.equal(events.some(e => e.type === 'csb:auth_state_changed'), true);

    const pwdRes = await updateInspectorPassword('NovaSenhaForte@2026', { client: adminMock.client });
    assert.equal(pwdRes.success, true);
    assert.equal(adminMock.getPasswordUpdatedTo(), 'NovaSenhaForte@2026');

    const viewerMock = createMockSupabaseAuthClient({
      accounts: {
        'consulta@sema.mt.gov.br': { password: 'SenhaForte@2026' }
      },
      profiles: [
        {
          id: '44444444-4444-4444-8444-444444444444',
          email: 'consulta@sema.mt.gov.br',
          nome: 'Visualizador CSB',
          perfil: 'visualizador',
          status: 'ativo'
        }
      ]
    });

    const viewerLogin = await signInInspector('consulta@sema.mt.gov.br', 'SenhaForte@2026', {
      client: viewerMock.client,
      syncEcosystem: async () => {}
    });
    assert.deepEqual(viewerLogin, {
      success: true,
      email: 'consulta@sema.mt.gov.br',
      fullName: 'Visualizador CSB',
      role: 'visualizador'
    });

    await signOutInspector({ client: viewerMock.client });
    assert.equal(viewerMock.getCurrentSession(), null);
  } finally {
    cleanupMockBrowserStorage();
  }
});

test('remove solicitação de acesso, cadastro, bootstrap e ações mutáveis da UI, exigindo processo institucional fora do navegador sem confiar em props da interface', () => {
  assert.equal('bootstrapFirstAdmin' in userService, false);
  assert.equal('hasAnyAdminUser' in userService, false);

  const loginSource = fs.readFileSync(
    path.resolve(process.cwd(), 'src/components/LoginPage.tsx'),
    'utf8'
  );
  assert.equal(/bootstrapFirstAdmin|hasAnyAdminUser|requestUserAccess/.test(loginSource), false);
  assert.equal(/Solicitar Acesso|Enviar Solicitação de Acesso|1º\s*Admin|mode\s*===\s*['"](bootstrap|register)['"]/.test(loginSource), false);
  assert.match(loginSource, /fora do navegador/i);

  const authModalSource = fs.readFileSync(
    path.resolve(process.cwd(), 'src/components/InspectorAuthModal.tsx'),
    'utf8'
  );
  assert.equal(/signUpInspector|isSignUp|Criar acesso|Cadastrar e Conectar/.test(authModalSource), false);
  assert.match(authModalSource, /fora do navegador/i);

  const usersStepSource = fs.readFileSync(
    path.resolve(process.cwd(), 'src/components/UsersManagementStep.tsx'),
    'utf8'
  );
  assert.equal(
    /createUser|updateUser|deleteUser|toggleUserStatus|resetUserPasswordToDefault|approveUserAccess|rejectUserAccess|oneTimePwdModal|showCreateModal|temporaryPassword|getUsers|localStorage|fiscaliza_csb_users_catalog_v1|perfis_usuarios\.select/.test(
      usersStepSource
    ),
    false
  );
  assert.match(usersStepSource, /Consulta de Usuários Desabilitada/i);
  assert.match(usersStepSource, /USERS_LISTING_DISABLED_REASON|mecanismo seguro de autorização no servidor/i);
  assert.equal(/Usuários Cadastrados no Sistema|Registros com Status Pendente|Ativos \/ Total/.test(usersStepSource), false);

  const deniedAnalistaHtml = renderToStaticMarkup(
    React.createElement(UsersManagementStep, {
      currentUser: { email: 'analista@sema.mt.gov.br', role: 'analista' },
      onGoToDashboard: () => {}
    })
  );
  assert.match(deniedAnalistaHtml, /Acesso Restrito ao Administrador/);

  const forgedAdminPropHtml = renderToStaticMarkup(
    React.createElement(UsersManagementStep, {
      currentUser: { email: 'forjado@sema.mt.gov.br', role: 'administrador' },
      onGoToDashboard: () => {}
    })
  );
  assert.match(forgedAdminPropHtml, /Acesso Restrito ao Administrador/);
  assert.equal(/Novo Usuário|Gerar nova senha|Aprovar|Reprovar|Admin Forjado Cache/.test(forgedAdminPropHtml), false);
});

test('bloqueia createUser, updateUser, approveUserAccess, rejectUserAccess, deleteUser, toggleUserStatus e resetUserPasswordToDefault sem gravações no Supabase ou localStorage', async () => {
  const { store } = installMockBrowserStorage({
    fiscaliza_csb_users_catalog_v1: JSON.stringify([
      {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        email: 'pendente@sema.mt.gov.br',
        name: 'Solicitante Pendente',
        role: 'analista',
        status: 'pendente'
      }
    ])
  });

  const beforeKeys = Array.from(store.entries());
  let writeAttempted = false;

  const createProfileReadClient = (email: string, perfil: string) =>
    ({
      auth: {
        async getSession() {
          return {
            data: {
              session: {
                access_token: `tok-${email}`,
                user: { id: `id-${email}`, email }
              }
            },
            error: null
          };
        },
        async getUser() {
          return { data: { user: { id: `id-${email}`, email } }, error: null };
        },
        async updateUser() {
          writeAttempted = true;
          throw new Error('auth.updateUser should not be called');
        }
      },
      from() {
        return {
          select() {
            return {
              eq() {
                return {
                  async maybeSingle() {
                    return {
                      data: { id: 'p-1', email, nome: 'Usuário', perfil, status: 'ativo' },
                      error: null
                    };
                  }
                };
              }
            };
          },
          insert() {
            writeAttempted = true;
            throw new Error('insert should not be called');
          },
          update() {
            writeAttempted = true;
            throw new Error('update should not be called');
          },
          upsert() {
            writeAttempted = true;
            throw new Error('upsert should not be called');
          },
          delete() {
            writeAttempted = true;
            throw new Error('delete should not be called');
          }
        };
      }
    }) as unknown as SupabaseClient;

  try {
    for (const deps of [
      { client: null },
      { client: createProfileReadClient('analista@sema.mt.gov.br', 'analista') },
      { client: createProfileReadClient('coord.csb@sema.mt.gov.br', 'administrador') }
    ]) {
      const created = await userService.createUser(
        {
          email: 'novo.admin@sema.mt.gov.br',
          name: 'Admin Não Autorizado',
          role: 'administrador',
          status: 'ativo'
        },
        deps
      );
      assert.equal(created.success, false);
      assert.ok(created.error && created.error.length > 10);

      const updated = await userService.updateUser(
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        { role: 'administrador', status: 'ativo' },
        deps
      );
      assert.equal(updated.success, false);
      assert.ok(updated.error && updated.error.length > 10);

      const approved = await userService.approveUserAccess(
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        'administrador',
        'coord.csb@sema.mt.gov.br',
        deps
      );
      assert.equal(approved.success, false);
      assert.ok(approved.error && approved.error.length > 10);

      const rejected = await userService.rejectUserAccess(
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        'Indeferido',
        deps
      );
      assert.equal(rejected.success, false);
      assert.ok(rejected.error && rejected.error.length > 10);

      const toggled = await userService.toggleUserStatus('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', deps);
      assert.equal(toggled.success, false);
      assert.ok(toggled.error && toggled.error.length > 10);

      const deleted = await userService.deleteUser(
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        'coord.csb@sema.mt.gov.br',
        deps
      );
      assert.equal(deleted.success, false);
      assert.ok(deleted.error && deleted.error.length > 10);

      const resetRes = await userService.resetUserPasswordToDefault('analista@sema.mt.gov.br', deps);
      assert.equal(resetRes.success, false);
      assert.equal('temporaryPassword' in resetRes, false);
      assert.match(resetRes.error || '', /servidor/i);
    }

    assert.equal(writeAttempted, false);
    assert.deepEqual(Array.from(store.entries()), beforeKeys);
  } finally {
    cleanupMockBrowserStorage();
  }
});

test('bloqueia requestUserAccess e signUpInspector sem chamar auth.signUp, insert/update/upsert ou alterar localStorage', async () => {
  const { store, events } = installMockBrowserStorage({
    fiscaliza_csb_users_catalog_v1: JSON.stringify([])
  });
  const beforeEntries = Array.from(store.entries());
  let signUpCalled = false;
  let dbCalled = false;

  const clientMock = {
    auth: {
      async signUp() {
        signUpCalled = true;
        return { data: { user: { id: 'orphan-1', email: 'novo@sema.mt.gov.br' }, session: null }, error: null };
      }
    },
    from() {
      dbCalled = true;
      return {
        insert() {
          throw new Error('insert should not be called');
        },
        update() {
          throw new Error('update should not be called');
        },
        upsert() {
          throw new Error('upsert should not be called');
        }
      };
    }
  } as unknown as SupabaseClient;

  try {
    const reqRes = await userService.requestUserAccess(
      {
        name: 'Novo Fiscal',
        email: 'novo@sema.mt.gov.br',
        cargo: 'Fiscal Técnico',
        matricula: 'CSB-101',
        password: 'SenhaForte@2026'
      },
      { client: clientMock }
    );
    assert.equal(reqRes.success, false);
    assert.match(reqRes.error || '', /fora do navegador/i);

    const signUpRes = await signUpInspector(
      'novo@sema.mt.gov.br',
      'SenhaForte@2026',
      'Novo Fiscal',
      'Fiscal Técnico',
      'CSB-101',
      { client: clientMock }
    );
    assert.equal(signUpRes.success, false);
    assert.match(signUpRes.error || '', /fora do navegador/i);

    assert.equal(signUpCalled, false);
    assert.equal(dbCalled, false);
    assert.deepEqual(Array.from(store.entries()), beforeEntries);
    assert.equal(events.length, 0);
  } finally {
    cleanupMockBrowserStorage();
  }
});

test('bloqueia listagem direta de perfis_usuarios pelo navegador para todos os perfis e nunca exibe cache local como fonte alternativa', async () => {
  const { store } = installMockBrowserStorage({
    fiscaliza_csb_users_catalog_v1: JSON.stringify([
      {
        id: 'forged-1',
        email: 'invasor@sema.mt.gov.br',
        name: 'Admin Forjado Cache',
        role: 'administrador',
        status: 'ativo'
      },
      {
        id: 'forged-2',
        email: 'pendente.cache@sema.mt.gov.br',
        name: 'Pendente Cache',
        role: 'analista',
        status: 'pendente'
      }
    ])
  });

  const beforeCache = store.get('fiscaliza_csb_users_catalog_v1');
  let listingQueryAttempted = false;

  const makeBlockedListClient = (email: string, perfil: string) =>
    ({
      auth: {
        async getSession() {
          return {
            data: { session: { access_token: `tok-${email}`, user: { id: `u-${email}`, email } } },
            error: null
          };
        },
        async getUser() {
          return { data: { user: { id: `u-${email}`, email } }, error: null };
        }
      },
      from(table: string) {
        if (table === 'perfis_usuarios') {
          listingQueryAttempted = true;
        }
        throw new Error(`Consulta direta em ${table} não deve ocorrer pelo navegador`);
      }
    }) as unknown as SupabaseClient;

  try {
    assert.deepEqual(await userService.getUsers({ client: null }), []);
    assert.deepEqual(
      await userService.getUsers({ client: makeBlockedListClient('analista@sema.mt.gov.br', 'analista') }),
      []
    );
    assert.deepEqual(
      await userService.getUsers({ client: makeBlockedListClient('visualizador@sema.mt.gov.br', 'visualizador') }),
      []
    );
    assert.deepEqual(
      await userService.getUsers({ client: makeBlockedListClient('coord.csb@sema.mt.gov.br', 'administrador') }),
      []
    );

    assert.equal(await userService.getUserByEmail('invasor@sema.mt.gov.br', { client: null }), null);
    assert.equal(
      await userService.getUserByEmail('coord.csb@sema.mt.gov.br', {
        client: makeBlockedListClient('coord.csb@sema.mt.gov.br', 'administrador')
      }),
      null
    );

    assert.equal(listingQueryAttempted, false);
    assert.equal(store.get('fiscaliza_csb_users_catalog_v1'), beforeCache);
    assert.match(userService.USERS_LISTING_DISABLED_REASON, /mecanismo seguro de autorização no servidor/i);
  } finally {
    cleanupMockBrowserStorage();
  }
});
