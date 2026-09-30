-- ==============================================================================
-- SISTEMA FISCALIZA – COORDENADORIA DE SEGURANÇA DE BARRAGENS (CSB / SEMA-MT)
-- ATUALIZAÇÃO SUPABASE: VALIDAÇÃO, FORMATAÇÃO E SINCRONIZAÇÃO DE COORDENADAS GMS
-- Padrão Cartográfico Obrigatório: xxºxx'xx,xx" (Datum SIRGAS 2000)
-- Data de Homologação: 2026-09-30
-- ==============================================================================

-- -----------------------------------------------------------------------------
-- 1. ADIÇÃO DE COLUNAS GMS (IDEMPOTENTE)
-- -----------------------------------------------------------------------------
ALTER TABLE IF EXISTS barragens 
    ADD COLUMN IF NOT EXISTS latitude_gms TEXT,
    ADD COLUMN IF NOT EXISTS longitude_gms TEXT;

ALTER TABLE IF EXISTS vistoria_fotos 
    ADD COLUMN IF NOT EXISTS latitude_gms TEXT,
    ADD COLUMN IF NOT EXISTS longitude_gms TEXT;

-- Comentários descritivos de engenharia
COMMENT ON COLUMN barragens.latitude_gms IS 'Coordenada de Latitude no padrão oficial GMS: xxºxx''xx,xx" (ex: 16º15''26,64")';
COMMENT ON COLUMN barragens.longitude_gms IS 'Coordenada de Longitude no padrão oficial GMS: xxºxx''xx,xx" (ex: 56º37''18,48")';
COMMENT ON COLUMN vistoria_fotos.latitude_gms IS 'Coordenada de Latitude da foto no padrão oficial GMS: xxºxx''xx,xx"';
COMMENT ON COLUMN vistoria_fotos.longitude_gms IS 'Coordenada de Longitude da foto no padrão oficial GMS: xxºxx''xx,xx"';

