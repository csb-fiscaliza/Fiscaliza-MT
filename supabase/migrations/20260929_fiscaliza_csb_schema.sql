-- ==============================================================================
-- MIGRAÇÃO SUPABASE: FISCALIZA - ETAPA DE CAMPO CSB/SEMA-MT
-- Modelo Relacional com Identificadores Estáveis e Histórico Mínimo de Auditoria
-- Data: 2026-09-29
-- ==============================================================================

-- 1. Habilitar extensão para geração de UUIDv4
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. Domínios e Tipos Enumerados
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
    CREATE TYPE status_vistoria_enum AS ENUM (
        'rascunho_campo',
        'em_revisao',
        'concluida_campo',
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

-- 3. Tabela: EMPREENDEDORES (Identificador estável)
CREATE TABLE IF NOT EXISTS empreendedores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome_razao_social TEXT NOT NULL,
    cpf_cnpj TEXT,
    figura_juridica TEXT DEFAULT 'empresa_privada',
    endereco TEXT,
    telefone TEXT,
    email TEXT,
    documentos_pessoais TEXT,
    car_numero TEXT,
    declaracao_uso TEXT,
    quantidade_barragens_propriedade INTEGER DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Tabela: BARRAGENS (Identificador estável da estrutura)
CREATE TABLE IF NOT EXISTS barragens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empreendedor_id UUID REFERENCES empreendedores(id) ON DELETE SET NULL,
    nome TEXT NOT NULL,
    municipio TEXT NOT NULL,
    bacia_hidrografica TEXT,
    curso_dagua TEXT,
    latitude_decimal NUMERIC(10, 7),
    longitude_decimal NUMERIC(10, 7),
    datum TEXT DEFAULT 'SIRGAS 2000',
    cota_coroamento_metros NUMERIC(8, 2),
    ano_inicio_obra INTEGER,
    ano_final_obra INTEGER,
    tipo_barragem_material TEXT,
    uso_principal TEXT,
    usos_secundarios TEXT[],
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Tabela: VISTORIAS (Registro mestre da vistoria de campo)
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
    condicoes_climaticas TEXT,
    cota_atual_nivel_agua NUMERIC(8, 2),
    status_vistoria status_vistoria_enum NOT NULL DEFAULT 'rascunho_campo',
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

-- 6. Tabela: VISTORIA_EQUIPE (Servidores que executaram a fiscalização)
CREATE TABLE IF NOT EXISTS vistoria_equipe (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vistoria_id UUID NOT NULL REFERENCES vistorias(id) ON DELETE CASCADE,
    nome TEXT NOT NULL,
    cargo TEXT,
    matricula TEXT,
    setor TEXT DEFAULT 'CSB / SRH / SEMA-MT',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. Tabela: VISTORIA_ACOMPANHANTES (Pessoas presentes no campo)
CREATE TABLE IF NOT EXISTS vistoria_acompanhantes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vistoria_id UUID NOT NULL REFERENCES vistorias(id) ON DELETE CASCADE,
    nome TEXT NOT NULL,
    cpf TEXT,
    vinculo TEXT,
    telefone TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. Tabela: VISTORIA_MEDICOES (Aferição técnica de medidas no maciço)
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
    volume_estimado_m3 NUMERIC(12, 2),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 9. Tabela: VISTORIA_ITENS_AVALIADOS (Cada anomalia avaliada com granularidade fina)
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

-- 10. Tabela: VISTORIA_OBSERVACOES_COMPONENTES (Atributos estruturados de cada componente)
CREATE TABLE IF NOT EXISTS vistoria_observacoes_componentes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vistoria_id UUID NOT NULL REFERENCES vistorias(id) ON DELETE CASCADE,
    componente_codigo TEXT NOT NULL,
    comentarios TEXT,
    protecao_talude_tipos TEXT[],
    protecao_outros_especificacao TEXT,
    revestimento_possui BOOLEAN,
    revestimento_tipo TEXT,
    ombreira_esquerda_conservacao TEXT,
    ombreira_direita_conservacao TEXT,
    meio_fio_possui BOOLEAN,
    meio_fio_conservacao TEXT,
    ameaca_transbordamento BOOLEAN,
    instrumentacao_tipos TEXT[],
    vertedouro_descricao_detalhada TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unq_vistoria_comp_obs UNIQUE (vistoria_id, componente_codigo)
);

-- 11. Tabela: VISTORIA_FOTOS (Registro fotográfico com vínculo ao componente)
CREATE TABLE IF NOT EXISTS vistoria_fotos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vistoria_id UUID NOT NULL REFERENCES vistorias(id) ON DELETE CASCADE,
    componente_codigo TEXT NOT NULL,
    storage_path TEXT,
    url_visualizacao TEXT NOT NULL,
    localizacao_ponto TEXT,
    legenda TEXT,
    timestamp_foto TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 12. Tabela: VISTORIA_DOCUMENTOS (Minutas geradas associadas à vistoria)
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

-- 13. Tabela: HISTÓRICO MÍNIMO DE AUDITORIA E ALTERAÇÕES
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

-- 14. Função e Trigger para Auditoria Automática de Alterações
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

-- Aplicar triggers de auditoria nas tabelas centrais
DROP TRIGGER IF EXISTS trg_audit_vistorias ON vistorias;
CREATE TRIGGER trg_audit_vistorias
AFTER INSERT OR UPDATE OR DELETE ON vistorias
FOR EACH ROW EXECUTE FUNCTION fn_auditar_alteracoes_vistoria();

DROP TRIGGER IF EXISTS trg_audit_medicoes ON vistoria_medicoes;
CREATE TRIGGER trg_audit_medicoes
AFTER INSERT OR UPDATE OR DELETE ON vistoria_medicoes
FOR EACH ROW EXECUTE FUNCTION fn_auditar_alteracoes_vistoria();

DROP TRIGGER IF EXISTS trg_audit_itens ON vistoria_itens_avaliados;
CREATE TRIGGER trg_audit_itens
AFTER INSERT OR UPDATE OR DELETE ON vistoria_itens_avaliados
FOR EACH ROW EXECUTE FUNCTION fn_auditar_alteracoes_vistoria();

DROP TRIGGER IF EXISTS trg_audit_docs ON vistoria_documentos;
CREATE TRIGGER trg_audit_docs
AFTER INSERT OR UPDATE OR DELETE ON vistoria_documentos
FOR EACH ROW EXECUTE FUNCTION fn_auditar_alteracoes_vistoria();

-- 15. Políticas Rigorosas de Segurança (Row Level Security - RLS)
-- Em observância à LGPD e à política de segurança da informação da SEMA-MT:
-- Bloqueia acesso anônimo irrestrito a dados pessoais (CPF/CNPJ, telefones, endereços)
-- Exige autenticação de servidores ou tokens restritos de vistoria

ALTER TABLE empreendedores ENABLE ROW LEVEL SECURITY;
ALTER TABLE barragens ENABLE ROW LEVEL SECURITY;
ALTER TABLE vistorias ENABLE ROW LEVEL SECURITY;
ALTER TABLE vistoria_equipe ENABLE ROW LEVEL SECURITY;
ALTER TABLE vistoria_acompanhantes ENABLE ROW LEVEL SECURITY;
ALTER TABLE vistoria_medicoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE vistoria_itens_avaliados ENABLE ROW LEVEL SECURITY;
ALTER TABLE vistoria_observacoes_componentes ENABLE ROW LEVEL SECURITY;
ALTER TABLE vistoria_fotos ENABLE ROW LEVEL SECURITY;
ALTER TABLE vistoria_documentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE vistoria_historico_alteracoes ENABLE ROW LEVEL SECURITY;

-- Remove políticas públicas antigas se existirem
DROP POLICY IF EXISTS "Permitir leitura para usuarios do sistema" ON vistorias;
DROP POLICY IF EXISTS "Permitir insercao para usuarios do sistema" ON vistorias;
DROP POLICY IF EXISTS "Permitir atualizacao para usuarios do sistema" ON vistorias;
DROP POLICY IF EXISTS "Permitir leitura itens" ON vistoria_itens_avaliados;
DROP POLICY IF EXISTS "Permitir gravacao itens" ON vistoria_itens_avaliados;
DROP POLICY IF EXISTS "Permitir documentos" ON vistoria_documentos;
DROP POLICY IF EXISTS "Permitir fotos" ON vistoria_fotos;
DROP POLICY IF EXISTS "Permitir medicoes" ON vistoria_medicoes;
DROP POLICY IF EXISTS "Permitir equipe" ON vistoria_equipe;
DROP POLICY IF EXISTS "Permitir acompanhantes" ON vistoria_acompanhantes;
DROP POLICY IF EXISTS "Permitir barragens" ON barragens;
DROP POLICY IF EXISTS "Permitir empreendedores" ON empreendedores;
DROP POLICY IF EXISTS "Permitir historico leitura" ON vistoria_historico_alteracoes;

-- Políticas de Acesso Autenticado para Servidores da SEMA-MT
CREATE POLICY "Servidores SEMA: Leitura de Empreendedores" ON empreendedores 
    FOR SELECT TO authenticated USING (true);
CREATE POLICY "Servidores SEMA: Inserção/Edição de Empreendedores" ON empreendedores 
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Servidores SEMA: Acesso a Barragens" ON barragens 
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Servidores SEMA: Acesso a Vistorias" ON vistorias 
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Servidores SEMA: Equipe e Acompanhantes" ON vistoria_equipe 
    FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Servidores SEMA: Acompanhantes" ON vistoria_acompanhantes 
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Servidores SEMA: Medições de Campo" ON vistoria_medicoes 
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Servidores SEMA: Itens Avaliados" ON vistoria_itens_avaliados 
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Servidores SEMA: Observações de Componentes" ON vistoria_observacoes_componentes 
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Servidores SEMA: Fotos de Vistoria" ON vistoria_fotos 
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Servidores SEMA: Documentos Gerados" ON vistoria_documentos 
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Servidores SEMA: Auditoria de Alterações" ON vistoria_historico_alteracoes 
    FOR SELECT TO authenticated USING (true);

-- 16. Configuração do Bucket Privado de Armazenamento de Fotos (Storage)
-- Impede listagem pública de fotografias de barragens no portal da SEMA
INSERT INTO storage.buckets (id, name, public, avif_autodetection, file_size_limit, allowed_mime_types)
VALUES (
    'fotos_vistorias_csb',
    'fotos_vistorias_csb',
    false, -- BUCKET PRIVADO (Acesso restrito a servidores autenticados)
    true,
    15728640, -- Limite de 15MB por foto comprimida
    ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET public = false;

-- Políticas de Storage para o Bucket 'fotos_vistorias_csb'
CREATE POLICY "Servidores SEMA: Upload de Fotos de Campo" 
ON storage.objects FOR INSERT TO authenticated 
WITH CHECK (bucket_id = 'fotos_vistorias_csb');

CREATE POLICY "Servidores SEMA: Visualização de Fotos" 
ON storage.objects FOR SELECT TO authenticated 
USING (bucket_id = 'fotos_vistorias_csb');

CREATE POLICY "Servidores SEMA: Exclusão de Fotos de Rascunho" 
ON storage.objects FOR DELETE TO authenticated 
USING (bucket_id = 'fotos_vistorias_csb');
