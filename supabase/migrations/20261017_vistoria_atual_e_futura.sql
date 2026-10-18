-- ==============================================================================
-- MIGRAÇÃO SUPABASE: VISTORIA ATUAL E VISTORIA FUTURA (AUTOCONTIDA & RESILIENTE)
-- Órgão: SEMA-MT | Coordenadoria de Segurança de Barragens (CSB)
-- ==============================================================================

-- 1. Habilita extensões de UUID caso não estejam ativas
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. Garante a tabela 'empreendedores'
CREATE TABLE IF NOT EXISTS public.empreendedores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome_razao_social TEXT NOT NULL,
    cpf_cnpj TEXT,
    tipo_pessoa TEXT DEFAULT 'juridica',
    email TEXT,
    telefone TEXT,
    endereco TEXT,
    municipio TEXT,
    uf TEXT DEFAULT 'MT',
    cep TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Garante a tabela 'barragens'
CREATE TABLE IF NOT EXISTS public.barragens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empreendedor_id UUID REFERENCES public.empreendedores(id) ON DELETE SET NULL,
    nome TEXT NOT NULL,
    municipio TEXT NOT NULL,
    bacia_hidrografica TEXT,
    curso_dagua TEXT,
    latitude_decimal NUMERIC(10, 7),
    longitude_decimal NUMERIC(10, 7),
    latitude_gms TEXT,
    longitude_gms TEXT,
    datum TEXT DEFAULT 'SIRGAS 2000',
    acuracia_metros NUMERIC(6, 2),
    altitude_metros NUMERIC(8, 2),
    cota_coroamento_metros NUMERIC(8, 2),
    tipo_barragem_material TEXT DEFAULT 'terra',
    uso_principal TEXT DEFAULT 'dessedentacao_animal',
    usos_secundarios TEXT[] DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Garante a tabela 'vistorias'
CREATE TABLE IF NOT EXISTS public.vistorias (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    barragem_id UUID REFERENCES public.barragens(id) ON DELETE SET NULL,
    tipo_planejamento TEXT DEFAULT 'atual',
    numero_vistoria TEXT,
    campanha_ano INTEGER DEFAULT EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER,
    campanha_numero TEXT,
    processo_sema TEXT,
    data_vistoria DATE NOT NULL DEFAULT CURRENT_DATE,
    hora_inicio TIME,
    hora_termino TIME,
    condicoes_climaticas TEXT DEFAULT 'seco',
    cota_atual_nivel_agua NUMERIC(8, 2),
    status_vistoria TEXT DEFAULT 'rascunho_campo',
    is_draft BOOLEAN NOT NULL DEFAULT TRUE,
    outros_problemas_descricao TEXT,
    conclusoes_sintese_fatica TEXT,
    medidas_imediatas_seguranca TEXT,
    recomendacoes_empreendedor TEXT,
    requer_notificacao BOOLEAN NOT NULL DEFAULT FALSE,
    notificacao_prazo_dias INTEGER,
    notificacao_assunto TEXT,
    notificacao_exigencias TEXT,
    created_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Atualiza colunas e restrições caso a tabela já existisse previamente
ALTER TABLE public.vistorias 
  ADD COLUMN IF NOT EXISTS tipo_planejamento TEXT DEFAULT 'atual',
  ADD COLUMN IF NOT EXISTS numero_vistoria TEXT,
  ADD COLUMN IF NOT EXISTS processo_sema TEXT,
  ADD COLUMN IF NOT EXISTS campanha_ano INTEGER DEFAULT EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER,
  ADD COLUMN IF NOT EXISTS campanha_numero TEXT,
  ADD COLUMN IF NOT EXISTS is_draft BOOLEAN DEFAULT TRUE;

-- Garante que 'numero_vistoria' seja anulável (para permitir vistorias futuras sem numeração)
DO $$
BEGIN
  ALTER TABLE public.vistorias ALTER COLUMN numero_vistoria DROP NOT NULL;
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

-- 6. Garante restrição de validação para tipo_planejamento
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_vistorias_tipo_planejamento'
  ) THEN
    ALTER TABLE public.vistorias
      ADD CONSTRAINT chk_vistorias_tipo_planejamento 
      CHECK (tipo_planejamento IN ('atual', 'futura'));
  END IF;
END $$;

