// ==============================================================================
// ARQUIVO: src/components/DashboardStep.tsx
// Painel de Controle Principal (Página Inicial) - Fiscaliza CSB/SEMA-MT
// Atalhos diretos para "Ficha de Inspeção" e "Banco de Dados", com listagem
// de todas as barragens já inspecionadas e ações de Visualizar, Editar e Excluir.
// ==============================================================================

import React, { useState } from 'react';
import { 
  FileSpreadsheet, 
  Database,
  ArrowRight, 
  PlusCircle, 
  Wifi, 
  WifiOff, 
  Clock,
  CheckCircle2,
  AlertTriangle,
  Eye,
  Edit3,
  Trash2,
  MapPin,
  Calendar,
  Camera,
  Search,
  Bell,
  Sparkles
} from 'lucide-react';
import { InspectionData } from '../types/inspection';
import { FiscalizaLogo } from './FiscalizaLogo';
import { InspectionDetailModal } from './InspectionDetailModal';

interface Props {
  currentInspection: InspectionData;
  allInspections?: InspectionData[];
  onGoToSheet: () => void;
  onGoToDatabase?: () => void;
  onGoToDocuments?: () => void;
  onOpenSecurityModal?: () => void;
  onNewInspection: () => void;
  onLoadSample?: () => void;
  onSelectAndEdit?: (id: string) => void;
  onDeleteInspection?: (id: string) => void;
  isOnline: boolean;
  lastSavedAt: string | null;
}

