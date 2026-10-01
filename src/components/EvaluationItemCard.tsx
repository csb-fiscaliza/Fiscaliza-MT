import React from 'react';
import { 
  CheckCircle2, 
  XCircle, 
  EyeOff, 
  Ban, 
  HelpCircle, 
  AlertCircle,
  MapPin,
  FileText
} from 'lucide-react';
import { EvaluationResponseType, ConservationState, ItemAvaliadoEntity } from '../types/inspection';

interface Props {
  componentCode: string;
  itemCode: string;
  itemLabel: string;
  value?: ItemAvaliadoEntity;
  onChange: (updated: ItemAvaliadoEntity) => void;
  showLocationOnYes?: boolean;
  showConservationOnYes?: boolean;
}

export const EvaluationItemCard: React.FC<Props> = ({
  componentCode,
  itemCode,
  itemLabel,
  value,
  onChange,
  showLocationOnYes = true,
  showConservationOnYes = false
}) => {
  const currentResponse: EvaluationResponseType = value?.resposta || 'sem_informacao';
  const currentId = value?.id || `item-${componentCode}-${itemCode}`;

  const setResponse = (resp: EvaluationResponseType) => {
    onChange({
      id: currentId,
      vistoriaId: value?.vistoriaId || '',
      componenteCodigo: componentCode,
      itemCodigo: itemCode,
      itemRotuloOriginal: itemLabel,
      resposta: resp,
      localizacaoDetalhe: value?.localizacaoDetalhe || '',
      estadoConservacao: value?.estadoConservacao || null,
      observacaoComplementar: value?.observacaoComplementar || ''
    });
  };

  const updateField = (field: keyof ItemAvaliadoEntity, val: any) => {
    onChange({
      id: currentId,
      vistoriaId: value?.vistoriaId || '',
      componenteCodigo: componentCode,
      itemCodigo: itemCode,
      itemRotuloOriginal: itemLabel,
      resposta: currentResponse,
      localizacaoDetalhe: value?.localizacaoDetalhe || '',
      estadoConservacao: value?.estadoConservacao || null,
      observacaoComplementar: value?.observacaoComplementar || '',
      [field]: val
    });
  };

  const options: { id: EvaluationResponseType; label: string; icon: React.ReactNode; activeClass: string }[] = [
    {
      id: 'sim',
      label: 'Sim',
      icon: <CheckCircle2 className="w-4 h-4" />,
      activeClass: 'bg-rose-600 text-white border-rose-700 shadow-sm'
    },
    {
      id: 'nao',
      label: 'Não',
      icon: <XCircle className="w-4 h-4" />,
      activeClass: 'bg-emerald-600 text-white border-emerald-700 shadow-sm'
    },
    {
      id: 'nao_observado',
      label: 'Não observado',
      icon: <EyeOff className="w-4 h-4" />,
      activeClass: 'bg-slate-700 text-white border-slate-800 shadow-sm'
    },
    {
      id: 'impossivel_observar',
      label: 'Impossível observar',
      icon: <Ban className="w-4 h-4" />,
      activeClass: 'bg-amber-600 text-white border-amber-700 shadow-sm'
    },
    {
      id: 'nao_se_aplica',
      label: 'Não se aplica',
      icon: <HelpCircle className="w-4 h-4" />,
      activeClass: 'bg-slate-500 text-white border-slate-600 shadow-sm'
    }
  ];

  return (
    <div className="p-3.5 sm:p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs space-y-3 transition-colors">
      <div className="flex flex-wrap items-baseline justify-between gap-1.5">
        <span className="text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-100 leading-snug">
          {itemLabel}
        </span>
        {currentResponse === 'sem_informacao' && (
          <span className="text-[10px] text-slate-400 dark:text-slate-500 italic">Pendente de avaliação</span>
        )}
      </div>

      {/* Large Touch Targets for Mobile/Tablet Android */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5 sm:gap-2">
        {options.map(opt => {
          const isSelected = currentResponse === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => setResponse(opt.id)}
              className={`min-h-[44px] py-2 px-2.5 rounded-lg border text-xs font-semibold flex items-center justify-center gap-1.5 text-center transition cursor-pointer select-none ${
                isSelected
                  ? opt.activeClass
                  : 'bg-slate-50/80 dark:bg-slate-800/80 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 active:bg-slate-200'
              }`}
            >
              {opt.icon}
              <span className="truncate">{opt.label}</span>
            </button>
          );
        })}
      </div>

      {/* Conditional: Se "Sim" e requer localização */}
      {currentResponse === 'sim' && showLocationOnYes && (
        <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex flex-col gap-1">
          <label className="text-[11px] font-semibold text-rose-700 dark:text-rose-400 flex items-center gap-1">
            <MapPin className="w-3 h-3 text-rose-600 dark:text-rose-400" />
            <span>Localização da anomalia constatada:</span>
          </label>
          <input
            type="text"
            value={value?.localizacaoDetalhe || ''}
            onChange={e => updateField('localizacaoDetalhe', e.target.value)}
            placeholder="ex: Terço superior próximo ao vertedouro, margem esquerda..."
            className="w-full text-xs p-2.5 rounded-lg border border-rose-300 dark:border-rose-900/60 bg-rose-50/40 dark:bg-rose-950/30 text-slate-800 dark:text-slate-100 focus:ring-1 focus:ring-rose-500 focus:outline-none"
          />
        </div>
      )}

      {/* Conditional: Se "Sim" e requer estado de conservação */}
      {currentResponse === 'sim' && showConservationOnYes && (
        <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex flex-col gap-1">
          <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
            Estado de conservação do dispositivo:
          </label>
          <select
            value={value?.estadoConservacao || ''}
            onChange={e => updateField('estadoConservacao', (e.target.value as ConservationState) || null)}
            className="w-full text-xs p-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100"
          >
            <option value="">Selecione o estado...</option>
            <option value="bom">Bom (Funcional e íntegro)</option>
            <option value="regular">Regular (Pequeno desgaste)</option>
            <option value="ruim">Ruim (Danificado / Quebrado)</option>
            <option value="obstruido">Obstruído (Assoreado / Entupido)</option>
          </select>
        </div>
      )}

      {/* Conditional: Se "Impossível observar", exige/permite o motivo do impedimento */}
      {currentResponse === 'impossivel_observar' && (
        <div className="pt-2 border-t border-amber-100 dark:border-amber-900/40 flex flex-col gap-1 bg-amber-50/50 dark:bg-amber-950/30 p-2.5 rounded-lg border border-amber-200 dark:border-amber-800/50">
          <label className="text-[11px] font-bold text-amber-900 dark:text-amber-300 flex items-center gap-1">
            <AlertCircle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
            <span>Motivo que impediu a observação deste item:</span>
          </label>
          <input
            type="text"
            value={value?.observacaoComplementar || ''}
            onChange={e => updateField('observacaoComplementar', e.target.value)}
            placeholder="ex: Cobertura vegetal espessa impenetrável; nível d'água cobrindo a estrutura; ausência de acesso seguro..."
            className="w-full text-xs p-2 rounded-lg border border-amber-300 dark:border-amber-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 focus:ring-1 focus:ring-amber-500 focus:outline-none"
          />
        </div>
      )}

      {/* Observação complementar opcional para qualquer outro estado se o servidor desejar detalhar */}
      {currentResponse !== 'impossivel_observar' && (
        <div className="pt-1">
          <input
            type="text"
            value={value?.observacaoComplementar || ''}
            onChange={e => updateField('observacaoComplementar', e.target.value)}
            placeholder="Observações complementares deste item (opcional)..."
            className="w-full text-[11px] px-2.5 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-950/50 text-slate-700 dark:text-slate-200 focus:bg-white dark:focus:bg-slate-900 focus:ring-1 focus:ring-emerald-500 focus:outline-none"
          />
        </div>
      )}
    </div>
  );
};
