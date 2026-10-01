// ==============================================================================
// ARQUIVO: src/components/LocationCaptureWidget.tsx
// Widget Oficial de Coordenadas Geográficas em Formato GMS (CSB/SEMA-MT)
// Formato estrito: xxºxx'xx,xx" (ex: 16º15'26,64" S e 56º37'18,48" W)
// ==============================================================================

import React, { useState } from 'react';
import { 
  Compass, 
  Navigation, 
  Clock, 
  ShieldAlert, 
  CheckCircle2, 
  AlertCircle, 
  Edit3, 
  MapPin,
  Sparkles
} from 'lucide-react';
import { formatGmsString, parseGmsToDecimal, decimalToGms, validateGms, maskGms } from '../utils/geoCoordinates';

interface Props {
  latitude: string;
  longitude: string;
  accuracyMeters?: number;
  altitudeMeters?: number | null;
  captureTimestamp?: string | null;
  isManualEdit?: boolean;
  datum: string;
  onChange: (coords: {
    latitude: string;
    longitude: string;
    accuracyMeters?: number;
    altitudeMeters?: number | null;
    captureTimestamp?: string | null;
    isManualEdit: boolean;
  }) => void;
}

export const LocationCaptureWidget: React.FC<Props> = ({
  latitude,
  longitude,
  accuracyMeters,
  altitudeMeters,
  captureTimestamp,
  isManualEdit,
  datum,
  onChange
}) => {
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'idle' | 'success' | 'error'; text: string }>({
    type: 'idle',
    text: ''
  });
  const [latError, setLatError] = useState<string | null>(null);
  const [lonError, setLonError] = useState<string | null>(null);

  // Captura direta via sensor GPS do aparelho e conversão imediata para GMS
  const handleCaptureGps = () => {
    if (!navigator.geolocation) {
      setStatusMessage({
        type: 'error',
        text: 'Geolocalização não suportada neste navegador ou aparelho.'
      });
      return;
    }

    setLoading(true);
    setStatusMessage({ type: 'idle', text: '' });

    navigator.geolocation.getCurrentPosition(
      pos => {
        // Converte imediatamente os graus decimais do sensor em formato GMS xxºxx'xx,xx"
        const latGms = formatGmsString(pos.coords.latitude, true, false);
        const lngGms = formatGmsString(pos.coords.longitude, false, false);
        const acc = Math.round(pos.coords.accuracy * 10) / 10;
        const alt = pos.coords.altitude !== null ? Math.round(pos.coords.altitude * 10) / 10 : null;
        const nowIso = new Date().toISOString();

        onChange({
          latitude: latGms,
          longitude: lngGms,
          accuracyMeters: acc,
          altitudeMeters: alt,
          captureTimestamp: nowIso,
          isManualEdit: false
        });

        setLoading(false);
        setStatusMessage({
          type: 'success',
          text: `Coordenadas capturadas em GMS (${latGms}, ${lngGms}) via sensor do dispositivo (acurácia: ±${acc}m).`
        });
      },
      err => {
        setLoading(false);
        let msg = 'Falha ao obter localização do dispositivo.';
        if (err.code === err.PERMISSION_DENIED) {
          msg = 'Permissão de acesso à localização negada.';
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          msg = 'Sinal de localização indisponível no momento.';
        } else if (err.code === err.TIMEOUT) {
          msg = 'Tempo limite esgotado para obter coordenadas.';
        }
        setStatusMessage({ type: 'error', text: msg });
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0
      }
    );
  };

  const handleKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    currentValue: string,
    changeHandler: (val: string) => void
  ) => {
    if (e.key === 'Backspace') {
      const input = e.currentTarget;
      const { selectionStart, selectionEnd } = input;
      if (selectionStart !== null && selectionStart === selectionEnd && selectionStart > 0) {
        const charBefore = currentValue[selectionStart - 1];
        if (['"', ',', "'", 'º', '°'].includes(charBefore)) {
          e.preventDefault();
          const newVal = currentValue.slice(0, selectionStart - 2) + currentValue.slice(selectionStart);
          changeHandler(newVal);
        }
      }
    }
  };

  const handleManualLatChange = (val: string) => {
    const masked = maskGms(val);
    setLatError(null);
    onChange({
      latitude: masked,
      longitude,
      accuracyMeters: undefined,
      altitudeMeters,
      captureTimestamp,
      isManualEdit: true
    });
  };

  const handleLatBlur = () => {
    if (!latitude || !latitude.trim()) {
      setLatError(null);
      return;
    }
    const formatted = formatGmsString(latitude, true, false);
    const validation = validateGms(formatted, true);
    if (!validation.isValid) {
      setLatError(validation.error || 'Latitude inválida');
    } else {
      setLatError(null);
      if (formatted !== latitude) {
        onChange({
          latitude: formatted,
          longitude,
          accuracyMeters: undefined,
          altitudeMeters,
          captureTimestamp,
          isManualEdit: true
        });
      }
    }
  };

  const handleManualLonChange = (val: string) => {
    const masked = maskGms(val);
    setLonError(null);
    onChange({
      latitude,
      longitude: masked,
      accuracyMeters: undefined,
      altitudeMeters,
      captureTimestamp,
      isManualEdit: true
    });
  };

  const handleLonBlur = () => {
    if (!longitude || !longitude.trim()) {
      setLonError(null);
      return;
    }
    const formatted = formatGmsString(longitude, false, false);
    const validation = validateGms(formatted, false);
    if (!validation.isValid) {
      setLonError(validation.error || 'Longitude inválida');
    } else {
      setLonError(null);
      if (formatted !== longitude) {
        onChange({
          latitude,
          longitude: formatted,
          accuracyMeters: undefined,
          altitudeMeters,
          captureTimestamp,
          isManualEdit: true
        });
      }
    }
  };

  const handleNormalizeGms = () => {
    if (latitude) {
      const formattedLat = formatGmsString(latitude, true, false);
      const formattedLon = longitude ? formatGmsString(longitude, false, false) : '';
      onChange({
        latitude: formattedLat,
        longitude: formattedLon,
        accuracyMeters,
        altitudeMeters,
        captureTimestamp,
        isManualEdit: true
      });
      setStatusMessage({
        type: 'success',
        text: 'Coordenadas normalizadas com sucesso para o padrão GMS xxºxx\'xx,xx"'
      });
    }
  };

  const latGmsFormatado = latitude ? formatGmsString(latitude, true, false) : 'Pendente de preenchimento';
  const lonGmsFormatado = longitude ? formatGmsString(longitude, false, false) : 'Pendente de preenchimento';

  return (
    <div className="p-4 sm:p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs space-y-4 transition-colors">
      {/* Cabeçalho do Bloco */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <Compass className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
          <div>
            <h3 className="text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-100 uppercase tracking-wide">
              Coordenadas Geográficas em Formato GMS (Datum {datum || 'SIRGAS 2000'})
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Padrão obrigatório SEMA-MT: Graus, Minutos e Segundos (ex: 16º15'26,64" S)
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleCaptureGps}
            disabled={loading}
            className="min-h-[44px] px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-2 shadow-xs transition cursor-pointer disabled:opacity-50"
          >
            <Navigation className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span>{loading ? 'Obtendo GMS...' : 'Capturar Localização do Dispositivo'}</span>
          </button>
        </div>
      </div>

      {/* Alerta de Feedback */}
      {statusMessage.type !== 'idle' && (
        <div
          className={`p-3 rounded-lg text-xs flex items-center gap-2 ${
            statusMessage.type === 'success'
              ? 'bg-emerald-50 text-emerald-900 border border-emerald-200'
              : 'bg-rose-50 text-rose-900 border border-rose-200'
          }`}
        >
          {statusMessage.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          )}
          <span>{statusMessage.text}</span>
        </div>
      )}

      {/* Grid de Campos em Formato GMS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
        <div>
          <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
            Latitude em GMS <span className="text-emerald-700 dark:text-emerald-400 font-bold">(xxºxx'xx,xx")</span>
          </label>
          <input
            type="text"
            placeholder={`ex: 16º15'26,64"`}
            value={latitude}
            onChange={e => handleManualLatChange(e.target.value)}
            onKeyDown={e => handleKeyDown(e, latitude, handleManualLatChange)}
            onBlur={handleLatBlur}
            className={`w-full text-xs sm:text-sm min-h-[44px] p-2.5 border rounded-lg font-mono focus:bg-white dark:focus:bg-slate-900 focus:ring-2 focus:outline-none ${
              latError 
                ? 'border-rose-400 bg-rose-50/50 focus:ring-rose-500 text-rose-900 dark:text-rose-100' 
                : 'border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950/80 text-slate-900 dark:text-slate-100 focus:ring-emerald-500'
            }`}
          />
          {latError ? (
            <span className="text-[10px] text-rose-600 dark:text-rose-400 font-medium mt-0.5 block flex items-center gap-1">
              <AlertCircle className="w-3 h-3 shrink-0" />
              {latError}
            </span>
          ) : (
            <span className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 block">
              Exemplo: 16º15'26,64"
            </span>
          )}
        </div>

        <div>
          <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
            Longitude em GMS <span className="text-emerald-700 dark:text-emerald-400 font-bold">(xxºxx'xx,xx")</span>
          </label>
          <input
            type="text"
            placeholder={`ex: 56º37'18,48"`}
            value={longitude}
            onChange={e => handleManualLonChange(e.target.value)}
            onKeyDown={e => handleKeyDown(e, longitude, handleManualLonChange)}
            onBlur={handleLonBlur}
            className={`w-full text-xs sm:text-sm min-h-[44px] p-2.5 border rounded-lg font-mono focus:bg-white dark:focus:bg-slate-900 focus:ring-2 focus:outline-none ${
              lonError 
                ? 'border-rose-400 bg-rose-50/50 focus:ring-rose-500 text-rose-900 dark:text-rose-100' 
                : 'border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950/80 text-slate-900 dark:text-slate-100 focus:ring-emerald-500'
            }`}
          />
          {lonError ? (
            <span className="text-[10px] text-rose-600 dark:text-rose-400 font-medium mt-0.5 block flex items-center gap-1">
              <AlertCircle className="w-3 h-3 shrink-0" />
              {lonError}
            </span>
          ) : (
            <span className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 block">
              Exemplo: 56º37'18,48"
            </span>
          )}
        </div>

        <div>
          <label className="block text-[11px] font-semibold text-slate-700 mb-1">
            Datum Geodésico Oficial
          </label>
          <input
            type="text"
            value={datum || 'SIRGAS 2000'}
            readOnly
            className="w-full text-xs sm:text-sm min-h-[44px] p-2.5 border border-slate-300 rounded-lg bg-slate-100 text-slate-700 font-semibold"
          />
          <span className="text-[10px] text-slate-500 mt-0.5 block">
            Padrão cartográfico legal de Mato Grosso
          </span>
        </div>
      </div>

      {/* Quadro de Visualização Padronizada em GMS */}
      <div className="p-3 bg-emerald-50/60 rounded-xl border border-emerald-200/80 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
        <div className="space-y-0.5">
          <span className="text-[10px] uppercase font-bold text-emerald-900 block">
            Latitude Padronizada (GMS):
          </span>
          <span className="font-mono text-emerald-950 font-bold text-sm block">
            {latGmsFormatado}
          </span>
        </div>
        <div className="space-y-0.5">
          <span className="text-[10px] uppercase font-bold text-emerald-900 block">
            Longitude Padronizada (GMS):
          </span>
          <span className="font-mono text-emerald-950 font-bold text-sm block">
            {lonGmsFormatado}
          </span>
        </div>
      </div>

      {/* Metadados Técnicos da Captura */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1 text-xs text-slate-600">
        <div className="flex items-center gap-1.5 p-2 rounded bg-slate-50 border border-slate-200/80">
          <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <div>
            <span className="text-[10px] text-slate-500 block">Horário da Captura:</span>
            <span className="font-medium text-slate-800">
              {captureTimestamp ? new Date(captureTimestamp).toLocaleString('pt-BR') : 'Não capturado via sensor'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 p-2 rounded bg-slate-50 border border-slate-200/80">
          <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <div>
            <span className="text-[10px] text-slate-500 block">Acurácia Informada:</span>
            <span className="font-medium text-slate-800">
              {accuracyMeters !== undefined ? `±${accuracyMeters} metros` : 'Não informada / Manual'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 p-2 rounded bg-slate-50 border border-slate-200/80">
          <Edit3 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <div>
            <span className="text-[10px] text-slate-500 block">Status da Origem:</span>
            <span className="font-medium text-slate-800">
              {isManualEdit ? 'Digitado / editado manualmente' : captureTimestamp ? 'Direto do sensor do dispositivo' : 'Pendente de preenchimento'}
            </span>
          </div>
        </div>
      </div>

      {/* Altitude Estimada com Aviso Explícito */}
      {altitudeMeters !== null && altitudeMeters !== undefined && (
        <div className="p-2.5 rounded-lg bg-amber-50/70 border border-amber-200/80 text-[11px] text-amber-900 flex items-start gap-2">
          <ShieldAlert className="w-4 h-4 text-amber-700 mt-0.5 shrink-0" />
          <div>
            <span className="font-bold">
              Altitude informada: ~{altitudeMeters} m
            </span>
            <span className="block text-amber-800 mt-0.5">
              Identificada como estimativa aproximada do dispositivo móvel (não substitui levantamento topográfico oficial).
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
