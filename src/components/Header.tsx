// ==============================================================================
// ARQUIVO: src/components/Header.tsx
// Cabeçalho Oficial do Sistema Fiscaliza MT (CSB / SEMA-MT)
// Nível Superior: Identidade Visual (Logo + Nome + Órgão), Saudação Personalizada
// Nível Inferior: Barra de Navegação e Atalhos Rápidos do Sistema
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
  WifiOff,
  Save,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Lock,
  CloudCheck,
  CloudOff,
  UserCheck,
  Camera,
  CloudUpload,
  KeyRound,
  LogOut,
  User,
  Users,
  ShieldCheck,
  SunMedium,
  Sparkles
} from 'lucide-react';
import { formatGmsString } from '../utils/geoCoordinates';
import { InspectionData } from '../types/inspection';
import { getPhotoQueueSummary, subscribePhotoQueue } from '../services/photoSyncQueueService';
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
  onOpenAuthModal,
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

  // Saudação dinâmica conforme horário oficial
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return 'bom dia';
    if (hour >= 12 && hour < 18) return 'boa tarde';
    return 'boa noite';
  };

  const rawName = currentUser?.fullName?.trim() || 
    (currentUser?.email ? currentUser.email.split('@')[0] : 'Fiscal Técnico');
  const greetingText = `Olá ${rawName}, ${getGreeting()}`;

  // Contagem de fichas locais pendentes de sincronização
  const pendingCount = allInspections.filter(i => !i.syncStatus || i.syncStatus === 'local' || i.syncStatus === 'error').length;

  return (
    <header className="sticky top-0 z-40 bg-white dark:bg-slate-900 border-b border-slate-200/90 dark:border-slate-800 transition-colors duration-200 shadow-md select-none">
      {/* Faixa decorativa superior com gradiente oficial do Governo de MT */}
      <div className="h-1.5 w-full bg-gradient-to-r from-emerald-700 via-emerald-500 to-teal-600 shadow-xs" />

      {/* ===================================================================== */}
      {/* 1. LINHA SUPERIOR: LOGO COM NOME DO SISTEMA ACIMA E SAUDAÇÃO HORÁRIA  */}
      {/* ===================================================================== */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex flex-col md:flex-row md:items-center justify-between gap-3 sm:gap-4">
        {/* Identidade Visual Completa: Logo + Nome do Sistema + Órgão */}
        <div 
          onClick={() => setActiveStep(0)} 
          className="flex items-center gap-3.5 cursor-pointer group"
          title="Ir para o Painel Inicial"
        >
          <div className="relative shrink-0">
            <FiscalizaLogo size="lg" className="shadow-md rounded-2xl group-hover:scale-105 transition-transform duration-200 ring-2 ring-emerald-500/20" />
          </div>

          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900 dark:text-white group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors flex items-center gap-1.5">
                Fiscaliza MT
              </h1>
              <span className="text-[10px] sm:text-xs font-extrabold px-2 py-0.5 rounded-full bg-emerald-600 text-white shadow-2xs uppercase tracking-wider">
                CSB / SEMA-MT
              </span>
            </div>

            <p className="text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-200 leading-tight mt-0.5">
              Coordenadoria de Segurança de Barragens – Usos Múltiplos
            </p>

            <span className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight hidden sm:block">
              Superintendência de Recursos Hídricos (SURH) · Secretaria de Estado de Meio Ambiente de Mato Grosso
            </span>
          </div>
        </div>

        {/* Lado Direito: Saudação do Usuário, Sincronização, Criptografia e Ações */}
        <div className="flex items-center flex-wrap gap-2 sm:gap-3 shrink-0">
          {/* Caixa de Saudação Personalizada de Boas-Vindas */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-gradient-to-r from-emerald-50 to-teal-50/80 dark:from-emerald-950/60 dark:to-slate-800/80 border border-emerald-200/90 dark:border-emerald-800/70 shadow-2xs">
            <div className="w-7 h-7 rounded-lg bg-emerald-600 dark:bg-emerald-500 text-white flex items-center justify-center font-black text-xs shadow-xs uppercase">
              {rawName.charAt(0)}
            </div>
            <div className="flex flex-col">
              <span className="text-xs sm:text-sm font-bold text-slate-900 dark:text-emerald-200 leading-none">
                {greetingText}
              </span>
              <span className="text-[10px] text-emerald-700 dark:text-emerald-400 font-semibold tracking-wide uppercase mt-0.5">
                {currentUser?.role ? currentUser.role : 'Fiscal Técnico'}
              </span>
            </div>
          </div>

          {/* Badge de Sincronização com Banco de Dados / Modo Offline */}
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
              title={
                !isOnline
                  ? `${pendingCount} vistoria(s) salva(s) localmente no dispositivo (offline). Criptografia ativa.`
                  : `${pendingCount} vistoria(s) salva(s) apenas localmente. Clique para sincronizar no banco de dados agora.`
              }
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
              className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60"
              title="Todas as vistorias sincronizadas com o banco de dados seguro."
            >
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>Sincronizado</span>
            </div>
          )}

          {/* Fila de Fotos (IndexedDB) */}
          <button
            type="button"
            onClick={onOpenPhotoQueueModal}
            className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-bold transition-all shadow-2xs border cursor-pointer ${
              photoQueuePending > 0
                ? 'bg-amber-500/10 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-800 hover:bg-amber-500/20'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
            title={`${photoQueuePending} foto(s) na fila persistente aguardando upload. Clique para abrir.`}
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
            title="Dados criptografados de ponta a ponta (AES-GCM 256-bit + Selo SHA-256)"
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
              title="Alterar Senha de Acesso"
            >
              <KeyRound className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Sair / Logout */}
          {onLogout && (
            <button
              type="button"
              onClick={onLogout}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-bold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/50 border border-rose-200 dark:border-rose-900/60 transition cursor-pointer"
              title="Encerrar Sessão e Proteger Sistema"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Sair</span>
            </button>
          )}

          {/* Status de Conexão */}
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
      {/* 2. LINHA INFERIOR: BOTÕES DE LINKS E NAVEGAÇÃO ABAIXO DA LOGO/NOME   */}
      {/* ===================================================================== */}
      <div className="border-t border-slate-200/90 dark:border-slate-800/90 bg-slate-50/95 dark:bg-slate-950/90 px-4 sm:px-6 py-2">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          {/* Barra de Botões de Links */}
          <nav className="flex items-center flex-wrap gap-1.5 sm:gap-2">
            {/* Link 1: Painel */}
            <button
              type="button"
              onClick={() => setActiveStep(0)}
              className={`px-3.5 py-1.5 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center gap-2 cursor-pointer shadow-xs ${
                isPanelActive
                  ? 'bg-emerald-600 text-white shadow-emerald-600/30 ring-2 ring-emerald-600/20'
                  : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-300/80 dark:border-slate-700'
              }`}
              title="Acessar o Painel Inicial"
            >
              <LayoutDashboard className="w-4 h-4" />
              <span>Painel</span>
            </button>

            {/* Link 2: Nova Ficha (Apenas Administrador e Analista) */}
            {!isVisualizador && (
              <button
                type="button"
                onClick={onNewInspection}
                className="px-3.5 py-1.5 rounded-xl text-xs sm:text-sm font-bold bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-300/80 dark:border-slate-700 hover:border-emerald-500 transition-all flex items-center gap-2 cursor-pointer shadow-xs"
                title="Iniciar uma nova ficha de vistoria em branco com contagem automática"
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
                title="Salvar dados da vistoria e registrar localização precisa"
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
                  ? 'bg-emerald-600 text-white shadow-emerald-600/30 ring-2 ring-emerald-600/20'
                  : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-300/80 dark:border-slate-700'
              }`}
              title="Acessar o Banco de Dados de Vistorias e Barragens"
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

            {/* Link 5: Módulo Usuários (Visível APENAS para Perfil Administrador) */}
            {isAdmin && (
              <button
                type="button"
                onClick={() => setActiveStep(7)}
                className={`px-3.5 py-1.5 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center gap-2 cursor-pointer shadow-xs ${
                  isUsersActive
                    ? 'bg-purple-600 text-white shadow-purple-600/30 ring-2 ring-purple-600/20'
                    : 'bg-white dark:bg-slate-900 text-purple-700 dark:text-purple-300 hover:bg-purple-50 dark:hover:bg-slate-800 border border-purple-200 dark:border-purple-900/60'
                }`}
                title="Gestão de Usuários, Solicitações de Acesso e Perfis (Exclusivo Administrador)"
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
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-100/80 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-200 border border-emerald-300 dark:border-emerald-700 shadow-2xs cursor-pointer"
                title="Voltar para a Ficha de Inspeção em andamento"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                <span>Ficha em Edição</span>
              </button>
            )}
          </nav>

          {/* Contexto da Vistoria Ativa / Metadados da Ficha */}
          {isSheetActive && (
            <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400 truncate bg-white/60 dark:bg-slate-900/60 px-3 py-1 rounded-xl border border-slate-200/60 dark:border-slate-800/60">
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