export const DashboardStep: React.FC<Props> = ({
  currentInspection,
  allInspections = [],
  onGoToSheet,
  onGoToDatabase,
  onNewInspection,
  onLoadSample,
  onSelectAndEdit,
  onDeleteInspection,
  isOnline,
  lastSavedAt
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [detailInspection, setDetailInspection] = useState<InspectionData | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [inspectionToDelete, setInspectionToDelete] = useState<InspectionData | null>(null);

  const d = currentInspection.damIdentification;
  const g = currentInspection.generalInfo;

  // Cálculo de progresso de preenchimento da vistoria ativa
  const inspectedComponents = Object.values(currentInspection.componentsData || {}).filter(
    comp => comp.condition !== 'nao_inspecionado'
  ).length;
  const hasCoords = !!(d.coordinates.latitude && d.coordinates.longitude);
  const hasName = !!(d.damName || d.propertyOrBusinessName);
  const hasPhotos = (currentInspection.photos || []).length > 0;

  let checklistPoints = 0;
  if (hasName) checklistPoints += 25;
  if (hasCoords) checklistPoints += 25;
  if (inspectedComponents > 0) checklistPoints += 30;
  if (hasPhotos) checklistPoints += 20;

  // Filtragem de barragens para a visualização rápida no painel
  const filteredInspections = allInspections.filter(item => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    const dam = item.damIdentification;
    const gen = item.generalInfo;
    return (
      (dam.damName && dam.damName.toLowerCase().includes(term)) ||
      (dam.propertyOrBusinessName && dam.propertyOrBusinessName.toLowerCase().includes(term)) ||
      (dam.municipality && dam.municipality.toLowerCase().includes(term)) ||
      (gen.recordNumber && gen.recordNumber.toLowerCase().includes(term))
    );
  });

  const handleOpenDetail = (insp: InspectionData) => {
    setDetailInspection(insp);
    setIsDetailOpen(true);
  };

  const handleConfirmDelete = () => {
    if (inspectionToDelete && onDeleteInspection) {
      onDeleteInspection(inspectionToDelete.id);
      setInspectionToDelete(null);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto py-2 sm:py-4">
      {/* 1. Banner Institucional de Boas-Vindas */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-emerald-950 text-white rounded-2xl p-5 sm:p-7 border border-slate-700/60 shadow-md relative overflow-hidden">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-5">
          <div className="flex items-start gap-4 max-w-2xl">
            <FiscalizaLogo size="lg" className="shadow-lg mt-1 shrink-0" />
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 uppercase tracking-wider">
                  Sistema Oficial de Campo
                </span>
                <span className="text-xs text-slate-400">
                  CSB / SALARH / SEMA-MT
                </span>
              </div>

              <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white">
                Painel de Controle – Fiscalização de Barragens
              </h1>

              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                Coordenadoria de Segurança de Barragens do Estado de Mato Grosso. Registro fático de campo, avaliação de componentes, banco de dados e emissão de minutas regulatórias.
              </p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row md:flex-col items-start md:items-end gap-2 shrink-0">
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-semibold ${
              isOnline 
                ? 'bg-emerald-950/80 text-emerald-300 border-emerald-700/60' 
                : 'bg-amber-950/80 text-amber-300 border-amber-700/60'
            }`}>
              {isOnline ? <Wifi className="w-4 h-4 text-emerald-400" /> : <WifiOff className="w-4 h-4 text-amber-400" />}
              <span>{isOnline ? 'Dispositivo Online (Sincronizado)' : 'Modo Offline (Gravando Local)'}</span>
            </div>

            <span className="text-[11px] text-slate-400 flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-slate-500" />
              <span>Último salvamento: {lastSavedAt || 'Agora'}</span>
            </span>
          </div>
        </div>
      </div>

      {/* 2. ATALHOS PRINCIPAIS: FICHA DE INSPEÇÃO E BANCO DE DADOS */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Card 1: Ficha de Inspeção */}
        <div className="bg-white dark:bg-slate-900 rounded-3xl border-2 border-emerald-600/80 dark:border-emerald-500/80 p-6 shadow-sm hover:shadow-md transition-all flex flex-col justify-between group relative overflow-hidden">
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-emerald-600 text-white flex items-center justify-center font-bold shadow-xs ring-4 ring-emerald-500/20">
                  <FileSpreadsheet className="w-6 h-6" />
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                    Formulário Oficial
                  </span>
                  <h2 className="text-xl font-black text-slate-900 dark:text-white leading-tight">
                    Ficha de Inspeção
                  </h2>
                </div>
              </div>

              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                CSB / SEMA
              </span>
            </div>

            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              Preenchimento fático de campo com coordenadas GMS (SIRGAS 2000), tópicos estruturais e fotografias georreferenciadas.
            </p>

            {/* Status da vistoria ativa */}
            <div className="bg-slate-50 dark:bg-slate-950/70 rounded-2xl p-3.5 border border-slate-200 dark:border-slate-800 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500 dark:text-slate-400 font-semibold flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span>Vistoria Ativa:</span>
                </span>
                <span className="font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">
                  {checklistPoints}% preenchida
                </span>
              </div>
              <p className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white truncate">
                {d.damName || d.propertyOrBusinessName || 'Nova Vistoria (Sem Denominação)'}
              </p>
              <div className="w-full bg-slate-200 dark:bg-slate-800 rounded-full h-1.5 overflow-hidden">
                <div 
                  className="bg-emerald-600 dark:bg-emerald-500 h-1.5 rounded-full transition-all duration-300"
                  style={{ width: `${checklistPoints}%` }}
                />
              </div>
            </div>
          </div>

          <div className="pt-5 mt-2 flex flex-col sm:flex-row items-center gap-2">
            <button
              type="button"
              onClick={onGoToSheet}
              className="w-full sm:flex-1 py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-bold transition flex items-center justify-center gap-2 shadow-xs cursor-pointer select-none"
            >
              <span>Preencher Ficha</span>
              <ArrowRight className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={onNewInspection}
              className="w-full sm:w-auto py-2.5 px-3 rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-semibold transition flex items-center justify-center gap-1.5 cursor-pointer select-none"
              title="Iniciar nova ficha em branco"
            >
              <PlusCircle className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>Nova</span>
            </button>
          </div>
        </div>

        {/* Card 2: Atalho do Banco de Dados */}
        <div className="bg-white dark:bg-slate-900 rounded-3xl border-2 border-slate-300 dark:border-slate-700 hover:border-emerald-500 dark:hover:border-emerald-500 p-6 shadow-sm hover:shadow-md transition-all flex flex-col justify-between group relative overflow-hidden">
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-slate-900 dark:bg-slate-800 text-emerald-400 flex items-center justify-center font-bold shadow-xs ring-4 ring-slate-900/10 dark:ring-slate-800/40">
                  <Database className="w-6 h-6" />
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Repositório Corporativo
                  </span>
                  <h2 className="text-xl font-black text-slate-900 dark:text-white leading-tight">
                    Banco de Dados
                  </h2>
                </div>
              </div>

              <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700">
                {allInspections.length} {allInspections.length === 1 ? 'Barragem' : 'Barragens'}
              </span>
            </div>

            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              Consulte todas as barragens já inspecionadas no Estado de Mato Grosso, visualize os dados técnicos, edite vistorias e exclua registros com segurança.
            </p>

            {/* Resumo do Banco */}
            <div className="bg-slate-50 dark:bg-slate-950/70 rounded-2xl p-3.5 border border-slate-200 dark:border-slate-800 grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-[10px] text-slate-500 dark:text-slate-400 block">Total de Barragens</span>
                <span className="font-extrabold text-base text-slate-900 dark:text-white">{allInspections.length}</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 dark:text-slate-400 block">Com Fotos Anexadas</span>
                <span className="font-extrabold text-base text-emerald-600 dark:text-emerald-400">
                  {allInspections.filter(i => i.photos.length > 0).length}
                </span>
              </div>
            </div>
          </div>

          <div className="pt-5 mt-2 flex flex-col sm:flex-row items-center gap-2">
            <button
              type="button"
              onClick={onGoToDatabase}
              className="w-full sm:flex-1 py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-black dark:bg-slate-800 dark:hover:bg-slate-700 text-white text-xs sm:text-sm font-bold transition flex items-center justify-center gap-2 shadow-xs cursor-pointer select-none"
            >
              <Database className="w-4 h-4 text-emerald-400" />
              <span>Acessar Banco de Dados</span>
              <ArrowRight className="w-4 h-4" />
            </button>

            {onLoadSample && (
              <button
                type="button"
                onClick={onLoadSample}
                className="w-full sm:w-auto py-2.5 px-3 rounded-xl border border-amber-300 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 text-amber-900 dark:text-amber-300 text-xs font-semibold transition flex items-center justify-center gap-1.5 cursor-pointer select-none"
                title="Carregar exemplo didático de teste"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                <span>Exemplo</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 3. LISTAGEM DE TODAS AS BARRAGENS JÁ INSPECCIONADAS COM AÇÕES: VISUALIZAR, EDITAR, EXCLUIR */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-5 sm:p-6 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400 flex items-center justify-center font-bold">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Todas as Barragens Inspecionadas
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Selecione para visualizar a ficha completa, continuar a edição ou excluir registros
              </p>
            </div>
          </div>

          {/* Campo de Busca Rápida */}
          <div className="relative min-w-[220px]">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Filtrar barragens..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>
        </div>

        {/* Lista de Barragens */}
        {filteredInspections.length > 0 ? (
          <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
            {filteredInspections.map(insp => {
              const dam = insp.damIdentification;
              const gen = insp.generalInfo;
              const isCurrent = insp.id === currentInspection.id;
              const critCount = Object.values(insp.componentsData || {}).filter(c => c.condition === 'critico').length;
              const alrtCount = Object.values(insp.componentsData || {}).filter(c => c.condition === 'alerta').length;

              return (
                <div 
                  key={insp.id}
                  className="py-3.5 first:pt-1 last:pb-1 flex flex-col md:flex-row md:items-center justify-between gap-3 group hover:bg-slate-50/80 dark:hover:bg-slate-800/40 px-2 rounded-xl transition"
                >
                  <div className="space-y-1 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-sm text-slate-900 dark:text-white">
                        {dam.damName || dam.propertyOrBusinessName || 'Barragem sem denominação'}
                      </span>
                      {isCurrent && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                          Ativa
                        </span>
                      )}
                      {insp.conclusions?.requiresNotification && (
                        <span className="text-[10px] font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-1">
                          <Bell className="w-3 h-3" />
                          <span>Notificação</span>
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5 text-slate-400" />
                        <span>{dam.municipality || 'Mato Grosso'}/MT</span>
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                        <span>{gen.inspectionDate || 'Data não informada'}</span>
                      </span>
                      <span className="flex items-center gap-1">
                        <Camera className="w-3.5 h-3.5 text-slate-400" />
                        <span>{insp.photos.length} foto(s)</span>
                      </span>
                      {critCount > 0 ? (
                        <span className="text-rose-600 dark:text-rose-400 font-semibold flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" />
                          <span>{critCount} crítico(s)</span>
                        </span>
                      ) : alrtCount > 0 ? (
                        <span className="text-amber-600 dark:text-amber-400 font-medium">
                          {alrtCount} em atenção
                        </span>
                      ) : (
                        <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                          Adequado
                        </span>
                      )}
                    </div>
                  </div>

                  {/* AÇÕES: VISUALIZAR / EDITAR / EXCLUIR */}
                  <div className="flex items-center gap-2 shrink-0 pt-1 md:pt-0">
                    {/* Visualizar */}
                    <button
                      type="button"
                      onClick={() => handleOpenDetail(insp)}
                      className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer shadow-2xs"
                      title="Visualizar detalhes da barragem"
                    >
                      <Eye className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                      <span>Visualizar</span>
                    </button>

                    {/* Editar */}
                    <button
                      type="button"
                      onClick={() => onSelectAndEdit && onSelectAndEdit(insp.id)}
                      className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-2xs"
                      title="Carregar para editar na Ficha de Inspeção"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>Editar</span>
                    </button>

                    {/* Excluir */}
                    <button
                      type="button"
                      onClick={() => setInspectionToDelete(insp)}
                      className="p-1.5 rounded-lg border border-rose-200 dark:border-rose-900/50 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/60 text-rose-700 dark:text-rose-400 transition cursor-pointer"
                      title="Excluir vistoria"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="py-8 text-center text-xs text-slate-500 dark:text-slate-400 space-y-2">
            <p>Nenhuma barragem encontrada com o termo "{searchTerm}".</p>
            <button
              type="button"
              onClick={() => setSearchTerm('')}
              className="text-emerald-600 dark:text-emerald-400 font-semibold underline cursor-pointer"
            >
              Limpar busca
            </button>
          </div>
        )}

        {/* Link para página completa do Banco de Dados */}
        <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex justify-end">
          <button
            type="button"
            onClick={onGoToDatabase}
            className="text-xs font-bold text-emerald-700 dark:text-emerald-400 hover:underline flex items-center gap-1.5 cursor-pointer"
          >
            <span>Ver página completa do Banco de Dados com filtros avançados</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Modal de Detalhes da Barragem */}
      <InspectionDetailModal
        inspection={detailInspection}
        isOpen={isDetailOpen}
        onClose={() => {
          setIsDetailOpen(false);
          setDetailInspection(null);
        }}
        onEdit={(insp) => {
          setIsDetailOpen(false);
          if (onSelectAndEdit) onSelectAndEdit(insp.id);
        }}
      />

      {/* Modal de Confirmação de Exclusão */}
      {inspectionToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-4 text-slate-800 dark:text-slate-100">
            <div className="flex items-center gap-3 text-rose-700 dark:text-rose-400">
              <div className="w-10 h-10 rounded-xl bg-rose-100 dark:bg-rose-950/60 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-rose-600 dark:text-rose-400" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white leading-tight">
                  Confirmar Exclusão de Vistoria
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Esta ação removerá o registro do banco de dados local.
                </p>
              </div>
            </div>

            <div className="bg-slate-50 dark:bg-slate-950/80 p-3 rounded-xl border border-slate-200 dark:border-slate-800 text-xs space-y-1">
              <p><strong>Barragem:</strong> {inspectionToDelete.damIdentification.damName || 'Sem nome'}</p>
              <p><strong>Município:</strong> {inspectionToDelete.damIdentification.municipality || 'MT'}</p>
              <p><strong>Data:</strong> {inspectionToDelete.generalInfo.inspectionDate || 'Não informada'}</p>
              <p><strong>Fotos anexadas:</strong> {inspectionToDelete.photos.length}</p>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-400">
              Tem certeza que deseja excluir esta vistoria? Esta operação não poderá ser desfeita.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setInspectionToDelete(null)}
                className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition cursor-pointer shadow-xs"
              >
                Sim, Excluir Definitivamente
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
