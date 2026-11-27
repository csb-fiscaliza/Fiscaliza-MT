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
  Sunset,
  Network,
  ClipboardList,
  ClipboardCheck,
  FolderKanban
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
  onOpenEcosystemModal?: () => void;
  pendingAlterationCount?: number;
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
  onOpenChangePassword,
  onOpenEcosystemModal,
  pendingAlterationCount = 0
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
  const isPendenciasActive = activeStep === 8;
  const isSolicitacoesActive = activeStep === 9;
  const isMesaActive = activeStep === 10;
  const isSheetActive = activeStep >= 1 && activeStep <= 5;

  const userRole = (currentUser?.role || '').toLowerCase();
  const isAdmin = userRole === 'administrador' || userRole === 'admin';
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

  // Contagem de fichas locais pendentes de sincronização e conflitos
  const pendingCount = allInspections.filter(i => !i.syncStatus || i.syncStatus === 'local' || i.syncStatus === 'error').length;
  const conflictCount = allInspections.filter(i =>
    (i.conflitosSincronizacao || []).some(c => c.status === 'pendente')
  ).length;

  return (
    <header className="sticky top-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 shadow-sm transition-colors duration-200 select-none pt-[env(safe-area-inset-top,0px)]">
      {/* Barra superior de acento com gradiente verde oficial */}
      <div className="h-1 w-full bg-gradient-to-r from-emerald-800 via-emerald-600 to-teal-600" />

      {/* ===================================================================== */}
      {/* 1. NÍVEL SUPERIOR: IDENTIDADE INSTITUCIONAL + SESSÃO E CONTA          */}
      {/* ===================================================================== */}
      <div className="max-w-7xl 2xl:max-w-[1440px] mx-auto px-2.5 xs:px-3 sm:px-5 lg:px-6 pl-[max(0.625rem,env(safe-area-inset-left))] pr-[max(0.625rem,env(safe-area-inset-right))] py-2 flex flex-col xl:flex-row xl:items-center xl:justify-between gap-2 xl:gap-4">
        {/* Esquerda: Logo + Identidade Institucional (blindada contra colapso/sobreposição) */}
        <div
          onClick={() => setActiveStep(0)}
          className="flex items-center gap-2.5 sm:gap-3 cursor-pointer group w-full xl:w-auto min-w-0 xl:flex-1 overflow-hidden"
        >
          <div className="shrink-0">
            <FiscalizaLogo
              size="md"
              className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 group-hover:scale-105 transition-transform duration-200"
            />
          </div>

          <div className="flex flex-col justify-center min-w-0 flex-1">
            <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
              <span className="text-sm xs:text-base sm:text-xl xl:text-2xl font-black tracking-tight text-emerald-700 dark:text-emerald-400 leading-tight truncate">
                FISCALIZA - Etapa de Campo
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-700 dark:bg-emerald-600 text-white text-[9px] sm:text-[10px] font-black uppercase tracking-wider leading-none shadow-2xs shrink-0 whitespace-nowrap">
                <span>CSB</span>
                <span className="hidden xs:inline opacity-75">·</span>
                <span className="hidden xs:inline">SEMA-MT</span>
              </span>
            </div>

            <h2 className="text-[10px] xs:text-[11px] sm:text-xs font-bold text-slate-800 dark:text-slate-100 leading-snug mt-0.5 truncate">
              Coordenadoria de Segurança de Barragens – Usos Múltiplos
            </h2>

            <p className="hidden md:block text-[10px] sm:text-[11px] text-slate-500 dark:text-slate-400 leading-tight truncate">
              Superintendência de Recursos Hídricos (SURH) · Secretaria de Estado de Meio Ambiente de Mato Grosso
            </p>
          </div>
        </div>

        {/* Direita (ou abaixo alinhada à esquerda com a logo): Saudação ao Usuário e Controles de Conta / Exibição */}
        <div className="flex items-center justify-start xl:justify-end flex-wrap gap-1.5 sm:gap-2 w-full xl:w-auto shrink-0 max-w-full">
          {/* Caixa de Saudação ao Usuário conforme o horário */}
          <div className="flex items-center gap-2 px-2.5 py-1 rounded-xl bg-emerald-50/90 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800/80 shadow-2xs min-w-0 max-w-full">
            <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-lg bg-emerald-700 dark:bg-emerald-600 text-white flex items-center justify-center font-black text-[11px] sm:text-xs shadow-2xs uppercase shrink-0">
              {rawName.charAt(0)}
            </div>
            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-1 min-w-0">
                <GreetingIcon className="w-3 h-3 text-emerald-600 dark:text-emerald-400 shrink-0 hidden xs:block" />
                <span className="text-[11px] sm:text-xs font-extrabold text-slate-900 dark:text-emerald-200 leading-tight truncate max-w-[140px] xs:max-w-[180px] sm:max-w-[220px]">
                  {greetingText}
                </span>
              </div>
              <span className="text-[9px] sm:text-[10px] text-emerald-700 dark:text-emerald-400 font-bold uppercase tracking-wider leading-none mt-0.5 truncate">
                {currentUser?.role ? currentUser.role : (isAdmin ? 'Administrador' : 'Fiscal Técnico')}
              </span>
            </div>
          </div>

          <div className="flex items-center flex-wrap gap-1.5 shrink-0 max-w-full">
            {/* Conexão Online/Offline */}
            <div className="flex items-center gap-1.5 px-2 sm:px-2.5 py-1 rounded-lg text-[11px] font-semibold border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-300 whitespace-nowrap">
              {isOnline ? (
                <>
                  <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-2xs shadow-emerald-500/50 shrink-0" />
                  <span className="hidden xs:inline">Online</span>
                </>
              ) : (
                <>
                  <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse shrink-0" />
                  <span className="hidden xs:inline">Offline</span>
                </>
              )}
            </div>

            {/* Alterar Senha */}
            {onOpenChangePassword && (
              <button
                type="button"
                onClick={onOpenChangePassword}
                className="p-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:text-emerald-600 dark:hover:text-emerald-400 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 transition cursor-pointer"
                title="Alterar Senha"
                aria-label="Alterar Senha"
              >
                <KeyRound className="w-3.5 h-3.5" />
              </button>
            )}

            <ThemeToggle />

            {/* Logout / Sair */}
            {onLogout && (
              <button
                type="button"
                onClick={onLogout}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] sm:text-xs font-bold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/50 border border-rose-200 dark:border-rose-900/60 transition cursor-pointer whitespace-nowrap"
                title="Encerrar Sessão"
              >
                <LogOut className="w-3.5 h-3.5 shrink-0" />
                <span className="hidden sm:inline">Sair</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* 2. NÍVEL INFERIOR: NAVEGAÇÃO PRINCIPAL + STATUS OPERACIONAL E SISTEMA  */}
      {/* ===================================================================== */}
      <div className="border-t border-slate-200 dark:border-slate-800 bg-slate-50/95 dark:bg-slate-950/90 px-2.5 xs:px-3 sm:px-5 lg:px-6 pl-[max(0.625rem,env(safe-area-inset-left))] pr-[max(0.625rem,env(safe-area-inset-right))] py-1.5">
        <div className="max-w-7xl 2xl:max-w-[1440px] mx-auto flex flex-col lg:flex-row lg:flex-wrap lg:items-center lg:justify-between gap-1.5 lg:gap-y-1.5 lg:gap-x-3">
          {/* Esquerda (Desktop/Notebook): Botões de Navegação */}
          <nav className="hidden lg:flex items-center flex-wrap gap-1.5">
            {/* Link 1: Painel */}
            <button
              type="button"
              onClick={() => setActiveStep(0)}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs whitespace-nowrap ${
                isPanelActive
                  ? 'bg-emerald-700 text-white shadow-emerald-700/25 ring-2 ring-emerald-700/20'
                  : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-300/80 dark:border-slate-700'
              }`}
            >
              <LayoutDashboard className="w-3.5 h-3.5 shrink-0" />
              <span>Painel</span>
            </button>

            {/* Link 2: Ficha (inclui Ficha, Estruturas, Fotos, Conclusão e Minutas) */}
            <button
              type="button"
              onClick={() => setActiveStep(1)}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs whitespace-nowrap ${
                isSheetActive
                  ? 'bg-emerald-700 text-white shadow-emerald-700/25 ring-2 ring-emerald-700/20'
                  : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-300/80 dark:border-slate-700'
              }`}
            >
              <FileSpreadsheet className={`w-3.5 h-3.5 shrink-0 ${isSheetActive ? 'text-white' : 'text-emerald-600 dark:text-emerald-400'}`} />
              <span>Ficha</span>
            </button>

            {/* Link 3: Nova Ficha */}
            {!isVisualizador && (
              <button
                type="button"
                onClick={onNewInspection}
                className="px-3 py-1 rounded-lg text-xs font-bold bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-300/80 dark:border-slate-700 hover:border-emerald-500 transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs whitespace-nowrap"
              >
                <PlusCircle className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span>Nova Ficha</span>
              </button>
            )}

            {/* Link 4: Salvar Vistoria */}
            {!isVisualizador && (
              <button
                type="button"
                onClick={onSave}
                className="px-3 py-1 rounded-lg text-xs font-bold bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-slate-800 border border-emerald-300 dark:border-emerald-800 hover:border-emerald-500 transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs whitespace-nowrap"
              >
                <Save className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span>Salvar</span>
              </button>
            )}

            {/* Link 5: Banco de Dados */}
            <button
              type="button"
              onClick={() => setActiveStep(6)}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs whitespace-nowrap ${
                isDatabaseActive
                  ? 'bg-emerald-700 text-white shadow-emerald-700/25 ring-2 ring-emerald-700/20'
                  : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-300/80 dark:border-slate-700'
              }`}
            >
              <Database className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400 shrink-0" />
              <span>Banco de Dados</span>
              {allInspections.length > 0 && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-black tabular-nums ${
                  isDatabaseActive
                    ? 'bg-white/25 text-white'
                    : 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800'
                }`}>
                  {allInspections.length}
                </span>
              )}
            </button>

            {/* Link 6: Pendências */}
            <button
              type="button"
              onClick={() => setActiveStep(8)}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs whitespace-nowrap ${
                isPendenciasActive
                  ? 'bg-emerald-700 text-white shadow-emerald-700/25 ring-2 ring-emerald-700/20'
                  : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-300/80 dark:border-slate-700'
              }`}
            >
              <ClipboardList className={`w-3.5 h-3.5 shrink-0 ${isPendenciasActive ? 'text-white' : 'text-emerald-600 dark:text-emerald-400'}`} />
              <span>Pendências</span>
            </button>

            {/* Link 7: Solicitações de Vistoria */}
            <button
              type="button"
              onClick={() => setActiveStep(9)}
              title="Solicitações de Vistoria (Classifica, Notifica e Administra)"
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs whitespace-nowrap shrink-0 ${
                isSolicitacoesActive
                  ? 'bg-emerald-700 text-white shadow-emerald-700/25 ring-2 ring-emerald-700/20'
                  : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-300/80 dark:border-slate-700'
              }`}
            >
              <ClipboardCheck className={`w-3.5 h-3.5 shrink-0 ${isSolicitacoesActive ? 'text-white' : 'text-emerald-600 dark:text-emerald-400'}`} />
              <span>Solicitações</span>
            </button>

            {/* Link 8: Mesa Virtual (V1) */}
            <button
              type="button"
              onClick={() => setActiveStep(10)}
              title="Mesa Virtual: Meus documentos, Todos documentos CSB, Retificação e Mapa sincronizado"
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs whitespace-nowrap shrink-0 ${
                isMesaActive
                  ? 'bg-emerald-700 text-white shadow-emerald-700/25 ring-2 ring-emerald-700/20'
                  : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-300/80 dark:border-slate-700'
              }`}
            >
              <FolderKanban className={`w-3.5 h-3.5 shrink-0 ${isMesaActive ? 'text-white' : 'text-emerald-600 dark:text-emerald-400'}`} />
              <span>Mesa Virtual</span>
              {conflictCount > 0 && (
                <span className="px-1.5 py-0.5 rounded-md bg-rose-600 text-white text-[10px] font-black tabular-nums">
                  {conflictCount}
                </span>
              )}
            </button>

            {/* Link 6: Usuários (Admin) */}
            {isAdmin && (
              <button
                type="button"
                onClick={() => setActiveStep(7)}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs whitespace-nowrap ${
                  isUsersActive
                    ? 'bg-purple-700 text-white shadow-purple-700/25 ring-2 ring-purple-700/20'
                    : 'bg-white dark:bg-slate-900 text-purple-700 dark:text-purple-300 hover:bg-purple-50 dark:hover:bg-slate-800 border border-purple-200 dark:border-purple-900/60'
                }`}
              >
                <Users className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400 shrink-0" />
                <span>Usuários</span>
                <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-black uppercase tracking-wider ${
                  isUsersActive
                    ? 'bg-white/25 text-white'
                    : 'bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300 border border-purple-300 dark:border-purple-800'
                }`}>
                  Admin
                </span>
              </button>
            )}
          </nav>

          {/* Direita (Todos os aparelhos): Ferramentas Operacionais, Sincronização e Contexto da Ficha */}
          <div className="flex items-center justify-between lg:justify-end flex-wrap gap-1.5 w-full lg:w-auto">
            <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none max-w-full py-0.5">
              {/* Sincronização Local / Nuvem */}
              {pendingCount > 0 ? (
                <button
                  type="button"
                  onClick={onSyncNow}
                  disabled={isSyncing || !isOnline}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all shadow-2xs border whitespace-nowrap shrink-0 ${
                    !isOnline
                      ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-800 cursor-default'
                      : 'bg-amber-500 hover:bg-amber-600 text-white border-amber-600 hover:shadow-amber-500/20 cursor-pointer'
                  }`}
                >
                  <RefreshCw className={`w-3.5 h-3.5 shrink-0 ${isSyncing ? 'animate-spin' : ''}`} />
                  <span className="hidden sm:inline">
                    {isSyncing ? 'Sincronizando...' : `${pendingCount} Salvo(s) Localmente`}
                  </span>
                  <span className="sm:hidden font-mono">
                    {isSyncing ? 'Sync...' : `${pendingCount} Local`}
                  </span>
                </button>
              ) : (
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60 whitespace-nowrap shrink-0">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <span>Sincronizado</span>
                </div>
              )}

              {/* Fila de Fotos */}
              <button
                type="button"
                onClick={onOpenPhotoQueueModal}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all shadow-2xs border cursor-pointer whitespace-nowrap shrink-0 ${
                  photoQueuePending > 0
                    ? 'bg-amber-500/10 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-800 hover:bg-amber-500/20'
                    : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <Camera className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span>Fotos</span>
                {photoQueuePending > 0 ? (
                  <span className="px-1.5 py-0.5 rounded-full bg-amber-500 text-white text-[10px] font-mono font-bold animate-pulse">
                    {photoQueuePending}
                  </span>
                ) : (
                  <span className="text-[10px] text-slate-400 font-mono">0</span>
                )}
              </button>

              {/* Ecossistema CSB (Administra, Classifica, Notifica) */}
              {onOpenEcosystemModal && (
                <button
                  type="button"
                  onClick={onOpenEcosystemModal}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/50 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 border border-indigo-200 dark:border-indigo-800 transition cursor-pointer whitespace-nowrap shrink-0"
                  title="Integração com Administra Barragens, Classifica e Notifica"
                >
                  <Network className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                  <span>Ecossistema CSB</span>
                  {pendingAlterationCount > 0 && (
                    <span className="px-1.5 py-0.5 rounded-full bg-amber-500 text-slate-950 text-[10px] font-black">
                      {pendingAlterationCount}
                    </span>
                  )}
                </button>
              )}

              {/* Criptografia Ativa */}
              <button
                type="button"
                onClick={onOpenSecurityReview}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 transition cursor-pointer whitespace-nowrap shrink-0"
                title="Auditoria de Segurança e Criptografia"
              >
                <Lock className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span>Criptografia</span>
              </button>
            </div>

            {/* Contexto da Vistoria Ativa (compacto e sem espremer os botões) */}
            {isSheetActive && (
              <div className="hidden xl:flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-slate-400 bg-white/80 dark:bg-slate-900/80 px-2.5 py-1 rounded-lg border border-slate-200/80 dark:border-slate-800/80 max-w-[260px] min-w-0">
                <span className="font-bold text-slate-800 dark:text-slate-200 truncate">
                  {currentInspection.damIdentification.damName || 'Vistoria ativa'}
                </span>
                <span className="text-slate-300 dark:text-slate-700 shrink-0">·</span>
                <span className="flex items-center gap-1 text-[10px] truncate font-medium shrink-0 max-w-[95px]">
                  <MapPin className="w-3 h-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <span className="truncate">{currentInspection.damIdentification.municipality || 'MT'}</span>
                </span>
                {lastSavedAt && (
                  <span className="hidden 2xl:flex items-center gap-1 text-[10px] text-slate-500 dark:text-slate-400 font-mono shrink-0">
                    <Clock className="w-2.5 h-2.5" />
                    <span>{lastSavedAt}</span>
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
