// ==============================================================================
// SISTEMA DE FILA DE SINCRONIZAÇÃO PERSISTENTE DE FOTOS - INDEXEDDB (CSB/SEMA-MT)
// Armazena fotos em fila persistente no IndexedDB do dispositivo de campo.
// Permite visualização explícita de quais fotos aguardam upload para o banco de dados.
// Resiliente a quedas de conexão em áreas rurais de Mato Grosso sem sinal de internet.
// ==============================================================================

import { InspectionData, PhotoSyncQueueItem, PhotoQueueStatus } from '../types/inspection';
import { 
  savePhotoSyncQueueItem, 
  getAllPhotoSyncQueueItems, 
  getPhotoSyncQueueItem, 
  deletePhotoSyncQueueItem,
  clearCompletedPhotoSyncQueueItems 
} from './offlineDb';
import { savePhotoBlob, getPhotoBlob, uploadPhotoToRemoteStorage } from './photoStorage';
import { getAllInspections, saveInspection } from './storage';

export const PHOTO_QUEUE_CHANGED_EVENT = 'csb:photo_queue_updated';

/**
 * Notifica a aplicação de alterações na fila de fotos para atualização de componentes reativos
 */
export function notifyPhotoQueueChanged(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(PHOTO_QUEUE_CHANGED_EVENT));
  }
}

/**
 * Inscreve um callback para ser notificado sempre que a fila sofrer alterações
 */
export function subscribePhotoQueue(callback: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(PHOTO_QUEUE_CHANGED_EVENT, callback);
  return () => {
    window.removeEventListener(PHOTO_QUEUE_CHANGED_EVENT, callback);
  };
}

/**
 * Formata bytes legíveis para celular e tablet
 */
export function formatBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return '0 KB';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Estima o tamanho em bytes de um DataURL base64 ou string
 */
function estimateDataUrlBytes(dataUrl?: string): number {
  if (!dataUrl) return 0;
  const base64Index = dataUrl.indexOf('base64,');
  if (base64Index !== -1) {
    const base64Str = dataUrl.slice(base64Index + 7);
    return Math.floor((base64Str.length * 3) / 4);
  }
  return dataUrl.length;
}

/**
 * Converte dataUrl base64 em Blob para upload
 */
