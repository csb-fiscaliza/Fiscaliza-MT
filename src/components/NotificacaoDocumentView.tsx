// ==============================================================================
// ARQUIVO: src/components/NotificacaoDocumentView.tsx
// Visualização fiel ao modelo SIGA AUTUAÇÃO SEMA-MT (2 Páginas)
// Recurso CONDICIONAL, com seleção de modelos distintos, validação sem inferência
// ==============================================================================

import React, { useState, useEffect, useRef } from 'react';
import { 
  BellRing, 
  RotateCcw, 
  Save, 
  Edit3, 
  Eye, 
  Settings2, 
  AlertTriangle, 
  CheckCircle2, 
  Printer, 
  Download, 
  Building2, 
  Clock, 
  Check, 
  ShieldCheck, 
  Scale, 
  Link2,
  Info
} from 'lucide-react';
import { InspectionData, NotificacaoModelType } from '../types/inspection';
import { NOTIFICATION_TEMPLATES } from '../config/notificationTemplates';
import { generateNotificacaoData, NotificacaoGeneratedStructure } from '../utils/notificacaoGenerator';

interface Props {
  data: InspectionData;
  onChange: (updater: (prev: InspectionData) => InspectionData) => void;
}

export const NotificacaoDocumentView: React.FC<Props> = ({ data, onChange }) => {
  const notif = data.conclusions.notificationDetails;
  const isEnabled = data.conclusions.requiresNotification;

  const [activeTab, setActiveTab] = useState<'visual' | 'editor' | 'parametros'>('visual');
  const [editorText, setEditorText] = useState<string>('');
  const [editorAuthor, setEditorAuthor] = useState<string>(
    data.generalInfo.inspectors[0]?.name || 'Servidor Fiscalizador CSB'
  );
  const [lastSavedInfo, setLastSavedInfo] = useState<{ timestamp: string; author: string } | null>(
    notif.dataRevisao ? { timestamp: notif.dataRevisao, author: notif.revisadoPor || 'Servidor' } : null
  );
  const [confirmRestore, setConfirmRestore] = useState(false);
  const [confirmDisable, setConfirmDisable] = useState(false);
  const [pendingModelType, setPendingModelType] = useState<NotificacaoModelType | null>(null);
  const [saveFeedback, setSaveFeedback] = useState<string | null>(null);
  const timersRef = useRef<number[]>([]);

  useEffect(() => {
    return () => {
      timersRef.current.forEach(t => window.clearTimeout(t));
    };
  }, []);

  // Gera dados estruturados e identifica pendências
  const generated: NotificacaoGeneratedStructure = generateNotificacaoData(data);

  // Inicializa o texto no editor
  useEffect(() => {
    if (data.drafts.notificationLetter && data.drafts.notificationLetter.trim() !== '') {
      setEditorText(data.drafts.notificationLetter);
    } else {
      setEditorText(generated.textoCompletoFormatado);
    }
  }, [data.id, notif.modelType, isEnabled]);

  // Atualizador auxiliar do estado de notificação
  const updateNotifField = (field: string, value: any) => {
    onChange(prev => {
      const updatedDetails = {
        ...prev.conclusions.notificationDetails,
        [field]: value
      };
      return {
        ...prev,
        conclusions: {
          ...prev.conclusions,
          notificationDetails: updatedDetails
        }
      };
    });
  };

  const updateDestinatario = (field: string, value: string) => {
    onChange(prev => ({
      ...prev,
      conclusions: {
        ...prev.conclusions,
        notificationDetails: {
          ...prev.conclusions.notificationDetails,
          destinatario: {
            ...prev.conclusions.notificationDetails.destinatario,
            [field]: value
          }
        }
      }
    }));
  };

  const handleSelectModel = (modelType: NotificacaoModelType) => {
    if (modelType === notif.modelType) return;
    if (!NOTIFICATION_TEMPLATES[modelType]) return;
    setPendingModelType(modelType);
  };

  const confirmSelectModel = () => {
    if (!pendingModelType) return;
    const modelType = pendingModelType;
    const tmpl = NOTIFICATION_TEMPLATES[modelType];
    setPendingModelType(null);
    if (!tmpl) return;

    onChange(prev => {
      const updatedDetails = {
        ...prev.conclusions.notificationDetails,
        modelType,
        modelTitle: tmpl.title,
        objetivo: tmpl.defaultObjetivo,
        // Não define prazo automaticamente sem consentimento explícito
        prazoDias: prev.conclusions.notificationDetails.prazoDias || tmpl.sugestaoPrazoDias,
        solicitacoesTexto: tmpl.defaultSolicitacoes,
        observacoesGeraisTexto: tmpl.defaultObservacoesGerais,
        referenciasNormativas: tmpl.referenciasNormativas.map(r => ({ ...r }))
      };

      const freshData = {
        ...prev,
        conclusions: {
          ...prev.conclusions,
          notificationDetails: updatedDetails
        }
      };

      const freshGen = generateNotificacaoData(freshData);
      setEditorText(freshGen.textoCompletoFormatado);

      return {
        ...freshData,
        drafts: {
          ...prev.drafts,
          notificationLetter: freshGen.textoCompletoFormatado
        }
      };
    });
  };

  const toggleLegalRef = (refId: string) => {
    const refs = notif.referenciasNormativas || [];
    const updated = refs.map(r => r.id === refId ? { ...r, ativo: !r.ativo } : r);
    updateNotifField('referenciasNormativas', updated);
  };

  const handleRestoreBase = () => {
    if (!confirmRestore) {
      setConfirmRestore(true);
      const t = window.setTimeout(() => setConfirmRestore(false), 4000);
      timersRef.current.push(t);
      return;
    }
    setConfirmRestore(false);
    const freshGen = generateNotificacaoData(data);
    setEditorText(freshGen.textoCompletoFormatado);
    onChange(prev => ({
      ...prev,
      drafts: {
        ...prev.drafts,
        notificationLetter: freshGen.textoCompletoFormatado
      }
    }));
  };

  const handleSaveFinal = () => {
    const nowStr = new Date().toLocaleString('pt-BR');
    onChange(prev => ({
      ...prev,
      conclusions: {
        ...prev.conclusions,
        notificationDetails: {
          ...prev.conclusions.notificationDetails,
          revisadoPor: editorAuthor,
          dataRevisao: nowStr
        }
      },
      drafts: {
        ...prev.drafts,
        notificationLetter: editorText
      }
    }));

    setLastSavedInfo({
      timestamp: nowStr,
      author: editorAuthor
    });
    setSaveFeedback('Minuta de Notificação salva e associada com sucesso ao registro da vistoria.');
    const t = window.setTimeout(() => setSaveFeedback(null), 4500);
    timersRef.current.push(t);
  };

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadTxt = () => {
    const filename = `NOTIFICACAO_SEMA_${data.damIdentification.damName || 'BARRAGEM'}_${notif.numeroNotificacao || 'MINUTA'}.txt`;
    const blob = new Blob([editorText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleEnableNotification = () => {
    onChange(prev => ({
      ...prev,
      conclusions: {
        ...prev.conclusions,
        requiresNotification: true
      }
    }));
  };

  const handleDisableNotification = () => {
    if (!confirmDisable) {
      setConfirmDisable(true);
      const t = window.setTimeout(() => setConfirmDisable(false), 4000);
      timersRef.current.push(t);
      return;
    }
    setConfirmDisable(false);
    onChange(prev => ({
      ...prev,
      conclusions: {
        ...prev.conclusions,
        requiresNotification: false
      }
    }));
  };

  // Se a notificação não foi indicada como necessária pelo servidor
  if (!isEnabled) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center space-y-5 shadow-xs">
        <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto text-slate-400">
          <BellRing className="w-8 h-8" />
        </div>
        <div className="max-w-md mx-auto space-y-2">
          <h3 className="text-base font-bold text-slate-800">
            Notificação Não Solicitada para Esta Vistoria
          </h3>
          <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
            A Notificação Técnica da CSB/SEMA-MT é um recurso rigorosamente <strong>condicional</strong> e não constitui saída obrigatória. Conforme registrado no parecer da vistoria, não foram fixadas ordens formais com prazo nesta data.
          </p>
        </div>

        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-900 max-w-lg mx-auto text-left flex items-start gap-3">
          <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
          <div>
            <span className="font-bold block">Documentos Oficiais Gerados para Esta Vistoria:</span>
            <span>O <strong>Auto de Inspeção de Campo</strong> e o <strong>Relatório Técnico de Vistoria</strong> permanecem plenamente disponíveis para revisão, conferência e exportação.</span>
          </div>
        </div>

        <button
          type="button"
          onClick={handleEnableNotification}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-900 text-white font-medium text-xs sm:text-sm shadow-sm transition cursor-pointer"
        >
          <BellRing className="w-4 h-4 text-amber-400" />
          <span>Ativar e Elaborar Minuta de Notificação Formal</span>
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Barra de Status e Controles Superiores */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                <BellRing className="w-3 h-3 text-amber-700" />
                Documento Condicional Ativo
              </span>
              <span className="text-xs text-slate-500">
                Modelo: <strong>{NOTIFICATION_TEMPLATES[notif.modelType]?.title || notif.modelTitle}</strong>
              </span>
            </div>
            <h2 className="text-base sm:text-lg font-black text-slate-900 mt-1">
              Minuta de Notificação Técnica (SIGA AUTUAÇÃO)
            </h2>
          </div>

          {/* Botões de Ação */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleDisableNotification}
              className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition cursor-pointer ${
                confirmDisable
                  ? 'border-red-600 bg-red-600 text-white font-bold'
                  : 'border-red-200 text-red-700 hover:bg-red-50'
              }`}
              title="Dispensar Notificação"
            >
              {confirmDisable ? 'Confirmar Dispensa?' : 'Dispensar Notificação'}
            </button>

            <button
              type="button"
              onClick={handleRestoreBase}
              className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition flex items-center gap-1.5 cursor-pointer ${
                confirmRestore
                  ? 'border-amber-500 bg-amber-50 text-amber-800 font-bold'
                  : 'border-slate-200 text-slate-700 hover:bg-slate-100'
              }`}
              title="Restaurar dados do modelo e formulário"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span className={confirmRestore ? 'inline' : 'hidden sm:inline'}>
                {confirmRestore ? 'Confirmar Restauração?' : 'Restaurar Base'}
              </span>
            </button>

            <button
              type="button"
              onClick={handleDownloadTxt}
              className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-100 font-medium transition flex items-center gap-1.5 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Baixar TXT</span>
            </button>

            <button
              type="button"
              onClick={handlePrint}
              className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-100 font-medium transition flex items-center gap-1.5 cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Imprimir</span>
            </button>

            <button
              type="button"
              onClick={handleSaveFinal}
              className="text-xs px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold transition flex items-center gap-1.5 shadow-xs cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Salvar Minuta</span>
            </button>
          </div>
        </div>

        {/* Abas de Navegação Interna */}
        <div className="flex border-b border-slate-200 mt-4 gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('visual')}
            className={`flex items-center gap-2 pb-2.5 px-3 text-xs sm:text-sm font-bold border-b-2 transition cursor-pointer ${
              activeTab === 'visual'
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Eye className="w-4 h-4" />
            <span>Visualização Oficial (2 Páginas SIGA)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('parametros')}
            className={`flex items-center gap-2 pb-2.5 px-3 text-xs sm:text-sm font-bold border-b-2 transition cursor-pointer ${
              activeTab === 'parametros'
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Settings2 className="w-4 h-4" />
            <span>Revisar Destinatário, Prazos & Normas</span>
            {generated.camposPendentes.length > 0 && (
              <span className="w-5 h-5 rounded-full bg-amber-500 text-white text-[10px] flex items-center justify-center font-bold">
                {generated.camposPendentes.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('editor')}
            className={`flex items-center gap-2 pb-2.5 px-3 text-xs sm:text-sm font-bold border-b-2 transition cursor-pointer ${
              activeTab === 'editor'
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Edit3 className="w-4 h-4" />
            <span>Editor de Texto Livre</span>
          </button>
        </div>
      </div>

      {/* Alerta de Auditoria / Último Salvamento */}
      {saveFeedback && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2.5 text-xs text-emerald-800 font-semibold print:hidden">
          {saveFeedback}
        </div>
      )}
      {pendingModelType && NOTIFICATION_TEMPLATES[pendingModelType] && (
        <div className="bg-amber-50 border border-amber-300 rounded-xl px-4 py-3 text-xs text-amber-950 flex flex-wrap items-center justify-between gap-2 print:hidden">
          <span>
            Alterar para <strong>{NOTIFICATION_TEMPLATES[pendingModelType].title}</strong>? O objetivo, solicitações e referências normativas serão carregados do modelo selecionado.
          </span>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setPendingModelType(null)}
              className="px-3 py-1 rounded-lg bg-white border border-slate-300 text-slate-700 font-semibold cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={confirmSelectModel}
              className="px-3 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold cursor-pointer"
            >
              Confirmar Troca
            </button>
          </div>
        </div>
      )}
      {lastSavedInfo && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2.5 text-xs text-emerald-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>
              Última versão salva e associada à vistoria em <strong>{lastSavedInfo.timestamp}</strong> por <strong>{lastSavedInfo.author}</strong>.
            </span>
          </div>
          <span className="text-[11px] text-emerald-700">Rastreabilidade CSB/SEMA</span>
        </div>
      )}

      {/* Alerta de Campos Pendentes de Revisão Humana (NÃO INVENTAR DADOS!) */}
      {generated.camposPendentes.length > 0 && (
        <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 text-amber-950 space-y-2">
          <div className="flex items-center gap-2 font-bold text-xs sm:text-sm text-amber-900">
            <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
            <span>Atenção: Existem dados essenciais pendentes de revisão ou confirmação pelo fiscal:</span>
          </div>
          <p className="text-xs text-amber-800">
            Em observância às diretrizes da SEMA-MT, o sistema <strong>não preenche nem infere dados ausentes</strong> por aproximação. Revise e confirme os campos antes de gerar a versão final para autuação.
          </p>
          <ul className="text-xs text-amber-900 list-disc list-inside grid grid-cols-1 md:grid-cols-2 gap-1 pt-1 font-medium">
            {generated.camposPendentes.map((campo, idx) => (
              <li key={idx} className="truncate">{campo}</li>
            ))}
          </ul>
        </div>
      )}

      {/* ========================================================================= */}
      {/* ABA 1: VISUALIZAÇÃO OFICIAL TIMBRADA (2 PÁGINAS SIGA AUTUAÇÃO)           */}
      {/* ========================================================================= */}
      {activeTab === 'visual' && (
        <div className="space-y-6">
          {/* Seletor Rápido de Modelo */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex flex-wrap items-center justify-between gap-3 text-xs">
            <span className="text-slate-600 font-medium">
              Finalidade desta Notificação:
            </span>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(NOTIFICATION_TEMPLATES) as NotificacaoModelType[]).map(key => {
                const tmpl = NOTIFICATION_TEMPLATES[key];
                const isSelected = notif.modelType === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => handleSelectModel(key)}
                    className={`px-3 py-1.5 rounded-lg font-semibold transition cursor-pointer ${
                      isSelected
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-100'
                    }`}
                  >
                    {tmpl.title.split(':')[0]} ({key === 'modelo_1_cadastro_classificacao' ? 'Cadastro/Classificação' : key === 'modelo_2_anomalias_seguranca' ? 'Obras/Anomalias/ART' : 'Personalizado'})
                  </button>
                );
              })}
            </div>
          </div>

          {/* FOLHA 1 - TIMBRADA SIGA AUTUAÇÃO */}
          <div className="document-sheet-scroll rounded-lg print:overflow-visible">
          <div className="bg-white border border-slate-300 shadow-md p-4 xs:p-6 sm:p-10 font-sans text-slate-900 space-y-4 min-w-[600px] sm:min-w-0 max-w-4xl mx-auto rounded-lg">
            {/* Cabeçalho Oficial com Brasão SEMA */}
            <div className="flex flex-col items-center justify-center text-center border-b border-slate-300 pb-3">
              <div className="w-12 h-12 mb-1 flex items-center justify-center text-slate-700">
                <Building2 className="w-10 h-10 text-slate-800" />
              </div>
              <h1 className="text-xs sm:text-sm font-bold tracking-tight uppercase">
                Governo do Estado de Mato Grosso
              </h1>
              <h2 className="text-xs font-semibold text-slate-700 uppercase">
                SEMA - Secretaria de Estado de Meio Ambiente
              </h2>
            </div>

            {/* Caixa Título NOTIFICAÇÃO | Nº | DATA */}
            <div className="grid grid-cols-12 border-2 border-black divide-x-2 divide-black text-center font-bold">
              <div className="col-span-6 sm:col-span-7 py-2.5 text-base sm:text-xl tracking-wider uppercase flex items-center justify-center">
                NOTIFICAÇÃO
              </div>
              <div className="col-span-3 sm:col-span-3 py-1 flex flex-col justify-center">
                <span className="text-[10px] uppercase font-bold text-slate-600">Nº:</span>
                <span className="text-xs sm:text-sm text-black font-extrabold">{generated.numeroNotificacao}</span>
              </div>
              <div className="col-span-3 sm:col-span-2 py-1 flex flex-col justify-center">
                <span className="text-[10px] uppercase font-bold text-slate-600">DATA:</span>
                <span className="text-xs sm:text-sm text-black font-extrabold">{generated.dataEmissaoFormatada}</span>
              </div>
            </div>

            {/* Bloco 1: Destinatário / Endereço para correspondências */}
            <div className="border border-black text-[11px] leading-tight divide-y divide-black">
              <div className="grid grid-cols-12 divide-x divide-black p-1 bg-slate-50">
                <div className="col-span-8 px-1.5 py-0.5">
                  <span className="block font-bold text-[9px] uppercase text-slate-600">NOME / RAZÃO SOCIAL:</span>
                  <span className="font-bold text-slate-900">{generated.destinatario.nomeRazaoSocial || '[PENDENTE DE REVISÃO]'}</span>
                </div>
                <div className="col-span-4 px-1.5 py-0.5">
                  <span className="block font-bold text-[9px] uppercase text-slate-600">CNPJ / CPF:</span>
                  <span className="font-bold text-slate-900">{generated.destinatario.cpfCnpj || '[PENDENTE DE REVISÃO]'}</span>
                </div>
              </div>

              <div className="p-1 px-1.5 bg-slate-100 font-bold uppercase text-[9px] text-slate-700">
                ENDEREÇO PARA CORRESPONDÊNCIAS:
              </div>

              <div className="p-1 px-1.5 font-medium">
                {generated.destinatario.endereco || '[PENDENTE DE REVISÃO: Logradouro]'}
              </div>

              <div className="grid grid-cols-12 divide-x divide-black p-1 text-[10px]">
                <div className="col-span-3 px-1.5 py-0.5">
                  <span className="block font-bold text-[9px] text-slate-600 uppercase">Número:</span>
                  <span>{generated.destinatario.numero || 'S/N'}</span>
                </div>
                <div className="col-span-5 px-1.5 py-0.5">
                  <span className="block font-bold text-[9px] text-slate-600 uppercase">Complemento:</span>
                  <span>{generated.destinatario.complemento || '-'}</span>
                </div>
                <div className="col-span-4 px-1.5 py-0.5">
                  <span className="block font-bold text-[9px] text-slate-600 uppercase">Bairro:</span>
                  <span>{generated.destinatario.bairro || '[PENDENTE]'}</span>
                </div>
              </div>

              <div className="grid grid-cols-12 divide-x divide-black p-1 text-[10px]">
                <div className="col-span-2 px-1.5 py-0.5">
                  <span className="block font-bold text-[9px] text-slate-600 uppercase">UF:</span>
                  <span>{generated.destinatario.uf || 'MT'}</span>
                </div>
                <div className="col-span-4 px-1.5 py-0.5">
                  <span className="block font-bold text-[9px] text-slate-600 uppercase">MUNICÍPIO:</span>
                  <span className="font-bold">{generated.destinatario.municipio || '[PENDENTE]'}</span>
                </div>
                <div className="col-span-3 px-1.5 py-0.5">
                  <span className="block font-bold text-[9px] text-slate-600 uppercase">CEP:</span>
                  <span>{generated.destinatario.cep || '[PENDENTE]'}</span>
                </div>
                <div className="col-span-3 px-1.5 py-0.5">
                  <span className="block font-bold text-[9px] text-slate-600 uppercase">TELEFONE:</span>
                  <span>{generated.destinatario.telefone || 'Não informado'}</span>
                </div>
              </div>
            </div>

            {/* Bloco 2: Local da Ocorrência */}
            <div className="border border-black text-[11px] leading-tight divide-y divide-black">
              <div className="p-1 px-1.5 bg-slate-200 font-extrabold uppercase text-[10px] text-black">
                Local da Ocorrência
              </div>

              <div className="grid grid-cols-12 divide-x divide-black p-1">
                <div className="col-span-8 px-1.5 py-0.5">
                  <span className="block font-bold text-[9px] uppercase text-slate-600">NOME FANTASIA:</span>
                  <span className="font-bold">{generated.localOcorrencia.nomeFantasia || '[PENDENTE DE REVISÃO]'}</span>
                </div>
                <div className="col-span-4 px-1.5 py-0.5">
                  <span className="block font-bold text-[9px] uppercase text-slate-600">ATIVIDADE:</span>
                  <span className="font-bold">{generated.localOcorrencia.atividade || 'Barragem'}</span>
                </div>
              </div>

              <div className="grid grid-cols-12 divide-x divide-black p-1 text-[10px]">
                <div className="col-span-4 px-1.5 py-0.5">
                  <span className="block font-bold text-[9px] uppercase text-slate-600">COORDENADAS GEOGRÁFICAS:</span>
                  <span className="font-semibold">{generated.localOcorrencia.coordenadasDatum}</span>
                </div>
                <div className="col-span-4 px-1.5 py-0.5">
                  <span className="block font-bold text-[9px] uppercase text-slate-600">LATITUDE ( S ):</span>
                  <span className="font-mono">{generated.localOcorrencia.latitudeDecimal}</span>
                </div>
                <div className="col-span-4 px-1.5 py-0.5">
                  <span className="block font-bold text-[9px] uppercase text-slate-600">LONGITUDE ( W ):</span>
                  <span className="font-mono">{generated.localOcorrencia.longitudeDecimal}</span>
                </div>
              </div>

              <div className="grid grid-cols-12 divide-x divide-black p-1">
                <div className="col-span-8 px-1.5 py-0.5">
                  <span className="block font-bold text-[9px] uppercase text-slate-600">ENDEREÇO DO EMPREENDIMENTO:</span>
                  <span>{generated.localOcorrencia.enderecoEmpreendimento || '[PENDENTE DE REVISÃO]'}</span>
                </div>
                <div className="col-span-4 px-1.5 py-0.5">
                  <span className="block font-bold text-[9px] uppercase text-slate-600">ÁREA DO EMPREENDIMENTO:</span>
                  <span>{generated.localOcorrencia.areaEmpreendimento || 'Não informada'}</span>
                </div>
              </div>

              <div className="grid grid-cols-12 divide-x divide-black p-1 text-[10px]">
                <div className="col-span-2 px-1.5 py-0.5">
                  <span className="block font-bold text-[9px] uppercase text-slate-600">UF:</span>
                  <span>{generated.localOcorrencia.uf}</span>
                </div>
                <div className="col-span-4 px-1.5 py-0.5">
                  <span className="block font-bold text-[9px] uppercase text-slate-600">MUNICÍPIO:</span>
                  <span className="font-bold">{generated.localOcorrencia.municipio || '[PENDENTE]'}</span>
                </div>
                <div className="col-span-3 px-1.5 py-0.5">
                  <span className="block font-bold text-[9px] uppercase text-slate-600">CEP:</span>
                  <span>{generated.localOcorrencia.cep || 'Não informado'}</span>
                </div>
                <div className="col-span-3 px-1.5 py-0.5">
                  <span className="block font-bold text-[9px] uppercase text-slate-600">TELEFONE:</span>
                  <span>{generated.localOcorrencia.telefone || 'Não informado'}</span>
                </div>
              </div>
            </div>

            {/* Bloco 3: Processo e Prazo de Vencimento */}
            <div className="grid grid-cols-12 border border-black divide-x divide-black text-[11px]">
              <div className="col-span-6 px-2 py-1.5">
                <span className="block font-bold text-[9px] uppercase text-slate-600">Nº DO PROCESSO:</span>
                <span className="font-bold">{generated.vinculosEProcesso.numeroProcesso || '[PENDENTE DE REVISÃO]'}</span>
              </div>
              <div className="col-span-6 px-2 py-1.5 bg-amber-50/50">
                <span className="block font-bold text-[9px] uppercase text-slate-700">PRAZO DE VENCIMENTO (DIAS):</span>
                <span className="font-extrabold text-xs text-amber-900">
                  {generated.vinculosEProcesso.prazoDias ? `${generated.vinculosEProcesso.prazoDias} dias corridos` : '[PENDENTE DE DEFINIÇÃO PELO FISCAL]'}
                </span>
              </div>
            </div>

            {/* Bloco 4: Objetivo */}
            <div className="border border-black p-2 text-[11px]">
              <span className="block font-bold text-[9px] uppercase text-slate-600 mb-0.5">OBJETIVO:</span>
              <p className="font-semibold text-slate-900 leading-snug">
                {generated.objetivo || '[PENDENTE DE DEFINIÇÃO]'}
              </p>
            </div>

            {/* Bloco 5: NOTIFICAÇÃO (Determinações e Exigências com Vínculo ao Auto) */}
            <div className="border border-black text-[11px] leading-relaxed">
              <div className="p-1 px-2 bg-slate-200 font-extrabold uppercase text-[10px] text-black">
                NOTIFICAÇÃO:
              </div>
              <div className="p-2.5 whitespace-pre-line text-justify text-slate-900">
                {generated.solicitacoesTexto}
              </div>
            </div>

            {/* Bloco 6: OBSERVAÇÕES GERAIS */}
            <div className="border border-black text-[11px] leading-relaxed">
              <div className="p-1 px-2 bg-slate-200 font-extrabold uppercase text-[10px] text-black">
                OBSERVAÇÕES GERAIS:
              </div>
              <div className="p-2.5 whitespace-pre-line text-justify text-slate-900">
                {generated.observacoesGeraisTexto}
              </div>
            </div>

            {/* Alerta de Desobediência (Artigo 330 CP e Art. 80 Dec 6.514/2008) */}
            {generated.advertenciaDesobedienciaTexto && (
              <div className="border-2 border-black p-2 bg-slate-100 text-center font-bold text-[10px] sm:text-[11px] text-black uppercase leading-tight tracking-tight">
                {generated.advertenciaDesobedienciaTexto}
              </div>
            )}

            {/* Canal de Atendimento SIGA-AUTUAÇÃO */}
            <div className="border border-black p-2 bg-slate-50 text-center text-[10px] font-semibold text-slate-900">
              {generated.canalAtendimentoTexto}
            </div>

            {/* Rodapé Página 1 */}
            <div className="flex justify-between items-center text-[9px] text-slate-500 pt-2 border-t border-slate-200 font-mono">
              <span>Versão do sistema: {generated.versaoSistema}</span>
              <span>{generated.numeroNotificacao} Notificação</span>
              <span>{generated.sistemaEmissor}</span>
              <span className="font-bold text-black">Página 1 de 2</span>
            </div>
          </div>
          </div>

          {/* FOLHA 2 - ASSINATURAS E CONFIRMAÇÃO DE RECEBIMENTO */}
          <div className="document-sheet-scroll rounded-lg print:overflow-visible">
          <div className="bg-white border border-slate-300 shadow-md p-4 xs:p-6 sm:p-10 font-sans text-slate-900 space-y-6 min-w-[600px] sm:min-w-0 max-w-4xl mx-auto rounded-lg">
            {/* Cabeçalho Página 2 */}
            <div className="flex flex-col items-center justify-center text-center border-b border-slate-300 pb-3">
              <div className="w-10 h-10 mb-1 flex items-center justify-center text-slate-700">
                <Building2 className="w-8 h-8 text-slate-800" />
              </div>
              <h1 className="text-xs sm:text-sm font-bold tracking-tight uppercase">
                Governo do Estado de Mato Grosso
              </h1>
              <h2 className="text-xs font-semibold text-slate-700 uppercase">
                SEMA - Secretaria de Estado de Meio Ambiente
              </h2>
            </div>

            {/* Bloco de Assinaturas dos Servidores Notificantes */}
            <div className="pt-4 space-y-6">
              <span className="text-[10px] uppercase font-bold text-slate-600 block">
                EQUIPE TÉCNICA DE FISCALIZAÇÃO NOTIFICANTE (CSB/SEMA-MT):
              </span>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 pt-2">
                {generated.equipeFiscalizacao.map((eq, idx) => (
                  <div key={idx} className="text-center space-y-1">
                    <div className="border-b border-black w-4/5 mx-auto pb-0.5">
                      <span className="text-xs font-bold text-black">{eq.nome}</span>
                    </div>
                    <span className="text-[10px] uppercase text-slate-700 font-semibold block">{eq.cargo}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Bloco de Confirmação de Recebimento */}
            <div className="border-2 border-black divide-y-2 divide-black text-[11px] mt-8">
              <div className="p-1.5 bg-slate-200 font-extrabold uppercase text-[11px] text-black">
                CONFIRMAÇÃO DE RECEBIMENTO:
              </div>

              <div className="grid grid-cols-12 divide-x divide-black p-1.5">
                <div className="col-span-8 px-1">
                  <span className="block font-bold text-[9px] uppercase text-slate-600">NOME DO RESPONSÁVEL:</span>
                  <span className="font-extrabold text-slate-900">
                    {notif.modoConfirmacaoRecebimento === 'enviado_por_ar' 
                      ? 'ENVIADO POR AR' 
                      : (notif.responsavelRecebimentoNome || '[A preencher no ato da entrega]')}
                  </span>
                </div>
                <div className="col-span-4 px-1">
                  <span className="block font-bold text-[9px] uppercase text-slate-600">CPF/RG:</span>
                  <span>{notif.responsavelRecebimentoDocumento || '___________________________'}</span>
                </div>
              </div>

              <div className="grid grid-cols-12 divide-x divide-black p-1.5">
                <div className="col-span-3 px-1">
                  <span className="block font-bold text-[9px] uppercase text-slate-600">CARGO:</span>
                  <span>{notif.responsavelRecebimentoCargo || '___________________________'}</span>
                </div>
                <div className="col-span-4 px-1">
                  <span className="block font-bold text-[9px] uppercase text-slate-600">LOCAL E DATA:</span>
                  <span>{notif.responsavelRecebimentoLocalData || '____/____/2026'}</span>
                </div>
                <div className="col-span-5 px-1">
                  <span className="block font-bold text-[9px] uppercase text-slate-600">ASSINATURA:</span>
                  <span className="text-[10px] text-slate-500">_________________________________</span>
                </div>
              </div>

              <div className="p-2 text-[10px] font-semibold text-slate-800 flex items-center gap-2">
                <input
                  type="checkbox"
                  id="chkRecusouAssinar"
                  checked={notif.modoConfirmacaoRecebimento === 'recusou_assinar'}
                  onChange={e => updateNotifField('modoConfirmacaoRecebimento', e.target.checked ? 'recusou_assinar' : 'presencial')}
                  className="w-4 h-4 text-emerald-600 rounded"
                />
                <label htmlFor="chkRecusouAssinar" className="cursor-pointer">
                  Recusou-se a assinar (Registro circunstanciado pela equipe no local)
                </label>
              </div>
            </div>

            {/* Rodapé Página 2 */}
            <div className="flex justify-between items-center text-[9px] text-slate-500 pt-8 border-t border-slate-200 font-mono">
              <span>Versão do sistema: {generated.versaoSistema}</span>
              <span>{generated.numeroNotificacao} Notificação</span>
              <span>{generated.sistemaEmissor}</span>
              <span className="font-bold text-black">Página 2 de 2</span>
            </div>
          </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* ABA 2: REVISÃO DE DESTINATÁRIO, VÍNCULOS, PRAZOS E REFERÊNCIAS NORMATIVAS */}
      {/* ========================================================================= */}
      {activeTab === 'parametros' && (
        <div className="space-y-6">
          {/* Card: Seleção de Modelo e Finalidade */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
              <Scale className="w-5 h-5 text-emerald-600" />
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide">
                1. Escolha do Modelo de Finalidade da Notificação
              </h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {(Object.keys(NOTIFICATION_TEMPLATES) as NotificacaoModelType[]).map(key => {
                const tmpl = NOTIFICATION_TEMPLATES[key];
                const isSelected = notif.modelType === key;
                return (
                  <div
                    key={key}
                    onClick={() => handleSelectModel(key)}
                    className={`p-4 rounded-xl border-2 transition cursor-pointer flex flex-col justify-between ${
                      isSelected
                        ? 'border-emerald-600 bg-emerald-50/40 shadow-xs'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className={`text-xs font-black uppercase ${isSelected ? 'text-emerald-800' : 'text-slate-700'}`}>
                          {tmpl.title.split(':')[0]}
                        </span>
                        {isSelected && <Check className="w-4 h-4 text-emerald-600" />}
                      </div>
                      <h4 className="text-xs font-bold text-slate-900">
                        {tmpl.title.split(':')[1]?.trim() || tmpl.title}
                      </h4>
                      <p className="text-[11px] text-slate-600 leading-relaxed">
                        {tmpl.shortDescription}
                      </p>
                    </div>

                    <div className="mt-3 pt-2 border-t border-slate-100 text-[10px] text-slate-500">
                      Sugestão de prazo base: <strong>{tmpl.sugestaoPrazoDias} dias</strong> (revisável)
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Card: Vínculos com Auto de Inspeção e Processo Administrativo */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
              <Link2 className="w-5 h-5 text-emerald-600" />
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide">
                2. Vínculo Administrativo com a Vistoria e Processo
              </h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Vínculo com Auto de Inspeção Nº:
                </label>
                <input
                  type="text"
                  placeholder="ex: 13503000126"
                  value={notif.vinculoAutoInspecaoNumero}
                  onChange={e => updateNotifField('vinculoAutoInspecaoNumero', e.target.value)}
                  className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 bg-white"
                />
                <span className="text-[10px] text-slate-500 mt-1 block">
                  Número do Auto de Inspeção lavrado pela equipe em campo.
                </span>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Nº do Processo Administrativo (SEMA):
                </label>
                <input
                  type="text"
                  placeholder="ex: 3592/2022"
                  value={notif.processoNumero}
                  onChange={e => updateNotifField('processoNumero', e.target.value)}
                  className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 bg-white"
                />
                <span className="text-[10px] text-slate-500 mt-1 block">
                  Processo no SIGA / SEMA relacionado à barragem.
                </span>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Nº Oficial da Notificação (SIGA AUTUAÇÃO):
                </label>
                <input
                  type="text"
                  placeholder="ex: 13503000326"
                  value={notif.numeroNotificacao}
                  onChange={e => updateNotifField('numeroNotificacao', e.target.value)}
                  className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 bg-white"
                />
                <span className="text-[10px] text-slate-500 mt-1 block">
                  Identificador alfanumérico gerado pelo sistema corporativo.
                </span>
              </div>
            </div>
          </div>

          {/* Card: Revisão do Destinatário e Endereço de Correspondência */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
              <Building2 className="w-5 h-5 text-emerald-600" />
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide">
                3. Identificação e Endereço do Notificado
              </h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Nome / Razão Social do Notificado:
                </label>
                <input
                  type="text"
                  placeholder="Nome do proprietário, empresa ou órgão público"
                  value={notif.destinatario?.nomeRazaoSocial || ''}
                  onChange={e => updateDestinatario('nomeRazaoSocial', e.target.value)}
                  className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  CNPJ / CPF do Notificado:
                </label>
                <input
                  type="text"
                  placeholder="00.000.000/0001-00 ou 000.000.000-00"
                  value={notif.destinatario?.cpfCnpj || ''}
                  onChange={e => updateDestinatario('cpfCnpj', e.target.value)}
                  className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 bg-white"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Endereço para Correspondências (Logradouro):
                </label>
                <input
                  type="text"
                  placeholder="Avenida / Rua / Rodovia..."
                  value={notif.destinatario?.enderecoCorrespondencia || ''}
                  onChange={e => updateDestinatario('enderecoCorrespondencia', e.target.value)}
                  className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Número:
                </label>
                <input
                  type="text"
                  placeholder="ex: 2350 ou S/N"
                  value={notif.destinatario?.numero || ''}
                  onChange={e => updateDestinatario('numero', e.target.value)}
                  className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 bg-white"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Complemento:</label>
                <input
                  type="text"
                  placeholder="ex: Anexo ao Paço"
                  value={notif.destinatario?.complemento || ''}
                  onChange={e => updateDestinatario('complemento', e.target.value)}
                  className="w-full text-xs p-2 border border-slate-300 rounded-lg bg-white"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Bairro:</label>
                <input
                  type="text"
                  placeholder="Bairro"
                  value={notif.destinatario?.bairro || ''}
                  onChange={e => updateDestinatario('bairro', e.target.value)}
                  className="w-full text-xs p-2 border border-slate-300 rounded-lg bg-white"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Município:</label>
                <input
                  type="text"
                  placeholder="Município"
                  value={notif.destinatario?.municipio || ''}
                  onChange={e => updateDestinatario('municipio', e.target.value)}
                  className="w-full text-xs p-2 border border-slate-300 rounded-lg bg-white"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">CEP / Telefone:</label>
                <input
                  type="text"
                  placeholder="78000-000 / (65)..."
                  value={notif.destinatario?.cep || ''}
                  onChange={e => updateDestinatario('cep', e.target.value)}
                  className="w-full text-xs p-2 border border-slate-300 rounded-lg bg-white"
                />
              </div>
            </div>
          </div>

          {/* Card: Fixação Explícita de Prazo e Objetivo (NUNCA AUTOMÁTICO!) */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
              <Clock className="w-5 h-5 text-emerald-600" />
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide">
                4. Fixação de Prazo e Objetivo Formal
              </h3>
            </div>

            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 flex items-start gap-2">
              <Info className="w-4 h-4 text-amber-700 mt-0.5 shrink-0" />
              <span>
                <strong>Regra de Rigor Técnico:</strong> O prazo assinalado nunca é aplicado compulsoriamente. Deve ser avaliado e confirmado pelo servidor fiscalizador conforme a gravidade da situação fática.
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Prazo de Atendimento (Dias Corridos):
                </label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    min="1"
                    max="180"
                    placeholder="ex: 90 ou 30"
                    value={notif.prazoDias}
                    onChange={e => updateNotifField('prazoDias', e.target.value)}
                    className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 bg-white font-bold"
                  />
                  <div className="flex gap-1">
                    {['15', '30', '60', '90'].map(d => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => updateNotifField('prazoDias', d)}
                        className={`px-2 py-1 text-[11px] rounded border transition cursor-pointer ${
                          notif.prazoDias === d 
                            ? 'bg-emerald-600 text-white border-emerald-600 font-bold' 
                            : 'bg-slate-50 text-slate-700 border-slate-300 hover:bg-slate-100'
                        }`}
                      >
                        {d}d
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Objetivo Resumido da Notificação:
                </label>
                <input
                  type="text"
                  placeholder="ex: Notificação para novo cadastro e classificação do DPA e CRI..."
                  value={notif.objetivo}
                  onChange={e => updateNotifField('objetivo', e.target.value)}
                  className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 bg-white font-medium"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Texto das Determinações / Exigências (Cláusulas da Notificação):
              </label>
              <textarea
                rows={6}
                value={notif.solicitacoesTexto || NOTIFICATION_TEMPLATES[notif.modelType]?.defaultSolicitacoes}
                onChange={e => updateNotifField('solicitacoesTexto', e.target.value)}
                className="w-full text-xs p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 bg-white font-mono leading-relaxed"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Observações Gerais e Orientações de Monitoramento:
              </label>
              <textarea
                rows={4}
                value={notif.observacoesGeraisTexto || NOTIFICATION_TEMPLATES[notif.modelType]?.defaultObservacoesGerais}
                onChange={e => updateNotifField('observacoesGeraisTexto', e.target.value)}
                className="w-full text-xs p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 bg-white font-mono leading-relaxed"
              />
            </div>
          </div>

          {/* Card: Revisão de Referências Normativas e Advertências */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
              <Scale className="w-5 h-5 text-emerald-600" />
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide">
                5. Referências Normativas e Advertências Legais
              </h3>
            </div>

            <div className="space-y-3">
              {(notif.referenciasNormativas || []).map(ref => (
                <div 
                  key={ref.id}
                  className={`p-3 rounded-xl border flex items-start gap-3 transition ${
                    ref.ativo ? 'bg-slate-50 border-slate-300' : 'bg-white border-slate-200 opacity-60'
                  }`}
                >
                  <input
                    type="checkbox"
                    id={`ref_${ref.id}`}
                    checked={ref.ativo}
                    onChange={() => toggleLegalRef(ref.id)}
                    className="mt-1 w-4 h-4 text-emerald-600 rounded cursor-pointer"
                  />
                  <div className="text-xs space-y-0.5 cursor-pointer" onClick={() => toggleLegalRef(ref.id)}>
                    <label htmlFor={`ref_${ref.id}`} className="font-bold text-slate-800 cursor-pointer">
                      {ref.titulo}
                    </label>
                    <p className="text-slate-600 text-[11px] leading-relaxed">
                      {ref.dispositivo}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-2 border-t border-slate-100">
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={notif.incluirAdvertenciaDesobediencia !== false}
                  onChange={e => updateNotifField('incluirAdvertenciaDesobediencia', e.target.checked)}
                  className="w-4 h-4 text-emerald-600 rounded"
                />
                <span>
                  Incluir advertência expressa de crime de desobediência (Artigo 330 do Código Penal e Art. 80 do Decreto Federal nº 6.514/2008)
                </span>
              </label>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* ABA 3: EDITOR DE TEXTO LIVRE DA MINUTA                                     */}
      {/* ========================================================================= */}
      {activeTab === 'editor' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide">
                Editor de Texto Livre da Minuta
              </h3>
              <p className="text-xs text-slate-500">
                Ajuste os parágrafos, exigências e observações diretamente no texto integral da minuta.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <div className="text-right">
                <span className="text-[10px] text-slate-400 block uppercase font-bold">Autor da Revisão</span>
                <input
                  type="text"
                  value={editorAuthor}
                  onChange={e => setEditorAuthor(e.target.value)}
                  placeholder="Nome do fiscal"
                  className="text-xs font-bold text-slate-800 border-b border-slate-300 focus:outline-hidden text-right"
                />
              </div>

              <button
                type="button"
                onClick={handleSaveFinal}
                className="text-xs px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold transition flex items-center gap-1.5 shadow-xs cursor-pointer"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Salvar Edição</span>
              </button>
            </div>
          </div>

          <textarea
            rows={22}
            value={editorText}
            onChange={e => setEditorText(e.target.value)}
            className="w-full text-xs font-mono p-4 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 bg-slate-50/50 leading-relaxed text-slate-900"
          />
        </div>
      )}
    </div>
  );
};
