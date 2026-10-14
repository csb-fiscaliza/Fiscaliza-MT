// ==============================================================================
// ARQUIVO: src/components/MobileBottomNav.tsx
// Barra de Navegação Inferior Otimizada para Celular e Tablet (CSB/SEMA-MT)
// Acesso com polegar, atalhos para etapas de campo, salvamento rápido e status
// ==============================================================================

import React from 'react';
import { 
  LayoutDashboard, 
  FileSpreadsheet, 
  Layers, 
  Camera, 
  ClipboardCheck, 
  FileText, 
  Database,
  Save,
  CheckCircle2,
  RefreshCw,
  Compass,
  Users
} from 'lucide-react';
import { InspectionData } from '../types/inspection';

interface MobileBottomNavProps {
  activeStep: number;
  setActiveStep: (step: number) => void;
  onSave: () => void;
  lastSavedAt: string | null;
  currentInspection: InspectionData;
  onOpenNavMenu?: () => void;
  isSaving?: boolean;
  onOpenPhotoQueueModal?: () => void;
  currentUser?: { email?: string; fullName?: string; role?: string; id?: string } | null;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  activeStep,
  setActiveStep,
  onSave,
  lastSavedAt,
  currentInspection,
  onOpenNavMenu,
  isSaving = false,
  onOpenPhotoQueueModal,
  currentUser
}) => {
  const [photoQueuePending, setPhotoQueuePending] = React.useState(0);

  React.useEffect(() => {
    let active = true;
    import('../services/photoSyncQueueService').then(({ getPhotoQueueSummary, subscribePhotoQueue }) => {
      const update = async () => {
        try {
          const sum = await getPhotoQueueSummary();
          if (active) setPhotoQueuePending(sum.pending + sum.error);
        } catch {}
      };
      update();
      const unsub = subscribePhotoQueue(update);
      return () => {
        active = false;
        unsub();
      };
    });
  }, []);

  const photosCount = currentInspection.photos?.length || 0;

  const navItems = [
    {
      step: 0,
      label: 'Painel',
      icon: LayoutDashboard,
      badge: null
    },
    {
      step: 1,
      label: 'Ficha',
      icon: FileSpreadsheet,
      badge: null
    },
    {
      step: 2,
      label: 'Estruturas',
      icon: Layers,
      badge: null
    },
    {
      step: 3,
      label: 'Fotos',
      icon: Camera,
      badge: photoQueuePending > 0 ? `${photoQueuePending}!` : (photosCount > 0 ? photosCount : null)
    },
    {
      step: 4,
      label: 'Conclusão',
      icon: ClipboardCheck,
      badge: null
    },
    {
      step: 5,
      label: 'Minutas',
      icon: FileText,
      badge: null
    },
    {
      step: 6,
      label: 'Banco',
      icon: Database,
      badge: null
    }
  ];

  const userRole = (currentUser?.role || '').toLowerCase();
  const isAdmin = userRole === 'administrador' || userRole === 'admin' || currentUser?.email?.toLowerCase() === 'yarageologa@gmail.com';

  if (isAdmin) {
    navItems.push({
      step: 7,
      label: 'Usuários',
      icon: Users,
      badge: 'Admin'
    });
  }

  return (
    <div className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200/90 dark:border-slate-800 shadow-[0_-4px_24px_rgba(0,0,0,0.12)] print:hidden select-none">
      {/* Barra de utilitários rápidos com toque no topo da barra inferior */}
      <div className="px-3 py-1 bg-slate-100/90 dark:bg-slate-950/90 border-b border-slate-200/60 dark:border-slate-800/60 flex items-center justify-between text-[11px]">
        <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 font-mono truncate">
          {lastSavedAt ? (
            <>
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span className="truncate">Salvo às {lastSavedAt}</span>
            </>
          ) : (
            <span className="truncate">Auto-salvamento ativo</span>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Fila de Fotos no Topo da Barra Móvel */}
          {photoQueuePending > 0 && onOpenPhotoQueueModal && (
            <button
              type="button"
              onClick={onOpenPhotoQueueModal}
              className="flex items-center gap-1 px-2 py-0.8 rounded-lg bg-amber-500/15 border border-amber-400/40 text-amber-700 dark:text-amber-300 font-bold text-[10px] active:scale-95 transition animate-pulse"
              title="Fotos aguardando upload no banco de dados"
            >
              <Camera className="w-3 h-3 text-amber-600 dark:text-amber-400" />
              <span>{photoQueuePending} na fila</span>
            </button>
          )}

          {/* Se estiver na Ficha (passo 1), botão direto para abrir menu de tópicos */}
          {activeStep === 1 && onOpenNavMenu && (
            <button
              type="button"
              onClick={onOpenNavMenu}
              className="flex items-center gap-1 px-2.5 py-0.8 rounded-lg bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 font-semibold text-[11px] active:scale-95 transition"
              title="Abrir menu de tópicos e subtópicos"
            >
              <Compass className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>Tópicos</span>
            </button>
          )}

          {/* Botão de Salvar Rápido com Toque do Polegar */}
          <button
            type="button"
            onClick={onSave}
            disabled={isSaving}
            className="flex items-center gap-1 px-3 py-0.8 rounded-lg bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold text-[11px] shadow-xs transition"
            title="Salvar imediatamente no aparelho e capturar coordenadas"
          >
            {isSaving ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Save className="w-3.5 h-3.5" />
            )}
            <span>Salvar</span>
          </button>
        </div>
      </div>

      {/* Grid de Ícones de Navegação das Etapas */}
      <nav className={`grid ${isAdmin ? 'grid-cols-8' : 'grid-cols-7'} gap-0.5 px-1 py-1 max-w-lg mx-auto`}>
        {navItems.map(item => {
          const isActive = activeStep === item.step;
          const Icon = item.icon;

          return (
            <button
              key={item.step}
              type="button"
              onClick={() => setActiveStep(item.step)}
              className={`relative flex flex-col items-center justify-center py-1.5 px-0.5 rounded-xl transition-all cursor-pointer min-h-[46px] ${
                isActive
                  ? 'text-emerald-700 dark:text-emerald-400 font-bold bg-emerald-50 dark:bg-emerald-950/50'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 active:scale-95'
              }`}
            >
              {/* Indicador de barra ativa no topo do ícone */}
              {isActive && (
                <span className="absolute top-0.5 w-6 h-0.5 rounded-full bg-emerald-600 dark:bg-emerald-400" />
              )}

              <div className="relative">
                <Icon className={`w-5 h-5 transition-transform ${isActive ? 'scale-110 text-emerald-600 dark:text-emerald-400' : ''}`} />
                {item.badge !== null && (
                  <span className="absolute -top-1 -right-2 min-w-[15px] h-[15px] px-1 bg-amber-500 text-slate-950 text-[9px] font-black rounded-full flex items-center justify-center leading-none">
                    {item.badge}
                  </span>
                )}
              </div>

              <span className={`text-[10px] mt-0.5 truncate leading-tight max-w-full ${isActive ? 'font-bold' : 'font-medium'}`}>
                {item.label}
              </span>
            </button>
          );
        })}
      </nav>
      {/* Safe area spacer para iPhones com notch/home indicator */}
      <div className="h-[env(safe-area-inset-bottom,0px)]" />
    </div>
  );
};