-- -----------------------------------------------------------------------------
-- 2. FUNÇÃO: VALIDAÇÃO RIGOROSA DE FORMATO E LIMITES GMS (xxºxx'xx,xx")
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION csb_fn_validar_coordenada_gms(
    p_coord TEXT,
    p_is_latitude BOOLEAN
)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    v_clean TEXT;
    v_match TEXT[];
    v_graus INTEGER;
    v_minutos INTEGER;
    v_segundos NUMERIC;
    v_max_graus INTEGER;
BEGIN
    IF p_coord IS NULL OR TRIM(p_coord) = '' THEN
        RETURN TRUE; -- Nulos permitidos na validação individual (checados por NOT NULL se aplicável)
    END IF;

    v_clean := TRIM(p_coord);

    -- Regex para validar estrutura do padrão xxºxx'xx,xx"
    v_match := regexp_match(
        v_clean, 
        '^([0-9]{1,3})[º°\s]([0-9]{1,2})(?:[''′\s]([0-9]{1,2}(?:[.,][0-9]{1,2})?))?[″"\s]*([NSEWnsew])?$'
    );

    IF v_match IS NULL THEN
        -- Também valida se for entrada decimal direta aceitável
        IF v_clean ~ '^[+-]?[0-9]+(?:[.,][0-9]+)?$' THEN
            v_max_graus := CASE WHEN p_is_latitude THEN 90 ELSE 180 END;
            RETURN ABS(REPLACE(v_clean, ',', '.')::NUMERIC) <= v_max_graus;
        END IF;
        RETURN FALSE;
    END IF;

    v_graus := v_match[1]::INTEGER;
    v_minutos := v_match[2]::INTEGER;
    v_segundos := COALESCE(REPLACE(v_match[3], ',', '.')::NUMERIC, 0.0);

    v_max_graus := CASE WHEN p_is_latitude THEN 90 ELSE 180 END;

    -- Validação dos intervalos matemáticos e geográficos
    IF v_graus < 0 OR v_graus > v_max_graus THEN
        RETURN FALSE;
    END IF;

    IF v_minutos < 0 OR v_minutos >= 60 THEN
        RETURN FALSE;
    END IF;

    IF v_segundos < 0 OR v_segundos >= 60 THEN
        RETURN FALSE;
    END IF;

    RETURN TRUE;
END;
$$;

-- -----------------------------------------------------------------------------
-- 3. FUNÇÃO: CONVERSÃO DE GRAUS DECIMAIS PARA GMS (xxºxx'xx,xx")
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION csb_fn_decimal_para_gms(
    p_decimal NUMERIC,
    p_is_latitude BOOLEAN,
    p_incluir_hemisferio BOOLEAN DEFAULT FALSE
)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    v_abs NUMERIC;
    v_graus INTEGER;
    v_min_dec NUMERIC;
    v_minutos INTEGER;
    v_segundos NUMERIC(5, 2);
    v_hemisferio CHAR(1);
    v_res TEXT;
BEGIN
    IF p_decimal IS NULL THEN
        RETURN NULL;
    END IF;

    v_abs := ABS(p_decimal);
    v_graus := FLOOR(v_abs);
    v_min_dec := (v_abs - v_graus) * 60;
    v_minutos := FLOOR(v_min_dec);
    v_segundos := ROUND(((v_min_dec - v_minutos) * 60)::NUMERIC, 2);

    -- Ajuste de arredondamento de borda (59.999s -> 60.00s)
    IF v_segundos >= 59.995 THEN
        v_segundos := 0.00;
        v_minutos := v_minutos + 1;
        IF v_minutos >= 60 THEN
            v_minutos := 0;
            v_graus := v_graus + 1;
        END IF;
    END IF;

    IF p_is_latitude THEN
        v_hemisferio := CASE WHEN p_decimal >= 0 THEN 'N' ELSE 'S' END;
    ELSE
        v_hemisferio := CASE WHEN p_decimal >= 0 THEN 'E' ELSE 'W' END;
    END IF;

    -- Formato estrito: xxºxx'xx,xx"
    v_res := LPAD(v_graus::TEXT, 2, '0') || 'º' ||
             LPAD(v_minutos::TEXT, 2, '0') || '''' ||
             REPLACE(TO_CHAR(v_segundos, 'FM00.00'), '.', ',') || '"';

    IF p_incluir_hemisferio THEN
        v_res := v_res || ' ' || v_hemisferio;
    END IF;

    RETURN v_res;
END;
$$;

-- -----------------------------------------------------------------------------
-- 4. FUNÇÃO: CONVERSÃO DE GMS (xxºxx'xx,xx") PARA GRAUS DECIMAIS
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION csb_fn_gms_para_decimal(
    p_gms TEXT,
    p_is_latitude BOOLEAN
)
RETURNS NUMERIC
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    v_clean TEXT;
    v_match TEXT[];
    v_graus NUMERIC;
    v_minutos NUMERIC;
    v_segundos NUMERIC;
    v_hemi TEXT;
    v_decimal NUMERIC;
    v_is_negative BOOLEAN;
BEGIN
    IF p_gms IS NULL OR TRIM(p_gms) = '' THEN
        RETURN NULL;
    END IF;

    v_clean := TRIM(p_gms);

    -- Se já for número puro com ponto ou vírgula
    IF v_clean ~ '^[+-]?[0-9]+(?:[.,][0-9]+)?$' THEN
        RETURN REPLACE(v_clean, ',', '.')::NUMERIC;
    END IF;

    v_match := regexp_match(
        v_clean, 
        '^([+-]?[0-9]{1,3})[º°\s]+([0-9]{1,2})(?:[''′\s]+([0-9]{1,2}(?:[.,][0-9]+)?))?[″"\s]*([NSEWnsew])?$'
    );

    IF v_match IS NULL THEN
        RETURN NULL;
    END IF;

    v_graus := ABS(REPLACE(v_match[1], ',', '.')::NUMERIC);
    v_minutos := v_match[2]::NUMERIC;
    v_segundos := COALESCE(REPLACE(v_match[3], ',', '.')::NUMERIC, 0.0);
    v_hemi := UPPER(COALESCE(v_match[4], ''));

    v_decimal := v_graus + (v_minutos / 60.0) + (v_segundos / 3600.0);

    IF v_hemi IN ('S', 'W', 'O') THEN
        v_is_negative := TRUE;
    ELSIF v_hemi IN ('N', 'E', 'L') THEN
        v_is_negative := FALSE;
    ELSE
        -- Padrão geográfico de Mato Grosso / Brasil Central: Latitudes S e Longitudes W são negativas
        v_is_negative := TRUE;
    END IF;

    IF v_is_negative THEN
        RETURN -ROUND(v_decimal, 7);
    ELSE
        RETURN ROUND(v_decimal, 7);
    END IF;
END;
$$;

-- -----------------------------------------------------------------------------
-- 5. TRIGGER DE SINCRONIZAÇÃO AUTOMÁTICA GMS <-> DECIMAL (BARRAGENS)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION csb_trg_fn_sync_coordenadas_barragens()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    -- Sincronização de Latitude
    IF NEW.latitude_gms IS NOT NULL AND TRIM(NEW.latitude_gms) <> '' THEN
        -- Validação prévia
        IF NOT csb_fn_validar_coordenada_gms(NEW.latitude_gms, TRUE) THEN
            RAISE EXCEPTION 'Latitude GMS inválida: %. Utilize o formato xxºxx''xx,xx" (ex: 16º15''26,64")', NEW.latitude_gms;
        END IF;
        NEW.latitude_decimal := csb_fn_gms_para_decimal(NEW.latitude_gms, TRUE);
        NEW.latitude_gms := csb_fn_decimal_para_gms(NEW.latitude_decimal, TRUE, FALSE);
    ELSIF NEW.latitude_decimal IS NOT NULL THEN
        NEW.latitude_gms := csb_fn_decimal_para_gms(NEW.latitude_decimal, TRUE, FALSE);
    END IF;

    -- Sincronização de Longitude
    IF NEW.longitude_gms IS NOT NULL AND TRIM(NEW.longitude_gms) <> '' THEN
        -- Validação prévia
        IF NOT csb_fn_validar_coordenada_gms(NEW.longitude_gms, FALSE) THEN
            RAISE EXCEPTION 'Longitude GMS inválida: %. Utilize o formato xxºxx''xx,xx" (ex: 56º37''18,48")', NEW.longitude_gms;
        END IF;
        NEW.longitude_decimal := csb_fn_gms_para_decimal(NEW.longitude_gms, FALSE);
        NEW.longitude_gms := csb_fn_decimal_para_gms(NEW.longitude_decimal, FALSE, FALSE);
    ELSIF NEW.longitude_decimal IS NOT NULL THEN
        NEW.longitude_gms := csb_fn_decimal_para_gms(NEW.longitude_decimal, FALSE, FALSE);
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_coordenadas_barragens ON barragens;
CREATE TRIGGER trg_sync_coordenadas_barragens
    BEFORE INSERT OR UPDATE OF latitude_gms, longitude_gms, latitude_decimal, longitude_decimal
    ON barragens
    FOR EACH ROW
    EXECUTE FUNCTION csb_trg_fn_sync_coordenadas_barragens();

-- -----------------------------------------------------------------------------
-- 6. TRIGGER DE SINCRONIZAÇÃO AUTOMÁTICA GMS <-> DECIMAL (VISTORIA_FOTOS)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION csb_trg_fn_sync_coordenadas_fotos()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    -- Sincronização de Latitude
    IF NEW.latitude_gms IS NOT NULL AND TRIM(NEW.latitude_gms) <> '' THEN
        NEW.latitude := csb_fn_gms_para_decimal(NEW.latitude_gms, TRUE);
        NEW.latitude_gms := csb_fn_decimal_para_gms(NEW.latitude, TRUE, FALSE);
    ELSIF NEW.latitude IS NOT NULL THEN
        NEW.latitude_gms := csb_fn_decimal_para_gms(NEW.latitude, TRUE, FALSE);
    END IF;

    -- Sincronização de Longitude
    IF NEW.longitude_gms IS NOT NULL AND TRIM(NEW.longitude_gms) <> '' THEN
        NEW.longitude := csb_fn_gms_para_decimal(NEW.longitude_gms, FALSE);
        NEW.longitude_gms := csb_fn_decimal_para_gms(NEW.longitude, FALSE, FALSE);
    ELSIF NEW.longitude IS NOT NULL THEN
        NEW.longitude_gms := csb_fn_decimal_para_gms(NEW.longitude, FALSE, FALSE);
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_coordenadas_fotos ON vistoria_fotos;
CREATE TRIGGER trg_sync_coordenadas_fotos
    BEFORE INSERT OR UPDATE OF latitude_gms, longitude_gms, latitude, longitude
    ON vistoria_fotos
    FOR EACH ROW
    EXECUTE FUNCTION csb_trg_fn_sync_coordenadas_fotos();

-- -----------------------------------------------------------------------------
-- 7. CONSTRAINTS DE VALIDAÇÃO (CHECK CONSTRAINTS)
-- -----------------------------------------------------------------------------
ALTER TABLE barragens DROP CONSTRAINT IF EXISTS chk_barragens_latitude_gms;
ALTER TABLE barragens ADD CONSTRAINT chk_barragens_latitude_gms 
    CHECK (latitude_gms IS NULL OR csb_fn_validar_coordenada_gms(latitude_gms, TRUE));

ALTER TABLE barragens DROP CONSTRAINT IF EXISTS chk_barragens_longitude_gms;
ALTER TABLE barragens ADD CONSTRAINT chk_barragens_longitude_gms 
    CHECK (longitude_gms IS NULL OR csb_fn_validar_coordenada_gms(longitude_gms, FALSE));

-- -----------------------------------------------------------------------------
-- 8. BACKFILL E ATUALIZAÇÃO RETROATIVA DE REGISTROS EXISTENTES
-- -----------------------------------------------------------------------------
UPDATE barragens
SET 
    latitude_gms = csb_fn_decimal_para_gms(latitude_decimal, TRUE, FALSE),
    longitude_gms = csb_fn_decimal_para_gms(longitude_decimal, FALSE, FALSE)
WHERE (latitude_decimal IS NOT NULL AND latitude_gms IS NULL)
   OR (longitude_decimal IS NOT NULL AND longitude_gms IS NULL);

UPDATE vistoria_fotos
SET 
    latitude_gms = csb_fn_decimal_para_gms(latitude, TRUE, FALSE),
    longitude_gms = csb_fn_decimal_para_gms(longitude, FALSE, FALSE)
WHERE (latitude IS NOT NULL AND latitude_gms IS NULL)
   OR (longitude IS NOT NULL AND longitude_gms IS NULL);
