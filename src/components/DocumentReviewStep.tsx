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
      <div className="bg-white rounded-2xl border border-slate-200 p-2 sm:p-3 shadow-xs print:hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-2 mb-2">
          <div>
            <h1 className="text-base sm:text-lg font-bold text-slate-900">
              Minutas de Documentos Oficiais da Vistoria (CSB/SEMA-MT)
            </h1>
            <p className="text-xs text-slate-500">
              Selecione o documento para pré-visualização, revisão técnica fática, edição do texto e exportação.
            </p>
          </div>

          <button
            type="button"
            onClick={() => exportAnonymizedJsonFile(data)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-black text-white text-xs font-bold transition shadow-xs cursor-pointer"
            title="Exportar cópia 100% anonimizada em conformidade com a LGPD para uso no Google AI Studio"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>Exportar Cópia Anonimizada (LGPD)</span>
          </button>
        </div>

        {/* Abas dos 3 Documentos Oficiais */}
        <div className="flex border-b border-slate-200 gap-1 overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveDoc('relatorio')}
            className={`min-h-[48px] px-4 py-3 text-xs sm:text-sm font-semibold flex items-center gap-2 border-b-2 transition cursor-pointer ${
              activeDoc === 'relatorio'
                ? 'border-emerald-600 text-emerald-800 bg-white shadow-xs font-bold'
                : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <FileCheck className="w-4 h-4 text-emerald-600" />
            <span>Relatório de Inspeção</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold">
              Modelo CSB c/ Fotos
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveDoc('auto')}
            className={`min-h-[48px] px-4 py-3 text-xs sm:text-sm font-semibold flex items-center gap-2 border-b-2 transition cursor-pointer ${
              activeDoc === 'auto'
                ? 'border-emerald-600 text-emerald-800 bg-white shadow-xs font-bold'
                : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <FileText className="w-4 h-4 text-emerald-600" />
            <span>Auto de Inspeção</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold">
              SIGA AUTUAÇÃO
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveDoc('notificacao')}
            className={`min-h-[48px] px-4 py-3 text-xs sm:text-sm font-semibold flex items-center gap-2 border-b-2 transition cursor-pointer ${
              activeDoc === 'notificacao'
                ? (data.conclusions.requiresNotification 
                    ? 'border-amber-600 text-amber-900 bg-white shadow-xs font-bold' 
                    : 'border-slate-400 text-slate-800 bg-white shadow-xs font-bold')
                : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Bell className={`w-4 h-4 ${data.conclusions.requiresNotification ? 'text-amber-600' : 'text-slate-400'}`} />
            <span>Notificação Técnica</span>
            {data.conclusions.requiresNotification ? (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 font-bold">
                Ativada
              </span>
            ) : (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-medium">
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
