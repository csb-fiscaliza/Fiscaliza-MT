// ==============================================================================
// ARQUIVO: src/components/InspectionDetailModal.tsx
// Modal de Visualização Detalhada de Inspeção no Banco de Dados (CSB/SEMA-MT)
// Permite consulta rápida sem alterar a edição em andamento
// ==============================================================================

import React, { useState } from 'react';
import { 
  X, 
  MapPin, 
  Calendar, 
  UserCheck, 
  AlertTriangle, 
  CheckCircle2, 
  Camera, 
  FileText, 
  FileCheck, 
  Bell, 
  Download, 
  Edit3, 
  ShieldCheck,
  Building,
  Droplets,
  Layers
} from 'lucide-react';
import { InspectionData } from '../types/inspection';
import { exportInspectionToJson } from '../services/storage';
import { exportAnonymizedJsonFile } from '../utils/anonymizer';
import { formatGmsString } from '../utils/geoCoordinates';

interface Props {
  inspection: InspectionData | null;
  isOpen: boolean;
  onClose: () => void;
  onEdit: (inspection: InspectionData) => void;
}

export const InspectionDetailModal: React.FC<Props> = ({
  inspection,
  isOpen,
  onClose,
  onEdit
}) => {
  const [activeTab, setActiveTab] = useState<'geral' | 'componentes' | 'fotos' | 'conclusoes'>('geral');

  if (!isOpen || !inspection) return null;

  const d = inspection.damIdentification;
  const g = inspection.generalInfo;
  const c = inspection.conclusions;
  const criticalCount = Object.values(inspection.componentsData).filter(comp => comp.condition === 'critico').length;
  const alertCount = Object.values(inspection.componentsData).filter(comp => comp.condition === 'alerta').length;
  const photosCount = inspection.photos.length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/75 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-4xl w-full shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden my-auto max-h-[92vh] flex flex-col text-slate-800 dark:text-slate-100 transition-colors">
        {/* Modal Header */}
        <div className="bg-slate-900 text-white px-5 py-3.5 flex items-center justify-between border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-emerald-600 flex items-center justify-center font-bold text-white shadow-xs">
              <FileCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm sm:text-base font-bold text-white leading-tight">
                  {d.damName || d.propertyOrBusinessName || 'Vistoria sem título'}
                </h2>
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${
                  inspection.tipoPlanejamento === 'futura' || g.tipoPlanejamento === 'futura'
                    ? 'bg-indigo-950 text-indigo-300 border-indigo-700/50'
                    : 'bg-emerald-950 text-emerald-300 border-emerald-700/50'
                }`}>
                  {inspection.tipoPlanejamento === 'futura' || g.tipoPlanejamento === 'futura' 
                    ? 'Vistoria Futura (Pré-salva)' 
                    : (g.numeroVistoria ? `Vistoria Nº ${g.numeroVistoria}` : 'Vistoria Atual')}
                </span>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                  {inspection.isDraft ? 'Rascunho' : 'Finalizada'}
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                {d.municipality || 'Mato Grosso'} • Data: {g.inspectionDate ? new Date(g.inspectionDate + 'T00:00:00').toLocaleDateString('pt-BR') : 'Não informada'}{g.recordNumber ? ` • Processo: ${g.recordNumber}` : ''}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                onClose();
                onEdit(inspection);
              }}
              className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-xs"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>Editar</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 flex items-center justify-center transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Navigation Tabs */}
        <div className="bg-slate-100 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 px-4 py-2 flex items-center gap-1.5 overflow-x-auto shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('geral')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
              activeTab === 'geral'
                ? 'bg-emerald-700 text-white shadow-xs'
                : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700'
            }`}
          >
            <Building className="w-3.5 h-3.5" />
            <span>1. Dados Gerais & Estrutura</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('componentes')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
              activeTab === 'componentes'
                ? 'bg-emerald-700 text-white shadow-xs'
                : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>2. Componentes & Anomalias</span>
            {criticalCount > 0 && (
              <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('fotos')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
              activeTab === 'fotos'
                ? 'bg-emerald-700 text-white shadow-xs'
                : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700'
            }`}
          >
            <Camera className="w-3.5 h-3.5" />
            <span>3. Fotos de Campo ({photosCount})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('conclusoes')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
              activeTab === 'conclusoes'
                ? 'bg-emerald-700 text-white shadow-xs'
                : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700'
            }`}
          >
            <Bell className="w-3.5 h-3.5" />
            <span>4. Conclusões & Notificação</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto space-y-5 flex-1 text-slate-800 dark:text-slate-100">
          
          {/* TAB 1: DADOS GERAIS */}
          {activeTab === 'geral' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 text-xs">
                <div className="border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 bg-slate-50 dark:bg-slate-950/60 space-y-2">
                  <h3 className="font-bold text-slate-900 dark:text-slate-100 text-xs uppercase tracking-wide flex items-center gap-1.5">
                    <Building className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    <span>Identificação da Barragem & Empreendimento</span>
                  </h3>
                  <div className="space-y-1 text-slate-700 dark:text-slate-300">
                    <p><strong>Nome da Barragem:</strong> {d.damName || 'Não informado'}</p>
                    <p><strong>Propriedade / Fazenda:</strong> {d.propertyOrBusinessName || 'Não informada'}</p>
                    <p><strong>Município:</strong> {d.municipality || 'Não informado'}/MT</p>
                    <p><strong>Bacia Hidrográfica:</strong> {d.hydrographicBasin || 'Não informada'}</p>
                    <p><strong>Curso d'Água:</strong> {d.waterCourse || 'Não informado'}</p>
                  </div>
                </div>

                <div className="border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 bg-slate-50 dark:bg-slate-950/60 space-y-2">
                  <h3 className="font-bold text-slate-900 dark:text-slate-100 text-xs uppercase tracking-wide flex items-center gap-1.5">
                    <MapPin className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    <span>Localização Geográfica & Equipe</span>
                  </h3>
                  <div className="space-y-1 text-slate-700 dark:text-slate-300">
                    <p><strong>Coordenadas:</strong> {d.coordinates.latitude ? `${formatGmsString(d.coordinates.latitude, true)}, ${formatGmsString(d.coordinates.longitude, false)} (${d.coordinates.datum || 'SIRGAS 2000'})` : 'Não capturadas'}</p>
                    <p><strong>Data da Vistoria:</strong> {g.inspectionDate ? new Date(g.inspectionDate + 'T00:00:00').toLocaleDateString('pt-BR') : 'Não informada'}</p>
                    <p><strong>Horário:</strong> {g.startTime || '--:--'} às {g.endTime || '--:--'}</p>
                    <p><strong>Condição Climática:</strong> {g.weather || 'Normal'}</p>
                    <p><strong>Servidores CSB:</strong> {g.inspectors.filter(i => i.name).map(i => i.name).join(', ') || 'Não especificados'}</p>
                  </div>
                </div>
              </div>

              {/* Dimensões */}
              <div className="border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 bg-white dark:bg-slate-900 space-y-2">
                <h3 className="font-bold text-slate-900 dark:text-slate-100 text-xs uppercase tracking-wide flex items-center gap-1.5">
                  <Droplets className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <span>Características Técnicas Principais</span>
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  <div className="bg-slate-50 dark:bg-slate-950/70 p-2 rounded-lg border border-slate-100 dark:border-slate-800">
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 uppercase block">Altura do Maciço:</span>
                    <span className="font-bold text-slate-900 dark:text-slate-100">{d.estimatedDimensions.heightMeters ? `${d.estimatedDimensions.heightMeters} m` : 'Não informada'}</span>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-950/70 p-2 rounded-lg border border-slate-100 dark:border-slate-800">
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 uppercase block">Comprimento Coroamento:</span>
                    <span className="font-bold text-slate-900 dark:text-slate-100">{d.estimatedDimensions.crestLengthMeters ? `${d.estimatedDimensions.crestLengthMeters} m` : 'Não informado'}</span>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-950/70 p-2 rounded-lg border border-slate-100 dark:border-slate-800">
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 uppercase block">Volume Reservatório:</span>
                    <span className="font-bold text-slate-900 dark:text-slate-100">{d.estimatedDimensions.reservoirVolumeM3 ? `${d.estimatedDimensions.reservoirVolumeM3} m³` : 'Não informado'}</span>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-950/70 p-2 rounded-lg border border-slate-100 dark:border-slate-800">
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 uppercase block">Tipo de Barramento:</span>
                    <span className="font-bold text-slate-900 dark:text-slate-100">{d.damType || 'Terra'}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: COMPONENTES & ANOMALIAS */}
          {activeTab === 'componentes' && (
            <div className="space-y-3">
              <div className="flex items-center gap-3 text-xs mb-2">
                <span className="font-bold text-slate-700 dark:text-slate-300">Quadro de Condição Geral:</span>
                {criticalCount > 0 && (
                  <span className="px-2 py-0.5 rounded bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-300 font-bold border border-rose-200 dark:border-rose-800">
                    {criticalCount} Crítico(s)
                  </span>
                )}
                {alertCount > 0 && (
                  <span className="px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 font-bold border border-amber-200 dark:border-amber-800">
                    {alertCount} Atenção
                  </span>
                )}
                <span className="px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 font-medium border border-emerald-200 dark:border-emerald-800">
                  {Object.keys(inspection.componentsData).length} Componentes catalogados
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                {Object.values(inspection.componentsData).map(comp => (
                  <div key={comp.componentId} className="border border-slate-200 dark:border-slate-800 rounded-xl p-3 bg-white dark:bg-slate-900 space-y-1.5 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="font-bold text-slate-900 dark:text-slate-100">{comp.componentName}</h4>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        comp.condition === 'critico' 
                          ? 'bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-300 border border-rose-300 dark:border-rose-800' 
                          : comp.condition === 'alerta'
                          ? 'bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800'
                          : comp.condition === 'adequado'
                          ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-300 dark:border-slate-700'
                      }`}>
                        {comp.condition === 'critico' ? 'Crítico' : comp.condition === 'alerta' ? 'Alerta' : comp.condition === 'adequado' ? 'Adequado' : 'Não inspecionado'}
                      </span>
                    </div>

                    {comp.selectedAnomalies && comp.selectedAnomalies.length > 0 && (
                      <div className="space-y-0.5">
                        <span className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold block">Anomalias Fáticas:</span>
                        <ul className="list-disc list-inside text-rose-950 dark:text-rose-300 font-medium text-[11px] bg-rose-50/70 dark:bg-rose-950/40 p-1.5 rounded">
                          {comp.selectedAnomalies.map((a, idx) => (
                            <li key={idx}>{a}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {comp.notes && (
                      <p className="text-[11px] text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-950 p-1.5 rounded border border-slate-100 dark:border-slate-800">
                        {comp.notes}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 3: FOTOS */}
          {activeTab === 'fotos' && (
            <div className="space-y-3">
              {inspection.photos.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {inspection.photos.map((foto, idx) => (
                    <div key={foto.id} className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden bg-white dark:bg-slate-900 shadow-2xs space-y-1.5">
                      <div className="aspect-4/3 bg-slate-900 relative">
                        <img 
                          src={foto.dataUrl} 
                          alt={foto.caption || `Foto ${idx + 1}`}
                          className="w-full h-full object-cover" 
                        />
                        <span className="absolute bottom-1 left-1 bg-black/70 text-white text-[10px] px-1.5 py-0.5 rounded font-mono">
                          Fig. {idx + 1}
                        </span>
                      </div>
                      <div className="p-2 space-y-1 text-xs">
                        <span className="font-bold text-slate-900 dark:text-slate-100 block truncate">{foto.componentName}</span>
                        <p className="text-[11px] text-slate-600 dark:text-slate-400 line-clamp-2">{foto.caption || foto.locationDescription || 'Sem legenda'}</p>
                        {foto.latitude && foto.longitude && (
                          <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono block">
                            [{formatGmsString(foto.latitude, true)}, {formatGmsString(foto.longitude, false)}]
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-slate-500 dark:text-slate-400 text-xs space-y-2">
                  <Camera className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto" />
                  <p>Nenhum registro fotográfico associado a esta vistoria.</p>
                </div>
              )}
            </div>
          )}

          {/* TAB 4: CONCLUSÕES & NOTIFICAÇÃO */}
          {activeTab === 'conclusoes' && (
            <div className="space-y-4 text-xs">
              <div className="border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 bg-slate-50 dark:bg-slate-950/60 space-y-2">
                <h3 className="font-bold text-slate-900 dark:text-slate-100 text-xs uppercase tracking-wide">
                  Constatações Gerais e Recomendações
                </h3>
                <div className="space-y-2">
                  <div>
                    <span className="text-slate-500 dark:text-slate-400 font-semibold block text-[10px]">Constatações Gerais:</span>
                    <p className="text-slate-800 dark:text-slate-200 bg-white dark:bg-slate-900 p-2 rounded border border-slate-200 dark:border-slate-800">
                      {c.generalFindings || 'Nenhuma observação geral registrada.'}
                    </p>
                  </div>
                  <div>
                    <span className="text-slate-500 dark:text-slate-400 font-semibold block text-[10px]">Recomendações ao Empreendedor:</span>
                    <p className="text-slate-800 dark:text-slate-200 bg-white dark:bg-slate-900 p-2 rounded border border-slate-200 dark:border-slate-800">
                      {c.recommendationsToOwner || 'Nenhuma recomendação registrada.'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Notificação Técnica */}
              <div className={`border rounded-xl p-3.5 space-y-2 ${
                c.requiresNotification 
                  ? 'border-amber-300 dark:border-amber-700 bg-amber-50/60 dark:bg-amber-950/30' 
                  : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60'
              }`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-bold">
                    <Bell className={`w-4 h-4 ${c.requiresNotification ? 'text-amber-700 dark:text-amber-400' : 'text-slate-400'}`} />
                    <span className={c.requiresNotification ? 'text-amber-900 dark:text-amber-300' : 'text-slate-700 dark:text-slate-300'}>
                      Notificação Técnica (SIGA Autuação)
                    </span>
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    c.requiresNotification 
                      ? 'bg-amber-200 dark:bg-amber-900 text-amber-900 dark:text-amber-200' 
                      : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                  }`}>
                    {c.requiresNotification ? 'Ativada' : 'Não Solicitada'}
                  </span>
                </div>

                {c.requiresNotification && c.notificationDetails && (
                  <div className="space-y-1.5 text-slate-800 dark:text-slate-200 pt-1 border-t border-amber-200/60 dark:border-amber-800/40">
                    <p><strong>Modelo:</strong> {c.notificationDetails.modelTitle || c.notificationDetails.modelType}</p>
                    <p><strong>Prazo Fixado:</strong> {c.notificationDetails.prazoDias ? `${c.notificationDetails.prazoDias} dias` : 'Pendente de fixação'}</p>
                    <p><strong>Objetivo:</strong> {c.notificationDetails.objetivo || 'Não informado'}</p>
                  </div>
                )}
              </div>
            </div>
          )}

        </div>

        {/* Modal Footer */}
        <div className="bg-slate-50 dark:bg-slate-950 px-5 py-3 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => exportInspectionToJson(inspection)}
              className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer shadow-2xs"
            >
              <Download className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
              <span>Baixar Backup JSON</span>
            </button>

            <button
              type="button"
              onClick={() => exportAnonymizedJsonFile(inspection)}
              className="px-3 py-1.5 rounded-lg border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/60 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300 text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer shadow-2xs"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>Exportar LGPD</span>
            </button>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-900 dark:bg-emerald-600 hover:bg-black dark:hover:bg-emerald-700 text-white text-xs font-bold transition cursor-pointer"
          >
            Fechar Visualização
          </button>
        </div>
      </div>
    </div>
  );
};
