// ==============================================================================
// ARQUIVO: src/components/VoiceInputButton.tsx
// Botão de Reconhecimento de Voz via Web Speech API (pt-BR)
// Permite que o fiscal de barragem dite observações, anomalias e justificativas em campo
// ==============================================================================

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Mic, MicOff, AudioLines, AlertCircle } from 'lucide-react';

// Declaração dos tipos do Web Speech API para navegadores Chrome, Safari, Edge e Android
interface IWindowWithSpeech extends Window {
  SpeechRecognition?: any;
  webkitSpeechRecognition?: any;
  mozSpeechRecognition?: any;
  msSpeechRecognition?: any;
}

export interface VoiceInputButtonProps {
  /**
   * Valor atual do campo de texto para concatenação inteligente
   */
  currentValue?: string;
  /**
   * Callback quando o texto transcrito for gerado (concatena ou atualiza)
   */
  onValueChange?: (newValue: string) => void;
  /**
   * Callback opcional que recebe a transcrição bruta da fala
   */
  onTranscript?: (transcript: string, isFinal: boolean) => void;
  /**
   * Idioma da transcrição (padrão: Português do Brasil - pt-BR)
   */
  lang?: string;
  /**
   * Tamanho do botão
   */
  size?: 'xs' | 'sm' | 'md';
  /**
   * Rótulo visual do botão (se omitido, exibe apenas ícone ou ícone + estado)
   */
  label?: string;
  /**
   * Se verdadeiro, mostra texto explicativo ao lado do microfone
   */
  showLabel?: boolean;
  /**
   * Estilo customizado do container
   */
  className?: string;
  /**
   * Título/Tooltip acessível
   */
  title?: string;
}

