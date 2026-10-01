// ==============================================================================
// ARQUIVO: src/components/Header.tsx
// Cabeçalho Oficial de Navegação da CSB/SEMA-MT
// Navegação integrada entre Painel de Controle, Ficha de Inspeção,
// Minutas Oficiais e Módulo de Banco de Dados
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
  FileText
} from 'lucide-react';
import { formatGmsString } from '../utils/geoCoordinates';
import { InspectionData } from '../types/inspection';
import { ThemeToggle } from './ThemeToggle';

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
    { id: 0, title: 'Painel de Controle', short: 'Painel', icon: LayoutDashboard },
    { id: 1, title: '1. Ficha SEMA-MT', short: 'Ficha SEMA', icon: FileSpreadsheet },
    { id: 2, title: '2. Componentes', short: 'Componentes', icon: Layers },
    { id: 3, title: '3. Fotos de Campo', short: 'Fotos', icon: Camera },
    { id: 4, title: '4. Conclusões & Notif.', short: 'Conclusões', icon: FileText },
    { id: 5, title: '5. Minutas Oficiais', short: 'Minutas', icon: FileCheck },
    { id: 6, title: 'Banco de Dados', short: 'Banco de Dados', icon: Database }
  ];

  const photosCount = currentInspection.photos.length;
  const criticalCount = Object.values(currentInspection.componentsData).filter(
    c => c.condition === 'critico'
  ).length;

  return (
    <header className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-md text-slate-800 dark:text-white border-b border-slate-200 dark:border-slate-800 sticky top-0 z-40 shadow-xs transition-colors duration-200">
      {/* Top Branding Bar */}
      <div className="max-w-7xl mx-auto px-3 sm:px-4 py-2 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/80 dark:border-slate-800/80">
        <div 
          onClick={() => setActiveStep(0)} 
          className="flex items-center gap-3 cursor-pointer group"
          title="Ir para a Página Inicial / Painel de Controle"
        >
          <div className="w-10 h-10 rounded-xl bg-emerald-600 group-hover:bg-emerald-500 flex items-center justify-center font-bold text-white shadow-sm ring-2 ring-emerald-500/20 dark:ring-emerald-400/30 transition">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-base tracking-tight text-slate-900 dark:text-white group-hover:text-emerald-600 dark:group-hover:text-emerald-300 transition">
                Fiscaliza
              </span>
              <span className="text-xs font-semibold px-2 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-700/50">
                CSB / SEMA-MT
              </span>
              <span className="hidden sm:inline-block text-xs text-slate-500 dark:text-slate-400">
                • Painel Oficial
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-none mt-0.5">
              Coordenadoria de Segurança de Barragens – Usos Múltiplos
            </p>
          </div>
        </div>

        {/* Quick Actions & Navigation Shortcuts & Theme Switcher */}
        <div className="flex items-center flex-wrap gap-2 text-xs">
          {/* Seletor de Visualização Claro / Escuro */}
          <div className="mr-1">
            <ThemeToggle />
          </div>

          {/* Botão para Voltar ao Painel (visível quando estiver dentro da ficha preenchendo) */}
          {activeStep !== 0 && (
            <button
              type="button"
              onClick={() => setActiveStep(0)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-semibold text-xs transition cursor-pointer border bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700"
              title="Voltar para a Página Inicial / Painel de Controle"
            >
              <LayoutDashboard className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>Painel</span>
            </button>
          )}

          {/* Auditoria / Status */}
          <button
            type="button"
            onClick={onOpenSecurityReview}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-semibold text-xs transition cursor-pointer border ${
              isOnline 
                ? 'bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/80 dark:hover:bg-emerald-900 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-700/60'
                : 'bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/80 dark:hover:bg-amber-900 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-700/60 animate-pulse'
            }`}
            title="Abrir painel de revisão operacional, LGPD, Supabase e pendências"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            <span className="hidden md:inline">{isOnline ? 'Auditoria SEMA' : 'Modo Offline'}</span>
          </button>

          <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800/90 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            <span className="font-mono text-[11px] text-slate-700 dark:text-slate-200 tabular-nums">
              {lastSavedAt || 'Agora'}
            </span>
          </div>

          {/* Seletor rápido de vistorias (apenas quando dentro da ficha preenchendo) */}
          {activeStep !== 0 && allInspections.length > 0 && (
            <div className="flex items-center gap-1">
              <FolderOpen className="w-3.5 h-3.5 text-slate-400 hidden sm:inline" />
              <select
                value={currentInspection.id}
                onChange={e => onSelectInspection(e.target.value)}
                className="bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs rounded-lg border border-slate-200 dark:border-slate-700 px-2 py-1 focus:ring-1 focus:ring-emerald-500 focus:outline-none max-w-[150px] sm:max-w-[180px] truncate"
                title="Trocar vistoria ativa no dispositivo"
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
            onClick={onNewInspection}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 font-medium transition cursor-pointer"
            title="Iniciar nova ficha de vistoria em branco"
          >
            <PlusCircle className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            <span className="hidden sm:inline">Nova</span>
          </button>

          {/* Exemplo Teste */}
          <button
            onClick={onLoadSample}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-900/60 font-medium transition cursor-pointer"
            title="Carregar exemplo didático de teste de campo"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400" />
            <span className="hidden xl:inline">Exemplo</span>
          </button>

          {/* Backup JSON */}
          <button
            onClick={onExportJson}
            className="flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 transition cursor-pointer"
            title="Baixar backup dos dados desta vistoria em JSON"
          >
            <Download className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
            <span className="hidden xl:inline">Backup</span>
          </button>

          <label className="flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 transition cursor-pointer" title="Importar arquivo de vistoria salvo em JSON">
            <Upload className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
            <span className="hidden xl:inline">Restaurar</span>
            <input
              type="file"
              accept=".json"
              onChange={onImportJson}
              className="hidden"
            />
          </label>
        </div>
      </div>

      {/* Dam identification strip - visível apenas dentro da ficha preenchendo */}
      {activeStep !== 0 && (
        <div className="bg-slate-100/70 dark:bg-slate-950 px-3 sm:px-4 py-1.5 text-xs flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/80 dark:border-slate-800/60 transition-colors">
          <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300 truncate">
            <span className="text-slate-500 font-semibold uppercase tracking-wider text-[10px]">
              Vistoria Ativa:
            </span>
            <span className="font-bold text-slate-900 dark:text-white truncate">
              {currentInspection.damIdentification.damName || '(Nome da barragem não preenchido)'}
            </span>
            <span className="text-slate-400">·</span>
            <span className="text-slate-600 dark:text-slate-400 truncate">
              {currentInspection.damIdentification.municipality || 'Mato Grosso'}/MT
            </span>
            {currentInspection.damIdentification.coordinates.latitude && (
              <span className="hidden md:inline text-slate-500 dark:text-slate-400 font-mono text-[11px] tabular-nums">
                [{formatGmsString(currentInspection.damIdentification.coordinates.latitude, true)}, {formatGmsString(currentInspection.damIdentification.coordinates.longitude, false)}]
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {criticalCount > 0 && (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded bg-rose-100 dark:bg-rose-950/80 text-rose-800 dark:text-rose-300 text-[11px] border border-rose-200 dark:border-rose-800/60 font-semibold">
                <AlertTriangle className="w-3 h-3 text-rose-600 dark:text-rose-400" />
                {criticalCount} ponto(s) crítico(s)
              </span>
            )}
            <span className="text-slate-600 dark:text-slate-400 text-[11px] bg-white dark:bg-slate-800/60 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700/50">
              {photosCount} foto(s)
            </span>
            {currentInspection.conclusions.requiresNotification && (
              <span className="text-amber-800 dark:text-amber-300 text-[11px] bg-amber-50 dark:bg-amber-950/60 px-2 py-0.5 rounded border border-amber-200 dark:border-amber-800/60 font-medium">
                Notificação ativa
              </span>
            )}
          </div>
        </div>
      )}

      {/* Navigation Steps / Tópicos da Ficha - visíveis apenas quando o usuário estiver dentro da ficha preenchendo a ficha */}
      {activeStep !== 0 && (
        <nav className="max-w-7xl mx-auto px-2 overflow-x-auto scrollbar-thin">
          <div className="flex min-w-max gap-1 py-1">
            {steps.map(s => {
              const isActive = activeStep === s.id;
              const Icon = s.icon;
              return (
                <button
                  key={s.id}
                  onClick={() => setActiveStep(s.id)}
                  className={`min-h-[40px] px-3.5 py-1.5 text-xs rounded-lg transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ${
                    isActive
                      ? 'bg-emerald-600 text-white font-bold shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-white' : 'text-slate-500 dark:text-slate-400'}`} />
                  <span>{s.title}</span>
                </button>
              );
            })}
          </div>
        </nav>
      )}
    </header>
  );
};

