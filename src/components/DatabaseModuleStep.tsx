// ==============================================================================
// ARQUIVO: src/components/DatabaseModuleStep.tsx
// Módulo de Banco de Dados de Vistorias de Segurança de Barragens (CSB/SEMA-MT)
// Resumo completo de todas as inspeções com busca, filtros, visualização,
// edição e exclusão segura.
// ==============================================================================

import React, { useState } from 'react';
import { 
  Database, 
  Search, 
  Filter, 
  Eye, 
  Edit3, 
  Trash2, 
  PlusCircle, 
  Download, 
  ShieldCheck, 
  AlertTriangle, 
  CheckCircle2, 
  Camera, 
  Bell, 
  MapPin, 
  Calendar, 
  FileSpreadsheet,
  ArrowUpDown,
  Sparkles,
  RefreshCw,
  FolderOpen,
  Lock,
  CloudCheck,
  AlertCircle,
  CloudUpload,
  CalendarClock
} from 'lucide-react';
import { InspectionData } from '../types/inspection';
import { InspectionDetailModal } from './InspectionDetailModal';
import { PhotoSyncQueueModal } from './PhotoSyncQueueModal';
import { getPhotoQueueSummary, subscribePhotoQueue } from '../services/photoSyncQueueService';
import { exportInspectionToJson } from '../services/storage';
import { exportAnonymizedJsonFile } from '../utils/anonymizer';
import { canUserEditInspection, canUserDeleteInspection, canUserCreateInspection } from '../services/userService';

interface Props {
  inspections: InspectionData[];
  currentInspectionId: string;
  onSelectAndEdit: (id: string) => void;
  onDeleteInspection: (id: string) => void;
  onNewInspection: () => void;
  onGoToSheet: () => void;
  onSyncSingle?: (id: string) => void;
  onSyncAll?: () => void;
  isSyncing?: boolean;
  onOpenAuthModal?: () => void;
  currentUser?: { email?: string; fullName?: string; role?: string; id?: string } | null;
}

