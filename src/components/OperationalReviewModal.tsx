// ==============================================================================
// ARQUIVO: src/components/OperationalReviewModal.tsx
// Painel de Governança Institucional, Segurança, LGPD, RLS e Minutas (CSB/SEMA-MT)
// Prioridades institucionais pré-implementação, auditoria e anonimizador para IA
// ==============================================================================

import React, { useState, useEffect, useRef } from 'react';
import { 
  ShieldCheck, 
  ShieldAlert, 
  Lock, 
  Database, 
  Wifi, 
  WifiOff, 
  UserCheck, 
  X, 
  RefreshCw, 
  FileText, 
  Scale, 
  Eye,
  EyeOff,
  Download,
  Copy,
  Check,
  CheckCircle2,
  ListChecks
} from 'lucide-react';
import { InspectionData } from '../types/inspection';
import { getSupabaseSecurityDiagnostics } from '../services/supabase';
import { 
  detectSensitivePii, 
  exportAnonymizedJsonFile, 
  generateAnonymizedDocumentsBundle 
} from '../utils/anonymizer';
import { createAuthenticitySeal } from '../utils/securityCrypto';
import { exportEncryptedInspectionToJson } from '../services/storage';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  data: InspectionData;
  isOnline: boolean;
  lastSavedAt: string | null;
}

