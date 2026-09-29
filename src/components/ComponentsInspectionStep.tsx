import React, { useState } from 'react';
import { 
  CheckCircle, 
  AlertTriangle, 
  AlertOctagon, 
  MinusCircle, 
  Camera, 
  ChevronRight, 
  Layers, 
  ArrowLeft, 
  ArrowRight,
  Sparkles,
  Info
} from 'lucide-react';
import { DAM_COMPONENTS } from '../data/damComponents';
import { InspectionData, SeverityCondition } from '../types/inspection';

interface Props {
  data: InspectionData;
  onChange: (updater: (prev: InspectionData) => InspectionData) => void;
  onNext: () => void;
  onPrev: () => void;
  onGoToPhotosForComponent: (componentId: string) => void;
}

export const ComponentsInspectionStep: React.FC<Props> = ({
  data,
  onChange,
  onNext,
  onPrev,
  onGoToPhotosForComponent
}) => {
  const [selectedComponentId, setSelectedComponentId] = useState<string>(DAM_COMPONENTS[0].id);

  const activeComponentDef = DAM_COMPONENTS.find(c => c.id === selectedComponentId) || DAM_COMPONENTS[0];
  const activeComponentData = data.componentsData[activeComponentDef.id] || {
    componentId: activeComponentDef.id,
    componentName: activeComponentDef.name,
    condition: 'adequado',
    selectedAnomalies: [],
    notes: ''
  };

  const updateActiveCondition = (condition: SeverityCondition) => {
    onChange(prev => ({
      ...prev,
      componentsData: {
        ...prev.componentsData,
        [activeComponentDef.id]: {
          ...(prev.componentsData[activeComponentDef.id] || {
            componentId: activeComponentDef.id,
            componentName: activeComponentDef.name,
            selectedAnomalies: [],
            notes: ''
          }),
          condition
        }
      }
    }));
  };

  const toggleAnomaly = (anomalyId: string) => {
    const currentList = activeComponentData.selectedAnomalies || [];
    const exists = currentList.includes(anomalyId);
    const updated = exists ? currentList.filter(id => id !== anomalyId) : [...currentList, anomalyId];

    // Se marcou alguma anomalia e estava em "adequado", promove para alerta ou crítico automaticamente
    let nextCondition = activeComponentData.condition;
    if (!exists && nextCondition === 'adequado') {
      const anomalyObj = activeComponentDef.commonAnomalies.find(a => a.id === anomalyId);
      nextCondition = anomalyObj?.severityHint === 'critico' ? 'critico' : 'alerta';
    } else if (updated.length === 0 && (nextCondition === 'alerta' || nextCondition === 'critico')) {
      // Se desmarcou todas as anomalias e não tem observações críticas, sugere adequado
      if (!activeComponentData.notes.trim()) {
        nextCondition = 'adequado';
      }
    }

    onChange(prev => ({
      ...prev,
      componentsData: {
        ...prev.componentsData,
        [activeComponentDef.id]: {
          ...activeComponentData,
          condition: nextCondition,
          selectedAnomalies: updated
        }
      }
    }));
  };

  const updateNotes = (notes: string) => {
    onChange(prev => ({
      ...prev,
      componentsData: {
        ...prev.componentsData,
        [activeComponentDef.id]: {
          ...activeComponentData,
          notes
        }
      }
    }));
  };

  const photosForThisComponent = data.photos.filter(p => p.componentId === activeComponentDef.id);

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs">
        <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wide flex items-center gap-2">
          <Layers className="w-4 h-4 text-emerald-600" />
          <span>3. Inspeção Visual por Componentes da Barragem</span>
        </h2>
        <p className="text-xs text-slate-600 mt-1">
          Avalie cada componente estrutural. Selecione a condição, anote anomalias observadas e vincule fotografias. Nenhum enquadramento legal é gerado de forma automática: registre estritamente as constatações de campo.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Component Selector Sidebar (Left 4 cols) */}
        <div className="lg:col-span-4 bg-white rounded-xl border border-slate-200 shadow-xs divide-y divide-slate-100 overflow-hidden">
          <div className="p-3 bg-slate-50 font-bold text-xs text-slate-700 uppercase tracking-wider flex items-center justify-between">
            <span>Componentes ({DAM_COMPONENTS.length})</span>
            <span className="text-[10px] text-slate-500 font-normal">Toque para selecionar</span>
          </div>

          <div className="divide-y divide-slate-100 max-h-[600px] overflow-y-auto">
            {DAM_COMPONENTS.map(comp => {
              const compData = data.componentsData[comp.id];
              const cond = compData?.condition || 'nao_inspecionado';
              const isSelected = comp.id === selectedComponentId;
              const photoCount = data.photos.filter(p => p.componentId === comp.id).length;

              return (
                <button
                  key={comp.id}
                  type="button"
                  onClick={() => setSelectedComponentId(comp.id)}
                  className={`w-full text-left p-3 flex items-center justify-between gap-2 transition cursor-pointer ${
                    isSelected
                      ? 'bg-emerald-50/90 text-emerald-950 font-bold border-l-4 border-emerald-600'
                      : 'hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="text-xs truncate font-medium">{comp.name}</div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${getConditionBadgeClass(cond)}`}>
                        {getConditionLabel(cond)}
                      </span>
                      {photoCount > 0 && (
                        <span className="text-[10px] text-slate-500 flex items-center gap-0.5">
                          <Camera className="w-3 h-3 text-slate-400" />
                          {photoCount}
                        </span>
                      )}
                    </div>
                  </div>
                  <ChevronRight className={`w-4 h-4 shrink-0 ${isSelected ? 'text-emerald-600' : 'text-slate-300'}`} />
                </button>
              );
            })}
          </div>
        </div>

        {/* Component Inspection Editor (Right 8 cols) */}
        <div className="lg:col-span-8 bg-white rounded-xl border border-slate-200 shadow-xs p-5 space-y-5">
          {/* Active Component Title & Description */}
          <div className="border-b border-slate-100 pb-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-base font-bold text-slate-800">
                {activeComponentDef.name}
              </h3>
              <button
                type="button"
                onClick={() => onGoToPhotosForComponent(activeComponentDef.id)}
                className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-sky-50 text-sky-700 hover:bg-sky-100 border border-sky-200 transition cursor-pointer"
              >
                <Camera className="w-3.5 h-3.5" />
                <span>Fotos deste Componente ({photosForThisComponent.length})</span>
              </button>
            </div>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
              {activeComponentDef.description}
            </p>
          </div>

          {/* Condition Selector Buttons */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-2">
              Estado Geral Observado neste Componente:
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              <button
                type="button"
                onClick={() => updateActiveCondition('adequado')}
                className={`p-2.5 rounded-lg border text-xs font-semibold flex flex-col items-center gap-1 transition cursor-pointer ${
                  activeComponentData.condition === 'adequado'
                    ? 'bg-emerald-600 text-white border-emerald-700 shadow-xs ring-2 ring-emerald-300'
                    : 'bg-emerald-50/60 text-emerald-800 border-emerald-200 hover:bg-emerald-100'
                }`}
              >
                <CheckCircle className="w-4 h-4" />
                <span>Adequado</span>
              </button>

              <button
                type="button"
                onClick={() => updateActiveCondition('alerta')}
                className={`p-2.5 rounded-lg border text-xs font-semibold flex flex-col items-center gap-1 transition cursor-pointer ${
                  activeComponentData.condition === 'alerta'
                    ? 'bg-amber-500 text-white border-amber-600 shadow-xs ring-2 ring-amber-300'
                    : 'bg-amber-50/60 text-amber-800 border-amber-200 hover:bg-amber-100'
                }`}
              >
                <AlertTriangle className="w-4 h-4" />
                <span>Atenção / Alerta</span>
              </button>

              <button
                type="button"
                onClick={() => updateActiveCondition('critico')}
                className={`p-2.5 rounded-lg border text-xs font-semibold flex flex-col items-center gap-1 transition cursor-pointer ${
                  activeComponentData.condition === 'critico'
                    ? 'bg-rose-600 text-white border-rose-700 shadow-xs ring-2 ring-rose-300'
                    : 'bg-rose-50/60 text-rose-800 border-rose-200 hover:bg-rose-100'
                }`}
              >
                <AlertOctagon className="w-4 h-4" />
                <span>Crítico</span>
              </button>

              <button
                type="button"
                onClick={() => updateActiveCondition('nao_se_aplica')}
                className={`p-2.5 rounded-lg border text-xs font-semibold flex flex-col items-center gap-1 transition cursor-pointer ${
                  activeComponentData.condition === 'nao_se_aplica'
                    ? 'bg-slate-600 text-white border-slate-700 shadow-xs ring-2 ring-slate-300'
                    : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
                }`}
              >
                <MinusCircle className="w-4 h-4" />
                <span>Não se aplica</span>
              </button>

              <button
                type="button"
                onClick={() => updateActiveCondition('nao_inspecionado')}
                className={`p-2.5 rounded-lg border text-xs font-semibold flex flex-col items-center gap-1 transition cursor-pointer ${
                  activeComponentData.condition === 'nao_inspecionado'
                    ? 'bg-slate-400 text-white border-slate-500 shadow-xs ring-2 ring-slate-300'
                    : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100'
                }`}
              >
                <MinusCircle className="w-4 h-4" />
                <span>Não inspecionado</span>
              </button>
            </div>
          </div>

          {/* Common Anomalies Quick Checklist */}
          {activeComponentDef.commonAnomalies.length > 0 && (
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center justify-between">
                <span>Anomalias Frequentes (Marque para registrar):</span>
                <span className="text-[11px] text-slate-400 font-normal">
                  {activeComponentData.selectedAnomalies.length} selecionada(s)
                </span>
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {activeComponentDef.commonAnomalies.map(anomaly => {
                  const isChecked = activeComponentData.selectedAnomalies.includes(anomaly.id);
                  const isCrit = anomaly.severityHint === 'critico';

                  return (
                    <label
                      key={anomaly.id}
                      className={`flex items-start gap-2 p-2.5 rounded-lg border text-xs cursor-pointer transition ${
                        isChecked
                          ? isCrit
                            ? 'bg-rose-50/80 border-rose-300 text-rose-950 font-medium'
                            : 'bg-amber-50/80 border-amber-300 text-amber-950 font-medium'
                          : 'bg-slate-50/50 border-slate-200 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleAnomaly(anomaly.id)}
                        className={`mt-0.5 rounded ${isCrit ? 'text-rose-600 focus:ring-rose-500' : 'text-amber-600 focus:ring-amber-500'}`}
                      />
                      <span className="leading-snug">
                        {anomaly.label}
                        {isCrit && (
                          <span className="ml-1 text-[10px] text-rose-600 font-bold">[Crítico]</span>
                        )}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {/* Observations and Notes Textarea */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Observações e Descrição Circunstanciada do Servidor:
            </label>
            <textarea
              rows={4}
              placeholder="Descreva detalhes específicos observados em campo (localização exata no elemento, extensão da anomalia, dimensões de trincas, se há água escorrendo, se há árvores, etc.)."
              value={activeComponentData.notes}
              onChange={e => updateNotes(e.target.value)}
              className="w-full text-xs sm:text-sm p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 bg-slate-50/40"
            />
          </div>

          {/* Attached Photos Preview for this component */}
          {photosForThisComponent.length > 0 && (
            <div className="pt-2 border-t border-slate-100">
              <span className="text-xs font-bold text-slate-700 mb-2 block">
                Fotos registradas para este componente:
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {photosForThisComponent.map(p => (
                  <div key={p.id} className="relative group rounded-lg overflow-hidden border border-slate-200 bg-slate-100 aspect-video">
                    <img
                      src={p.dataUrl}
                      alt={p.caption || 'Foto componente'}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition p-2 flex flex-col justify-end text-white text-[10px]">
                      <p className="truncate font-semibold">{p.caption || 'Sem legenda'}</p>
                      <p className="text-slate-300 text-[9px] truncate">{p.locationDescription}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Footer Navigation */}
      <div className="flex justify-between items-center pt-2">
        <button
          type="button"
          onClick={onPrev}
          className="flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100 text-xs sm:text-sm font-semibold transition cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Voltar: Barragem & GPS</span>
        </button>

        <button
          type="button"
          onClick={onNext}
          className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs sm:text-sm shadow-xs transition cursor-pointer"
        >
          <span>Avançar: Fotos de Campo</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

function getConditionBadgeClass(cond: SeverityCondition): string {
  switch (cond) {
    case 'adequado':
      return 'bg-emerald-100 text-emerald-800';
    case 'alerta':
      return 'bg-amber-100 text-amber-800';
    case 'critico':
      return 'bg-rose-100 text-rose-800';
    case 'nao_se_aplica':
      return 'bg-slate-100 text-slate-600';
    case 'nao_inspecionado':
      return 'bg-slate-100 text-slate-500';
    default:
      return 'bg-slate-100 text-slate-600';
  }
}

function getConditionLabel(cond: SeverityCondition): string {
  switch (cond) {
    case 'adequado': return 'Adequado';
    case 'alerta': return 'Alerta';
    case 'critico': return 'Crítico';
    case 'nao_se_aplica': return 'N/A';
    case 'nao_inspecionado': return 'Não insp.';
    default: return cond;
  }
}
