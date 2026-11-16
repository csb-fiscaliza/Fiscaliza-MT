// ==============================================================================
// ARQUIVO: src/services/ecosystemConfig.ts
// Configuração Multi-Cliente do Ecossistema CSB/SEMA-MT:
// - Administra Barragens (Base Mestra Central: Empreendedores, Barragens, RTs)
// - Fiscaliza Barragens (Produtos de Campo: Vistorias, Medições, Autos, Fotos)
// - Classifica Barragens (Consulta Read-Only de CRI/DPA e Classificações)
// - Notifica Barragens (Consulta Read-Only de Notificações e Ofícios)
// Segurança Estrita: Bloqueia qualquer chave service_role ou sb_secret_ no navegador.
// ==============================================================================

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
  urlHost?: string;
  modoOperacao: 'supabase_remoto' | 'migracao_pendente_local' | 'bloqueado_seguranca';
}

function normalizeUrl(raw?: string): string {
  return (raw || '').trim().replace(/\/rest\/v1\/?$/i, '').replace(/\/+$/, '');
}

function isPlaceholderUrl(url: string): boolean {
  if (!url) return true;
  return (
    !url.startsWith('https://') ||
    url.includes('COLE_AQUI') ||
    url.includes('your-project') ||
    url.includes('sua-url')
  );
}

function buildSafeSupabaseClient(
  urlRaw: string | undefined,
  keyRaw: string | undefined,
  storageKey: string
): {
  client: SupabaseClient | null;
  configured: boolean;
  safeKey: boolean;
  securityError?: string;
  urlHost?: string;
} {
  const url = normalizeUrl(urlRaw);
  const key = (keyRaw || '').trim();

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
      securityError: keyCheck.reason || 'Chave imprópria para uso no frontend.'
    };
  }

  let urlHost: string | undefined;
  try {
    urlHost = new URL(url).hostname;
  } catch {
    return {
      client: null,
      configured: false,
      safeKey: false,
      securityError: 'URL do projeto Supabase inválida.'
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
    safeKey: true,
    urlHost
  };
}

// 1. Cliente do FISCALIZA (Produtos de vistoria, fotos, relatórios, perfis do Fiscaliza)
const fiscalizaInit = buildSafeSupabaseClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  'sb-fiscaliza-auth-v1'
);

// 2. Cliente do ADMINISTRA BARRAGENS (Base Mestra Central de Empreendedores, Barragens e RTs)
const administraInit = buildSafeSupabaseClient(
  import.meta.env.VITE_ADMINISTRA_SUPABASE_URL,
  import.meta.env.VITE_ADMINISTRA_SUPABASE_ANON_KEY,
  'sb-administra-auth-v1'
);

// 3. Cliente do CLASSIFICA BARRAGENS (Somente leitura de classificações e produtos)
const classificaInit = buildSafeSupabaseClient(
  import.meta.env.VITE_CLASSIFICA_SUPABASE_URL,
  import.meta.env.VITE_CLASSIFICA_SUPABASE_ANON_KEY,
  'sb-classifica-ro-v1'
);

// 4. Cliente do NOTIFICA BARRAGENS (Somente leitura de ofícios, notificações e produtos)
const notificaInit = buildSafeSupabaseClient(
  import.meta.env.VITE_NOTIFICA_SUPABASE_URL,
  import.meta.env.VITE_NOTIFICA_SUPABASE_ANON_KEY,
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

export function getEcosystemStatus(): EcosystemNodeStatus[] {
  const toNode = (
    sistema: SistemaOrigem,
    nomeExibicao: string,
    papel: string,
    init: ReturnType<typeof buildSafeSupabaseClient>
  ): EcosystemNodeStatus => ({
    sistema,
    nomeExibicao,
    papel,
    configured: init.configured,
    safeKey: init.safeKey,
    securityError: init.securityError,
    urlHost: init.urlHost,
    modoOperacao: !init.safeKey
      ? 'bloqueado_seguranca'
      : init.configured
      ? 'supabase_remoto'
      : 'migracao_pendente_local'
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
  urlHost?: string;
}

export async function checkEcosystemServerConnections(): Promise<ServerConnectivityResult[]> {
  const online = typeof navigator !== 'undefined' ? navigator.onLine : true;
  const targets: {
    sistema: SistemaOrigem;
    nomeExibicao: string;
    init: ReturnType<typeof buildSafeSupabaseClient>;
    probeTable: string;
  }[] = [
    { sistema: 'administra', nomeExibicao: 'Administra Barragens', init: administraInit, probeTable: 'empreendedores' },
    { sistema: 'fiscaliza', nomeExibicao: 'FISCALIZA - Etapa de Campo', init: fiscalizaInit, probeTable: 'vistorias' },
    { sistema: 'classifica', nomeExibicao: 'Classifica Barragens', init: classificaInit, probeTable: 'produtos_ecossistema' },
    { sistema: 'notifica', nomeExibicao: 'Notifica Barragens', init: notificaInit, probeTable: 'produtos_ecossistema' }
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
          statusText: t.init.securityError || 'Bloqueado por segurança'
        };
      }
      if (!t.init.configured || !t.init.client) {
        return {
          sistema: t.sistema,
          nomeExibicao: t.nomeExibicao,
          configured: false,
          reachable: false,
          latencyMs: null,
          statusText: 'Chaves .env ainda não configuradas (modo local ativo)'
        };
      }
      if (!online) {
        return {
          sistema: t.sistema,
          nomeExibicao: t.nomeExibicao,
          configured: true,
          reachable: false,
          latencyMs: null,
          urlHost: t.init.urlHost,
          statusText: 'Dispositivo sem rede (offline)'
        };
      }
      const started = performance.now();
      try {
        const { error } = await t.init.client.from(t.probeTable).select('id').limit(1);
        const latencyMs = Math.round(performance.now() - started);
        if (error && error.code === 'PGRST301') {
          return {
            sistema: t.sistema,
            nomeExibicao: t.nomeExibicao,
            configured: true,
            reachable: true,
            latencyMs,
            urlHost: t.init.urlHost,
            statusText: 'Servidor alcançável (sessão protegida por RLS)'
          };
        }
        if (error) {
          return {
            sistema: t.sistema,
            nomeExibicao: t.nomeExibicao,
            configured: true,
            reachable: true,
            latencyMs,
            urlHost: t.init.urlHost,
            statusText: `Servidor alcançável (${error.message})`
          };
        }
        return {
          sistema: t.sistema,
          nomeExibicao: t.nomeExibicao,
          configured: true,
          reachable: true,
          latencyMs,
          urlHost: t.init.urlHost,
          statusText: 'Conectado e respondendo'
        };
      } catch (err: any) {
        return {
          sistema: t.sistema,
          nomeExibicao: t.nomeExibicao,
          configured: true,
          reachable: false,
          latencyMs: null,
          urlHost: t.init.urlHost,
          statusText: err?.message || 'Falha de rede ao consultar servidor'
        };
      }
    })
  );
}
