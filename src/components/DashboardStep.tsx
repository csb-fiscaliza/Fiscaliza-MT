// ==============================================================================
// ARQUIVO: src/components/DashboardStep.tsx
// Painel de Controle Principal (Página Inicial) - Fiscaliza CSB/SEMA-MT
// Focado exclusivamente no atalho para "Ficha de Inspeção"
// ==============================================================================

import React from 'react';
import { 
  FileSpreadsheet, 
  ArrowRight, 
  PlusCircle, 
  Wifi, 
  WifiOff, 
  Clock,
  ShieldCheck,
  CheckCircle2
} from 'lucide-react';
import { InspectionData } from '../types/inspection';

interface Props {
  currentInspection: InspectionData;
  allInspections?: InspectionData[];
  onGoToSheet: () => void;
  onGoToDatabase?: () => void;
  onGoToDocuments?: () => void;
  onOpenSecurityModal?: () => void;
  onNewInspection: () => void;
  onLoadSample?: () => void;
  onSelectAndEdit?: (id: string) => void;
  isOnline: boolean;
  lastSavedAt: string | null;
}

export const DashboardStep: React.FC<Props> = ({
  currentInspection,
  onGoToSheet,
  onNewInspection,
  isOnline,
  lastSavedAt
}) => {
  const d = currentInspection.damIdentification;
  const g = currentInspection.generalInfo;

  // Cálculo de progresso de preenchimento da vistoria ativa
  const totalComponents = Object.keys(currentInspection.componentsData || {}).length || 8;
  const inspectedComponents = Object.values(currentInspection.componentsData || {}).filter(
    comp => comp.condition !== 'nao_inspecionado'
  ).length;
  const hasCoords = !!(d.coordinates.latitude && d.coordinates.longitude);
  const hasName = !!(d.damName || d.propertyOrBusinessName);
  const hasPhotos = (currentInspection.photos || []).length > 0;

  let checklistPoints = 0;
  if (hasName) checklistPoints += 25;
  if (hasCoords) checklistPoints += 25;
  if (inspectedComponents > 0) checklistPoints += 30;
  if (hasPhotos) checklistPoints += 20;

  return (
    <div className="space-y-6 max-w-4xl mx-auto py-2 sm:py-4">
      {/* 1. Banner Institucional de Boas-Vindas */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-emerald-950 text-white rounded-2xl p-5 sm:p-7 border border-slate-700/60 shadow-md relative overflow-hidden">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5 max-w-2xl">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 uppercase tracking-wider">
                Sistema Oficial de Campo
              </span>
              <span className="text-xs text-slate-400">
                CSB / SALARH / SEMA-MT
              </span>
            </div>

            <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white">
              Painel de Controle – Fiscalização de Barragens
            </h1>

            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
              Coordenadoria de Segurança de Barragens do Estado de Mato Grosso. Registro fático de campo, avaliação de componentes, banco de dados e emissão de minutas regulatórias.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row md:flex-col items-start md:items-end gap-2 shrink-0">
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-semibold ${
              isOnline 
                ? 'bg-emerald-950/80 text-emerald-300 border-emerald-700/60' 
                : 'bg-amber-950/80 text-amber-300 border-amber-700/60'
            }`}>
              {isOnline ? <Wifi className="w-4 h-4 text-emerald-400" /> : <WifiOff className="w-4 h-4 text-amber-400" />}
              <span>{isOnline ? 'Dispositivo Online (Sincronizado)' : 'Modo Offline (Gravando Local)'}</span>
            </div>

            <span className="text-[11px] text-slate-400 flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-slate-500" />
              <span>Último salvamento: {lastSavedAt || 'Agora'}</span>
            </span>
          </div>
        </div>
      </div>

      {/* 2. ATALHO ÚNICO E PRINCIPAL: FICHA DE INSPEÇÃO */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border-2 border-emerald-600/80 dark:border-emerald-500/80 p-6 sm:p-8 shadow-sm hover:shadow-md transition-all flex flex-col justify-between group relative overflow-hidden">
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-14 h-14 rounded-2xl bg-emerald-600 text-white flex items-center justify-center font-bold shadow-xs ring-4 ring-emerald-500/20">
                <FileSpreadsheet className="w-8 h-8" />
              </div>
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                  Formulário Oficial de Campo
                </span>
                <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white leading-tight">
                  Ficha de Inspeção
                </h2>
              </div>
            </div>

            <span className="text-xs font-semibold px-3 py-1 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
              CSB / SEMA-MT
            </span>
          </div>

          <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
            Acesse o formulário oficial de campo da SEMA-MT para preenchimento de dados gerais, identificação do empreendedor, coordenadas geográficas automáticas em formato GMS (SIRGAS 2000), inspeção visual detalhada de todos os tópicos e registro fotográfico.
          </p>

          {/* Status da vistoria atualmente carregada no aparelho */}
          <div className="bg-slate-50 dark:bg-slate-950/70 rounded-2xl p-4 sm:p-5 border border-slate-200 dark:border-slate-800 space-y-3 transition-colors">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500 dark:text-slate-400 font-semibold flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span>Vistoria Ativa no Dispositivo:</span>
              </span>
              <span className="font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">
                {checklistPoints}% preenchida
              </span>
            </div>

            <div>
              <p className="font-extrabold text-base text-slate-900 dark:text-white truncate">
                {d.damName || d.propertyOrBusinessName || 'Nova Vistoria (Sem Denominação)'}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                {d.municipality || 'Mato Grosso'}/MT {g.inspectionDate ? `· Data: ${g.inspectionDate}` : ''}
              </p>
            </div>

            {/* Barra de Progresso */}
            <div className="w-full bg-slate-200 dark:bg-slate-800 rounded-full h-2 overflow-hidden">
              <div 
                className="bg-emerald-600 dark:bg-emerald-500 h-2 rounded-full transition-all duration-300"
                style={{ width: `${checklistPoints}%` }}
              />
            </div>
          </div>
        </div>

        {/* Botões de Ação Direta */}
        <div className="pt-6 mt-2 flex flex-col sm:flex-row items-center gap-3">
          <button
            type="button"
            onClick={onGoToSheet}
            className="w-full sm:flex-1 min-h-[50px] py-3 px-6 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm sm:text-base font-bold transition flex items-center justify-center gap-2 shadow-sm hover:shadow cursor-pointer select-none"
          >
            <span>Preencher Ficha de Inspeção</span>
            <ArrowRight className="w-5 h-5" />
          </button>

          <button
            type="button"
            onClick={onNewInspection}
            className="w-full sm:w-auto min-h-[50px] px-5 py-3 rounded-2xl border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs sm:text-sm font-semibold transition flex items-center justify-center gap-2 cursor-pointer select-none"
            title="Iniciar uma nova vistoria em branco"
          >
            <PlusCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span>Nova Ficha em Branco</span>
          </button>
        </div>
      </div>
    </div>
  );
};
