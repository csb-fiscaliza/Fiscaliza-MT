// ==============================================================================
// CONFIGURAÇÃO DO CLIENTE SUPABASE (src/lib/supabase.ts)
// Inicializa o cliente oficial Supabase com higienização estrita de URL
// ==============================================================================

import { SupabaseClient } from '@supabase/supabase-js';
import { fiscalizaSupabase, isFiscalizaSupabaseConfigured } from '../services/ecosystemConfig';

export const cleanSupabaseUrl = (url?: string): string => {
  if (!url) return '';
  let cleaned = url.trim();
  if (cleaned.includes('COLE_AQUI') || cleaned.includes('your-project')) return '';
  cleaned = cleaned.replace(/\/rest\/v1\/?$/i, '');
  cleaned = cleaned.replace(/\/+$/, '');
  return cleaned;
};

export const isSupabaseConfigured: boolean = isFiscalizaSupabaseConfigured();

export const supabase: SupabaseClient | null = fiscalizaSupabase;
