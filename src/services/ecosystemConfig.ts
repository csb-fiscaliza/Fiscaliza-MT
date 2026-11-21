import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { SistemaOrigem } from '../types/inspection';
import { assertFrontendSafeSupabaseKey } from '../utils/securityCrypto';

export interface EcosystemNodeStatus {
  sistema: SistemaOrigem;
  nomeExibicao: string;
  papel: string;
  configured: boolean;
  safeKey: boolean;
  securityError?: string;
  modoOperacao: 'remoto_ativo' | 'modo_local' | 'bloqueado_seguranca';
}

function stripOuterQuotes(raw?: string): string {
  const trimmed = (raw || '').trim();
  if (
    trimmed.length >= 2 &&
    ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'")))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function normalizeUrl(raw?: string): string {
  return stripOuterQuotes(raw).replace(/\/rest\/v1\/?$/i, '').replace(/\/+$/, '');
}

function isPlaceholderUrl(url: string): boolean {
  if (!url) return true;
  return (
    !url.startsWith('https://') ||
    url.includes('COLE_AQUI') ||
    url.includes('your-project') ||
    url.includes('seu-projeto') ||
    url.includes('sua-url')
  );
}

function buildSafeClient(
  urlRaw: string | undefined,
  keyRaw: string | undefined,
  storageKey: string
): {
  client: SupabaseClient | null;
  configured: boolean;
  safeKey: boolean;
  securityError?: string;
} {
  const url = normalizeUrl(urlRaw);
  const key = stripOuterQuotes(keyRaw);

  if (isPlaceholderUrl(url) || !key) {
    return {
      client: null,
      configured: false,
      safeKey: true
    };
  }

  const keyCheck = assertFrontendSafeSupabaseKey(key);
  if (!keyCheck.safe) {
    return {
      client: null,
      configured: false,
      safeKey: false,
      securityError: 'Configuração de acesso não autorizada para navegador.'
    };
  }

  try {
    new URL(url);
  } catch {
    return {
      client: null,
      configured: false,
      safeKey: false,
      securityError: 'Endereço de serviço inválido.'
    };
  }

  const client = createClient(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      storageKey
    }
  });

  return {
    client,
    configured: true,
    safeKey: true
  };
}

const fiscalizaInit = buildSafeClient(
  import.meta.env ? import.meta.env.VITE_SUPABASE_URL : undefined,
  import.meta.env ? import.meta.env.VITE_SUPABASE_ANON_KEY : undefined,
  'sb-fiscaliza-auth-v1'
);

const administraInit = buildSafeClient(
  import.meta.env ? import.meta.env.VITE_ADMINISTRA_SUPABASE_URL : undefined,
  import.meta.env ? import.meta.env.VITE_ADMINISTRA_SUPABASE_ANON_KEY : undefined,
  'sb-administra-auth-v1'
);

const classificaInit = buildSafeClient(
  import.meta.env ? import.meta.env.VITE_CLASSIFICA_SUPABASE_URL : undefined,
  import.meta.env ? import.meta.env.VITE_CLASSIFICA_SUPABASE_ANON_KEY : undefined,
  'sb-classifica-ro-v1'
);

const notificaInit = buildSafeClient(
  import.meta.env ? import.meta.env.VITE_NOTIFICA_SUPABASE_URL : undefined,
  import.meta.env ? import.meta.env.VITE_NOTIFICA_SUPABASE_ANON_KEY : undefined,
  'sb-notifica-ro-v1'
);

export const fiscalizaSupabase: SupabaseClient | null = fiscalizaInit.client;
export const administraSupabase: SupabaseClient | null = administraInit.client;
export const classificaSupabase: SupabaseClient | null = classificaInit.client;
export const notificaSupabase: SupabaseClient | null = notificaInit.client;

export const isFiscalizaSupabaseConfigured = (): boolean => fiscalizaInit.configured;
export const isAdministraSupabaseConfigured = (): boolean => administraInit.configured;
export const isClassificaSupabaseConfigured = (): boolean => classificaInit.configured;
export const isNotificaSupabaseConfigured = (): boolean => notificaInit.configured;

export async function syncEcosystemAuthSession(email: string, password: string): Promise<void> {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail || !password) return;
  const externalClients = [administraSupabase, classificaSupabase, notificaSupabase].filter(
    (c): c is SupabaseClient => c !== null
  );
  await Promise.all(
    externalClients.map(async client => {
      try {
        const { data } = await client.auth.getSession();
        if (data?.session?.user?.email?.toLowerCase() === cleanEmail) return;
        await client.auth.signInWithPassword({ email: cleanEmail, password });
      } catch {
        // Silencioso caso o usuário não possua sessão neste nó específico
      }
    })
  );
}

export async function ensureEcosystemClientsSession(): Promise<void> {
  if (!fiscalizaSupabase || !administraSupabase) return;
  try {
    const [{ data: admSess }, { data: fiscSess }] = await Promise.all([
      administraSupabase.auth.getSession(),
      fiscalizaSupabase.auth.getSession()
    ]);
    if (!admSess?.session && fiscSess?.session?.access_token && fiscSess?.session?.refresh_token) {
      await administraSupabase.auth.setSession({
        access_token: fiscSess.session.access_token,
        refresh_token: fiscSess.session.refresh_token
      });
    }
  } catch {
    // Silencioso se os nós utilizarem projetos independentes
  }
}

