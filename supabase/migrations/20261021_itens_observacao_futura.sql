-- ==============================================================================
-- MIGRAÇÃO SUPABASE: ITENS A SEREM OBSERVADOS (CHECKLIST DE VISTORIA FUTURA / CAMPO)
-- Órgão: SEMA-MT | Coordenadoria de Segurança de Barragens (CSB)
-- 100% Autocontida: Não falha mesmo se executada em banco novo ou já existente
-- ==============================================================================

-- 1. Habilita extensões UUID necessárias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. Garante a tabela 'vistorias' caso ainda não exista no schema public
CREATE TABLE IF NOT EXISTS public.vistorias (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tipo_planejamento TEXT DEFAULT 'atual',
    itens_observacao_futura JSONB DEFAULT '[]'::jsonb,
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
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Adiciona a coluna 'itens_observacao_futura' de forma idempotente
ALTER TABLE public.vistorias 
ADD COLUMN IF NOT EXISTS itens_observacao_futura JSONB DEFAULT '[]'::jsonb;

-- 4. Índice GIN para consultas e filtros otimizados no JSONB
CREATE INDEX IF NOT EXISTS idx_vistorias_itens_observacao_futura 
ON public.vistorias USING gin (itens_observacao_futura);

-- 5. Documentação da coluna
COMMENT ON COLUMN public.vistorias.itens_observacao_futura IS 'Lista de itens a serem observados (checklist de atenção especial em campo para vistorias planejadas)';
