// ==============================================================================
// ARQUIVO: src/components/Header.tsx
// Cabeçalho Oficial de Alta Performance da CSB/SEMA-MT
// Design elegante, moderno, dinâmico e responsivo com navegação fluida
// ==============================================================================

import React from 'react';
import { 
  ShieldCheck, 
  FileSpreadsheet, 
  PlusCircle, 
  FolderOpen, 
  Download, 
  Upload, 
  Sparkles, 
  CheckCircle2, 
  AlertTriangle, 
  LayoutDashboard, 
  Database, 
  FileCheck, 
  Camera, 
  Layers, 
  FileText,
  MapPin,
  Clock,
  ChevronRight
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
  onLoadSample,
  onExportJson,
  onImportJson,
  allInspections,
  onSelectInspection,
  lastSavedAt,
  isOnline,
  onOpenSecurityReview
}) => {
  const steps = [
    { id: 0, title: 'Painel', short: 'Início', icon: LayoutDashboard },
    { id: 1, title: 'Ficha SEMA', short: 'Ficha', icon: FileSpreadsheet },
    { id: 2, title: 'Componentes', short: 'Componentes', icon: Layers },
    { id: 3, title: 'Fotos', short: 'Fotos', icon: Camera },
    { id: 4, title: 'Conclusões', short: 'Conclusões', icon: FileText },
    { id: 5, title: 'Minutas', short: 'Minutas', icon: FileCheck },
    { id: 6, title: 'Banco de Dados', short: 'Banco', icon: Database }
  ];

  const photosCount = currentInspection.photos.length;
  const criticalCount = Object.values(currentInspection.componentsData || {}).filter(
    c => c.condition === 'critico'
  ).length;

  return (
    <header className="sticky top-0 z-40 bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl border-b border-slate-200/80 dark:border-slate-800 transition-all duration-200 shadow-2xs">
      {/* 1. Barra Superior Principal */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2.5 flex items-center justify-between gap-4">
        {/* Lado Esquerdo: Marca & Identidade */}
        <div 
          onClick={() => setActiveStep(0)} 
          className="flex items-center gap-3 cursor-pointer group select-none transition-transform duration-150 active:scale-[0.99]"
          title="Ir para o Painel Inicial"
        >
          <div className="relative">
            <FiscalizaLogo size="md" className="group-hover:scale-105 transition-transform duration-200" />
            <div className="absolute -inset-1 bg-emerald-500/10 rounded-2xl blur-xs group-hover:bg-emerald-500/20 transition-colors pointer-events-none" />
          </div>

          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-lg tracking-tight bg-gradient-to-r from-slate-900 via-slate-800 to-emerald-900 dark:from-white dark:via-slate-100 dark:to-emerald-300 bg-clip-text text-transparent group-hover:text-emerald-600 transition-colors">
                Fiscaliza MT
              </span>
              <span className="text-[10px] font-bold tracking-wider px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 uppercase">
                CSB / SEMA-MT
              </span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-none mt-0.5 hidden sm:block">
              Segurança de Barragens · Usos Múltiplos
            </p>
          </div>
        </div>

        {/* Centro: Navegação rápida visível em desktop */}
        <nav className="hidden md:flex items-center gap-1 bg-slate-100/80 dark:bg-slate-800/60 p-1 rounded-xl border border-slate-200/60 dark:border-slate-700/50">
          {steps.map(s => {
            const isActive = activeStep === s.id;
            const Icon = s.icon;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setActiveStep(s.id)}
                className={`relative px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                  isActive
                    ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-xs border border-slate-200/50 dark:border-slate-800'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-white/50 dark:hover:bg-slate-800/50'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 transition-colors ${isActive ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}`} />
                <span>{s.title}</span>
                {s.id === 6 && allInspections.length > 0 && (
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold tabular-nums ${
                    isActive 
                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' 
                      : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                  }`}>
                    {allInspections.length}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Lado Direito: Ações rápidas & Tema */}
        <div className="flex items-center gap-2">
          {/* Status Online/Offline */}
          <button
            type="button"
            onClick={onOpenSecurityReview}
            className={`hidden lg:flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer border ${
              isOnline 
                ? 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border-emerald-500/20'
                : 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-400 border-amber-500/20 animate-pulse'
            }`}
            title="Abrir painel de governança e revisão técnica"
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>{isOnline ? 'Sincronizado' : 'Modo Offline'}</span>
          </button>

          {/* Troca Rápida de Vistoria quando ativa */}
          {activeStep !== 0 && allInspections.length > 1 && (
            <div className="relative hidden xl:flex items-center">
              <FolderOpen className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 pointer-events-none" />
              <select
                value={currentInspection.id}
                onChange={e => onSelectInspection(e.target.value)}
                className="pl-7 pr-3 py-1.5 bg-slate-100/80 dark:bg-slate-800/80 text-slate-800 dark:text-slate-200 text-xs rounded-xl border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-1 focus:ring-emerald-500 max-w-[170px] truncate cursor-pointer"
              >
                {allInspections.map(item => (
                  <option key={item.id} value={item.id}>
                    {item.damIdentification.damName || item.damIdentification.propertyOrBusinessName || 'Vistoria ' + item.generalInfo.inspectionDate}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Nova Vistoria */}
          <button
            type="button"
            onClick={onNewInspection}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white text-xs font-bold transition shadow-xs cursor-pointer select-none"
            title="Iniciar nova ficha em branco"
          >
            <PlusCircle className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Nova Ficha</span>
          </button>

          {/* Backup JSON */}
          <button
            type="button"
            onClick={onExportJson}
            className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold transition border border-slate-200/60 dark:border-slate-700 cursor-pointer"
            title="Baixar backup dos dados desta vistoria em JSON"
          >
            <Download className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
            <span className="hidden md:inline">Backup</span>
          </button>

          {/* Alternador de Tema Claro / Escuro */}
          <ThemeToggle />
        </div>
      </div>

      {/* 2. Barra de Contexto da Barragem Ativa (visível durante o preenchimento/revisão) */}
      {activeStep !== 0 && (
        <div className="bg-slate-50/80 dark:bg-slate-950/70 border-t border-slate-200/60 dark:border-slate-800/80 px-4 sm:px-6 py-1.5 text-xs transition-colors">
          <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300 truncate">
              <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                Vistoria Ativa:
              </span>
              <span className="font-bold text-slate-900 dark:text-white truncate">
                {currentInspection.damIdentification.damName || '(Nome da barragem não preenchido)'}
              </span>
              <span className="text-slate-300 dark:text-slate-600">·</span>
              <span className="text-slate-500 dark:text-slate-400 flex items-center gap-1 truncate">
                <MapPin className="w-3 h-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span>{currentInspection.damIdentification.municipality || 'Mato Grosso'}/MT</span>
              </span>
              {currentInspection.damIdentification.coordinates.latitude && (
                <span className="hidden md:inline font-mono text-[11px] text-slate-400 dark:text-slate-500 tabular-nums">
                  [{formatGmsString(currentInspection.damIdentification.coordinates.latitude, true)}, {formatGmsString(currentInspection.damIdentification.coordinates.longitude, false)}]
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {criticalCount > 0 ? (
                <span className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-500/10 text-rose-700 dark:text-rose-400 text-[11px] font-semibold border border-rose-500/20">
                  <AlertTriangle className="w-3 h-3" />
                  <span>{criticalCount} ponto(s) crítico(s)</span>
                </span>
              ) : (
                <span className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 text-[11px] font-medium border border-emerald-500/20">
                  <CheckCircle2 className="w-3 h-3" />
                  <span>Condição estável</span>
                </span>
              )}

              <span className="text-slate-500 dark:text-slate-400 text-[11px] flex items-center gap-1">
                <Camera className="w-3 h-3 text-slate-400" />
                <span>{photosCount} foto(s)</span>
              </span>

              {lastSavedAt && (
                <span className="hidden sm:flex items-center gap-1 text-[10px] text-slate-400 font-mono">
                  <Clock className="w-2.5 h-2.5" />
                  <span>Salvo {lastSavedAt}</span>
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 3. Navegação móvel para telas menores (scroll horizontal suave) */}
      <div className="md:hidden overflow-x-auto scrollbar-none border-t border-slate-200/60 dark:border-slate-800 px-3 py-1.5 bg-slate-50/50 dark:bg-slate-900/50">
        <div className="flex items-center gap-1 min-w-max">
          {steps.map(s => {
            const isActive = activeStep === s.id;
            const Icon = s.icon;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setActiveStep(s.id)}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 ${
                  isActive
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{s.title}</span>
              </button>
            );
          })}
        </div>
      </div>
    </header>
  );
};
