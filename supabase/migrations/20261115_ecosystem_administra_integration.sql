-- ==============================================================================
-- MIGRAÇÃO: INTEGRAÇÃO DO ECOSSISTEMA CSB/SEMA-MT & REFORÇO DE SEGURANÇA RLS
-- Sistemas integrados:
--   * administa   -> Administra Barragens (Base Central de Empreendedores, Barragens e RTs)
--   * fiscaliza   -> FISCALIZA - Etapa de Campo (Produtos de Inspeção)
--   * classifica  -> Classifica Barragens
--   * notifica    -> Notifica Barragens
-- ==============================================================================

-- 1. Metadados de Origem e Sincronização nas Entidades Mestres
ALTER TABLE IF EXISTS public.empreendedores
  ADD COLUMN IF NOT EXISTS sistema_origem TEXT NOT NULL DEFAULT 'fiscaliza'
    CHECK (sistema_origem IN ('administra', 'fiscaliza', 'classifica', 'notifica')),
  ADD COLUMN IF NOT EXISTS administra_id UUID,
  ADD COLUMN IF NOT EXISTS criado_por_email TEXT,
  ADD COLUMN IF NOT EXISTS sincronizado_administra_em TIMESTAMPTZ;

ALTER TABLE IF EXISTS public.barragens
  ADD COLUMN IF NOT EXISTS sistema_origem TEXT NOT NULL DEFAULT 'fiscaliza'
    CHECK (sistema_origem IN ('administra', 'fiscaliza', 'classifica', 'notifica')),
  ADD COLUMN IF NOT EXISTS administra_id UUID,
  ADD COLUMN IF NOT EXISTS criado_por_email TEXT,
  ADD COLUMN IF NOT EXISTS sincronizado_administra_em TIMESTAMPTZ;

-- 2. Tabela Mestra de Responsáveis Técnicos (Base Central Administra)
CREATE TABLE IF NOT EXISTS public.responsaveis_tecnicos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  administra_id UUID,
  sistema_origem TEXT NOT NULL DEFAULT 'fiscaliza'
    CHECK (sistema_origem IN ('administra', 'fiscaliza', 'classifica', 'notifica')),
  criado_por_email TEXT,
  empreendedor_id UUID REFERENCES public.empreendedores(id) ON DELETE SET NULL,
  barragem_id UUID REFERENCES public.barragens(id) ON DELETE SET NULL,
  nome TEXT NOT NULL,
  cpf TEXT,
  registro_profissional TEXT,
  uf_registro TEXT DEFAULT 'MT',
  art_numero TEXT,
  especialidade TEXT,
  telefone TEXT,
  email TEXT,
  sincronizado_administra_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rt_cpf ON public.responsaveis_tecnicos (cpf);
CREATE INDEX IF NOT EXISTS idx_rt_empreendedor ON public.responsaveis_tecnicos (empreendedor_id);
CREATE INDEX IF NOT EXISTS idx_rt_barragem ON public.responsaveis_tecnicos (barragem_id);

-- Vínculo em vistorias (produtos exclusivos do Fiscaliza)
ALTER TABLE IF EXISTS public.vistorias
  ADD COLUMN IF NOT EXISTS sistema_origem TEXT NOT NULL DEFAULT 'fiscaliza',
  ADD COLUMN IF NOT EXISTS responsavel_tecnico_id UUID REFERENCES public.responsaveis_tecnicos(id) ON DELETE SET NULL;