export function getEcosystemStatus(): EcosystemNodeStatus[] {
  const toNode = (
    sistema: SistemaOrigem,
    nomeExibicao: string,
    papel: string,
    init: ReturnType<typeof buildSafeClient>
  ): EcosystemNodeStatus => ({
    sistema,
    nomeExibicao,
    papel,
    configured: init.configured,
    safeKey: init.safeKey,
    securityError: init.securityError,
    modoOperacao: !init.safeKey
      ? 'bloqueado_seguranca'
      : init.configured
      ? 'remoto_ativo'
      : 'modo_local'
  });

  return [
    toNode(
      'administra',
      'Administra Barragens',
      'Base Central (Empreendedores, Barragens e Responsáveis Técnicos)',
      administraInit
    ),
    toNode(
      'fiscaliza',
      'FISCALIZA - Etapa de Campo',
      'Produtos de Campo (Fichas, Medições, Autos, Relatórios e Fotos)',
      fiscalizaInit
    ),
    toNode(
      'classifica',
      'Classifica Barragens',
      'Consulta Integrada de Classificações (CRI/DPA) e Produtos',
      classificaInit
    ),
    toNode(
      'notifica',
      'Notifica Barragens',
      'Consulta Integrada de Notificações, Ofícios e Pareceres',
      notificaInit
    )
  ];
}

export function getSistemaLabel(sistema?: SistemaOrigem | null): string {
  switch (sistema) {
    case 'administra':
      return 'Administra Barragens';
    case 'fiscaliza':
      return 'Fiscaliza Barragens';
    case 'classifica':
      return 'Classifica Barragens';
    case 'notifica':
      return 'Notifica Barragens';
    default:
      return 'Sistema CSB';
  }
}

export interface ServerConnectivityResult {
  sistema: SistemaOrigem;
  nomeExibicao: string;
  configured: boolean;
  reachable: boolean;
  latencyMs: number | null;
  statusText: string;
}

export async function checkEcosystemServerConnections(): Promise<ServerConnectivityResult[]> {
  const online = typeof navigator !== 'undefined' ? navigator.onLine : true;
  const targets: {
    sistema: SistemaOrigem;
    nomeExibicao: string;
    init: ReturnType<typeof buildSafeClient>;
    probeTables: string[];
  }[] = [
    {
      sistema: 'administra',
      nomeExibicao: 'Administra Barragens',
      init: administraInit,
      probeTables: ['empreendedores', 'empreendedor', 'barragens']
    },
    {
      sistema: 'fiscaliza',
      nomeExibicao: 'FISCALIZA - Etapa de Campo',
      init: fiscalizaInit,
      probeTables: ['vistorias']
    },
    {
      sistema: 'classifica',
      nomeExibicao: 'Classifica Barragens',
      init: classificaInit,
      probeTables: ['produtos_ecossistema', 'barragens', 'empreendedores']
    },
    {
      sistema: 'notifica',
      nomeExibicao: 'Notifica Barragens',
      init: notificaInit,
      probeTables: ['produtos_ecossistema', 'notificacoes', 'empreendedores']
    }
  ];

  return Promise.all(
    targets.map(async t => {
      if (!t.init.safeKey) {
        return {
          sistema: t.sistema,
          nomeExibicao: t.nomeExibicao,
          configured: false,
          reachable: false,
          latencyMs: null,
          statusText: 'Acesso bloqueado por validação de segurança'
        };
      }
      if (!t.init.configured || !t.init.client) {
        return {
          sistema: t.sistema,
          nomeExibicao: t.nomeExibicao,
          configured: false,
          reachable: false,
          latencyMs: null,
          statusText: 'Operando em base local'
        };
      }
      if (!online) {
        return {
          sistema: t.sistema,
          nomeExibicao: t.nomeExibicao,
          configured: true,
          reachable: false,
          latencyMs: null,
          statusText: 'Dispositivo sem conexão de rede'
        };
      }

      const started = performance.now();
      try {
        let lastErr: any = null;
        for (const table of t.probeTables) {
          const { error } = await t.init.client.from(table).select('*', { head: true, count: 'exact' });
          if (!error) {
            const latencyMs = Math.round(performance.now() - started);
            return {
              sistema: t.sistema,
              nomeExibicao: t.nomeExibicao,
              configured: true,
              reachable: true,
              latencyMs,
              statusText: 'Conectado e respondendo'
            };
          }
          lastErr = error;
          if (error.code === '42501' || error.code === 'PGRST301') {
            const latencyMs = Math.round(performance.now() - started);
            return {
              sistema: t.sistema,
              nomeExibicao: t.nomeExibicao,
              configured: true,
              reachable: true,
              latencyMs,
              statusText: 'Servidor ativo (sessão autenticada necessária para consulta)'
            };
          }
        }
        const latencyMs = Math.round(performance.now() - started);
        return {
          sistema: t.sistema,
          nomeExibicao: t.nomeExibicao,
          configured: true,
          reachable: true,
          latencyMs,
          statusText: lastErr ? 'Servidor ativo em integração' : 'Conectado e respondendo'
        };
      } catch {
        return {
          sistema: t.sistema,
          nomeExibicao: t.nomeExibicao,
          configured: true,
          reachable: false,
          latencyMs: null,
          statusText: 'Sem resposta do servidor no momento'
        };
      }
    })
  );
}
