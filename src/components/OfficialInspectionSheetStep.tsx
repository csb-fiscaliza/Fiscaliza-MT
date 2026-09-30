import React, { useState } from 'react';
import { 
  FileSpreadsheet, 
  ChevronDown, 
  ChevronUp, 
  MapPin, 
  User, 
  Compass, 
  Layers, 
  Ruler, 
  ShieldAlert, 
  ArrowLeft, 
  ArrowRight,
  Navigation,
  Plus,
  Trash2,
  Activity,
  Droplet,
  Waves,
  Eye,
  CheckCircle2
} from 'lucide-react';
import { BASINS_MT, MUNICIPALITIES_MT } from '../data/damComponents';
import { 
  InspectionData, 
  ItemAvaliadoEntity, 
  EvaluationResponseType, 
  DamType 
} from '../types/inspection';
import { EvaluationItemCard } from './EvaluationItemCard';
import { LocationCaptureWidget } from './LocationCaptureWidget';
import { formatGmsString } from '../utils/geoCoordinates';

interface Props {
  data: InspectionData;
  onChange: (updater: (prev: InspectionData) => InspectionData) => void;
  onNext: () => void;
  onPrev: () => void;
}

export const OfficialInspectionSheetStep: React.FC<Props> = ({
  data,
  onChange,
  onNext,
  onPrev
}) => {
  // Estado de recolher/expandir seções preservando as respostas
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    sec1: true,
    sec2: true,
    sec3: true,
    sec4: true,
    sec5: false,
    sec6: false,
    sec7: false,
    sec8: false,
    sec9: false,
    sec10: false,
    sec11: false,
    sec12: false
  });

  const toggleSection = (key: string) => {
    setOpenSections(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // Helper para atualizar item avaliado individual
  const updateItemAvaliado = (item: ItemAvaliadoEntity) => {
    onChange(prev => {
      const key = `${item.componenteCodigo}_${item.itemCodigo}`;
      return {
        ...prev,
        itensAvaliadosDetalhados: {
          ...(prev.itensAvaliadosDetalhados || {}),
          [key]: item
        }
      };
    });
  };

  const getItem = (componentCode: string, itemCode: string, labelDefault: string): ItemAvaliadoEntity => {
    const key = `${componentCode}_${itemCode}`;
    if (data.itensAvaliadosDetalhados?.[key]) {
      return data.itensAvaliadosDetalhados[key];
    }
    return {
      id: `item-${componentCode}-${itemCode}`,
      vistoriaId: data.id,
      componenteCodigo: componentCode,
      itemCodigo: itemCode,
      itemRotuloOriginal: labelDefault,
      resposta: 'sem_informacao',
      localizacaoDetalhe: '',
      estadoConservacao: null,
      observacaoComplementar: ''
    };
  };

  // Captura de GPS
  const [gpsLoading, setGpsLoading] = useState(false);
  const handleCaptureGps = () => {
    if (!navigator.geolocation) {
      alert('Geolocalização não suportada neste dispositivo.');
      return;
    }
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      pos => {
        const lat = formatGmsString(pos.coords.latitude, true, false);
        const lng = formatGmsString(pos.coords.longitude, false, false);
        onChange(prev => ({
          ...prev,
          damIdentification: {
            ...prev.damIdentification,
            coordinates: {
              ...prev.damIdentification.coordinates,
              latitude: lat,
              longitude: lng,
              accuracyMeters: pos.coords.accuracy
            }
          }
        }));
        setGpsLoading(false);
      },
      err => {
        setGpsLoading(false);
        alert('Erro ao obter satélites GPS: ' + err.message);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  };

  return (
    <div className="space-y-4 pb-20 sm:pb-12">
      {/* Banner de Identificação da Ficha Aprovada */}
      <div className="bg-slate-900 text-white rounded-xl p-4 shadow-sm flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-emerald-600 flex items-center justify-center font-bold text-white">
            <FileSpreadsheet className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-sm sm:text-base font-extrabold tracking-tight">
              Ficha de Inspeção para Segurança de Barragens
            </h1>
            <p className="text-xs text-slate-300">
              Formulário Oficial CSB / SEMA-MT • Respostas estritas e anotações de campo
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              const allOpen = Object.values(openSections).every(Boolean);
              const nextState: Record<string, boolean> = {};
              Object.keys(openSections).forEach(k => {
                nextState[k] = !allOpen;
              });
              setOpenSections(nextState);
            }}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold border border-slate-700 text-slate-200 cursor-pointer"
          >
            {Object.values(openSections).every(Boolean) ? 'Recolher Todas' : 'Expandir Todas'}
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* SEÇÃO 1: DADOS GERAIS DA BARRAGEM */}
      {/* ========================================================================= */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <button
          type="button"
          onClick={() => toggleSection('sec1')}
          className="w-full p-4 bg-slate-50 flex items-center justify-between font-bold text-slate-800 text-xs sm:text-sm uppercase tracking-wide cursor-pointer select-none"
        >
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center text-xs">1</span>
            <span>1. Dados Gerais da Barragem</span>
          </div>
          {openSections.sec1 ? <ChevronUp className="w-5 h-5 text-slate-500" /> : <ChevronDown className="w-5 h-5 text-slate-500" />}
        </button>

        {openSections.sec1 && (
          <div className="p-4 sm:p-5 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Data da Vistoria <span className="text-rose-500">*</span>
                </label>
                <input
                  type="date"
                  value={data.generalInfo.inspectionDate}
                  onChange={e => onChange(p => ({ ...p, generalInfo: { ...p.generalInfo, inspectionDate: e.target.value } }))}
                  className="w-full text-xs sm:text-sm min-h-[44px] px-3 py-2 border border-slate-300 rounded-lg bg-slate-50/50"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Hora de Início
                </label>
                <input
                  type="time"
                  value={data.generalInfo.startTime}
                  onChange={e => onChange(p => ({ ...p, generalInfo: { ...p.generalInfo, startTime: e.target.value } }))}
                  className="w-full text-xs sm:text-sm min-h-[44px] px-3 py-2 border border-slate-300 rounded-lg bg-slate-50/50"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Número da Vistoria <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="ex: 014/2026"
                  value={data.generalInfo.recordNumber}
                  onChange={e => onChange(p => ({ ...p, generalInfo: { ...p.generalInfo, recordNumber: e.target.value } }))}
                  className="w-full text-xs sm:text-sm min-h-[44px] px-3 py-2 border border-slate-300 rounded-lg bg-slate-50/50"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nome da Barragem <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="ex: Açude Fazenda Esperança"
                  value={data.damIdentification.damName}
                  onChange={e => onChange(p => ({ ...p, damIdentification: { ...p.damIdentification, damName: e.target.value } }))}
                  className="w-full text-xs sm:text-sm min-h-[44px] px-3 py-2 border border-slate-300 rounded-lg bg-slate-50/50"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Município (Mato Grosso) <span className="text-rose-500">*</span>
                </label>
                <select
                  value={data.damIdentification.municipality}
                  onChange={e => onChange(p => ({ ...p, damIdentification: { ...p.damIdentification, municipality: e.target.value } }))}
                  className="w-full text-xs sm:text-sm min-h-[44px] px-3 py-2 border border-slate-300 rounded-lg bg-slate-50/50"
                >
                  <option value="">Selecione...</option>
                  {MUNICIPALITIES_MT.map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nome do Curso D'Água Barrado
                </label>
                <input
                  type="text"
                  placeholder="ex: Córrego do Barreiro"
                  value={data.damIdentification.waterCourse}
                  onChange={e => onChange(p => ({ ...p, damIdentification: { ...p.damIdentification, waterCourse: e.target.value } }))}
                  className="w-full text-xs sm:text-sm min-h-[44px] px-3 py-2 border border-slate-300 rounded-lg bg-slate-50/50"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Ano Início da Obra
                </label>
                <input
                  type="number"
                  placeholder="ex: 2012"
                  value={data.damIdentification.estimatedDimensions.heightMeters ? '' : ''}
                  onChange={() => {}}
                  className="w-full text-xs sm:text-sm min-h-[44px] px-3 py-2 border border-slate-300 rounded-lg bg-slate-50/50"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Ano Final da Obra
                </label>
                <input
                  type="number"
                  placeholder="ex: 2014"
                  className="w-full text-xs sm:text-sm min-h-[44px] px-3 py-2 border border-slate-300 rounded-lg bg-slate-50/50"
                />
              </div>
            </div>

            {/* Coordenadas e GPS com Widget Rigoroso */}
            <div className="pt-2">
              <LocationCaptureWidget
                latitude={data.damIdentification.coordinates.latitude}
                longitude={data.damIdentification.coordinates.longitude}
                accuracyMeters={data.damIdentification.coordinates.accuracyMeters}
                altitudeMeters={data.damIdentification.coordinates.altitudeMeters}
                captureTimestamp={data.damIdentification.coordinates.captureTimestamp}
                isManualEdit={data.damIdentification.coordinates.isManualEdit}
                datum={data.damIdentification.coordinates.datum || 'SIRGAS 2000'}
                onChange={coords => {
                  onChange(p => ({
                    ...p,
                    damIdentification: {
                      ...p.damIdentification,
                      coordinates: {
                        ...p.damIdentification.coordinates,
                        ...coords
                      }
                    }
                  }));
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* SEÇÃO 2: IDENTIFICAÇÃO DO EMPREENDEDOR E PROPRIEDADE */}
      {/* ========================================================================= */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <button
          type="button"
          onClick={() => toggleSection('sec2')}
          className="w-full p-4 bg-slate-50 flex items-center justify-between font-bold text-slate-800 text-xs sm:text-sm uppercase tracking-wide cursor-pointer select-none"
        >
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center text-xs">2</span>
            <span>2. Identificação do Empreendedor e Propriedade</span>
          </div>
          {openSections.sec2 ? <ChevronUp className="w-5 h-5 text-slate-500" /> : <ChevronDown className="w-5 h-5 text-slate-500" />}
        </button>

        {openSections.sec2 && (
          <div className="p-4 sm:p-5 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nome do Empreendedor / Razão Social <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="Nome completo ou Razão Social"
                  value={data.damIdentification.propertyOrBusinessName}
                  onChange={e => onChange(p => ({
                    ...p,
                    damIdentification: { ...p.damIdentification, propertyOrBusinessName: e.target.value }
                  }))}
                  className="w-full text-xs sm:text-sm min-h-[44px] px-3 py-2 border border-slate-300 rounded-lg bg-slate-50/50"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  CPF ou CNPJ
                </label>
                <input
                  type="text"
                  placeholder="000.000.000-00 ou 00.000.000/0001-00"
                  className="w-full text-xs sm:text-sm min-h-[44px] px-3 py-2 border border-slate-300 rounded-lg bg-slate-50/50"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Figura Jurídica
                </label>
                <select className="w-full text-xs sm:text-sm min-h-[44px] px-3 py-2 border border-slate-300 rounded-lg bg-slate-50/50">
                  <option value="empresa_privada">Empresa Privada</option>
                  <option value="pessoa_fisica">Pessoa Física</option>
                  <option value="orgao_publico">Órgão Público</option>
                  <option value="cooperativa">Cooperativa / Associação</option>
                  <option value="outra">Outra</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Processo SEMA
                </label>
                <input
                  type="text"
                  placeholder="ex: PROC-2026/04812"
                  className="w-full text-xs sm:text-sm min-h-[44px] px-3 py-2 border border-slate-300 rounded-lg bg-slate-50/50"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Telefone / WhatsApp
                </label>
                <input
                  type="text"
                  placeholder="(65) 99999-0000"
                  className="w-full text-xs sm:text-sm min-h-[44px] px-3 py-2 border border-slate-300 rounded-lg bg-slate-50/50"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Endereço / Localização da Propriedade
                </label>
                <input
                  type="text"
                  placeholder="Rodovia, Km, Zona Rural"
                  className="w-full text-xs sm:text-sm min-h-[44px] px-3 py-2 border border-slate-300 rounded-lg bg-slate-50/50"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  E-mail
                </label>
                <input
                  type="email"
                  placeholder="contato@fazenda.com.br"
                  className="w-full text-xs sm:text-sm min-h-[44px] px-3 py-2 border border-slate-300 rounded-lg bg-slate-50/50"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  CAR / Recibo de Inscrição
                </label>
                <input
                  type="text"
                  placeholder="MT-XXXXXXX-..."
                  value={data.damIdentification.regulatoryStatus.carNumber}
                  onChange={e => onChange(p => ({
                    ...p,
                    damIdentification: {
                      ...p.damIdentification,
                      regulatoryStatus: { ...p.damIdentification.regulatoryStatus, carNumber: e.target.value }
                    }
                  }))}
                  className="w-full text-xs sm:text-sm min-h-[44px] px-3 py-2 border border-slate-300 rounded-lg bg-slate-50/50"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Declaração de Uso / Outorga
                </label>
                <input
                  type="text"
                  placeholder="Nº da outorga ou dispensa"
                  value={data.damIdentification.regulatoryStatus.permitNumber}
                  onChange={e => onChange(p => ({
                    ...p,
                    damIdentification: {
                      ...p.damIdentification,
                      regulatoryStatus: { ...p.damIdentification.regulatoryStatus, permitNumber: e.target.value }
                    }
                  }))}
                  className="w-full text-xs sm:text-sm min-h-[44px] px-3 py-2 border border-slate-300 rounded-lg bg-slate-50/50"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Quantidade de Barragens no Imóvel
                </label>
                <input
                  type="number"
                  defaultValue="1"
                  min="1"
                  className="w-full text-xs sm:text-sm min-h-[44px] px-3 py-2 border border-slate-300 rounded-lg bg-slate-50/50"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Comentários da Seção 2:
              </label>
              <textarea
                rows={2}
                placeholder="Anotações sobre documentação, posse, arrendamento..."
                className="w-full text-xs p-3 border border-slate-300 rounded-lg bg-slate-50/50"
              />
            </div>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* SEÇÃO 3: USOS DA BARRAGEM */}
      {/* ========================================================================= */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <button
          type="button"
          onClick={() => toggleSection('sec3')}
          className="w-full p-4 bg-slate-50 flex items-center justify-between font-bold text-slate-800 text-xs sm:text-sm uppercase tracking-wide cursor-pointer select-none"
        >
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center text-xs">3</span>
            <span>3. Usos da Barragem</span>
          </div>
          {openSections.sec3 ? <ChevronUp className="w-5 h-5 text-slate-500" /> : <ChevronDown className="w-5 h-5 text-slate-500" />}
        </button>

        {openSections.sec3 && (
          <div className="p-4 sm:p-5 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Finalidade de Uso Principal <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="ex: Irrigação de lavoura, Dessedentação de gado, Piscicultura"
                  value={data.damIdentification.mainWaterUse}
                  onChange={e => onChange(p => ({
                    ...p,
                    damIdentification: { ...p.damIdentification, mainWaterUse: e.target.value }
                  }))}
                  className="w-full text-xs sm:text-sm min-h-[44px] px-3 py-2 border border-slate-300 rounded-lg bg-slate-50/50"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Outros Usos Secundários?
                </label>
                <div className="flex items-center gap-4 min-h-[44px]">
                  <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
                    <input
                      type="radio"
                      name="outrosUsos"
                      checked={data.damIdentification.secondaryWaterUses.length > 0}
                      onChange={() => onChange(p => ({
                        ...p,
                        damIdentification: {
                          ...p.damIdentification,
                          secondaryWaterUses: ['Dessedentação animal']
                        }
                      }))}
                      className="w-4 h-4 text-emerald-600"
                    />
                    <span>Sim</span>
                  </label>
                  <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
                    <input
                      type="radio"
                      name="outrosUsos"
                      checked={data.damIdentification.secondaryWaterUses.length === 0}
                      onChange={() => onChange(p => ({
                        ...p,
                        damIdentification: {
                          ...p.damIdentification,
                          secondaryWaterUses: []
                        }
                      }))}
                      className="w-4 h-4 text-emerald-600"
                    />
                    <span>Não</span>
                  </label>
                </div>
              </div>
            </div>

            {data.damIdentification.secondaryWaterUses.length > 0 && (
              <div className="pt-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Quais usos secundários?
                </label>
                <input
                  type="text"
                  placeholder="ex: Lazer/Pesca, Dessedentação animal, Abastecimento de pulverizadores"
                  value={data.damIdentification.secondaryWaterUses.join(', ')}
                  onChange={e => {
                    const list = e.target.value.split(',').map(s => s.trim()).filter(Boolean);
                    onChange(p => ({
                      ...p,
                      damIdentification: { ...p.damIdentification, secondaryWaterUses: list }
                    }));
                  }}
                  className="w-full text-xs sm:text-sm min-h-[44px] px-3 py-2 border border-slate-300 rounded-lg bg-slate-50/50"
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* SEÇÃO 4: CARACTERÍSTICAS TÉCNICAS (AFERIÇÃO DE MEDIDAS) */}
      {/* ========================================================================= */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <button
          type="button"
          onClick={() => toggleSection('sec4')}
          className="w-full p-4 bg-slate-50 flex items-center justify-between font-bold text-slate-800 text-xs sm:text-sm uppercase tracking-wide cursor-pointer select-none"
        >
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center text-xs">4</span>
            <span>4. Características Técnicas (Aferição de Medidas)</span>
          </div>
          {openSections.sec4 ? <ChevronUp className="w-5 h-5 text-slate-500" /> : <ChevronDown className="w-5 h-5 text-slate-500" />}
        </button>

        {openSections.sec4 && (
          <div className="p-4 sm:p-5 space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Altura da Barragem (m)
                </label>
                <input
                  type="text"
                  placeholder="ex: 4.8"
                  value={data.damIdentification.estimatedDimensions.heightMeters}
                  onChange={e => onChange(p => ({
                    ...p,
                    damIdentification: {
                      ...p.damIdentification,
                      estimatedDimensions: { ...p.damIdentification.estimatedDimensions, heightMeters: e.target.value }
                    }
                  }))}
                  className="w-full text-xs sm:text-sm min-h-[44px] p-2.5 border rounded-lg bg-slate-50"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Distância (Crista – Pé) (m)
                </label>
                <input
                  type="text"
                  placeholder="ex: 18.0"
                  className="w-full text-xs sm:text-sm min-h-[44px] p-2.5 border rounded-lg bg-slate-50"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Declividade Talude Jusante (°)
                </label>
                <input
                  type="text"
                  placeholder="ex: 28°"
                  className="w-full text-xs sm:text-sm min-h-[44px] p-2.5 border rounded-lg bg-slate-50"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Largura do Coroamento (m)
                </label>
                <input
                  type="text"
                  placeholder="ex: 4.5"
                  value={data.damIdentification.estimatedDimensions.crestWidthMeters}
                  onChange={e => onChange(p => ({
                    ...p,
                    damIdentification: {
                      ...p.damIdentification,
                      estimatedDimensions: { ...p.damIdentification.estimatedDimensions, crestWidthMeters: e.target.value }
                    }
                  }))}
                  className="w-full text-xs sm:text-sm min-h-[44px] p-2.5 border rounded-lg bg-slate-50"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Extensão do Coroamento (m)
                </label>
                <input
                  type="text"
                  placeholder="ex: 150.0"
                  value={data.damIdentification.estimatedDimensions.crestLengthMeters}
                  onChange={e => onChange(p => ({
                    ...p,
                    damIdentification: {
                      ...p.damIdentification,
                      estimatedDimensions: { ...p.damIdentification.estimatedDimensions, crestLengthMeters: e.target.value }
                    }
                  }))}
                  className="w-full text-xs sm:text-sm min-h-[44px] p-2.5 border rounded-lg bg-slate-50"
                />
              </div>
            </div>

            {/* Tipo de Material */}
            <div className="pt-2">
              <label className="block text-xs font-bold text-slate-800 mb-2">
                Tipo de Barragem Quanto ao Material – Definição:
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {[
                  { id: 'terra_homogenea', label: 'Barragem de Terra Homogênea' },
                  { id: 'terra_zoneada', label: 'Barragem de Terra Zoneada' },
                  { id: 'enrocamento', label: 'Barragem de Enrocamento' },
                  { id: 'terra_enrocamento', label: 'Barragem de Terra / Enrocamento' },
                  { id: 'aterro_barragem', label: 'Aterro Barragem' }
                ].map(mat => (
                  <label
                    key={mat.id}
                    className={`min-h-[44px] flex items-center gap-2 p-2.5 rounded-lg border text-xs font-medium cursor-pointer transition ${
                      data.damIdentification.damType === mat.id
                        ? 'bg-emerald-50 border-emerald-500 text-emerald-950 font-bold ring-1 ring-emerald-400'
                        : 'bg-slate-50/60 border-slate-200 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <input
                      type="radio"
                      name="damMaterial"
                      checked={data.damIdentification.damType === mat.id}
                      onChange={() => onChange(p => ({
                        ...p,
                        damIdentification: { ...p.damIdentification, damType: mat.id as DamType }
                      }))}
                      className="w-4 h-4 text-emerald-600"
                    />
                    <span>{mat.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Comentários da Seção 4:
              </label>
              <textarea
                rows={2}
                placeholder="Particularidades das medições em campo..."
                className="w-full text-xs p-3 border border-slate-300 rounded-lg bg-slate-50/50"
              />
            </div>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* SEÇÃO 5: TALUDE DE MONTANTE */}
      {/* ========================================================================= */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <button
          type="button"
          onClick={() => toggleSection('sec5')}
          className="w-full p-4 bg-slate-50 flex items-center justify-between font-bold text-slate-800 text-xs sm:text-sm uppercase tracking-wide cursor-pointer select-none"
        >
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center text-xs">5</span>
            <span>5. Talude de Montante</span>
          </div>
          {openSections.sec5 ? <ChevronUp className="w-5 h-5 text-slate-500" /> : <ChevronDown className="w-5 h-5 text-slate-500" />}
        </button>

        {openSections.sec5 && (
          <div className="p-4 sm:p-5 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <EvaluationItemCard
                componentCode="montante"
                itemCode="erosoes"
                itemLabel="Erosões"
                value={getItem('montante', 'erosoes', 'Erosões')}
                onChange={updateItemAvaliado}
                showLocationOnYes
              />
              <EvaluationItemCard
                componentCode="montante"
                itemCode="escorregamento"
                itemLabel="Escorregamento"
                value={getItem('montante', 'escorregamento', 'Escorregamento')}
                onChange={updateItemAvaliado}
                showLocationOnYes
              />
              <EvaluationItemCard
                componentCode="montante"
                itemCode="afundamento"
                itemLabel="Afundamento e/ou Buracos"
                value={getItem('montante', 'afundamento', 'Afundamento e/ou Buracos')}
                onChange={updateItemAvaliado}
              />
              <EvaluationItemCard
                componentCode="montante"
                itemCode="arvores_arbustos"
                itemLabel="Árvores e Arbustos"
                value={getItem('montante', 'arvores_arbustos', 'Árvores e Arbustos')}
                onChange={updateItemAvaliado}
              />
              <EvaluationItemCard
                componentCode="montante"
                itemCode="drenos_canaletas"
                itemLabel="Drenos / Canaletas"
                value={getItem('montante', 'drenos_canaletas', 'Drenos / Canaletas')}
                onChange={updateItemAvaliado}
                showConservationOnYes
              />
              <EvaluationItemCard
                componentCode="montante"
                itemCode="biologicos"
                itemLabel="Formigueiros / Cupinzeiros / Tocas de Animais"
                value={getItem('montante', 'biologicos', 'Formigueiros / Cupinzeiros / Tocas')}
                onChange={updateItemAvaliado}
              />
              <EvaluationItemCard
                componentCode="montante"
                itemCode="sinais_movimentacao"
                itemLabel="Sinais de Movimentação"
                value={getItem('montante', 'sinais_movimentacao', 'Sinais de Movimentação')}
                onChange={updateItemAvaliado}
              />
            </div>

            {/* Proteção do Talude de Montante */}
            <div className="pt-2">
              <label className="block text-xs font-bold text-slate-800 mb-2">
                Proteção do Talude:
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-6 gap-2">
                {['RIP RAP', 'Grama', 'Concreto', 'Cascalho', 'Ausente', 'Outros'].map(prot => (
                  <label key={prot} className="min-h-[40px] flex items-center gap-2 p-2 rounded-lg border border-slate-200 text-xs cursor-pointer hover:bg-slate-50">
                    <input type="checkbox" className="w-4 h-4 text-emerald-600 rounded" />
                    <span>{prot}</span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Comentários - Talude de Montante:
              </label>
              <textarea
                rows={2}
                placeholder="Observações complementares deste talude..."
                className="w-full text-xs p-3 border border-slate-300 rounded-lg bg-slate-50/50"
              />
            </div>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* SEÇÃO 6: COROAMENTO (CRISTA) */}
      {/* ========================================================================= */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <button
          type="button"
          onClick={() => toggleSection('sec6')}
          className="w-full p-4 bg-slate-50 flex items-center justify-between font-bold text-slate-800 text-xs sm:text-sm uppercase tracking-wide cursor-pointer select-none"
        >
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center text-xs">6</span>
            <span>6. Coroamento (Crista)</span>
          </div>
          {openSections.sec6 ? <ChevronUp className="w-5 h-5 text-slate-500" /> : <ChevronDown className="w-5 h-5 text-slate-500" />}
        </button>

        {openSections.sec6 && (
          <div className="p-4 sm:p-5 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <EvaluationItemCard
                componentCode="coroamento"
                itemCode="erosoes"
                itemLabel="Erosões"
                value={getItem('coroamento', 'erosoes', 'Erosões')}
                onChange={updateItemAvaliado}
                showLocationOnYes
              />
              <EvaluationItemCard
                componentCode="coroamento"
                itemCode="rachaduras"
                itemLabel="Rachaduras / Trincas"
                value={getItem('coroamento', 'rachaduras', 'Rachaduras')}
                onChange={updateItemAvaliado}
                showLocationOnYes
              />
              <EvaluationItemCard
                componentCode="coroamento"
                itemCode="revestimento"
                itemLabel="Revestimento da Pista"
                value={getItem('coroamento', 'revestimento', 'Revestimento')}
                onChange={updateItemAvaliado}
              />
              <EvaluationItemCard
                componentCode="coroamento"
                itemCode="afundamento"
                itemLabel="Afundamento e/ou Buracos"
                value={getItem('coroamento', 'afundamento', 'Afundamento e/ou Buracos')}
                onChange={updateItemAvaliado}
                showLocationOnYes
              />
              <EvaluationItemCard
                componentCode="coroamento"
                itemCode="arvores_arbustos"
                itemLabel="Árvores e Arbustos"
                value={getItem('coroamento', 'arvores_arbustos', 'Árvores e Arbustos')}
                onChange={updateItemAvaliado}
              />
              <EvaluationItemCard
                componentCode="coroamento"
                itemCode="drenos_canaletas"
                itemLabel="Drenos / Canaletas"
                value={getItem('coroamento', 'drenos_canaletas', 'Drenos / Canaletas')}
                onChange={updateItemAvaliado}
                showConservationOnYes
              />
              <EvaluationItemCard
                componentCode="coroamento"
                itemCode="meio_fio"
                itemLabel="Possui Meio-Fio"
                value={getItem('coroamento', 'meio_fio', 'Possui Meio Fio')}
                onChange={updateItemAvaliado}
                showConservationOnYes
              />
              <EvaluationItemCard
                componentCode="coroamento"
                itemCode="ameaca_transbordamento"
                itemLabel="Ameaça de Transbordamento (Borda Livre < 0,5m)"
                value={getItem('coroamento', 'ameaca_transbordamento', 'Ameaça de Transbordamento')}
                onChange={updateItemAvaliado}
              />
            </div>

            {/* Conservação das Ombreiras */}
            <div className="pt-2 border-t border-slate-100">
              <label className="block text-xs font-bold text-slate-800 mb-2">
                Estado de Conservação das Ombreiras:
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Ombreira Esquerda:
                  </label>
                  <input
                    type="text"
                    placeholder="Condição visual, trincas, erosão no contato..."
                    className="w-full text-xs p-2.5 rounded-lg border border-slate-300 bg-slate-50"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Ombreira Direita:
                  </label>
                  <input
                    type="text"
                    placeholder="Condição visual, trincas, erosão no contato..."
                    className="w-full text-xs p-2.5 rounded-lg border border-slate-300 bg-slate-50"
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Comentários - Coroamento:
              </label>
              <textarea
                rows={2}
                placeholder="Observações complementares do coroamento..."
                className="w-full text-xs p-3 border border-slate-300 rounded-lg bg-slate-50/50"
              />
            </div>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* SEÇÃO 7: TALUDE DE JUSANTE */}
      {/* ========================================================================= */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <button
          type="button"
          onClick={() => toggleSection('sec7')}
          className="w-full p-4 bg-slate-50 flex items-center justify-between font-bold text-slate-800 text-xs sm:text-sm uppercase tracking-wide cursor-pointer select-none"
        >
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center text-xs">7</span>
            <span>7. Talude de Jusante</span>
          </div>
          {openSections.sec7 ? <ChevronUp className="w-5 h-5 text-slate-500" /> : <ChevronDown className="w-5 h-5 text-slate-500" />}
        </button>

        {openSections.sec7 && (
          <div className="p-4 sm:p-5 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <EvaluationItemCard
                componentCode="jusante"
                itemCode="erosoes"
                itemLabel="Erosões"
                value={getItem('jusante', 'erosoes', 'Erosões')}
                onChange={updateItemAvaliado}
                showLocationOnYes
              />
              <EvaluationItemCard
                componentCode="jusante"
                itemCode="escorregamento"
                itemLabel="Escorregamento"
                value={getItem('jusante', 'escorregamento', 'Escorregamento')}
                onChange={updateItemAvaliado}
                showLocationOnYes
              />
              <EvaluationItemCard
                componentCode="jusante"
                itemCode="afundamento"
                itemLabel="Afundamento e/ou Buracos"
                value={getItem('jusante', 'afundamento', 'Afundamento e/ou Buracos')}
                onChange={updateItemAvaliado}
              />
              <EvaluationItemCard
                componentCode="jusante"
                itemCode="arvores_arbustos"
                itemLabel="Árvores e Arbustos"
                value={getItem('jusante', 'arvores_arbustos', 'Árvores e Arbustos')}
                onChange={updateItemAvaliado}
              />
              <EvaluationItemCard
                componentCode="jusante"
                itemCode="drenos_canaletas"
                itemLabel="Drenos / Canaletas"
                value={getItem('jusante', 'drenos_canaletas', 'Drenos / Canaletas')}
                onChange={updateItemAvaliado}
                showConservationOnYes
              />
              <EvaluationItemCard
                componentCode="jusante"
                itemCode="biologicos"
                itemLabel="Formigueiros / Cupinzeiros / Tocas de Animais"
                value={getItem('jusante', 'biologicos', 'Formigueiros / Cupinzeiros / Tocas')}
                onChange={updateItemAvaliado}
              />
              <EvaluationItemCard
                componentCode="jusante"
                itemCode="sinais_movimentacao"
                itemLabel="Sinais de Movimentação"
                value={getItem('jusante', 'sinais_movimentacao', 'Sinais de Movimentação')}
                onChange={updateItemAvaliado}
              />
              <EvaluationItemCard
                componentCode="jusante"
                itemCode="fuga_agua"
                itemLabel="Sinais de Fuga D'Água ou Áreas Úmidas"
                value={getItem('jusante', 'fuga_agua', 'Sinais de Fuga D\'Água ou Áreas Úmidas')}
                onChange={updateItemAvaliado}
                showLocationOnYes
              />
              <EvaluationItemCard
                componentCode="jusante"
                itemCode="carregamento_material"
                itemLabel="Carregamento de Material na Água dos Drenos (Piping)"
                value={getItem('jusante', 'carregamento_material', 'Carregamento de Material na Água dos Drenos')}
                onChange={updateItemAvaliado}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Comentários - Talude de Jusante:
              </label>
              <textarea
                rows={2}
                placeholder="Observações complementares de surgências, minadouros..."
                className="w-full text-xs p-3 border border-slate-300 rounded-lg bg-slate-50/50"
              />
            </div>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* SEÇÃO 8: REGIÃO A JUSANTE DA BARRAGEM */}
      {/* ========================================================================= */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <button
          type="button"
          onClick={() => toggleSection('sec8')}
          className="w-full p-4 bg-slate-50 flex items-center justify-between font-bold text-slate-800 text-xs sm:text-sm uppercase tracking-wide cursor-pointer select-none"
        >
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center text-xs">8</span>
            <span>8. Região a Jusante da Barragem</span>
          </div>
          {openSections.sec8 ? <ChevronUp className="w-5 h-5 text-slate-500" /> : <ChevronDown className="w-5 h-5 text-slate-500" />}
        </button>

        {openSections.sec8 && (
          <div className="p-4 sm:p-5 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <EvaluationItemCard
                componentCode="regiao_jusante"
                itemCode="construcoes_leito"
                itemLabel="Construções Próximas ao Leito do Rio"
                value={getItem('regiao_jusante', 'construcoes_leito', 'Construções Próximas ao Leito do Rio')}
                onChange={updateItemAvaliado}
                showLocationOnYes
              />
              <EvaluationItemCard
                componentCode="regiao_jusante"
                itemCode="fuga_agua"
                itemLabel="Fuga D'Água / Percolação Anormal"
                value={getItem('regiao_jusante', 'fuga_agua', 'Fuga D\'Água / Percolação Anormal')}
                onChange={updateItemAvaliado}
                showLocationOnYes
              />
              <EvaluationItemCard
                componentCode="regiao_jusante"
                itemCode="erosao_cavernas"
                itemLabel="Erosão / Cavernas / Buracos"
                value={getItem('regiao_jusante', 'erosao_cavernas', 'Erosão / Cavernas / Buracos')}
                onChange={updateItemAvaliado}
                showLocationOnYes
              />
              <EvaluationItemCard
                componentCode="regiao_jusante"
                itemCode="arvores_faixa_10m"
                itemLabel="Árvores e Arbustos na Faixa de 10 m – Pé da Barragem"
                value={getItem('regiao_jusante', 'arvores_faixa_10m', 'Árvores e Arbustos na Faixa de 10 m – Pé')}
                onChange={updateItemAvaliado}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Comentários - Região a Jusante:
              </label>
              <textarea
                rows={2}
                placeholder="Presença de pontes, casas, estradas vicinais..."
                className="w-full text-xs p-3 border border-slate-300 rounded-lg bg-slate-50/50"
              />
            </div>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* SEÇÃO 9: INSTRUMENTAÇÃO DE MONITORAMENTO */}
      {/* ========================================================================= */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <button
          type="button"
          onClick={() => toggleSection('sec9')}
          className="w-full p-4 bg-slate-50 flex items-center justify-between font-bold text-slate-800 text-xs sm:text-sm uppercase tracking-wide cursor-pointer select-none"
        >
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center text-xs">9</span>
            <span>9. Instrumentação de Monitoramento</span>
          </div>
          {openSections.sec9 ? <ChevronUp className="w-5 h-5 text-slate-500" /> : <ChevronDown className="w-5 h-5 text-slate-500" />}
        </button>

        {openSections.sec9 && (
          <div className="p-4 sm:p-5 space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {[
                'Piezômetro',
                'Marcos de Recalque',
                'Medidores de Vazão de Percolação',
                'Poços de Alívio',
                'Réguas Limnimétricas',
                'NÃO POSSUI'
              ].map(inst => (
                <label key={inst} className="min-h-[44px] flex items-center gap-2 p-2.5 rounded-lg border border-slate-200 text-xs cursor-pointer hover:bg-slate-50 font-medium">
                  <input type="checkbox" className="w-4 h-4 text-emerald-600 rounded" />
                  <span>{inst}</span>
                </label>
              ))}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Comentários - Instrumentação:
              </label>
              <textarea
                rows={2}
                placeholder="Leituras realizadas, conservação dos instrumentos..."
                className="w-full text-xs p-3 border border-slate-300 rounded-lg bg-slate-50/50"
              />
            </div>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* SEÇÃO 10: ESTRUTURAS VERTEDORAS */}
      {/* ========================================================================= */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <button
          type="button"
          onClick={() => toggleSection('sec10')}
          className="w-full p-4 bg-slate-50 flex items-center justify-between font-bold text-slate-800 text-xs sm:text-sm uppercase tracking-wide cursor-pointer select-none"
        >
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center text-xs">10</span>
            <span>10. Estruturas Vertedoras (Vertedor, Monge, Ladrão, etc.)</span>
          </div>
          {openSections.sec10 ? <ChevronUp className="w-5 h-5 text-slate-500" /> : <ChevronDown className="w-5 h-5 text-slate-500" />}
        </button>

        {openSections.sec10 && (
          <div className="p-4 sm:p-5 space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-800 mb-1">
                Descrição (Quantidade, Dimensões e Localização):
              </label>
              <textarea
                rows={4}
                placeholder="ex: Vertedouro lateral escavado em rocha/solo na ombreira direita, largura de soleira 6,0m, canal de restituição com 40m de extensão. Desobstruído e funcional..."
                className="w-full text-xs sm:text-sm p-3 border border-slate-300 rounded-lg bg-slate-50/50"
              />
            </div>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* SEÇÃO 11: RESERVATÓRIO */}
      {/* ========================================================================= */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <button
          type="button"
          onClick={() => toggleSection('sec11')}
          className="w-full p-4 bg-slate-50 flex items-center justify-between font-bold text-slate-800 text-xs sm:text-sm uppercase tracking-wide cursor-pointer select-none"
        >
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center text-xs">11</span>
            <span>11. Reservatório</span>
          </div>
          {openSections.sec11 ? <ChevronUp className="w-5 h-5 text-slate-500" /> : <ChevronDown className="w-5 h-5 text-slate-500" />}
        </button>

        {openSections.sec11 && (
          <div className="p-4 sm:p-5 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <EvaluationItemCard
                componentCode="reservatorio"
                itemCode="erosoes_entorno"
                itemLabel="Erosões Próximas do Entorno"
                value={getItem('reservatorio', 'erosoes_entorno', 'Erosões Próximas do Entorno')}
                onChange={updateItemAvaliado}
                showLocationOnYes
              />
              <EvaluationItemCard
                componentCode="reservatorio"
                itemCode="assoreamento"
                itemLabel="Assoreamento"
                value={getItem('reservatorio', 'assoreamento', 'Assoreamento')}
                onChange={updateItemAvaliado}
              />
              <EvaluationItemCard
                componentCode="reservatorio"
                itemCode="desmoronamento_margens"
                itemLabel="Desmoronamento das Margens"
                value={getItem('reservatorio', 'desmoronamento_margens', 'Desmoronamento das Margens')}
                onChange={updateItemAvaliado}
                showLocationOnYes
              />
              <EvaluationItemCard
                componentCode="reservatorio"
                itemCode="vegetacao_aquatica"
                itemLabel="Vegetação Aquática Excessiva"
                value={getItem('reservatorio', 'vegetacao_aquatica', 'Vegetação Aquática Excessiva')}
                onChange={updateItemAvaliado}
              />
              <EvaluationItemCard
                componentCode="reservatorio"
                itemCode="gado_pastando"
                itemLabel="Gado Pastando no Entorno"
                value={getItem('reservatorio', 'gado_pastando', 'Gado Pastando no Entorno')}
                onChange={updateItemAvaliado}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Comentários - Reservatório:
              </label>
              <textarea
                rows={2}
                placeholder="Qualidade da água, espelho d'água, encostas marginais..."
                className="w-full text-xs p-3 border border-slate-300 rounded-lg bg-slate-50/50"
              />
            </div>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* SEÇÃO 12: OUTROS PROBLEMAS E PESSOAS QUE ACOMPANHARAM */}
      {/* ========================================================================= */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <button
          type="button"
          onClick={() => toggleSection('sec12')}
          className="w-full p-4 bg-slate-50 flex items-center justify-between font-bold text-slate-800 text-xs sm:text-sm uppercase tracking-wide cursor-pointer select-none"
        >
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center text-xs">12</span>
            <span>12. Outros Problemas e Pessoas que Acompanharam</span>
          </div>
          {openSections.sec12 ? <ChevronUp className="w-5 h-5 text-slate-500" /> : <ChevronDown className="w-5 h-5 text-slate-500" />}
        </button>

        {openSections.sec12 && (
          <div className="p-4 sm:p-5 space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-800 mb-1">
                Outros Problemas Existentes:
              </label>
              <textarea
                rows={3}
                placeholder="Anomalias ou questões não abordadas nos itens anteriores..."
                className="w-full text-xs p-3 border border-slate-300 rounded-lg bg-slate-50/50"
              />
            </div>

            <div className="pt-2 border-t border-slate-100">
              <label className="block text-xs font-bold text-slate-800 mb-2">
                Relação de Pessoas que Acompanharam a Vistoria (Nome e CPF):
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input
                  type="text"
                  placeholder="Nome Completo do Acompanhante"
                  value={data.generalInfo.accompaniedBy.name}
                  onChange={e => onChange(p => ({
                    ...p,
                    generalInfo: {
                      ...p.generalInfo,
                      accompaniedBy: { ...p.generalInfo.accompaniedBy, name: e.target.value }
                    }
                  }))}
                  className="w-full text-xs sm:text-sm min-h-[44px] p-2.5 border rounded-lg bg-slate-50"
                />
                <input
                  type="text"
                  placeholder="CPF (000.000.000-00)"
                  value={data.generalInfo.accompaniedBy.document}
                  onChange={e => onChange(p => ({
                    ...p,
                    generalInfo: {
                      ...p.generalInfo,
                      accompaniedBy: { ...p.generalInfo.accompaniedBy, document: e.target.value }
                    }
                  }))}
                  className="w-full text-xs sm:text-sm min-h-[44px] p-2.5 border rounded-lg bg-slate-50"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Mobile-Friendly Sticky Bottom Bar */}
      <div className="fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-slate-200 px-4 py-3 flex items-center justify-between shadow-lg sm:static sm:bg-transparent sm:border-0 sm:shadow-none sm:px-0 sm:pt-4">
        <button
          type="button"
          onClick={onPrev}
          className="min-h-[44px] flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100 text-xs sm:text-sm font-semibold transition cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Voltar</span>
        </button>

        <button
          type="button"
          onClick={onNext}
          className="min-h-[44px] flex items-center gap-2 px-5 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs sm:text-sm shadow-xs transition cursor-pointer"
        >
          <span>Avançar para Fotos de Campo</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
