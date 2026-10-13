// ==============================================================================
// MÓDULO DE BANCO DE DADOS OFFLINE RESILIENTE - INDEXEDDB (CSB/SEMA-MT)
// Garante armazenamento persistente de alta capacidade em celulares e tablets,
// superando a limitação de 5MB do localStorage em navegadores móveis e
// prevenindo perda de dados ou fotos durante vistorias em áreas rurais remotas.
// ==============================================================================

import { InspectionData, PhotoSyncQueueItem } from '../types/inspection';
import { sanitizeDeepObject } from '../utils/securityCrypto';

const DB_NAME = 'FiscalizaCSB_OfflineStore';
const DB_VERSION = 3;
export const STORE_INSPECTIONS = 'inspections';
export const STORE_PHOTOS = 'photo_blobs';
export const STORE_SYNC_QUEUE = 'photo_sync_queue';

let dbInstance: IDBDatabase | null = null;

export function getOfflineDb(): Promise<IDBDatabase> {
  if (typeof window === 'undefined' || typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('IndexedDB não suportado neste ambiente'));
  }

  if (dbInstance) return Promise.resolve(dbInstance);

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = event => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_PHOTOS)) {
        db.createObjectStore(STORE_PHOTOS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_INSPECTIONS)) {
        db.createObjectStore(STORE_INSPECTIONS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_SYNC_QUEUE)) {
        const queueStore = db.createObjectStore(STORE_SYNC_QUEUE, { keyPath: 'id' });
        queueStore.createIndex('vistoriaId', 'vistoriaId', { unique: false });
        queueStore.createIndex('status', 'status', { unique: false });
        queueStore.createIndex('enqueuedAt', 'enqueuedAt', { unique: false });
      }
    };

    request.onsuccess = event => {
      dbInstance = (event.target as IDBOpenDBRequest).result;
      resolve(dbInstance);
    };

    request.onerror = event => {
      console.warn('[OfflineDB] Erro ao abrir IndexedDB:', (event.target as IDBOpenDBRequest).error);
      reject((event.target as IDBOpenDBRequest).error);
    };
  });
}

/**
 * Salva ou atualiza uma vistoria completa no IndexedDB
 */
export async function saveInspectionToIndexedDb(inspection: InspectionData): Promise<void> {
  try {
    const db = await getOfflineDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_INSPECTIONS, 'readwrite');
      const store = tx.objectStore(STORE_INSPECTIONS);
      const request = store.put(sanitizeDeepObject(inspection));

      request.onsuccess = () => resolve();
      request.onerror = () => {
        console.warn('[OfflineDB] Erro ao salvar vistoria no IDB:', request.error);
        reject(request.error);
      };
    });
  } catch (err) {
    console.warn('[OfflineDB] Fallback para storage síncrono:', err);
  }
}

/**
 * Recupera todas as vistorias armazenadas no IndexedDB
 */
export async function getAllInspectionsFromIndexedDb(): Promise<InspectionData[]> {
  try {
    const db = await getOfflineDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_INSPECTIONS, 'readonly');
      const store = tx.objectStore(STORE_INSPECTIONS);
      const request = store.getAll();

      request.onsuccess = () => {
        const results = request.result || [];
        resolve(results.map(item => sanitizeDeepObject(item) as InspectionData));
      };
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.warn('[OfflineDB] Não foi possível carregar do IDB:', err);
    return [];
  }
}

/**
 * Remove uma vistoria do IndexedDB
 */
export async function deleteInspectionFromIndexedDb(id: string): Promise<void> {
  try {
    const db = await getOfflineDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_INSPECTIONS, 'readwrite');
      const store = tx.objectStore(STORE_INSPECTIONS);
      const request = store.delete(id);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.warn('[OfflineDB] Erro ao deletar do IDB:', err);
  }
}

/**
 * Estima o espaço de armazenamento do dispositivo móvel/tablet
 */
