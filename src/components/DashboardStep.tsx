// ==============================================================================
// ARQUIVO: src/components/DashboardStep.tsx
// Painel de Controle Principal (Página Inicial) - Fiscaliza CSB/SEMA-MT
// Estética refinada, moderna, dinâmica e elegante para gestão de barragens
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
  Sparkles,
  ShieldCheck,
  ChevronRight,
  TrendingUp,
  SlidersHorizontal,
  X,
  Lock,
  RefreshCw
} from 'lucide-react';
import { InspectionData } from '../types/inspection';
import { FiscalizaLogo } from './FiscalizaLogo';
import { InspectionDetailModal } from './InspectionDetailModal';
import { InteractiveMap } from './InteractiveMap';
import { canUserEditInspection, canUserDeleteInspection, canUserCreateInspection } from '../services/userService';

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
  onSyncSingle?: (id: string) => void;
  onSyncAll?: () => void;
  isSyncing?: boolean;
  currentUser?: { email?: string; fullName?: string; role?: string; id?: string } | null;
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
  lastSavedAt,
  onSyncSingle,
  onSyncAll,
  isSyncing = false,
  currentUser
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'critical' | 'adequate' | 'photos'>('all');
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

  // Estatísticas Dinâmicas do Banco
  const totalDams = allInspections.length;
  const criticalDams = allInspections.filter(item => 
    Object.values(item.componentsData || {}).some(c => c.condition === 'critico')
  ).length;
  const alertDams = allInspections.filter(item => 
    Object.values(item.componentsData || {}).some(c => c.condition === 'alerta') &&
    !Object.values(item.componentsData || {}).some(c => c.condition === 'critico')
  ).length;
  const totalPhotos = allInspections.reduce((acc, curr) => acc + (curr.photos?.length || 0), 0);
  const notificationsRequired = allInspections.filter(item => item.conclusions?.requiresNotification).length;

  // Filtragem
  const filteredInspections = allInspections.filter(item => {
    // Busca textual
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      const dam = item.damIdentification;
      const gen = item.generalInfo;
      const match = (
        (dam.damName && dam.damName.toLowerCase().includes(term)) ||
        (dam.propertyOrBusinessName && dam.propertyOrBusinessName.toLowerCase().includes(term)) ||
        (dam.municipality && dam.municipality.toLowerCase().includes(term)) ||
        (gen.recordNumber && gen.recordNumber.toLowerCase().includes(term))
      );
      if (!match) return false;
    }

    // Filtro rápido
    if (activeFilter === 'critical') {
      return Object.values(item.componentsData || {}).some(c => c.condition === 'critico' || c.condition === 'alerta');
    }
    if (activeFilter === 'adequate') {
      return !Object.values(item.componentsData || {}).some(c => c.condition === 'critico' || c.condition === 'alerta');
    }
    if (activeFilter === 'photos') {
      return (item.photos?.length || 0) > 0;
    }
    return true;
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
    <div className="space-y-6 max-w-6xl mx-auto py-2 sm:py-4">
      {/* ===================================================================== */}
      {/* 1. HERO BANNER: COMANDO EXECUTIVO & IDENTIDADE CSB/SEMA-MT             */}
      {/* ===================================================================== */}
      <div className="relative rounded-3xl bg-slate-900 text-white p-6 sm:p-8 overflow-hidden shadow-xl border border-slate-800">
        {/* Ambient Gradient Glows */}
        <div className="absolute top-0 right-0 -mr-20 -mt-20 w-96 h-96 rounded-full bg-emerald-500/15 blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-1/3 -mb-20 w-80 h-80 rounded-full bg-cyan-500/10 blur-3xl pointer-events-none" />

        <div className="relative z-10 space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="flex items-start gap-4">
              <FiscalizaLogo size="lg" className="shadow-2xl ring-2 ring-emerald-500/30 shrink-0" />
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-bold text-emerald-400 tracking-wider uppercase text-[10px]">
                    Governo do Estado de Mato Grosso
                  </span>
                  <span className="text-slate-500">·</span>
                  <span className="text-slate-400 text-[11px]">
                    SEMA-MT / SALARH / CSB
                  </span>
                </div>

                <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
                  Fiscalização e Segurança de Barragens
                </h1>

                <p className="text-xs sm:text-sm text-slate-300 max-w-2xl leading-relaxed">
                  Sistema de inteligência de campo para vistorias técnicas, identificação fática de anomalias, georreferenciamento de precisão e gestão do banco de dados estadual.
                </p>
              </div>
            </div>

            {/* Status do Dispositivo */}
            <div className="flex flex-col sm:flex-row md:flex-col items-start md:items-end gap-2 shrink-0">
              <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold backdrop-blur-md border ${
                isOnline 
                  ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' 
                  : 'bg-amber-500/15 text-amber-300 border-amber-500/30 animate-pulse'
              }`}>
                <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                <span>{isOnline ? 'Conexão Online Ativa' : 'Modo Offline (Gravando Local)'}</span>
              </div>

              {lastSavedAt && (
                <span className="text-[11px] text-slate-400 flex items-center gap-1.5 font-mono">
                  <Clock className="w-3.5 h-3.5 text-slate-500" />
                  <span>Último salvamento: {lastSavedAt}</span>
                </span>
              )}
            </div>
          </div>

          {/* Ribbon de Métricas Dinâmicas do Banco */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4 border-t border-slate-800/80">
            <div className="p-3 rounded-2xl bg-white/5 border border-white/5 backdrop-blur-xs">
              <span className="text-[10px] font-semibold tracking-wider text-slate-400 uppercase block">
                Total de Barragens
              </span>
              <div className="flex items-baseline gap-2 mt-0.5">
                <span className="text-2xl font-black text-white tabular-nums">{totalDams}</span>
                <span className="text-xs text-slate-400">cadastradas</span>
              </div>
            </div>

            <div className="p-3 rounded-2xl bg-white/5 border border-white/5 backdrop-blur-xs">
              <span className="text-[10px] font-semibold tracking-wider text-slate-400 uppercase block">
                Com Alerta / Crítico
              </span>
              <div className="flex items-baseline gap-2 mt-0.5">
                <span className="text-2xl font-black text-rose-400 tabular-nums">
                  {criticalDams + alertDams}
                </span>
                <span className="text-xs text-rose-300/80">sob atenção</span>
              </div>
            </div>

            <div className="p-3 rounded-2xl bg-white/5 border border-white/5 backdrop-blur-xs">
              <span className="text-[10px] font-semibold tracking-wider text-slate-400 uppercase block">
                Fotos Técnicas
              </span>
              <div className="flex items-baseline gap-2 mt-0.5">
                <span className="text-2xl font-black text-cyan-400 tabular-nums">{totalPhotos}</span>
                <span className="text-xs text-slate-400">registros</span>
              </div>
            </div>

            <div className="p-3 rounded-2xl bg-white/5 border border-white/5 backdrop-blur-xs">
              <span className="text-[10px] font-semibold tracking-wider text-slate-400 uppercase block">
                Notificações SIGA
              </span>
              <div className="flex items-baseline gap-2 mt-0.5">
                <span className="text-2xl font-black text-amber-400 tabular-nums">{notificationsRequired}</span>
                <span className="text-xs text-amber-300/80">indicadas</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* 2. ATALHOS PRINCIPAIS: FICHA DE INSPEÇÃO E BANCO DE DADOS             */}
      {/* ===================================================================== */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Card 1: Ficha de Inspeção */}
        <div className="group relative rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-6 sm:p-7 shadow-xs hover:shadow-lg transition-all duration-300 flex flex-col justify-between overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-bl-full pointer-events-none group-hover:scale-110 transition-transform" />

          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3.5">
                <div className="w-13 h-13 rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-700 text-white flex items-center justify-center font-bold shadow-md shadow-emerald-500/20 group-hover:scale-105 transition-transform">
                  <FileSpreadsheet className="w-6 h-6" />
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                    Formulário de Campo
                  </span>
                  <h2 className="text-xl font-bold text-slate-900 dark:text-white leading-tight">
                    Ficha de Inspeção
                  </h2>
                </div>
              </div>

              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60">
                Oficial SEMA
              </span>
            </div>

            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              Preenchimento técnico completo com coordenadas em tempo real no formato GMS, levantamento estrutural de 12 seções e catálogo fotográfico.
            </p>

            {/* Widget de Vistoria Ativa */}
            <div className="rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200/60 dark:border-slate-800 p-4 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500 dark:text-slate-400 font-semibold flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <span>Vistoria Carregada:</span>
                </span>
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  {d.damName || d.propertyOrBusinessName ? 'Ficha em Aberto' : 'Nova Ficha'}
                </span>
              </div>

              <div>
                <p className="font-bold text-sm text-slate-900 dark:text-white truncate">
                  {d.damName || d.propertyOrBusinessName || 'Nova Vistoria (Sem Denominação)'}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                  {d.municipality || 'Mato Grosso'}/MT {g.inspectionDate ? `· ${g.inspectionDate}` : ''}
                </p>
              </div>
            </div>
          </div>

          <div className="pt-6 flex flex-col sm:flex-row items-center gap-2.5">
            <button
              type="button"
              onClick={onGoToSheet}
              className="w-full sm:flex-1 py-3 px-5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 active:scale-98 text-white text-xs sm:text-sm font-bold transition shadow-sm flex items-center justify-center gap-2 cursor-pointer select-none"
            >
              <span>Continuar Preenchimento</span>
              <ArrowRight className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={onNewInspection}
              className="w-full sm:w-auto py-3 px-4 rounded-2xl border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs sm:text-sm font-semibold transition flex items-center justify-center gap-1.5 cursor-pointer select-none"
              title="Iniciar nova ficha em branco"
            >
              <PlusCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>Nova Ficha</span>
            </button>
          </div>
        </div>

        {/* Card 2: Atalho do Banco de Dados */}
        <div className="group relative rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-6 sm:p-7 shadow-xs hover:shadow-lg transition-all duration-300 flex flex-col justify-between overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/5 rounded-bl-full pointer-events-none group-hover:scale-110 transition-transform" />

          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3.5">
                <div className="w-13 h-13 rounded-2xl bg-gradient-to-br from-slate-800 to-slate-950 text-cyan-400 flex items-center justify-center font-bold shadow-md shadow-slate-900/20 group-hover:scale-105 transition-transform border border-slate-700">
                  <Database className="w-6 h-6" />
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Repositório de Vistorias
                  </span>
                  <h2 className="text-xl font-bold text-slate-900 dark:text-white leading-tight">
                    Banco de Dados
                  </h2>
                </div>
              </div>

              <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700">
                {totalDams} {totalDams === 1 ? 'Barragem' : 'Barragens'}
              </span>
            </div>

            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              Consulte todo o histórico de fiscalizações realizadas no Estado, filtre por bacia hidrográfica ou nível de risco, exporte relatórios e gerencie os registros.
            </p>

            {/* Resumo do Repositório */}
            <div className="rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200/60 dark:border-slate-800 p-4 grid grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-[10px] font-semibold text-slate-400 uppercase block">Em Conformidade</span>
                <span className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
                  {Math.max(0, totalDams - criticalDams - alertDams)}
                </span>
                <span className="text-[11px] text-slate-500 block">sem anomalias graves</span>
              </div>
              <div>
                <span className="text-[10px] font-semibold text-slate-400 uppercase block">Com Fotos Anexadas</span>
                <span className="text-lg font-bold text-slate-900 dark:text-white">
                  {allInspections.filter(i => (i.photos?.length || 0) > 0).length}
                </span>
                <span className="text-[11px] text-slate-500 block">vistorias documentadas</span>
              </div>
            </div>
          </div>

          <div className="pt-6 flex flex-col sm:flex-row items-center gap-2.5">
            <button
              type="button"
              onClick={onGoToDatabase}
              className="w-full sm:flex-1 py-3 px-5 rounded-2xl bg-slate-900 hover:bg-black dark:bg-slate-800 dark:hover:bg-slate-700 active:scale-98 text-white text-xs sm:text-sm font-bold transition shadow-sm flex items-center justify-center gap-2 cursor-pointer select-none"
            >
              <Database className="w-4 h-4 text-cyan-400" />
              <span>Acessar Banco de Dados</span>
              <ArrowRight className="w-4 h-4" />
            </button>

            {onLoadSample && (
              <button
                type="button"
                onClick={onLoadSample}
                className="w-full sm:w-auto py-3 px-4 rounded-2xl border border-amber-300/80 dark:border-amber-800/60 bg-amber-500/10 hover:bg-amber-500/20 text-amber-800 dark:text-amber-300 text-xs sm:text-sm font-semibold transition flex items-center justify-center gap-1.5 cursor-pointer select-none"
                title="Carregar exemplo didático de teste de campo"
              >
                <Sparkles className="w-4 h-4 text-amber-500" />
                <span>Carregar Exemplo</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* 3. MAPA INTERATIVO GEOESPACIAL DE MATO GROSSO (CSB / SEMA-MT)         */}
      {/* ===================================================================== */}
      <InteractiveMap 
        inspections={allInspections} 
        onSelectInspection={onSelectAndEdit} 
      />

      {/* ===================================================================== */}
      {/* 4. LISTAGEM DE TODAS AS BARRAGENS COM AÇÕES (VISUALIZAR / EDITAR / EXCLUIR) */}
      {/* ===================================================================== */}
      <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-6 sm:p-7 shadow-xs space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800/80 pb-5">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold">
                <Database className="w-4 h-4" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                Todas as Barragens Inspecionadas
              </h3>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Registros cadastrados no dispositivo. Clique para visualizar detalhes, carregar para edição ou remover.
            </p>
          </div>

          {/* Filtros Rápidos Segmentados & Busca */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
            {/* Abas de Filtro Segmentado */}
            <div className="flex items-center p-1 bg-slate-100 dark:bg-slate-800/80 rounded-xl text-xs font-semibold">
              <button
                type="button"
                onClick={() => setActiveFilter('all')}
                className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  activeFilter === 'all'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                Todas ({totalDams})
              </button>

              <button
                type="button"
                onClick={() => setActiveFilter('critical')}
                className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  activeFilter === 'critical'
                    ? 'bg-white dark:bg-slate-900 text-rose-600 dark:text-rose-400 shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-rose-600'
                }`}
              >
                Atenção ({criticalDams + alertDams})
              </button>

              <button
                type="button"
                onClick={() => setActiveFilter('photos')}
                className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  activeFilter === 'photos'
                    ? 'bg-white dark:bg-slate-900 text-cyan-600 dark:text-cyan-400 shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-cyan-600'
                }`}
              >
                Com Fotos
              </button>
            </div>

            {/* Campo de Busca Rápida */}
            <div className="relative min-w-[200px]">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Buscar barragem, município..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-8 pr-7 py-1.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Lista de Barragens Cadastradas */}
        {filteredInspections.length > 0 ? (
          <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
            {filteredInspections.map(insp => {
              const dam = insp.damIdentification;
              const gen = insp.generalInfo;
              const isCurrent = insp.id === currentInspection.id;
              const critCount = Object.values(insp.componentsData || {}).filter(c => c.condition === 'critico').length;
              const alrtCount = Object.values(insp.componentsData || {}).filter(c => c.condition === 'alerta').length;
              const photosCount = insp.photos?.length || 0;

              return (
                <div 
                  key={insp.id}
                  className="py-4 first:pt-1 last:pb-1 flex flex-col md:flex-row md:items-center justify-between gap-4 group hover:bg-slate-50/80 dark:hover:bg-slate-800/40 px-3 -mx-3 rounded-2xl transition-colors"
                >
                  <div className="space-y-1.5 flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-sm sm:text-base text-slate-900 dark:text-white truncate">
                        {dam.damName || dam.propertyOrBusinessName || 'Barragem sem denominação cadastrada'}
                      </span>

                      {isCurrent && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20">
                          Vistoria Ativa
                        </span>
                      )}

                      {/* Status de Sincronização / Criptografia */}
                      {insp.syncStatus === 'synced' ? (
                        <span className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-400 flex items-center gap-1 bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/20">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                          <span>Banco de Dados</span>
                        </span>
                      ) : (
                        <span className="text-[10px] font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-1 bg-amber-500/10 px-2 py-0.5 rounded-md border border-amber-500/20" title="Salva offline no dispositivo com criptografia">
                          <Lock className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                          <span>Salvo Local (Offline)</span>
                        </span>
                      )}

                      {insp.conclusions?.requiresNotification && (
                        <span className="text-[10px] font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-1 bg-amber-500/10 px-2 py-0.5 rounded-md border border-amber-500/20">
                          <Bell className="w-3 h-3" />
                          <span>Notificação SIGA</span>
                        </span>
                      )}
                    </div>

                    {/* Metadados limpos sem badges pesadas */}
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                      <span className="flex items-center gap-1 font-medium text-slate-700 dark:text-slate-300">
                        <MapPin className="w-3.5 h-3.5 text-slate-400" />
                        <span>{dam.municipality || 'Mato Grosso'}/MT</span>
                      </span>

                      <span className="text-slate-300 dark:text-slate-700" aria-hidden="true">·</span>

                      <span className="flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                        <span>{gen.inspectionDate || 'Data não informada'}</span>
                      </span>

                      <span className="text-slate-300 dark:text-slate-700" aria-hidden="true">·</span>

                      <span className="flex items-center gap-1">
                        <Camera className="w-3.5 h-3.5 text-slate-400" />
                        <span>{photosCount} foto(s)</span>
                      </span>

                      <span className="text-slate-300 dark:text-slate-700" aria-hidden="true">·</span>

                      {critCount > 0 ? (
                        <span className="text-rose-600 dark:text-rose-400 font-semibold flex items-center gap-1">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          <span>{critCount} anomalia(s) crítica(s)</span>
                        </span>
                      ) : alrtCount > 0 ? (
                        <span className="text-amber-600 dark:text-amber-400 font-medium flex items-center gap-1">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          <span>{alrtCount} em alerta</span>
                        </span>
                      ) : (
                        <span className="text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Condição estável</span>
                        </span>
                      )}

                      {/* Identificação de Autoria e Equipe */}
                      {insp.createdByEmail && (
                        <>
                          <span className="text-slate-300 dark:text-slate-700" aria-hidden="true">·</span>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            currentUser?.email && insp.createdByEmail.toLowerCase() === currentUser.email.toLowerCase()
                              ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700'
                          }`}>
                            {currentUser?.email && insp.createdByEmail.toLowerCase() === currentUser.email.toLowerCase()
                              ? 'Sua Ficha'
                              : `Autor: ${insp.createdByName || insp.createdByEmail.split('@')[0]}`}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* AÇÕES DIRETAS: VISUALIZAR, EDITAR, EXCLUIR */}
                  {(() => {
                    const editCheck = canUserEditInspection(currentUser || null, insp);
                    const canEdit = editCheck.allowed;
                    const deleteCheck = canUserDeleteInspection(currentUser || null, insp);
                    const canDelete = deleteCheck.allowed;

                    return (
                      <div className="flex items-center gap-2 shrink-0 pt-2 md:pt-0">
                        {/* Visualizar */}
                        <button
                          type="button"
                          onClick={() => handleOpenDetail(insp)}
                          className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs"
                          title="Visualizar ficha técnica e relatório completo"
                        >
                          <Eye className="w-3.5 h-3.5 text-slate-400 group-hover:text-slate-600" />
                          <span>Visualizar</span>
                        </button>

                        {/* Sincronizar individual se pendente */}
                        {onSyncSingle && (!insp.syncStatus || insp.syncStatus === 'local' || insp.syncStatus === 'error') && (
                          <button
                            type="button"
                            onClick={() => onSyncSingle(insp.id)}
                            disabled={isSyncing}
                            className="px-2.5 py-1.5 rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 dark:hover:bg-amber-900/40 text-amber-900 dark:text-amber-300 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-2xs"
                            title="Sincronizar esta ficha com o banco de dados agora"
                          >
                            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                            <span>Sync</span>
                          </button>
                        )}

                        {/* Editar ou Ver Ficha restrita */}
                        {canEdit ? (
                          <button
                            type="button"
                            onClick={() => onSelectAndEdit && onSelectAndEdit(insp.id)}
                            className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs"
                            title="Carregar esta barragem na Ficha de Inspeção para edição"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                            <span>Editar</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => onSelectAndEdit && onSelectAndEdit(insp.id)}
                            className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs"
                            title={editCheck.reason || 'Visualizar em modo somente leitura'}
                          >
                            <Lock className="w-3.5 h-3.5 text-slate-400" />
                            <span>Ver Ficha</span>
                          </button>
                        )}

                        {/* Excluir (somente se permitido pelas regras de autoria/perfil) */}
                        {canDelete && (
                          <button
                            type="button"
                            onClick={() => setInspectionToDelete(insp)}
                            className="p-2 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-rose-300 dark:hover:border-rose-900 bg-white dark:bg-slate-800 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 transition-colors cursor-pointer"
                            title="Excluir vistoria desta barragem"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    );
                  })()}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="py-12 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center mx-auto">
              <Database className="w-6 h-6" />
            </div>
            <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200">
              Nenhuma barragem encontrada
            </h4>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              {searchTerm 
                ? `Nenhum resultado corresponde à busca "${searchTerm}".`
                : 'Não há registros salvos com o filtro selecionado.'}
            </p>
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold underline cursor-pointer"
              >
                Limpar busca
              </button>
            )}
          </div>
        )}

        {/* Rodapé do Bloco de Barragens */}
        <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
          <span className="text-slate-500">
            Mostrando <strong>{filteredInspections.length}</strong> de <strong>{totalDams}</strong> registros
          </span>

          <button
            type="button"
            onClick={onGoToDatabase}
            className="text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1 cursor-pointer"
          >
            <span>Acessar Módulo Avançado do Banco de Dados</span>
            <ChevronRight className="w-4 h-4" />
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-md w-full shadow-2xl border border-slate-200 dark:border-slate-800 p-6 space-y-4 text-slate-800 dark:text-slate-100">
            <div className="flex items-center gap-3 text-rose-600 dark:text-rose-400">
              <div className="w-11 h-11 rounded-2xl bg-rose-500/10 flex items-center justify-center">
                <AlertTriangle className="w-6 h-6 text-rose-600 dark:text-rose-400" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white leading-tight">
                  Excluir Registro de Vistoria
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Esta ação removerá a vistoria permanentemente do banco de dados local.
                </p>
              </div>
            </div>

            <div className="bg-slate-50 dark:bg-slate-950 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 text-xs space-y-1.5">
              <p><strong>Barragem:</strong> {inspectionToDelete.damIdentification.damName || 'Sem denominação'}</p>
              <p><strong>Município:</strong> {inspectionToDelete.damIdentification.municipality || 'Mato Grosso'}/MT</p>
              <p><strong>Data:</strong> {inspectionToDelete.generalInfo.inspectionDate || 'Não informada'}</p>
              <p><strong>Fotos anexadas:</strong> {inspectionToDelete.photos.length} registro(s)</p>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-400">
              Tem certeza que deseja confirmar a exclusão desta vistoria?
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-2">
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
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 active:scale-95 text-white text-xs font-bold transition cursor-pointer shadow-xs"
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