function dataUrlToBlob(dataUrl: string): Blob | null {
  try {
    const parts = dataUrl.split(',');
    if (parts.length < 2) return null;
    const mimeMatch = parts[0].match(/:(.*?);/);
    const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg';
    const bstr = atob(parts[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    return new Blob([u8arr], { type: mime });
  } catch {
    return null;
  }
}

export interface EnqueuePhotoOptions {
  id: string;
  vistoriaId: string;
  vistoriaNome?: string;
  processoNumero?: string;
  componentId: string;
  componentName: string;
  locationDescription?: string;
  caption?: string;
  timestamp?: string;
  thumbnailUrl?: string;
  blob?: Blob;
  coordinates?: {
    latitude?: number;
    longitude?: number;
    accuracyMeters?: number;
    altitudeMeters?: number | null;
  };
}

/**
 * Enfileira uma foto no IndexedDB persistente para sincronização com o banco
 */
export async function enqueuePhotoForSync(opts: EnqueuePhotoOptions): Promise<PhotoSyncQueueItem> {
  const existing = await getPhotoSyncQueueItem(opts.id);
  const now = new Date().toISOString();

  let fileSizeBytes = opts.blob ? opts.blob.size : estimateDataUrlBytes(opts.thumbnailUrl);
  if (opts.blob) {
    await savePhotoBlob(opts.id, opts.blob);
  }

  const queueItem: PhotoSyncQueueItem = {
    id: opts.id,
    vistoriaId: opts.vistoriaId,
    vistoriaNome: opts.vistoriaNome || existing?.vistoriaNome || 'Barramento em Campo',
    processoNumero: opts.processoNumero || existing?.processoNumero || 'S/N',
    componentId: opts.componentId,
    componentName: opts.componentName,
    locationDescription: opts.locationDescription || existing?.locationDescription,
    caption: opts.caption || existing?.caption,
    timestamp: opts.timestamp || existing?.timestamp || new Date().toLocaleString('pt-BR'),
    enqueuedAt: existing?.enqueuedAt || now,
    status: existing && existing.status === 'completed' ? 'completed' : 'pending',
    retryCount: existing ? existing.retryCount : 0,
    errorMessage: undefined,
    fileSizeBytes: fileSizeBytes || existing?.fileSizeBytes || 0,
    fileSizeFormatted: formatBytes(fileSizeBytes || existing?.fileSizeBytes || 0),
    thumbnailUrl: opts.thumbnailUrl || existing?.thumbnailUrl,
    remoteStorageUrl: existing?.remoteStorageUrl,
    coordinates: opts.coordinates || existing?.coordinates
  };

  await savePhotoSyncQueueItem(queueItem);
  notifyPhotoQueueChanged();
  return queueItem;
}

/**
 * Varre uma vistoria e enfileira automaticamente todas as fotos que ainda não foram sincronizadas
 */
export async function enqueuePhotosFromInspection(inspection: InspectionData): Promise<number> {
  if (!inspection) return 0;
  const existingQueue = await getAllPhotoSyncQueueItems();
  const queueMap = new Map(existingQueue.map(item => [item.id, item]));

  const vistoriaNome = inspection.damIdentification?.damName || inspection.damIdentification?.propertyOrBusinessName || 'Barramento de Campo';
  const processoNumero = inspection.generalInfo?.recordNumber || 'S/N';
  let enqueuedCount = 0;

  // 1. Processa photoRecords
  if (inspection.photoRecords && inspection.photoRecords.length > 0) {
    for (const p of inspection.photoRecords) {
      const inQueue = queueMap.get(p.id);
      if (p.syncStatus !== 'sincronizado' || !inQueue) {
        if (!inQueue || inQueue.status !== 'completed') {
          await enqueuePhotoForSync({
            id: p.id,
            vistoriaId: inspection.id,
            vistoriaNome,
            processoNumero,
            componentId: p.componenteId,
            componentName: p.componenteNome,
            locationDescription: p.itemRotulo || undefined,
            caption: p.descricao,
            timestamp: p.timestampInclusao,
            thumbnailUrl: p.thumbnailPreviewUrl || p.remoteStorageUrl || undefined,
            coordinates: p.coordenadas ? {
              latitude: p.coordenadas.latitude,
              longitude: p.coordenadas.longitude,
              accuracyMeters: p.coordenadas.acuraciaMetros || undefined,
              altitudeMeters: p.coordenadas.altitudeEstimadaDispositivo || null
            } : undefined
          });
          enqueuedCount++;
        }
      }
    }
  }

  // 2. Processa legacy photos
  if (inspection.photos && inspection.photos.length > 0) {
    for (const p of inspection.photos) {
      const inQueue = queueMap.get(p.id);
      if (p.syncStatus !== 'synced' || !inQueue) {
        if (!inQueue || inQueue.status !== 'completed') {
          await enqueuePhotoForSync({
            id: p.id,
            vistoriaId: inspection.id,
            vistoriaNome,
            processoNumero,
            componentId: p.componentId,
            componentName: p.componentName,
            locationDescription: p.locationDescription,
            caption: p.caption,
            timestamp: p.timestamp,
            thumbnailUrl: p.dataUrl,
            coordinates: p.latitude !== undefined && p.longitude !== undefined ? {
              latitude: p.latitude,
              longitude: p.longitude,
              accuracyMeters: p.accuracyMeters
            } : undefined
          });
          enqueuedCount++;
        }
      }
    }
  }

  return enqueuedCount;
}

/**
 * Retorna todos os itens da fila ordenados com prioridade para pendentes e com erro
 */
export async function getPhotoSyncQueue(): Promise<PhotoSyncQueueItem[]> {
  const all = await getAllPhotoSyncQueueItems();
  
  // Ordem de prioridade: em envio -> com erro -> pendente -> concluído
  const priorityMap: Record<PhotoQueueStatus, number> = {
    uploading: 1,
    error: 2,
    pending: 3,
    completed: 4
  };

  return all.sort((a, b) => {
    const prioA = priorityMap[a.status] || 5;
    const prioB = priorityMap[b.status] || 5;
    if (prioA !== prioB) return prioA - prioB;
    return new Date(b.enqueuedAt).getTime() - new Date(a.enqueuedAt).getTime();
  });
}

/**
 * Retorna estatísticas consolidadas da fila de fotos
 */
export async function getPhotoQueueSummary(): Promise<{
  total: number;
  pending: number;
  uploading: number;
  error: number;
  completed: number;
  totalBytes: number;
  totalFormatted: string;
}> {
  const items = await getAllPhotoSyncQueueItems();
  let pending = 0;
  let uploading = 0;
  let error = 0;
  let completed = 0;
  let totalBytes = 0;

  items.forEach(item => {
    if (item.status === 'pending') pending++;
    else if (item.status === 'uploading') uploading++;
    else if (item.status === 'error') error++;
    else if (item.status === 'completed') completed++;

    totalBytes += item.fileSizeBytes || 0;
  });

  return {
    total: items.length,
    pending,
    uploading,
    error,
    completed,
    totalBytes,
    totalFormatted: formatBytes(totalBytes)
  };
}

/**
 * Transmite uma foto específica da fila para o banco de dados remoto
 */
export async function uploadSingleQueuePhoto(
  photoId: string,
  onStateUpdate?: (item: PhotoSyncQueueItem) => void
): Promise<{ success: boolean; remoteUrl?: string; error?: string }> {
  const item = await getPhotoSyncQueueItem(photoId);
  if (!item) {
    return { success: false, error: 'Foto não encontrada na fila de sincronização.' };
  }

  // 1. Marca como em upload
  const uploadingItem: PhotoSyncQueueItem = {
    ...item,
    status: 'uploading',
    lastAttemptAt: new Date().toISOString()
  };
  await savePhotoSyncQueueItem(uploadingItem);
  notifyPhotoQueueChanged();
  if (onStateUpdate) onStateUpdate(uploadingItem);

  try {
    // 2. Busca o Blob da foto no IndexedDB
    let blob = await getPhotoBlob(photoId);

    // Se o Blob não estiver no store binário mas temos thumbnailUrl em dataUrl, converte
    if (!blob && item.thumbnailUrl && item.thumbnailUrl.startsWith('data:')) {
      blob = dataUrlToBlob(item.thumbnailUrl);
      if (blob) {
        await savePhotoBlob(photoId, blob);
      }
    }

    if (!blob) {
      const errorMsg = 'Arquivo de imagem binária não localizado no dispositivo. Imagem pode ter sido removida.';
      const errItem: PhotoSyncQueueItem = {
        ...uploadingItem,
        status: 'error',
        errorMessage: errorMsg,
        retryCount: (uploadingItem.retryCount || 0) + 1
      };
      await savePhotoSyncQueueItem(errItem);
      notifyPhotoQueueChanged();
      if (onStateUpdate) onStateUpdate(errItem);
      return { success: false, error: errorMsg };
    }

    // 3. Executa o upload para o Supabase Storage
    const uploadResult = await uploadPhotoToRemoteStorage(item.vistoriaId, item.id, blob);

    if (uploadResult.success && uploadResult.remoteUrl) {
      // 4. Marca como concluído
      const successItem: PhotoSyncQueueItem = {
        ...uploadingItem,
        status: 'completed',
        remoteStorageUrl: uploadResult.remoteUrl,
        errorMessage: undefined
      };
      await savePhotoSyncQueueItem(successItem);

      // Atualiza também na vistoria salva correspondente no storage
      try {
        const allInspections = getAllInspections();
        const insp = allInspections.find(i => i.id === item.vistoriaId);
        if (insp) {
          let changed = false;
          const updatedPhotos = (insp.photos || []).map(p => {
            if (p.id === photoId) {
              changed = true;
              return { ...p, syncStatus: 'synced' as const, uploadedAt: new Date().toISOString() };
            }
            return p;
          });
          const updatedRecords = (insp.photoRecords || []).map(p => {
            if (p.id === photoId) {
              changed = true;
              return { 
                ...p, 
                syncStatus: 'sincronizado' as const, 
                remoteStorageUrl: uploadResult.remoteUrl,
                syncError: undefined 
              };
            }
            return p;
          });
          if (changed) {
            saveInspection({
              ...insp,
              photos: updatedPhotos,
              photoRecords: updatedRecords
            });
          }
        }
      } catch (saveErr) {
        console.warn('[PhotoQueue] Aviso ao atualizar vistoria com URL remota:', saveErr);
      }

      notifyPhotoQueueChanged();
      if (onStateUpdate) onStateUpdate(successItem);
      return { success: true, remoteUrl: uploadResult.remoteUrl };
    } else {
      // Falha no upload
      const errItem: PhotoSyncQueueItem = {
        ...uploadingItem,
        status: 'error',
        errorMessage: uploadResult.error || 'Falha de transmissão com o servidor.',
        retryCount: (uploadingItem.retryCount || 0) + 1
      };
      await savePhotoSyncQueueItem(errItem);
      notifyPhotoQueueChanged();
      if (onStateUpdate) onStateUpdate(errItem);
      return { success: false, error: uploadResult.error };
    }
  } catch (err: any) {
    const errItem: PhotoSyncQueueItem = {
      ...uploadingItem,
      status: 'error',
      errorMessage: err.message || 'Erro inesperado no envio.',
      retryCount: (uploadingItem.retryCount || 0) + 1
    };
    await savePhotoSyncQueueItem(errItem);
    notifyPhotoQueueChanged();
    if (onStateUpdate) onStateUpdate(errItem);
    return { success: false, error: err.message };
  }
}

/**
 * Processa todas as fotos que estão pendentes ou com erro na fila sequencialmente
 */
export async function processAllPendingPhotoQueue(
  onProgress?: (progress: {
    current: number;
    total: number;
    currentPhoto?: PhotoSyncQueueItem;
    message: string;
  }) => void
): Promise<{ total: number; succeeded: number; failed: number }> {
  const queue = await getAllPhotoSyncQueueItems();
  const toProcess = queue.filter(item => item.status === 'pending' || item.status === 'error');

  if (toProcess.length === 0) {
    return { total: 0, succeeded: 0, failed: 0 };
  }

  let succeeded = 0;
  let failed = 0;

  for (let i = 0; i < toProcess.length; i++) {
    const item = toProcess[i];
    if (onProgress) {
      onProgress({
        current: i + 1,
        total: toProcess.length,
        currentPhoto: item,
        message: `Transmitindo foto ${i + 1} de ${toProcess.length} (${item.componentName})...`
      });
    }

    const res = await uploadSingleQueuePhoto(item.id);
    if (res.success) {
      succeeded++;
    } else {
      failed++;
    }
  }

  if (onProgress) {
    onProgress({
      current: toProcess.length,
      total: toProcess.length,
      message: `Finalizado: ${succeeded} enviada(s), ${failed} com pendência.`
    });
  }

  return {
    total: toProcess.length,
    succeeded,
    failed
  };
}

/**
 * Re-enfileira uma foto que falhou para tentar novamente
 */
export async function reEnqueuePhoto(id: string): Promise<void> {
  const item = await getPhotoSyncQueueItem(id);
  if (item) {
    const updated: PhotoSyncQueueItem = {
      ...item,
      status: 'pending',
      errorMessage: undefined
    };
    await savePhotoSyncQueueItem(updated);
    notifyPhotoQueueChanged();
  }
}

/**
 * Remove uma foto da fila de sincronização
 */
export async function removePhotoFromQueue(id: string): Promise<void> {
  await deletePhotoSyncQueueItem(id);
  notifyPhotoQueueChanged();
}

/**
 * Remove da fila todos os itens já concluídos/sincronizados
 */
export async function clearCompletedPhotosFromQueue(): Promise<number> {
  const count = await clearCompletedPhotoSyncQueueItems();
  notifyPhotoQueueChanged();
  return count;
}
