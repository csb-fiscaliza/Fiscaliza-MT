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
export const classificaSupabase: SupabaseClient | null = classificaInit.client;
export const notificaSupabase: SupabaseClient | null = notificaInit.client;

export const isFiscalizaSupabaseConfigured = (): boolean => fiscalizaInit.configured;
export const isClassificaSupabaseConfigured = (): boolean => classificaInit.configured;
export const isNotificaSupabaseConfigured = (): boolean => notificaInit.configured;

export async function syncEcosystemAuthSession(
  _email?: string,
  _password?: string
): Promise<void> {
  // Desativado: credenciais de login do Fiscaliza não devem ser reenviadas a outros projetos Supabase.
  return;
}

export async function ensureEcosystemClientsSession(): Promise<void> {
  // Desativado: tokens de sessão do Fiscaliza não devem ser replicados para clientes de outros projetos.
  return;
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
    {
      sistema: 'administra',
      nomeExibicao: 'Administra Barragens',
      papel: 'Base Central de Barragens (Leitura S2S API 2.0 via backend Fiscaliza + Catálogo Local)',
      configured: false,
      safeKey: true,
      modoOperacao: 'modo_local'
    },
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

async function checkAdministraBackendHealth(online: boolean): Promise<ServerConnectivityResult> {
  const nomeExibicao = 'Administra Barragens';
  if (!online) {
    return {
      sistema: 'administra',
      nomeExibicao,
      configured: false,
      reachable: false,
      latencyMs: null,
      statusText: 'Dispositivo sem conexão de rede'
    };
  }

  if (!fiscalizaSupabase || typeof fetch !== 'function' || typeof window === 'undefined') {
    return {
      sistema: 'administra',
      nomeExibicao,
      configured: false,
      reachable: false,
      latencyMs: null,
      statusText: 'Operando em base local'
    };
  }

  try {
    const {
      data: { session }
    } = await fiscalizaSupabase.auth.getSession();
    const token = session?.access_token;
    if (!token) {
      return {
        sistema: 'administra',
        nomeExibicao,
        configured: false,
        reachable: false,
        latencyMs: null,
        statusText: 'Sessão autenticada necessária para consulta S2S via servidor'
      };
    }

    const started = performance.now();
    const res = await fetch('/api/administra/health', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json'
      }
    });
    const latencyMs = Math.round(performance.now() - started);
    const body = await res.json().catch(() => null);

    if (!res.ok) {
      return {
        sistema: 'administra',
        nomeExibicao,
        configured: Boolean(body?.configured ?? true),
        reachable: false,
        latencyMs: null,
        statusText:
          (typeof body?.error === 'string' && body.error) ||
          'Sem resposta da API 2.0 do Administra no momento'
      };
    }

    if (!body?.configured) {
      return {
        sistema: 'administra',
        nomeExibicao,
        configured: false,
        reachable: false,
        latencyMs: null,
        statusText:
          (typeof body?.statusText === 'string' && body.statusText) ||
          'Operando em base local'
      };
    }

    return {
      sistema: 'administra',
      nomeExibicao,
      configured: true,
      reachable: Boolean(body.reachable),
      latencyMs: typeof body.latencyMs === 'number' ? body.latencyMs : latencyMs,
      statusText:
        (typeof body.statusText === 'string' && body.statusText) ||
        (body.reachable ? 'Conectado à API 2.0 S2S do Administra' : 'Sem resposta da API 2.0')
    };
  } catch {
    return {
      sistema: 'administra',
      nomeExibicao,
      configured: false,
      reachable: false,
      latencyMs: null,
      statusText: 'Operando em base local'
    };
  }
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

  const [administraStatus, ...supabaseStatuses] = await Promise.all([
    checkAdministraBackendHealth(online),
    ...targets.map(async t => {
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
  ]);

  return [administraStatus, ...supabaseStatuses];
}
