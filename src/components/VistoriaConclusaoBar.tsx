import React, { useState } from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  Save,
  Lock,
  ShieldCheck,
  Database,
  ArrowUpRight,
  RotateCcw
} from 'lucide-react';
import { EntidadeMestreTipo, InspectionData } from '../types/inspection';
import { getAdministraConclusionValidation } from '../services/administraEcosystemService';

interface VistoriaConclusaoBarProps {
  data: InspectionData;
  onChange: (updater: (prev: InspectionData) => InspectionData) => void;
  onSaveDraft?: (updated?: InspectionData) => void;
  onNavigateToEntityBlock?: (tipo: EntidadeMestreTipo) => void;
}

export const VistoriaConclusaoBar: React.FC<VistoriaConclusaoBarProps> = ({
  data,
  onChange,
  onSaveDraft,
  onNavigateToEntityBlock
}) => {
  const [statusFeedback, setStatusFeedback] = useState<{
    type: 'success' | 'error' | 'info';
    message: string;
  } | null>(null);

  const validation = getAdministraConclusionValidation(data);
  const isFutura = data.tipoPlanejamento === 'futura' || data.generalInfo?.tipoPlanejamento === 'futura';
  const isConcluded = !data.isDraft && !isFutura && validation.canConclude;

  const handleSaveTemporaryDraft = () => {
    const draftInspection: InspectionData = {
      ...data,
      isDraft: true
    };
    onChange(() => draftInspection);
    onSaveDraft?.(draftInspection);
    setStatusFeedback({
      type: 'info',
      message: validation.canConclude
        ? 'Rascunho salvo localmente com segurança. Você pode concluir a vistoria quando finalizar a revisão.'
        : 'Rascunho temporário salvo localmente. Os dados ainda não vinculados ao Administra permaneceram apenas nesta ficha.'
    });
  };

  const handleConcludeInspection = () => {
    if (isFutura) {
      setStatusFeedback({
        type: 'error',
        message: 'Esta ficha está marcada como "Vistoria Futura". Converta para "Vistoria Atual" na aba 1 antes de concluir.'
      });
      return;
    }

    if (!validation.canConclude) {
      setStatusFeedback({
        type: 'error',
        message: validation.summaryMessage
      });
      return;
    }

    const concludedInspection: InspectionData = {
      ...data,
      isDraft: false,
      tipoPlanejamento: 'atual',
      generalInfo: {
        ...data.generalInfo,
        tipoPlanejamento: 'atual'
      }
    };
    onChange(() => concludedInspection);
    onSaveDraft?.(concludedInspection);
    setStatusFeedback({
      type: 'success',
      message: 'Vistoria concluída! Todos os cadastros estão efetivamente registrados na base do Administra.'
    });
  };

  const handleReopenDraft = () => {
    const reopened: InspectionData = {
      ...data,
      isDraft: true
    };
    onChange(() => reopened);
    onSaveDraft?.(reopened);
    setStatusFeedback({
      type: 'info',
      message: 'Vistoria reaberta como Rascunho para novas edições.'
    });
  };

  return (
    <div
      className={`rounded-2xl border-2 p-4 sm:p-5 shadow-xs transition-colors print:hidden ${
        isConcluded
          ? 'border-emerald-300 dark:border-emerald-800 bg-emerald-50/80 dark:bg-emerald-950/30'
          : validation.canConclude
          ? 'border-sky-300 dark:border-sky-800 bg-sky-50/70 dark:bg-sky-950/25'
          : 'border-amber-300 dark:border-amber-700 bg-amber-50/80 dark:bg-amber-950/30'
      }`}
    >
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          {isConcluded ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
          ) : validation.canConclude ? (
            <ShieldCheck className="w-5 h-5 text-sky-600 dark:text-sky-400 shrink-0 mt-0.5" />
          ) : (
            <Lock className="w-5 h-5 text-amber-700 dark:text-amber-400 shrink-0 mt-0.5" />
          )}

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-xs sm:text-sm font-black uppercase tracking-wide text-slate-900 dark:text-slate-100">
                {isConcluded
                  ? 'Status: Vistoria Concluída'
                  : isFutura
                  ? 'Status: Planejamento / Vistoria Futura (Rascunho)'
                  : 'Status: Rascunho em Andamento'}
              </h3>
              <span
                className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full uppercase border ${
                  isConcluded
                    ? 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-900/50 dark:text-emerald-200 dark:border-emerald-700'
                    : validation.canConclude
                    ? 'bg-sky-100 text-sky-800 border-sky-300 dark:bg-sky-900/50 dark:text-sky-200 dark:border-sky-700'
                    : 'bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-900/50 dark:text-amber-200 dark:border-amber-700'
                }`}
              >
                {isConcluded
                  ? 'Pronta p/ Sincronização Final'
                  : validation.canConclude
                  ? 'Base Administra Validada'
                  : `${validation.missingEntities.length} Cadastro(s) Pendente(s) no Administra`}
              </span>
            </div>

            <p className="text-xs text-slate-700 dark:text-slate-300 mt-1 leading-relaxed">
              {isConcluded
                ? 'Empreendedor, Barragem e Responsável Técnico (quando informado) estão efetivamente cadastrados ou vinculados na base central do Administra.'
                : validation.canConclude
                ? 'Todos os dados vinculados/cadastrados atendem às regras do Administra. Salve o rascunho ou clique em "Concluir Vistoria" para finalizar.'
                : 'Enquanto houver dados manuais sem registro na base do Administra, você pode salvar rascunho temporário, porém a conclusão da vistoria permanece bloqueada.'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {!isConcluded ? (
            <>
              <button
                type="button"
                onClick={handleSaveTemporaryDraft}
                className="min-h-[42px] px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-2xs transition"
              >
                <Save className="w-4 h-4 text-slate-600 dark:text-slate-300" />
                <span>Salvar Rascunho Temporário</span>
              </button>

              <button
                type="button"
                onClick={handleConcludeInspection}
                aria-disabled={!validation.canConclude || isFutura}
                className={`min-h-[42px] px-4 py-2 rounded-xl font-bold text-xs flex items-center gap-1.5 shadow-xs transition ${
                  validation.canConclude && !isFutura
                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer active:scale-[0.99]'
                    : 'bg-amber-200/80 dark:bg-amber-900/40 text-amber-950 dark:text-amber-200 border border-amber-400 dark:border-amber-700 cursor-not-allowed'
                }`}
                title={
                  validation.canConclude && !isFutura
                    ? 'Concluir vistoria oficial'
                    : 'Cadastre na base do Administra todos os itens pendentes antes de concluir'
                }
              >
                {validation.canConclude && !isFutura ? (
                  <CheckCircle2 className="w-4 h-4" />
                ) : (
                  <Lock className="w-4 h-4" />
                )}
                <span>Concluir Vistoria</span>
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={handleReopenDraft}
              className="min-h-[40px] px-3.5 py-2 rounded-xl border border-emerald-400 dark:border-emerald-700 bg-white dark:bg-slate-900 text-emerald-800 dark:text-emerald-200 hover:bg-emerald-100/70 font-bold text-xs flex items-center gap-1.5 cursor-pointer transition"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reabrir como Rascunho</span>
            </button>
          )}
        </div>
      </div>

      {/* Lista de Pendências do Administra */}
      {!validation.canConclude && (
        <div className="mt-3 pt-3 border-t border-amber-300/70 dark:border-amber-800/70 space-y-2">
          <div className="flex items-center gap-1.5 text-[11px] font-bold text-amber-950 dark:text-amber-200 uppercase tracking-wide">
            <Database className="w-3.5 h-3.5" />
            <span>Itens pendentes de cadastro na base do Administra para concluir:</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            {validation.missingEntities.map(item => (
              <div
                key={item.tipo}
                className="p-2.5 rounded-xl bg-white/90 dark:bg-slate-900/90 border border-amber-200 dark:border-amber-800 flex flex-col justify-between gap-2 text-xs"
              >
                <div>
                  <div className="flex items-center gap-1.5 font-bold text-amber-950 dark:text-amber-100">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                    <span>{item.label}</span>
                  </div>
                  <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-1 leading-snug">
                    {item.reason}
                  </p>
                </div>
                {onNavigateToEntityBlock && (
                  <button
                    type="button"
                    onClick={() => onNavigateToEntityBlock(item.tipo)}
                    className="text-[11px] font-bold text-amber-800 dark:text-amber-300 hover:underline flex items-center gap-1 self-start cursor-pointer"
                  >
                    <span>Ir para {item.label}</span>
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {statusFeedback && (
        <div
          className={`mt-3 p-2.5 rounded-xl text-xs font-semibold border ${
            statusFeedback.type === 'success'
              ? 'bg-emerald-100/90 border-emerald-300 text-emerald-900 dark:bg-emerald-900/40 dark:border-emerald-700 dark:text-emerald-200'
              : statusFeedback.type === 'error'
              ? 'bg-rose-100 border-rose-300 text-rose-900 dark:bg-rose-950/60 dark:border-rose-800 dark:text-rose-200'
              : 'bg-white border-slate-200 text-slate-700 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-300'
          }`}
        >
          {statusFeedback.message}
        </div>
      )}
    </div>
  );
};
