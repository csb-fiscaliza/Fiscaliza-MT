-- ==============================================================================
-- SISTEMA FISCALIZA – COORDENADORIA DE SEGURANÇA DE BARRAGENS (CSB / SEMA-MT)
-- SCRIPT DE CORREÇÃO: POLÍTICAS RLS PARA SINCRONIZAÇÃO DE CAMPO (OFFLINE-FIRST)
-- Permite que o app sincronize registros utilizando a chave anônima (anon) 
-- e usuários autenticados (authenticated), resolvendo o erro 42501 em "empreendedores".
-- ==============================================================================

-- 1. EMPREENDEDORES
DROP POLICY IF EXISTS "Servidores SEMA: Empreendedores" ON empreendedores;
DROP POLICY IF EXISTS "Fiscaliza CSB: Empreendedores" ON empreendedores;
CREATE POLICY "Fiscaliza CSB: Empreendedores" ON empreendedores
    FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- 2. BARRAGENS
DROP POLICY IF EXISTS "Servidores SEMA: Barragens" ON barragens;
DROP POLICY IF EXISTS "Fiscaliza CSB: Barragens" ON barragens;
CREATE POLICY "Fiscaliza CSB: Barragens" ON barragens
    FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- 3. VISTORIAS
DROP POLICY IF EXISTS "Servidores SEMA: Vistorias" ON vistorias;
DROP POLICY IF EXISTS "Fiscaliza CSB: Vistorias" ON vistorias;
CREATE POLICY "Fiscaliza CSB: Vistorias" ON vistorias
    FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- 4. EQUIPE
DROP POLICY IF EXISTS "Servidores SEMA: Equipe" ON vistoria_equipe;
DROP POLICY IF EXISTS "Fiscaliza CSB: Equipe" ON vistoria_equipe;
CREATE POLICY "Fiscaliza CSB: Equipe" ON vistoria_equipe
    FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- 5. ACOMPANHANTES
DROP POLICY IF EXISTS "Servidores SEMA: Acompanhantes" ON vistoria_acompanhantes;
DROP POLICY IF EXISTS "Fiscaliza CSB: Acompanhantes" ON vistoria_acompanhantes;
CREATE POLICY "Fiscaliza CSB: Acompanhantes" ON vistoria_acompanhantes
    FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- 6. MEDIÇÕES
DROP POLICY IF EXISTS "Servidores SEMA: Medições" ON vistoria_medicoes;
DROP POLICY IF EXISTS "Fiscaliza CSB: Medições" ON vistoria_medicoes;
CREATE POLICY "Fiscaliza CSB: Medições" ON vistoria_medicoes
    FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- 7. CONDIÇÃO COMPONENTES
DROP POLICY IF EXISTS "Servidores SEMA: Condição Componentes" ON vistoria_componentes_condicao;
DROP POLICY IF EXISTS "Fiscaliza CSB: Condição Componentes" ON vistoria_componentes_condicao;
CREATE POLICY "Fiscaliza CSB: Condição Componentes" ON vistoria_componentes_condicao
    FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- 8. ITENS AVALIADOS
DROP POLICY IF EXISTS "Servidores SEMA: Itens Avaliados" ON vistoria_itens_avaliados;
DROP POLICY IF EXISTS "Fiscaliza CSB: Itens Avaliados" ON vistoria_itens_avaliados;
CREATE POLICY "Fiscaliza CSB: Itens Avaliados" ON vistoria_itens_avaliados
    FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- 9. OBSERVAÇÕES COMPONENTES
DROP POLICY IF EXISTS "Servidores SEMA: Observações Componentes" ON vistoria_observacoes_componentes;
DROP POLICY IF EXISTS "Fiscaliza CSB: Observações Componentes" ON vistoria_observacoes_componentes;
CREATE POLICY "Fiscaliza CSB: Observações Componentes" ON vistoria_observacoes_componentes
    FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- 10. FOTOS DE VISTORIA
DROP POLICY IF EXISTS "Servidores SEMA: Fotos" ON vistoria_fotos;
DROP POLICY IF EXISTS "Fiscaliza CSB: Fotos" ON vistoria_fotos;
CREATE POLICY "Fiscaliza CSB: Fotos" ON vistoria_fotos
    FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- 11. DOCUMENTOS GERADOS
DROP POLICY IF EXISTS "Servidores SEMA: Documentos" ON vistoria_documentos;
DROP POLICY IF EXISTS "Fiscaliza CSB: Documentos" ON vistoria_documentos;
CREATE POLICY "Fiscaliza CSB: Documentos" ON vistoria_documentos
    FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- 12. HISTÓRICO DE AUDITORIA
DROP POLICY IF EXISTS "Servidores SEMA: Histórico Auditoria" ON vistoria_historico_alteracoes;
DROP POLICY IF EXISTS "Fiscaliza CSB: Histórico Auditoria" ON vistoria_historico_alteracoes;
CREATE POLICY "Fiscaliza CSB: Histórico Auditoria" ON vistoria_historico_alteracoes
    FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- 13. POLÍTICA DE STORAGE PARA FOTOS
DROP POLICY IF EXISTS "Upload de Fotos: Servidores Autenticados" ON storage.objects;
DROP POLICY IF EXISTS "Upload de Fotos: Fiscaliza CSB" ON storage.objects;
CREATE POLICY "Upload de Fotos: Fiscaliza CSB"
ON storage.objects FOR ALL TO anon, authenticated
USING (bucket_id = 'fotos_vistorias_csb')
WITH CHECK (bucket_id = 'fotos_vistorias_csb');
