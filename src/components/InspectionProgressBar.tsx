// ==============================================================================
// ARQUIVO: src/components/InspectionProgressBar.tsx
// Barra de Progresso Visual de Preenchimento da Vistoria de Campo (CSB / SEMA-MT)
// Indica a porcentagem e os campos pendentes para apoiar o fiscal no campo.
// ==============================================================================

import React, { useState, useMemo } from 'react';
import { 
  CheckCircle2, 
  AlertCircle, 
  ChevronDown, 
  ChevronUp, 
  FileText, 
  Camera, 
  ShieldCheck, 
  Layers, 
  ArrowRight,
  Sparkles
} from 'lucide-react';
import { InspectionData } from '../types/inspection';
import { DAM_COMPONENTS } from '../data/damComponents';

interface InspectionProgressBarProps {
  currentInspection: InspectionData;
  activeStep: number;
  onNavigateToStep: (step: number) => void;
}

interface SectionProgress {
  id: string;
  title: string;
  step: number;
  icon: React.ElementType;
  filled: number;
  total: number;
  pendingFields: string[];
}

export const InspectionProgressBar: React.FC<InspectionProgressBarProps> = ({
  currentInspection,
  activeStep,
  onNavigateToStep
}) => {
  const [isExpanded, setIsExpanded] = useState<boolean>(false);

  const { overallPercentage, filledCount, totalCount, sections, pendingList } = useMemo(() => {
    const d = currentInspection.damIdentification || ({} as any);
    const coords = d.coordinates || ({} as any);
    const dims = d.estimatedDimensions || ({} as any);
    const reg = d.regulatoryStatus || ({} as any);
    const g = currentInspection.generalInfo || ({} as any);
    const primaryInspector = g.inspectors?.[0] || {};
    const comps = currentInspection.componentsData || {};
    const photos = currentInspection.photos || [];
    const conc = currentInspection.conclusions || ({} as any);

    // 1. Identificação da Barragem & Empreendedor (10 campos)
    const pendingDam: string[] = [];
    if (!d.damName?.trim()) pendingDam.push('Nome da barragem');
    if (!d.propertyOrBusinessName?.trim()) pendingDam.push('Empreendimento / Proprietário');
    if (!d.municipality?.trim()) pendingDam.push('Município');
    if (!d.hydrographicBasin?.trim()) pendingDam.push('Bacia hidrográfica');
    if (!d.waterCourse?.trim()) pendingDam.push('Curso d’água');
    if (!coords.latitude?.trim()) pendingDam.push('Latitude GPS');
    if (!coords.longitude?.trim()) pendingDam.push('Longitude GPS');
    if (!d.damType) pendingDam.push('Tipo de barragem');
    if (!d.mainWaterUse?.trim()) pendingDam.push('Uso principal da água');
    if (!d.spillwayType) pendingDam.push('Tipo de vertedouro');

    const totalDam = 10;
    const filledDam = totalDam - pendingDam.length;

    // 2. Vistoria & Equipe Fiscal (5 campos)
    const pendingGeneral: string[] = [];
    if (!g.recordNumber?.trim()) pendingGeneral.push('Número do Auto / Termo');
    if (!g.inspectionDate?.trim()) pendingGeneral.push('Data da vistoria');
    if (!g.startTime?.trim()) pendingGeneral.push('Horário de início');
    if (!primaryInspector.name?.trim()) pendingGeneral.push('Nome do fiscal responsável');
    if (!primaryInspector.registrationNumber?.trim()) pendingGeneral.push('Matrícula do fiscal');

    const totalGeneral = 5;
    const filledGeneral = totalGeneral - pendingGeneral.length;

    // 3. Dimensões & Situação Regulatória (5 campos)
    const pendingDims: string[] = [];
    if (!dims.heightMeters?.trim()) pendingDims.push('Altura da barragem (m)');
    if (!dims.crestLengthMeters?.trim()) pendingDims.push('Comprimento da crista (m)');
    if (!dims.crestWidthMeters?.trim()) pendingDims.push('Largura da crista (m)');
    if (!reg.hasWaterPermit || reg.hasWaterPermit === 'nao_informado') pendingDims.push('Outorga de recursos hídricos');
    if (!reg.hasEnvironmentalLicense || reg.hasEnvironmentalLicense === 'nao_informado') pendingDims.push('Licença ambiental');

    const totalDims = 5;
    const filledDims = totalDims - pendingDims.length;

    // 4. Componentes Estruturais (7 componentes oficiais)
    const pendingComps: string[] = [];
    DAM_COMPONENTS.forEach(compDef => {
      const comp = comps[compDef.id];
      const isInspected = comp && comp.condition && comp.condition !== 'nao_inspecionado';
      if (!isInspected) {
        pendingComps.push(compDef.shortName || compDef.name);
      }
    });
    const totalComps = DAM_COMPONENTS.length; // 7
    const filledComps = totalComps - pendingComps.length;

    // 5. Registro Fotográfico de Campo (2 itens de validação)
    const pendingPhotos: string[] = [];
    if (photos.length === 0) {
      pendingPhotos.push('Ao menos 1 foto geral');
    }
    if (photos.length < 3) {
      pendingPhotos.push('Mínimo recomendado de 3 fotos de campo');
    }
    const totalPhotosCheck = 2;
    const filledPhotos = totalPhotosCheck - pendingPhotos.length;

    // 6. Conclusões e Encaminhamentos de Campo (2 campos)
    const pendingConc: string[] = [];
    if (!conc.generalFindings?.trim()) pendingConc.push('Constatações gerais da inspeção');
    if (!conc.immediateSafetyMeasures?.trim() && !conc.recommendationsToOwner?.trim()) {
      pendingConc.push('Medidas imediatas ou recomendações');
    }
    const totalConc = 2;
    const filledConc = totalConc - pendingConc.length;

    const sectionsData: SectionProgress[] = [
      {
        id: 'ficha',
        title: 'Ficha SEMA (Identificação & Dados)',
        step: 1,
        icon: FileText,
        filled: filledDam + filledGeneral + filledDims,
        total: totalDam + totalGeneral + totalDims,
        pendingFields: [...pendingDam, ...pendingGeneral, ...pendingDims]
      },
      {
        id: 'componentes',
        title: 'Componentes Estruturais',
        step: 2,
        icon: Layers,
        filled: filledComps,
        total: totalComps,
        pendingFields: pendingComps
      },
      {
        id: 'fotos',
        title: 'Registro Fotográfico',
        step: 3,
        icon: Camera,
        filled: filledPhotos,
        total: totalPhotosCheck,
        pendingFields: pendingPhotos
      },
      {
        id: 'conclusoes',
        title: 'Conclusões de Campo',
        step: 4,
        icon: ShieldCheck,
        filled: filledConc,
        total: totalConc,
        pendingFields: pendingConc
      }
    ];

    const total = totalDam + totalGeneral + totalDims + totalComps + totalPhotosCheck + totalConc;
    const filled = filledDam + filledGeneral + filledDims + filledComps + filledPhotos + filledConc;
    const percent = Math.min(100, Math.round((filled / total) * 100));

    const allPending: { section: string; field: string; step: number }[] = [];
    sectionsData.forEach(s => {
      s.pendingFields.forEach(f => {
        allPending.push({ section: s.title, field: f, step: s.step });
      });
    });

    return {
      overallPercentage: percent,
      filledCount: filled,
      totalCount: total,
      sections: sectionsData,
      pendingList: allPending
    };
  }, [currentInspection]);

  // Cores dinâmicas segundo a porcentagem
  const colorConfig = useMemo(() => {
    if (overallPercentage >= 85) {
      return {
        barGradient: 'from-emerald-500 to-teal-500',
        badgeBg: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30',
        textColor: 'text-emerald-600 dark:text-emerald-400',
        statusText: 'Vistoria Completa e Pronta para Minutas'
      };
    }
    if (overallPercentage >= 50) {
      return {
        barGradient: 'from-sky-500 to-blue-600',
        badgeBg: 'bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/30',
        textColor: 'text-blue-600 dark:text-blue-400',
        statusText: 'Vistoria em Andamento Avançado'
      };
    }
    return {
      barGradient: 'from-amber-500 to-orange-500',
      badgeBg: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30',
      textColor: 'text-amber-600 dark:text-amber-400',
      statusText: 'Vistoria Inicial (Faltam Campos)'
    };
  }, [overallPercentage]);

  return (
    <div className="w-full bg-white dark:bg-slate-900 border-b border-slate-200/90 dark:border-slate-800 shadow-xs transition-colors duration-200">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 py-2.5">
        {/* Linha Principal de Indicador e Botão de Expansão */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Progresso da Vistoria:
              </span>
              <span className={`text-base font-extrabold ${colorConfig.textColor}`}>
                {overallPercentage}%
              </span>
            </div>

            <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${colorConfig.badgeBg} hidden md:inline-block`}>
              {filledCount} de {totalCount} campos preenchidos
            </span>

            <span className="text-[11px] text-slate-500 dark:text-slate-400 hidden xl:inline-block">
              • {colorConfig.statusText}
            </span>
          </div>

          {/* Atalhos Rápidos para as Etapas com Status */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
            {sections.map(section => {
              const isSectionComplete = section.filled === section.total;
              const isCurrentStep = activeStep === section.step;

              return (
                <button
                  key={section.id}
                  onClick={() => onNavigateToStep(section.step)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all shrink-0 ${
                    isCurrentStep
                      ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700 shadow-2xs'
                      : isSectionComplete
                      ? 'bg-slate-100 dark:bg-slate-800/60 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700/80 border border-slate-200/80 dark:border-slate-700'
                      : 'bg-amber-50/70 dark:bg-amber-950/20 text-amber-800 dark:text-amber-300 hover:bg-amber-100/70 dark:hover:bg-amber-900/30 border border-amber-200/60 dark:border-amber-800/40'
                  }`}
                  title={`${section.title}: ${section.filled}/${section.total} preenchidos. Clique para abrir.`}
                >
                  {isSectionComplete ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400" />
                  ) : (
                    <AlertCircle className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400" />
                  )}
                  <span>{section.title.split(' ')[0]}</span>
                  <span className="text-[10px] font-bold opacity-75">
                    ({section.filled}/{section.total})
                  </span>
                </button>
              );
            })}

            {/* Botão para Expandir Detalhes dos Campos Pendentes */}
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-md bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors shrink-0 ml-1"
              title={isExpanded ? 'Ocultar detalhes dos campos pendentes' : 'Ver campos que faltam preencher'}
            >
              <span>{isExpanded ? 'Recolher' : 'O que falta?'}</span>
              {isExpanded ? (
                <ChevronUp className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
        </div>

        {/* Linha Visual da Barra de Progresso com Transição Animada */}
        <div className="mt-2 w-full bg-slate-200 dark:bg-slate-800 rounded-full h-2 overflow-hidden relative shadow-inner">
          <div
            className={`h-full bg-gradient-to-r ${colorConfig.barGradient} transition-all duration-500 ease-out rounded-full`}
            style={{ width: `${overallPercentage}%` }}
          />
        </div>

        {/* Painel Expansível: Detalhamento dos Campos Pendentes */}
        {isExpanded && (
          <div className="mt-3 pt-3 border-t border-slate-200/80 dark:border-slate-800 text-xs animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="flex items-center justify-between mb-2">
              <span className="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                Pendências para Conclusão da Vistoria de Campo ({pendingList.length} itens)
              </span>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                Clique no item ou seção para navegar diretamente
              </span>
            </div>

            {pendingList.length === 0 ? (
              <div className="p-3 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-lg flex items-center gap-2 text-emerald-800 dark:text-emerald-300">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span className="font-medium">
                  Excelente! Todos os campos essenciais de campo foram preenchidos. Você pode prosseguir para as Minutas Oficiais e Relatório Técnico.
                </span>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2.5">
                {sections.map(section => (
                  <div
                    key={section.id}
                    className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                          <section.icon className="w-3.5 h-3.5 text-slate-500" />
                          {section.title}
                        </span>
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
                          {section.filled}/{section.total}
                        </span>
                      </div>

                      {section.pendingFields.length === 0 ? (
                        <p className="text-[11px] text-emerald-600 dark:text-emerald-400 flex items-center gap-1 mt-1 font-medium">
                          <CheckCircle2 className="w-3 h-3" />
                          Seção concluída
                        </p>
                      ) : (
                        <ul className="space-y-1 mt-1 text-[11px] text-slate-600 dark:text-slate-400">
                          {section.pendingFields.slice(0, 4).map((field, idx) => (
                            <li key={idx} className="flex items-center gap-1.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                              <span className="truncate">{field}</span>
                            </li>
                          ))}
                          {section.pendingFields.length > 4 && (
                            <li className="text-[10px] text-slate-400 italic">
                              + {section.pendingFields.length - 4} outros campos
                            </li>
                          )}
                        </ul>
                      )}
                    </div>

                    <button
                      onClick={() => onNavigateToStep(section.step)}
                      className="mt-2.5 pt-1.5 border-t border-slate-200/60 dark:border-slate-700/60 flex items-center justify-between text-[11px] font-semibold text-emerald-700 hover:text-emerald-800 dark:text-emerald-400 dark:hover:text-emerald-300 w-full group"
                    >
                      <span>Preencher esta etapa</span>
                      <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
