-- ==============================================================================
-- FISCALIZA – ETAPA DE CAMPO (CSB / SEMA-MT)
-- Script SQL preparado para revisão institucional (NÃO EXECUTAR AUTOMATICAMENTE)
-- Criação idempotente de public.perfis_usuarios com RLS estrita (fail-closed)
--
-- Diagnóstico:
--   A migração 20261115_ecosystem_administra_integration.sql referenciou
--   public.perfis_usuarios sem criação prévia da tabela no schema public.
--   Este script provisiona apenas a estrutura de perfis no projeto do Fiscaliza.
--   Usuários em Supabase Auth NÃO recebem acesso automático sem registro ativo aqui.
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS public.perfis_usuarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  email TEXT NOT NULL UNIQUE,
  nome TEXT NOT NULL,
  perfil TEXT NOT NULL CHECK (perfil IN ('administrador', 'analista', 'visualizador')),
  status TEXT NOT NULL DEFAULT 'inativo' CHECK (status IN ('ativo', 'inativo', 'pendente', 'reprovado')),
  cargo TEXT,
  matricula TEXT,
  setor TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_perfis_usuarios_email_lower
  ON public.perfis_usuarios (lower(trim(email)));

CREATE OR REPLACE FUNCTION public.fn_perfis_usuarios_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_perfis_usuarios_updated_at ON public.perfis_usuarios;
CREATE TRIGGER trg_perfis_usuarios_updated_at
  BEFORE UPDATE ON public.perfis_usuarios
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_perfis_usuarios_updated_at();

-- ==============================================================================
-- HARDENING DE SEGURANÇA (RLS ESTRITA E BLOQUEIO DE AUTO-PROVISIONAMENTO)
-- ==============================================================================

ALTER TABLE public.perfis_usuarios ENABLE ROW LEVEL SECURITY;

-- Remove políticas permissivas ou legadas que permitiam auto-cadastro pelo navegador
DROP POLICY IF EXISTS "perfis_select_policy" ON public.perfis_usuarios;
DROP POLICY IF EXISTS "perfis_insert_policy" ON public.perfis_usuarios;
DROP POLICY IF EXISTS "perfis_insert_self_pending" ON public.perfis_usuarios;
DROP POLICY IF EXISTS "perfis_update_policy" ON public.perfis_usuarios;
DROP POLICY IF EXISTS "perfis_delete_policy" ON public.perfis_usuarios;

-- Revoga privilégios de escrita do cliente navegador (anon e authenticated)
REVOKE ALL ON public.perfis_usuarios FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.perfis_usuarios FROM authenticated;
GRANT SELECT ON public.perfis_usuarios TO authenticated;

-- Usuário autenticado lê exclusivamente o próprio perfil institucional
CREATE POLICY "perfis_usuarios_select_own"
  ON public.perfis_usuarios
  FOR SELECT
  TO authenticated
  USING (
    (user_id IS NOT NULL AND user_id = auth.uid())
    OR lower(trim(email)) = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
  );

-- Bloqueio explícito de escrita via cliente navegador (papel/status só via processo institucional seguro)
CREATE POLICY "perfis_usuarios_deny_browser_insert"
  ON public.perfis_usuarios
  FOR INSERT
  TO authenticated
  WITH CHECK (false);

CREATE POLICY "perfis_usuarios_deny_browser_update"
  ON public.perfis_usuarios
  FOR UPDATE
  TO authenticated
  USING (false)
  WITH CHECK (false);

CREATE POLICY "perfis_usuarios_deny_browser_delete"
  ON public.perfis_usuarios
  FOR DELETE
  TO authenticated
  USING (false);

-- ==============================================================================
-- MODELO COMENTADO DE PROVISIONAMENTO INSTITUCIONAL (SOMENTE PLACEHOLDERS)
-- Revise e execute fora do navegador apenas pelo canal administrativo seguro,
-- preenchendo os placeholders com dados institucionais verificados.
-- Nenhum comando abaixo promove perfil a administrador.
-- ==============================================================================
--
-- INSERT INTO public.perfis_usuarios (
--   user_id,
--   email,
--   nome,
--   perfil,
--   status,
--   cargo,
--   matricula,
--   setor
-- )
-- VALUES (
--   '<AUTH_USER_UUID>',
--   '<EMAIL_INSTITUCIONAL>',
--   '<NOME_COMPLETO_SERVIDOR>',
--   'analista', -- ou 'visualizador' conforme ato de designação institucional
--   'ativo',
--   '<CARGO_INSTITUCIONAL>',
--   '<MATRICULA_FUNCIONAL>',
--   '<SETOR_UNIDADE>'
-- )
-- ON CONFLICT (email) DO NOTHING;