export const VoiceInputButton: React.FC<VoiceInputButtonProps> = ({
  currentValue = '',
  onValueChange,
  onTranscript,
  lang = 'pt-BR',
  size = 'xs',
  label,
  showLabel = false,
  className = '',
  title = 'Ditar por voz (Web Speech API)'
}) => {
  const [isListening, setIsListening] = useState(false);
  const [interimText, setInterimText] = useState('');
  const [isSupported, setIsSupported] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const recognitionRef = useRef<any>(null);
  const isManuallyStoppedRef = useRef(false);
  const currentValueRef = useRef(currentValue);

  // Mantém referência atualizada do valor para concatenação precisa
  useEffect(() => {
    currentValueRef.current = currentValue;
  }, [currentValue]);

  // Verifica suporte à Web Speech API
  useEffect(() => {
    const win = (typeof window !== 'undefined' ? window : {}) as IWindowWithSpeech;
    const SpeechRecognitionClass =
      win.SpeechRecognition ||
      win.webkitSpeechRecognition ||
      win.mozSpeechRecognition ||
      win.msSpeechRecognition;

    if (!SpeechRecognitionClass) {
      setIsSupported(false);
    }
  }, []);

  // Formata e anexa o trecho falado ao texto existente com pontuação e maiúsculas
  const appendSpeechToText = useCallback(
    (spokenText: string) => {
      const cleanPiece = spokenText.trim();
      if (!cleanPiece) return;

      const base = currentValueRef.current ? currentValueRef.current.trim() : '';

      let updatedText = '';
      if (!base) {
        // Primeira frase: primeira letra maiúscula
        updatedText = cleanPiece.charAt(0).toUpperCase() + cleanPiece.slice(1);
      } else {
        // Se a base termina com pontuação final (. ! ? : \n), inicia com maiúscula
        const endsWithPunct = /[.!?:\n]$/.test(base);
        const formattedPiece = endsWithPunct
          ? cleanPiece.charAt(0).toUpperCase() + cleanPiece.slice(1)
          : cleanPiece;

        // Adiciona espaço separador se não terminar com quebra de linha
        const separator = base.endsWith('\n') ? '' : ' ';
        updatedText = `${base}${separator}${formattedPiece}`;
      }

      currentValueRef.current = updatedText;
      if (onValueChange) {
        onValueChange(updatedText);
      }
    },
    [onValueChange]
  );

  const stopListening = useCallback(() => {
    isManuallyStoppedRef.current = true;
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) {
        // Ignora erros ao parar
      }
    }
    setIsListening(false);
    setInterimText('');
  }, []);

  const startListening = useCallback(() => {
    const win = (typeof window !== 'undefined' ? window : {}) as IWindowWithSpeech;
    const SpeechRecognitionClass =
      win.SpeechRecognition ||
      win.webkitSpeechRecognition ||
      win.mozSpeechRecognition ||
      win.msSpeechRecognition;

    if (!SpeechRecognitionClass) {
      setErrorMessage('Navegador sem suporte à Web Speech API.');
      return;
    }

    setErrorMessage(null);
    isManuallyStoppedRef.current = false;

    try {
      // Se houver uma instância anterior rodando, encerra antes de criar nova
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch (e) {
          // Ignora
        }
      }

      const recognition = new SpeechRecognitionClass();
      recognitionRef.current = recognition;

      recognition.lang = lang;
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;

      recognition.onstart = () => {
        setIsListening(true);
        setErrorMessage(null);
      };

      recognition.onresult = (event: any) => {
        let finalChunk = '';
        let currentInterim = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const item = event.results[i];
          const transcript = item[0]?.transcript || '';

          if (item.isFinal) {
            finalChunk += transcript;
          } else {
            currentInterim += transcript;
          }
        }

        if (finalChunk) {
          appendSpeechToText(finalChunk);
          if (onTranscript) {
            onTranscript(finalChunk, true);
          }
        }

        if (currentInterim) {
          setInterimText(currentInterim);
          if (onTranscript) {
            onTranscript(currentInterim, false);
          }
        } else {
          setInterimText('');
        }
      };

      recognition.onerror = (event: any) => {
        const error = event?.error;
        if (error === 'no-speech') {
          // Silêncio detectado; não interrompe o fluxo
          return;
        }

        if (error === 'not-allowed' || error === 'service-not-allowed') {
          setErrorMessage('Permissão do microfone negada no navegador.');
          setIsListening(false);
          setInterimText('');
        } else if (error === 'network') {
          setErrorMessage('Falha de rede para reconhecimento de fala.');
          setIsListening(false);
        } else {
          // Erro genérico
          setIsListening(false);
        }
      };

      recognition.onend = () => {
        // Se o usuário não pediu para parar manualmente e ainda deve estar ativo, tenta reatar
        if (!isManuallyStoppedRef.current && isListening) {
          try {
            recognition.start();
            return;
          } catch (e) {
            // Se falhar o reinício, finaliza o estado
          }
        }
        setIsListening(false);
        setInterimText('');
      };

      recognition.start();
    } catch (err: any) {
      setErrorMessage('Não foi possível iniciar o microfone.');
      setIsListening(false);
    }
  }, [lang, appendSpeechToText, onTranscript, isListening]);

  // Limpa gravação se o componente for desmontado
  useEffect(() => {
    return () => {
      isManuallyStoppedRef.current = true;
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch (e) {
          // Ignora
        }
      }
    };
  }, []);

  const handleToggle = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!isSupported) {
      setErrorMessage('Web Speech API indisponível neste navegador.');
      return;
    }

    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  };

  // Estilos de dimensionamento
  const sizeClasses = {
    xs: 'px-2 py-1 text-[11px] gap-1',
    sm: 'px-2.5 py-1.5 text-xs gap-1.5',
    md: 'px-3 py-2 text-xs sm:text-sm gap-2'
  };

  const iconSizes = {
    xs: 'w-3 h-3',
    sm: 'w-3.5 h-3.5',
    md: 'w-4 h-4'
  };

  if (!isSupported) {
    return (
      <button
        type="button"
        disabled
        title="Reconhecimento de fala não suportado neste navegador"
        className={`inline-flex items-center rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800 text-slate-400 cursor-not-allowed opacity-60 ${sizeClasses[size]} ${className}`}
      >
        <MicOff className={iconSizes[size]} />
        {showLabel && <span>Microfone indisponível</span>}
      </button>
    );
  }

  return (
    <div className="relative inline-flex items-center">
      <button
        type="button"
        onClick={handleToggle}
        title={isListening ? 'Clique para parar a captura de voz' : title}
        className={`inline-flex items-center font-medium rounded-lg transition-all select-none cursor-pointer ${sizeClasses[size]} ${
          isListening
            ? 'bg-rose-600 hover:bg-rose-700 text-white shadow-sm ring-2 ring-rose-400/50 animate-pulse'
            : 'bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/60 dark:hover:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700 hover:border-emerald-400'
        } ${className}`}
      >
        {isListening ? (
          <>
            <span className="relative flex h-2 w-2 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-200 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-white"></span>
            </span>
            <AudioLines className={`${iconSizes[size]} animate-bounce`} />
            <span>{label || 'Ouvindo...'}</span>
          </>
        ) : (
          <>
            <Mic className={`${iconSizes[size]} text-emerald-700 dark:text-emerald-400 shrink-0`} />
            {showLabel ? (
              <span>{label || 'Ditar'}</span>
            ) : label ? (
              <span>{label}</span>
            ) : null}
          </>
        )}
      </button>

      {/* Alerta de erro de permissão ou rede */}
      {errorMessage && (
        <div
          role="alert"
          onClick={() => setErrorMessage(null)}
          className="absolute right-0 top-full mt-1.5 z-50 p-2 rounded-lg bg-rose-50 dark:bg-rose-950 border border-rose-300 dark:border-rose-800 text-rose-800 dark:text-rose-200 text-[11px] shadow-lg flex items-center gap-1.5 whitespace-nowrap cursor-pointer animate-fadeIn"
        >
          <AlertCircle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
          <span>{errorMessage}</span>
          <span className="text-[9px] opacity-70 underline ml-1">fechar</span>
        </div>
      )}

      {/* Indicador de fala em tempo real (interim) flutuante */}
      {isListening && interimText && (
        <div className="absolute right-0 top-full mt-1 z-40 max-w-xs sm:max-w-sm p-1.5 rounded-lg bg-slate-900/95 text-emerald-300 text-[11px] shadow-lg border border-slate-700 pointer-events-none truncate italic animate-fadeIn">
          <span className="text-slate-400 text-[10px] mr-1 not-italic">Ouvindo:</span>
          "{interimText}"
        </div>
      )}
    </div>
  );
};
