// ==============================================================================
// ARQUIVO: src/components/FloatingSheetNavMenu.tsx
// Menu flutuante de navegação rápida por tópicos e subtópicos da ficha de vistoria
// Facilita o preenchimento e rolagem direta para qualquer componente em campo
// ==============================================================================

import React, { useState, useEffect } from 'react';
import { 
  Compass, 
  ChevronRight, 
  ChevronDown, 
  X, 
  ArrowUp, 
  ArrowDown, 
  CheckCircle2, 
  Layers, 
  Eye, 
  FileText, 
  Camera, 
  Sparkles,
  Maximize2,
  Minimize2
} from 'lucide-react';

export interface NavTopicItem {
  id: string; // Element HTML ID to scroll to
  secKey: string; // key in openSections
  number: string;
  title: string;
  shortTitle: string;
  parentKey?: string;
  subtopics?: NavTopicItem[];
}

export const OFFICIAL_SHEET_TOPICS: NavTopicItem[] = [
  {
    id: 'sec-topico-1',
    secKey: 'sec1',
    number: '1',
    title: '1. Dados Gerais da Barragem',
    shortTitle: 'Dados Gerais'
  },
  {
    id: 'sec-topico-2',
    secKey: 'sec2',
    number: '2',
    title: '2. Identificação do Empreendedor e Propriedade',
    shortTitle: 'Empreendedor'
  },
  {
    id: 'sec-topico-3',
    secKey: 'sec3',
    number: '3',
    title: '3. Usos da Barragem',
    shortTitle: 'Usos da Barragem'
  },
  {
    id: 'sec-topico-4',
    secKey: 'sec4',
    number: '4',
    title: '4. Características Técnicas (Aferição)',
    shortTitle: 'Medidas Técnicas'
  },
  {
    id: 'sec-topico-5',
    secKey: 'secComponentes',
    number: '5',
    title: '5. COMPONENTES DA BARRAGEM',
    shortTitle: '5. Componentes',
    subtopics: [
      {
        id: 'sec-subtopico-5-1',
        secKey: 'sec5',
        parentKey: 'secComponentes',
        number: '5.1',
        title: '5.1. Talude de Montante',
        shortTitle: 'Talude Montante'
      },
      {
        id: 'sec-subtopico-5-2',
        secKey: 'sec6',
        parentKey: 'secComponentes',
        number: '5.2',
        title: '5.2. Coroamento (Crista)',
        shortTitle: 'Coroamento (Crista)'
      },
      {
        id: 'sec-subtopico-5-3',
        secKey: 'sec7',
        parentKey: 'secComponentes',
        number: '5.3',
        title: '5.3. Talude de Jusante',
        shortTitle: 'Talude Jusante'
      },
      {
        id: 'sec-subtopico-5-4',
        secKey: 'sec8',
        parentKey: 'secComponentes',
        number: '5.4',
        title: '5.4. Região a Jusante da Barragem',
        shortTitle: 'Região Jusante'
      },
      {
        id: 'sec-subtopico-5-5',
        secKey: 'sec9',
        parentKey: 'secComponentes',
        number: '5.5',
        title: '5.5. Instrumentação de Monitoramento',
        shortTitle: 'Instrumentação'
      },
      {
        id: 'sec-subtopico-5-6',
        secKey: 'sec10',
        parentKey: 'secComponentes',
        number: '5.6',
        title: '5.6. Estruturas Vertedoras (Vertedouro)',
        shortTitle: 'Vertedouro'
      },
      {
        id: 'sec-subtopico-5-7',
        secKey: 'sec11',
        parentKey: 'secComponentes',
        number: '5.7',
        title: '5.7. Reservatório',
        shortTitle: 'Reservatório'
      }
    ]
  },
  {
    id: 'sec-topico-6',
    secKey: 'sec12',
    number: '6',
    title: '6. Outros Problemas e Acompanhantes',
    shortTitle: 'Outros Problemas'
  },
  {
    id: 'sec-topico-fotos',
    secKey: 'secFotos',
    number: '7',
    title: '7. Fotos de Campo e Anexos',
    shortTitle: 'Fotos de Campo'
  }
];

interface FloatingSheetNavMenuProps {
  openSections: Record<string, boolean>;
  onNavigateToSection: (sectionKey: string, elementId: string, parentKey?: string) => void;
  onExpandAll: () => void;
  onCollapseAll: () => void;
  photosCount?: number;
}