export async function getStorageQuotaEstimate(): Promise<{
  usedMb: number;
  quotaMb: number;
  percentageUsed: number;
  isAvailable: boolean;
}> {
  if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.estimate) {
    try {
      const estimate = await navigator.storage.estimate();
      const usedBytes = estimate.usage || 0;
      const quotaBytes = estimate.quota || 1;
      const usedMb = Math.round((usedBytes / (1024 * 1024)) * 10) / 10;
      const quotaMb = Math.round((quotaBytes / (1024 * 1024)) * 10) / 10;
      const percentageUsed = Math.min(100, Math.round((usedBytes / quotaBytes) * 1000) / 10);
      return { usedMb, quotaMb, percentageUsed, isAvailable: true };
    } catch {
      // fallback
    }
  }
  return { usedMb: 0, quotaMb: 0, percentageUsed: 0, isAvailable: false };
}

/**
 * Salva ou atualiza um item na fila de sincronização de fotos no IndexedDB
 */
export async function savePhotoSyncQueueItem(item: PhotoSyncQueueItem): Promise<void> {
  try {
    const db = await getOfflineDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_SYNC_QUEUE, 'readwrite');
      const store = tx.objectStore(STORE_SYNC_QUEUE);
      const request = store.put(sanitizeDeepObject(item));

      request.onsuccess = () => resolve();
      request.onerror = () => {
        console.warn('[OfflineDB] Erro ao salvar na fila de fotos:', request.error);
        reject(request.error);
      };
    });
  } catch (err) {
    console.warn('[OfflineDB] Falha ao gravar item na fila de fotos:', err);
  }
}

/**
 * Recupera todos os itens da fila de sincronização de fotos do IndexedDB
 */
export async function getAllPhotoSyncQueueItems(): Promise<PhotoSyncQueueItem[]> {
  try {
    const db = await getOfflineDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_SYNC_QUEUE, 'readonly');
      const store = tx.objectStore(STORE_SYNC_QUEUE);
      const request = store.getAll();

      request.onsuccess = () => {
        const results = request.result || [];
        resolve(results.map(item => sanitizeDeepObject(item) as PhotoSyncQueueItem));
      };
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.warn('[OfflineDB] Erro ao listar itens da fila de fotos:', err);
    return [];
  }
}

/**
 * Obtém um item específico da fila pelo ID da foto
 */
export async function getPhotoSyncQueueItem(id: string): Promise<PhotoSyncQueueItem | null> {
  try {
    const db = await getOfflineDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_SYNC_QUEUE, 'readonly');
      const store = tx.objectStore(STORE_SYNC_QUEUE);
      const request = store.get(id);

      request.onsuccess = () => {
        if (request.result) {
          resolve(sanitizeDeepObject(request.result) as PhotoSyncQueueItem);
        } else {
          resolve(null);
        }
      };
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.warn('[OfflineDB] Erro ao buscar item da fila:', err);
    return null;
  }
}

/**
 * Remove um item da fila de sincronização de fotos
 */
export async function deletePhotoSyncQueueItem(id: string): Promise<void> {
  try {
    const db = await getOfflineDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_SYNC_QUEUE, 'readwrite');
      const store = tx.objectStore(STORE_SYNC_QUEUE);
      const request = store.delete(id);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.warn('[OfflineDB] Erro ao deletar item da fila:', err);
  }
}

/**
 * Remove itens já concluídos/sincronizados da fila
 */
export async function clearCompletedPhotoSyncQueueItems(): Promise<number> {
  try {
    const all = await getAllPhotoSyncQueueItems();
    const completed = all.filter(item => item.status === 'completed');
    const db = await getOfflineDb();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_SYNC_QUEUE, 'readwrite');
      const store = tx.objectStore(STORE_SYNC_QUEUE);
      let count = 0;

      completed.forEach(item => {
        store.delete(item.id);
        count++;
      });

      tx.oncomplete = () => resolve(count);
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('[OfflineDB] Erro ao limpar concluídos da fila:', err);
    return 0;
  }
}
