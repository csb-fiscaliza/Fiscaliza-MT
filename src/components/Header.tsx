// ==============================================================================
// ARQUIVO: src/components/Header.tsx
// Cabeçalho Oficial do Sistema Fiscaliza MT (CSB / SEMA-MT)
// Nível Superior: Logo, Identidade Institucional Completa e Saudação ao Usuário
// Nível Inferior: Botões de Links e Ações Rápidas de Navegação
// ==============================================================================

import React from 'react';
import { 
  LayoutDashboard, 
  PlusCircle, 
  Database,
  FileSpreadsheet,
  MapPin,
  Clock,
  Save,
  RefreshCw,
  CheckCircle2,
  Lock,
  Camera,
  KeyRound,
  LogOut,
  Users,
  Sun,
  Moon,
  Sunset
} from 'lucide-react';
import { InspectionData } from '../types/inspection';
import { getPhotoQueueSummary, subscribePhotoQueue } from '../services/photoSyncQueueService';
import { ThemeToggle } from './ThemeToggle';
import { FiscalizaLogo } from './FiscalizaLogo';

interface HeaderProps {
  currentInspection: InspectionData;
  activeStep: number;
  setActiveStep: (step: number) => void;
  onNewInspection: () => void;
  onSave: () => void;
  onExportJson: () => void;
  onImportJson: (e: React.ChangeEvent<HTMLInputElement>) => void;
  allInspections: InspectionData[];
  onSelectInspection: (id: string) => void;
  lastSavedAt: string | null;
  isOnline: boolean;
  onOpenSecurityReview: () => void;
  onSyncNow?: () => void;
  isSyncing?: boolean;
  onOpenAuthModal?: () => void;
  onOpenPhotoQueueModal?: () => void;
  currentUser?: { email?: string; fullName?: string; role?: string } | null;
  onLogout?: () => void;
  onOpenChangePassword?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentInspection,
  activeStep,
  setActiveStep,
  onNewInspection,
  onSave,
  allInspections,
  lastSavedAt,
  isOnline,
  onOpenSecurityReview,
  onSyncNow,
  isSyncing = false,
  onOpenPhotoQueueModal,
  currentUser,
  onLogout,
  onOpenChangePassword
}) => {
  const [photoQueuePending, setPhotoQueuePending] = React.useState(0);

  React.useEffect(() => {
    let active = true;
    const fetchQueueStats = async () => {
      try {
        const sum = await getPhotoQueueSummary();
        if (active) setPhotoQueuePending(sum.pending + sum.error);
      } catch {}
    };
    fetchQueueStats();
    const unsubscribe = subscribePhotoQueue(() => {
      fetchQueueStats();
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const isPanelActive = activeStep === 0;
  const isDatabaseActive = activeStep === 6;
  const isUsersActive = activeStep === 7;
  const isSheetActive = activeStep >= 1 && activeStep <= 5;

  const userRole = (currentUser?.role || '').toLowerCase();
  const isAdmin = userRole === 'administrador' || userRole === 'admin' || 
    currentUser?.email?.toLowerCase() === 'yarageologa@gmail.com' || 
    currentUser?.email?.toLowerCase() === 'csb.fiscaliza@sema.mt.gov.br';
  const isVisualizador = userRole === 'visualizador';

  // Saudação dinâmica conforme o horário do dia
  const currentHour = new Date().getHours();
  let greetingPeriod = 'boa tarde';
  let GreetingIcon = Sunset;

  if (currentHour >= 5 && currentHour < 12) {
    greetingPeriod = 'bom dia';
    GreetingIcon = Sun;
  } else if (currentHour >= 12 && currentHour < 18) {
    greetingPeriod = 'boa tarde';
    GreetingIcon = Sunset;
  } else {
    greetingPeriod = 'boa noite';
    GreetingIcon = Moon;
  }

  const rawName = currentUser?.fullName?.trim() || 
    (currentUser?.email ? currentUser.email.split('@')[0] : 'Fiscal Técnico');
  const greetingText = `Olá ${rawName}, ${greetingPeriod}`;

  // Contagem de fichas locais pendentes de sincronização
  const pendingCount = allInspections.filter(i => !i.syncStatus || i.syncStatus === 'local' || i.syncStatus === 'error').length;

  return (
    <header className="sticky top-0 z-40 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 shadow-md transition-colors duration-200 select-none">
      {/* Barra superior de acento com gradiente verde oficial */}
      <div className="h-1.5 w-full bg-gradient-to-r from-emerald-800 via-emerald-600 to-teal-600" />

      {/* ===================================================================== */}
      {/* 1. SEÇÃO SUPERIOR: IDENTIDADE INSTITUCIONAL E SAUDAÇÃO AO USUÁRIO     */}
      {/* ===================================================================== */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3.5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        {/* Bloco Institucional: Logo, Nome Fiscaliza, Selo Redondo e Subtítulos */}
        <div 
          onClick={() => setActiveStep(0)} 
          className="flex items-center gap-3.5 sm:gap-4 cursor-pointer group shrink-0"
        >
          {/* Logo Oficial Quadrado com Cantos Arredondados */}
          <div className="shrink-0">
            <FiscalizaLogo 
              size="lg" 
              className="rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 group-hover:scale-105 transition-transform duration-200" 
            />
          </div>

          {/* Textos da Identidade Institucional */}
          <div className="flex flex-col justify-center">
            {/* Linha 1: Fiscaliza em verde + Selo Redondo CSB/SEMA-MT */}
            <div className="flex items-center gap-2.5">
              <span className="text-2xl sm:text-3xl font-black tracking-tight text-emerald-700 dark:text-emerald-400 leading-none">
                Fiscaliza
              </span>
              <span className="inline-flex flex-col items-center justify-center px-2.5 py-0.5 rounded-full bg-emerald-700 dark:bg-emerald-600 text-white text-[9px] sm:text-[10px] font-black uppercase tracking-wider leading-tight shadow-xs">
                <span>CSB /</span>
                <span>SEMA-MT</span>
              </span>
            </div>

            {/* Linha 2: Coordenadoria de Segurança de Barragens */}
            <h2 className="text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-100 leading-snug mt-1">
              Coordenadoria de Segurança de Barragens – Usos Múltiplos
            </h2>

            {/* Linha 3: Superintendência e Secretaria de Meio Ambiente */}
            <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 leading-tight">
              Superintendência de Recursos Hídricos (SURH) · Secretaria de Estado de Meio Ambiente de Mato Grosso
            </p>
          </div>
        </div>

        {/* Lado Direito Superior: Saudação ao Usuário e Controles de Acesso */}
        <div className="flex items-center flex-wrap gap-2.5 sm:gap-3 shrink-0">
          {/* Caixa de Saudação ao Usuário conforme o horário */}
          <div className="flex items-center gap-2.5 px-3.5 py-2 rounded-xl bg-emerald-50/90 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800/80 shadow-2xs">
            <div className="w-8 h-8 rounded-lg bg-emerald-700 dark:bg-emerald-600 text-white flex items-center justify-center font-black text-xs shadow-xs uppercase shrink-0">
              {rawName.charAt(0)}
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-1.5">
                <GreetingIcon className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span className="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-emerald-200 leading-none">
                  {greetingText}
                </span>
              </div>
              <span className="text-[10px] text-emerald-700 dark:text-emerald-400 font-bold uppercase tracking-wider mt-0.5">
                {currentUser?.role ? currentUser.role : (isAdmin ? 'Administrador' : 'Fiscal Técnico')}
              </span>
            </div>
          </div>

          {/* Sincronização Local / Nuvem */}
          {pendingCount > 0 ? (
            <button
              type="button"
              onClick={onSyncNow}
              disabled={isSyncing || !isOnline}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all shadow-2xs border ${
                !isOnline
                  ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-800 cursor-default'
                  : 'bg-amber-500 hover:bg-amber-600 text-white border-amber-600 hover:shadow-amber-500/20 cursor-pointer'
              }`}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">
                {isSyncing ? 'Sincronizando...' : `${pendingCount} Salvo(s) Localmente`}
              </span>
              <span className="sm:hidden font-mono">
                {isSyncing ? 'Sync...' : `${pendingCount} Local`}
              </span>
            </button>
          ) : (
            <div 
              className="hidden xl:flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60"
            >
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>Sincronizado</span>
            </div>
          )}

          {/* Fila de Fotos */}
          <button
            type="button"
            onClick={onOpenPhotoQueueModal}
            className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-bold transition-all shadow-2xs border cursor-pointer ${
              photoQueuePending > 0
                ? 'bg-amber-500/10 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-800 hover:bg-amber-500/20'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            <Camera className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            <span className="hidden sm:inline">Fotos</span>
            {photoQueuePending > 0 ? (
              <span className="px-1.5 py-0.2 rounded-full bg-amber-500 text-white text-[10px] font-mono font-bold animate-pulse">
                {photoQueuePending}
              </span>
            ) : (
              <span className="hidden md:inline text-[10px] text-slate-400 font-mono">0</span>
            )}
          </button>

          {/* Criptografia Ativa */}
          <button
            type="button"
            onClick={onOpenSecurityReview}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 transition cursor-pointer"
          >
            <Lock className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            <span className="hidden xl:inline">Criptografia</span>
          </button>

          {/* Alterar Senha */}
          {onOpenChangePassword && (
            <button
              type="button"
              onClick={onOpenChangePassword}
              className="p-1.5 rounded-xl text-slate-600 dark:text-slate-300 hover:text-emerald-600 dark:hover:text-emerald-400 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 transition cursor-pointer"
              title="Alterar Senha"
            >
              <KeyRound className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Logout / Sair */}
          {onLogout && (
            <button
              type="button"
              onClick={onLogout}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-bold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/50 border border-rose-200 dark:border-rose-900/60 transition cursor-pointer"
              title="Encerrar Sessão"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Sair</span>
            </button>
          )}

          {/* Conexão Online/Offline */}
          <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-300">
            {isOnline ? (
              <>
                <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-xs shadow-emerald-500/50" />
                <span>Online</span>
              </>
            ) : (
              <>
                <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                <span>Offline</span>
              </>
            )}
          </div>

          <ThemeToggle />
        </div>
      </div>

      {/* ===================================================================== */}
      {/* 2. SEÇÃO INFERIOR: BOTÕES DE LINKS DE NAVEGAÇÃO ABAIXO                */}
      {/* ===================================================================== */}
      <div className="border-t border-slate-200 dark:border-slate-800 bg-slate-50/95 dark:bg-slate-950/90 px-4 sm:px-6 py-2">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          {/* Botões de Links */}
          <nav className="flex items-center flex-wrap gap-1.5 sm:gap-2">
            {/* Link 1: Painel */}
            <button
              type="button"
              onClick={() => setActiveStep(0)}
              className={`px-3.5 py-1.5 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center gap-2 cursor-pointer shadow-xs ${
                isPanelActive
                  ? 'bg-emerald-700 text-white shadow-emerald-700/30 ring-2 ring-emerald-700/20'
                  : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-300/80 dark:border-slate-700'
              }`}
            >
              <LayoutDashboard className="w-4 h-4" />
              <span>Painel</span>
            </button>

            {/* Link 2: Nova Ficha */}
            {!isVisualizador && (
              <button
                type="button"
                onClick={onNewInspection}
                className="px-3.5 py-1.5 rounded-xl text-xs sm:text-sm font-bold bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-300/80 dark:border-slate-700 hover:border-emerald-500 transition-all flex items-center gap-2 cursor-pointer shadow-xs"
              >
                <PlusCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span>Nova Ficha</span>
              </button>
            )}

            {/* Link 3: Salvar Vistoria */}
            {!isVisualizador && (
              <button
                type="button"
                onClick={onSave}
                className="px-3.5 py-1.5 rounded-xl text-xs sm:text-sm font-bold bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-slate-800 border border-emerald-300 dark:border-emerald-800 hover:border-emerald-500 transition-all flex items-center gap-2 cursor-pointer shadow-xs"
              >
                <Save className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span>Salvar</span>
              </button>
            )}

            {/* Link 4: Banco de Dados */}
            <button
              type="button"
              onClick={() => setActiveStep(6)}
              className={`px-3.5 py-1.5 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center gap-2 cursor-pointer shadow-xs ${
                isDatabaseActive
                  ? 'bg-emerald-700 text-white shadow-emerald-700/30 ring-2 ring-emerald-700/20'
                  : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-300/80 dark:border-slate-700'
              }`}
            >
              <Database className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
              <span>Banco de Dados</span>
              {allInspections.length > 0 && (
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-black tabular-nums ${
                  isDatabaseActive
                    ? 'bg-white/25 text-white'
                    : 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800'
                }`}>
                  {allInspections.length}
                </span>
              )}
            </button>

            {/* Link 5: Usuários (Admin) */}
            {isAdmin && (
              <button
                type="button"
                onClick={() => setActiveStep(7)}
                className={`px-3.5 py-1.5 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center gap-2 cursor-pointer shadow-xs ${
                  isUsersActive
                    ? 'bg-purple-700 text-white shadow-purple-700/30 ring-2 ring-purple-700/20'
                    : 'bg-white dark:bg-slate-900 text-purple-700 dark:text-purple-300 hover:bg-purple-50 dark:hover:bg-slate-800 border border-purple-200 dark:border-purple-900/60'
                }`}
              >
                <Users className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                <span>Usuários</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-black uppercase tracking-wider ${
                  isUsersActive 
                    ? 'bg-white/25 text-white' 
                    : 'bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300 border border-purple-300 dark:border-purple-800'
                }`}>
                  Admin
                </span>
              </button>
            )}

            {/* Link 6: Ficha em Edição */}
            {isSheetActive && (
              <button
                type="button"
                onClick={() => setActiveStep(1)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-100/90 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-200 border border-emerald-300 dark:border-emerald-700 shadow-2xs cursor-pointer"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                <span>Ficha em Edição</span>
              </button>
            )}
          </nav>

          {/* Contexto da Vistoria Ativa */}
          {isSheetActive && (
            <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400 truncate bg-white/70 dark:bg-slate-900/70 px-3 py-1 rounded-xl border border-slate-200/80 dark:border-slate-800/80">
              <span className="font-bold text-slate-800 dark:text-slate-200 truncate">
                {currentInspection.damIdentification.damName || 'Vistoria em preenchimento'}
              </span>
              <span className="text-slate-300 dark:text-slate-700">·</span>
              <span className="flex items-center gap-1 text-[11px] truncate font-medium">
                <MapPin className="w-3 h-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span>{currentInspection.damIdentification.municipality || 'Mato Grosso'}/MT</span>
              </span>
              {lastSavedAt && (
                <span className="hidden lg:flex items-center gap-1 text-[10px] text-slate-500 dark:text-slate-400 font-mono">
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
