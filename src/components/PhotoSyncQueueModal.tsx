// ==============================================================================
// ARQUIVO: src/components/PhotoSyncQueueModal.tsx
// Central de Fila de Sincronização Persistente de Fotos - IndexedDB (CSB/SEMA-MT)
// Exibe explicitamente quais fotos estão aguardando upload para o banco de dados,
// status individual, tamanho de arquivos, progresso em tempo real e reenvio.
// ==============================================================================

import React, { useState, useEffect, useRef } from 'react';
import { 
  Camera, 
  CloudUpload, 
  CheckCircle2, 
  AlertCircle, 
  Clock, 
  RefreshCw, 
  Trash2, 
  X, 
  ZoomIn, 
  HardDrive, 
  WifiOff, 
  Check, 
  AlertTriangle,
  FileImage,
  MapPin,
  Calendar
} from 'lucide-react';
import { PhotoSyncQueueItem, InspectionData } from '../types/inspection';
import { 
  getPhotoSyncQueue, 
  getPhotoQueueSummary, 
  uploadSingleQueuePhoto, 
  processAllPendingPhotoQueue, 
  removePhotoFromQueue, 
  clearCompletedPhotosFromQueue, 
  reEnqueuePhoto,
  subscribePhotoQueue,
  enqueuePhotosFromInspection
} from '../services/photoSyncQueueService';

interface PhotoSyncQueueModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentInspection?: InspectionData;
  isOnline?: boolean;
}

