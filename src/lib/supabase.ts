// ==============================================================================
// CONFIGURAÇÃO DO CLIENTE SUPABASE (src/lib/supabase.ts)
// Inicializa o cliente oficial Supabase com higienização estrita de URL
// ==============================================================================

import { createClient, SupabaseClient } from '@supabase/supabase-js';

export const cleanSupabaseUrl = (url?: string): string => {
  if (!url) return '';
  let cleaned = url.trim();
  if (cleaned.includes('COLE_AQUI') || cleaned.includes('your-project')) return '';
  // Remove qualquer sufixo /rest/v1 ou /rest/v1/ que cause erro PGRST125
  cleaned = cleaned.replace(/\/rest\/v1\/?$/i, '');
  // Remove barras finais
  cleaned = cleaned.replace(/\/+$/, '');
  return cleaned;
};

// Lê do import.meta.env com fallback seguro
const rawEnvUrl = (import.meta.env.VITE_SUPABASE_URL || '').trim();
const rawEnvKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();

const sanitizedUrl = cleanSupabaseUrl(rawEnvUrl);

const isValidHttpUrl = (url: string): boolean => {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
};

export const isSupabaseConfigured: boolean = isValidHttpUrl(sanitizedUrl) && rawEnvKey.length > 10;

// URL e Chave padronizadas para evitar falhas de inicialização em tempo de execução
const supabaseUrl = isSupabaseConfigured ? sanitizedUrl : 'https://placeholder.supabase.co';
const supabaseAnonKey = isSupabaseConfigured ? rawEnvKey : 'placeholder-anon-key';

export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true
  },
  realtime: {
    params: {
      eventsPerSecond: 10
    }
  }
});
