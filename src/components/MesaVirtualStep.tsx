// ==============================================================================
// ARQUIVO: src/components/MesaVirtualStep.tsx
// Mesa Virtual CSB/SEMA-MT (V1) — Fiscaliza
// Abas "Meus documentos" e "Todos documentos CSB" (escopo exclusivo Fiscaliza),
// estados de sincronização fiéis, visualização somente leitura de colegas,
// retificação auditável de documentos concluídos, resolução de conflitos e mapa
// sincronizado lista <-> mapa.
// ==============================================================================

import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Edit3,
  Eye,
  FileCheck,
  FilePenLine,
  FileText,
  Filter,
  GitCompare,
  History,
  Layers,
  Lock,
  MapPin,
  RefreshCw,
  Search,
  ShieldAlert,
  Trash2,
  UploadCloud,
  WifiOff,
  X
} from 'lucide-react';
import {
  ConflitoSincronizacaoBarragem,
  DamLinkStatus,
  DocumentType,
  InspectionData,
  MesaSyncState
} from '../types/inspection';
import {
  applyCompletedDocumentRectification,
  buildMesaVirtualCatalog,
  MesaDocumentStatusFilter,
  MesaDocumentTypeFilter,
  MesaVirtualFilters,
  MesaVirtualItem,
  PhotoQueueStateEntry,
  queryRelatedContextSummaryOnDemand,
  RelatedContextSummary
} from '../services/mesaVirtualService';
import { resolveDamSyncConflict } from '../services/administraEcosystemService';
import { getAllPhotoSyncQueueItems } from '../services/offlineDb';
import { subscribePhotoQueue } from '../services/photoSyncQueueService';
import { getSistemaLabel } from '../services/ecosystemConfig';
import { InteractiveMap } from './InteractiveMap';
import { MapCatalogDamPin, parseCoordinate } from '../services/mapDataService';

interface MesaVirtualStepProps {
  inspections: InspectionData[];
  currentInspectionId: string;
  currentUser: { id?: string; email?: string; fullName?: string; role?: string } | null;
  isOnline: boolean;
  isSyncing: boolean;
  onGoToDashboard: () => void;
  onOpenInspectionForEdit: (id: string) => void;
  onPersistInspection: (updated: InspectionData) => void;
  onDeleteInspection: (id: string) => void;
  onSyncSingle: (id: string) => Promise<void> | void;
  onSyncAll: () => Promise<void> | void;
}

const SYNC_STATE_STYLES: Record<MesaSyncState, { label: string; classes: string }> = {
  salvo_localmente: {
    label: 'Salvo localmente',
    classes:
      'bg-slate-100 text-slate-800 border-slate-300 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700'
  },
  pendente_sincronizacao: {
    label: 'Pendente de sincronização',
    classes:
      'bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800'
  },
  sincronizado: {
    label: 'Sincronizado',
    classes:
      'bg-emerald-100 text-emerald-900 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800'
  },
  falha_conflito: {
    label: 'Falha/Conflito',
    classes:
      'bg-rose-100 text-rose-900 border-rose-300 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800'
  }
};

const LINK_STATUS_STYLES: Record<DamLinkStatus, string> = {
  vinculo_oficial:
    'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800',
  vinculo_pendente_revisao:
    'bg-amber-50 text-amber-900 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800',
  sem_vinculo:
    'bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'
};

function formatDatePtBr(iso?: string): string {
  if (!iso) return '—';
  const trimmed = iso.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const [y, m, d] = trimmed.split('-');
    return `${d}/${m}/${y}`;
  }
  const d = new Date(trimmed);
  if (Number.isNaN(d.getTime())) return trimmed;
  return d.toLocaleDateString('pt-BR');
}

