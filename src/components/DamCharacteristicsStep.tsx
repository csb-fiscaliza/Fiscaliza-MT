import React, { useState } from 'react';
import { 
  Compass, 
  MapPin, 
  Navigation, 
  Ruler, 
  Layers, 
  FileCheck2, 
  ArrowLeft, 
  ArrowRight,
  CheckCircle,
  AlertCircle,
  Droplets
} from 'lucide-react';
import { BASINS_MT, MUNICIPALITIES_MT } from '../data/damComponents';
import { DamType, InspectionData, SpillwayType } from '../types/inspection';
import { formatGmsString } from '../utils/geoCoordinates';

interface Props {
  data: InspectionData;
  onChange: (updater: (prev: InspectionData) => InspectionData) => void;
  onNext: () => void;
  onPrev: () => void;
}

export const DamCharacteristicsStep: React.FC<Props> = ({ data, onChange, onNext, onPrev }) => {
  const d = data.damIdentification;
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsStatus, setGpsStatus] = useState<{ type: 'idle' | 'success' | 'error'; message: string }>({
    type: 'idle',
    message: ''
  });

  const updateDam = (field: string, value: any) => {
    onChange(prev => ({
      ...prev,
      damIdentification: {
        ...prev.damIdentification,
        [field]: value
      }
    }));
  };

  const updateCoordinates = (field: string, value: any) => {
    onChange(prev => ({
      ...prev,
      damIdentification: {
        ...prev.damIdentification,
        coordinates: {
          ...prev.damIdentification.coordinates,
          [field]: value
        }
      }
    }));
  };

  const updateDimensions = (field: string, value: string) => {
    onChange(prev => ({
      ...prev,
      damIdentification: {
        ...prev.damIdentification,
        estimatedDimensions: {
          ...prev.damIdentification.estimatedDimensions,
          [field]: value
        }
      }
    }));
  };

  const updateRegulatory = (field: string, value: any) => {
    onChange(prev => ({
      ...prev,
      damIdentification: {
        ...prev.damIdentification,
        regulatoryStatus: {
          ...prev.damIdentification.regulatoryStatus,
          [field]: value
        }
      }
    }));
  };

  const handleCaptureGps = () => {
    if (!navigator.geolocation) {
      setGpsStatus({
        type: 'error',
        message: 'Geolocalização não é suportada neste navegador ou aparelho.'
      });
      return;
    }

    setGpsLoading(true);
    setGpsStatus({ type: 'idle', message: 'Obtendo coordenadas dos satélites...' });

    navigator.geolocation.getCurrentPosition(
      position => {
        const lat = formatGmsString(position.coords.latitude, true, false);
        const lng = formatGmsString(position.coords.longitude, false, false);
        const acc = position.coords.accuracy;

        onChange(prev => ({
          ...prev,
          damIdentification: {
            ...prev.damIdentification,
            coordinates: {
              latitude: lat,
              longitude: lng,
              datum: 'SIRGAS 2000',
              accuracyMeters: acc
            }
          }
        }));

        setGpsLoading(false);
        setGpsStatus({
          type: 'success',
          message: `Coordenadas capturadas em GMS (${lat}, ${lng})! Precisão: ±${acc.toFixed(1)} metros.`
        });
      },
      error => {
        setGpsLoading(false);
        let msg = 'Não foi possível capturar o GPS.';
        if (error.code === error.PERMISSION_DENIED) {
          msg = 'Permissão de acesso à localização negada no navegador.';
        } else if (error.code === error.POSITION_UNAVAILABLE) {
          msg = 'Sinal de satélite GPS indisponível no momento.';
        } else if (error.code === error.TIMEOUT) {
          msg = 'Tempo limite esgotado ao buscar sinal GPS.';
        }
        setGpsStatus({ type: 'error', message: msg });
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0
      }
    );
  };

  return (
    <div className="space-y-6">
      {/* Card 1: Identificação do Empreendimento e Localização */}
      <div className="bg-white rounded-xl shadow-xs border border-slate-200 p-5 space-y-4">
        <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
          <MapPin className="w-4 h-4 text-emerald-600" />
          <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wide">
            2.1 Identificação do Barramento e Propriedade
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Nome / Denominação do Barramento <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              placeholder="ex: Barragem Açude Principal ou Lago 01"
              value={d.damName}
              onChange={e => updateDam('damName', e.target.value)}
              className="w-full text-xs sm:text-sm px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 bg-slate-50/50"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Nome da Fazenda / Imóvel / Empreendimento <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              placeholder="ex: Fazenda Santa Maria"
              value={d.propertyOrBusinessName}
              onChange={e => updateDam('propertyOrBusinessName', e.target.value)}
              className="w-full text-xs sm:text-sm px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 bg-slate-50/50"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Município (Mato Grosso) <span className="text-rose-500">*</span>
            </label>
            <select
              value={d.municipality}
              onChange={e => updateDam('municipality', e.target.value)}
              className="w-full text-xs sm:text-sm px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 bg-slate-50/50"
            >
              <option value="">Selecione o Município</option>
              {MUNICIPALITIES_MT.map(mun => (
                <option key={mun} value={mun}>{mun}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Bacia Hidrográfica
            </label>
            <select
              value={d.hydrographicBasin}
              onChange={e => updateDam('hydrographicBasin', e.target.value)}
              className="w-full text-xs sm:text-sm px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 bg-slate-50/50"
            >
              {BASINS_MT.map(b => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Curso Hídrico Interceptado
            </label>
            <input
              type="text"
              placeholder="ex: Córrego do Cedro, Rio Claro ou Sem Denominação"
              value={d.waterCourse}
              onChange={e => updateDam('waterCourse', e.target.value)}
              className="w-full text-xs sm:text-sm px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 bg-slate-50/50"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Finalidade Principal de Uso da Água
            </label>
            <input
              type="text"
              placeholder="ex: Irrigação por pivô, Dessedentação, Piscicultura"
              value={d.mainWaterUse}
              onChange={e => updateDam('mainWaterUse', e.target.value)}
              className="w-full text-xs sm:text-sm px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 bg-slate-50/50"
            />
          </div>
        </div>

        {/* Coordenadas Geográficas com botão GPS */}
        <div className="pt-3 border-t border-slate-100">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-1.5">
              <Compass className="w-4 h-4 text-emerald-600" />
              <span className="text-xs font-bold text-slate-800">
                Coordenadas Geográficas da Crista (Datum SIRGAS 2000)
              </span>
            </div>

            <button
              type="button"
              onClick={handleCaptureGps}
              disabled={gpsLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-xs transition cursor-pointer disabled:opacity-50"
            >
              <Navigation className={`w-3.5 h-3.5 ${gpsLoading ? 'animate-spin' : ''}`} />
              <span>{gpsLoading ? 'Capturando Satélites...' : 'Capturar GPS Atual em Campo'}</span>
            </button>
          </div>

          {gpsStatus.type !== 'idle' && (
            <div
              className={`mb-3 p-2.5 rounded-lg text-xs flex items-center gap-2 ${
                gpsStatus.type === 'success'
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                  : 'bg-rose-50 text-rose-800 border border-rose-200'
              }`}
            >
              {gpsStatus.type === 'success' ? (
                <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              )}
              <span>{gpsStatus.message}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Latitude em GMS (xxºxx'xx,xx")
              </label>
              <input
                type="text"
                placeholder="ex: 16º15'26,64&quot;"
                value={d.coordinates.latitude}
                onChange={e => updateCoordinates('latitude', e.target.value)}
                className="w-full text-xs px-3 py-2 border border-slate-300 rounded font-mono bg-slate-50/50"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Longitude em GMS (xxºxx'xx,xx")
              </label>
              <input
                type="text"
                placeholder="ex: 56º37'18,48&quot;"
                value={d.coordinates.longitude}
                onChange={e => updateCoordinates('longitude', e.target.value)}
                className="w-full text-xs px-3 py-2 border border-slate-300 rounded font-mono bg-slate-50/50"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Datum Geodésico
              </label>
              <input
                type="text"
                value={d.coordinates.datum}
                onChange={e => updateCoordinates('datum', e.target.value)}
                className="w-full text-xs px-3 py-2 border border-slate-300 rounded bg-slate-100 text-slate-700"
                readOnly
              />
            </div>
          </div>
        </div>
      </div>

      {/* Card 2: Tipologia Construtiva e Dimensões Estimadas */}
      <div className="bg-white rounded-xl shadow-xs border border-slate-200 p-5 space-y-4">
        <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
          <Layers className="w-4 h-4 text-emerald-600" />
          <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wide">
            2.2 Tipologia Construtiva e Extravasor
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Tipo de Estrutura do Barramento
            </label>
            <select
              value={d.damType}
              onChange={e => updateDam('damType', e.target.value as DamType)}
              className="w-full text-xs sm:text-sm px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 bg-slate-50/50"
            >
              <option value="terra_homogenea">Barragem de terra homogênea (Aterro)</option>
              <option value="terra_zoneada">Barragem de terra zoneada</option>
              <option value="enrocamento">Enrocamento com elemento estanque</option>
              <option value="concreto">Barragem de concreto (Gravidade/Arco)</option>
              <option value="alvenaria_pedra">Alvenaria de pedra argamassada</option>
              <option value="mista">Estrutura mista</option>
              <option value="outro">Outra tipologia</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Tipo de Extravasor de Cheias (Vertedouro)
            </label>
            <select
              value={d.spillwayType}
              onChange={e => updateDam('spillwayType', e.target.value as SpillwayType)}
              className="w-full text-xs sm:text-sm px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 bg-slate-50/50"
            >
              <option value="canal_lateral_escavado">Canal lateral escavado no terreno natural</option>
              <option value="soleira_livre_concreto">Soleira livre de concreto / vertedouro frontal</option>
              <option value="tulipa_morning_glory">Tulipa / Poço vertical (Morning Glory)</option>
              <option value="tubulacao_manilha">Tubulação / Manilha extravasora</option>
              <option value="bueiro">Bueiro / Galeria celular de concreto</option>
              <option value="inexistente_vertimento_crista">INEXISTENTE (vertimento descontrolado pela crista)</option>
              <option value="outro">Outro tipo</option>
            </select>
          </div>
        </div>

        {/* Dimensões de Campo */}
        <div className="pt-3 border-t border-slate-100">
          <div className="flex items-center gap-1.5 mb-3">
            <Ruler className="w-4 h-4 text-emerald-600" />
            <span className="text-xs font-bold text-slate-800">
              Dimensões Físicas Estimadas em Campo (Não vinculativas de classe definitiva)
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Altura Máx. (m)
              </label>
              <input
                type="text"
                placeholder="ex: 4.5"
                value={d.estimatedDimensions.heightMeters}
                onChange={e => updateDimensions('heightMeters', e.target.value)}
                className="w-full text-xs px-2.5 py-1.5 border border-slate-300 rounded bg-slate-50/50"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Comp. Crista (m)
              </label>
              <input
                type="text"
                placeholder="ex: 120"
                value={d.estimatedDimensions.crestLengthMeters}
                onChange={e => updateDimensions('crestLengthMeters', e.target.value)}
                className="w-full text-xs px-2.5 py-1.5 border border-slate-300 rounded bg-slate-50/50"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Larg. Crista (m)
              </label>
              <input
                type="text"
                placeholder="ex: 4.0"
                value={d.estimatedDimensions.crestWidthMeters}
                onChange={e => updateDimensions('crestWidthMeters', e.target.value)}
                className="w-full text-xs px-2.5 py-1.5 border border-slate-300 rounded bg-slate-50/50"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Borda Livre (m)
              </label>
              <input
                type="text"
                placeholder="ex: 1.2"
                value={d.estimatedDimensions.freeboardMeters}
                onChange={e => updateDimensions('freeboardMeters', e.target.value)}
                className="w-full text-xs px-2.5 py-1.5 border border-slate-300 rounded bg-slate-50/50"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Espelho d'água (ha)
              </label>
              <input
                type="text"
                placeholder="ex: 5.0"
                value={d.estimatedDimensions.reservoirAreaHectares}
                onChange={e => updateDimensions('reservoirAreaHectares', e.target.value)}
                className="w-full text-xs px-2.5 py-1.5 border border-slate-300 rounded bg-slate-50/50"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Volume Estimado (m³)
              </label>
              <input
                type="text"
                placeholder="ex: 80000"
                value={d.estimatedDimensions.reservoirVolumeM3}
                onChange={e => updateDimensions('reservoirVolumeM3', e.target.value)}
                className="w-full text-xs px-2.5 py-1.5 border border-slate-300 rounded bg-slate-50/50"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Card 3: Regularidade Ambiental e Outorga Declaradas */}
      <div className="bg-white rounded-xl shadow-xs border border-slate-200 p-5 space-y-4">
        <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
          <FileCheck2 className="w-4 h-4 text-emerald-600" />
          <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wide">
            2.3 Regularidade Ambiental Informada no Local
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Outorga de Uso da Água (SEMA-MT)
            </label>
            <select
              value={d.regulatoryStatus.hasWaterPermit}
              onChange={e => updateRegulatory('hasWaterPermit', e.target.value)}
              className="w-full text-xs px-2.5 py-1.5 border border-slate-300 rounded bg-white mb-2"
            >
              <option value="nao_informado">Não informado / Desconhecido</option>
              <option value="sim">Sim, possui Portaria de Outorga</option>
              <option value="em_tramitacao">Em tramitação / Processo protocolado</option>
              <option value="nao">Não possui outorga</option>
            </select>
            <input
              type="text"
              placeholder="Nº da Portaria ou Processo"
              value={d.regulatoryStatus.permitNumber}
              onChange={e => updateRegulatory('permitNumber', e.target.value)}
              className="w-full text-xs px-2.5 py-1.5 border border-slate-300 rounded bg-white"
            />
          </div>

          <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Licença Ambiental / DLA / Dispensa
            </label>
            <select
              value={d.regulatoryStatus.hasEnvironmentalLicense}
              onChange={e => updateRegulatory('hasEnvironmentalLicense', e.target.value)}
              className="w-full text-xs px-2.5 py-1.5 border border-slate-300 rounded bg-white mb-2"
            >
              <option value="nao_informado">Não informado / Desconhecido</option>
              <option value="sim">Sim, possui Licença ou Dispensa</option>
              <option value="em_tramitacao">Em tramitação na SEMA-MT</option>
              <option value="nao">Não possui licenciamento</option>
            </select>
            <input
              type="text"
              placeholder="Nº da Licença ou Dispensa"
              value={d.regulatoryStatus.licenseNumber}
              onChange={e => updateRegulatory('licenseNumber', e.target.value)}
              className="w-full text-xs px-2.5 py-1.5 border border-slate-300 rounded bg-white"
            />
          </div>

          <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Cadastro Ambiental Rural (CAR)
            </label>
            <select
              value={d.regulatoryStatus.hasCar}
              onChange={e => updateRegulatory('hasCar', e.target.value)}
              className="w-full text-xs px-2.5 py-1.5 border border-slate-300 rounded bg-white mb-2"
            >
              <option value="nao_informado">Não informado</option>
              <option value="sim">Possui inscrição no CAR</option>
              <option value="nao">Não possui CAR</option>
            </select>
            <input
              type="text"
              placeholder="Número do Recibo do CAR"
              value={d.regulatoryStatus.carNumber}
              onChange={e => updateRegulatory('carNumber', e.target.value)}
              className="w-full text-xs px-2.5 py-1.5 border border-slate-300 rounded bg-white"
            />
          </div>
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
          <span>Voltar: Equipe & Vistoria</span>
        </button>

        <button
          type="button"
          onClick={onNext}
          className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs sm:text-sm shadow-xs transition cursor-pointer"
        >
          <span>Avançar: Inspeção dos Componentes</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
