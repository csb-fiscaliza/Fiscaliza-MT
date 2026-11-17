import React, { useState, useRef, useEffect } from 'react';
import { Info, Edit3, CheckCircle2 } from 'lucide-react';
import { ImportedFieldOriginRecord } from '../types/inspection';
import { getSistemaLabel } from '../services/ecosystemConfig';

interface EcosystemImportedFieldProps {
  label: React.ReactNode;
  required?: boolean;
  meta?: ImportedFieldOriginRecord;
  currentValue: string;
  isUnlocked: boolean;
  onUnlock: () => void;
  children: (props: {
    className: string;
    readOnlyByImport: boolean;
    onFocusOrClick: () => void;
    titleTooltip: string;
  }) => React.ReactNode;
  className?: string;
}

export const EcosystemImportedField: React.FC<EcosystemImportedFieldProps> = ({
  label,
  required = false,
  meta,
  currentValue,
  isUnlocked,
  onUnlock,
  children,
  className = ''
}) => {
  const [showInfo, setShowInfo] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showInfo) return;
    const handleOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowInfo(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [showInfo]);

  if (!meta) {
    return (
      <div className={className}>
        <label className="block text-xs font-semibold text-slate-700 mb-1">
          {label} {required && <span className="text-rose-500">*</span>}
        </label>
        {children({
          className:
            'w-full text-xs sm:text-sm min-h-[44px] px-3 py-2 border border-slate-300 rounded-lg bg-slate-50/50',
          readOnlyByImport: false,
          onFocusOrClick: () => {},
          titleTooltip: ''
        })}
      </div>
    );
  }

  const sourceLabel = getSistemaLabel(meta.sourceSystem);
  const wasModified = (currentValue || '').trim() !== (meta.originalValue || '').trim();
  const tooltipText = `Dado importado do sistema: ${sourceLabel}. Editável diretamente — ao salvar a vistoria, a versão editada será gravada no banco e notificará o analista autor.`;

  const inputClassName = wasModified
    ? 'w-full text-xs sm:text-sm min-h-[44px] px-3 py-2 border-2 border-orange-500 rounded-lg bg-orange-100/90 text-orange-950 font-semibold ring-2 ring-orange-300/60 focus:outline-hidden focus:ring-orange-500'
    : 'w-full text-xs sm:text-sm min-h-[44px] px-3 py-2 border-2 border-orange-400 rounded-lg bg-orange-50 text-orange-950 font-medium ring-1 ring-orange-300/70 focus:outline-hidden focus:ring-orange-500';

  return (
    <div
      ref={containerRef}
      className={`relative ${className}`}
      onMouseEnter={() => setShowInfo(true)}
      onMouseLeave={() => {
        if (!isUnlocked) setShowInfo(false);
      }}
    >
      <div className="flex items-center justify-between gap-1 mb-1">
        <label className="block text-xs font-semibold text-slate-800">
          {label} {required && <span className="text-rose-500">*</span>}{' '}
          <span
            className="text-orange-600 font-black text-sm leading-none"
            title={tooltipText}
          >
            *
          </span>
        </label>

        <button
          type="button"
          onClick={e => {
            e.stopPropagation();
            setShowInfo(prev => !prev);
          }}
          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-orange-100 hover:bg-orange-200 border border-orange-300 text-orange-900 text-[10px] font-extrabold cursor-pointer shrink-0"
          title={tooltipText}
        >
          <Info className="w-3 h-3 text-orange-600" />
          <span>{wasModified ? 'Editado*' : `${sourceLabel.split(' ')[0]}*`}</span>
        </button>
      </div>

      <div
        onClick={() => {
          if (!isUnlocked) onUnlock();
        }}
      >
        {children({
          className: inputClassName,
          readOnlyByImport: false,
          onFocusOrClick: () => {
            if (!isUnlocked) onUnlock();
            setShowInfo(true);
          },
          titleTooltip: tooltipText
        })}
      </div>

      {showInfo && (
        <div className="absolute left-0 right-0 sm:min-w-[300px] z-30 mt-1.5 p-3 rounded-xl bg-orange-950 text-orange-50 border border-orange-400 shadow-xl text-[11px] space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div className="font-extrabold text-orange-300 flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5 shrink-0" />
              <span>Dado Importado · Fonte: {sourceLabel}</span>
            </div>
            <button
              type="button"
              onClick={() => setShowInfo(false)}
              className="text-[10px] text-orange-200 underline cursor-pointer"
            >
              Fechar
            </button>
          </div>

          <p className="leading-snug text-orange-100">
            Valor original ({sourceLabel}):{' '}
            <strong className="text-white">{meta.originalValue || '(vazio)'}</strong>
            {meta.originalAnalystEmail && (
              <> · Inserido por: <strong className="text-white">{meta.originalAnalystEmail}</strong></>
            )}
          </p>

          <p className="leading-snug text-orange-200/95 text-[10px]">
            <strong>Edição Livre + Superioridade da Vistoria:</strong> Você pode editar este campo diretamente. Ao salvar a vistoria, a versão editada será gravada no banco e notificará o analista no sistema <strong>{sourceLabel}</strong>.
          </p>

          <div className="flex items-center justify-between gap-2 pt-1 border-t border-orange-800/80">
            {wasModified ? (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-300">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Versão editada pronta para salvar no banco</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-orange-200">
                <Edit3 className="w-3.5 h-3.5 text-orange-400" />
                <span>Campo aberto para edição imediata</span>
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
