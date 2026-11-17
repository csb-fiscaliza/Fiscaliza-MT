import React, { useState, useRef, useEffect } from 'react';
import { 
  Camera, 
  Upload, 
  Trash2, 
  X, 
  ArrowLeft, 
  ArrowRight,
  Plus,
  Image as ImageIcon,
  Clock,
  MapPin,
  RefreshCw,
  CloudCheck,
  AlertTriangle,
  CloudUpload
} from 'lucide-react';
import { DAM_COMPONENTS } from '../data/damComponents';
import { InspectionData, PhotoRecord, PhotoSyncStatus } from '../types/inspection';
import { 
  savePhotoBlob, 
  getPhotoBlob, 
  getPhotoObjectUrl, 
  deletePhotoBlob, 
  uploadPhotoToRemoteStorage 
} from '../services/photoStorage';
import { 
  enqueuePhotoForSync, 
  enqueuePhotosFromInspection, 
  getPhotoQueueSummary, 
  subscribePhotoQueue
} from '../services/photoSyncQueueService';
import { PhotoSyncQueueModal } from './PhotoSyncQueueModal';
import { formatGmsString } from '../utils/geoCoordinates';
import { OFFICIAL_DAM_COMPONENTS_OPTIONS, getComponentNameById } from '../utils/photoCaptureUtils';

interface Props {
  data: InspectionData;
  onChange: (updater: (prev: InspectionData) => InspectionData) => void;
  onNext: () => void;
  onPrev: () => void;
  initialComponentFilter?: string | null;
}

