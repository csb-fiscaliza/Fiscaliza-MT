// ==============================================================================
// ARQUIVO: src/components/DocumentReviewStep.tsx
// Central de Minutas Oficiais da CSB/SEMA-MT
// Navegação integrada entre Auto de Inspeção, Relatório de Inspeção e Notificação
// ==============================================================================

import React, { useState } from 'react';
import { 
  FileText, 
  FileCheck, 
  Bell, 
  ArrowLeft,
  Download,
  ShieldCheck
} from 'lucide-react';
import { InspectionData } from '../types/inspection';
import { AutoInspecaoDocumentView } from './AutoInspecaoDocumentView';
import { NotificacaoDocumentView } from './NotificacaoDocumentView';
import { RelatorioInspecaoDocumentView } from './RelatorioInspecaoDocumentView';
import { exportAnonymizedJsonFile } from '../utils/anonymizer';

interface Props {
  data: InspectionData;
  onChange: (updater: (prev: InspectionData) => InspectionData) => void;
  onPrev: () => void;
}

export const DocumentReviewStep: React.FC<Props> = ({ data, onChange, onPrev }) => {
  const [activeDoc, setActiveDoc] = useState<'auto' | 'relatorio' | 'notificacao'>('relatorio');

  return (
    <div className="space-y-6">
      {/* Barra de Seleção do Documento */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-2 sm:p-3 shadow-xs print:hidden transition-colors">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-2 mb-2">
          <div>
            <h1 className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100">
              Minutas de Documentos Oficiais da Vistoria (CSB/SEMA-MT)
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Selecione o documento para pré-visualização, revisão técnica fática, edição do texto e exportação.
            </p>
          </div>

          <button
            type="button"
            onClick={() => exportAnonymizedJsonFile(data)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 dark:bg-emerald-600 hover:bg-black dark:hover:bg-emerald-700 text-white text-xs font-bold transition shadow-xs cursor-pointer"
            title="Exportar cópia 100% anonimizada em conformidade com a LGPD para uso no Google AI Studio"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 dark:text-emerald-200" />
            <span>Exportar Cópia Anonimizada (LGPD)</span>
          </button>
        </div>

        {/* Abas dos 3 Documentos Oficiais */}
        <div className="flex border-b border-slate-200 dark:border-slate-800 gap-1 overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveDoc('relatorio')}
            className={`min-h-[48px] px-4 py-3 text-xs sm:text-sm font-semibold flex items-center gap-2 border-b-2 transition cursor-pointer ${
              activeDoc === 'relatorio'
                ? 'border-emerald-600 text-emerald-800 dark:text-emerald-300 bg-white dark:bg-slate-800/80 shadow-xs font-bold'
                : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <FileCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span>Relatório de Inspeção</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 font-bold border border-emerald-300 dark:border-emerald-800">
              Modelo CSB c/ Fotos
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveDoc('auto')}
            className={`min-h-[48px] px-4 py-3 text-xs sm:text-sm font-semibold flex items-center gap-2 border-b-2 transition cursor-pointer ${
              activeDoc === 'auto'
                ? 'border-emerald-600 text-emerald-800 dark:text-emerald-300 bg-white dark:bg-slate-800/80 shadow-xs font-bold'
                : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <FileText className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span>Auto de Inspeção</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 font-bold border border-emerald-300 dark:border-emerald-800">
              SIGA AUTUAÇÃO
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveDoc('notificacao')}
            className={`min-h-[48px] px-4 py-3 text-xs sm:text-sm font-semibold flex items-center gap-2 border-b-2 transition cursor-pointer ${
              activeDoc === 'notificacao'
                ? (data.conclusions.requiresNotification 
                    ? 'border-amber-600 text-amber-900 dark:text-amber-300 bg-white dark:bg-slate-800/80 shadow-xs font-bold' 
                    : 'border-slate-400 text-slate-800 dark:text-slate-200 bg-white dark:bg-slate-800/80 shadow-xs font-bold')
                : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Bell className={`w-4 h-4 ${data.conclusions.requiresNotification ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400 dark:text-slate-500'}`} />
            <span>Notificação Técnica</span>
            {data.conclusions.requiresNotification ? (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-950 text-amber-900 dark:text-amber-300 font-bold border border-amber-300 dark:border-amber-800">
                Ativada
              </span>
            ) : (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-medium">
                Condicional / Inativa
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Renderização do Documento Selecionado */}
      {activeDoc === 'auto' ? (
        <AutoInspecaoDocumentView data={data} onChange={onChange} />
      ) : activeDoc === 'notificacao' ? (
        <NotificacaoDocumentView data={data} onChange={onChange} />
      ) : (
        <RelatorioInspecaoDocumentView data={data} onChange={onChange} />
      )}

      {/* Navegação Inferior */}
      <div className="flex justify-between items-center pt-2 print:hidden">
        <button
          type="button"
          onClick={onPrev}
          className="min-h-[44px] flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100 text-xs sm:text-sm font-semibold transition cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Voltar para Conclusões</span>
        </button>
      </div>
    </div>
  );
};
