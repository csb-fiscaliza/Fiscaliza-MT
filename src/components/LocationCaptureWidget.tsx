import React, { useState } from 'react';
import { 
  Compass, 
  Navigation, 
  Clock, 
  ShieldAlert, 
  CheckCircle2, 
  AlertCircle, 
  Edit3, 
  MapPin 
} from 'lucide-react';
import { decimalToGms, formatGmsString } from '../utils/geoCoordinates';

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

  const latNum = latitude ? parseFloat(latitude) : null;
  const lonNum = longitude ? parseFloat(longitude) : null;

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
        const lat = pos.coords.latitude.toFixed(6);
        const lng = pos.coords.longitude.toFixed(6);
        const acc = Math.round(pos.coords.accuracy * 10) / 10;
        const alt = pos.coords.altitude !== null ? Math.round(pos.coords.altitude * 10) / 10 : null;
        const nowIso = new Date().toISOString();

        onChange({
          latitude: lat,
          longitude: lng,
          accuracyMeters: acc,
          altitudeMeters: alt,
          captureTimestamp: nowIso,
          isManualEdit: false
        });

        setLoading(false);
        setStatusMessage({
          type: 'success',
          text: `Coordenadas capturadas com sucesso via sensor do dispositivo (acurácia: ±${acc}m).`
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

  const handleManualLatChange = (val: string) => {
    onChange({
      latitude: val,
      longitude,
      accuracyMeters: undefined,
      altitudeMeters,
      captureTimestamp,
      isManualEdit: true
    });
  };

  const handleManualLonChange = (val: string) => {
    onChange({
      latitude,
      longitude: val,
      accuracyMeters: undefined,
      altitudeMeters,
      captureTimestamp,
      isManualEdit: true
    });
  };

  return (
    <div className="p-4 sm:p-5 rounded-xl border border-slate-200 bg-white shadow-xs space-y-4">
      {/* Cabeçalho do Bloco */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2">
          <Compass className="w-5 h-5 text-emerald-600" />
          <div>
            <h3 className="text-xs sm:text-sm font-bold text-slate-800 uppercase tracking-wide">
              Coordenadas Geográficas da Crista (Datum {datum || 'SIRGAS 2000'})
            </h3>
            <p className="text-[11px] text-slate-500">
              Captura opcional de campo via sensor ou digitação manual
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleCaptureGps}
          disabled={loading}
          className="min-h-[44px] px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-2 shadow-xs transition cursor-pointer disabled:opacity-50"
        >
          <Navigation className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          <span>{loading ? 'Obtendo Coordenadas...' : 'Capturar Localização do Dispositivo'}</span>
        </button>
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

      {/* Grid de Campos Numéricos (Decimal) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
        <div>
          <label className="block text-[11px] font-semibold text-slate-700 mb-1">
            Latitude Numérica (Graus Decimais)
          </label>
          <input
            type="number"
            step="any"
            placeholder="-15.598900"
            value={latitude}
            onChange={e => handleManualLatChange(e.target.value)}
            className="w-full text-xs sm:text-sm min-h-[44px] p-2.5 border border-slate-300 rounded-lg bg-slate-50 font-mono"
          />
        </div>

        <div>
          <label className="block text-[11px] font-semibold text-slate-700 mb-1">
            Longitude Numérica (Graus Decimais)
          </label>
          <input
            type="number"
            step="any"
            placeholder="-56.094900"
            value={longitude}
            onChange={e => handleManualLonChange(e.target.value)}
            className="w-full text-xs sm:text-sm min-h-[44px] p-2.5 border border-slate-300 rounded-lg bg-slate-50 font-mono"
          />
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
        </div>
      </div>

      {/* Exibição em GMS (Graus, Minutos e Segundos) */}
      <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
        <div>
          <span className="text-[10px] uppercase font-bold text-slate-500 block mb-0.5">
            Latitude em GMS:
          </span>
          <span className="font-mono text-slate-800 font-semibold">
            {formatGmsString(latNum, true)}
          </span>
        </div>
        <div>
          <span className="text-[10px] uppercase font-bold text-slate-500 block mb-0.5">
            Longitude em GMS:
          </span>
          <span className="font-mono text-slate-800 font-semibold">
            {formatGmsString(lonNum, false)}
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
              {isManualEdit ? 'Editado manualmente pelo servidor' : captureTimestamp ? 'Direto do sensor do dispositivo' : 'Pendente de preenchimento'}
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