-- 7. Garante tabelas satélites para as views gerenciais
CREATE TABLE IF NOT EXISTS public.vistoria_fotos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vistoria_id UUID NOT NULL REFERENCES public.vistorias(id) ON DELETE CASCADE,
    componente_codigo TEXT,
    componente_nome TEXT,
    storage_path TEXT,
    arquivo_nome TEXT,
    url_publica TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.vistoria_componentes_condicao (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vistoria_id UUID NOT NULL REFERENCES public.vistorias(id) ON DELETE CASCADE,
    componente_codigo TEXT NOT NULL,
    componente_nome TEXT NOT NULL,
    condicao TEXT NOT NULL DEFAULT 'adequado',
    anomalias_selecionadas TEXT[] DEFAULT '{}',
    notas_observacoes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. Índices de alta performance
CREATE INDEX IF NOT EXISTS idx_vistorias_tipo_planejamento ON public.vistorias(tipo_planejamento);
CREATE INDEX IF NOT EXISTS idx_vistorias_numero_vistoria ON public.vistorias(numero_vistoria);
CREATE INDEX IF NOT EXISTS idx_vistorias_processo_sema ON public.vistorias(processo_sema);
CREATE INDEX IF NOT EXISTS idx_vistorias_campanha_ano ON public.vistorias(campanha_ano, numero_vistoria);

-- 9. Função para calcular o próximo número sequencial no ano vigente
CREATE OR REPLACE FUNCTION public.get_next_numero_vistoria(
  p_ano INTEGER DEFAULT EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_max_seq INTEGER := 0;
  v_rec RECORD;
  v_extracted INTEGER;
  v_next_seq INTEGER;
BEGIN
  FOR v_rec IN 
    SELECT numero_vistoria 
    FROM public.vistorias 
    WHERE numero_vistoria IS NOT NULL 
      AND (campanha_ano = p_ano OR numero_vistoria LIKE '%/' || p_ano::TEXT)
  LOOP
    BEGIN
      v_extracted := (regexp_match(TRIM(v_rec.numero_vistoria), '^([0-9]+)'))[1]::INTEGER;
      IF v_extracted IS NOT NULL AND v_extracted > v_max_seq THEN
        v_max_seq := v_extracted;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END LOOP;

  v_next_seq := v_max_seq + 1;
  RETURN LPAD(v_next_seq::TEXT, 4, '0') || '/' || p_ano::TEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_next_numero_vistoria(INTEGER) TO anon, authenticated, service_role;

-- 10. Gatilho inteligente para numeração de vistorias:
-- - Se 'futura': NÃO consome nem gera número (permanece NULL para pré-salvar dados do local).
-- - Se 'atual': gera numeração sequencial automática se estiver vazio.
-- - Se alterado de 'futura' para 'atual': atribui numeração sequencial.
CREATE OR REPLACE FUNCTION public.trg_set_numero_vistoria()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.campanha_ano IS NULL THEN
    NEW.campanha_ano := EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER;
  END IF;

  IF NEW.tipo_planejamento IS NULL OR TRIM(NEW.tipo_planejamento) = '' THEN
    NEW.tipo_planejamento := 'atual';
  END IF;

  -- Se for vistoria futura: NUNCA gera numeração
  IF NEW.tipo_planejamento = 'futura' THEN
    NEW.numero_vistoria := NULL;
    RETURN NEW;
  END IF;

  -- Se for vistoria atual: gera se não tiver sido informada
  IF NEW.tipo_planejamento = 'atual' THEN
    IF NEW.numero_vistoria IS NULL OR TRIM(NEW.numero_vistoria) = '' THEN
      NEW.numero_vistoria := public.get_next_numero_vistoria(NEW.campanha_ano);
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_vistorias_numero_vistoria ON public.vistorias;
CREATE TRIGGER trg_vistorias_numero_vistoria
BEFORE INSERT OR UPDATE ON public.vistorias
FOR EACH ROW
EXECUTE FUNCTION public.trg_set_numero_vistoria();

-- 11. Views Gerenciais com suporte a Vistoria Futura e Atual
DROP VIEW IF EXISTS public.vw_resumo_vistorias CASCADE;
DROP VIEW IF EXISTS vw_resumo_vistorias CASCADE;

CREATE OR REPLACE VIEW public.vw_resumo_vistorias AS
SELECT 
    v.id AS vistoria_id,
    v.numero_vistoria,
    v.data_vistoria,
    v.status_vistoria,
    v.is_draft,
    b.id AS barragem_id,
    b.nome AS barragem_nome,
    b.municipio,
    b.bacia_hidrografica,
    b.latitude_decimal,
    b.longitude_decimal,
    e.nome_razao_social AS empreendedor_nome,
    e.cpf_cnpj AS empreendedor_cpf_cnpj,
    COUNT(DISTINCT f.id) AS total_fotos,
    COUNT(DISTINCT CASE WHEN c.condicao = 'critico' THEN c.id END) AS componentes_criticos,
    COUNT(DISTINCT CASE WHEN c.condicao = 'alerta' THEN c.id END) AS componentes_alerta,
    v.requer_notificacao,
    v.notificacao_prazo_dias,
    v.updated_at,
    v.processo_sema AS processo_numero,
    v.campanha_ano,
    COALESCE(v.tipo_planejamento, 'atual') AS tipo_planejamento
FROM public.vistorias v
LEFT JOIN public.barragens b ON b.id = v.barragem_id
LEFT JOIN public.empreendedores e ON e.id = b.empreendedor_id
LEFT JOIN public.vistoria_fotos f ON f.vistoria_id = v.id
LEFT JOIN public.vistoria_componentes_condicao c ON c.vistoria_id = v.id
GROUP BY v.id, b.id, e.id;

DROP VIEW IF EXISTS public.vw_barragens_criticas CASCADE;
DROP VIEW IF EXISTS vw_barragens_criticas CASCADE;

CREATE OR REPLACE VIEW public.vw_barragens_criticas AS
SELECT 
    b.id AS barragem_id,
    b.nome AS barragem_nome,
    b.municipio,
    e.nome_razao_social AS empreendedor,
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
LEFT JOIN public.empreendedores e ON e.id = b.empreendedor_id
WHERE c.condicao IN ('critico', 'alerta')
ORDER BY v.data_vistoria DESC, c.condicao DESC;

-- 12. Permissões de Leitura
GRANT SELECT ON public.vw_resumo_vistorias TO anon, authenticated, service_role;
GRANT SELECT ON public.vw_barragens_criticas TO anon, authenticated, service_role;
