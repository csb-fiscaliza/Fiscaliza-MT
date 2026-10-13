// ==============================================================================
// ARQUIVO: src/components/SpeechTextarea.tsx
// Campo Textarea extensivo com botão de microfone integrado (Web Speech API)
// Otimizado para observações, justificativas, constatações e exigências em campo
// ==============================================================================

import React, { useState } from 'react';
import { VoiceInputButton } from './VoiceInputButton';
import { Sparkles, AudioLines } from 'lucide-react';

export interface SpeechTextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: React.ReactNode;
  helperText?: string;
  onValueChange?: (val: string) => void;
  containerClassName?: string;
  speechLanguage?: string;
  badge?: React.ReactNode;
}

export const SpeechTextarea: React.FC<SpeechTextareaProps> = ({
  label,
  helperText,
  value,
  onChange,
  onValueChange,
  rows = 3,
  placeholder,
  className = '',
  containerClassName = '',
  speechLanguage = 'pt-BR',
  badge,
  disabled,
  ...rest
}) => {
  const [liveInterim, setLiveInterim] = useState<string>('');
  const [isDictating, setIsDictating] = useState<boolean>(false);

  const stringValue = typeof value === 'string' ? value : '';

  const handleSpeechChange = (newVal: string) => {
    if (onValueChange) {
      onValueChange(newVal);
    }
    if (onChange) {
      const syntheticEvent = {
        target: { value: newVal },
        currentTarget: { value: newVal }
      } as React.ChangeEvent<HTMLTextAreaElement>;
      onChange(syntheticEvent);
    }
  };

  const handleTranscript = (transcript: string, isFinal: boolean) => {
    if (isFinal) {
      setLiveInterim('');
      setIsDictating(false);
    } else {
      setLiveInterim(transcript);
      setIsDictating(true);
    }
  };

  return (
    <div className={`space-y-1.5 ${containerClassName}`}>
      {/* Barra de cabeçalho: Rótulo + Botão de Voz */}
      {(label || !disabled) && (
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            {typeof label === 'string' ? (
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                {label}
              </label>
            ) : (
              label
            )}
            {badge}
          </div>

          {!disabled && (
            <div className="flex items-center gap-1">
              <VoiceInputButton
                currentValue={stringValue}
                onValueChange={handleSpeechChange}
                onTranscript={handleTranscript}
                lang={speechLanguage}
                size="xs"
                showLabel={true}
                label="Ditar Voz"
                title="Ditar texto usando o microfone do aparelho (Web Speech API)"
              />
            </div>
          )}
        </div>
      )}

      {/* Container do Textarea */}
      <div className="relative">
        <textarea
          rows={rows}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          disabled={disabled}
          className={`w-full text-xs sm:text-sm p-3 rounded-lg border transition-all ${
            isDictating
              ? 'border-rose-400 dark:border-rose-500 ring-2 ring-rose-400/30 bg-rose-50/20 dark:bg-rose-950/20'
              : 'border-slate-300 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/60 focus:bg-white dark:focus:bg-slate-900 focus:ring-2 focus:ring-emerald-500'
          } text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 ${className}`}
          {...rest}
        />
      </div>

      {/* Banner de feedback de fala em tempo real */}
      {liveInterim && (
        <div className="flex items-center gap-2 p-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-300 dark:border-emerald-800 text-[11px] text-emerald-900 dark:text-emerald-200 animate-fadeIn">
          <AudioLines className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 animate-pulse shrink-0" />
          <span className="font-semibold text-emerald-700 dark:text-emerald-300 shrink-0">Ouvindo:</span>
          <span className="italic truncate">"{liveInterim}"</span>
        </div>
      )}

      {/* Texto de apoio inferior opcional */}
      {helperText && (
        <p className="text-[11px] text-slate-500 dark:text-slate-400">
          {helperText}
        </p>
      )}
    </div>
  );
};
