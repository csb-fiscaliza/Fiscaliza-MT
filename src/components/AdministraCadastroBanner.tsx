import React from 'react';
import {
  CheckCircle2,
  Database,
  AlertTriangle,
  RefreshCw,
  Search,
  Loader2,
  ShieldCheck
} from 'lucide-react';
import { EntidadeMestreTipo, InspectionData } from '../types/inspection';
import {
  getEntityCadastroStatus,
  hasEntityDataInForm
} from '../services/administraEcosystemService';
import { getSistemaLabel } from '../services/ecosystemConfig';

interface AdministraCadastroBannerProps {
  tipo: EntidadeMestreTipo;
  inspection: InspectionData;
  isSubmitting?: boolean;
  feedback?: { type: 'success' | 'error'; message: string } | null;
  onRegister: () => void;
  onOpenLookup?: () => void;
}

const CONFIG_BY_TYPE: Record<
  EntidadeMestreTipo,
  {
    entityLabel: string;
    buttonLabel: string;
    updateButtonLabel: string;
    targetTablesHint: string;
    optionalWhenEmpty?: boolean;
  }
> = {
  barragem: {
    entityLabel: 'Barragem',
    buttonLabel: 'Cadastrar Barragem na Base de Dados',
    updateButtonLabel: 'Atualizar Barragem na Base de Dados',
    targetTablesHint: 'Gravará os dados técnicos e geográficos na planilha/tabela "barragens" do Administra.'
  },
  empreendedor: {
    entityLabel: 'Empreendedor',
    buttonLabel: 'Cadastrar Empreendedor na Base de Dados',
    updateButtonLabel: 'Atualizar Empreendedor na Base de Dados',
    targetTablesHint: 'Gravará os dados cadastrais e CAR/Outorga na planilha/tabela "empreendedores" do Administra.'
  },
  responsavel_tecnico: {
    entityLabel: 'Responsável Técnico',
    buttonLabel: 'Cadastrar Responsável Técnico na Base de Dados',
    updateButtonLabel: 'Atualizar RT na Base de Dados',
    targetTablesHint: 'Gravará o profissional e ART na planilha/tabela "responsaveis_tecnicos" do Administra.',
    optionalWhenEmpty: true
  }
};

export const AdministraCadastroBanner: React.FC<AdministraCadastroBannerProps> = ({
  tipo,
  inspection,
  isSubmitting = false,
  feedback,
  onRegister,
  onOpenLookup
}) => {
  const cfg = CONFIG_BY_TYPE[tipo];
  const status = getEntityCadastroStatus(inspection, tipo);
  const usedInForm = hasEntityDataInForm(inspection, tipo);

  if (tipo === 'responsavel_tecnico' && !usedInForm && !status.cadastrado) {
    return (
      <div className="mt-3 p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-900/60 text-xs text-slate-600 dark:text-slate-400 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Database className="w-4 h-4 text-slate-400 shrink-0" />
          <span>
            <strong>Base Administra (RT):</strong> Campo opcional. Se você preencher manualmente um Responsável Técnico não vinculado, será necessário cadastrá-lo na base antes de concluir a vistoria.
          </span>
        </div>
        {feedback && (
          <p
            className={`w-full text-[11px] font-semibold mt-1 ${
              feedback.type === 'success' ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-700 dark:text-rose-300'
            }`}
          >
            {feedback.message}
          </p>
        )}
      </div>
    );
  }

  if (status.cadastrado) {
    const isLinkedExisting = status.modo === 'vinculado_existente';
    const originName = getSistemaLabel(status.sistemaOrigem || 'fiscaliza');

    return (
      <div className="mt-3 p-3 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50/80 dark:bg-emerald-950/30 text-xs flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-emerald-900 dark:text-emerald-200 min-w-0">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <div>
              <span className="font-bold">
                {cfg.entityLabel} {isLinkedExisting ? 'vinculado(a) à base do Administra' : 'cadastrado(a) na base do Administra'}
              </span>
              <span className="ml-1.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
                (Titularidade: {originName})
              </span>
            </div>
          </div>

          {!isLinkedExisting && (
            <button
              type="button"
              disabled={isSubmitting}
              onClick={onRegister}
              className="min-h-[36px] px-3 py-1.5 rounded-lg border border-emerald-300 dark:border-emerald-700 bg-white dark:bg-slate-900 text-emerald-800 dark:text-emerald-200 hover:bg-emerald-100/70 dark:hover:bg-emerald-900/40 font-bold text-[11px] flex items-center gap-1.5 cursor-pointer disabled:opacity-60 transition"
              title="Reenviar alterações preenchidas deste bloco para a tabela correspondente no Administra"
            >
              {isSubmitting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5" />
              )}
              <span>{cfg.updateButtonLabel}</span>
            </button>
          )}
        </div>

        {feedback && (
          <div
            className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold flex items-center gap-1.5 ${
              feedback.type === 'success'
                ? 'bg-emerald-100/90 dark:bg-emerald-900/50 text-emerald-900 dark:text-emerald-200'
                : 'bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-200'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
            <span>{feedback.message}</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="mt-3 p-3.5 rounded-xl border-2 border-amber-300 dark:border-amber-700 bg-amber-50/90 dark:bg-amber-950/35 text-xs flex flex-col gap-2.5 shadow-2xs">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start gap-2.5 min-w-0">
          <AlertTriangle className="w-4 h-4 text-amber-700 dark:text-amber-400 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="font-bold text-amber-950 dark:text-amber-100">
              {cfg.entityLabel} não vinculado(a) — salvo temporariamente apenas nesta ficha de rascunho
            </p>
            <p className="text-[11px] text-amber-800 dark:text-amber-300 mt-0.5 leading-snug">
              {cfg.targetTablesHint} Você pode salvar rascunho normalmente e manter local, mas para <strong>Concluir Vistoria</strong> é obrigatório cadastrar na base do Administra.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {onOpenLookup && (
            <button
              type="button"
              onClick={onOpenLookup}
              className="min-h-[40px] px-3 py-1.5 rounded-lg border border-amber-400 dark:border-amber-700 bg-white dark:bg-slate-900 text-amber-900 dark:text-amber-200 hover:bg-amber-100/60 font-bold text-[11px] flex items-center gap-1.5 cursor-pointer transition"
              title="Consultar primeiro se este registro já existe na base do Administra"
            >
              <Search className="w-3.5 h-3.5" />
              <span>Buscar Existente</span>
            </button>
          )}

          <button
            type="button"
            disabled={isSubmitting}
            onClick={onRegister}
            className="min-h-[40px] px-3.5 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-xs cursor-pointer disabled:opacity-60 transition active:scale-[0.99]"
          >
            {isSubmitting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Database className="w-4 h-4" />
            )}
            <span>{isSubmitting ? 'Cadastrando...' : cfg.buttonLabel}</span>
          </button>
        </div>
      </div>

      {feedback && (
        <div
          className={`px-3 py-2 rounded-lg text-[11px] font-semibold border ${
            feedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-950/60 dark:border-emerald-800 dark:text-emerald-200'
              : 'bg-rose-50 border-rose-200 text-rose-800 dark:bg-rose-950/60 dark:border-rose-800 dark:text-rose-200'
          }`}
        >
          {feedback.message}
        </div>
      )}
    </div>
  );
};
