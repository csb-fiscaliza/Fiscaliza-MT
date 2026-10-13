// ==============================================================================
// ARMAZENAMENTO APROPRIADO DE FOTOS DE CAMPO (IndexedDB + Supabase Storage)
// Não armazena base64 volumoso no registro principal / JSON da vistoria
// ==============================================================================

import { supabase, isSupabaseConfigured } from './supabase';
import { PhotoRecord } from '../types/inspection';
import { getOfflineDb, STORE_PHOTOS } from './offlineDb';

const STORE_NAME = STORE_PHOTOS;

/**
 * Salva o arquivo binário comprimido no IndexedDB local seguro
 */
export async function savePhotoBlob(id: string, blob: Blob): Promise<void> {
  const db = await getOfflineDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.put({ id, blob, mimeType: blob.type, updatedAt: Date.now() });

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Recupera o Blob binário armazenado localmente
 */
export async function getPhotoBlob(id: string): Promise<Blob | null> {
  const db = await getOfflineDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(id);

    request.onsuccess = () => {
      if (request.result?.blob) {
        resolve(request.result.blob);
      } else {
        resolve(null);
      }
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * Retorna uma URL temporária em memória para renderização na interface
 */
export async function getPhotoObjectUrl(id: string): Promise<string | null> {
  const blob = await getPhotoBlob(id);
  if (!blob) return null;
  return URL.createObjectURL(blob);
}

/**
 * Remove a foto do armazenamento local
 */
export async function deletePhotoBlob(id: string): Promise<void> {
  const db = await getOfflineDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.delete(id);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Tenta enviar o arquivo da foto para o Supabase Storage
 * Trata falhas de rede e retornos para sincronização posterior
 */
export async function uploadPhotoToRemoteStorage(
  vistoriaId: string,
  photoId: string,
  blob: Blob
): Promise<{ success: boolean; remoteUrl?: string; error?: string }> {
  if (!isSupabaseConfigured() || !supabase) {
    return {
      success: false,
      error: 'Supabase Storage não conectado. Imagem salva localmente no aparelho.'
    };
  }

  try {
    const filePath = `${vistoriaId}/${photoId}.jpg`;
    const { data, error } = await supabase.storage
      .from('vistorias-fotos')
      .upload(filePath, blob, {
        contentType: 'image/jpeg',
        upsert: true
      });

    if (error) {
      return { success: false, error: error.message };
    }

    const { data: publicUrlData } = supabase.storage
      .from('vistorias-fotos')
      .getPublicUrl(filePath);

    return {
      success: true,
      remoteUrl: publicUrlData.publicUrl
    };
  } catch (err: any) {
    return {
      success: false,
      error: err.message || 'Falha de conexão com o servidor remoto.'
    };
  }
}
