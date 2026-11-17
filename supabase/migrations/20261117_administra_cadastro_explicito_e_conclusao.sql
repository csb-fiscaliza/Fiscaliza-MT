-- ==============================================================================
-- MIGRAÇÃO: CADASTRO EXPLÍCITO NO ADMINISTRA, RASCUNHOS TEMPORÁRIOS E TRAVA DE CONCLUSÃO
-- Órgão: SEMA-MT | Coordenadoria de Segurança de Barragens (CSB)
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ------------------------------------------------------------------------------
-- 1. COMPLETAR COLUNAS DAS TABELAS MESTRES DO ADMINISTRA
-- ------------------------------------------------------------------------------

ALTER TABLE IF EXISTS public.empreendedores
  ADD COLUMN IF NOT EXISTS sistema_origem TEXT NOT NULL DEFAULT 'fiscaliza',
  ADD COLUMN IF NOT EXISTS administra_id UUID,
  ADD COLUMN IF NOT EXISTS criado_por_email TEXT,
  ADD COLUMN IF NOT EXISTS sincronizado_administra_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS nome_razao_social TEXT,
  ADD COLUMN IF NOT EXISTS cpf_cnpj TEXT,
  ADD COLUMN IF NOT EXISTS figura_juridica TEXT DEFAULT 'empresa_privada',
  ADD COLUMN IF NOT EXISTS processo_numero TEXT,
  ADD COLUMN IF NOT EXISTS endereco TEXT,
  ADD COLUMN IF NOT EXISTS municipio TEXT,
  ADD COLUMN IF NOT EXISTS uf TEXT DEFAULT 'MT',
  ADD COLUMN IF NOT EXISTS cep TEXT,
  ADD COLUMN IF NOT EXISTS telefone TEXT,
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS documentos_pessoais TEXT,
  ADD COLUMN IF NOT EXISTS car_numero TEXT,
  ADD COLUMN IF NOT EXISTS declaracao_uso TEXT,
  ADD COLUMN IF NOT EXISTS quantidade_barragens_propriedade INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS comentarios TEXT;