-- 3. Tabela de Solicitações de Alteração Entre Sistemas
-- Quando um sistema deseja propor alteração em dado inserido por outro sistema
CREATE TABLE IF NOT EXISTS public.solicitacoes_alteracao_ecossistema (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entidade_tipo TEXT NOT NULL CHECK (entidade_tipo IN ('empreendedor', 'barragem', 'responsavel_tecnico')),
  entidade_id UUID NOT NULL,
  entidade_nome TEXT NOT NULL,
  sistema_solicitante TEXT NOT NULL CHECK (sistema_solicitante IN ('administra', 'fiscaliza', 'classifica', 'notifica')),
  sistema_detentor TEXT NOT NULL CHECK (sistema_detentor IN ('administra', 'fiscaliza', 'classifica', 'notifica')),
  solicitante_email TEXT NOT NULL,
  solicitante_nome TEXT NOT NULL,
  aprovador_designado_email TEXT,
  campos_alterados JSONB NOT NULL DEFAULT '{}'::jsonb,
  justificativa TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'aprovada', 'reprovada', 'cancelada', 'aplicada_por_vistoria')),
  resposta_motivo TEXT,
  analisado_por_email TEXT,
  analisado_por_nome TEXT,
  analisado_em TIMESTAMPTZ,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.notificacoes_analista_ecossistema (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sistema_destino TEXT NOT NULL CHECK (sistema_destino IN ('administra', 'fiscaliza', 'classifica', 'notifica')),
  sistema_origem TEXT NOT NULL DEFAULT 'fiscaliza' CHECK (sistema_origem IN ('administra', 'fiscaliza', 'classifica', 'notifica')),
  destinatario_analista_email TEXT NOT NULL,
  entidade_tipo TEXT NOT NULL CHECK (entidade_tipo IN ('empreendedor', 'barragem', 'responsavel_tecnico')),
  entidade_id UUID NOT NULL,
  entidade_nome TEXT NOT NULL,
  vistoria_id UUID NOT NULL,
  numero_vistoria TEXT,
  campo_alterado TEXT NOT NULL,
  campo_rotulo TEXT NOT NULL,
  valor_anterior TEXT,
  valor_atualizado_vistoria TEXT NOT NULL,
  alterado_por_email TEXT NOT NULL,
  alterado_por_nome TEXT NOT NULL,
  motivo_superioridade TEXT NOT NULL DEFAULT 'Dado confirmado e atualizado em vistoria presencial de campo (superioridade técnica).',
  lida BOOLEAN NOT NULL DEFAULT false,
  criada_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notif_analista_dest ON public.notificacoes_analista_ecossistema (sistema_destino, lower(destinatario_analista_email), lida);

CREATE INDEX IF NOT EXISTS idx_sol_alt_status ON public.solicitacoes_alteracao_ecossistema (status, sistema_detentor);
CREATE INDEX IF NOT EXISTS idx_sol_alt_entidade ON public.solicitacoes_alteracao_ecossistema (entidade_tipo, entidade_id);

-- 4. Índice Unificado de Produtos Gerados no Ecossistema CSB
CREATE TABLE IF NOT EXISTS public.produtos_ecossistema (
  id TEXT PRIMARY KEY,
  sistema_origem TEXT NOT NULL CHECK (sistema_origem IN ('administra', 'fiscaliza', 'classifica', 'notifica')),
  tipo_produto TEXT NOT NULL,
  titulo TEXT NOT NULL,
  numero_documento TEXT,
  processo_numero TEXT,
  barragem_id UUID,
  barragem_nome TEXT NOT NULL,
  empreendedor_id UUID,
  empreendedor_nome TEXT NOT NULL,
  responsavel_tecnico_id UUID,
  origem_registro_id TEXT NOT NULL,
  status_produto TEXT NOT NULL,
  data_emissao TEXT NOT NULL,
  autor_email TEXT,
  autor_nome TEXT,
  resumo TEXT,
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_prod_eco_barragem ON public.produtos_ecossistema (barragem_id);
CREATE INDEX IF NOT EXISTS idx_prod_eco_empreendedor ON public.produtos_ecossistema (empreendedor_id);
CREATE INDEX IF NOT EXISTS idx_prod_eco_sistema ON public.produtos_ecossistema (sistema_origem);

-- 5. Função & Gatilho de Imutabilidade Cross-System
-- Garante que um sistema externo NUNCA altere diretamente registro inserido por outro sistema.
-- Somente o sistema detentor (OLD.sistema_origem), o sistema central 'administra' ou
-- contexto de serviço administrativo autorizado (bypass via setting controlada) pode atualizar.
CREATE OR REPLACE FUNCTION public.fn_validar_edicao_ecossistema()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_system TEXT;
  v_vistoria_override TEXT;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    v_caller_system := coalesce(
      nullif(current_setting('app.caller_system', true), ''),
      nullif(auth.jwt() -> 'app_metadata' ->> 'sistema_origem', ''),
      NEW.sistema_origem,
      OLD.sistema_origem
    );
    v_vistoria_override := coalesce(
      nullif(current_setting('app.vistoria_superioridade', true), ''),
      'false'
    );

    -- Vistoria presencial no Fiscaliza possui superioridade de dado verificado em campo;
    -- Administra também pode editar qualquer registro mestre.
    IF v_caller_system <> 'administra'
       AND NOT (v_caller_system = 'fiscaliza' AND v_vistoria_override = 'true')
       AND OLD.sistema_origem IS DISTINCT FROM v_caller_system THEN
      RAISE EXCEPTION 'BLOQUEIO ECOSSISTEMA CSB: Registro inserido por "%" não pode ser alterado diretamente por "%". Utilize a fila de Solicitação de Alteração ou confirmação em Vistoria.', OLD.sistema_origem, v_caller_system
        USING ERRCODE = '42501';
    END IF;

    NEW.sistema_origem := OLD.sistema_origem;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validar_edicao_empreendedores ON public.empreendedores;
CREATE TRIGGER trg_validar_edicao_empreendedores
  BEFORE UPDATE ON public.empreendedores
  FOR EACH ROW EXECUTE FUNCTION public.fn_validar_edicao_ecossistema();

DROP TRIGGER IF EXISTS trg_validar_edicao_barragens ON public.barragens;
CREATE TRIGGER trg_validar_edicao_barragens
  BEFORE UPDATE ON public.barragens
  FOR EACH ROW EXECUTE FUNCTION public.fn_validar_edicao_ecossistema();

DROP TRIGGER IF EXISTS trg_validar_edicao_responsaveis_tecnicos ON public.responsaveis_tecnicos;
CREATE TRIGGER trg_validar_edicao_responsaveis_tecnicos
  BEFORE UPDATE ON public.responsaveis_tecnicos
  FOR EACH ROW EXECUTE FUNCTION public.fn_validar_edicao_ecossistema();

-- 5B. RPC segura para aplicar atualização superior confirmada em Vistoria Presencial
CREATE OR REPLACE FUNCTION public.rpc_aplicar_edicao_vistoria(
  p_entidade_tipo TEXT,
  p_entidade_id UUID,
  p_dados JSONB
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_active_csb_user() THEN
    RAISE EXCEPTION 'Sessão institucional ativa obrigatória.' USING ERRCODE = '42501';
  END IF;

  PERFORM set_config('app.caller_system', 'fiscaliza', true);
  PERFORM set_config('app.vistoria_superioridade', 'true', true);

  IF p_entidade_tipo = 'empreendedor' THEN
    UPDATE public.empreendedores
    SET
      nome_razao_social = coalesce(nullif(p_dados->>'nome_razao_social', ''), nome_razao_social),
      cpf_cnpj = coalesce(p_dados->>'cpf_cnpj', cpf_cnpj),
      figura_juridica = coalesce(nullif(p_dados->>'figura_juridica', ''), figura_juridica),
      endereco = coalesce(p_dados->>'endereco', endereco),
      telefone = coalesce(p_dados->>'telefone', telefone),
      email = coalesce(p_dados->>'email', email),
      car_numero = coalesce(p_dados->>'car_numero', car_numero),
      declaracao_uso = coalesce(p_dados->>'declaracao_uso', declaracao_uso),
      quantidade_barragens_propriedade = coalesce((p_dados->>'quantidade_barragens_propriedade')::INT, quantidade_barragens_propriedade),
      updated_at = now()
    WHERE id = p_entidade_id;
    RETURN FOUND;
  ELSIF p_entidade_tipo = 'barragem' THEN
    UPDATE public.barragens
    SET
      nome = coalesce(nullif(p_dados->>'nome', ''), nome),
      municipio = coalesce(nullif(p_dados->>'municipio', ''), municipio),
      bacia_hidrografica = coalesce(p_dados->>'bacia_hidrografica', bacia_hidrografica),
      curso_dagua = coalesce(p_dados->>'curso_dagua', curso_dagua),
      ano_inicio_obra = coalesce((p_dados->>'ano_inicio_obra')::INT, ano_inicio_obra),
      ano_final_obra = coalesce((p_dados->>'ano_final_obra')::INT, ano_final_obra),
      tipo_barragem_material = coalesce(nullif(p_dados->>'tipo_barragem_material', ''), tipo_barragem_material),
      uso_principal = coalesce(nullif(p_dados->>'uso_principal', ''), uso_principal),
      updated_at = now()
    WHERE id = p_entidade_id;
    RETURN FOUND;
  ELSIF p_entidade_tipo = 'responsavel_tecnico' THEN
    UPDATE public.responsaveis_tecnicos
    SET
      nome = coalesce(nullif(p_dados->>'nome', ''), nome),
      cpf = coalesce(p_dados->>'cpf', cpf),
      registro_profissional = coalesce(p_dados->>'registro_profissional', registro_profissional),
      art_numero = coalesce(p_dados->>'art_numero', art_numero),
      telefone = coalesce(p_dados->>'telefone', telefone),
      email = coalesce(p_dados->>'email', email),
      updated_at = now()
    WHERE id = p_entidade_id;
    RETURN FOUND;
  END IF;

  RETURN FALSE;
END;
$$;

-- 6. Função auxiliar de verificação de usuário ativo autenticado e administrador
CREATE OR REPLACE FUNCTION public.is_active_csb_user()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.role() = 'authenticated' AND EXISTS (
    SELECT 1 FROM public.perfis_usuarios p
    WHERE lower(trim(p.email)) = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
      AND p.status = 'ativo'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_active_csb_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.role() = 'authenticated' AND EXISTS (
    SELECT 1 FROM public.perfis_usuarios p
    WHERE lower(trim(p.email)) = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
      AND p.status = 'ativo'
      AND p.perfil = 'administrador'
  );
$$;

-- 7. HARDENING DE SEGURANÇA (RLS ESTRITA - REVOGA ACESSO ANÔNIMO IRRESTRITO)
ALTER TABLE public.empreendedores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.barragens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.responsaveis_tecnicos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vistorias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vistoria_equipe ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vistoria_acompanhantes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vistoria_medicoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vistoria_componentes_condicao ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vistoria_itens_avaliados ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vistoria_observacoes_componentes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vistoria_fotos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vistoria_documentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vistoria_historico_alteracoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.solicitacoes_alteracao_ecossistema ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.produtos_ecossistema ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notificacoes_analista_ecossistema ENABLE ROW LEVEL SECURITY;

-- Remove políticas permissivas antigas que liberavam acesso para `anon`
DROP POLICY IF EXISTS "Fiscaliza CSB: Empreendedores" ON public.empreendedores;
DROP POLICY IF EXISTS "Fiscaliza CSB: Barragens" ON public.barragens;
DROP POLICY IF EXISTS "Fiscaliza CSB: Vistorias" ON public.vistorias;
DROP POLICY IF EXISTS "Fiscaliza CSB: Equipe" ON public.vistoria_equipe;
DROP POLICY IF EXISTS "Fiscaliza CSB: Acompanhantes" ON public.vistoria_acompanhantes;
DROP POLICY IF EXISTS "Fiscaliza CSB: Medições" ON public.vistoria_medicoes;
DROP POLICY IF EXISTS "Fiscaliza CSB: Condição Componentes" ON public.vistoria_componentes_condicao;
DROP POLICY IF EXISTS "Fiscaliza CSB: Itens Avaliados" ON public.vistoria_itens_avaliados;
DROP POLICY IF EXISTS "Fiscaliza CSB: Observações" ON public.vistoria_observacoes_componentes;
DROP POLICY IF EXISTS "Fiscaliza CSB: Observações Componentes" ON public.vistoria_observacoes_componentes;
DROP POLICY IF EXISTS "Fiscaliza CSB: Fotos" ON public.vistoria_fotos;
DROP POLICY IF EXISTS "Fiscaliza CSB: Documentos" ON public.vistoria_documentos;
DROP POLICY IF EXISTS "Fiscaliza CSB: Auditoria" ON public.vistoria_historico_alteracoes;
DROP POLICY IF EXISTS "Fiscaliza CSB: Histórico Auditoria" ON public.vistoria_historico_alteracoes;
DROP POLICY IF EXISTS "Upload de Fotos: Fiscaliza CSB" ON storage.objects;

-- Políticas estritas: somente usuários autenticados e ativos na CSB
CREATE POLICY "CSB Auth: Empreendedores" ON public.empreendedores
  FOR ALL TO authenticated USING (public.is_active_csb_user()) WITH CHECK (public.is_active_csb_user());

CREATE POLICY "CSB Auth: Barragens" ON public.barragens
  FOR ALL TO authenticated USING (public.is_active_csb_user()) WITH CHECK (public.is_active_csb_user());

CREATE POLICY "CSB Auth: Responsaveis Tecnicos" ON public.responsaveis_tecnicos
  FOR ALL TO authenticated USING (public.is_active_csb_user()) WITH CHECK (public.is_active_csb_user());

CREATE POLICY "CSB Auth: Vistorias" ON public.vistorias
  FOR ALL TO authenticated USING (public.is_active_csb_user()) WITH CHECK (public.is_active_csb_user());

CREATE POLICY "CSB Auth: Equipe" ON public.vistoria_equipe
  FOR ALL TO authenticated USING (public.is_active_csb_user()) WITH CHECK (public.is_active_csb_user());

CREATE POLICY "CSB Auth: Acompanhantes" ON public.vistoria_acompanhantes
  FOR ALL TO authenticated USING (public.is_active_csb_user()) WITH CHECK (public.is_active_csb_user());

CREATE POLICY "CSB Auth: Medicoes" ON public.vistoria_medicoes
  FOR ALL TO authenticated USING (public.is_active_csb_user()) WITH CHECK (public.is_active_csb_user());

CREATE POLICY "CSB Auth: Condicao Componentes" ON public.vistoria_componentes_condicao
  FOR ALL TO authenticated USING (public.is_active_csb_user()) WITH CHECK (public.is_active_csb_user());

CREATE POLICY "CSB Auth: Itens Avaliados" ON public.vistoria_itens_avaliados
  FOR ALL TO authenticated USING (public.is_active_csb_user()) WITH CHECK (public.is_active_csb_user());

CREATE POLICY "CSB Auth: Observacoes" ON public.vistoria_observacoes_componentes
  FOR ALL TO authenticated USING (public.is_active_csb_user()) WITH CHECK (public.is_active_csb_user());

CREATE POLICY "CSB Auth: Fotos" ON public.vistoria_fotos
  FOR ALL TO authenticated USING (public.is_active_csb_user()) WITH CHECK (public.is_active_csb_user());

CREATE POLICY "CSB Auth: Documentos" ON public.vistoria_documentos
  FOR ALL TO authenticated USING (public.is_active_csb_user()) WITH CHECK (public.is_active_csb_user());

CREATE POLICY "CSB Auth: Auditoria" ON public.vistoria_historico_alteracoes
  FOR ALL TO authenticated USING (public.is_active_csb_user()) WITH CHECK (public.is_active_csb_user());

CREATE POLICY "CSB Auth: Solicitacoes Alteracao" ON public.solicitacoes_alteracao_ecossistema
  FOR ALL TO authenticated USING (public.is_active_csb_user()) WITH CHECK (public.is_active_csb_user());

CREATE POLICY "CSB Auth: Produtos Ecossistema" ON public.produtos_ecossistema
  FOR ALL TO authenticated USING (public.is_active_csb_user()) WITH CHECK (public.is_active_csb_user());

CREATE POLICY "CSB Auth: Notificacoes Analista" ON public.notificacoes_analista_ecossistema
  FOR ALL TO authenticated USING (public.is_active_csb_user()) WITH CHECK (public.is_active_csb_user());

CREATE POLICY "CSB Auth: Storage Fotos" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'fotos_vistorias_csb' AND public.is_active_csb_user())
  WITH CHECK (bucket_id = 'fotos_vistorias_csb' AND public.is_active_csb_user());

-- Restringe leitura de perfis para usuários autenticados (sem expor lista de e-mails para anon)
DROP POLICY IF EXISTS "perfis_select_policy" ON public.perfis_usuarios;
DROP POLICY IF EXISTS "perfis_insert_policy" ON public.perfis_usuarios;
CREATE POLICY "perfis_select_policy" ON public.perfis_usuarios
  FOR SELECT TO authenticated
  USING (
    public.is_active_csb_admin()
    OR lower(trim(email)) = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
  );
CREATE POLICY "perfis_insert_self_pending" ON public.perfis_usuarios
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_active_csb_admin()
    OR (
      lower(trim(email)) = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
      AND status = 'pendente'
      AND perfil = 'analista'
    )
  );