export const PhotoManagerStep: React.FC<Props> = ({
  data,
  onChange,
  onNext,
  onPrev,
  initialComponentFilter
}) => {
  const [filterComponent, setFilterComponent] = useState<string>(initialComponentFilter || 'todos');
  const [zoomPhoto, setZoomPhoto] = useState<PhotoRecord | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isRetryingSync, setIsRetryingSync] = useState(false);
  const [showQueueModal, setShowQueueModal] = useState(false);
  const [queueSummary, setQueueSummary] = useState({
    total: 0,
    pending: 0,
    uploading: 0,
    error: 0,
    completed: 0,
    totalBytes: 0,
    totalFormatted: '0 KB'
  });

  // Form de inclusão
  const [selectedComponentId, setSelectedComponentId] = useState<string>(
    initialComponentFilter && initialComponentFilter !== 'todos' ? initialComponentFilter : DAM_COMPONENTS[0].id
  );
  const [selectedItemId, setSelectedItemId] = useState<string>('');
  const [caption, setCaption] = useState('');
  const [includeGpsOnPhoto, setIncludeGpsOnPhoto] = useState(true);

  // Preview URLs em memória para evitar carregar base64 pesado
  const [photoObjectUrls, setPhotoObjectUrls] = useState<Record<string, string>>({});
  const createdObjectUrlsRef = useRef<Set<string>>(new Set());

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  // Lista normalizada de fotos (garante photoRecords)
  const photoRecords: PhotoRecord[] = data.photoRecords || (data.photos || []).map(p => ({
    id: p.id,
    vistoriaId: data.id,
    componenteId: p.componentId,
    componenteNome: p.componentName,
    descricao: p.caption,
    timestampInclusao: p.timestamp,
    syncStatus: (
      (p.syncStatus as string) === 'synced' || (p.syncStatus as string) === 'sincronizado'
        ? 'sincronizado'
        : p.syncStatus === 'error'
        ? 'falha_envio'
        : 'pendente_sincronizacao'
    ) as PhotoSyncStatus,
    thumbnailPreviewUrl: p.dataUrl
  }));

  const photoSignature = photoRecords
    .map(p => `${p.id}:${p.remoteStorageUrl || ''}:${p.thumbnailPreviewUrl ? '1' : '0'}`)
    .join('|');

  // Revogar todas as URLs de blob alocadas ao desmontar
  useEffect(() => {
    const trackedUrls = createdObjectUrlsRef.current;
    return () => {
      trackedUrls.forEach(url => {
        try {
          URL.revokeObjectURL(url);
        } catch {
          // ignore
        }
      });
      trackedUrls.clear();
    };
  }, []);

  // Retomada do rascunho: carrega Blob do IndexedDB como ObjectURL
  useEffect(() => {
    let isMounted = true;
    const newlyCreatedUrls: string[] = [];

    async function loadPreviews() {
      const urlMap: Record<string, string> = {};
      for (const photo of photoRecords) {
        if (photo.thumbnailPreviewUrl && photo.thumbnailPreviewUrl.startsWith('data:')) {
          urlMap[photo.id] = photo.thumbnailPreviewUrl;
        } else if (photo.remoteStorageUrl) {
          urlMap[photo.id] = photo.remoteStorageUrl;
        } else {
          const url = await getPhotoObjectUrl(photo.id);
          if (url) {
            if (isMounted) {
              urlMap[photo.id] = url;
              if (url.startsWith('blob:')) {
                newlyCreatedUrls.push(url);
                createdObjectUrlsRef.current.add(url);
              }
            } else if (url.startsWith('blob:')) {
              try {
                URL.revokeObjectURL(url);
              } catch {
                // ignore
              }
            }
          }
        }
      }
      if (isMounted) {
        const activeValues = new Set(Object.values(urlMap));
        createdObjectUrlsRef.current.forEach(oldUrl => {
          if (!activeValues.has(oldUrl)) {
            try {
              URL.revokeObjectURL(oldUrl);
            } catch {
              // ignore
            }
            createdObjectUrlsRef.current.delete(oldUrl);
          }
        });
        setPhotoObjectUrls(urlMap);
      }
    }

    loadPreviews();

    return () => {
      isMounted = false;
      newlyCreatedUrls.forEach(url => {
        if (createdObjectUrlsRef.current.has(url)) {
          try {
            URL.revokeObjectURL(url);
          } catch {
            // ignore
          }
          createdObjectUrlsRef.current.delete(url);
        }
      });
    };
  }, [photoSignature]);

  // Monitora a fila de fotos do IndexedDB em tempo real e auto-enfileira fotos desta vistoria
  useEffect(() => {
    let active = true;

    const updateStats = async () => {
      const sum = await getPhotoQueueSummary();
      if (active) setQueueSummary(sum);
    };

    updateStats();
    // Garante que fotos desta vistoria estejam registradas na fila do IndexedDB
    enqueuePhotosFromInspection(data).then(() => {
      if (active) updateStats();
    });

    const unsubscribe = subscribePhotoQueue(() => {
      if (active) updateStats();
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [data.id, photoRecords.length]);

  // Compressão no cliente em Canvas para gerar Blob leve (JPEG)
  const compressToBlob = (file: File): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = event => {
        const img = new Image();
        img.onload = () => {
          const maxDim = 1280;
          let width = img.width;
          let height = img.height;

          if (width > maxDim || height > maxDim) {
            if (width > height) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            } else {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(file);
            return;
          }

          ctx.drawImage(img, 0, 0, width, height);
          canvas.toBlob(
            blob => {
              if (blob) resolve(blob);
              else resolve(file);
            },
            'image/jpeg',
            0.78
          );
        };
        img.onerror = reject;
        img.src = event.target?.result as string;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  // Obter coordenadas para a foto se solicitado
  const getCurrentPhotoLocation = (): Promise<{ latitude: number; longitude: number; acuraciaMetros?: number; altitudeEstimadaDispositivo?: number } | null> => {
    if (!includeGpsOnPhoto || !navigator.geolocation) {
      return Promise.resolve(null);
    }
    return new Promise(resolve => {
      navigator.geolocation.getCurrentPosition(
        pos => {
          resolve({
            latitude: parseFloat(pos.coords.latitude.toFixed(6)),
            longitude: parseFloat(pos.coords.longitude.toFixed(6)),
            acuraciaMetros: pos.coords.accuracy ? Math.round(pos.coords.accuracy * 10) / 10 : undefined,
            altitudeEstimadaDispositivo: pos.coords.altitude !== null ? Math.round(pos.coords.altitude * 10) / 10 : undefined
          });
        },
        () => resolve(null),
        { enableHighAccuracy: true, timeout: 6000, maximumAge: 10000 }
      );
    });
  };

  const handleFilesAdded = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setIsProcessing(true);

    try {
      const compObj = DAM_COMPONENTS.find(c => c.id === selectedComponentId) || DAM_COMPONENTS[0];
      const selectedAnomalyObj = compObj.commonAnomalies.find(a => a.id === selectedItemId);
      const photoCoords = await getCurrentPhotoLocation();
      const newRecords: PhotoRecord[] = [];
      const updatedObjectUrls = { ...photoObjectUrls };

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const compressedBlob = await compressToBlob(file);
        const photoId = `foto-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

        // 1. Armazenar no IndexedDB local seguro (não polui o JSON/localStorage)
        await savePhotoBlob(photoId, compressedBlob);
        const objectUrl = URL.createObjectURL(compressedBlob);
        createdObjectUrlsRef.current.add(objectUrl);
        updatedObjectUrls[photoId] = objectUrl;

        // 2. Registrar na fila persistente de sincronização do IndexedDB
        await enqueuePhotoForSync({
          id: photoId,
          vistoriaId: data.id,
          vistoriaNome: data.damIdentification?.damName || 'Barramento de Campo',
          processoNumero: data.generalInfo?.recordNumber || 'S/N',
          componentId: compObj.id,
          componentName: compObj.name,
          locationDescription: selectedAnomalyObj ? selectedAnomalyObj.label : undefined,
          caption: caption.trim() || undefined,
          timestamp: new Date().toLocaleString('pt-BR'),
          thumbnailUrl: objectUrl,
          blob: compressedBlob,
          coordinates: photoCoords ? {
            latitude: photoCoords.latitude,
            longitude: photoCoords.longitude,
            accuracyMeters: photoCoords.acuraciaMetros || undefined,
            altitudeMeters: photoCoords.altitudeEstimadaDispositivo || null
          } : undefined
        });

        // 3. Tentar upload remoto no Supabase Storage em segundo plano se houver conexão
        const uploadResult = await uploadPhotoToRemoteStorage(data.id, photoId, compressedBlob);

        const record: PhotoRecord = {
          id: photoId,
          vistoriaId: data.id,
          componenteId: compObj.id,
          componenteNome: compObj.name,
          itemId: selectedItemId || null,
          itemRotulo: selectedAnomalyObj ? selectedAnomalyObj.label : null,
          descricao: caption.trim() || undefined,
          timestampInclusao: new Date().toLocaleString('pt-BR'),
          coordenadas: photoCoords,
          syncStatus: uploadResult.success ? 'sincronizado' : 'pendente_sincronizacao',
          syncError: uploadResult.error,
          remoteStorageUrl: uploadResult.remoteUrl,
          thumbnailPreviewUrl: objectUrl
        };

        newRecords.push(record);
      }

      setPhotoObjectUrls(updatedObjectUrls);

      // Atualiza o estado da vistoria
      onChange(prev => {
        const updatedPhotoRecords = [...(prev.photoRecords || []), ...newRecords];
        // Mantém compatibilidade com minutas e relatórios
        const legacyPhotos = updatedPhotoRecords.map(p => ({
          id: p.id,
          dataUrl: updatedObjectUrls[p.id] || p.remoteStorageUrl || '',
          componentId: p.componenteId,
          componentName: p.componenteNome,
          locationDescription: p.itemRotulo || 'Geral do componente',
          caption: p.descricao || `Registro de ${p.componenteNome}`,
          timestamp: p.timestampInclusao,
          latitude: p.coordenadas?.latitude,
          longitude: p.coordenadas?.longitude,
          accuracyMeters: p.coordenadas?.acuraciaMetros ?? undefined,
          syncStatus:
            p.syncStatus === 'sincronizado'
              ? ('synced' as const)
              : p.syncStatus === 'falha_envio'
              ? ('error' as const)
              : ('local' as const)
        }));

        return {
          ...prev,
          photoRecords: updatedPhotoRecords,
          photos: legacyPhotos
        };
      });

      setCaption('');
      setSelectedItemId('');
    } catch (err) {
      console.error('Erro ao processar foto:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDeletePhoto = async (photoId: string) => {
    await deletePhotoBlob(photoId);

    const existingUrl = photoObjectUrls[photoId];
    if (existingUrl && existingUrl.startsWith('blob:')) {
      try {
        URL.revokeObjectURL(existingUrl);
      } catch {
        // ignore
      }
      createdObjectUrlsRef.current.delete(existingUrl);
    }

    onChange(prev => {
      const updatedRecords = (prev.photoRecords || []).filter(p => p.id !== photoId);
      const updatedLegacy = (prev.photos || []).filter(p => p.id !== photoId);
      return {
        ...prev,
        photoRecords: updatedRecords,
        photos: updatedLegacy
      };
    });

    if (zoomPhoto?.id === photoId) setZoomPhoto(null);
  };

  const handleReassignComponent = (photoId: string, newComponentId: string) => {
    const newName = getComponentNameById(newComponentId);
    onChange(prev => {
      const updatedPhotos = (prev.photos || []).map(p => {
        if (p.id === photoId) {
          return {
            ...p,
            componentId: newComponentId,
            componentName: newName,
            locationDescription: newComponentId === 'geral' ? 'Visão Geral' : `Componente: ${newName}`
          };
        }
        return p;
      });
      const updatedRecords = (prev.photoRecords || []).map(p => {
        if (p.id === photoId) {
          return {
            ...p,
            componenteId: newComponentId,
            componenteNome: newName
          };
        }
        return p;
      });
      return {
        ...prev,
        photos: updatedPhotos,
        photoRecords: updatedRecords
      };
    });
  };

  // Repetição de envio de fotos pendentes de sincronização
  const handleRetrySync = async () => {
    setIsRetryingSync(true);
    try {
      const updatedList = [...photoRecords];

      for (let i = 0; i < updatedList.length; i++) {
        const p = updatedList[i];
        if (p.syncStatus !== 'sincronizado') {
          const blob = await getPhotoBlob(p.id);
          if (blob) {
            const res = await uploadPhotoToRemoteStorage(data.id, p.id, blob);
            if (res.success) {
              updatedList[i] = {
                ...p,
                syncStatus: 'sincronizado',
                syncError: undefined,
                remoteStorageUrl: res.remoteUrl
              };
            } else {
              updatedList[i] = {
                ...p,
                syncStatus: 'falha_envio',
                syncError: res.error
              };
            }
          }
        }
      }

      const statusMap = new Map(updatedList.map(rec => [rec.id, rec]));
      onChange(prev => ({
        ...prev,
        photoRecords: updatedList,
        photos: (prev.photos || []).map(legacy => {
          const updatedRec = statusMap.get(legacy.id);
          if (!updatedRec) return legacy;
          return {
            ...legacy,
            syncStatus:
              updatedRec.syncStatus === 'sincronizado'
                ? ('synced' as const)
                : updatedRec.syncStatus === 'falha_envio'
                ? ('error' as const)
                : legacy.syncStatus,
            dataUrl: updatedRec.remoteStorageUrl || legacy.dataUrl
          };
        })
      }));
    } finally {
      setIsRetryingSync(false);
    }
  };

  const activeCompDef = DAM_COMPONENTS.find(c => c.id === selectedComponentId) || DAM_COMPONENTS[0];
  const pendingCount = photoRecords.filter(p => p.syncStatus !== 'sincronizado').length;

  const filteredPhotos = filterComponent === 'todos'
    ? photoRecords
    : photoRecords.filter(p => p.componenteId === filterComponent);

  return (
    <div className="space-y-6 pb-20 sm:pb-12">
      {/* Banner Superior com Status de Sincronização e Fila do IndexedDB */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 shadow-xs flex flex-wrap items-center justify-between gap-4 transition-colors">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100 uppercase tracking-wide flex items-center gap-2">
              <Camera className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              <span>Registro Fotográfico de Campo</span>
            </h2>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 uppercase tracking-wider">
              IndexedDB Persistente
            </span>
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-400">
            Armazenamento de alta capacidade no dispositivo. Fila de upload controlada e monitorada com garantia de integridade.
          </p>
        </div>

        {/* Status da Fila e Botão para Abrir a Central */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => setShowQueueModal(true)}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all shadow-2xs border bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 border-slate-300 dark:border-slate-700 cursor-pointer"
            title="Abrir Central da Fila de Sincronização de Fotos"
          >
            <CloudUpload className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span>Fila de Fotos IndexedDB</span>
            {queueSummary.pending + queueSummary.error > 0 ? (
              <span className="px-2 py-0.5 rounded-full bg-amber-500 text-white text-[10px] font-bold animate-pulse">
                {queueSummary.pending + queueSummary.error} aguardando upload
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded-full bg-emerald-600 text-white text-[10px] font-bold">
                Tudo em dia
              </span>
            )}
          </button>

          {pendingCount > 0 ? (
            <button
              type="button"
              onClick={handleRetrySync}
              disabled={isRetryingSync}
              className="min-h-[38px] px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shadow-2xs transition-all"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRetryingSync ? 'animate-spin' : ''}`} />
              <span>{isRetryingSync ? 'Transmitindo...' : `Enviar Pendentes (${pendingCount})`}</span>
            </button>
          ) : (
            <span className="px-3 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 text-xs font-semibold flex items-center gap-1.5">
              <CloudCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>Fotos sincronizadas na nuvem</span>
            </span>
          )}
        </div>
      </div>

      {/* Bloco de Captura e Associação */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 shadow-xs space-y-4 transition-colors">
        <h3 className="text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
          <Plus className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          <span>Nova Captura Fotográfica</span>
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Componente Associado *
            </label>
            <select
              value={selectedComponentId}
              onChange={e => {
                setSelectedComponentId(e.target.value);
                setSelectedItemId('');
              }}
              className="w-full text-xs sm:text-sm min-h-[44px] px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950/70 text-slate-800 dark:text-slate-100"
            >
              {DAM_COMPONENTS.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Item / Anomalia Específica (Opcional)
            </label>
            <select
              value={selectedItemId}
              onChange={e => setSelectedItemId(e.target.value)}
              className="w-full text-xs sm:text-sm min-h-[44px] px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950/70 text-slate-800 dark:text-slate-100"
            >
              <option value="">Visão Geral do Componente</option>
              {activeCompDef.commonAnomalies.map(a => (
                <option key={a.id} value={a.id}>{a.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Descrição / Observação da Foto (Opcional)
            </label>
            <input
              type="text"
              placeholder="ex: Fissura de 2cm na crista; canal com troncos..."
              value={caption}
              onChange={e => setCaption(e.target.value)}
              className="w-full text-xs sm:text-sm min-h-[44px] px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950/70 text-slate-800 dark:text-slate-100"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={includeGpsOnPhoto}
              onChange={e => setIncludeGpsOnPhoto(e.target.checked)}
              className="w-4 h-4 text-emerald-600 rounded"
            />
            <span>Anexar coordenadas de localização na foto (se disponível no dispositivo)</span>
          </label>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => cameraInputRef.current?.click()}
              disabled={isProcessing}
              className="min-h-[44px] px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs flex items-center gap-2 shadow-xs cursor-pointer disabled:opacity-50"
            >
              <Camera className="w-4 h-4" />
              <span>Abrir Câmera do Aparelho</span>
            </button>
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={e => handleFilesAdded(e.target.files)}
              className="hidden"
            />

            <button
              type="button"
              onClick={() => galleryInputRef.current?.click()}
              disabled={isProcessing}
              className="min-h-[44px] px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold text-xs border border-slate-300 dark:border-slate-700 flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <Upload className="w-4 h-4 text-slate-600 dark:text-slate-400" />
              <span>Galeria / Arquivos</span>
            </button>
            <input
              ref={galleryInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={e => handleFilesAdded(e.target.files)}
              className="hidden"
            />
          </div>
        </div>

        {isProcessing && (
          <p className="text-xs text-emerald-700 dark:text-emerald-400 font-semibold animate-pulse">
            Otimizando e salvando arquivo com segurança no dispositivo...
          </p>
        )}
      </div>

      {/* Galeria de Fotos com Filtro */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 shadow-xs space-y-4 transition-colors">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <ImageIcon className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <h3 className="text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-100 uppercase tracking-wide">
              Registros Fotográficos Armazenados ({photoRecords.length})
            </h3>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-500 dark:text-slate-400 font-semibold">Filtrar:</span>
            <select
              value={filterComponent}
              onChange={e => setFilterComponent(e.target.value)}
              className="text-xs min-h-[38px] px-2.5 py-1 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100"
            >
              <option value="todos">Todos os Componentes ({photoRecords.length})</option>
              {DAM_COMPONENTS.map(c => {
                const count = photoRecords.filter(p => p.componenteId === c.id).length;
                return (
                  <option key={c.id} value={c.id}>{c.name} ({count})</option>
                );
              })}
            </select>
          </div>
        </div>

        {filteredPhotos.length === 0 ? (
          <div className="py-12 text-center text-slate-400 space-y-2">
            <Camera className="w-10 h-10 mx-auto text-slate-300" />
            <p className="text-xs font-semibold">
              Nenhuma foto registrada para este filtro.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {filteredPhotos.map((photo, idx) => {
              const previewSrc = photoObjectUrls[photo.id] || photo.thumbnailPreviewUrl || '';

              return (
                <div
                  key={photo.id}
                  className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden bg-white dark:bg-slate-900 shadow-xs flex flex-col group transition-colors"
                >
                  <div className="relative aspect-4/3 bg-slate-100 dark:bg-slate-950 overflow-hidden cursor-pointer">
                    {previewSrc ? (
                      <img
                        src={previewSrc}
                        alt={photo.descricao || 'Foto de campo'}
                        className="w-full h-full object-cover group-hover:scale-105 transition"
                        onClick={() => setZoomPhoto(photo)}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-slate-400 text-xs">
                        Carregando imagem...
                      </div>
                    )}

                    <div className="absolute top-2 left-2 bg-black/75 text-white text-[10px] px-2 py-0.5 rounded font-mono">
                      #{idx + 1}
                    </div>

                    {/* Status de Sincronização Explícito no Card */}
                    <div className="absolute top-2 right-2 flex items-center gap-1.5">
                      {photo.syncStatus === 'sincronizado' ? (
                        <span 
                          className="px-2 py-0.5 rounded-lg bg-emerald-600/95 text-white text-[10px] font-bold flex items-center gap-1 shadow-xs" 
                          title="Sincronizada e confirmada no banco de dados da SEMA-MT"
                        >
                          <CloudCheck className="w-3.5 h-3.5" />
                          <span>No Banco</span>
                        </span>
                      ) : photo.syncStatus === 'falha_envio' ? (
                        <span 
                          onClick={(e) => {
                            e.stopPropagation();
                            setShowQueueModal(true);
                          }}
                          className="px-2 py-0.5 rounded-lg bg-rose-600/95 text-white text-[10px] font-bold flex items-center gap-1 shadow-xs cursor-pointer hover:bg-rose-700" 
                          title="Falha no upload. Clique para abrir a fila e tentar novamente."
                        >
                          <AlertTriangle className="w-3 h-3" />
                          <span>Falha Upload</span>
                        </span>
                      ) : (
                        <span 
                          onClick={(e) => {
                            e.stopPropagation();
                            setShowQueueModal(true);
                          }}
                          className="px-2 py-0.5 rounded-lg bg-amber-500/95 text-white text-[10px] font-bold flex items-center gap-1 shadow-xs cursor-pointer hover:bg-amber-600 animate-pulse" 
                          title="Aguardando upload no banco de dados (Salva no IndexedDB local). Clique para ver a fila."
                        >
                          <Clock className="w-3 h-3" />
                          <span>Aguardando Upload</span>
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeletePhoto(photo.id);
                        }}
                        className="p-1 rounded-lg bg-slate-900/80 hover:bg-rose-600 text-white transition-colors cursor-pointer"
                        title="Excluir foto"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="p-3 text-xs flex-1 flex flex-col justify-between space-y-2">
                    <div className="space-y-1.5">
                      <div>
                        <label className="block text-[9px] uppercase font-bold text-slate-500 dark:text-slate-400">
                          Vínculo ao Componente:
                        </label>
                        <select
                          value={photo.componenteId || 'geral'}
                          onChange={e => handleReassignComponent(photo.id, e.target.value)}
                          className="w-full mt-0.5 text-[11px] font-bold bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 rounded-lg p-1.5 border border-slate-200 dark:border-slate-700 focus:ring-1 focus:ring-emerald-500"
                          title="Vincular a qual componente da barragem"
                        >
                          {OFFICIAL_DAM_COMPONENTS_OPTIONS.map(opt => (
                            <option key={opt.id} value={opt.id}>
                              {opt.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      {photo.itemRotulo && (
                        <span className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold block truncate">
                          Item: {photo.itemRotulo}
                        </span>
                      )}

                      <p className="text-slate-700 dark:text-slate-300 mt-1 line-clamp-2 text-[11px]">
                        {photo.descricao || 'Sem descrição complementar'}
                      </p>
                    </div>

                    <div className="pt-2 border-t border-slate-100 dark:border-slate-800 text-[10px] text-slate-400 dark:text-slate-500 space-y-0.5">
                      <div className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        <span>{photo.timestampInclusao}</span>
                      </div>
                      {photo.coordenadas && (
                        <div className="flex items-center gap-1 text-slate-500">
                          <MapPin className="w-3 h-3 text-emerald-600" />
                          <span className="font-mono">
                            {formatGmsString(photo.coordenadas.latitude, true)}, {formatGmsString(photo.coordenadas.longitude, false)}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal Zoom */}
      {zoomPhoto && (
        <div className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-3 sm:p-4">
          <div className="relative max-w-4xl w-full bg-slate-900 text-white rounded-xl overflow-hidden shadow-2xl">
            <div className="p-3 bg-slate-950 flex items-center justify-between border-b border-slate-800">
              <div>
                <span className="font-bold text-xs text-emerald-400">{zoomPhoto.componenteNome}</span>
                <p className="text-xs text-slate-300 font-medium">{zoomPhoto.descricao || 'Sem descrição'}</p>
              </div>
              <button
                onClick={() => setZoomPhoto(null)}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="max-h-[70vh] flex items-center justify-center p-2 bg-black">
              <img
                src={photoObjectUrls[zoomPhoto.id] || zoomPhoto.remoteStorageUrl || zoomPhoto.thumbnailPreviewUrl || ''}
                alt={zoomPhoto.descricao || 'Foto'}
                className="max-h-[68vh] max-w-full object-contain"
              />
            </div>

            <div className="p-3 bg-slate-950 text-xs text-slate-400 flex flex-wrap items-center justify-between gap-2 border-t border-slate-800">
              <span>Data/Hora: {zoomPhoto.timestampInclusao}</span>
              {zoomPhoto.coordenadas && (
                <span>
                  Coordenadas: {formatGmsString(zoomPhoto.coordenadas.latitude, true)}, {formatGmsString(zoomPhoto.coordenadas.longitude, false)}
                  {zoomPhoto.coordenadas.acuraciaMetros ? ` (±${zoomPhoto.coordenadas.acuraciaMetros}m)` : ''}
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Navegação Inferior */}
      <div className="fixed bottom-0 left-0 right-0 z-30 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 px-4 py-3 flex items-center justify-between shadow-lg sm:static sm:bg-transparent sm:border-0 sm:shadow-none sm:px-0 sm:pt-4 transition-colors">
        <button
          type="button"
          onClick={onPrev}
          className="min-h-[44px] flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs sm:text-sm font-semibold transition cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Voltar</span>
        </button>

        <button
          type="button"
          onClick={onNext}
          className="min-h-[44px] flex items-center gap-2 px-5 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs sm:text-sm shadow-xs transition cursor-pointer"
        >
          <span>Avançar para Conclusões</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>

      {/* Central de Fila de Sincronização de Fotos (IndexedDB) */}
      <PhotoSyncQueueModal
        isOpen={showQueueModal}
        onClose={() => setShowQueueModal(false)}
        currentInspection={data}
        isOnline={typeof navigator !== 'undefined' ? navigator.onLine : true}
      />
    </div>
  );
};