export const OperationalReviewModal: React.FC<Props> = ({
  isOpen,
  onClose,
  data,
  isOnline,
  lastSavedAt
}) => {
  const [activeTab, setActiveTab] = useState<'prioridades' | 'lgpd' | 'seguranca' | 'pendencias'>('prioridades');
  const [supabaseDiag, setSupabaseDiag] = useState<any>(null);
  const [loadingDiag, setLoadingDiag] = useState(false);
  const [maskSensitiveData, setMaskSensitiveData] = useState(true);
  const [copiedBundle, setCopiedBundle] = useState(false);
  const [exportPassphrase, setExportPassphrase] = useState('');
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportSuccess, setExportSuccess] = useState(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (isOpen) {
      runDiagnostics();
    }
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, [isOpen]);

  const runDiagnostics = async () => {
    setLoadingDiag(true);
    try {
      const diag = await getSupabaseSecurityDiagnostics();
      setSupabaseDiag(diag);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingDiag(false);
    }
  };

  const handleCopyBundle = () => {
    const bundle = generateAnonymizedDocumentsBundle(data);
    navigator.clipboard.writeText(bundle).then(() => {
      setCopiedBundle(true);
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopiedBundle(false), 2500);
    });
  };

  if (!isOpen) return null;

  // Detecção de dados sensíveis LGPD
  const piiFindings = detectSensitivePii(data);

  // Análise objetiva de pendências fáticas da vistoria atual
  const pendencias: string[] = [];
  const g = data.generalInfo;
  const d = data.damIdentification;
  const c = data.conclusions;

  if (!d.damName && !d.propertyOrBusinessName) {
    pendencias.push('Identificação da barragem ou propriedade rural ausente.');
  }
  if (!d.coordinates.latitude || !d.coordinates.longitude) {
    pendencias.push('Coordenadas geográficas não capturadas no ponto do barramento.');
  }
  if (!g.inspectionDate) {
    pendencias.push('Data da vistoria de campo não informada.');
  }
  if (!g.inspectors || g.inspectors.length === 0 || !g.inspectors[0]?.name) {
    pendencias.push('Composição da equipe técnica de servidores notificantes incompleta.');
  }
  if (c.requiresNotification && !c.notificationDetails.prazoDias) {
    pendencias.push('Notificação ativada, porém o prazo de atendimento em dias não foi expressamente fixado pelo fiscal.');
  }
  if (c.requiresNotification && !c.notificationDetails.objetivo) {
    pendencias.push('Notificação ativada sem definição do objetivo específico.');
  }

  const componentesIncompletos = Object.values(data.componentsData).filter(
    comp => comp.condition === 'nao_inspecionado'
  );
  if (componentesIncompletos.length > 0) {
    pendencias.push(`${componentesIncompletos.length} componente(s) estrutural(is) ainda com status "Não inspecionado".`);
  }

  const fotosLocais = data.photos.filter(p => !p.syncStatus || p.syncStatus === 'local');

  const maskCpf = (val?: string) => {
    if (!val) return 'Não informado';
    if (!maskSensitiveData) return val;
    return val.replace(/^(\d{3})\.?(\d{3})\.?(\d{3})-?(\d{2})$/, '$1.***.***-$4');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 xs:p-3 sm:p-4 bg-slate-950/75 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-4xl w-full shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden my-auto max-h-[92dvh] flex flex-col text-slate-900 dark:text-slate-100 transition-colors">
        {/* Top Header */}
        <div className="bg-slate-900 text-white px-5 py-3.5 flex items-center justify-between border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-600 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-white leading-tight">
                Governança Operacional, LGPD & Homologação Institucional (SEMA-MT)
              </h2>
              <p className="text-[11px] text-slate-400">
                Diretrizes pré-implementação, segurança de dados, anonimização e validação formal
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 flex items-center justify-center transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="bg-slate-100 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 px-4 py-2 flex items-center gap-1.5 overflow-x-auto shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('prioridades')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
              activeTab === 'prioridades'
                ? 'bg-emerald-700 text-white shadow-xs'
                : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700'
            }`}
          >
            <ListChecks className="w-3.5 h-3.5" />
            <span>1. Prioridades Pré-Implementação</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('lgpd')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
              activeTab === 'lgpd'
                ? 'bg-emerald-700 text-white shadow-xs'
                : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700'
            }`}
          >
            <UserCheck className="w-3.5 h-3.5" />
            <span>2. LGPD & Anonimizador IA</span>
            {piiFindings.length > 0 && (
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('seguranca')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
              activeTab === 'seguranca'
                ? 'bg-emerald-700 text-white shadow-xs'
                : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700'
            }`}
          >
            <Lock className="w-3.5 h-3.5" />
            <span>3. Segurança & Banco</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('pendencias')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
              activeTab === 'pendencias'
                ? 'bg-emerald-700 text-white shadow-xs'
                : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>4. Pendências da Vistoria</span>
            {pendencias.length > 0 && (
              <span className="px-1.5 py-0.2 bg-amber-500 text-white rounded-full text-[10px]">
                {pendencias.length}
              </span>
            )}
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto space-y-6 flex-1 text-slate-800">
          
          {/* TAB 1: PRIORIDADES ANTES DA IMPLEMENTAÇÃO */}
          {activeTab === 'prioridades' && (
            <div className="space-y-4">
              {/* Institutional Notice */}
              <div className="bg-amber-50 border-2 border-amber-300 rounded-xl p-4 text-amber-950 space-y-2">
                <div className="flex items-center gap-2 text-xs sm:text-sm font-black text-amber-900 uppercase tracking-wide">
                  <ShieldAlert className="w-5 h-5 text-amber-700 shrink-0" />
                  <span>Protocolo de Governança Institucional – Não Prontidão para Efeito Final</span>
                </div>
                <p className="text-xs leading-relaxed text-amber-900">
                  Conforme determinação operacional, <strong>esta ferramenta digital não deve ser declarada pronta para uso oficial</strong> sem a aprovação formal da <strong>Coordenadoria de Segurança de Barragens (CSB)</strong>, homologação técnica da <strong>TI da SEMA-MT</strong> e parecer da <strong>Assessoria Jurídica</strong>. Abaixo estão as 6 prioridades mandatórias a serem cumpridas antes da entrada em produção:
                </p>
              </div>

              {/* Grid das 6 Prioridades Institucionais */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 text-xs">
                
                {/* 1. Aprovação da Ficha Digital */}
                <div className="border border-slate-200 rounded-xl p-3.5 bg-slate-50/70 space-y-2">
                  <div className="flex items-center gap-2 text-emerald-900 font-bold text-xs uppercase tracking-wide">
                    <span className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[11px]">1</span>
                    <h4>Aprovação da Ficha Digital & Campos Obrigatórios</h4>
                  </div>
                  <p className="text-slate-700 text-[11px] leading-relaxed">
                    Formalizar junto à chefia da CSB a validação da ficha digital em relação à ficha física em papel.
                  </p>
                  <ul className="text-[11px] text-slate-600 space-y-1 list-disc list-inside bg-white p-2 rounded border border-slate-200">
                    <li>Confirmar quais campos da ficha física permanecem de preenchimento estritamente obrigatório em campo.</li>
                    <li>Garantir que respostas vazias sejam omitidas nas minutas sem conversão arbitrária para "N/A".</li>
                  </ul>
                </div>

                {/* 2. Modelos Institucionais Vigentes */}
                <div className="border border-slate-200 rounded-xl p-3.5 bg-slate-50/70 space-y-2">
                  <div className="flex items-center gap-2 text-emerald-900 font-bold text-xs uppercase tracking-wide">
                    <span className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[11px]">2</span>
                    <h4>Modelos Institucionais Vigentes & Base Legal</h4>
                  </div>
                  <p className="text-slate-700 text-[11px] leading-relaxed">
                    Definir os espelhos normativos vigentes para os 3 instrumentos emitidos:
                  </p>
                  <ul className="text-[11px] text-slate-600 space-y-1 list-disc list-inside bg-white p-2 rounded border border-slate-200">
                    <li><strong>Auto de Inspeção:</strong> Modelo de campo conforme Resolução ANA / SEMA-MT.</li>
                    <li><strong>Relatório Técnico:</strong> Estrutura de 15 seções com fotos integradas por componente.</li>
                    <li><strong>Notificação (SIGA Autuação):</strong> Opcional/condicional com fundamentação legal explícita (Lei 12.334/2010, Art. 330 CP, Dec. 6.514/2008).</li>
                  </ul>
                </div>

                {/* 3. Fluxo de Revisão e RBAC */}
                <div className="border border-slate-200 rounded-xl p-3.5 bg-slate-50/70 space-y-2">
                  <div className="flex items-center gap-2 text-emerald-900 font-bold text-xs uppercase tracking-wide">
                    <span className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[11px]">3</span>
                    <h4>Fluxo de Revisão, Finalização & Perfis (RBAC)</h4>
                  </div>
                  <p className="text-slate-700 text-[11px] leading-relaxed">
                    Normatizar a cadeia de custódia e competências de cada perfil na plataforma:
                  </p>
                  <ul className="text-[11px] text-slate-600 space-y-1 list-disc list-inside bg-white p-2 rounded border border-slate-200">
                    <li><strong>Fiscal de Campo:</strong> Edita rascunhos, registra fotos e coordenadas.</li>
                    <li><strong>Coordenador CSB:</strong> Homologa minutas e autoriza exportação definitiva.</li>
                    <li><strong>Imutabilidade:</strong> Após finalizada e assinada no SIGA, a vistoria é bloqueada para qualquer alteração fática.</li>
                  </ul>
                </div>

                {/* 4. Campo sem Internet & Armazenamento Temporário */}
                <div className="border border-slate-200 rounded-xl p-3.5 bg-slate-50/70 space-y-2">
                  <div className="flex items-center gap-2 text-emerald-900 font-bold text-xs uppercase tracking-wide">
                    <span className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[11px]">4</span>
                    <h4>Operação em Campo Offline & Armazenamento Local</h4>
                  </div>
                  <p className="text-slate-700 text-[11px] leading-relaxed">
                    Definir a política de dados temporários no dispositivo móvel do fiscal:
                  </p>
                  <ul className="text-[11px] text-slate-600 space-y-1 list-disc list-inside bg-white p-2 rounded border border-slate-200">
                    <li>Funcionamento 100% offline garantido via armazenamento local criptografado.</li>
                    <li>Regras de retenção: prazo de expiração de rascunhos locais e envio seguro após confirmação no servidor central.</li>
                  </ul>
                </div>

                {/* 5. Ambiente Corporativo Homologado */}
                <div className="border border-slate-200 rounded-xl p-3.5 bg-slate-50/70 space-y-2">
                  <div className="flex items-center gap-2 text-emerald-900 font-bold text-xs uppercase tracking-wide">
                    <span className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[11px]">5</span>
                    <h4>Ambiente Corporativo & Banco Centralizado</h4>
                  </div>
                  <p className="text-slate-700 text-[11px] leading-relaxed">
                    Homologar infraestrutura de TI do Estado de Mato Grosso:
                  </p>
                  <ul className="text-[11px] text-slate-600 space-y-1 list-disc list-inside bg-white p-2 rounded border border-slate-200">
                    <li>Separação rigorosa entre ambiente de Desenvolvimento e Produção Governamental.</li>
                    <li>Aplicação de políticas de acesso bloqueando leitura anônima a CPFs e relatórios.</li>
                    <li>Repositório privado de fotos com URLs assinadas e sem indexação em motores de busca.</li>
                  </ul>
                </div>

                {/* 6. LGPD e Anonimização */}
                <div className="border border-slate-200 rounded-xl p-3.5 bg-slate-50/70 space-y-2">
                  <div className="flex items-center gap-2 text-emerald-900 font-bold text-xs uppercase tracking-wide">
                    <span className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[11px]">6</span>
                    <h4>Proteção LGPD & Anonimização para Ferramentas Externas</h4>
                  </div>
                  <p className="text-slate-700 text-[11px] leading-relaxed">
                    Regra mandatória para uso de ferramentas externas de apoio ou auditoria:
                  </p>
                  <ul className="text-[11px] text-slate-600 space-y-1 list-disc list-inside bg-white p-2 rounded border border-slate-200">
                    <li><strong>Proibição de PII:</strong> Jamais submeter CPFs, contatos telefônicos ou nomes reais de servidores e proprietários.</li>
                    <li><strong>Exportação Segura:</strong> Utilizar exclusivamente o botão de <em>"Exportar Vistoria Anonimizada (LGPD)"</em> integrado na aba ao lado.</li>
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: LGPD & ANONIMIZADOR */}
          {activeTab === 'lgpd' && (
            <div className="space-y-4">
              <div className="bg-emerald-50 border border-emerald-300 rounded-xl p-4 text-emerald-950 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs sm:text-sm font-bold text-emerald-900">
                    <UserCheck className="w-5 h-5 text-emerald-700 shrink-0" />
                    <span>Conformidade com a LGPD (Lei Federal nº 13.709/2018)</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setMaskSensitiveData(!maskSensitiveData)}
                    className="text-[11px] text-emerald-800 font-semibold hover:underline flex items-center gap-1 cursor-pointer bg-white px-2.5 py-1 rounded border border-emerald-300"
                  >
                    {maskSensitiveData ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                    <span>{maskSensitiveData ? 'Exibir Dados Reais' : 'Mascarar na Interface'}</span>
                  </button>
                </div>
                <p className="text-xs text-emerald-900 leading-relaxed">
                  Para utilizar ferramentas externas de apoio, análise estatística ou auditoria, utilize os utilitários de anonimização abaixo para expurgar 100% dos dados identificáveis.
                </p>
              </div>

              {/* Botões de Ação de Anonimização */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => exportAnonymizedJsonFile(data)}
                  className="p-3.5 rounded-xl bg-slate-900 hover:bg-black text-white text-xs font-bold transition flex items-center justify-center gap-2 shadow-sm cursor-pointer"
                >
                  <Download className="w-4 h-4 text-emerald-400" />
                  <span>Baixar JSON 100% Anonimizado (LGPD)</span>
                </button>

                <button
                  type="button"
                  onClick={handleCopyBundle}
                  className="p-3.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold transition flex items-center justify-center gap-2 shadow-sm cursor-pointer"
                >
                  {copiedBundle ? <Check className="w-4 h-4 text-emerald-200" /> : <Copy className="w-4 h-4 text-emerald-200" />}
                  <span>{copiedBundle ? 'Minutas Anonimizadas Copiadas!' : 'Copiar Minutas Anonimizadas para Prompt de IA'}</span>
                </button>
              </div>

              {/* Lista de Campos Sensíveis Detectados */}
              <div className="border border-slate-200 rounded-xl p-4 space-y-3 bg-white">
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wide">
                  Dados Pessoais Identificáveis Detectados Nesta Vistoria ({piiFindings.length})
                </h4>

                {piiFindings.length > 0 ? (
                  <div className="space-y-2">
                    {piiFindings.map((finding, idx) => (
                      <div key={idx} className="flex flex-wrap items-center justify-between gap-2 p-2 bg-slate-50 rounded-lg border border-slate-200 text-xs">
                        <div className="space-y-0.5">
                          <span className="font-semibold text-slate-800">{finding.field}</span>
                          <span className="text-[10px] text-slate-500 block">Categoria: {finding.category}</span>
                        </div>
                        <div className="flex items-center gap-2 font-mono text-[11px]">
                          <span className="text-slate-500 line-through">
                            {maskSensitiveData ? maskCpf(finding.originalValue) : finding.originalValue}
                          </span>
                          <span className="text-emerald-700 font-bold">→ {finding.sanitizedValue}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-500 italic">
                    Nenhum dado pessoal nominal foi preenchido nesta vistoria.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: SEGURANÇA & BANCO DE DADOS */}
          {activeTab === 'seguranca' && (
            <div className="space-y-4">
              {/* Status de Conexão e Rascunho */}
              <div className="border border-slate-200 rounded-xl p-4 space-y-3 bg-slate-50/50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {isOnline ? (
                      <Wifi className="w-4 h-4 text-emerald-600" />
                    ) : (
                      <WifiOff className="w-4 h-4 text-amber-600" />
                    )}
                    <h3 className="text-xs sm:text-sm font-bold text-slate-900">
                      Resiliência de Campo e Salvamento de Rascunhos
                    </h3>
                  </div>
                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${
                    isOnline 
                      ? 'bg-emerald-100 text-emerald-800 border-emerald-300' 
                      : 'bg-amber-100 text-amber-800 border-amber-300'
                  }`}>
                    {isOnline ? 'Online (Conectado)' : 'Offline (Modo de Campo)'}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div className="bg-white p-3 rounded-lg border border-slate-200 space-y-1">
                    <span className="text-slate-500 font-semibold block text-[11px]">Rascunho Local no Dispositivo:</span>
                    <div className="flex items-center gap-1.5 text-slate-800 font-medium">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      <span>Persistido com proteção no navegador</span>
                    </div>
                    <span className="text-[10px] text-slate-500 block">
                      Último salvamento: <strong>{lastSavedAt || 'Recentemente'}</strong>
                    </span>
                  </div>

                  <div className="bg-white p-3 rounded-lg border border-slate-200 space-y-1">
                    <span className="text-slate-500 font-semibold block text-[11px]">Fotos de Vistoria:</span>
                    <p className="text-slate-700 text-[11px]">
                      Armazenamento institucional protegido de evidências fotográficas
                    </p>
                    <span className="text-[10px] text-slate-500 block">
                      {data.photos.length} foto(s) registrada(s) • {fotosLocais.length} pendente(s) de envio
                    </span>
                  </div>
                </div>
              </div>

              {/* Políticas de Acesso e Autenticação */}
              <div className="border border-slate-200 rounded-xl p-4 space-y-3 bg-white">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Database className="w-4 h-4 text-emerald-600" />
                    <h3 className="text-xs sm:text-sm font-bold text-slate-900">
                      Autenticação & Controle Estrito de Acesso
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={runDiagnostics}
                    className="text-[11px] text-slate-600 hover:text-slate-900 flex items-center gap-1 cursor-pointer"
                  >
                    <RefreshCw className={`w-3 h-3 ${loadingDiag ? 'animate-spin' : ''}`} />
                    <span>Atualizar</span>
                  </button>
                </div>

                <div className="space-y-2 text-xs">
                  <div className="flex items-start gap-2 text-slate-700">
                    <Lock className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <div>
                      <strong>Controle de Acesso por Perfil:</strong> Todas as tabelas institucionais (vistorias, barragens, empreendedores, medições, documentos) exigem sessão autenticada e ativa.
                    </div>
                  </div>

                  <div className="flex items-start gap-2 text-slate-700">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <div>
                      <strong>Segurança de Aplicação:</strong> O aplicativo nunca expõe credenciais administrativas ou de acesso irrestrito no navegador do usuário.
                    </div>
                  </div>

                  {supabaseDiag?.warnings && supabaseDiag.warnings.length > 0 && (
                    <div className="bg-slate-100 p-2.5 rounded-lg border border-slate-200 text-[11px] text-slate-700 space-y-1">
                      <span className="font-bold block">Status de Segurança:</span>
                      <ul className="list-disc list-inside space-y-0.5">
                        {supabaseDiag.warnings.map((w: string, idx: number) => (
                          <li key={idx}>{w}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {supabaseDiag?.ecosystemNodes && Array.isArray(supabaseDiag.ecosystemNodes) && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                      {supabaseDiag.ecosystemNodes.map((node: any) => (
                        <div key={node.sistema} className="p-2.5 rounded-lg border border-slate-200 bg-slate-50 text-[11px] space-y-0.5">
                          <div className="flex items-center justify-between gap-2 font-bold text-slate-800">
                            <span>{node.nomeExibicao}</span>
                            <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                              node.modoOperacao === 'remoto_ativo'
                                ? 'bg-emerald-100 text-emerald-800'
                                : node.modoOperacao === 'bloqueado_seguranca'
                                ? 'bg-rose-100 text-rose-800'
                                : 'bg-amber-100 text-amber-800'
                            }`}>
                              {node.modoOperacao === 'remoto_ativo'
                                ? 'Conectado'
                                : node.modoOperacao === 'bloqueado_seguranca'
                                ? 'Bloqueado'
                                : 'Operação Local'}
                            </span>
                          </div>
                          <p className="text-[10px] text-slate-500">{node.papel}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Módulo de Criptografia Anti-Invasão Hacker e Selo Anti-Plágio */}
              {(() => {
                const seal = createAuthenticitySeal(data, 'VISTORIA CSB/SEMA-MT');
                return (
                  <div className="border border-emerald-300 rounded-xl p-4 space-y-3 bg-emerald-50/40">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <ShieldCheck className="w-5 h-5 text-emerald-700" />
                        <h3 className="text-xs sm:text-sm font-bold text-emerald-950">
                          Criptografia Anti-Invasão & Selo Digital Anti-Plágio (CSB/SEMA-MT)
                        </h3>
                      </div>
                      <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-900 border border-emerald-300">
                        {seal.verificationCode}
                      </span>
                    </div>

                    <div className="space-y-2 text-xs">
                      <div className="bg-white p-3 rounded-lg border border-emerald-200 space-y-1.5 font-mono text-[11px]">
                        <div className="flex justify-between items-center text-slate-700">
                          <span className="font-semibold font-sans text-slate-500">Hash SHA-256 de Integridade:</span>
                          <span className="text-[10px] text-emerald-700 font-bold bg-emerald-50 px-1.5 py-0.5 rounded">Válido & Íntegro</span>
                        </div>
                        <p className="text-[10px] text-slate-800 break-all bg-slate-50 p-1.5 rounded border border-slate-200">
                          {seal.sha256Hash}
                        </p>
                        <div className="flex justify-between text-[10px] text-slate-500 pt-1 font-sans">
                          <span>Rastreabilidade: {seal.rastreabilidadeId}</span>
                          <span>Carimbo UTC: {seal.timestampFormatted}</span>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 font-sans">
                        <div className="flex items-start gap-1.5 text-[11px] text-slate-700">
                          <Lock className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                          <span><strong>Anti-Invasão:</strong> Proteção contra poluição de protótipo, injeção XSS e adulteração indevida de dados locais.</span>
                        </div>
                        <div className="flex items-start gap-1.5 text-[11px] text-slate-700">
                          <Scale className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                          <span><strong>Anti-Plágio:</strong> Garantia de fé pública conforme Arts. 297/299 do Código Penal Brasileiro e Lei 9.610/98.</span>
                        </div>
                      </div>

                      <div className="pt-2 border-t border-emerald-200 space-y-2">
                        <label className="block text-[11px] font-bold text-emerald-950">
                          Senha de Proteção AES-GCM 256-bit para Exportação (mín. 6 caracteres):
                        </label>
                        <div className="flex flex-col sm:flex-row gap-2">
                          <input
                            type="password"
                            value={exportPassphrase}
                            onChange={e => {
                              setExportPassphrase(e.target.value);
                              setExportError(null);
                              setExportSuccess(false);
                            }}
                            placeholder="Defina uma senha forte para este arquivo..."
                            className="flex-1 px-3 py-1.5 rounded-lg border border-emerald-300 bg-white text-xs text-slate-900 font-mono"
                          />
                          <button
                            type="button"
                            onClick={async () => {
                              setExportError(null);
                              setExportSuccess(false);
                              try {
                                await exportEncryptedInspectionToJson(data, exportPassphrase);
                                setExportSuccess(true);
                                setExportPassphrase('');
                              } catch (err: any) {
                                setExportError(err?.message || 'Erro ao exportar arquivo criptografado.');
                              }
                            }}
                            className="px-3 py-1.5 rounded-lg bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-xs cursor-pointer"
                            title="Exportar arquivo protegido com criptografia AES-GCM 256-bit"
                          >
                            <Lock className="w-3.5 h-3.5 text-emerald-300" />
                            <span>Exportar Cópia Criptografada</span>
                          </button>
                        </div>
                        {exportError && (
                          <p className="text-[11px] text-rose-700 font-semibold">{exportError}</p>
                        )}
                        {exportSuccess && (
                          <p className="text-[11px] text-emerald-800 font-semibold">Arquivo exportado e protegido com sucesso!</p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {/* TAB 4: PENDÊNCIAS DA VISTORIA ABERTA */}
          {activeTab === 'pendencias' && (
            <div className="space-y-4">
              <div className="border border-slate-200 rounded-xl p-4 space-y-3 bg-white">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-emerald-600" />
                    <h3 className="text-xs sm:text-sm font-bold text-slate-900">
                      Verificação Objetiva de Pendências da Vistoria Atual
                    </h3>
                  </div>
                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                    pendencias.length === 0 
                      ? 'bg-emerald-100 text-emerald-800' 
                      : 'bg-amber-100 text-amber-800'
                  }`}>
                    {pendencias.length === 0 ? 'Sem pendências críticas' : `${pendencias.length} item(ns) a revisar`}
                  </span>
                </div>

                <p className="text-xs text-slate-600">
                  Regra estrita: <strong>Nenhum documento deve preencher fatos, prazos ou obrigações que não foram expressamente apurados em campo ou validados pelo servidor.</strong>
                </p>

                {pendencias.length > 0 ? (
                  <ul className="text-xs text-amber-950 space-y-1 list-disc list-inside bg-amber-50/70 p-3 rounded-lg border border-amber-200 font-medium">
                    {pendencias.map((p, idx) => (
                      <li key={idx}>{p}</li>
                    ))}
                  </ul>
                ) : (
                  <div className="bg-emerald-50 p-3 rounded-lg border border-emerald-200 text-xs text-emerald-900 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>
                      Todos os campos fundamentais da identificação, coordenadas e equipe técnica foram preenchidos para esta vistoria.
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

        </div>

        {/* Modal Footer */}
        <div className="bg-slate-50 px-5 py-3 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <span className="text-[11px] text-slate-500">
            Fiscaliza CSB/SEMA-MT • Matriz de Governança Institucional 1.3.14
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-black text-white text-xs font-bold transition cursor-pointer"
          >
            Entendido / Fechar Painel
          </button>
        </div>
      </div>
    </div>
  );
};
