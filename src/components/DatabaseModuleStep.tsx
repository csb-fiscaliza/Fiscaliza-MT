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
  FolderOpen
} from 'lucide-react';
import { InspectionData } from '../types/inspection';
import { InspectionDetailModal } from './InspectionDetailModal';
import { exportInspectionToJson } from '../services/storage';
import { exportAnonymizedJsonFile } from '../utils/anonymizer';

interface Props {
  inspections: InspectionData[];
  currentInspectionId: string;
  onSelectAndEdit: (id: string) => void;
  onDeleteInspection: (id: string) => void;
  onNewInspection: () => void;
  onLoadSample: () => void;
  onGoToSheet: () => void;
}

export const DatabaseModuleStep: React.FC<Props> = ({
  inspections,
  currentInspectionId,
  onSelectAndEdit,
  onDeleteInspection,
  onNewInspection,
  onLoadSample,
  onGoToSheet
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCondition, setFilterCondition] = useState<'all' | 'critico' | 'alerta' | 'adequado'>('all');
  const [filterStatus, setFilterStatus] = useState<'all' | 'draft' | 'finalized'>('all');
  const [filterNotification, setFilterNotification] = useState<'all' | 'with_notif' | 'without_notif'>('all');
  const [sortBy, setSortBy] = useState<'recent' | 'oldest' | 'name' | 'critical'>('recent');

  // Modal de detalhes
  const [detailInspection, setDetailInspection] = useState<InspectionData | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

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
      (g.inspectors && g.inspectors.some(i => i.name.toLowerCase().includes(searchLower)));

    if (!matchesSearch) return false;

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
              onClick={onLoadSample}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-amber-300 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 dark:hover:bg-amber-900/40 text-amber-900 dark:text-amber-300 text-xs font-semibold transition cursor-pointer"
              title="Carregar exemplo didático para testes"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
              <span>Exemplo Teste</span>
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
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4">
          <div className="bg-slate-50 dark:bg-slate-950/60 p-3 rounded-xl border border-slate-100 dark:border-slate-800 space-y-0.5 transition-colors">
            <span className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider block">Total de Vistorias</span>
            <div className="flex items-baseline gap-2">
              <span className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tabular-nums">{totalCount}</span>
              <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">cadastradas</span>
            </div>
          </div>

          <div className="bg-slate-50 dark:bg-slate-950/60 p-3 rounded-xl border border-slate-100 dark:border-slate-800 space-y-0.5 transition-colors">
            <span className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider block">Barragens c/ Alerta/Crítico</span>
            <div className="flex items-baseline gap-2">
              <span className="text-xl sm:text-2xl font-black text-rose-600 dark:text-rose-400 tabular-nums">{criticalDamsCount}</span>
              <span className="text-[11px] text-rose-700 dark:text-rose-400 font-medium">requerem atenção</span>
            </div>
          </div>

          <div className="bg-slate-50 dark:bg-slate-950/60 p-3 rounded-xl border border-slate-100 dark:border-slate-800 space-y-0.5 transition-colors">
            <span className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider block">Registros Fotográficos</span>
            <div className="flex items-baseline gap-2">
              <span className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tabular-nums">{totalPhotosCount}</span>
              <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">fotos técnicas</span>
            </div>
          </div>

          <div className="bg-slate-50 dark:bg-slate-950/60 p-3 rounded-xl border border-slate-100 dark:border-slate-800 space-y-0.5 transition-colors">
            <span className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider block">Notificações SIGA</span>
            <div className="flex items-baseline gap-2">
              <span className="text-xl sm:text-2xl font-black text-amber-600 dark:text-amber-400 tabular-nums">{notificationsCount}</span>
              <span className="text-[11px] text-amber-700 dark:text-amber-400 font-medium">ativas vinculadas</span>
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
            <option value="all">Todas as Vistorias</option>
            <option value="with_notif">Com Notificação Técnica</option>
            <option value="without_notif">Sem Notificação</option>
          </select>

          {(searchTerm || filterCondition !== 'all' || filterStatus !== 'all' || filterNotification !== 'all') && (
            <button
              type="button"
              onClick={() => {
                setSearchTerm('');
                setFilterCondition('all');
                setFilterStatus('all');
                setFilterNotification('all');
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
              const criticalCount = Object.values(insp.componentsData).filter(comp => comp.condition === 'critico').length;
              const alertCount = Object.values(insp.componentsData).filter(comp => comp.condition === 'alerta').length;
              const photosCount = insp.photos.length;

              return (
                <div 
                  key={insp.id}
                  className={`bg-white dark:bg-slate-900 rounded-2xl border transition-all duration-200 overflow-hidden shadow-2xs hover:shadow-md ${
                    isActive 
                      ? 'border-emerald-500 ring-2 ring-emerald-500/20' 
                      : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                  }`}
                >
                  <div className="p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    {/* Informações Principais da Vistoria */}
                    <div className="space-y-2 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white leading-tight">
                          {d.damName || d.propertyOrBusinessName || 'Vistoria sem denominação'}
                        </h3>

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
                    </div>

                    {/* Botões de Ação Direta: Visualizar, Editar, Excluir */}
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

                      {/* Editar */}
                      <button
                        type="button"
                        onClick={() => onSelectAndEdit(insp.id)}
                        className="px-3 py-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-2xs"
                        title="Carregar para edição na Ficha de Inspeção"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span>Editar</span>
                      </button>

                      {/* Excluir */}
                      <button
                        type="button"
                        onClick={() => setInspectionToDelete(insp)}
                        className="p-1.5 rounded-xl border border-rose-200 dark:border-rose-900/50 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/60 text-rose-700 dark:text-rose-400 transition cursor-pointer"
                        title="Excluir esta vistoria"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
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
              <button
                type="button"
                onClick={onLoadSample}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium transition cursor-pointer"
              >
                Carregar Exemplo Didático
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
    </div>
  );
};
