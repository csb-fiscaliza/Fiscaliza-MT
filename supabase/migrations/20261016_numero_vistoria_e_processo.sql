-- ==============================================================================
-- MIGRAÇÃO SUPABASE: NUMERAÇÃO CONTÍNUA EDITÁVEL DE VISTORIA E NÚMERO DO PROCESSO
-- Órgão: SEMA-MT | Coordenadoria de Segurança de Barragens (CSB)
-- ==============================================================================

-- 1. Garante as colunas na tabela 'vistorias'
ALTER TABLE public.vistorias 
  ADD COLUMN IF NOT EXISTS numero_vistoria TEXT,
  ADD COLUMN IF NOT EXISTS processo_sema TEXT,
  ADD COLUMN IF NOT EXISTS campanha_ano INTEGER DEFAULT EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER;

-- 2. Cria índices para busca ágil por número de vistoria, processo e ano vigente
CREATE INDEX IF NOT EXISTS idx_vistorias_numero_vistoria ON public.vistorias(numero_vistoria);
CREATE INDEX IF NOT EXISTS idx_vistorias_processo_sema ON public.vistorias(processo_sema);
CREATE INDEX IF NOT EXISTS idx_vistorias_campanha_ano ON public.vistorias(campanha_ano, numero_vistoria);

-- 3. Função segura para calcular o próximo número sequencial de vistoria no ano vigente
-- Exemplo de saída: "0001/2026", "0002/2026", etc.
-- Continua a partir da última vistoria cadastrada, ignorando eventuais saltos manuais
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
  -- Percorre os números cadastrados para o ano informado
  FOR v_rec IN 
    SELECT numero_vistoria 
    FROM public.vistorias 
    WHERE numero_vistoria IS NOT NULL 
      AND (campanha_ano = p_ano OR numero_vistoria LIKE '%/' || p_ano::TEXT)
  LOOP
    BEGIN
      -- Extrai apenas os dígitos antes da barra (ex: '0014/2026' -> 14)
      v_extracted := (regexp_match(TRIM(v_rec.numero_vistoria), '^([0-9]+)'))[1]::INTEGER;
      IF v_extracted IS NOT NULL AND v_extracted > v_max_seq THEN
        v_max_seq := v_extracted;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      -- Ignora formatos não compatíveis sem gerar erro
      NULL;
    END;
  END LOOP;

  v_next_seq := v_max_seq + 1;
  RETURN LPAD(v_next_seq::TEXT, 4, '0') || '/' || p_ano::TEXT;
END;
$$;

-- Permissões de execução para anônimos (coleta de campo offline/sync) e autenticados
GRANT EXECUTE ON FUNCTION public.get_next_numero_vistoria(INTEGER) TO anon, authenticated, service_role;

-- 4. Gatilho inteligente: caso inserido sem número, preenche com o próximo automático;
-- caso o fiscal informe manualmente (editável no app), mantém o valor digitado!
CREATE OR REPLACE FUNCTION public.trg_set_numero_vistoria()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.campanha_ano IS NULL THEN
    NEW.campanha_ano := EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER;
  END IF;

  -- Se não informado ou em branco, gera automaticamente
  IF NEW.numero_vistoria IS NULL OR TRIM(NEW.numero_vistoria) = '' THEN
    NEW.numero_vistoria := public.get_next_numero_vistoria(NEW.campanha_ano);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_vistorias_numero_vistoria ON public.vistorias;
CREATE TRIGGER trg_vistorias_numero_vistoria
BEFORE INSERT ON public.vistorias
FOR EACH ROW
EXECUTE FUNCTION public.trg_set_numero_vistoria();

-- 5. Atualização da View Gerencial de Vistorias para incluir processo_sema
CREATE OR REPLACE VIEW public.vw_resumo_vistorias AS
SELECT 
    v.id AS vistoria_id,
    v.numero_vistoria,
    v.processo_sema AS processo_numero,
    v.campanha_ano,
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
    v.updated_at
FROM public.vistorias v
JOIN public.barragens b ON b.id = v.barragem_id
LEFT JOIN public.empreendedores e ON e.id = b.empreendedor_id
LEFT JOIN public.vistoria_fotos f ON f.vistoria_id = v.id
LEFT JOIN public.vistoria_componentes_condicao c ON c.vistoria_id = v.id
GROUP BY v.id, b.id, e.id;