ALTER TABLE IF EXISTS public.barragens
  ADD COLUMN IF NOT EXISTS sistema_origem TEXT NOT NULL DEFAULT 'fiscaliza',
  ADD COLUMN IF NOT EXISTS administra_id UUID,
  ADD COLUMN IF NOT EXISTS criado_por_email TEXT,
  ADD COLUMN IF NOT EXISTS sincronizado_administra_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS empreendedor_id UUID REFERENCES public.empreendedores(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS nome TEXT,
  ADD COLUMN IF NOT EXISTS municipio TEXT,
  ADD COLUMN IF NOT EXISTS bacia_hidrografica TEXT,
  ADD COLUMN IF NOT EXISTS curso_dagua TEXT,
  ADD COLUMN IF NOT EXISTS latitude_decimal NUMERIC(10, 7),
  ADD COLUMN IF NOT EXISTS longitude_decimal NUMERIC(10, 7),
  ADD COLUMN IF NOT EXISTS latitude_gms TEXT,
  ADD COLUMN IF NOT EXISTS longitude_gms TEXT,
  ADD COLUMN IF NOT EXISTS datum TEXT DEFAULT 'SIRGAS 2000',
  ADD COLUMN IF NOT EXISTS acuracia_metros NUMERIC(6, 2),
  ADD COLUMN IF NOT EXISTS altitude_metros NUMERIC(8, 2),
  ADD COLUMN IF NOT EXISTS cota_coroamento_metros NUMERIC(8, 2),
  ADD COLUMN IF NOT EXISTS ano_inicio_obra INTEGER,
  ADD COLUMN IF NOT EXISTS ano_final_obra INTEGER,
  ADD COLUMN IF NOT EXISTS tipo_barragem_material TEXT DEFAULT 'terra_homogenea',
  ADD COLUMN IF NOT EXISTS uso_principal TEXT,
  ADD COLUMN IF NOT EXISTS usos_secundarios TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS vertedouro_tipo TEXT DEFAULT 'canal_lateral_escavado',
  ADD COLUMN IF NOT EXISTS outorga_possui TEXT DEFAULT 'nao_informado',
  ADD COLUMN IF NOT EXISTS outorga_numero TEXT,
  ADD COLUMN IF NOT EXISTS licenca_ambiental_possui TEXT DEFAULT 'nao_informado',
  ADD COLUMN IF NOT EXISTS licenca_ambiental_numero TEXT,
  ADD COLUMN IF NOT EXISTS car_possui TEXT DEFAULT 'nao_informado',
  ADD COLUMN IF NOT EXISTS car_numero TEXT;

CREATE TABLE IF NOT EXISTS public.responsaveis_tecnicos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  administra_id UUID,
  sistema_origem TEXT NOT NULL DEFAULT 'fiscaliza',
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
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE IF EXISTS public.responsaveis_tecnicos
  ADD COLUMN IF NOT EXISTS administra_id UUID,
  ADD COLUMN IF NOT EXISTS sistema_origem TEXT NOT NULL DEFAULT 'fiscaliza',
  ADD COLUMN IF NOT EXISTS criado_por_email TEXT,
  ADD COLUMN IF NOT EXISTS empreendedor_id UUID REFERENCES public.empreendedores(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS barragem_id UUID REFERENCES public.barragens(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS uf_registro TEXT DEFAULT 'MT',
  ADD COLUMN IF NOT EXISTS art_numero TEXT,
  ADD COLUMN IF NOT EXISTS especialidade TEXT,
  ADD COLUMN IF NOT EXISTS telefone TEXT,
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS sincronizado_administra_em TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_emp_cpf_cnpj ON public.empreendedores (cpf_cnpj);
CREATE INDEX IF NOT EXISTS idx_emp_car_numero ON public.empreendedores (car_numero);
CREATE INDEX IF NOT EXISTS idx_barragens_emp_id ON public.barragens (empreendedor_id);
CREATE INDEX IF NOT EXISTS idx_rt_cpf ON public.responsaveis_tecnicos (cpf);
CREATE INDEX IF NOT EXISTS idx_rt_empreendedor ON public.responsaveis_tecnicos (empreendedor_id);
CREATE INDEX IF NOT EXISTS idx_rt_barragem ON public.responsaveis_tecnicos (barragem_id);

-- ------------------------------------------------------------------------------
-- 2. PERMITIR RASCUNHOS LOCAIS/TEMPORÁRIOS EM VISTORIAS ANTES DO CADASTRO NO ADMINISTRA
-- ------------------------------------------------------------------------------

DO $$
BEGIN
  ALTER TABLE public.vistorias ALTER COLUMN barragem_id DROP NOT NULL;
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.vistorias DROP CONSTRAINT IF EXISTS vistorias_barragem_id_fkey;
  ALTER TABLE public.vistorias
    ADD CONSTRAINT vistorias_barragem_id_fkey
    FOREIGN KEY (barragem_id) REFERENCES public.barragens(id) ON DELETE SET NULL;
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

ALTER TABLE IF EXISTS public.vistorias
  ADD COLUMN IF NOT EXISTS empreendedor_id UUID REFERENCES public.empreendedores(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS responsavel_tecnico_id UUID REFERENCES public.responsaveis_tecnicos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_draft BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS administra_cadastro_status JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS dados_rascunho_locais JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS itens_observacao_futura JSONB DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_vistorias_empreendedor ON public.vistorias (empreendedor_id);
CREATE INDEX IF NOT EXISTS idx_vistorias_rt ON public.vistorias (responsavel_tecnico_id);
CREATE INDEX IF NOT EXISTS idx_vistorias_is_draft ON public.vistorias (is_draft);

-- ------------------------------------------------------------------------------
-- 3. TRAVA DE INTEGRIDADE PARA CONCLUSÃO DA VISTORIA
--    * Rascunhos (is_draft = TRUE ou tipo_planejamento = 'futura') podem salvar
--      normalmente mantendo dados manuais temporariamente em dados_rascunho_locais.
--    * Vistorias concluídas (is_draft = FALSE ou status concluida/finalizada)
--      EXIGEM que Barragem, Empreendedor e RT (quando preenchido) estejam
--      efetivamente cadastrados nas tabelas do Administra.
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_validar_conclusao_vistoria_administra()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_concluding BOOLEAN;
  v_emp_id UUID;
  v_bar_exists BOOLEAN := FALSE;
  v_emp_exists BOOLEAN := FALSE;
  v_rt_exists BOOLEAN := FALSE;
  v_rt_required BOOLEAN := FALSE;
  v_rt_temp_nome TEXT;
BEGIN
  v_is_concluding := (
    COALESCE(NEW.is_draft, TRUE) = FALSE
    OR NEW.status_vistoria::TEXT IN ('concluida_campo', 'finalizada_homologada')
  ) AND COALESCE(NEW.tipo_planejamento, 'atual') <> 'futura';

  IF NOT v_is_concluding THEN
    RETURN NEW;
  END IF;

  IF NEW.barragem_id IS NULL THEN
    RAISE EXCEPTION 'CONCLUSÃO BLOQUEADA: A barragem precisa ser vinculada ou cadastrada na base do Administra antes de concluir a vistoria.'
      USING ERRCODE = '23514';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.barragens b WHERE b.id = NEW.barragem_id
  ) INTO v_bar_exists;

  IF NOT v_bar_exists THEN
    RAISE EXCEPTION 'CONCLUSÃO BLOQUEADA: A barragem informada (%) não está cadastrada na tabela "barragens" do Administra.', NEW.barragem_id
      USING ERRCODE = '23503';
  END IF;

  SELECT COALESCE(NEW.empreendedor_id, b.empreendedor_id)
  INTO v_emp_id
  FROM public.barragens b
  WHERE b.id = NEW.barragem_id;

  IF v_emp_id IS NULL THEN
    RAISE EXCEPTION 'CONCLUSÃO BLOQUEADA: O empreendedor precisa ser vinculado ou cadastrado na base do Administra antes de concluir a vistoria.'
      USING ERRCODE = '23514';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.empreendedores e WHERE e.id = v_emp_id
  ) INTO v_emp_exists;

  IF NOT v_emp_exists THEN
    RAISE EXCEPTION 'CONCLUSÃO BLOQUEADA: O empreendedor informado (%) não está cadastrado na tabela "empreendedores" do Administra.', v_emp_id
      USING ERRCODE = '23503';
  END IF;

  NEW.empreendedor_id := COALESCE(NEW.empreendedor_id, v_emp_id);

  v_rt_temp_nome := COALESCE(TRIM(NEW.dados_rascunho_locais -> 'rt_temporario' ->> 'nome'), '');
  v_rt_required := (
    NEW.responsavel_tecnico_id IS NOT NULL
    OR COALESCE(NEW.administra_cadastro_status -> 'responsavelTecnico' ->> 'cadastrado', 'false') = 'true'
    OR v_rt_temp_nome <> ''
  );

  IF v_rt_required THEN
    IF NEW.responsavel_tecnico_id IS NULL THEN
      RAISE EXCEPTION 'CONCLUSÃO BLOQUEADA: Há Responsável Técnico preenchido manualmente ainda não cadastrado na base do Administra.'
        USING ERRCODE = '23514';
    END IF;

    SELECT EXISTS (
      SELECT 1 FROM public.responsaveis_tecnicos rt WHERE rt.id = NEW.responsavel_tecnico_id
    ) INTO v_rt_exists;

    IF NOT v_rt_exists THEN
      RAISE EXCEPTION 'CONCLUSÃO BLOQUEADA: O Responsável Técnico informado (%) não está cadastrado na tabela "responsaveis_tecnicos" do Administra.', NEW.responsavel_tecnico_id
        USING ERRCODE = '23503';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validar_conclusao_vistoria_administra ON public.vistorias;
CREATE TRIGGER trg_validar_conclusao_vistoria_administra
  BEFORE INSERT OR UPDATE ON public.vistorias
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_validar_conclusao_vistoria_administra();

-- ------------------------------------------------------------------------------
-- 4. RPC PARA CADASTRO EXPLÍCITO DE ENTIDADE NA BASE DO ADMINISTRA
--    Acionada pelos botões "Cadastrar <Tipo> na Base de Dados" nos formulários.
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.rpc_cadastrar_entidade_administra(
  p_entidade_tipo TEXT,
  p_dados JSONB,
  p_vistoria_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
  v_now TIMESTAMPTZ := NOW();
  v_email TEXT := COALESCE(NULLIF(LOWER(TRIM(auth.jwt() ->> 'email')), ''), NULLIF(TRIM(p_dados ->> 'criado_por_email'), ''));
  v_status JSONB;
  v_emp_id UUID;
  v_bar_id UUID;
BEGIN
  IF NOT public.is_active_csb_user() THEN
    RAISE EXCEPTION 'Sessão institucional ativa obrigatória para cadastrar dados no Administra.'
      USING ERRCODE = '42501';
  END IF;

  IF p_entidade_tipo NOT IN ('empreendedor', 'barragem', 'responsavel_tecnico') THEN
    RAISE EXCEPTION 'Tipo de entidade inválido: "%".', p_entidade_tipo
      USING ERRCODE = '22023';
  END IF;

  PERFORM set_config('app.caller_system', 'fiscaliza', TRUE);
  PERFORM set_config('app.vistoria_superioridade', 'true', TRUE);

  v_id := COALESCE(NULLIF(TRIM(p_dados ->> 'id'), '')::UUID, gen_random_uuid());

  IF p_entidade_tipo = 'empreendedor' THEN
    IF NULLIF(TRIM(p_dados ->> 'nome_razao_social'), '') IS NULL THEN
      RAISE EXCEPTION 'Informe o Nome do Empreendedor / Razão Social antes de cadastrar.' USING ERRCODE = '23514';
    END IF;

    INSERT INTO public.empreendedores (
      id, administra_id, sistema_origem, criado_por_email,
      nome_razao_social, cpf_cnpj, figura_juridica, processo_numero,
      endereco, municipio, uf, cep, telefone, email,
      car_numero, declaracao_uso, quantidade_barragens_propriedade,
      comentarios, sincronizado_administra_em, created_at, updated_at
    ) VALUES (
      v_id,
      COALESCE(NULLIF(TRIM(p_dados ->> 'administra_id'), '')::UUID, v_id),
      'fiscaliza',
      v_email,
      TRIM(p_dados ->> 'nome_razao_social'),
      NULLIF(TRIM(p_dados ->> 'cpf_cnpj'), ''),
      COALESCE(NULLIF(TRIM(p_dados ->> 'figura_juridica'), ''), 'empresa_privada'),
      NULLIF(TRIM(p_dados ->> 'processo_numero'), ''),
      NULLIF(TRIM(p_dados ->> 'endereco'), ''),
      NULLIF(TRIM(p_dados ->> 'municipio'), ''),
      COALESCE(NULLIF(TRIM(p_dados ->> 'uf'), ''), 'MT'),
      NULLIF(TRIM(p_dados ->> 'cep'), ''),
      NULLIF(TRIM(p_dados ->> 'telefone'), ''),
      NULLIF(TRIM(p_dados ->> 'email'), ''),
      NULLIF(TRIM(p_dados ->> 'car_numero'), ''),
      NULLIF(TRIM(p_dados ->> 'declaracao_uso'), ''),
      COALESCE((p_dados ->> 'quantidade_barragens_propriedade')::INTEGER, 1),
      NULLIF(TRIM(p_dados ->> 'comentarios'), ''),
      v_now, v_now, v_now
    )
    ON CONFLICT (id) DO UPDATE SET
      nome_razao_social = EXCLUDED.nome_razao_social,
      cpf_cnpj = EXCLUDED.cpf_cnpj,
      figura_juridica = EXCLUDED.figura_juridica,
      processo_numero = COALESCE(EXCLUDED.processo_numero, public.empreendedores.processo_numero),
      endereco = EXCLUDED.endereco,
      municipio = COALESCE(EXCLUDED.municipio, public.empreendedores.municipio),
      uf = COALESCE(EXCLUDED.uf, public.empreendedores.uf),
      telefone = EXCLUDED.telefone,
      email = EXCLUDED.email,
      car_numero = EXCLUDED.car_numero,
      declaracao_uso = EXCLUDED.declaracao_uso,
      quantidade_barragens_propriedade = EXCLUDED.quantidade_barragens_propriedade,
      comentarios = COALESCE(EXCLUDED.comentarios, public.empreendedores.comentarios),
      sincronizado_administra_em = v_now,
      updated_at = v_now;

    IF p_vistoria_id IS NOT NULL THEN
      SELECT COALESCE(administra_cadastro_status, '{}'::jsonb) INTO v_status
      FROM public.vistorias WHERE id = p_vistoria_id;

      IF FOUND THEN
        v_status := jsonb_set(
          COALESCE(v_status, '{}'::jsonb),
          '{empreendedor}',
          jsonb_build_object(
            'cadastrado', TRUE,
            'modo', 'cadastrado_manual',
            'entidadeId', v_id,
            'sistemaOrigem', 'fiscaliza',
            'registradoEm', v_now,
            'registradoPorEmail', v_email
          ),
          TRUE
        );

        UPDATE public.vistorias
        SET empreendedor_id = v_id,
            administra_cadastro_status = v_status,
            updated_at = v_now
        WHERE id = p_vistoria_id;
      END IF;
    END IF;

  ELSIF p_entidade_tipo = 'barragem' THEN
    IF NULLIF(TRIM(p_dados ->> 'nome'), '') IS NULL THEN
      RAISE EXCEPTION 'Informe o Nome da Barragem antes de cadastrar.' USING ERRCODE = '23514';
    END IF;
    IF NULLIF(TRIM(p_dados ->> 'municipio'), '') IS NULL THEN
      RAISE EXCEPTION 'Informe o Município (MT) da Barragem antes de cadastrar.' USING ERRCODE = '23514';
    END IF;

    v_emp_id := NULLIF(TRIM(p_dados ->> 'empreendedor_id'), '')::UUID;
    IF v_emp_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.empreendedores e WHERE e.id = v_emp_id) THEN
      v_emp_id := NULL;
    END IF;

    INSERT INTO public.barragens (
      id, administra_id, sistema_origem, criado_por_email, empreendedor_id,
      nome, municipio, bacia_hidrografica, curso_dagua,
      latitude_decimal, longitude_decimal, latitude_gms, longitude_gms,
      datum, acuracia_metros, altitude_metros, cota_coroamento_metros,
      ano_inicio_obra, ano_final_obra, tipo_barragem_material, uso_principal, usos_secundarios,
      vertedouro_tipo, outorga_possui, outorga_numero,
      licenca_ambiental_possui, licenca_ambiental_numero, car_possui, car_numero,
      sincronizado_administra_em, created_at, updated_at
    ) VALUES (
      v_id,
      COALESCE(NULLIF(TRIM(p_dados ->> 'administra_id'), '')::UUID, v_id),
      'fiscaliza',
      v_email,
      v_emp_id,
      TRIM(p_dados ->> 'nome'),
      TRIM(p_dados ->> 'municipio'),
      NULLIF(TRIM(p_dados ->> 'bacia_hidrografica'), ''),
      NULLIF(TRIM(p_dados ->> 'curso_dagua'), ''),
      NULLIF(TRIM(p_dados ->> 'latitude_decimal'), '')::NUMERIC,
      NULLIF(TRIM(p_dados ->> 'longitude_decimal'), '')::NUMERIC,
      NULLIF(TRIM(p_dados ->> 'latitude_gms'), ''),
      NULLIF(TRIM(p_dados ->> 'longitude_gms'), ''),
      COALESCE(NULLIF(TRIM(p_dados ->> 'datum'), ''), 'SIRGAS 2000'),
      NULLIF(TRIM(p_dados ->> 'acuracia_metros'), '')::NUMERIC,
      NULLIF(TRIM(p_dados ->> 'altitude_metros'), '')::NUMERIC,
      NULLIF(TRIM(p_dados ->> 'cota_coroamento_metros'), '')::NUMERIC,
      NULLIF(TRIM(p_dados ->> 'ano_inicio_obra'), '')::INTEGER,
      NULLIF(TRIM(p_dados ->> 'ano_final_obra'), '')::INTEGER,
      COALESCE(NULLIF(TRIM(p_dados ->> 'tipo_barragem_material'), ''), 'terra_homogenea'),
      COALESCE(NULLIF(TRIM(p_dados ->> 'uso_principal'), ''), 'Não informado'),
      COALESCE(ARRAY(SELECT jsonb_array_elements_text(p_dados -> 'usos_secundarios')), '{}'::TEXT[]),
      COALESCE(NULLIF(TRIM(p_dados ->> 'vertedouro_tipo'), ''), 'canal_lateral_escavado'),
      COALESCE(NULLIF(TRIM(p_dados ->> 'outorga_possui'), ''), 'nao_informado'),
      NULLIF(TRIM(p_dados ->> 'outorga_numero'), ''),
      COALESCE(NULLIF(TRIM(p_dados ->> 'licenca_ambiental_possui'), ''), 'nao_informado'),
      NULLIF(TRIM(p_dados ->> 'licenca_ambiental_numero'), ''),
      COALESCE(NULLIF(TRIM(p_dados ->> 'car_possui'), ''), 'nao_informado'),
      NULLIF(TRIM(p_dados ->> 'car_numero'), ''),
      v_now, v_now, v_now
    )
    ON CONFLICT (id) DO UPDATE SET
      empreendedor_id = COALESCE(EXCLUDED.empreendedor_id, public.barragens.empreendedor_id),
      nome = EXCLUDED.nome,
      municipio = EXCLUDED.municipio,
      bacia_hidrografica = EXCLUDED.bacia_hidrografica,
      curso_dagua = EXCLUDED.curso_dagua,
      latitude_decimal = EXCLUDED.latitude_decimal,
      longitude_decimal = EXCLUDED.longitude_decimal,
      latitude_gms = EXCLUDED.latitude_gms,
      longitude_gms = EXCLUDED.longitude_gms,
      datum = EXCLUDED.datum,
      acuracia_metros = EXCLUDED.acuracia_metros,
      altitude_metros = EXCLUDED.altitude_metros,
      cota_coroamento_metros = EXCLUDED.cota_coroamento_metros,
      ano_inicio_obra = EXCLUDED.ano_inicio_obra,
      ano_final_obra = EXCLUDED.ano_final_obra,
      tipo_barragem_material = EXCLUDED.tipo_barragem_material,
      uso_principal = EXCLUDED.uso_principal,
      usos_secundarios = EXCLUDED.usos_secundarios,
      vertedouro_tipo = EXCLUDED.vertedouro_tipo,
      outorga_possui = EXCLUDED.outorga_possui,
      outorga_numero = EXCLUDED.outorga_numero,
      licenca_ambiental_possui = EXCLUDED.licenca_ambiental_possui,
      licenca_ambiental_numero = EXCLUDED.licenca_ambiental_numero,
      car_possui = EXCLUDED.car_possui,
      car_numero = EXCLUDED.car_numero,
      sincronizado_administra_em = v_now,
      updated_at = v_now;

    IF p_vistoria_id IS NOT NULL THEN
      SELECT COALESCE(administra_cadastro_status, '{}'::jsonb) INTO v_status
      FROM public.vistorias WHERE id = p_vistoria_id;

      IF FOUND THEN
        v_status := jsonb_set(
          COALESCE(v_status, '{}'::jsonb),
          '{barragem}',
          jsonb_build_object(
            'cadastrado', TRUE,
            'modo', 'cadastrado_manual',
            'entidadeId', v_id,
            'sistemaOrigem', 'fiscaliza',
            'registradoEm', v_now,
            'registradoPorEmail', v_email
          ),
          TRUE
        );

        UPDATE public.vistorias
        SET barragem_id = v_id,
            administra_cadastro_status = v_status,
            updated_at = v_now
        WHERE id = p_vistoria_id;
      END IF;
    END IF;

  ELSE
    IF NULLIF(TRIM(p_dados ->> 'nome'), '') IS NULL THEN
      RAISE EXCEPTION 'Informe o Nome do Responsável Técnico antes de cadastrar.' USING ERRCODE = '23514';
    END IF;

    v_emp_id := NULLIF(TRIM(p_dados ->> 'empreendedor_id'), '')::UUID;
    IF v_emp_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.empreendedores e WHERE e.id = v_emp_id) THEN
      v_emp_id := NULL;
    END IF;

    v_bar_id := NULLIF(TRIM(p_dados ->> 'barragem_id'), '')::UUID;
    IF v_bar_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.barragens b WHERE b.id = v_bar_id) THEN
      v_bar_id := NULL;
    END IF;

    INSERT INTO public.responsaveis_tecnicos (
      id, administra_id, sistema_origem, criado_por_email,
      empreendedor_id, barragem_id, nome, cpf,
      registro_profissional, uf_registro, art_numero, especialidade,
      telefone, email, sincronizado_administra_em, created_at, updated_at
    ) VALUES (
      v_id,
      COALESCE(NULLIF(TRIM(p_dados ->> 'administra_id'), '')::UUID, v_id),
      'fiscaliza',
      v_email,
      v_emp_id,
      v_bar_id,
      TRIM(p_dados ->> 'nome'),
      NULLIF(TRIM(p_dados ->> 'cpf'), ''),
      NULLIF(TRIM(p_dados ->> 'registro_profissional'), ''),
      COALESCE(NULLIF(TRIM(p_dados ->> 'uf_registro'), ''), 'MT'),
      NULLIF(TRIM(p_dados ->> 'art_numero'), ''),
      NULLIF(TRIM(p_dados ->> 'especialidade'), ''),
      NULLIF(TRIM(p_dados ->> 'telefone'), ''),
      NULLIF(TRIM(p_dados ->> 'email'), ''),
      v_now, v_now, v_now
    )
    ON CONFLICT (id) DO UPDATE SET
      empreendedor_id = COALESCE(EXCLUDED.empreendedor_id, public.responsaveis_tecnicos.empreendedor_id),
      barragem_id = COALESCE(EXCLUDED.barragem_id, public.responsaveis_tecnicos.barragem_id),
      nome = EXCLUDED.nome,
      cpf = EXCLUDED.cpf,
      registro_profissional = EXCLUDED.registro_profissional,
      uf_registro = EXCLUDED.uf_registro,
      art_numero = EXCLUDED.art_numero,
      especialidade = EXCLUDED.especialidade,
      telefone = EXCLUDED.telefone,
      email = EXCLUDED.email,
      sincronizado_administra_em = v_now,
      updated_at = v_now;

    IF p_vistoria_id IS NOT NULL THEN
      SELECT COALESCE(administra_cadastro_status, '{}'::jsonb) INTO v_status
      FROM public.vistorias WHERE id = p_vistoria_id;

      IF FOUND THEN
        v_status := jsonb_set(
          COALESCE(v_status, '{}'::jsonb),
          '{responsavelTecnico}',
          jsonb_build_object(
            'cadastrado', TRUE,
            'modo', 'cadastrado_manual',
            'entidadeId', v_id,
            'sistemaOrigem', 'fiscaliza',
            'registradoEm', v_now,
            'registradoPorEmail', v_email
          ),
          TRUE
        );

        UPDATE public.vistorias
        SET responsavel_tecnico_id = v_id,
            administra_cadastro_status = v_status,
            updated_at = v_now
        WHERE id = p_vistoria_id;
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', TRUE,
    'entidade_tipo', p_entidade_tipo,
    'entidade_id', v_id,
    'sincronizado_em', v_now
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_cadastrar_entidade_administra(TEXT, JSONB, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_cadastrar_entidade_administra(TEXT, JSONB, UUID) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 5. VIEWS GERENCIAIS ATUALIZADAS (SUPORTE A RASCUNHOS SEM CADASTRO NO ADMINISTRA)
-- ------------------------------------------------------------------------------

DROP VIEW IF EXISTS public.vw_resumo_vistorias CASCADE;
CREATE OR REPLACE VIEW public.vw_resumo_vistorias AS
SELECT
  v.id AS vistoria_id,
  v.numero_vistoria,
  v.data_vistoria,
  v.status_vistoria,
  v.is_draft,
  b.id AS barragem_id,
  COALESCE(
    b.nome,
    NULLIF(TRIM(v.dados_rascunho_locais -> 'barragem_temporaria' ->> 'nome'), '')
  ) AS barragem_nome,
  COALESCE(
    b.municipio,
    NULLIF(TRIM(v.dados_rascunho_locais -> 'barragem_temporaria' ->> 'municipio'), '')
  ) AS municipio,
  b.bacia_hidrografica,
  b.latitude_decimal,
  b.longitude_decimal,
  COALESCE(v.empreendedor_id, b.empreendedor_id) AS empreendedor_id,
  COALESCE(
    e.nome_razao_social,
    NULLIF(TRIM(v.dados_rascunho_locais -> 'empreendedor_temporario' ->> 'nome_razao_social'), '')
  ) AS empreendedor_nome,
  COALESCE(
    e.cpf_cnpj,
    NULLIF(TRIM(v.dados_rascunho_locais -> 'empreendedor_temporario' ->> 'cpf_cnpj'), '')
  ) AS empreendedor_cpf_cnpj,
  v.responsavel_tecnico_id,
  rt.nome AS responsavel_tecnico_nome,
  v.administra_cadastro_status,
  (v.barragem_id IS NOT NULL) AS barragem_cadastrada_administra,
  (COALESCE(v.empreendedor_id, b.empreendedor_id) IS NOT NULL) AS empreendedor_cadastrado_administra,
  COUNT(DISTINCT f.id) AS total_fotos,
  COUNT(DISTINCT CASE WHEN c.condicao::TEXT = 'critico' THEN c.id END) AS componentes_criticos,
  COUNT(DISTINCT CASE WHEN c.condicao::TEXT = 'alerta' THEN c.id END) AS componentes_alerta,
  v.requer_notificacao,
  v.notificacao_prazo_dias,
  v.updated_at,
  v.processo_sema AS processo_numero,
  v.campanha_ano,
  COALESCE(v.tipo_planejamento, 'atual') AS tipo_planejamento
FROM public.vistorias v
LEFT JOIN public.barragens b ON b.id = v.barragem_id
LEFT JOIN public.empreendedores e ON e.id = COALESCE(v.empreendedor_id, b.empreendedor_id)
LEFT JOIN public.responsaveis_tecnicos rt ON rt.id = v.responsavel_tecnico_id
LEFT JOIN public.vistoria_fotos f ON f.vistoria_id = v.id
LEFT JOIN public.vistoria_componentes_condicao c ON c.vistoria_id = v.id
GROUP BY v.id, b.id, e.id, rt.id;

DROP VIEW IF EXISTS public.vw_barragens_criticas CASCADE;
CREATE OR REPLACE VIEW public.vw_barragens_criticas AS
SELECT
  b.id AS barragem_id,
  COALESCE(
    b.nome,
    NULLIF(TRIM(v.dados_rascunho_locais -> 'barragem_temporaria' ->> 'nome'), '')
  ) AS barragem_nome,
  COALESCE(
    b.municipio,
    NULLIF(TRIM(v.dados_rascunho_locais -> 'barragem_temporaria' ->> 'municipio'), '')
  ) AS municipio,
  COALESCE(
    e.nome_razao_social,
    NULLIF(TRIM(v.dados_rascunho_locais -> 'empreendedor_temporario' ->> 'nome_razao_social'), '')
  ) AS empreendedor,
  v.numero_vistoria,
  v.data_vistoria,
  c.componente_nome,
  c.condicao,
  c.anomalias_selecionadas,
  c.notas_observacoes,
  v.processo_sema AS processo_numero,
  COALESCE(v.tipo_planejamento, 'atual') AS tipo_planejamento
FROM public.vistoria_componentes_condicao c
JOIN public.vistorias v ON v.id = c.vistoria_id
LEFT JOIN public.barragens b ON b.id = v.barragem_id
LEFT JOIN public.empreendedores e ON e.id = COALESCE(v.empreendedor_id, b.empreendedor_id)
WHERE c.condicao::TEXT IN ('critico', 'alerta')
ORDER BY v.data_vistoria DESC, c.condicao DESC;

DROP VIEW IF EXISTS public.vw_vistorias_pendencias_cadastro_administra CASCADE;
CREATE OR REPLACE VIEW public.vw_vistorias_pendencias_cadastro_administra AS
SELECT
  v.id AS vistoria_id,
  v.numero_vistoria,
  v.data_vistoria,
  v.is_draft,
  COALESCE(v.tipo_planejamento, 'atual') AS tipo_planejamento,
  (v.barragem_id IS NULL) AS pendente_barragem,
  (COALESCE(v.empreendedor_id, b.empreendedor_id) IS NULL) AS pendente_empreendedor,
  (
    v.responsavel_tecnico_id IS NULL
    AND COALESCE(TRIM(v.dados_rascunho_locais -> 'rt_temporario' ->> 'nome'), '') <> ''
  ) AS pendente_rt,
  v.dados_rascunho_locais,
  v.administra_cadastro_status,
  v.updated_at
FROM public.vistorias v
LEFT JOIN public.barragens b ON b.id = v.barragem_id
WHERE v.barragem_id IS NULL
   OR COALESCE(v.empreendedor_id, b.empreendedor_id) IS NULL
   OR (
     v.responsavel_tecnico_id IS NULL
     AND COALESCE(TRIM(v.dados_rascunho_locais -> 'rt_temporario' ->> 'nome'), '') <> ''
   );

REVOKE ALL ON public.vw_resumo_vistorias FROM anon;
REVOKE ALL ON public.vw_barragens_criticas FROM anon;
REVOKE ALL ON public.vw_vistorias_pendencias_cadastro_administra FROM anon;

GRANT SELECT ON public.vw_resumo_vistorias TO authenticated, service_role;
GRANT SELECT ON public.vw_barragens_criticas TO authenticated, service_role;
GRANT SELECT ON public.vw_vistorias_pendencias_cadastro_administra TO authenticated, service_role;
