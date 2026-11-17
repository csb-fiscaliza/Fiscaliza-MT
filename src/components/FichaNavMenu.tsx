import React, { useEffect, useState } from 'react';
import {
  FileSpreadsheet,
  Layers,
  Camera,
  ClipboardCheck,
  FileText
} from 'lucide-react';
import { InspectionData } from '../types/inspection';
import { getPhotoQueueSummary, subscribePhotoQueue } from '../services/photoSyncQueueService';

interface FichaNavMenuProps {
  activeStep: number;
  setActiveStep: (step: number) => void;
  currentInspection: InspectionData;
}

export const FichaNavMenu: React.FC<FichaNavMenuProps> = ({
  activeStep,
  setActiveStep,
  currentInspection
}) => {
  const [headerHeight, setHeaderHeight] = useState<number>(0);
  const [photoQueuePending, setPhotoQueuePending] = useState<number>(0);

  useEffect(() => {
    const headerEl = document.querySelector('header');
    if (!headerEl) return;

    const updateHeight = () => {
      const rect = headerEl.getBoundingClientRect();
      setHeaderHeight(Math.max(0, Math.round(rect.height)));
    };

    updateHeight();
    const ro = new ResizeObserver(updateHeight);
    ro.observe(headerEl);
    window.addEventListener('resize', updateHeight);

    return () => {
      ro.disconnect();
      window.removeEventListener('resize', updateHeight);
    };
  }, []);

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const sum = await getPhotoQueueSummary();
        if (active) setPhotoQueuePending(sum.pending + sum.error);
      } catch {
        // Ignorar erro silencioso
      }
    };
    refresh();
    const unsub = subscribePhotoQueue(refresh);
    return () => {
      active = false;
      unsub();
    };
  }, []);

  const photosCount = currentInspection.photos?.length || 0;

  const menuItems = [
    {
      step: 1,
      label: 'Ficha',
      icon: FileSpreadsheet,
      badge: null as string | number | null
    },
    {
      step: 2,
      label: 'Estruturas',
      icon: Layers,
      badge: null as string | number | null
    },
    {
      step: 3,
      label: 'Fotos',
      icon: Camera,
      badge: photoQueuePending > 0 ? `${photoQueuePending}!` : photosCount > 0 ? photosCount : null
    },
    {
      step: 4,
      label: 'Conclusão',
      icon: ClipboardCheck,
      badge: null as string | number | null
    },
    {
      step: 5,
      label: 'Minutas',
      icon: FileText,
      badge: null as string | number | null
    }
  ];

  return (
    <div
      data-ficha-frozen-menu="true"
      style={{ top: `${headerHeight}px` }}
      className="sticky z-30 w-full bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 shadow-xs transition-colors print:hidden select-none"
    >
      <div className="max-w-7xl 2xl:max-w-[1440px] mx-auto px-2.5 xs:px-3 sm:px-5 lg:px-6 pl-[max(0.625rem,env(safe-area-inset-left))] pr-[max(0.625rem,env(safe-area-inset-right))] py-1.5 flex items-center justify-between gap-3">
        <nav
          aria-label="Menu interno da Ficha de Inspeção"
          className="flex items-center gap-1 sm:gap-1.5 overflow-x-auto scrollbar-none w-full lg:w-auto py-0.5"
        >
          {menuItems.map(item => {
            const Icon = item.icon;
            const isActive = activeStep === item.step;

            return (
              <button
                key={item.step}
                type="button"
                onClick={() => setActiveStep(item.step)}
                className={`relative min-h-[36px] sm:min-h-[34px] px-2.5 sm:px-3.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                  isActive
                    ? 'bg-emerald-700 text-white shadow-xs ring-2 ring-emerald-700/20'
                    : 'bg-slate-100/80 dark:bg-slate-800/80 text-slate-700 dark:text-slate-200 hover:bg-emerald-50 dark:hover:bg-slate-700 hover:text-emerald-800 dark:hover:text-emerald-300 border border-slate-200/90 dark:border-slate-700'
                }`}
              >
                <Icon
                  className={`w-3.5 h-3.5 shrink-0 ${
                    isActive ? 'text-white' : 'text-emerald-600 dark:text-emerald-400'
                  }`}
                />
                <span>{item.label}</span>
                {item.badge !== null && (
                  <span
                    className={`px-1.5 py-0.5 rounded-full text-[10px] font-black leading-none tabular-nums ${
                      photoQueuePending > 0 && item.step === 3
                        ? 'bg-amber-400 text-slate-950'
                        : isActive
                        ? 'bg-white/25 text-white'
                        : 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="hidden lg:flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400 shrink-0 min-w-0 max-w-[280px]">
          <span className="px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 font-bold border border-emerald-200/80 dark:border-emerald-800/80 shrink-0">
            Menu da Ficha
          </span>
          {currentInspection.damIdentification?.damName ? (
            <span className="font-semibold text-slate-700 dark:text-slate-200 truncate">
              {currentInspection.damIdentification.damName}
            </span>
          ) : (
            <span className="truncate">Navegação rápida entre etapas</span>
          )}
        </div>
      </div>
    </div>
  );
};