export const DatabaseModuleStep: React.FC<Props> = ({
  inspections,
  currentInspectionId,
  onSelectAndEdit,
  onDeleteInspection,
  onNewInspection,
  onGoToSheet,
  onSyncSingle,
  onSyncAll,
  isSyncing = false,
  onOpenAuthModal,
  currentUser
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCondition, setFilterCondition] = useState<'all' | 'critico' | 'alerta' | 'adequado'>('all');
  const [filterStatus, setFilterStatus] = useState<'all' | 'draft' | 'finalized'>('all');
  const [filterNotification, setFilterNotification] = useState<'all' | 'with_notif' | 'without_notif'>('all');
  const [filterPlanejamento, setFilterPlanejamento] = useState<'all' | 'atual' | 'futura'>('all');
  const [sortBy, setSortBy] = useState<'recent' | 'oldest' | 'name' | 'critical'>('recent');

  // Modal de detalhes
  const [detailInspection, setDetailInspection] = useState<InspectionData | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [showPhotoQueueModal, setShowPhotoQueueModal] = useState(false);
  const [photoQueuePending, setPhotoQueuePending] = useState(0);

  React.useEffect(() => {
    let active = true;
    const updateStats = async () => {
      try {
        const sum = await getPhotoQueueSummary();
        if (active) setPhotoQueuePending(sum.pending + sum.error);
      } catch {}
    };
    updateStats();
    const unsub = subscribePhotoQueue(updateStats);
    return () => {
      active = false;
      unsub();
    };
  }, []);

  // Confirmação de exclusão
  const [inspectionToDelete, setInspectionToDelete] = useState<InspectionData | null>(null);

  // Filtros aplicados
  const filtered = inspections.filter(item => {
    const d = item.damIdentification;
    const g = item.generalInfo;
    const searchLower = searchTerm.toLowerCase();

    const matchesSearch = !searchTerm.trim() || 
      (d.damName && d.damName.toLowerCase().includes(searchLower)) ||
      (d.propertyOrBusinessName && d.propertyOrBusinessName.toLowerCase().includes(searchLower)) ||
      (d.municipality && d.municipality.toLowerCase().includes(searchLower)) ||
      (d.hydrographicBasin && d.hydrographicBasin.toLowerCase().includes(searchLower)) ||
      (g.recordNumber && g.recordNumber.toLowerCase().includes(searchLower)) ||
      (g.numeroVistoria && g.numeroVistoria.toLowerCase().includes(searchLower)) ||
      (g.inspectors && g.inspectors.some(i => i.name.toLowerCase().includes(searchLower)));

    if (!matchesSearch) return false;

    // Filtro de Planejamento (Atual vs Futura)
    if (filterPlanejamento !== 'all') {
      const isFutura = item.tipoPlanejamento === 'futura' || item.generalInfo?.tipoPlanejamento === 'futura';
      if (filterPlanejamento === 'futura' && !isFutura) return false;
      if (filterPlanejamento === 'atual' && isFutura) return false;
    }

    // Filtro de Condição
    if (filterCondition !== 'all') {
      const hasCondition = Object.values(item.componentsData).some(comp => comp.condition === filterCondition);
      if (!hasCondition) return false;
    }

    // Filtro de Status
    if (filterStatus === 'draft' && !item.isDraft) return false;
    if (filterStatus === 'finalized' && item.isDraft) return false;

    // Filtro de Notificação
    if (filterNotification === 'with_notif' && !item.conclusions.requiresNotification) return false;
    if (filterNotification === 'without_notif' && item.conclusions.requiresNotification) return false;

    return true;
  });

  // Ordenação
  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === 'name') {
      const nameA = a.damIdentification.damName || a.damIdentification.propertyOrBusinessName || '';
      const nameB = b.damIdentification.damName || b.damIdentification.propertyOrBusinessName || '';
      return nameA.localeCompare(nameB);
    }
    if (sortBy === 'oldest') {
      return (a.generalInfo.inspectionDate || a.createdAt).localeCompare(b.generalInfo.inspectionDate || b.createdAt);
    }
    if (sortBy === 'critical') {
      const critA = Object.values(a.componentsData).filter(c => c.condition === 'critico').length;
      const critB = Object.values(b.componentsData).filter(c => c.condition === 'critico').length;
      return critB - critA;
    }
    // Default 'recent'
    return (b.generalInfo.inspectionDate || b.createdAt).localeCompare(a.generalInfo.inspectionDate || a.createdAt);
  });

  // Métricas do Banco
  const totalCount = inspections.length;
  const criticalDamsCount = inspections.filter(item => 
    Object.values(item.componentsData).some(c => c.condition === 'critico')
  ).length;
  const totalPhotosCount = inspections.reduce((acc, curr) => acc + curr.photos.length, 0);
  const notificationsCount = inspections.filter(item => item.conclusions.requiresNotification).length;

  const handleOpenDetail = (insp: InspectionData) => {
    setDetailInspection(insp);
    setIsDetailOpen(true);
  };

  const handleConfirmDelete = () => {
    if (inspectionToDelete) {
      onDeleteInspection(inspectionToDelete.id);
      setInspectionToDelete(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header do Módulo de Banco de Dados */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 shadow-xs transition-colors">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-600 flex items-center justify-center font-bold text-white shadow-xs">
              <Database className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white leading-tight">
                Banco de Dados de Vistorias de Segurança (CSB/SEMA-MT)
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Repositório corporativo e local de inspeções de barragens de usos múltiplos no Estado de Mato Grosso
              </p>
            </div>
          </div>

          <div className="flex items-center flex-wrap gap-2">
            {onSyncAll && (
              <button
                type="button"
                onClick={onSyncAll}
                disabled={isSyncing}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-white text-xs font-bold transition shadow-xs cursor-pointer"
                title="Sincronizar todas as vistorias locais pendentes com o banco de dados seguro"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                <span>{isSyncing ? 'Sincronizando...' : 'Sincronizar Banco'}</span>
              </button>
            )}

            <button
              type="button"
              onClick={onNewInspection}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold transition shadow-xs cursor-pointer"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Nova Vistoria</span>
            </button>

            <button
              type="button"
              onClick={onGoToSheet}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 hover:bg-black dark:bg-slate-800 dark:hover:bg-slate-700 text-white text-xs font-semibold transition cursor-pointer shadow-xs"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
              <span>Ir para Ficha Ativa</span>
            </button>
          </div>
        </div>

        {/* Resumo Estatístico do Repositório */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 pt-4">
          <div 
            onClick={() => setFilterPlanejamento('all')}
            className={`p-3 rounded-xl border space-y-0.5 transition-colors cursor-pointer ${
              filterPlanejamento === 'all'
                ? 'bg-slate-100 dark:bg-slate-900 border-slate-300'
                : 'bg-slate-50 dark:bg-slate-950/60 border-slate-100 dark:border-slate-800'
            }`}
          >
            <span className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider block">Total de Vistorias</span>
            <div className="flex items-baseline gap-2">
              <span className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tabular-nums">{totalCount}</span>
              <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">todas</span>
            </div>
          </div>

          <div 
            onClick={() => setFilterPlanejamento(filterPlanejamento === 'futura' ? 'all' : 'futura')}
            className={`p-3 rounded-xl border space-y-0.5 transition-colors cursor-pointer ${
              filterPlanejamento === 'futura'
                ? 'bg-indigo-100 dark:bg-indigo-950/80 border-indigo-400 ring-2 ring-indigo-500/20'
                : 'bg-indigo-50/70 dark:bg-slate-950/60 border-indigo-200 dark:border-slate-800 hover:border-indigo-300'
            }`}
            title="Clique para filtrar apenas vistorias futuras pré-salvas"
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-indigo-700 dark:text-indigo-400 font-semibold uppercase tracking-wider block">Vistorias Futuras</span>
              <CalendarClock className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-xl sm:text-2xl font-black text-indigo-700 dark:text-indigo-400 tabular-nums">
                {inspections.filter(i => i.tipoPlanejamento === 'futura' || i.generalInfo?.tipoPlanejamento === 'futura').length}
              </span>
              <span className="text-[11px] text-indigo-600 dark:text-indigo-400 font-medium">pré-salvas</span>
            </div>
          </div>

          <div className="bg-slate-50 dark:bg-slate-950/60 p-3 rounded-xl border border-slate-100 dark:border-slate-800 space-y-0.5 transition-colors">
            <span className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider block">Barragens c/ Alerta/Crítico</span>
            <div className="flex items-baseline gap-2">
              <span className="text-xl sm:text-2xl font-black text-rose-600 dark:text-rose-400 tabular-nums">{criticalDamsCount}</span>
              <span className="text-[11px] text-rose-700 dark:text-rose-400 font-medium">requerem atenção</span>
            </div>
          </div>

          <div 
            onClick={() => setShowPhotoQueueModal(true)}
            className="bg-slate-50 dark:bg-slate-950/60 p-3 rounded-xl border border-slate-100 dark:border-slate-800 space-y-0.5 transition-colors cursor-pointer hover:border-emerald-500/50 group"
            title="Clique para visualizar a Fila de Fotos IndexedDB"
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider block">Registros Fotográficos</span>
              <Camera className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 group-hover:scale-110 transition-transform" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tabular-nums">{totalPhotosCount}</span>
              {photoQueuePending > 0 ? (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-400/40 animate-pulse">
                  {photoQueuePending} na fila
                </span>
              ) : (
                <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">fotos técnicas</span>
              )}
            </div>
          </div>

          <div className="bg-slate-50 dark:bg-slate-950/60 p-3 rounded-xl border border-slate-100 dark:border-slate-800 space-y-0.5 transition-colors">
            <span className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider block">Notificações SIGA</span>
            <div className="flex items-baseline gap-2">
              <span className="text-xl sm:text-2xl font-black text-amber-600 dark:text-amber-400 tabular-nums">{notificationsCount}</span>
              <span className="text-[11px] text-amber-700 dark:text-amber-400 font-medium">ativas</span>
            </div>
          </div>
        </div>
      </div>

      {/* Barra de Filtros e Busca */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-3.5 sm:p-4 shadow-xs space-y-3 transition-colors">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Campo de Busca Textual */}
          <div className="relative flex-1 min-w-[240px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar por barragem, município, bacia, proprietário ou fiscal..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 rounded-xl text-xs sm:text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white dark:focus:bg-slate-900 transition"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              >
                Limpar
              </button>
            )}
          </div>

          {/* Ordenação */}
          <div className="flex items-center gap-1.5 text-xs">
            <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-slate-500 dark:text-slate-400 font-medium hidden sm:inline">Ordenar:</span>
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value as any)}
              className="bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              <option value="recent">Mais Recentes</option>
              <option value="oldest">Mais Antigas</option>
              <option value="name">Nome da Barragem (A-Z)</option>
              <option value="critical">Maior Gravidade de Anomalias</option>
            </select>
          </div>
        </div>

        {/* Filtros por Categoria */}
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
          <div className="flex items-center gap-1 text-slate-500 dark:text-slate-400 font-semibold mr-1">
            <Filter className="w-3.5 h-3.5" />
            <span>Filtros:</span>
          </div>

          {/* Tipo de Vistoria: Atual vs Futura */}
          <select
            value={filterPlanejamento}
            onChange={e => setFilterPlanejamento(e.target.value as any)}
            className="bg-indigo-50/70 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 rounded-lg px-2 py-1 text-xs text-indigo-900 dark:text-indigo-200 font-semibold focus:outline-none"
          >
            <option value="all">Todas as Vistorias (Atual e Futura)</option>
            <option value="atual">Apenas Vistorias Atuais</option>
            <option value="futura">Apenas Vistorias Futuras (Pré-salvas)</option>
          </select>

          {/* Condição */}
          <select
            value={filterCondition}
            onChange={e => setFilterCondition(e.target.value as any)}
            className="bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 rounded-lg px-2 py-1 text-xs text-slate-700 dark:text-slate-200 focus:outline-none"
          >
            <option value="all">Todas as Condições</option>
            <option value="critico">Com Anomalia Crítica</option>
            <option value="alerta">Com Situação de Alerta</option>
            <option value="adequado">Apenas Adequadas</option>
          </select>

          {/* Status */}
          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value as any)}
            className="bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 rounded-lg px-2 py-1 text-xs text-slate-700 dark:text-slate-200 focus:outline-none"
          >
            <option value="all">Todos os Status</option>
            <option value="draft">Rascunhos</option>
            <option value="finalized">Finalizadas</option>
          </select>

          {/* Notificação */}
          <select
            value={filterNotification}
            onChange={e => setFilterNotification(e.target.value as any)}
            className="bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 rounded-lg px-2 py-1 text-xs text-slate-700 dark:text-slate-200 focus:outline-none"
          >
            <option value="all">Todas as Notificações</option>
            <option value="with_notif">Com Notificação Técnica</option>
            <option value="without_notif">Sem Notificação</option>
          </select>

          {(searchTerm || filterCondition !== 'all' || filterStatus !== 'all' || filterNotification !== 'all' || filterPlanejamento !== 'all') && (
            <button
              type="button"
              onClick={() => {
                setSearchTerm('');
                setFilterCondition('all');
                setFilterStatus('all');
                setFilterNotification('all');
                setFilterPlanejamento('all');
              }}
              className="text-[11px] text-emerald-700 dark:text-emerald-400 font-semibold hover:underline ml-auto cursor-pointer"
            >
              Resetar Filtros
            </button>
          )}
        </div>
      </div>

      {/* Listagem de Inspeções (Tabela / Cards) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between text-xs text-slate-500 px-1">
          <span>Mostrando <strong>{sorted.length}</strong> de <strong>{totalCount}</strong> inspeções registradas</span>
        </div>

        {sorted.length > 0 ? (
          <div className="grid grid-cols-1 gap-3">
            {sorted.map(insp => {
              const d = insp.damIdentification;
              const g = insp.generalInfo;
              const c = insp.conclusions;
              const isActive = insp.id === currentInspectionId;
              const isFutura = insp.tipoPlanejamento === 'futura' || g?.tipoPlanejamento === 'futura';
              const criticalCount = Object.values(insp.componentsData).filter(comp => comp.condition === 'critico').length;
              const alertCount = Object.values(insp.componentsData).filter(comp => comp.condition === 'alerta').length;
              const photosCount = insp.photos.length;

              return (
                <div 
                  key={insp.id}
                  className={`rounded-2xl border transition-all duration-200 overflow-hidden shadow-2xs hover:shadow-md ${
                    isActive 
                      ? 'border-emerald-500 ring-2 ring-emerald-500/20 bg-white dark:bg-slate-900' 
                      : isFutura
                      ? 'bg-gradient-to-r from-indigo-50/80 via-purple-50/30 to-white dark:from-indigo-950/40 dark:via-slate-900 dark:to-slate-900 border-indigo-300 dark:border-indigo-800/80 hover:border-indigo-400'
                      : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                  }`}
                >
                  <div className="p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    {/* Informações Principais da Vistoria */}
                    <div className="space-y-2 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white leading-tight">
                          {d.damName || d.propertyOrBusinessName || 'Vistoria sem denominação'}
                        </h3>

                        {/* Tag Destacada de Tipo: Atual vs Futura */}
                        {isFutura ? (
                          <span className="text-[10px] font-extrabold px-2.5 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-950 text-indigo-800 dark:text-indigo-300 border border-indigo-300 dark:border-indigo-700 flex items-center gap-1 shadow-2xs" title="Vistoria planejada com dados pré-salvos do local">
                            <CalendarClock className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                            <span>Vistoria Futura (Pré-salva)</span>
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 flex items-center gap-1">
                            <span>Vistoria Atual</span>
                            {g.numeroVistoria && <span className="font-mono font-black text-emerald-900 dark:text-emerald-200">· Nº {g.numeroVistoria}</span>}
                          </span>
                        )}

                        {/* Status de Sincronização e Criptografia */}
                        {insp.syncStatus === 'synced' ? (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 flex items-center gap-1" title="Sincronizado no banco centralizado">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                            <span>Sincronizado no Banco</span>
                          </span>
                        ) : insp.syncStatus === 'error' ? (
                          <button
                            type="button"
                            onClick={() => onOpenAuthModal ? onOpenAuthModal() : (onSyncSingle && onSyncSingle(insp.id))}
                            className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-300 border border-rose-300 dark:border-rose-800 flex items-center gap-1 hover:bg-rose-200 cursor-pointer"
                            title={insp.syncError || "Pendente de sincronização (clique para resolver permissão ou reenviar)"}
                          >
                            <AlertCircle className="w-3 h-3 text-rose-600 dark:text-rose-400" />
                            <span>Pendente / Resolver Permissão</span>
                          </button>
                        ) : (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800 flex items-center gap-1" title="Ficha criptografada e salva apenas no armazenamento local do aparelho">
                            <Lock className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                            <span>Salvo Localmente (Offline)</span>
                          </span>
                        )}

                        {isActive && (
                          <span className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">
                            · Ativa em Edição
                          </span>
                        )}

                        <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">
                          · {insp.isDraft ? 'Rascunho' : 'Finalizada'}
                        </span>

                        {c.requiresNotification && (
                          <span className="text-[10px] font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-1">
                            <Bell className="w-3 h-3" />
                            <span>Notificação SIGA</span>
                          </span>
                        )}
                      </div>

                      {/* Metadados geográficos e administrativos */}
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600 dark:text-slate-400">
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5 text-slate-400" />
                          <span>{d.municipality || 'Mato Grosso'}/MT</span>
                          {d.propertyOrBusinessName && d.damName && (
                            <span className="text-slate-400 dark:text-slate-500">· {d.propertyOrBusinessName}</span>
                          )}
                        </span>

                        <span className="flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5 text-slate-400" />
                          <span>{g.inspectionDate ? new Date(g.inspectionDate + 'T00:00:00').toLocaleDateString('pt-BR') : 'Data não informada'}</span>
                        </span>

                        <span className="flex items-center gap-1">
                          <Camera className="w-3.5 h-3.5 text-slate-400" />
                          <span>{photosCount} foto(s)</span>
                        </span>

                        {/* Destaque de Numeração / Processo */}
                        {isFutura ? (
                          <span className="flex items-center gap-1 text-indigo-700 dark:text-indigo-400 font-bold bg-indigo-100/70 dark:bg-indigo-900/40 px-2 py-0.5 rounded-md border border-indigo-200 dark:border-indigo-800">
                            <CalendarClock className="w-3 h-3" />
                            <span>Sem Nº (Pré-salva)</span>
                          </span>
                        ) : g.numeroVistoria ? (
                          <span className="text-emerald-800 dark:text-emerald-300 font-bold bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-md border border-emerald-200 dark:border-emerald-800">
                            Vistoria: {g.numeroVistoria}
                          </span>
                        ) : null}

                        {g.recordNumber && (
                          <span className="text-slate-600 dark:text-slate-400">
                            Processo: {g.recordNumber}
                          </span>
                        )}

                        {g.inspectors && g.inspectors[0]?.name && (
                          <span className="text-slate-500 dark:text-slate-400 hidden sm:inline">
                            Fiscal: {g.inspectors[0].name}
                          </span>
                        )}
                      </div>

                      {/* Quadro de Condição dos Componentes */}
                      <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
                        {criticalCount > 0 ? (
                          <span className="flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300 font-semibold border border-rose-200 dark:border-rose-900/40">
                            <AlertTriangle className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
                            <span>{criticalCount} componente(s) crítico(s)</span>
                          </span>
                        ) : alertCount > 0 ? (
                          <span className="flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 font-semibold border border-amber-200 dark:border-amber-900/40">
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                            <span>{alertCount} componente(s) em atenção</span>
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 font-medium border border-emerald-200 dark:border-emerald-900/40">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                            <span>Componentes em condição adequada</span>
                          </span>
                        )}
                      </div>

                      {/* Identificação de Autoria e Equipe */}
                      {insp.createdByEmail && (
                        <div className="pt-0.5">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            currentUser?.email && insp.createdByEmail.toLowerCase() === currentUser.email.toLowerCase()
                              ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700'
                          }`}>
                            {currentUser?.email && insp.createdByEmail.toLowerCase() === currentUser.email.toLowerCase()
                              ? 'Sua Ficha'
                              : `Autor: ${insp.createdByName || insp.createdByEmail.split('@')[0]}`}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Botões de Ação Direta: Visualizar, Editar, Excluir com RBAC */}
                    {(() => {
                      const editCheck = canUserEditInspection(currentUser || null, insp);
                      const canEdit = editCheck.allowed;
                      const deleteCheck = canUserDeleteInspection(currentUser || null, insp);
                      const canDelete = deleteCheck.allowed;

                      return (
                        <div className="flex items-center flex-wrap md:flex-col lg:flex-row gap-2 shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-slate-100 dark:border-slate-800">
                          {/* Visualizar */}
                          <button
                            type="button"
                            onClick={() => handleOpenDetail(insp)}
                            className="px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer shadow-2xs"
                            title="Visualizar resumo completo da vistoria"
                          >
                            <Eye className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                            <span>Visualizar</span>
                          </button>

                          {/* Sincronizar individual se pendente */}
                          {onSyncSingle && (!insp.syncStatus || insp.syncStatus === 'local' || insp.syncStatus === 'error') && (
                            <button
                              type="button"
                              onClick={() => onSyncSingle(insp.id)}
                              disabled={isSyncing}
                              className="px-2.5 py-1.5 rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 dark:hover:bg-amber-900/40 text-amber-900 dark:text-amber-300 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-2xs"
                              title="Sincronizar esta vistoria com o banco de dados agora"
                            >
                              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                              <span>Sync</span>
                            </button>
                          )}

                          {/* Editar ou Ver Ficha */}
                          {canEdit ? (
                            <button
                              type="button"
                              onClick={() => onSelectAndEdit(insp.id)}
                              className={`px-3 py-1.5 rounded-xl text-white text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-2xs ${
                                isFutura
                                  ? 'bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-600 dark:hover:bg-indigo-500'
                                  : 'bg-emerald-700 hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500'
                              }`}
                              title={isFutura ? "Editar dados pré-salvos ou iniciar esta vistoria" : "Carregar para edição na Ficha de Inspeção"}
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                              <span>{isFutura ? 'Editar / Iniciar' : 'Editar'}</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => onSelectAndEdit(insp.id)}
                              className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer shadow-2xs"
                              title={editCheck.reason || 'Modo somente leitura'}
                            >
                              <Lock className="w-3.5 h-3.5 text-slate-400" />
                              <span>Ver Ficha</span>
                            </button>
                          )}

                          {/* Excluir */}
                          {canDelete && (
                            <button
                              type="button"
                              onClick={() => setInspectionToDelete(insp)}
                              className="p-1.5 rounded-xl border border-rose-200 dark:border-rose-900/50 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/60 text-rose-700 dark:text-rose-400 transition cursor-pointer"
                              title="Excluir esta vistoria"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      );
                    })()}
                    </div>
                  </div>
              );
            })}
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center space-y-3">
            <Database className="w-12 h-12 text-slate-300 mx-auto" />
            <h3 className="text-base font-bold text-slate-800">
              Nenhuma vistoria encontrada
            </h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              Nenhum registro coincide com os termos de busca ou filtros selecionados. Experimente limpar os filtros ou cadastrar uma nova vistoria.
            </p>
            <div className="flex items-center justify-center gap-2 pt-2">
              <button
                type="button"
                onClick={onNewInspection}
                className="px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold transition cursor-pointer"
              >
                Cadastrar Nova Vistoria
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal de Detalhes da Inspeção */}
      <InspectionDetailModal
        inspection={detailInspection}
        isOpen={isDetailOpen}
        onClose={() => {
          setIsDetailOpen(false);
          setDetailInspection(null);
        }}
        onEdit={(insp) => onSelectAndEdit(insp.id)}
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
              Tem certeza que deseja excluir esta vistoria? Caso necessite, baixe previamente o backup JSON.
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

      {/* Central de Fila de Sincronização Persistente de Fotos - IndexedDB */}
      <PhotoSyncQueueModal
        isOpen={showPhotoQueueModal}
        onClose={() => setShowPhotoQueueModal(false)}
        isOnline={typeof navigator !== 'undefined' ? navigator.onLine : true}
      />
    </div>
  );
};
