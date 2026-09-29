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
import { InspectionData } from '../types/inspection';

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
    <header className="bg-slate-900 text-white border-b border-slate-800 sticky top-0 z-40 shadow-md">
      {/* Top Branding Bar */}
      <div className="max-w-7xl mx-auto px-3 sm:px-4 py-2 flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/80">
        <div 
          onClick={() => setActiveStep(0)} 
          className="flex items-center gap-3 cursor-pointer group"
          title="Ir para a Página Inicial / Painel de Controle"
        >
          <div className="w-10 h-10 rounded-xl bg-emerald-600 group-hover:bg-emerald-500 flex items-center justify-center font-bold text-white shadow-sm ring-2 ring-emerald-400/30 transition">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-base tracking-tight text-white group-hover:text-emerald-300 transition">
                Fiscaliza
              </span>
              <span className="text-xs font-semibold px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-700/50">
                CSB / SEMA-MT
              </span>
              <span className="hidden sm:inline-block text-xs text-slate-400">
                • Painel Oficial
              </span>
            </div>
            <p className="text-xs text-slate-400 leading-none mt-0.5">
              Coordenadoria de Segurança de Barragens – Usos Múltiplos
            </p>
          </div>
        </div>

        {/* Quick Actions & Navigation Shortcuts */}
        <div className="flex items-center flex-wrap gap-2 text-xs">
          {/* Botão de Atalho para o Painel */}
          <button
            type="button"
            onClick={() => setActiveStep(0)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded font-semibold text-xs transition cursor-pointer border ${
              activeStep === 0
                ? 'bg-emerald-600 text-white border-emerald-500'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
            }`}
            title="Ir para o Painel de Controle inicial"
          >
            <LayoutDashboard className="w-3.5 h-3.5 text-emerald-400" />
            <span className="hidden sm:inline">Painel</span>
          </button>

          {/* Botão de Atalho para o Banco de Dados */}
          <button
            type="button"
            onClick={() => setActiveStep(6)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded font-semibold text-xs transition cursor-pointer border ${
              activeStep === 6
                ? 'bg-emerald-600 text-white border-emerald-500'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
            }`}
            title="Abrir Módulo de Banco de Dados de vistorias"
          >
            <Database className="w-3.5 h-3.5 text-emerald-400" />
            <span>Banco de Dados</span>
            <span className="text-[10px] bg-slate-700 px-1.5 py-0.2 rounded-full font-bold">
              {allInspections.length}
            </span>
          </button>

          {/* Auditoria / Status */}
          <button
            type="button"
            onClick={onOpenSecurityReview}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded font-semibold text-xs transition cursor-pointer border ${
              isOnline 
                ? 'bg-emerald-950/80 hover:bg-emerald-900 text-emerald-300 border-emerald-700/60'
                : 'bg-amber-950/80 hover:bg-amber-900 text-amber-300 border-amber-700/60 animate-pulse'
            }`}
            title="Abrir painel de revisão operacional, LGPD, Supabase e pendências"
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span className="hidden md:inline">{isOnline ? 'Auditoria SEMA' : 'Modo Offline'}</span>
          </button>

          <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-800/90 text-slate-300 border border-slate-700">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            <span className="font-mono text-[11px] text-slate-200">
              {lastSavedAt || 'Agora'}
            </span>
          </div>

          {/* Seletor rápido de vistorias */}
          {allInspections.length > 0 && (
            <div className="flex items-center gap-1">
              <FolderOpen className="w-3.5 h-3.5 text-slate-400 hidden sm:inline" />
              <select
                value={currentInspection.id}
                onChange={e => onSelectInspection(e.target.value)}
                className="bg-slate-800 text-slate-200 text-xs rounded border border-slate-700 px-2 py-1 focus:ring-1 focus:ring-emerald-500 focus:outline-none max-w-[150px] sm:max-w-[180px] truncate"
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
            className="flex items-center gap-1 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-medium transition cursor-pointer"
            title="Iniciar nova ficha de vistoria em branco"
          >
            <PlusCircle className="w-3.5 h-3.5 text-emerald-400" />
            <span className="hidden sm:inline">Nova</span>
          </button>

          {/* Exemplo Teste */}
          <button
            onClick={onLoadSample}
            className="flex items-center gap-1 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-900/60 font-medium transition cursor-pointer"
            title="Carregar exemplo didático de teste de campo"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span className="hidden xl:inline">Exemplo</span>
          </button>

          {/* Backup JSON */}
          <button
            onClick={onExportJson}
            className="flex items-center gap-1 px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition cursor-pointer"
            title="Baixar backup dos dados desta vistoria em JSON"
          >
            <Download className="w-3.5 h-3.5 text-sky-400" />
            <span className="hidden xl:inline">Backup</span>
          </button>

          <label className="flex items-center gap-1 px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition cursor-pointer" title="Importar arquivo de vistoria salvo em JSON">
            <Upload className="w-3.5 h-3.5 text-slate-400" />
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

      {/* Dam identification strip */}
      <div className="bg-slate-950 px-3 sm:px-4 py-1 text-xs flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/60">
        <div className="flex items-center gap-2 text-slate-300 truncate">
          <span className="text-slate-500 font-semibold uppercase tracking-wider text-[10px]">
            Vistoria Ativa:
          </span>
          <span className="font-bold text-white truncate">
            {currentInspection.damIdentification.damName || '(Nome da barragem não preenchido)'}
          </span>
          <span className="text-slate-500">•</span>
          <span className="text-slate-400 truncate">
            {currentInspection.damIdentification.municipality || 'Mato Grosso'}/MT
          </span>
          {currentInspection.damIdentification.coordinates.latitude && (
            <span className="hidden md:inline text-slate-500 font-mono text-[11px]">
              [{currentInspection.damIdentification.coordinates.latitude}, {currentInspection.damIdentification.coordinates.longitude}]
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {criticalCount > 0 && (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded bg-rose-950/80 text-rose-300 text-[11px] border border-rose-800/60 font-semibold">
              <AlertTriangle className="w-3 h-3 text-rose-400" />
              {criticalCount} ponto(s) crítico(s)
            </span>
          )}
          <span className="text-slate-400 text-[11px] bg-slate-800/60 px-2 py-0.5 rounded border border-slate-700/50">
            {photosCount} foto(s)
          </span>
          {currentInspection.conclusions.requiresNotification && (
            <span className="text-amber-300 text-[11px] bg-amber-950/60 px-2 py-0.5 rounded border border-amber-800/60 font-medium">
              Notificação ativa
            </span>
          )}
        </div>
      </div>

      {/* Navigation Steps / Tabs */}
      <nav className="max-w-7xl mx-auto px-2 overflow-x-auto scrollbar-thin">
        <div className="flex min-w-max gap-0.5">
          {steps.map(s => {
            const isActive = activeStep === s.id;
            const Icon = s.icon;
            return (
              <button
                key={s.id}
                onClick={() => setActiveStep(s.id)}
                className={`min-h-[42px] px-3.5 py-2 text-xs font-medium border-b-2 transition flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                  isActive
                    ? 'border-emerald-500 text-emerald-400 bg-slate-800/60 font-bold'
                    : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/30'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-emerald-400' : 'text-slate-400'}`} />
                <span>{s.title}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </header>
  );
};