export const PhotoSyncQueueModal: React.FC<PhotoSyncQueueModalProps> = ({
  isOpen,
  onClose,
  currentInspection,
  isOnline = true
}) => {
  const [queueItems, setQueueItems] = useState<PhotoSyncQueueItem[]>([]);
  const [summary, setSummary] = useState({
    total: 0,
    pending: 0,
    uploading: 0,
    error: 0,
    completed: 0,
    totalBytes: 0,
    totalFormatted: '0 KB'
  });
  const [activeFilter, setActiveFilter] = useState<'all' | 'pending' | 'error' | 'completed'>('all');
  const [isSyncingAll, setIsSyncingAll] = useState(false);
  const [syncProgress, setSyncProgress] = useState<{
    current: number;
    total: number;
    message: string;
  } | null>(null);
  const [zoomPhoto, setZoomPhoto] = useState<PhotoSyncQueueItem | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const progressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (progressTimerRef.current) clearTimeout(progressTimerRef.current);
    };
  }, []);

  // Carrega e atualiza a lista de fotos da fila do IndexedDB
  const refreshQueue = async () => {
    const items = await getPhotoSyncQueue();
    setQueueItems(items);
    const sum = await getPhotoQueueSummary();
    setSummary(sum);
  };

  useEffect(() => {
    if (!isOpen) return;

    refreshQueue();
    const unsubscribe = subscribePhotoQueue(() => {
      refreshQueue();
    });

    return () => {
      unsubscribe();
    };
  }, [isOpen]);

  if (!isOpen) return null;

  // Filtra itens com base na aba ativa
  const filteredItems = queueItems.filter(item => {
    if (activeFilter === 'pending') return item.status === 'pending' || item.status === 'uploading';
    if (activeFilter === 'error') return item.status === 'error';
    if (activeFilter === 'completed') return item.status === 'completed';
    return true;
  });

  // Ação de sincronizar todas as fotos pendentes da fila
  const handleSyncAll = async () => {
    if (isSyncingAll) return;
    setIsSyncingAll(true);
    setSyncProgress({
      current: 0,
      total: summary.pending + summary.error,
      message: 'Iniciando transmissão de fotos pendentes...'
    });

    try {
      await processAllPendingPhotoQueue(progress => {
        setSyncProgress({
          current: progress.current,
          total: progress.total,
          message: progress.message
        });
      });
      await refreshQueue();
    } catch (err) {
      console.error('Erro na sincronização da fila de fotos:', err);
    } finally {
      setIsSyncingAll(false);
      if (progressTimerRef.current) clearTimeout(progressTimerRef.current);
      progressTimerRef.current = setTimeout(() => {
        setSyncProgress(null);
      }, 4000);
    }
  };

  // Enviar uma foto específica
  const handleUploadSingle = async (photoId: string) => {
    setProcessingId(photoId);
    try {
      await uploadSingleQueuePhoto(photoId);
      await refreshQueue();
    } finally {
      setProcessingId(null);
    }
  };

  // Re-enfileirar uma foto que deu erro
  const handleRetryPhoto = async (photoId: string) => {
    await reEnqueuePhoto(photoId);
    await refreshQueue();
    // Tenta enviar imediatamente
    handleUploadSingle(photoId);
  };

  // Remover foto da fila
  const handleRemovePhoto = async (photoId: string) => {
    await removePhotoFromQueue(photoId);
    await refreshQueue();
  };

  // Limpar fotos concluídas
  const handleClearCompleted = async () => {
    await clearCompletedPhotosFromQueue();
    await refreshQueue();
  };

  // Enfileirar fotos da vistoria atual caso alguma tenha sido perdida
  const handleEnqueueCurrentInspection = async () => {
    if (!currentInspection) return;
    await enqueuePhotosFromInspection(currentInspection);
    await refreshQueue();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-2 xs:p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-4xl shadow-2xl flex flex-col max-h-[92dvh] my-auto overflow-hidden animate-in fade-in zoom-in duration-200">
        
        {/* ================================================================= */}
        {/* CABEÇALHO DO MODAL */}
        {/* ================================================================= */}
        <div className="bg-slate-900 text-white px-4 sm:px-6 py-4 border-b border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-600/30 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shrink-0 shadow-xs">
              <CloudUpload className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold text-white tracking-tight">
                  Fila de Sincronização de Fotos
                </h2>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 uppercase tracking-wider">
                  IndexedDB
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Fotos salvas localmente no dispositivo aguardando upload para o banco de dados da SEMA-MT
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!isOnline && (
              <span className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-amber-950/70 text-amber-300 border border-amber-800">
                <WifiOff className="w-3.5 h-3.5" />
                Offline
              </span>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              title="Fechar"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* ================================================================= */}
        {/* CARDS DE RESUMO DE ESTATÍSTICAS DA FILA */}
        {/* ================================================================= */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 sm:gap-3 p-3 sm:p-4 bg-slate-50 dark:bg-slate-950/50 border-b border-slate-200 dark:border-slate-800 shrink-0">
          {/* Card: Total */}
          <div className="bg-white dark:bg-slate-800/80 p-2.5 sm:p-3 rounded-xl border border-slate-200 dark:border-slate-700/60 shadow-2xs">
            <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 block">Total na Fila</span>
            <div className="flex items-baseline justify-between mt-1">
              <span className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white">{summary.total}</span>
              <span className="text-[10px] font-mono text-slate-400">{summary.totalFormatted}</span>
            </div>
          </div>

          {/* Card: Aguardando Upload */}
          <div 
            onClick={() => setActiveFilter('pending')}
            className={`cursor-pointer p-2.5 sm:p-3 rounded-xl border transition-all ${
              activeFilter === 'pending'
                ? 'bg-amber-500/10 border-amber-500 text-amber-900 dark:text-amber-200 ring-2 ring-amber-500/30'
                : 'bg-white dark:bg-slate-800/80 border-slate-200 dark:border-slate-700/60 hover:border-amber-400'
            }`}
          >
            <div className="flex items-center gap-1.5 text-[11px] font-medium text-amber-700 dark:text-amber-400">
              <Clock className="w-3.5 h-3.5 shrink-0" />
              <span>Aguardando</span>
            </div>
            <div className="flex items-baseline justify-between mt-1">
              <span className="text-lg sm:text-xl font-black text-amber-600 dark:text-amber-400">{summary.pending}</span>
              <span className="text-[10px] text-amber-700 dark:text-amber-500/80 font-medium">pendentes</span>
            </div>
          </div>

          {/* Card: Em Transmissão */}
          <div className="bg-white dark:bg-slate-800/80 p-2.5 sm:p-3 rounded-xl border border-slate-200 dark:border-slate-700/60">
            <div className="flex items-center gap-1.5 text-[11px] font-medium text-blue-700 dark:text-blue-400">
              <RefreshCw className={`w-3.5 h-3.5 shrink-0 ${summary.uploading > 0 ? 'animate-spin' : ''}`} />
              <span>Em Envio</span>
            </div>
            <div className="flex items-baseline justify-between mt-1">
              <span className="text-lg sm:text-xl font-bold text-blue-600 dark:text-blue-400">{summary.uploading}</span>
              <span className="text-[10px] text-slate-400">transmitindo</span>
            </div>
          </div>

          {/* Card: Falha / Erro */}
          <div 
            onClick={() => setActiveFilter('error')}
            className={`cursor-pointer p-2.5 sm:p-3 rounded-xl border transition-all ${
              activeFilter === 'error'
                ? 'bg-rose-500/10 border-rose-500 text-rose-900 dark:text-rose-200 ring-2 ring-rose-500/30'
                : 'bg-white dark:bg-slate-800/80 border-slate-200 dark:border-slate-700/60 hover:border-rose-400'
            }`}
          >
            <div className="flex items-center gap-1.5 text-[11px] font-medium text-rose-700 dark:text-rose-400">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span>Com Falha</span>
            </div>
            <div className="flex items-baseline justify-between mt-1">
              <span className="text-lg sm:text-xl font-black text-rose-600 dark:text-rose-400">{summary.error}</span>
              <span className="text-[10px] text-rose-700 dark:text-rose-500/80 font-medium">tentar nov.</span>
            </div>
          </div>

          {/* Card: Concluídas / Na Nuvem */}
          <div 
            onClick={() => setActiveFilter('completed')}
            className={`cursor-pointer p-2.5 sm:p-3 rounded-xl border transition-all col-span-2 sm:col-span-1 ${
              activeFilter === 'completed'
                ? 'bg-emerald-500/10 border-emerald-500 text-emerald-900 dark:text-emerald-200 ring-2 ring-emerald-500/30'
                : 'bg-white dark:bg-slate-800/80 border-slate-200 dark:border-slate-700/60 hover:border-emerald-400'
            }`}
          >
            <div className="flex items-center gap-1.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
              <span>No Banco</span>
            </div>
            <div className="flex items-baseline justify-between mt-1">
              <span className="text-lg sm:text-xl font-bold text-emerald-600 dark:text-emerald-400">{summary.completed}</span>
              <span className="text-[10px] text-emerald-700 dark:text-emerald-500/80 font-medium">sincronizadas</span>
            </div>
          </div>
        </div>

        {/* ================================================================= */}
        {/* BARRA DE PROGRESSO EM TEMPO REAL */}
        {/* ================================================================= */}
        {syncProgress && (
          <div className="px-4 py-3 bg-blue-50 dark:bg-blue-950/40 border-b border-blue-200 dark:border-blue-900/60 shrink-0">
            <div className="flex items-center justify-between text-xs font-semibold text-blue-900 dark:text-blue-200 mb-1.5">
              <span className="flex items-center gap-2">
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-600 dark:text-blue-400" />
                {syncProgress.message}
              </span>
              <span>{syncProgress.current} de {syncProgress.total}</span>
            </div>
            <div className="w-full bg-blue-200 dark:bg-blue-900/60 h-2 rounded-full overflow-hidden">
              <div 
                className="bg-blue-600 h-full transition-all duration-300 rounded-full"
                style={{ 
                  width: `${syncProgress.total > 0 ? (syncProgress.current / syncProgress.total) * 100 : 0}%` 
                }}
              />
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* BARRA DE AÇÕES E FILTROS */}
        {/* ================================================================= */}
        <div className="px-4 py-3 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 shrink-0">
          {/* Abas de Filtro */}
          <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl text-xs font-medium">
            <button
              type="button"
              onClick={() => setActiveFilter('all')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                activeFilter === 'all'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white font-bold shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Todas ({queueItems.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveFilter('pending')}
              className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                activeFilter === 'pending'
                  ? 'bg-amber-500 text-white font-bold shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-amber-600 dark:hover:text-amber-400'
              }`}
            >
              <span>Aguardando Upload</span>
              {summary.pending > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-amber-600/60 text-[10px] font-mono">
                  {summary.pending}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => setActiveFilter('error')}
              className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                activeFilter === 'error'
                  ? 'bg-rose-500 text-white font-bold shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400'
              }`}
            >
              <span>Com Falha</span>
              {summary.error > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-rose-600/60 text-[10px] font-mono">
                  {summary.error}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => setActiveFilter('completed')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                activeFilter === 'completed'
                  ? 'bg-emerald-600 text-white font-bold shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400'
              }`}
            >
              Concluídas ({summary.completed})
            </button>
          </div>

          {/* Botões de Ação Principal */}
          <div className="flex items-center gap-2">
            {summary.completed > 0 && (
              <button
                type="button"
                onClick={handleClearCompleted}
                className="px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                title="Limpar fotos que já foram enviadas com sucesso"
              >
                Limpar Concluídas
              </button>
            )}

            {currentInspection && (
              <button
                type="button"
                onClick={handleEnqueueCurrentInspection}
                className="px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors hidden sm:block"
                title="Garante que todas as fotos da vistoria em aberto estão na fila"
              >
                Verificar Vistoria Atual
              </button>
            )}

            <button
              type="button"
              onClick={handleSyncAll}
              disabled={isSyncingAll || (summary.pending === 0 && summary.error === 0)}
              className="flex items-center gap-2 px-4 py-1.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 dark:disabled:bg-slate-800 text-white disabled:text-slate-400 shadow-xs transition-all cursor-pointer disabled:cursor-not-allowed"
            >
              <CloudUpload className={`w-4 h-4 ${isSyncingAll ? 'animate-bounce' : ''}`} />
              <span>
                {isSyncingAll 
                  ? 'Transmitindo...' 
                  : summary.pending + summary.error > 0 
                  ? `Transmitir Fila (${summary.pending + summary.error})` 
                  : 'Fila Atualizada'}
              </span>
            </button>
          </div>
        </div>

        {/* ================================================================= */}
        {/* LISTA / GRID DE FOTOS DA FILA */}
        {/* ================================================================= */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-5 space-y-3">
          {filteredItems.length === 0 ? (
            <div className="text-center py-12 px-4">
              <div className="w-16 h-16 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-400 mx-auto flex items-center justify-center mb-3">
                <Camera className="w-8 h-8" />
              </div>
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">
                Nenhuma foto encontrada neste filtro
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto mt-1">
                {activeFilter === 'pending'
                  ? 'Todas as fotos de campo já foram transmitidas ou nenhuma foto aguarda upload no momento.'
                  : activeFilter === 'error'
                  ? 'Nenhuma foto apresentou falha na transmissão.'
                  : 'A fila de sincronização do IndexedDB está vazia.'}
              </p>
              {currentInspection && (
                <button
                  type="button"
                  onClick={handleEnqueueCurrentInspection}
                  className="mt-4 px-4 py-2 rounded-xl text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 shadow-xs transition-colors"
                >
                  Sincronizar Fotos da Vistoria Atual com a Fila
                </button>
              )}
            </div>
          ) : (
            filteredItems.map(photo => {
              const isUploadingThis = processingId === photo.id || photo.status === 'uploading';
              const isPending = photo.status === 'pending';
              const isError = photo.status === 'error';
              const isCompleted = photo.status === 'completed';

              return (
                <div 
                  key={photo.id}
                  className={`bg-white dark:bg-slate-850 border rounded-2xl p-3 sm:p-4 flex flex-col sm:flex-row gap-3.5 sm:gap-4 items-start sm:items-center justify-between transition-all shadow-2xs ${
                    isPending
                      ? 'border-amber-200 dark:border-amber-900/50 bg-amber-50/20 dark:bg-amber-950/10'
                      : isError
                      ? 'border-rose-200 dark:border-rose-900/50 bg-rose-50/20 dark:bg-rose-950/10'
                      : isCompleted
                      ? 'border-emerald-200 dark:border-emerald-900/40 bg-emerald-50/10 dark:bg-emerald-950/5'
                      : 'border-slate-200 dark:border-slate-800'
                  }`}
                >
                  {/* Thumbnail e Informações */}
                  <div className="flex items-start sm:items-center gap-3.5 min-w-0 flex-1">
                    {/* Miniatura com botão de zoom */}
                    <div 
                      onClick={() => setZoomPhoto(photo)}
                      className="relative w-18 h-18 sm:w-20 sm:h-20 rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-800 shrink-0 border border-slate-200 dark:border-slate-700 cursor-pointer group shadow-2xs"
                    >
                      {photo.thumbnailUrl ? (
                        <img 
                          src={photo.thumbnailUrl} 
                          alt={photo.caption || photo.componentName} 
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-slate-400">
                          <FileImage className="w-7 h-7" />
                        </div>
                      )}
                      <div className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                        <ZoomIn className="w-5 h-5" />
                      </div>
                    </div>

                    {/* Metadados da Foto */}
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                        <span className="text-xs font-bold text-slate-900 dark:text-white truncate">
                          {photo.componentName}
                        </span>
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                          {photo.vistoriaNome}
                        </span>
                        {photo.fileSizeFormatted && (
                          <span className="text-[10px] font-mono text-slate-400 dark:text-slate-500">
                            {photo.fileSizeFormatted}
                          </span>
                        )}
                      </div>

                      <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-2">
                        {photo.caption || photo.locationDescription || 'Registro fotográfico da vistoria de campo'}
                      </p>

                      <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-400 dark:text-slate-500">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {photo.timestamp}
                        </span>
                        {photo.coordinates?.latitude && photo.coordinates?.longitude && (
                          <span className="flex items-center gap-1 text-slate-500 dark:text-slate-400 font-mono text-[10px]">
                            <MapPin className="w-3 h-3 text-emerald-500" />
                            {photo.coordinates.latitude.toFixed(5)}, {photo.coordinates.longitude.toFixed(5)}
                          </span>
                        )}
                      </div>

                      {/* Mensagem de Erro legível se falhou */}
                      {isError && photo.errorMessage && (
                        <div className="mt-1.5 p-2 rounded-lg bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900/60 text-rose-700 dark:text-rose-300 text-[11px] flex items-start gap-1.5">
                          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                          <span><strong>Motivo da retenção:</strong> {photo.errorMessage}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Status Explícito e Ações */}
                  <div className="flex items-center justify-between sm:justify-end gap-3 w-full sm:w-auto shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100 dark:border-slate-800">
                    {/* Badge de Status Explícito */}
                    <div>
                      {isPending && (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
                          <Clock className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                          <span>Aguardando Upload</span>
                        </span>
                      )}

                      {isUploadingThis && (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-blue-500/15 text-blue-800 dark:text-blue-300 border border-blue-300 dark:border-blue-800">
                          <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-600 dark:text-blue-400" />
                          <span>Transmitindo...</span>
                        </span>
                      )}

                      {isError && (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-rose-500/15 text-rose-800 dark:text-rose-300 border border-rose-300 dark:border-rose-800">
                          <AlertCircle className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
                          <span>Falha no Envio</span>
                        </span>
                      )}

                      {isCompleted && (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                          <span>Salva no Banco</span>
                        </span>
                      )}
                    </div>

                    {/* Botões de Ação Individual */}
                    <div className="flex items-center gap-1.5">
                      {(isPending || isError) && (
                        <button
                          type="button"
                          onClick={() => handleUploadSingle(photo.id)}
                          disabled={isUploadingThis}
                          className="px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xs transition-colors flex items-center gap-1 cursor-pointer disabled:opacity-50"
                          title="Enviar esta foto agora para o banco"
                        >
                          <CloudUpload className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">Enviar</span>
                        </button>
                      )}

                      {isError && (
                        <button
                          type="button"
                          onClick={() => handleRetryPhoto(photo.id)}
                          className="p-1.5 rounded-xl text-xs text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950 transition-colors"
                          title="Tentar novamente"
                        >
                          <RefreshCw className="w-4 h-4" />
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => handleRemovePhoto(photo.id)}
                        className="p-1.5 rounded-xl text-xs text-slate-400 hover:text-rose-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                        title="Remover da fila de sincronização"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* ================================================================= */}
        {/* RODAPÉ DO MODAL */}
        {/* ================================================================= */}
        <div className="px-4 sm:px-6 py-3 bg-slate-50 dark:bg-slate-950/80 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 shrink-0">
          <div className="flex items-center gap-2">
            <HardDrive className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span>
              Armazenamento seguro em <strong>IndexedDB local</strong> (não satura o limite de 5MB do navegador).
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
          >
            Fechar
          </button>
        </div>
      </div>

      {/* ================================================================= */}
      {/* MODAL DE ZOOM DA FOTO */}
      {/* ================================================================= */}
      {zoomPhoto && (
        <div 
          onClick={() => setZoomPhoto(null)}
          className="fixed inset-0 z-60 bg-black/90 backdrop-blur-md flex items-center justify-center p-3 sm:p-6"
        >
          <div 
            onClick={e => e.stopPropagation()}
            className="max-w-3xl w-full bg-slate-900 rounded-2xl overflow-hidden border border-slate-800 shadow-2xl flex flex-col"
          >
            <div className="p-3 bg-slate-950 border-b border-slate-800 flex items-center justify-between text-white text-xs">
              <span className="font-bold">{zoomPhoto.componentName} — {zoomPhoto.vistoriaNome}</span>
              <button 
                type="button" 
                onClick={() => setZoomPhoto(null)} 
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="relative bg-black flex items-center justify-center max-h-[70vh]">
              {zoomPhoto.thumbnailUrl ? (
                <img 
                  src={zoomPhoto.thumbnailUrl} 
                  alt={zoomPhoto.caption || zoomPhoto.componentName}
                  className="max-h-[70vh] w-auto object-contain mx-auto"
                />
              ) : (
                <div className="p-12 text-slate-500">Imagem não disponível para prévia</div>
              )}
            </div>
            <div className="p-3 bg-slate-950 border-t border-slate-800 text-slate-300 text-xs flex items-center justify-between">
              <div>
                <p className="font-medium text-white">{zoomPhoto.caption || 'Sem legenda'}</p>
                <p className="text-[11px] text-slate-400 mt-0.5">{zoomPhoto.timestamp} · {zoomPhoto.fileSizeFormatted}</p>
              </div>
              <div className="flex items-center gap-2">
                {zoomPhoto.status !== 'completed' ? (
                  <button
                    type="button"
                    onClick={() => {
                      handleUploadSingle(zoomPhoto.id);
                      setZoomPhoto(null);
                    }}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white"
                  >
                    Enviar Agora
                  </button>
                ) : (
                  <span className="text-emerald-400 text-xs font-semibold flex items-center gap-1">
                    <Check className="w-3.5 h-3.5" /> Sincronizada
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
