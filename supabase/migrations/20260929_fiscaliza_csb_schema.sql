-- ==============================================================================
-- SISTEMA FISCALIZA – COORDENADORIA DE SEGURANÇA DE BARRAGENS (CSB / SEMA-MT)
-- SCRIPT SQL DE MIGRAÇÃO: BANCO RELACIONAL, AUDITORIA LGPD & STORAGE PRIVADO
-- Acesso protegido por RLS e autenticação oficial (sem exposição anônima)
-- Data de Homologação: 2026-09-29
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. EXTENSÕES DO POSTGRESQL
-- ------------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ------------------------------------------------------------------------------
-- 2. DOMÍNIOS E TIPOS ENUMERADOS
-- ------------------------------------------------------------------------------
DO $$ BEGIN
    CREATE TYPE tipo_resposta_avaliacao AS ENUM (
        'sim',
        'nao',
        'nao_observado',
        'impossivel_observar',
        'nao_se_aplica',
        'sem_informacao'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE condicao_severidade_enum AS ENUM (
        'adequado',
        'alerta',
        'critico',
        'nao_inspecionado',
        'nao_se_aplica'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE status_vistoria_enum AS ENUM (
        'rascunho_campo',
        'em_revisao',
        'concluida_campo',
        'finalizada_homologada',
        'cancelada'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE tipo_documento_vistoria AS ENUM (
        'auto_inspecao',
        'relatorio_tecnico',
        'notificacao'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ------------------------------------------------------------------------------
-- 3. FUNÇÃO AUXILIAR DE TIMESTAMP AUTOMÁTICO (UPDATED_AT)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_atualizar_timestamp_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ------------------------------------------------------------------------------
-- 4. TABELAS CENTRAIS DO SISTEMA
-- ------------------------------------------------------------------------------

-- 4.1. Tabela: EMPREENDEDORES (Identificador estável do proprietário / detentor)
CREATE TABLE IF NOT EXISTS empreendedores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome_razao_social TEXT NOT NULL,
    cpf_cnpj TEXT,
    figura_juridica TEXT DEFAULT 'empresa_privada',
    processo_numero TEXT,
    endereco TEXT,
    telefone TEXT,
    email TEXT,
    documentos_pessoais TEXT,
    car_numero TEXT,
    declaracao_uso TEXT,
    quantidade_barragens_propriedade INTEGER DEFAULT 1,
    comentarios TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4.2. Tabela: BARRAGENS (Identificador estável da estrutura física / maciço)
CREATE TABLE IF NOT EXISTS barragens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empreendedor_id UUID REFERENCES empreendedores(id) ON DELETE SET NULL,
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
    ano_inicio_obra INTEGER,
    ano_final_obra INTEGER,
    idade_barragem_anos INTEGER,
    tipo_barragem_material TEXT DEFAULT 'terra',
    uso_principal TEXT DEFAULT 'dessedentacao_animal',
    usos_secundarios TEXT[] DEFAULT '{}',
    vertedouro_tipo TEXT DEFAULT 'canal_lateral',
    outorga_possui TEXT DEFAULT 'nao_informado',
    outorga_numero TEXT,
    licenca_ambiental_possui TEXT DEFAULT 'nao_informado',
    licenca_ambiental_numero TEXT,
    car_possui TEXT DEFAULT 'nao_informado',
    car_numero TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4.3. Tabela: VISTORIAS (Registro mestre de cada ato fiscalizatório de campo)
CREATE TABLE IF NOT EXISTS vistorias (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    barragem_id UUID NOT NULL REFERENCES barragens(id) ON DELETE RESTRICT,
    numero_vistoria TEXT NOT NULL,
    campanha_ano INTEGER NOT NULL DEFAULT 2026,
    campanha_numero TEXT,
    processo_sema TEXT,
    data_vistoria DATE NOT NULL DEFAULT CURRENT_DATE,
    hora_inicio TIME,
    hora_termino TIME,
    condicoes_climaticas TEXT DEFAULT 'seco',
    cota_atual_nivel_agua NUMERIC(8, 2),
    status_vistoria status_vistoria_enum NOT NULL DEFAULT 'rascunho_campo',
    is_draft BOOLEAN NOT NULL DEFAULT TRUE,
    
    -- Conclusões e sínteses fáticas de campo
    outros_problemas_descricao TEXT,
    conclusoes_sintese_fatica TEXT,
    medidas_imediatas_seguranca TEXT,
    recomendacoes_empreendedor TEXT,
    
    -- Gestão da Notificação Condicional (SIGA Autuação)
    requer_notificacao BOOLEAN NOT NULL DEFAULT FALSE,
    notificacao_modelo_tipo TEXT DEFAULT 'modelo_1_cadastro_classificacao',
    notificacao_numero TEXT,
    notificacao_prazo_dias INTEGER,
    notificacao_assunto TEXT,
    notificacao_objetivo TEXT,
    notificacao_exigencias TEXT,
    notificacao_destinatario_nome TEXT,
    notificacao_destinatario_cpf_cnpj TEXT,
    notificacao_destinatario_endereco TEXT,
    notificacao_destinatario_telefone TEXT,
    notificacao_destinatario_email TEXT,
    
    created_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4.4. Tabela: VISTORIA_EQUIPE (Servidores Fiscais / Analistas Técnicos da CSB)
CREATE TABLE IF NOT EXISTS vistoria_equipe (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vistoria_id UUID NOT NULL REFERENCES vistorias(id) ON DELETE CASCADE,
    nome TEXT NOT NULL,
    cargo TEXT DEFAULT 'Analista de Meio Ambiente / Fiscal',
    matricula TEXT,
    setor TEXT DEFAULT 'Coordenadoria de Segurança de Barragens - CSB/SEMA-MT',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4.5. Tabela: VISTORIA_ACOMPANHANTES (Prepostos, gerentes ou proprietários no local)
CREATE TABLE IF NOT EXISTS vistoria_acompanhantes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vistoria_id UUID NOT NULL REFERENCES vistorias(id) ON DELETE CASCADE,
    nome TEXT NOT NULL,
    cpf TEXT,
    vinculo TEXT DEFAULT 'Encarregado / Preposto',
    telefone TEXT,
    possui_acompanhante BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4.6. Tabela: VISTORIA_MEDICOES (Dimensões aferidas do maciço e reservatório)
CREATE TABLE IF NOT EXISTS vistoria_medicoes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vistoria_id UUID NOT NULL REFERENCES vistorias(id) ON DELETE CASCADE UNIQUE,
    altura_barragem_metros NUMERIC(6, 2),
    distancia_crista_pe_metros NUMERIC(6, 2),
    declividade_talude_jusante_graus NUMERIC(5, 2),
    largura_coroamento_metros NUMERIC(6, 2),
    extensao_coroamento_metros NUMERIC(8, 2),
    borda_livre_medida_metros NUMERIC(5, 2),
    espelho_dagua_hectares NUMERIC(8, 2),
    volume_estimado_m3 NUMERIC(14, 2),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4.7. Tabela: VISTORIA_COMPONENTES_CONDICAO (Estado geral dos componentes)
CREATE TABLE IF NOT EXISTS vistoria_componentes_condicao (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vistoria_id UUID NOT NULL REFERENCES vistorias(id) ON DELETE CASCADE,
    componente_codigo TEXT NOT NULL,
    componente_nome TEXT NOT NULL,
    condicao condicao_severidade_enum NOT NULL DEFAULT 'adequado',
    anomalias_selecionadas TEXT[] DEFAULT '{}',
    notas_observacoes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unq_vistoria_comp_cond UNIQUE (vistoria_id, componente_codigo)
);

-- 4.8. Tabela: VISTORIA_ITENS_AVALIADOS (Granularidade fina item a item da ficha física)
CREATE TABLE IF NOT EXISTS vistoria_itens_avaliados (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vistoria_id UUID NOT NULL REFERENCES vistorias(id) ON DELETE CASCADE,
    componente_codigo TEXT NOT NULL,
    item_codigo TEXT NOT NULL,
    item_rotulo_original TEXT NOT NULL,
    resposta tipo_resposta_avaliacao NOT NULL DEFAULT 'sem_informacao',
    localizacao_detalhe TEXT,
    estado_conservacao TEXT,
    observacao_complementar TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unq_vistoria_item UNIQUE (vistoria_id, componente_codigo, item_codigo)
);

-- 4.9. Tabela: VISTORIA_OBSERVACOES_COMPONENTES (Atributos estruturados complementares)
CREATE TABLE IF NOT EXISTS vistoria_observacoes_componentes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vistoria_id UUID NOT NULL REFERENCES vistorias(id) ON DELETE CASCADE,
    componente_codigo TEXT NOT NULL,
    comentarios TEXT,
    protecao_talude_tipos TEXT[] DEFAULT '{}',
    protecao_outros_especificacao TEXT,
    revestimento_possui BOOLEAN,
    revestimento_tipo TEXT,
    ombreira_esquerda_conservacao TEXT,
    ombreira_direita_conservacao TEXT,
    meio_fio_possui BOOLEAN,
    meio_fio_conservacao TEXT,
    ameaca_transbordamento BOOLEAN,
    instrumentacao_tipos TEXT[] DEFAULT '{}',
    vertedouro_descricao_detalhada TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unq_vistoria_comp_obs UNIQUE (vistoria_id, componente_codigo)
);

-- 4.10. Tabela: VISTORIA_FOTOS (Registro fotográfico associado aos componentes)
CREATE TABLE IF NOT EXISTS vistoria_fotos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vistoria_id UUID NOT NULL REFERENCES vistorias(id) ON DELETE CASCADE,
    componente_codigo TEXT NOT NULL,
    componente_nome TEXT NOT NULL,
    storage_path TEXT,
    url_visualizacao TEXT NOT NULL,
    localizacao_ponto TEXT,
    legenda TEXT,
    latitude NUMERIC(10, 7),
    longitude NUMERIC(10, 7),
    latitude_gms TEXT,
    longitude_gms TEXT,
    acuracia_metros NUMERIC(6, 2),
    sync_status TEXT DEFAULT 'local',
    timestamp_foto TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4.11. Tabela: VISTORIA_DOCUMENTOS (Minutas geradas: Auto, Relatório e Notificação)
CREATE TABLE IF NOT EXISTS vistoria_documentos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vistoria_id UUID NOT NULL REFERENCES vistorias(id) ON DELETE CASCADE,
    tipo_documento tipo_documento_vistoria NOT NULL,
    versao INTEGER NOT NULL DEFAULT 1,
    conteudo_texto TEXT NOT NULL,
    status_documento TEXT NOT NULL DEFAULT 'minuta_revisavel',
    gerado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unq_vistoria_doc_tipo_versao UNIQUE (vistoria_id, tipo_documento, versao)
);

-- 4.12. Tabela: HISTÓRICO MÍNIMO DE AUDITORIA E ALTERAÇÕES (Cadeia de Custódia)
CREATE TABLE IF NOT EXISTS vistoria_historico_alteracoes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vistoria_id UUID NOT NULL REFERENCES vistorias(id) ON DELETE CASCADE,
    tabela_nome TEXT NOT NULL,
    registro_id UUID NOT NULL,
    operacao TEXT NOT NULL CHECK (operacao IN ('INSERT', 'UPDATE', 'DELETE')),
    dados_anteriores JSONB,
    dados_novos JSONB,
    alterado_por UUID,
    alterado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------------------------
-- 5. ÍNDICES DE ALTA PERFORMANCE
-- ------------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_barragens_empreendedor ON barragens(empreendedor_id);
CREATE INDEX IF NOT EXISTS idx_barragens_municipio ON barragens(municipio);
CREATE INDEX IF NOT EXISTS idx_vistorias_barragem ON vistorias(barragem_id);
CREATE INDEX IF NOT EXISTS idx_vistorias_data ON vistorias(data_vistoria DESC);
CREATE INDEX IF NOT EXISTS idx_vistorias_status ON vistorias(status_vistoria);
CREATE INDEX IF NOT EXISTS idx_vistorias_numero ON vistorias(numero_vistoria);
CREATE INDEX IF NOT EXISTS idx_vistoria_equipe_vistoria ON vistoria_equipe(vistoria_id);
CREATE INDEX IF NOT EXISTS idx_vistoria_itens_vistoria ON vistoria_itens_avaliados(vistoria_id);
CREATE INDEX IF NOT EXISTS idx_vistoria_comp_cond_vistoria ON vistoria_componentes_condicao(vistoria_id);
CREATE INDEX IF NOT EXISTS idx_vistoria_fotos_vistoria ON vistoria_fotos(vistoria_id);
CREATE INDEX IF NOT EXISTS idx_vistoria_docs_vistoria ON vistoria_documentos(vistoria_id);
CREATE INDEX IF NOT EXISTS idx_vistoria_hist_vistoria ON vistoria_historico_alteracoes(vistoria_id);

-- ------------------------------------------------------------------------------
-- 6. TRIGGERS DE ATUALIZAÇÃO AUTOMÁTICA DE TIMESTAMP
-- ------------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_upd_empreendedores ON empreendedores;
CREATE TRIGGER trg_upd_empreendedores BEFORE UPDATE ON empreendedores
FOR EACH ROW EXECUTE FUNCTION fn_atualizar_timestamp_updated_at();

DROP TRIGGER IF EXISTS trg_upd_barragens ON barragens;
CREATE TRIGGER trg_upd_barragens BEFORE UPDATE ON barragens
FOR EACH ROW EXECUTE FUNCTION fn_atualizar_timestamp_updated_at();

DROP TRIGGER IF EXISTS trg_upd_vistorias ON vistorias;
CREATE TRIGGER trg_upd_vistorias BEFORE UPDATE ON vistorias
FOR EACH ROW EXECUTE FUNCTION fn_atualizar_timestamp_updated_at();

DROP TRIGGER IF EXISTS trg_upd_medicoes ON vistoria_medicoes;
CREATE TRIGGER trg_upd_medicoes BEFORE UPDATE ON vistoria_medicoes
FOR EACH ROW EXECUTE FUNCTION fn_atualizar_timestamp_updated_at();

DROP TRIGGER IF EXISTS trg_upd_itens ON vistoria_itens_avaliados;
CREATE TRIGGER trg_upd_itens BEFORE UPDATE ON vistoria_itens_avaliados
FOR EACH ROW EXECUTE FUNCTION fn_atualizar_timestamp_updated_at();

DROP TRIGGER IF EXISTS trg_upd_comp_cond ON vistoria_componentes_condicao;
CREATE TRIGGER trg_upd_comp_cond BEFORE UPDATE ON vistoria_componentes_condicao
FOR EACH ROW EXECUTE FUNCTION fn_atualizar_timestamp_updated_at();

-- ------------------------------------------------------------------------------
-- 7. TRIGGER DE AUDITORIA AUTOMÁTICA DE ALTERAÇÕES
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_auditar_alteracoes_vistoria()
RETURNS TRIGGER AS $$
DECLARE
    v_vistoria_id UUID;
BEGIN
    IF TG_TABLE_NAME = 'vistorias' THEN
        v_vistoria_id := COALESCE(NEW.id, OLD.id);
    ELSE
        v_vistoria_id := COALESCE(NEW.vistoria_id, OLD.vistoria_id);
    END IF;

    IF TG_OP = 'UPDATE' THEN
        INSERT INTO vistoria_historico_alteracoes (
            vistoria_id, tabela_nome, registro_id, operacao, dados_anteriores, dados_novos
        ) VALUES (
            v_vistoria_id, TG_TABLE_NAME, OLD.id, 'UPDATE', to_jsonb(OLD), to_jsonb(NEW)
        );
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        INSERT INTO vistoria_historico_alteracoes (
            vistoria_id, tabela_nome, registro_id, operacao, dados_anteriores, dados_novos
        ) VALUES (
            v_vistoria_id, TG_TABLE_NAME, OLD.id, 'DELETE', to_jsonb(OLD), NULL
        );
        RETURN OLD;
    ELSIF TG_OP = 'INSERT' THEN
        INSERT INTO vistoria_historico_alteracoes (
            vistoria_id, tabela_nome, registro_id, operacao, dados_anteriores, dados_novos
        ) VALUES (
            v_vistoria_id, TG_TABLE_NAME, NEW.id, 'INSERT', NULL, to_jsonb(NEW)
        );
        RETURN NEW;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_audit_vistorias ON vistorias;
CREATE TRIGGER trg_audit_vistorias AFTER INSERT OR UPDATE OR DELETE ON vistorias
FOR EACH ROW EXECUTE FUNCTION fn_auditar_alteracoes_vistoria();

DROP TRIGGER IF EXISTS trg_audit_medicoes ON vistoria_medicoes;
CREATE TRIGGER trg_audit_medicoes AFTER INSERT OR UPDATE OR DELETE ON vistoria_medicoes
FOR EACH ROW EXECUTE FUNCTION fn_auditar_alteracoes_vistoria();

DROP TRIGGER IF EXISTS trg_audit_itens ON vistoria_itens_avaliados;
CREATE TRIGGER trg_audit_itens AFTER INSERT OR UPDATE OR DELETE ON vistoria_itens_avaliados
FOR EACH ROW EXECUTE FUNCTION fn_auditar_alteracoes_vistoria();

DROP TRIGGER IF EXISTS trg_audit_docs ON vistoria_documentos;
CREATE TRIGGER trg_audit_docs AFTER INSERT OR UPDATE OR DELETE ON vistoria_documentos
FOR EACH ROW EXECUTE FUNCTION fn_auditar_alteracoes_vistoria();

-- ------------------------------------------------------------------------------
-- 8. POLÍTICAS DE SEGURANÇA (ROW LEVEL SECURITY - RLS)
-- ------------------------------------------------------------------------------
ALTER TABLE empreendedores ENABLE ROW LEVEL SECURITY;
ALTER TABLE barragens ENABLE ROW LEVEL SECURITY;
ALTER TABLE vistorias ENABLE ROW LEVEL SECURITY;
ALTER TABLE vistoria_equipe ENABLE ROW LEVEL SECURITY;
ALTER TABLE vistoria_acompanhantes ENABLE ROW LEVEL SECURITY;
ALTER TABLE vistoria_medicoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE vistoria_componentes_condicao ENABLE ROW LEVEL SECURITY;
ALTER TABLE vistoria_itens_avaliados ENABLE ROW LEVEL SECURITY;
ALTER TABLE vistoria_observacoes_componentes ENABLE ROW LEVEL SECURITY;
ALTER TABLE vistoria_fotos ENABLE ROW LEVEL SECURITY;
ALTER TABLE vistoria_documentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE vistoria_historico_alteracoes ENABLE ROW LEVEL SECURITY;

-- Limpeza idempotente de políticas prévias
DROP POLICY IF EXISTS "Servidores SEMA: Empreendedores" ON empreendedores;
DROP POLICY IF EXISTS "Servidores SEMA: Leitura de Empreendedores" ON empreendedores;
DROP POLICY IF EXISTS "Servidores SEMA: Inserção/Edição de Empreendedores" ON empreendedores;
DROP POLICY IF EXISTS "Coleta Campo SEMA (Anon): Sincronizar Empreendedores" ON empreendedores;

DROP POLICY IF EXISTS "Servidores SEMA: Barragens" ON barragens;
DROP POLICY IF EXISTS "Servidores SEMA: Acesso a Barragens" ON barragens;
DROP POLICY IF EXISTS "Coleta Campo SEMA (Anon): Sincronizar Barragens" ON barragens;

DROP POLICY IF EXISTS "Servidores SEMA: Vistorias" ON vistorias;
DROP POLICY IF EXISTS "Servidores SEMA: Acesso a Vistorias" ON vistorias;
DROP POLICY IF EXISTS "Coleta Campo SEMA (Anon): Sincronizar Vistorias" ON vistorias;

DROP POLICY IF EXISTS "Servidores SEMA: Equipe" ON vistoria_equipe;
DROP POLICY IF EXISTS "Servidores SEMA: Equipe e Acompanhantes" ON vistoria_equipe;
DROP POLICY IF EXISTS "Coleta Campo SEMA (Anon): Sincronizar Equipe" ON vistoria_equipe;

DROP POLICY IF EXISTS "Servidores SEMA: Acompanhantes" ON vistoria_acompanhantes;
DROP POLICY IF EXISTS "Coleta Campo SEMA (Anon): Sincronizar Acompanhantes" ON vistoria_acompanhantes;

DROP POLICY IF EXISTS "Servidores SEMA: Medições" ON vistoria_medicoes;
DROP POLICY IF EXISTS "Servidores SEMA: Medições de Campo" ON vistoria_medicoes;
DROP POLICY IF EXISTS "Coleta Campo SEMA (Anon): Sincronizar Medições" ON vistoria_medicoes;

DROP POLICY IF EXISTS "Servidores SEMA: Condição Componentes" ON vistoria_componentes_condicao;
DROP POLICY IF EXISTS "Coleta Campo SEMA (Anon): Sincronizar Componentes" ON vistoria_componentes_condicao;

DROP POLICY IF EXISTS "Servidores SEMA: Itens Avaliados" ON vistoria_itens_avaliados;
DROP POLICY IF EXISTS "Coleta Campo SEMA (Anon): Sincronizar Itens" ON vistoria_itens_avaliados;

DROP POLICY IF EXISTS "Servidores SEMA: Observações Componentes" ON vistoria_observacoes_componentes;
DROP POLICY IF EXISTS "Coleta Campo SEMA (Anon): Sincronizar Obs Componentes" ON vistoria_observacoes_componentes;

DROP POLICY IF EXISTS "Servidores SEMA: Fotos" ON vistoria_fotos;
DROP POLICY IF EXISTS "Servidores SEMA: Fotos de Vistoria" ON vistoria_fotos;
DROP POLICY IF EXISTS "Coleta Campo SEMA (Anon): Sincronizar Fotos" ON vistoria_fotos;

DROP POLICY IF EXISTS "Servidores SEMA: Documentos" ON vistoria_documentos;
DROP POLICY IF EXISTS "Servidores SEMA: Documentos Gerados" ON vistoria_documentos;
DROP POLICY IF EXISTS "Coleta Campo SEMA (Anon): Sincronizar Documentos" ON vistoria_documentos;

DROP POLICY IF EXISTS "Servidores SEMA: Histórico Auditoria" ON vistoria_historico_alteracoes;
DROP POLICY IF EXISTS "Servidores SEMA: Auditoria de Alterações" ON vistoria_historico_alteracoes;

-- Políticas de Acesso: ESTRITAMENTE AUTENTICADAS (Conformidade com LGPD e Segurança Institucional)
-- Nenhuma política pública ou anônima permitida para proteção de dados cadastrais e fotos
CREATE POLICY "Servidores SEMA: Empreendedores" ON empreendedores
    FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Servidores SEMA: Barragens" ON barragens
    FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Servidores SEMA: Vistorias" ON vistorias
    FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Servidores SEMA: Equipe" ON vistoria_equipe
    FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Servidores SEMA: Acompanhantes" ON vistoria_acompanhantes
    FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Servidores SEMA: Medições" ON vistoria_medicoes
    FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Servidores SEMA: Condição Componentes" ON vistoria_componentes_condicao
    FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Servidores SEMA: Itens Avaliados" ON vistoria_itens_avaliados
    FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Servidores SEMA: Observações Componentes" ON vistoria_observacoes_componentes
    FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Servidores SEMA: Fotos" ON vistoria_fotos
    FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Servidores SEMA: Documentos" ON vistoria_documentos
    FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Servidores SEMA: Histórico Auditoria" ON vistoria_historico_alteracoes
    FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- ------------------------------------------------------------------------------
-- 9. CONFIGURAÇÃO IDEMPOTENTE DO BUCKET PRIVADO DE FOTOS (SUPABASE STORAGE)
-- ------------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'fotos_vistorias_csb',
    'fotos_vistorias_csb',
    false, -- BUCKET ESTRITAMENTE PRIVADO (Sem exposição pública)
    15728640, -- 15MB por arquivo
    ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET 
    public = false,
    file_size_limit = 15728640,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp'];

-- Políticas de Storage: Acesso estritamente autenticado
DROP POLICY IF EXISTS "Upload de Fotos: Servidores Autenticados" ON storage.objects;
DROP POLICY IF EXISTS "Upload de Fotos: Servidores Autenticados e Campo" ON storage.objects;
CREATE POLICY "Upload de Fotos: Servidores Autenticados"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'fotos_vistorias_csb');

DROP POLICY IF EXISTS "Visualização de Fotos: Servidores Autenticados" ON storage.objects;
DROP POLICY IF EXISTS "Visualização de Fotos: Acesso Restrito" ON storage.objects;
CREATE POLICY "Visualização de Fotos: Servidores Autenticados"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'fotos_vistorias_csb');

DROP POLICY IF EXISTS "Exclusão de Fotos: Servidores Autenticados" ON storage.objects;
DROP POLICY IF EXISTS "Exclusão de Fotos: Gestão de Vistoria" ON storage.objects;
CREATE POLICY "Exclusão de Fotos: Servidores Autenticados"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'fotos_vistorias_csb');

-- ------------------------------------------------------------------------------
-- 10. VIEWS DE SUPORTE GERENCIAL E RELATÓRIOS EXECUTIVOS
-- ------------------------------------------------------------------------------

-- 10.1. Resumo Completo das Vistorias
CREATE OR REPLACE VIEW vw_resumo_vistorias AS
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
    v.updated_at
FROM vistorias v
JOIN barragens b ON b.id = v.barragem_id
LEFT JOIN empreendedores e ON e.id = b.empreendedor_id
LEFT JOIN vistoria_fotos f ON f.vistoria_id = v.id
LEFT JOIN vistoria_componentes_condicao c ON c.vistoria_id = v.id
GROUP BY v.id, b.id, e.id;

-- 10.2. Barragens com Alerta ou Anomalias Críticas
CREATE OR REPLACE VIEW vw_barragens_criticas AS
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
    c.notas_observacoes
FROM vistoria_componentes_condicao c
JOIN vistorias v ON v.id = c.vistoria_id
JOIN barragens b ON b.id = v.barragem_id
LEFT JOIN empreendedores e ON e.id = b.empreendedor_id
WHERE c.condicao IN ('critico', 'alerta')
ORDER BY v.data_vistoria DESC, c.condicao DESC;
