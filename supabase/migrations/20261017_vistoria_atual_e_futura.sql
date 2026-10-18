-- ==============================================================================
-- MIGRAÇÃO SUPABASE: VISTORIA ATUAL E VISTORIA FUTURA (PRÉ-CADASTRO DE LOCAL)
-- Órgão: SEMA-MT | Coordenadoria de Segurança de Barragens (CSB)
-- ==============================================================================

-- 1. Garante a coluna 'tipo_planejamento' na tabela 'vistorias'
ALTER TABLE public.vistorias 
  ADD COLUMN IF NOT EXISTS tipo_planejamento TEXT DEFAULT 'atual';

-- 2. Garante restrição de validação para os dois tipos permitidos
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

-- 3. Cria índice para otimizar filtros no banco de dados
CREATE INDEX IF NOT EXISTS idx_vistorias_tipo_planejamento 
  ON public.vistorias(tipo_planejamento);

-- 4. Função e Gatilho Inteligente de Numeração:
-- - Se marcado 'futura': NÃO gera numeração (mantém NULL), funcionando como pré-cadastro.
-- - Se alterado para 'atual' (ou inserido como atual): gera numeração sequencial oficial caso vazia.
CREATE OR REPLACE FUNCTION public.trg_set_numero_vistoria()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.campanha_ano IS NULL THEN
    NEW.campanha_ano := EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER;
  END IF;

  -- Normaliza tipo_planejamento
  IF NEW.tipo_planejamento IS NULL OR TRIM(NEW.tipo_planejamento) = '' THEN
    NEW.tipo_planejamento := 'atual';
  END IF;

  -- Se for vistoria futura: NUNCA consome ou gera numeração oficial
  IF NEW.tipo_planejamento = 'futura' THEN
    NEW.numero_vistoria := NULL;
    RETURN NEW;
  END IF;

  -- Se for vistoria atual: gera numeração sequencial se não informada
  IF NEW.tipo_planejamento = 'atual' THEN
    IF NEW.numero_vistoria IS NULL OR TRIM(NEW.numero_vistoria) = '' THEN
      NEW.numero_vistoria := public.get_next_numero_vistoria(NEW.campanha_ano);
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Remove e recria o gatilho para INSERT e UPDATE (permite transição de futura para atual)
DROP TRIGGER IF EXISTS trg_vistorias_numero_vistoria ON public.vistorias;
CREATE TRIGGER trg_vistorias_numero_vistoria
BEFORE INSERT OR UPDATE ON public.vistorias
FOR EACH ROW
EXECUTE FUNCTION public.trg_set_numero_vistoria();

-- 5. Atualização da View Gerencial de Resumo de Vistorias
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
JOIN public.barragens b ON b.id = v.barragem_id
LEFT JOIN public.empreendedores e ON e.id = b.empreendedor_id
LEFT JOIN public.vistoria_fotos f ON f.vistoria_id = v.id
LEFT JOIN public.vistoria_componentes_condicao c ON c.vistoria_id = v.id
GROUP BY v.id, b.id, e.id;

-- 6. Atualização da View de Barragens Críticas
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
JOIN public.barragens b ON b.id = v.barragem_id
LEFT JOIN public.empreendedores e ON e.id = b.empreendedor_id
WHERE c.condicao IN ('critico', 'alerta')
ORDER BY v.data_vistoria DESC, c.condicao DESC;

-- 7. Garante permissões de leitura nas views
GRANT SELECT ON public.vw_resumo_vistorias TO anon, authenticated, service_role;
GRANT SELECT ON public.vw_barragens_criticas TO anon, authenticated, service_role;
