// ==============================================================================
// ARQUIVO: src/components/Header.tsx
// Cabeçalho Oficial do Sistema Fiscaliza MT (CSB / SEMA-MT)
// Linha Superior: Nome do Sistema e Escritos Institucionais
// Linha Inferior: Atalhos Exclusivos (Painel, Nova Ficha e Banco de Dados)
// ==============================================================================

import React from 'react';
import { 
  LayoutDashboard, 
  PlusCircle, 
  Database,
  FileSpreadsheet,
  MapPin,
  Clock,
  Wifi,
  WifiOff
} from 'lucide-react';
import { formatGmsString } from '../utils/geoCoordinates';
import { InspectionData } from '../types/inspection';
import { ThemeToggle } from './ThemeToggle';
import { FiscalizaLogo } from './FiscalizaLogo';

interface HeaderProps {
  currentInspection: InspectionData;
  activeStep: number;
  setActiveStep: (step: number) => void;
  onNewInspection: () => void;
  onLoadSample: () => void;
  onSave: () => void;
  onExportJson: () => void;
  onImportJson: (e: React.ChangeEvent<HTMLInputElement>) => void;
  allInspections: InspectionData[];
  onSelectInspection: (id: string) => void;
  lastSavedAt: string | null;
  isOnline: boolean;
  onOpenSecurityReview: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentInspection,
  activeStep,
  setActiveStep,
  onNewInspection,
  allInspections,
  lastSavedAt,
  isOnline
}) => {
  const isPanelActive = activeStep === 0;
  const isDatabaseActive = activeStep === 6;
  const isSheetActive = activeStep >= 1 && activeStep <= 5;

  return (
    <header className="sticky top-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200/80 dark:border-slate-800 transition-colors duration-200 shadow-2xs select-none">
      {/* ===================================================================== */}
      {/* 1. LINHA SUPERIOR: APENAS O NOME DO SISTEMA E OS ESCRITOS INSTITUCIONAIS */}
      {/* ===================================================================== */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3.5 flex items-center justify-between gap-4">
        {/* Identidade Visual Completa: Logo + Nome + Escritos */}
        <div 
          onClick={() => setActiveStep(0)} 
          className="flex items-center gap-3.5 sm:gap-4 cursor-pointer group"
          title="Ir para o Painel Inicial"
        >
          <div className="relative shrink-0">
            <FiscalizaLogo size="lg" className="shadow-sm group-hover:scale-105 transition-transform duration-200" />
          </div>

          <div className="flex flex-col">
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900 dark:text-white group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                Fiscaliza MT
              </h1>
              <span className="text-[10px] sm:text-xs font-bold px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 uppercase tracking-wider">
                CSB / SEMA-MT
              </span>
            </div>

            <p className="text-xs sm:text-sm font-medium text-slate-600 dark:text-slate-300 leading-tight mt-0.5">
              Coordenadoria de Segurança de Barragens – Usos Múltiplos
            </p>

            <span className="text-[11px] text-slate-400 dark:text-slate-500 leading-tight hidden sm:block">
              Superintendência de Recursos Hídricos (SURH) · Governo do Estado de Mato Grosso
            </span>
          </div>
        </div>

        {/* Lado Direito: Tema e Conectividade */}
        <div className="flex items-center gap-2.5 shrink-0">
          <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-400">
            {isOnline ? (
              <>
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                <span>Online</span>
              </>
            ) : (
              <>
                <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                <span>Modo Local</span>
              </>
            )}
          </div>

          <ThemeToggle />
        </div>
      </div>

      {/* ===================================================================== */}
      {/* 2. LINHA INFERIOR: ATALHOS EXCLUSIVOS (PAINEL, NOVA FICHA, BANCO DE DADOS) */}
      {/* ===================================================================== */}
      <div className="border-t border-slate-200/80 dark:border-slate-800/80 bg-slate-50/70 dark:bg-slate-950/60 px-4 sm:px-6 py-2">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          {/* Barra de Atalhos Exclusivos */}
          <nav className="flex items-center gap-1.5 sm:gap-2">
            {/* Atalho 1: Painel */}
            <button
              type="button"
              onClick={() => setActiveStep(0)}
              className={`px-3.5 py-1.5 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center gap-2 cursor-pointer shadow-2xs ${
                isPanelActive
                  ? 'bg-emerald-600 text-white shadow-emerald-600/20'
                  : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800'
              }`}
              title="Acessar o Painel Inicial"
            >
              <LayoutDashboard className="w-4 h-4" />
              <span>Painel</span>
            </button>

            {/* Atalho 2: Nova Ficha */}
            <button
              type="button"
              onClick={onNewInspection}
              className="px-3.5 py-1.5 rounded-xl text-xs sm:text-sm font-bold bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 hover:border-emerald-500 transition-all flex items-center gap-2 cursor-pointer shadow-2xs"
              title="Iniciar uma nova ficha de vistoria em branco"
            >
              <PlusCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>Nova Ficha</span>
            </button>

            {/* Atalho 3: Banco de Dados */}
            <button
              type="button"
              onClick={() => setActiveStep(6)}
              className={`px-3.5 py-1.5 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center gap-2 cursor-pointer shadow-2xs ${
                isDatabaseActive
                  ? 'bg-emerald-600 text-white shadow-emerald-600/20'
                  : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800'
              }`}
              title="Acessar o Banco de Dados de Barragens Inspecionadas"
            >
              <Database className="w-4 h-4 text-cyan-500 dark:text-cyan-400" />
              <span>Banco de Dados</span>
              {allInspections.length > 0 && (
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold tabular-nums ${
                  isDatabaseActive
                    ? 'bg-white/20 text-white'
                    : 'bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800'
                }`}>
                  {allInspections.length}
                </span>
              )}
            </button>

            {/* Indicador de Ficha Ativa quando estiver preenchendo/editando */}
            {isSheetActive && (
              <button
                type="button"
                onClick={() => setActiveStep(1)}
                className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60 cursor-pointer"
                title="Voltar para a Ficha de Inspeção em andamento"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                <span>Ficha em Edição</span>
              </button>
            )}
          </nav>

          {/* Contexto da Vistoria Ativa / Metadados */}
          {isSheetActive && (
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 truncate">
              <span className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                {currentInspection.damIdentification.damName || 'Vistoria em preenchimento'}
              </span>
              <span className="text-slate-300 dark:text-slate-700">·</span>
              <span className="flex items-center gap-1 text-[11px] truncate">
                <MapPin className="w-3 h-3 text-emerald-500 shrink-0" />
                <span>{currentInspection.damIdentification.municipality || 'Mato Grosso'}/MT</span>
              </span>
              {lastSavedAt && (
                <span className="hidden lg:flex items-center gap-1 text-[10px] text-slate-400 font-mono">
                  <Clock className="w-2.5 h-2.5" />
                  <span>Salvo {lastSavedAt}</span>
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