export const FloatingSheetNavMenu: React.FC<FloatingSheetNavMenuProps> = ({
  openSections,
  onNavigateToSection,
  onExpandAll,
  onCollapseAll,
  photosCount = 0
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [activeSectionId, setActiveSectionId] = useState<string>('sec-topico-1');
  const [isComponentesExpanded, setIsComponentesExpanded] = useState(true);

  // Escuta evento global de abertura (acionado pela barra inferior em celulares/tablets)
  useEffect(() => {
    const handleToggleEvent = () => {
      setIsOpen(prev => !prev);
    };
    window.addEventListener('csb:toggle_nav_menu', handleToggleEvent);
    return () => window.removeEventListener('csb:toggle_nav_menu', handleToggleEvent);
  }, []);

  // Monitora a posição de rolagem para destacar automaticamente o tópico visível
  useEffect(() => {
    const handleScroll = () => {
      const allTargetIds: string[] = [];
      OFFICIAL_SHEET_TOPICS.forEach(topic => {
        allTargetIds.push(topic.id);
        if (topic.subtopics) {
          topic.subtopics.forEach(sub => allTargetIds.push(sub.id));
        }
      });

      const scrollPosition = window.scrollY + 180;
      let currentActive = allTargetIds[0];

      for (let i = 0; i < allTargetIds.length; i++) {
        const id = allTargetIds[i];
        const el = document.getElementById(id);
        if (el) {
          const top = el.offsetTop;
          if (scrollPosition >= top) {
            currentActive = id;
          }
        }
      }

      setActiveSectionId(currentActive);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();

    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleSelectTopic = (item: NavTopicItem) => {
    onNavigateToSection(item.secKey, item.id, item.parentKey);
    // Em telas pequenas fecha o menu para permitir preenchimento livre
    if (window.innerWidth < 768) {
      setIsOpen(false);
    }
  };

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const scrollToBottom = () => {
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
  };

  // Encontra o item atualmente ativo para exibir no botão flutuante recolhido
  const findActiveTitle = (): string => {
    for (const t of OFFICIAL_SHEET_TOPICS) {
      if (t.id === activeSectionId) return t.shortTitle;
      if (t.subtopics) {
        for (const sub of t.subtopics) {
          if (sub.id === activeSectionId) return `${sub.number} ${sub.shortTitle}`;
        }
      }
    }
    return 'Menu da Ficha';
  };

  return (
    <>
      {/* Backdrop para fechar com toque fora em telas menores (celular e tablet) */}
      {isOpen && (
        <div 
          onClick={() => setIsOpen(false)}
          className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs z-50 md:hidden animate-in fade-in duration-150"
          aria-hidden="true"
        />
      )}

      {/* Botão Flutuante (FAB) quando recolhido - posicionado acima da barra inferior no mobile */}
      {!isOpen && (
        <div className="fixed bottom-24 right-3 sm:bottom-20 sm:right-6 z-40 flex items-center gap-2 animate-in fade-in zoom-in duration-150">
          <button
            type="button"
            onClick={() => setIsOpen(true)}
            className="flex items-center gap-2 px-3.5 py-2.5 rounded-full bg-slate-900/95 dark:bg-emerald-950/95 hover:bg-slate-900 text-white shadow-xl hover:shadow-2xl border border-emerald-500/50 backdrop-blur-md transition-all cursor-pointer group active:scale-95 min-h-[44px]"
            title="Abrir menu flutuante de tópicos e subtópicos da ficha"
          >
            <div className="w-6 h-6 rounded-full bg-emerald-500 text-slate-950 flex items-center justify-center font-bold text-xs shrink-0 group-hover:rotate-45 transition-transform">
              <Compass className="w-4 h-4" />
            </div>
            <div className="text-left hidden xs:block pr-1">
              <span className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider block leading-none">
                Tópicos da Ficha
              </span>
              <span className="text-xs font-semibold text-slate-100 truncate max-w-[130px] block leading-tight">
                {findActiveTitle()}
              </span>
            </div>
            <ChevronRight className="w-4 h-4 text-emerald-400" />
          </button>
        </div>
      )}

      {/* Painel Flutuante Aberto */}
      {isOpen && (
        <div className="fixed bottom-24 right-2 sm:bottom-6 sm:right-6 z-50 w-[94vw] max-w-sm max-h-[75vh] sm:max-h-[82vh] bg-white dark:bg-slate-900 border-2 border-emerald-500/50 rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-in fade-in slide-in-from-bottom-5 duration-200 backdrop-blur-lg">
          
          {/* Header do Menu Flutuante */}
          <div className="p-3.5 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800 shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-7 h-7 rounded-lg bg-emerald-600 text-white flex items-center justify-center font-bold text-xs shrink-0">
                <Compass className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-white tracking-wide truncate">
                  Navegação pelos Tópicos
                </h4>
                <p className="text-[10px] text-emerald-400 font-mono">
                  CSB • Ficha Oficial de Campo
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
                title="Minimizar menu"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Barra de Ações Rápidas (Expandir/Recolher/Ir ao Topo) */}
          <div className="px-3 py-2 bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between text-[11px] font-semibold text-slate-600 dark:text-slate-300 shrink-0">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={onExpandAll}
                className="px-2 py-0.8 rounded-md bg-white dark:bg-slate-800 hover:bg-emerald-50 hover:text-emerald-700 border border-slate-200 dark:border-slate-700 transition cursor-pointer text-[10px]"
                title="Expandir todas as seções da ficha"
              >
                Expandir Tudo
              </button>
              <button
                type="button"
                onClick={onCollapseAll}
                className="px-2 py-0.8 rounded-md bg-white dark:bg-slate-800 hover:bg-slate-100 border border-slate-200 dark:border-slate-700 transition cursor-pointer text-[10px]"
                title="Recolher todas as seções"
              >
                Recolher Tudo
              </button>
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={scrollToTop}
                className="p-1 rounded bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:text-emerald-600 cursor-pointer"
                title="Ir ao topo da ficha"
              >
                <ArrowUp className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={scrollToBottom}
                className="p-1 rounded bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:text-emerald-600 cursor-pointer"
                title="Ir ao final da ficha"
              >
                <ArrowDown className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Lista de Tópicos e Subtópicos com Scroll */}
          <div className="p-2 space-y-1 overflow-y-auto flex-1 divide-y divide-slate-100 dark:divide-slate-800/60">
            {OFFICIAL_SHEET_TOPICS.map(topic => {
              const isTopicActive = activeSectionId === topic.id;
              const hasSubtopics = topic.subtopics && topic.subtopics.length > 0;
              const isSectionOpen = openSections[topic.secKey] !== false;

              return (
                <div key={topic.id} className="pt-1 first:pt-0">
                  {/* Item Principal do Tópico */}
                  <div
                    className={`flex items-center justify-between p-2 rounded-xl transition cursor-pointer ${
                      isTopicActive
                        ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-900 dark:text-emerald-200 font-bold border-l-4 border-emerald-600'
                        : 'hover:bg-slate-100/70 dark:hover:bg-slate-800/60 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => handleSelectTopic(topic)}
                      className="flex items-center gap-2 text-left flex-1 min-w-0 cursor-pointer"
                    >
                      <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
                        isTopicActive
                          ? 'bg-emerald-600 text-white'
                          : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                      }`}>
                        {topic.number}
                      </span>
                      <span className="text-xs truncate font-medium">
                        {topic.shortTitle}
                      </span>
                    </button>

                    <div className="flex items-center gap-1 shrink-0">
                      {/* Indicador de aberto/fechado na ficha */}
                      <span className={`text-[9px] px-1.5 py-0.2 rounded font-mono ${
                        isSectionOpen
                          ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-300'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                      }`}>
                        {isSectionOpen ? 'Aberto' : 'Recolhido'}
                      </span>

                      {/* Botão de expandir subtópicos se existirem */}
                      {hasSubtopics && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setIsComponentesExpanded(prev => !prev);
                          }}
                          className="p-1 text-slate-400 hover:text-emerald-600 cursor-pointer"
                          title="Expandir/recolher lista de componentes"
                        >
                          {isComponentesExpanded ? (
                            <ChevronDown className="w-3.5 h-3.5 text-emerald-600" />
                          ) : (
                            <ChevronRight className="w-3.5 h-3.5" />
                          )}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Subtópicos aninhados (específico do Tópico 5: Componentes) */}
                  {hasSubtopics && isComponentesExpanded && (
                    <div className="pl-5 pr-1 py-1 space-y-0.5 border-l-2 border-emerald-200 dark:border-emerald-800/50 ml-4 my-1">
                      {topic.subtopics!.map(sub => {
                        const isSubActive = activeSectionId === sub.id;
                        const isSubOpen = openSections[sub.secKey] !== false;

                        return (
                          <button
                            key={sub.id}
                            type="button"
                            onClick={() => handleSelectTopic(sub)}
                            className={`w-full flex items-center justify-between p-1.5 rounded-lg text-left transition cursor-pointer text-xs ${
                              isSubActive
                                ? 'bg-emerald-100/70 dark:bg-emerald-900/50 text-emerald-950 dark:text-emerald-200 font-bold'
                                : 'hover:bg-slate-100 dark:hover:bg-slate-800/40 text-slate-600 dark:text-slate-400 font-normal'
                            }`}
                          >
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="text-[10px] font-mono text-emerald-700 dark:text-emerald-400 font-bold shrink-0">
                                {sub.number}
                              </span>
                              <span className="truncate text-[11px]">
                                {sub.shortTitle}
                              </span>
                            </div>

                            <span className={`text-[8px] px-1 py-0.2 rounded font-mono shrink-0 ${
                              isSubOpen
                                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                                : 'bg-slate-100 text-slate-400 dark:bg-slate-800'
                            }`}>
                              {isSubOpen ? 'Visível' : 'Oculto'}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Footer do Menu com Resumo */}
          <div className="p-2.5 bg-slate-900 border-t border-slate-800 text-[10px] text-slate-400 flex items-center justify-between font-mono shrink-0">
            <span>7 Componentes Oficiais</span>
            <span className="text-emerald-400">CSB / SEMA-MT</span>
          </div>

        </div>
      )}
    </>
  );
};