export const MesaVirtualStep: React.FC<MesaVirtualStepProps> = ({
  inspections,
  currentInspectionId,
  currentUser,
  isOnline,
  isSyncing,
  onGoToDashboard,
  onOpenInspectionForEdit,
  onPersistInspection,
  onDeleteInspection,
  onSyncSingle,
  onSyncAll
}) => {
  const [activeTab, setActiveTab] = useState<'meus' | 'todos_csb'>('meus');
  const [showFilters, setShowFilters] = useState<boolean>(true);
  const [showMapSplit, setShowMapSplit] = useState<boolean>(false);
  const [selectedMapDamId, setSelectedMapDamId] = useState<string | null>(null);
  const [page, setPage] = useState<number>(1);
  const [pageSize] = useState<number>(10);

  const [photoQueueEntries, setPhotoQueueEntries] = useState<PhotoQueueStateEntry[]>([]);
  const [syncingItemId, setSyncingItemId] = useState<string | null>(null);
  const [actionFeedback, setActionFeedback] = useState<{
    type: 'success' | 'error' | 'info';
    message: string;
  } | null>(null);

  // Filtros multi-critério
  const [filters, setFilters] = useState<MesaVirtualFilters>({
    tipo: 'todos',
    status: 'todos',
    autor: '',
    periodoInicio: '',
    periodoFim: '',
    processo: '',
    municipio: '',
    barragem: '',
    empreendedor: '',
    syncState: 'todos',
    somenteComAnomalias: false,
    searchText: ''
  });

  // Modal de Visualização Somente Leitura + Resumo Relacionado Sob Demanda
  const [readOnlyItem, setReadOnlyItem] = useState<MesaVirtualItem | null>(null);
  const [relatedSummary, setRelatedSummary] = useState<RelatedContextSummary | null>(null);
  const [loadingRelated, setLoadingRelated] = useState<boolean>(false);

  // Modal de Retificação Auditável (apenas documentos concluídos)
  const [rectifyItem, setRectifyItem] = useState<MesaVirtualItem | null>(null);
  const [rectifyDocType, setRectifyDocType] = useState<DocumentType | 'ficha_vistoria'>('relatorio_tecnico');
  const [rectifyJustificativa, setRectifyJustificativa] = useState<string>('');
  const [rectifyResumo, setRectifyResumo] = useState<string>('');
  const [rectifyNovoTexto, setRectifyNovoTexto] = useState<string>('');
  const [rectifyError, setRectifyError] = useState<string | null>(null);

  // Modal de Resolução de Conflito de Sincronização
  const [conflictItem, setConflictItem] = useState<MesaVirtualItem | null>(null);
  const [conflictJustificativa, setConflictJustificativa] = useState<string>('');
  const [conflictManualValues, setConflictManualValues] = useState<Record<string, string>>({});
  const [conflictError, setConflictError] = useState<string | null>(null);

  // Carrega fila de fotos do IndexedDB para classificar estado de sync real
  useEffect(() => {
    let active = true;
    const refreshQueue = async () => {
      try {
        const rows = await getAllPhotoSyncQueueItems();
        if (active) {
          setPhotoQueueEntries(rows.map(r => ({ vistoriaId: r.vistoriaId, status: r.status })));
        }
      } catch {
        if (active) setPhotoQueueEntries([]);
      }
    };
    void refreshQueue();
    const unsub = subscribePhotoQueue(() => {
      void refreshQueue();
    });
    return () => {
      active = false;
      unsub();
    };
  }, [inspections.length]);

  const catalogResult = useMemo(
    () =>
      buildMesaVirtualCatalog({
        inspections,
        currentUser,
        tab: activeTab,
        photoQueueEntries,
        filters,
        page,
        pageSize
      }),
    [inspections, currentUser, activeTab, photoQueueEntries, filters, page, pageSize]
  );

  // Marcadores numerados sincronizados para o mapa
  const mapPins = useMemo<MapCatalogDamPin[]>(() => {
    return catalogResult.items.map((item, idx) => {
      const coords = item.inspection.damIdentification?.coordinates;
      const lat = parseCoordinate(coords?.latitude, true);
      const lng = parseCoordinate(coords?.longitude, false);
      return {
        id: item.id,
        orderNumber: (catalogResult.page - 1) * catalogResult.pageSize + idx + 1,
        nome: item.barragemNome,
        municipio: item.municipio,
        empreendedor: item.empreendedorNome,
        lat,
        lng,
        linkStatus: item.linkClassification.status,
        linkLabel: item.linkClassification.label,
        coordenadasIndisponiveis: item.linkClassification.coordenadasIndisponiveis,
        syncLabel: item.syncSummary.label,
        subtitle: item.processoNumero ? `Proc. ${item.processoNumero}` : item.numeroVistoria || undefined
      };
    });
  }, [catalogResult.items, catalogResult.page, catalogResult.pageSize]);

  const handleFilterChange = <K extends keyof MesaVirtualFilters>(key: K, value: MesaVirtualFilters[K]) => {
    setPage(1);
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const resetFilters = () => {
    setPage(1);
    setFilters({
      tipo: 'todos',
      status: 'todos',
      autor: '',
      periodoInicio: '',
      periodoFim: '',
      processo: '',
      municipio: '',
      barragem: '',
      empreendedor: '',
      syncState: 'todos',
      somenteComAnomalias: false,
      searchText: ''
    });
  };

  const handleOpenReadOnlyModal = async (item: MesaVirtualItem) => {
    setReadOnlyItem(item);
    setRelatedSummary(null);
    setLoadingRelated(true);
    try {
      const summary = await queryRelatedContextSummaryOnDemand({
        barragemId: item.inspection.barragemId,
        empreendedorId: item.inspection.empreendedorId,
        barragemNome: item.barragemNome,
        empreendedorNome: item.empreendedorNome,
        processoNumero: item.processoNumero,
        excludeVistoriaId: item.id,
        localInspections: inspections
      });
      setRelatedSummary(summary);
    } finally {
      setLoadingRelated(false);
    }
  };

  const handleOpenRectifyModal = (item: MesaVirtualItem) => {
    const initialDocType: DocumentType | 'ficha_vistoria' = item.hasRelatorioTecnico
      ? 'relatorio_tecnico'
      : item.hasAutoInspecao
      ? 'auto_inspecao'
      : item.hasNotificacao
      ? 'notificacao'
      : 'ficha_vistoria';
    setRectifyItem(item);
    setRectifyDocType(initialDocType);
    setRectifyJustificativa('');
    setRectifyResumo('');
    setRectifyNovoTexto(
      initialDocType === 'relatorio_tecnico'
        ? item.inspection.drafts?.technicalReport || ''
        : initialDocType === 'auto_inspecao'
        ? item.inspection.drafts?.inspectionNotice || ''
        : initialDocType === 'notificacao'
        ? item.inspection.drafts?.notificationLetter || ''
        : ''
    );
    setRectifyError(null);
  };

  const handleChangeRectifyDocType = (docType: DocumentType | 'ficha_vistoria') => {
    setRectifyDocType(docType);
    if (!rectifyItem) return;
    if (docType === 'relatorio_tecnico') {
      setRectifyNovoTexto(rectifyItem.inspection.drafts?.technicalReport || '');
    } else if (docType === 'auto_inspecao') {
      setRectifyNovoTexto(rectifyItem.inspection.drafts?.inspectionNotice || '');
    } else if (docType === 'notificacao') {
      setRectifyNovoTexto(rectifyItem.inspection.drafts?.notificationLetter || '');
    } else {
      setRectifyNovoTexto('');
    }
  };

  const handleConfirmRectification = (e: React.FormEvent) => {
    e.preventDefault();
    if (!rectifyItem) return;
    const res = applyCompletedDocumentRectification({
      inspection: rectifyItem.inspection,
      currentUser,
      documentoTipo: rectifyDocType,
      justificativa: rectifyJustificativa,
      resumoAlteracoes: rectifyResumo,
      novoConteudoTexto: rectifyDocType === 'ficha_vistoria' ? undefined : rectifyNovoTexto
    });

    if (!res.success || !res.updatedInspection) {
      setRectifyError(res.error || 'Não foi possível registrar a retificação auditável.');
      return;
    }

    onPersistInspection(res.updatedInspection);
    setRectifyItem(null);
    setActionFeedback({
      type: 'success',
      message: `Retificação auditável v${res.updatedInspection.revisaoVersao} registrada com justificativa e histórico preservado.`
    });
  };

  const handleResolveConflictDecision = (
    conflict: ConflitoSincronizacaoBarragem,
    campo: string,
    decisao: 'manter_local' | 'adotar_remoto' | 'mesclar_manual'
  ) => {
    if (!conflictItem) return;
    const manualKey = `${conflict.id}:${campo}`;
    const res = resolveDamSyncConflict({
      inspection: conflictItem.inspection,
      conflictId: conflict.id,
      decisao,
      actorEmail: currentUser?.email || '',
      actorName: currentUser?.fullName || currentUser?.email || 'Fiscal CSB',
      justificativa: conflictJustificativa,
      manualOverrides:
        decisao === 'mesclar_manual'
          ? { [campo]: conflictManualValues[manualKey] ?? '' }
          : undefined
    });

    if (res.error) {
      setConflictError(res.error);
      return;
    }

    onPersistInspection(res.updatedInspection);
    setConflictError(null);
    const remainingPending = (res.updatedInspection.conflitosSincronizacao || []).some(
      c => c.status === 'pendente'
    );
    if (!remainingPending) {
      setConflictItem(null);
      setActionFeedback({
        type: 'success',
        message: 'Conflito de sincronização resolvido de forma auditável. Você já pode sincronizar esta ficha.'
      });
    } else {
      setConflictItem({
        ...conflictItem,
        inspection: res.updatedInspection
      });
    }
  };

  const handleSyncItemClick = async (id: string) => {
    setSyncingItemId(id);
    try {
      await onSyncSingle(id);
    } finally {
      setSyncingItemId(null);
    }
  };

  const activeConflictsForModal = (conflictItem?.inspection.conflitosSincronizacao || []).filter(
    c => c.status === 'pendente'
  );

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* Cabeçalho Institucional da Mesa Virtual */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-base sm:text-xl font-black text-slate-900 dark:text-white tracking-tight">
              Mesa Virtual · Fiscaliza CSB
            </h1>
            <span className="px-2 py-0.5 rounded-md border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 text-[11px] font-bold">
              Escopo Fiscaliza
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400">
            Consulte vistorias, minutas e pendências de campo deste sistema. Documentos de colegas abrem em modo somente leitura e conclusões só aceitam retificação auditável.
          </p>
        </div>

        <div className="flex items-center flex-wrap gap-2 shrink-0">
          <button
            type="button"
            onClick={onGoToDashboard}
            className="min-h-[40px] px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Painel</span>
          </button>

          <button
            type="button"
            onClick={() => setShowMapSplit(v => !v)}
            className={`min-h-[40px] px-3 py-2 rounded-lg border text-xs font-bold flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 ${
              showMapSplit
                ? 'bg-emerald-700 text-white border-emerald-700'
                : 'bg-white dark:bg-slate-950 text-slate-700 dark:text-slate-200 border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
          >
            <MapPin className="w-3.5 h-3.5" />
            <span>{showMapSplit ? 'Ocultar Mapa' : 'Lista + Mapa'}</span>
          </button>

          {catalogResult.counts.pendentesOuLocais > 0 && (
            <button
              type="button"
              disabled={!isOnline || isSyncing}
              onClick={() => void onSyncAll()}
              className="min-h-[40px] px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
            >
              <UploadCloud className={`w-3.5 h-3.5 ${isSyncing ? 'animate-pulse' : ''}`} />
              <span>
                {isSyncing
                  ? 'Sincronizando...'
                  : `Sincronizar Pendentes (${catalogResult.counts.pendentesOuLocais})`}
              </span>
            </button>
          )}
        </div>
      </div>

      {/* Feedback de Ação */}
      {actionFeedback && (
        <div
          className={`p-3.5 rounded-xl border text-xs font-semibold flex items-start justify-between gap-3 ${
            actionFeedback.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200'
              : actionFeedback.type === 'error'
              ? 'bg-rose-50 dark:bg-rose-950/50 border-rose-300 dark:border-rose-800 text-rose-900 dark:text-rose-200'
              : 'bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200'
          }`}
        >
          <span>{actionFeedback.message}</span>
          <button
            type="button"
            onClick={() => setActionFeedback(null)}
            className="opacity-70 hover:opacity-100 cursor-pointer shrink-0"
            aria-label="Fechar aviso"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Faixa de Resumo Numérico (Tabular) */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3">
          <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 block">
            Meus documentos
          </span>
          <span className="text-xl font-black text-slate-900 dark:text-white tabular-nums">
            {catalogResult.counts.meusTotal}
          </span>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3">
          <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 block">
            Todos CSB (Fiscaliza)
          </span>
          <span className="text-xl font-black text-slate-900 dark:text-white tabular-nums">
            {catalogResult.counts.todosFiscalizaTotal}
          </span>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3">
          <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 block">
            Rascunhos / Concluídas
          </span>
          <span className="text-xl font-black text-slate-900 dark:text-white tabular-nums">
            {catalogResult.counts.rascunhos} / {catalogResult.counts.concluidas}
          </span>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3">
          <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 block">
            Locais / Pendentes Sync
          </span>
          <span className="text-xl font-black text-amber-600 dark:text-amber-400 tabular-nums">
            {catalogResult.counts.pendentesOuLocais}
          </span>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 col-span-2 sm:col-span-1">
          <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 block">
            Falhas / Conflitos
          </span>
          <span className="text-xl font-black text-rose-600 dark:text-rose-400 tabular-nums">
            {catalogResult.counts.falhasOuConflitos}
          </span>
        </div>
      </div>

      {/* Abas: Meus documentos vs Todos documentos CSB */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="border-b border-slate-200 dark:border-slate-800 px-3 sm:px-4 pt-2 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1 overflow-x-auto">
            <button
              type="button"
              onClick={() => {
                setActiveTab('meus');
                setPage(1);
              }}
              className={`min-h-[44px] px-4 py-2 text-xs sm:text-sm font-bold border-b-2 transition cursor-pointer whitespace-nowrap shrink-0 ${
                activeTab === 'meus'
                  ? 'border-emerald-600 text-emerald-700 dark:text-emerald-300'
                  : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              Meus documentos ({catalogResult.counts.meusTotal})
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab('todos_csb');
                setPage(1);
              }}
              className={`min-h-[44px] px-4 py-2 text-xs sm:text-sm font-bold border-b-2 transition cursor-pointer whitespace-nowrap shrink-0 ${
                activeTab === 'todos_csb'
                  ? 'border-emerald-600 text-emerald-700 dark:text-emerald-300'
                  : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              Todos documentos CSB ({catalogResult.counts.todosFiscalizaTotal})
            </button>
          </div>

          <div className="flex items-center gap-2 pb-2">
            {!isOnline && (
              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 dark:text-amber-300">
                <WifiOff className="w-3.5 h-3.5" />
                <span>Offline</span>
              </span>
            )}
            <button
              type="button"
              onClick={() => setShowFilters(v => !v)}
              className="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <Filter className="w-3.5 h-3.5" />
              <span>{showFilters ? 'Recolher filtros' : 'Filtros'}</span>
            </button>
          </div>
        </div>

        {/* Barra de Filtros Multi-Critério */}
        {showFilters && (
          <div className="p-3 sm:p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
              <div className="relative sm:col-span-2">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={filters.searchText || ''}
                  onChange={e => handleFilterChange('searchText', e.target.value)}
                  placeholder="Buscar por barragem, empreendedor, processo, autor ou nº vistoria..."
                  className="w-full pl-9 pr-3 py-2 text-xs sm:text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                />
              </div>

              <select
                aria-label="Filtrar por tipo de documento"
                value={filters.tipo || 'todos'}
                onChange={e => handleFilterChange('tipo', e.target.value as MesaDocumentTypeFilter)}
                className="px-3 py-2 text-xs sm:text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 font-semibold"
              >
                <option value="todos">Tipo: Todos (Fiscaliza)</option>
                <option value="vistoria_atual">Vistoria Atual</option>
                <option value="vistoria_futura">Vistoria Futura</option>
                <option value="auto_inspecao">Com Auto de Inspeção</option>
                <option value="relatorio_tecnico">Com Relatório Técnico</option>
                <option value="notificacao">Com Notificação</option>
              </select>

              <select
                aria-label="Filtrar por status do documento"
                value={filters.status || 'todos'}
                onChange={e => handleFilterChange('status', e.target.value as MesaDocumentStatusFilter)}
                className="px-3 py-2 text-xs sm:text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 font-semibold"
              >
                <option value="todos">Status: Todos</option>
                <option value="rascunho">Rascunho</option>
                <option value="concluida">Concluída</option>
              </select>

              <select
                aria-label="Filtrar por estado de sincronização"
                value={filters.syncState || 'todos'}
                onChange={e =>
                  handleFilterChange('syncState', e.target.value as 'todos' | MesaSyncState)
                }
                className="px-3 py-2 text-xs sm:text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 font-semibold"
              >
                <option value="todos">Sincronização: Todos estados</option>
                <option value="salvo_localmente">Salvo localmente</option>
                <option value="pendente_sincronizacao">Pendente de sincronização</option>
                <option value="sincronizado">Sincronizado</option>
                <option value="falha_conflito">Falha / Conflito</option>
              </select>

              <input
                type="text"
                value={filters.autor || ''}
                onChange={e => handleFilterChange('autor', e.target.value)}
                placeholder="Autor / Analista"
                className="px-3 py-2 text-xs sm:text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
              />

              <input
                type="text"
                value={filters.processo || ''}
                onChange={e => handleFilterChange('processo', e.target.value)}
                placeholder="Processo SEMA"
                className="px-3 py-2 text-xs sm:text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
              />

              <input
                type="text"
                value={filters.municipio || ''}
                onChange={e => handleFilterChange('municipio', e.target.value)}
                placeholder="Município"
                className="px-3 py-2 text-xs sm:text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
              />

              <input
                type="text"
                value={filters.barragem || ''}
                onChange={e => handleFilterChange('barragem', e.target.value)}
                placeholder="Barragem"
                className="px-3 py-2 text-xs sm:text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
              />

              <input
                type="text"
                value={filters.empreendedor || ''}
                onChange={e => handleFilterChange('empreendedor', e.target.value)}
                placeholder="Empreendedor"
                className="px-3 py-2 text-xs sm:text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
              />

              <div className="flex items-center gap-1.5">
                <input
                  type="date"
                  aria-label="Período inicial"
                  value={filters.periodoInicio || ''}
                  onChange={e => handleFilterChange('periodoInicio', e.target.value)}
                  className="flex-1 min-w-0 px-2 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                />
                <span className="text-xs text-slate-400">a</span>
                <input
                  type="date"
                  aria-label="Período final"
                  value={filters.periodoFim || ''}
                  onChange={e => handleFilterChange('periodoFim', e.target.value)}
                  className="flex-1 min-w-0 px-2 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                />
              </div>

              <div className="flex items-center justify-between gap-2">
                <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(filters.somenteComAnomalias)}
                    onChange={e => handleFilterChange('somenteComAnomalias', e.target.checked)}
                    className="w-4 h-4 rounded text-rose-600"
                  />
                  <span>Com anomalias</span>
                </label>

                <button
                  type="button"
                  onClick={resetFilters}
                  className="text-xs font-bold text-slate-600 dark:text-slate-300 hover:text-emerald-700 dark:hover:text-emerald-400 underline cursor-pointer"
                >
                  Limpar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Conteúdo: Lista (+ Mapa Sincronizado opcional) */}
        <div className={showMapSplit ? 'grid grid-cols-1 xl:grid-cols-12' : ''}>
          <div className={showMapSplit ? 'xl:col-span-6 divide-y divide-slate-200 dark:divide-slate-800' : 'divide-y divide-slate-200 dark:divide-slate-800'}>
            {catalogResult.items.length === 0 ? (
              <div className="p-10 text-center space-y-2">
                <FileText className="w-8 h-8 text-slate-400 mx-auto" />
                <p className="text-sm font-bold text-slate-800 dark:text-slate-200">
                  Nenhum documento encontrado no escopo do Fiscaliza
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Ajuste os filtros ou alterne entre as abas “Meus documentos” e “Todos documentos CSB”.
                </p>
              </div>
            ) : (
              catalogResult.items.map((item, idx) => {
                const orderNum = (catalogResult.page - 1) * catalogResult.pageSize + idx + 1;
                const syncBadge = SYNC_STATE_STYLES[item.syncSummary.state];
                const isSelectedOnMap = selectedMapDamId === item.id;
                const isActiveCurrent = currentInspectionId === item.id;

                return (
                  <div
                    key={item.id}
                    onClick={() => setSelectedMapDamId(item.id)}
                    className={`p-4 transition cursor-pointer ${
                      isSelectedOnMap
                        ? 'bg-emerald-50/70 dark:bg-emerald-950/30'
                        : 'hover:bg-slate-50/80 dark:hover:bg-slate-800/40'
                    }`}
                  >
                    <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-3">
                      <div className="space-y-2 min-w-0 flex-1">
                        {/* Linha 1: Número de ordem + Título + Estados Funcionais */}
                        <div className="flex items-start gap-2.5 flex-wrap">
                          <span className="w-6 h-6 rounded-md bg-slate-900 dark:bg-emerald-700 text-white text-[11px] font-black font-mono tabular-nums flex items-center justify-center shrink-0">
                            {orderNum}
                          </span>

                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white truncate">
                                {item.barragemNome}
                              </h3>
                              {isActiveCurrent && (
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200">
                                  Em edição
                                </span>
                              )}
                            </div>

                            {/* Metadados textuais separados por · (sem poluição de pills) */}
                            <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                              {item.empreendedorNome} · {item.municipio}
                              {item.processoNumero ? ` · Proc. ${item.processoNumero}` : ''}
                              {item.numeroVistoria ? ` · Vistoria ${item.numeroVistoria}` : ''}
                              {item.dataReferencia ? ` · ${formatDatePtBr(item.dataReferencia)}` : ''}
                            </p>
                          </div>
                        </div>

                        {/* Linha 2: Status do documento, Sync, Vínculo e Documentos gerados */}
                        <div className="flex items-center flex-wrap gap-2 text-[11px]">
                          <span
                            className={`px-2 py-0.5 rounded-md border font-bold ${
                              item.inspection.isDraft
                                ? 'bg-slate-100 text-slate-800 border-slate-300 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700'
                                : 'bg-emerald-700 text-white border-emerald-700'
                            }`}
                          >
                            {item.statusLabel}
                            {item.inspection.revisaoVersao && item.inspection.revisaoVersao > 1
                              ? ` v${item.inspection.revisaoVersao}`
                              : ''}
                          </span>

                          <span
                            title={item.syncSummary.detail}
                            className={`px-2 py-0.5 rounded-md border font-bold ${syncBadge.classes}`}
                          >
                            {syncBadge.label}
                          </span>

                          <span
                            title={item.linkClassification.motivo}
                            className={`px-2 py-0.5 rounded-md border font-semibold ${
                              LINK_STATUS_STYLES[item.linkClassification.status]
                            }`}
                          >
                            {item.linkClassification.label}
                          </span>

                          {item.linkClassification.coordenadasIndisponiveis && (
                            <span className="text-slate-500 dark:text-slate-400 font-semibold">
                              · Coordenadas indisponíveis
                            </span>
                          )}

                          {item.hasAnomalias && (
                            <span className="text-rose-700 dark:text-rose-400 font-bold tabular-nums">
                              · {item.anomaliasCriticasCount} crítica(s) / {item.anomaliasAlertaCount} alerta(s)
                            </span>
                          )}

                          <span className="text-slate-500 dark:text-slate-400">
                            · Autor: <strong className="text-slate-700 dark:text-slate-200">{item.autorNome}</strong>
                          </span>

                          {item.retificacoesCount > 0 && (
                            <span className="text-indigo-700 dark:text-indigo-300 font-semibold tabular-nums">
                              · {item.retificacoesCount} retificação(ões)
                            </span>
                          )}
                        </div>

                        {/* Indicação explícita de minutas presentes */}
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 flex flex-wrap gap-x-3 gap-y-1">
                          <span>Tipo: {item.tipoPlanejamento === 'futura' ? 'Vistoria Futura' : 'Vistoria Atual'}</span>
                          {item.hasRelatorioTecnico && <span>· Relatório Técnico</span>}
                          {item.hasAutoInspecao && <span>· Auto de Inspeção</span>}
                          {item.hasNotificacao && <span>· Notificação</span>}
                          {item.syncSummary.pendingPhotoCount > 0 && (
                            <span className="text-amber-700 dark:text-amber-300 font-semibold tabular-nums">
                              · {item.syncSummary.pendingPhotoCount} foto(s) na fila
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Ações */}
                      <div
                        className="flex flex-wrap items-center gap-1.5 shrink-0"
                        onClick={e => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          onClick={() => void handleOpenReadOnlyModal(item)}
                          className="min-h-[36px] px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-100 text-xs font-bold flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Visualizar</span>
                        </button>

                        {item.canDirectEdit && (
                          <button
                            type="button"
                            onClick={() => onOpenInspectionForEdit(item.id)}
                            className="min-h-[36px] px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                            <span>Editar Rascunho</span>
                          </button>
                        )}

                        {item.canRectify && (
                          <button
                            type="button"
                            onClick={() => handleOpenRectifyModal(item)}
                            className="min-h-[36px] px-2.5 py-1.5 rounded-lg border border-indigo-300 dark:border-indigo-700 bg-indigo-50 dark:bg-indigo-950/50 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 text-indigo-800 dark:text-indigo-200 text-xs font-bold flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                          >
                            <FilePenLine className="w-3.5 h-3.5" />
                            <span>Retificar</span>
                          </button>
                        )}

                        {item.hasUnresolvedConflict && (
                          <button
                            type="button"
                            onClick={() => {
                              setConflictItem(item);
                              setConflictJustificativa('');
                              setConflictManualValues({});
                              setConflictError(null);
                            }}
                            className="min-h-[36px] px-2.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                          >
                            <GitCompare className="w-3.5 h-3.5" />
                            <span>Resolver Conflito</span>
                          </button>
                        )}

                        {item.syncSummary.state !== 'sincronizado' && !item.hasUnresolvedConflict && (
                          <button
                            type="button"
                            disabled={!isOnline || syncingItemId === item.id}
                            onClick={() => void handleSyncItemClick(item.id)}
                            className="min-h-[36px] px-2.5 py-1.5 rounded-lg border border-emerald-300 dark:border-emerald-700 bg-white dark:bg-slate-950 hover:bg-emerald-50 dark:hover:bg-slate-800 disabled:opacity-50 text-emerald-700 dark:text-emerald-300 text-xs font-bold flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                            title="Sincronizar este registro"
                          >
                            <RefreshCw
                              className={`w-3.5 h-3.5 ${syncingItemId === item.id ? 'animate-spin' : ''}`}
                            />
                            <span>Sincronizar</span>
                          </button>
                        )}

                        {item.canDelete && (
                          <button
                            type="button"
                            onClick={() => onDeleteInspection(item.id)}
                            className="min-h-[36px] p-1.5 rounded-lg border border-rose-200 dark:border-rose-900/60 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
                            title="Excluir documento"
                            aria-label="Excluir documento"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {showMapSplit && (
            <div className="xl:col-span-6 border-t xl:border-t-0 xl:border-l border-slate-200 dark:border-slate-800 p-3 bg-slate-50/50 dark:bg-slate-950/40">
              <div className="flex items-center justify-between gap-2 mb-2 text-xs">
                <span className="font-bold text-slate-800 dark:text-slate-200">
                  Mapa Sincronizado (marcadores numerados 1..{mapPins.length})
                </span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  Camadas externas permanecem desligadas até seleção manual
                </span>
              </div>
              <InteractiveMap
                inspections={inspections}
                catalogDams={mapPins}
                selectedDamId={selectedMapDamId}
                onSelectDam={damId => setSelectedMapDamId(damId)}
              />
            </div>
          )}
        </div>

        {/* Paginação */}
        <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 dark:text-slate-400">
          <span className="tabular-nums">
            Exibindo {catalogResult.items.length} de {catalogResult.total} registro(s) · Página{' '}
            {catalogResult.page} de {catalogResult.totalPages}
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={catalogResult.page <= 1}
              onClick={() => setPage(p => Math.max(1, p - 1))}
              className="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 disabled:opacity-40 font-bold flex items-center gap-1 cursor-pointer"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              <span>Anterior</span>
            </button>
            <button
              type="button"
              disabled={catalogResult.page >= catalogResult.totalPages}
              onClick={() => setPage(p => Math.min(catalogResult.totalPages, p + 1))}
              className="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 disabled:opacity-40 font-bold flex items-center gap-1 cursor-pointer"
            >
              <span>Próxima</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* ==================================================================== */}
      {/* MODAL 1: VISUALIZAÇÃO SOMENTE LEITURA + CONSULTA RELACIONADA         */}
      {/* ==================================================================== */}
      {readOnlyItem && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl w-full max-w-4xl max-h-[92dvh] flex flex-col overflow-hidden my-auto">
            <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 bg-slate-50 dark:bg-slate-950">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <Lock className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <h2 className="text-sm sm:text-base font-black text-slate-900 dark:text-white truncate">
                    {readOnlyItem.barragemNome} · Modo Somente Leitura
                  </h2>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  {readOnlyItem.empreendedorNome} · {readOnlyItem.municipio} · Autor: {readOnlyItem.autorNome}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setReadOnlyItem(null)}
                className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-5 text-xs text-slate-700 dark:text-slate-300">
              {/* Estado e Vínculo */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800">
                  <span className="text-[10px] font-bold uppercase text-slate-500 block">
                    Situação / Versão
                  </span>
                  <span className="text-sm font-bold text-slate-900 dark:text-white">
                    {readOnlyItem.statusLabel} (v{readOnlyItem.inspection.revisaoVersao || 1})
                  </span>
                </div>
                <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800">
                  <span className="text-[10px] font-bold uppercase text-slate-500 block">
                    Sincronização
                  </span>
                  <span className="text-sm font-bold text-slate-900 dark:text-white">
                    {readOnlyItem.syncSummary.label}
                  </span>
                  <p className="text-[11px] text-slate-500 mt-0.5">{readOnlyItem.syncSummary.detail}</p>
                </div>
                <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800">
                  <span className="text-[10px] font-bold uppercase text-slate-500 block">
                    Vínculo ao Cadastro Central
                  </span>
                  <span className="text-sm font-bold text-slate-900 dark:text-white">
                    {readOnlyItem.linkClassification.label}
                  </span>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {readOnlyItem.linkClassification.motivo}
                  </p>
                </div>
              </div>

              {/* Aviso de Somente Leitura / Permissão */}
              {readOnlyItem.readOnlyReason && (
                <div className="p-3 rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200 flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 shrink-0" />
                  <span>{readOnlyItem.readOnlyReason}</span>
                </div>
              )}

              {/* Minutas registradas */}
              <div className="space-y-3">
                <h3 className="text-xs font-black uppercase tracking-wide text-slate-900 dark:text-white flex items-center gap-1.5">
                  <FileCheck className="w-4 h-4 text-emerald-600" />
                  <span>Conteúdo e Minutas da Vistoria</span>
                </h3>
                {readOnlyItem.inspection.conclusions?.generalFindings && (
                  <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950">
                    <span className="font-bold block mb-1">Constatações Gerais:</span>
                    <p className="whitespace-pre-wrap">{readOnlyItem.inspection.conclusions.generalFindings}</p>
                  </div>
                )}
                {readOnlyItem.inspection.drafts?.technicalReport && (
                  <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800">
                    <span className="font-bold block mb-1">Minuta · Relatório Técnico:</span>
                    <p className="whitespace-pre-wrap max-h-40 overflow-y-auto">
                      {readOnlyItem.inspection.drafts.technicalReport}
                    </p>
                  </div>
                )}
                {readOnlyItem.inspection.drafts?.inspectionNotice && (
                  <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800">
                    <span className="font-bold block mb-1">Minuta · Auto de Inspeção:</span>
                    <p className="whitespace-pre-wrap max-h-40 overflow-y-auto">
                      {readOnlyItem.inspection.drafts.inspectionNotice}
                    </p>
                  </div>
                )}
                {readOnlyItem.inspection.drafts?.notificationLetter && (
                  <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800">
                    <span className="font-bold block mb-1">Minuta · Notificação:</span>
                    <p className="whitespace-pre-wrap max-h-40 overflow-y-auto">
                      {readOnlyItem.inspection.drafts.notificationLetter}
                    </p>
                  </div>
                )}
              </div>

              {/* Consulta Contextual Sob Demanda (Resumo leve sem copiar anexos) */}
              <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                <h3 className="text-xs font-black uppercase tracking-wide text-slate-900 dark:text-white flex items-center gap-1.5">
                  <Layers className="w-4 h-4 text-indigo-600" />
                  <span>Documentos Relacionados (Resumo Sob Demanda · Sem Cópia de Anexos)</span>
                </h3>
                {loadingRelated ? (
                  <div className="flex items-center gap-2 text-slate-500 py-2">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Consultando referências relacionadas por barragem, empreendedor e processo...</span>
                  </div>
                ) : relatedSummary ? (
                  <div className="space-y-2">
                    {relatedSummary.relatedInspections.length === 0 &&
                    relatedSummary.relatedEcosystemProducts.length === 0 ? (
                      <p className="text-slate-500 dark:text-slate-400">
                        Nenhuma outra vistoria ou produto relacionado localizado para este contexto.
                      </p>
                    ) : (
                      <>
                        {relatedSummary.relatedInspections.map(rel => (
                          <div
                            key={rel.id}
                            className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2"
                          >
                            <div>
                              <span className="font-bold text-slate-900 dark:text-white">
                                Fiscaliza · Vistoria {rel.numeroVistoria}
                              </span>
                              <span className="text-slate-500">
                                {' '}
                                · {rel.barragemNome} · Proc. {rel.processoNumero} · {formatDatePtBr(rel.dataVistoria)}
                              </span>
                            </div>
                            <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                              {rel.status} · {rel.matchType === 'id_estavel' ? 'Vínculo por ID' : 'Referência auxiliar'}
                            </span>
                          </div>
                        ))}
                        {relatedSummary.relatedEcosystemProducts.map(prod => (
                          <div
                            key={prod.id}
                            className="p-2.5 rounded-lg border border-indigo-200 dark:border-indigo-900/60 bg-indigo-50/40 dark:bg-indigo-950/20 flex flex-wrap items-center justify-between gap-2"
                          >
                            <div>
                              <span className="font-bold text-indigo-900 dark:text-indigo-200">
                                {getSistemaLabel(prod.sistemaOrigem)} · {prod.titulo}
                              </span>
                              <span className="text-slate-500">
                                {' '}
                                · {prod.numeroDocumento || prod.tipoProduto} · {formatDatePtBr(prod.dataEmissao)}
                              </span>
                            </div>
                            <span className="text-[11px] font-semibold text-indigo-700 dark:text-indigo-300">
                              Somente referência ({prod.statusProduto})
                            </span>
                          </div>
                        ))}
                      </>
                    )}
                  </div>
                ) : null}
              </div>

              {/* Histórico de Retificações Auditáveis */}
              {(readOnlyItem.inspection.retificacoesHistorico || []).length > 0 && (
                <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                  <h3 className="text-xs font-black uppercase tracking-wide text-slate-900 dark:text-white flex items-center gap-1.5">
                    <History className="w-4 h-4 text-emerald-600" />
                    <span>Trilha Auditável de Retificações</span>
                  </h3>
                  <div className="space-y-2">
                    {(readOnlyItem.inspection.retificacoesHistorico || []).map(ret => (
                      <div
                        key={ret.id}
                        className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 space-y-1"
                      >
                        <div className="flex items-center justify-between gap-2 font-bold text-slate-900 dark:text-white">
                          <span>
                            Versão {ret.versao} · {ret.documentoTipo} · {ret.autorNome}
                          </span>
                          <span className="font-mono text-[11px] text-slate-500 tabular-nums">
                            {new Date(ret.alteradoEm).toLocaleString('pt-BR')}
                          </span>
                        </div>
                        <p>
                          <strong>Justificativa:</strong> {ret.justificativa}
                        </p>
                        <p>
                          <strong>Resumo:</strong> {ret.resumoAlteracoes}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-800 flex flex-wrap justify-end gap-2 bg-slate-50 dark:bg-slate-950">
              {readOnlyItem.canRectify && (
                <button
                  type="button"
                  onClick={() => {
                    const target = readOnlyItem;
                    setReadOnlyItem(null);
                    handleOpenRectifyModal(target);
                  }}
                  className="px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <FilePenLine className="w-3.5 h-3.5" />
                  <span>Iniciar Retificação Auditável</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setReadOnlyItem(null)}
                className="px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 text-xs font-bold cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL 2: RETIFICAÇÃO AUDITÁVEL DE DOCUMENTO CONCLUÍDO                 */}
      {/* ==================================================================== */}
      {rectifyItem && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <form
            onSubmit={handleConfirmRectification}
            className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl w-full max-w-2xl max-h-[92dvh] flex flex-col overflow-hidden my-auto"
          >
            <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-950">
              <div>
                <h2 className="text-sm sm:text-base font-black text-slate-900 dark:text-white">
                  Retificação Auditável · {rectifyItem.barragemNome}
                </h2>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Documentos concluídos não permitem edição silenciosa. Toda alteração incrementa a versão e grava justificativa com autor e data.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setRectifyItem(null)}
                className="p-1.5 text-slate-500 hover:text-slate-900 dark:hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-3.5 text-xs">
              <div>
                <label className="block font-bold text-slate-800 dark:text-slate-200 mb-1">
                  Documento alvo da retificação
                </label>
                <select
                  value={rectifyDocType}
                  onChange={e =>
                    handleChangeRectifyDocType(e.target.value as DocumentType | 'ficha_vistoria')
                  }
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
                >
                  <option value="relatorio_tecnico">Relatório Técnico de Inspeção</option>
                  <option value="auto_inspecao">Auto de Inspeção</option>
                  <option value="notificacao">Notificação Técnica</option>
                  <option value="ficha_vistoria">Registro Geral da Ficha de Vistoria</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-800 dark:text-slate-200 mb-1">
                  Justificativa técnica obrigatória *
                </label>
                <textarea
                  rows={2}
                  required
                  value={rectifyJustificativa}
                  onChange={e => setRectifyJustificativa(e.target.value)}
                  placeholder="Explique o motivo técnico ou formal da retificação (mín. 8 caracteres)..."
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-800 dark:text-slate-200 mb-1">
                  Resumo objetivo do que foi alterado *
                </label>
                <input
                  type="text"
                  required
                  value={rectifyResumo}
                  onChange={e => setRectifyResumo(e.target.value)}
                  placeholder="Ex: Correção de coordenada do vertedouro e prazo da notificação"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
                />
              </div>

              {rectifyDocType !== 'ficha_vistoria' && (
                <div>
                  <label className="block font-bold text-slate-800 dark:text-slate-200 mb-1">
                    Texto retificado da minuta
                  </label>
                  <textarea
                    rows={6}
                    value={rectifyNovoTexto}
                    onChange={e => setRectifyNovoTexto(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white font-mono"
                  />
                </div>
              )}

              {rectifyError && (
                <p className="text-rose-600 dark:text-rose-400 font-bold">{rectifyError}</p>
              )}
            </div>

            <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2 bg-slate-50 dark:bg-slate-950">
              <button
                type="button"
                onClick={() => setRectifyItem(null)}
                className="px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 text-xs font-bold cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold cursor-pointer"
              >
                Registrar Retificação v{(rectifyItem.inspection.revisaoVersao || 1) + 1}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL 3: RESOLUÇÃO AUDITÁVEL DE CONFLITOS DE SINCRONIZAÇÃO           */}
      {/* ==================================================================== */}
      {conflictItem && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl w-full max-w-3xl max-h-[92dvh] flex flex-col overflow-hidden my-auto">
            <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-rose-50 dark:bg-rose-950/40">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0" />
                <div>
                  <h2 className="text-sm sm:text-base font-black text-slate-900 dark:text-white">
                    Conflito de Sincronização · {conflictItem.barragemNome}
                  </h2>
                  <p className="text-[11px] text-slate-600 dark:text-slate-300">
                    Os dados digitados localmente e os do cadastro remoto divergem. Nenhuma versão foi sobrescrita automaticamente.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setConflictItem(null)}
                className="p-1.5 text-slate-500 hover:text-slate-900 dark:hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-800 dark:text-slate-200 mb-1">
                  Justificativa da decisão (obrigatória) *
                </label>
                <input
                  type="text"
                  value={conflictJustificativa}
                  onChange={e => setConflictJustificativa(e.target.value)}
                  placeholder="Ex: Confirmado em campo com GPS e placa de identificação da estrutura"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
                />
              </div>

              {conflictError && (
                <div className="p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/50 border border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-300 font-bold">
                  {conflictError}
                </div>
              )}

              {activeConflictsForModal.map(conflict => (
                <div key={conflict.id} className="space-y-3">
                  <div className="text-[11px] font-bold text-slate-500 uppercase">
                    Detectado em {new Date(conflict.detectadoEm).toLocaleString('pt-BR')} · {conflict.camposDivergentes.length} campo(s) divergente(s)
                  </div>

                  {conflict.camposDivergentes.map(field => {
                      const manualKey = `${conflict.id}:${field.campo}`;
                      const origemLabel =
                        field.origemRemota === 'administra_api'
                          ? 'Administra API'
                          : getSistemaLabel(field.origemRemota);
                      return (
                        <div
                          key={field.campo}
                          className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2.5"
                        >
                          <div className="font-bold text-slate-900 dark:text-white">
                            Campo divergente: {field.rotulo}
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                            <div className="p-2.5 rounded-lg bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800">
                              <span className="text-[10px] font-bold uppercase text-emerald-700 dark:text-emerald-300 block">
                                Valor Local (Fiscaliza)
                              </span>
                              <span className="font-semibold text-slate-900 dark:text-white break-words">
                                {field.valorLocal || '—'}
                              </span>
                            </div>
                            <div className="p-2.5 rounded-lg bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800">
                              <span className="text-[10px] font-bold uppercase text-indigo-700 dark:text-indigo-300 block">
                                Valor Remoto ({origemLabel})
                              </span>
                              <span className="font-semibold text-slate-900 dark:text-white break-words">
                                {field.valorRemoto || '—'}
                              </span>
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-2 pt-1">
                            <button
                              type="button"
                              onClick={() =>
                                handleResolveConflictDecision(conflict, field.campo, 'manter_local')
                              }
                              className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold cursor-pointer"
                            >
                              Manter Local
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                handleResolveConflictDecision(conflict, field.campo, 'adotar_remoto')
                              }
                              className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold cursor-pointer"
                            >
                              Adotar Remoto
                            </button>
                            <input
                              type="text"
                              value={conflictManualValues[manualKey] || ''}
                              onChange={e =>
                                setConflictManualValues(prev => ({
                                  ...prev,
                                  [manualKey]: e.target.value
                                }))
                              }
                              placeholder="Ou informe valor mesclado..."
                              className="flex-1 min-w-[160px] px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
                            />
                            <button
                              type="button"
                              onClick={() =>
                                handleResolveConflictDecision(conflict, field.campo, 'mesclar_manual')
                              }
                              className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 font-bold cursor-pointer"
                            >
                              Mesclar Manual
                            </button>
                          </div>
                        </div>
                      );
                    })}
                </div>
              ))}
            </div>

            <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-800 flex justify-end bg-slate-50 dark:bg-slate-950">
              <button
                type="button"
                onClick={() => setConflictItem(null)}
                className="px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 text-xs font-bold cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
