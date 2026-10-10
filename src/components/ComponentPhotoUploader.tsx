// ==============================================================================
// ARQUIVO: src/components/ComponentPhotoUploader.tsx
// Upload e captura fotográfica direta inserida em cada componente da barragem (CSB/SEMA-MT)
// Recursos solicitados:
// - Setinha de expandir/suprimir ("Registro fotográfico") em cada componente
// - Caixinhas de seleção para inserir legenda e timestamp com geolocalização
// - Geolocalização capturável (GPS ao vivo) e editável manualmente (lat/lng)
// - Suporte a inserção de MÚLTIPLAS fotos simultâneas
// ==============================================================================

import React, { useState, useRef } from 'react';
import { 
  Camera, 
  Upload, 
  Trash2, 
  ZoomIn, 
  X, 
  MapPin, 
  Clock, 
  Check, 
  Edit3, 
  ChevronDown,
  ChevronUp,
  Layers,
  Navigation,
  RefreshCw,
  Image as ImageIcon
} from 'lucide-react';
import { InspectionPhoto } from '../types/inspection';
import { 
  getDeviceGpsCoordinates, 
  compressImageToDataUrlAndBlob, 
  formatTimestampPtBr,
  OFFICIAL_DAM_COMPONENTS_OPTIONS,
  getComponentNameById
} from '../utils/photoCaptureUtils';
import { savePhotoBlob, deletePhotoBlob } from '../services/photoStorage';
import { formatGmsString } from '../utils/geoCoordinates';

interface ComponentPhotoUploaderProps {
  componentId: string;
  componentName: string;
  allPhotos: InspectionPhoto[];
  onUpdatePhotos: (updatedPhotos: InspectionPhoto[]) => void;
  inspectionId: string;
}

interface PendingModalBatchData {
  items: { file: File; previewUrl: string; name: string }[];
  caption: string;
  hasCaption: boolean;
  hasGeoTimestamp: boolean;
  latitude: string;
  longitude: string;
  timestamp: string;
  componentId: string;
}

interface EditingPhotoState {
  id: string;
  caption: string;
  timestamp: string;
  latitude: string;
  longitude: string;
  componentId: string;
}

export const ComponentPhotoUploader: React.FC<ComponentPhotoUploaderProps> = ({
  componentId,
  componentName,
  allPhotos,
  onUpdatePhotos,
  inspectionId
}) => {
  // Controle de expandir/suprimir o registro fotográfico deste componente
  const [isExpanded, setIsExpanded] = useState<boolean>(true);

  // Caixinhas de seleção (opções de captura)
  const [includeCaption, setIncludeCaption] = useState<boolean>(true);
  const [includeGeoTimestamp, setIncludeGeoTimestamp] = useState<boolean>(true);

  // Estados de processamento e GPS
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [gpsLoading, setGpsLoading] = useState<boolean>(false);
  const [zoomPhoto, setZoomPhoto] = useState<InspectionPhoto | null>(null);

  // Modal para confirmação de fotos (suporta uma ou múltiplas fotos)
  const [pendingModalData, setPendingModalData] = useState<PendingModalBatchData | null>(null);

  // Estado de edição detalhada de uma foto existente
  const [editingPhoto, setEditingPhoto] = useState<EditingPhotoState | null>(null);

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  // Filtra fotos pertencentes a este componente (compatível com sinônimos técnicos)
  const isPhotoOfThisComponent = (p: InspectionPhoto): boolean => {
    if (!p.componentId) return false;
    const cid = p.componentId.toLowerCase();
    const target = componentId.toLowerCase();

    if (cid === target) return true;
    if (target === 'crista' && cid === 'coroamento') return true;
    if (target === 'coroamento' && cid === 'crista') return true;
    if (target === 'talude_montante' && cid === 'montante') return true;
    if (target === 'montante' && cid === 'talude_montante') return true;
    if (target === 'talude_jusante' && cid === 'jusante') return true;
    if (target === 'jusante' && cid === 'talude_jusante') return true;
    if (target === 'area_jusante' && (cid === 'regiao_jusante' || cid === 'jusante_faixa')) return true;
    if (target === 'regiao_jusante' && (cid === 'area_jusante' || cid === 'jusante_faixa')) return true;
    if (target === 'reservatorio_borda' && cid === 'reservatorio') return true;
    if (target === 'reservatorio' && cid === 'reservatorio_borda') return true;

    return false;
  };

  const componentPhotos = allPhotos.filter(isPhotoOfThisComponent);

  // Capturar coordenadas GPS do dispositivo
  const captureGpsPosition = async (): Promise<{ lat: string; lng: string } | null> => {
    setGpsLoading(true);
    try {
      const coords = await getDeviceGpsCoordinates(8000);
      if (coords) {
        return {
          lat: coords.latitude.toString(),
          lng: coords.longitude.toString()
        };
      }
      return null;
    } catch (err) {
      console.error('Erro ao capturar GPS:', err);
      return null;
    } finally {
      setGpsLoading(false);
    }
  };

  // Manipulador de seleção de arquivos (permite múltiplas fotos)
  const handleFilesSelected = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setIsProcessing(true);

    try {
      let initialLat = '';
      let initialLng = '';

      if (includeGeoTimestamp) {
        const gps = await captureGpsPosition();
        if (gps) {
          initialLat = gps.lat;
          initialLng = gps.lng;
        }
      }

      const processedItems: { file: File; previewUrl: string; name: string }[] = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        try {
          const { dataUrl } = await compressImageToDataUrlAndBlob(file, 1600, 0.82);
          processedItems.push({
            file,
            previewUrl: dataUrl,
            name: file.name
          });
        } catch (compressErr) {
          console.error(`Erro ao processar imagem ${file.name}:`, compressErr);
        }
      }

      if (processedItems.length === 0) {
        setIsProcessing(false);
        return;
      }

      setPendingModalData({
        items: processedItems,
        caption: includeCaption ? `Registro de ${componentName}` : '',
        hasCaption: includeCaption,
        hasGeoTimestamp: includeGeoTimestamp,
        latitude: initialLat,
        longitude: initialLng,
        timestamp: formatTimestampPtBr(new Date()),
        componentId: componentId
      });
    } catch (err) {
      console.error('Erro na leitura dos arquivos:', err);
    } finally {
      setIsProcessing(false);
      if (cameraInputRef.current) cameraInputRef.current.value = '';
      if (galleryInputRef.current) galleryInputRef.current.value = '';
    }
  };

  // Confirmar inclusão de fotos (única ou múltiplas)
  const handleConfirmAddPhotos = async () => {
    if (!pendingModalData || pendingModalData.items.length === 0) return;
    setIsProcessing(true);

    try {
      const newPhotos: InspectionPhoto[] = [];
      const latNum = pendingModalData.hasGeoTimestamp && pendingModalData.latitude.trim()
        ? parseFloat(pendingModalData.latitude.replace(',', '.'))
        : undefined;
      const lngNum = pendingModalData.hasGeoTimestamp && pendingModalData.longitude.trim()
        ? parseFloat(pendingModalData.longitude.replace(',', '.'))
        : undefined;
      const finalTimestamp = pendingModalData.hasGeoTimestamp
        ? (pendingModalData.timestamp.trim() || formatTimestampPtBr(new Date()))
        : formatTimestampPtBr(new Date());

      for (let i = 0; i < pendingModalData.items.length; i++) {
        const item = pendingModalData.items[i];
        const photoId = `foto-${Date.now()}-${i}-${Math.random().toString(36).substring(2, 7)}`;
        const { blob } = await compressImageToDataUrlAndBlob(item.file, 1600, 0.82);

        await savePhotoBlob(photoId, blob);

        let photoCaption = '';
        if (pendingModalData.hasCaption) {
          const baseCap = pendingModalData.caption.trim() || `Registro de ${componentName}`;
          photoCaption = pendingModalData.items.length > 1
            ? `${baseCap} (Foto ${i + 1}/${pendingModalData.items.length})`
            : baseCap;
        }

        newPhotos.push({
          id: photoId,
          dataUrl: item.previewUrl,
          componentId: pendingModalData.componentId || componentId,
          componentName: getComponentNameById(pendingModalData.componentId || componentId),
          locationDescription: `Componente: ${componentName}`,
          caption: photoCaption,
          timestamp: finalTimestamp,
          latitude: !isNaN(latNum as number) ? latNum : undefined,
          longitude: !isNaN(lngNum as number) ? lngNum : undefined,
          syncStatus: 'local'
        });
      }

      onUpdatePhotos([...allPhotos, ...newPhotos]);
      setPendingModalData(null);
      setIsExpanded(true); // Mantém visível para o fiscal ver as fotos adicionadas
    } catch (err) {
      console.error('Erro ao salvar fotos do componente:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  // Excluir foto
  const handleDeletePhoto = async (photoId: string) => {
    await deletePhotoBlob(photoId);
    const remaining = allPhotos.filter(p => p.id !== photoId);
    onUpdatePhotos(remaining);
    if (zoomPhoto?.id === photoId) setZoomPhoto(null);
    if (editingPhoto?.id === photoId) setEditingPhoto(null);
  };

  // Iniciar edição detalhada de uma foto
  const handleStartEditing = (photo: InspectionPhoto) => {
    setEditingPhoto({
      id: photo.id,
      caption: photo.caption || '',
      timestamp: photo.timestamp || formatTimestampPtBr(new Date()),
      latitude: photo.latitude !== undefined ? photo.latitude.toString() : '',
      longitude: photo.longitude !== undefined ? photo.longitude.toString() : '',
      componentId: photo.componentId || componentId
    });
  };

  // Salvar edição detalhada da foto
  const handleSaveEditing = () => {
    if (!editingPhoto) return;
    const latNum = editingPhoto.latitude.trim() ? parseFloat(editingPhoto.latitude.replace(',', '.')) : undefined;
    const lngNum = editingPhoto.longitude.trim() ? parseFloat(editingPhoto.longitude.replace(',', '.')) : undefined;

    const updated = allPhotos.map(p => {
      if (p.id === editingPhoto.id) {
        return {
          ...p,
          caption: editingPhoto.caption.trim(),
          timestamp: editingPhoto.timestamp.trim() || p.timestamp,
          latitude: !isNaN(latNum as number) ? latNum : undefined,
          longitude: !isNaN(lngNum as number) ? lngNum : undefined,
          componentId: editingPhoto.componentId,
          componentName: getComponentNameById(editingPhoto.componentId),
          locationDescription: `Componente: ${getComponentNameById(editingPhoto.componentId)}`
        };
      }
      return p;
    });

    onUpdatePhotos(updated);
    setEditingPhoto(null);
  };

  return (
    <div className="mt-4 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-xs bg-white dark:bg-slate-900 transition-all">
      {/* ===================================================================== */}
      {/* BARRA SUPERIOR EXPANDIR/SUPRIMIR "REGISTRO FOTOGRÁFICO"               */}
      {/* ===================================================================== */}
      <button
        type="button"
        onClick={() => setIsExpanded(prev => !prev)}
        className="w-full p-3.5 bg-slate-50/90 dark:bg-slate-800/80 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-between font-bold text-slate-800 dark:text-slate-100 text-xs sm:text-sm uppercase tracking-wide cursor-pointer select-none transition-colors border-b border-slate-200 dark:border-slate-800"
      >
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-400 flex items-center justify-center font-bold shadow-xs">
            <Camera className="w-4 h-4" />
          </div>
          <div className="text-left">
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-slate-900 dark:text-white">
                Registro Fotográfico
              </span>
              <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                {componentPhotos.length} {componentPhotos.length === 1 ? 'foto' : 'fotos'}
              </span>
            </div>
            <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 normal-case">
              {componentName}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
          <span className="text-[11px] font-semibold hidden sm:inline normal-case">
            {isExpanded ? 'Recolher fotos' : 'Expandir fotos'}
          </span>
          {isExpanded ? (
            <ChevronUp className="w-5 h-5 text-emerald-700 dark:text-emerald-400" />
          ) : (
            <ChevronDown className="w-5 h-5 text-slate-500 dark:text-slate-400" />
          )}
        </div>
      </button>

      {/* ===================================================================== */}
      {/* CONTEÚDO EXPANDÍVEL COM OPÇÕES, CAPTURA E GALERIA                     */}
      {/* ===================================================================== */}
      {isExpanded && (
        <div className="p-3.5 sm:p-4 space-y-3.5 bg-slate-50/50 dark:bg-slate-950/40">
          {/* Barra de Configuração: Caixinhas de Seleção + Botões de Captura */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl">
            {/* Caixinhas de Seleção */}
            <div className="flex flex-wrap items-center gap-4 text-xs">
              {/* Caixinha: Inserir Legenda */}
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={includeCaption}
                  onChange={e => setIncludeCaption(e.target.checked)}
                  className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 border-slate-300 dark:border-slate-700"
                />
                <span className="font-semibold text-slate-700 dark:text-slate-200">
                  Inserir legenda
                </span>
              </label>

              {/* Caixinha: Timestamp com Geolocalização */}
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={includeGeoTimestamp}
                  onChange={e => setIncludeGeoTimestamp(e.target.checked)}
                  className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 border-slate-300 dark:border-slate-700"
                />
                <span className="font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1">
                  <span>Timestamp com geolocalização</span>
                  <MapPin className="w-3.5 h-3.5 text-rose-500" />
                </span>
              </label>
            </div>

            {/* Botões de Ação para Inserir Fotos */}
            <div className="flex items-center flex-wrap gap-2">
              {/* Botão Tirar Foto (Câmera do Celular/Tablet) */}
              <button
                type="button"
                onClick={() => cameraInputRef.current?.click()}
                disabled={isProcessing}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs transition cursor-pointer shadow-xs disabled:opacity-50"
                title="Abrir câmera do dispositivo móvel"
              >
                <Camera className="w-4 h-4" />
                <span>Tirar Foto</span>
              </button>
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={e => handleFilesSelected(e.target.files)}
              />

              {/* Botão Galeria com suporte a MÚLTIPLAS FOTOS */}
              <button
                type="button"
                onClick={() => galleryInputRef.current?.click()}
                disabled={isProcessing}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 font-semibold text-xs transition cursor-pointer disabled:opacity-50"
                title="Selecionar uma ou múltiplas fotos da galeria"
              >
                <Upload className="w-4 h-4 text-emerald-600" />
                <span>Galeria (Múltiplas Fotos)</span>
              </button>
              <input
                ref={galleryInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={e => handleFilesSelected(e.target.files)}
              />
            </div>
          </div>

          {/* Feedback de Carregamento de GPS / Imagens */}
          {(isProcessing || gpsLoading) && (
            <div className="bg-sky-50 dark:bg-sky-950/60 border border-sky-200 dark:border-sky-800 text-sky-800 dark:text-sky-300 p-2.5 rounded-lg text-xs flex items-center gap-2 animate-pulse font-medium">
              <Navigation className="w-4 h-4 animate-spin text-sky-600 shrink-0" />
              <span>
                {gpsLoading ? 'Capturando geolocalização do satélite GPS...' : 'Processando e comprimindo fotografias...'}
              </span>
            </div>
          )}

          {/* ================================================================= */}
          {/* GALERIA DE FOTOS DO COMPONENTE COM EDIÇÃO INLINE                  */}
          {/* ================================================================= */}
          {componentPhotos.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {componentPhotos.map((photo, idx) => {
                const isEditing = editingPhoto?.id === photo.id;

                return (
                  <div
                    key={photo.id}
                    className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs flex flex-col group transition-all"
                  >
                    {/* Imagem com Overlay de Detalhes e Zoom */}
                    <div className="relative aspect-4/3 bg-slate-100 dark:bg-slate-950 overflow-hidden">
                      <img
                        src={photo.dataUrl}
                        alt={photo.caption || photo.componentName}
                        className="w-full h-full object-cover group-hover:scale-102 transition duration-200 cursor-pointer"
                        onClick={() => setZoomPhoto(photo)}
                      />

                      {/* Badge com Numeração da Foto */}
                      <span className="absolute top-2 left-2 bg-black/75 backdrop-blur-xs text-white text-[10px] font-mono px-2 py-0.5 rounded-md">
                        #{idx + 1}
                      </span>

                      {/* Botão de Excluir Foto */}
                      <button
                        type="button"
                        onClick={() => handleDeletePhoto(photo.id)}
                        className="absolute top-2 right-2 bg-rose-600/90 hover:bg-rose-700 text-white p-1.5 rounded-lg cursor-pointer transition shadow-xs"
                        title="Remover esta foto"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>

                      {/* Carimbo de Timestamp e Coordenadas GPS na Imagem */}
                      {(photo.timestamp || (photo.latitude && photo.longitude)) && (
                        <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent p-2 text-[10px] text-white font-mono flex flex-col gap-0.5">
                          {photo.timestamp && (
                            <div className="flex items-center gap-1.5 truncate">
                              <Clock className="w-3 h-3 text-emerald-400 shrink-0" />
                              <span className="truncate">{photo.timestamp}</span>
                            </div>
                          )}
                          {photo.latitude && photo.longitude && (
                            <div className="flex items-center gap-1.5 truncate text-slate-200">
                              <MapPin className="w-3 h-3 text-rose-400 shrink-0" />
                              <span className="truncate">
                                {formatGmsString(photo.latitude, true)}, {formatGmsString(photo.longitude, false)}
                              </span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Bloco de Informações e Edição Detalhada */}
                    <div className="p-3 text-xs flex-1 flex flex-col justify-between space-y-2">
                      {isEditing ? (
                        <div className="space-y-2 bg-slate-50 dark:bg-slate-800/60 p-2.5 rounded-lg border border-slate-200 dark:border-slate-700">
                          <div>
                            <label className="block text-[10px] font-bold text-slate-700 dark:text-slate-300 mb-0.5">
                              Legenda da Foto:
                            </label>
                            <input
                              type="text"
                              value={editingPhoto.caption}
                              onChange={e => setEditingPhoto({ ...editingPhoto, caption: e.target.value })}
                              placeholder="Legenda descritiva..."
                              className="w-full text-xs p-1.5 border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100"
                            />
                          </div>

                          <div>
                            <label className="block text-[10px] font-bold text-slate-700 dark:text-slate-300 mb-0.5">
                              Timestamp (Data/Hora):
                            </label>
                            <input
                              type="text"
                              value={editingPhoto.timestamp}
                              onChange={e => setEditingPhoto({ ...editingPhoto, timestamp: e.target.value })}
                              className="w-full text-xs p-1.5 border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-900 font-mono text-slate-800 dark:text-slate-100"
                            />
                          </div>

                          <div className="grid grid-cols-2 gap-1.5">
                            <div>
                              <label className="block text-[10px] font-bold text-slate-700 dark:text-slate-300 mb-0.5">
                                Latitude:
                              </label>
                              <input
                                type="text"
                                value={editingPhoto.latitude}
                                onChange={e => setEditingPhoto({ ...editingPhoto, latitude: e.target.value })}
                                placeholder="-15.123456"
                                className="w-full text-xs p-1.5 border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-900 font-mono text-slate-800 dark:text-slate-100"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] font-bold text-slate-700 dark:text-slate-300 mb-0.5">
                                Longitude:
                              </label>
                              <input
                                type="text"
                                value={editingPhoto.longitude}
                                onChange={e => setEditingPhoto({ ...editingPhoto, longitude: e.target.value })}
                                placeholder="-56.123456"
                                className="w-full text-xs p-1.5 border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-900 font-mono text-slate-800 dark:text-slate-100"
                              />
                            </div>
                          </div>

                          <div className="flex items-center justify-between pt-1">
                            <button
                              type="button"
                              onClick={async () => {
                                const gps = await captureGpsPosition();
                                if (gps) {
                                  setEditingPhoto({
                                    ...editingPhoto,
                                    latitude: gps.lat,
                                    longitude: gps.lng
                                  });
                                }
                              }}
                              className="text-[10px] text-emerald-700 dark:text-emerald-400 font-semibold flex items-center gap-1 hover:underline cursor-pointer"
                            >
                              <Navigation className="w-3 h-3" />
                              <span>Capturar GPS Agora</span>
                            </button>

                            <div className="flex gap-1.5">
                              <button
                                type="button"
                                onClick={() => setEditingPhoto(null)}
                                className="px-2 py-1 rounded border border-slate-300 dark:border-slate-600 text-[11px] font-medium"
                              >
                                Cancelar
                              </button>
                              <button
                                type="button"
                                onClick={handleSaveEditing}
                                className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] flex items-center gap-1"
                              >
                                <Check className="w-3 h-3" />
                                <span>Salvar</span>
                              </button>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div>
                          <div className="flex items-start justify-between gap-1.5">
                            <p className="text-slate-800 dark:text-slate-100 font-medium text-xs line-clamp-2">
                              {photo.caption || <span className="text-slate-400 italic">Sem legenda cadastrada</span>}
                            </p>
                            <button
                              type="button"
                              onClick={() => handleStartEditing(photo)}
                              className="text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 p-1 rounded-md transition"
                              title="Editar legenda, timestamp e coordenadas desta foto"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Seletor de componente vinculado */}
                      <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                        <span className="flex items-center gap-1 font-medium">
                          <Layers className="w-3.5 h-3.5 text-emerald-600" />
                          <span>{componentName.split(' ')[0]}</span>
                        </span>

                        <select
                          value={photo.componentId}
                          onChange={e => {
                            const newCompId = e.target.value;
                            const updated = allPhotos.map(p => {
                              if (p.id === photo.id) {
                                return {
                                  ...p,
                                  componentId: newCompId,
                                  componentName: getComponentNameById(newCompId),
                                  locationDescription: `Componente: ${getComponentNameById(newCompId)}`
                                };
                              }
                              return p;
                            });
                            onUpdatePhotos(updated);
                          }}
                          className="text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 rounded px-2 py-0.5 border border-slate-200 dark:border-slate-700"
                          title="Alterar componente vinculado a esta foto"
                        >
                          {OFFICIAL_DAM_COMPONENTS_OPTIONS.map(opt => (
                            <option key={opt.id} value={opt.id}>
                              {opt.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-4 px-3 border border-dashed border-slate-300 dark:border-slate-800 rounded-xl bg-white/70 dark:bg-slate-900/60">
              <ImageIcon className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-700 mb-1" />
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Nenhuma fotografia anexada a este componente ainda.
              </p>
              <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
                Clique em "Tirar Foto" ou "Galeria" para adicionar uma ou múltiplas imagens que constarão no Relatório Oficial.
              </p>
            </div>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL PARA CONFIRMAÇÃO DE FOTOS (ÚNICA OU MÚLTIPLAS) COM LEGENDA/GPS */}
      {/* ===================================================================== */}
      {pendingModalData && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-lg w-full border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
            {/* Header do Modal */}
            <div className="p-4 bg-emerald-600 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Camera className="w-5 h-5" />
                <h3 className="font-bold text-sm">
                  {pendingModalData.items.length > 1
                    ? `Adicionar ${pendingModalData.items.length} Fotografias ao Componente`
                    : 'Adicionar Fotografia ao Componente'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setPendingModalData(null)}
                className="p-1 rounded-lg bg-emerald-700/60 hover:bg-emerald-700 text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 sm:p-5 space-y-4 overflow-y-auto flex-1 text-xs">
              {/* Preview das Imagens Selecionadas */}
              {pendingModalData.items.length === 1 ? (
                <div className="relative aspect-video rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-950">
                  <img
                    src={pendingModalData.items[0].previewUrl}
                    alt="Foto capturada"
                    className="w-full h-full object-contain"
                  />
                </div>
              ) : (
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                    {pendingModalData.items.length} Imagens Selecionadas:
                  </label>
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-36 overflow-y-auto p-1 bg-slate-100 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800">
                    {pendingModalData.items.map((item, idx) => (
                      <div key={idx} className="relative aspect-square rounded-lg overflow-hidden border border-slate-300 dark:border-slate-700">
                        <img src={item.previewUrl} alt={item.name} className="w-full h-full object-cover" />
                        <span className="absolute bottom-1 right-1 bg-black/75 text-white text-[9px] px-1 rounded font-mono">
                          #{idx + 1}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Caixinhas de Seleção dentro do Modal */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 bg-slate-50 dark:bg-slate-950 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={pendingModalData.hasCaption}
                    onChange={e => setPendingModalData({ ...pendingModalData, hasCaption: e.target.checked })}
                    className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 border-slate-300"
                  />
                  <span className="font-semibold text-slate-700 dark:text-slate-200">
                    Inserir legenda
                  </span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={pendingModalData.hasGeoTimestamp}
                    onChange={e => setPendingModalData({ ...pendingModalData, hasGeoTimestamp: e.target.checked })}
                    className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 border-slate-300"
                  />
                  <span className="font-semibold text-slate-700 dark:text-slate-200">
                    Timestamp com GPS
                  </span>
                </label>
              </div>

              {/* Campo de Legenda (se marcado) */}
              {pendingModalData.hasCaption && (
                <div>
                  <label className="block font-bold text-slate-800 dark:text-slate-200 mb-1">
                    Legenda da Fotografia:
                  </label>
                  <textarea
                    rows={2}
                    value={pendingModalData.caption}
                    onChange={e => setPendingModalData({ ...pendingModalData, caption: e.target.value })}
                    placeholder="ex: Vista geral do elemento inspecionado em campo..."
                    className="w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-emerald-500 text-xs"
                    autoFocus
                  />
                </div>
              )}

              {/* Bloco de Timestamp e Coordenadas Editáveis / Capturáveis */}
              {pendingModalData.hasGeoTimestamp && (
                <div className="bg-slate-50 dark:bg-slate-950 p-3 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-rose-500" />
                      <span>Coordenadas & Data/Hora (Editáveis)</span>
                    </span>

                    <button
                      type="button"
                      onClick={async () => {
                        const gps = await captureGpsPosition();
                        if (gps) {
                          setPendingModalData({
                            ...pendingModalData,
                            latitude: gps.lat,
                            longitude: gps.lng,
                            timestamp: formatTimestampPtBr(new Date())
                          });
                        }
                      }}
                      disabled={gpsLoading}
                      className="px-2.5 py-1 rounded bg-emerald-100 hover:bg-emerald-200 dark:bg-emerald-950 dark:hover:bg-emerald-900 text-emerald-800 dark:text-emerald-300 font-bold text-[11px] flex items-center gap-1 cursor-pointer transition"
                    >
                      <Navigation className={`w-3 h-3 ${gpsLoading ? 'animate-spin' : ''}`} />
                      <span>{gpsLoading ? 'Obtendo GPS...' : 'Capturar GPS Agora'}</span>
                    </button>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-600 dark:text-slate-400 mb-0.5">
                      Timestamp:
                    </label>
                    <input
                      type="text"
                      value={pendingModalData.timestamp}
                      onChange={e => setPendingModalData({ ...pendingModalData, timestamp: e.target.value })}
                      className="w-full p-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono text-xs text-slate-800 dark:text-slate-100"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-600 dark:text-slate-400 mb-0.5">
                        Latitude:
                      </label>
                      <input
                        type="text"
                        value={pendingModalData.latitude}
                        onChange={e => setPendingModalData({ ...pendingModalData, latitude: e.target.value })}
                        placeholder="-15.123456"
                        className="w-full p-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono text-xs text-slate-800 dark:text-slate-100"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-600 dark:text-slate-400 mb-0.5">
                        Longitude:
                      </label>
                      <input
                        type="text"
                        value={pendingModalData.longitude}
                        onChange={e => setPendingModalData({ ...pendingModalData, longitude: e.target.value })}
                        placeholder="-56.123456"
                        className="w-full p-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono text-xs text-slate-800 dark:text-slate-100"
                      />
                    </div>
                  </div>

                  {pendingModalData.latitude && pendingModalData.longitude && (
                    <div className="text-[11px] text-emerald-700 dark:text-emerald-400 font-mono font-medium truncate">
                      GMS: {formatGmsString(parseFloat(pendingModalData.latitude), true)}, {formatGmsString(parseFloat(pendingModalData.longitude), false)}
                    </div>
                  )}
                </div>
              )}

              {/* Componente Vinculado */}
              <div>
                <label className="block font-bold text-slate-800 dark:text-slate-200 mb-1">
                  Vincular ao Componente da Barragem:
                </label>
                <select
                  value={pendingModalData.componentId}
                  onChange={e => setPendingModalData({ ...pendingModalData, componentId: e.target.value })}
                  className="w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 text-xs"
                >
                  {OFFICIAL_DAM_COMPONENTS_OPTIONS.map(opt => (
                    <option key={opt.id} value={opt.id}>
                      {opt.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Rodapé com Botões de Confirmação */}
            <div className="p-4 bg-slate-50 dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2 text-xs">
              <button
                type="button"
                onClick={() => setPendingModalData(null)}
                className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-semibold cursor-pointer"
              >
                Descartar
              </button>

              <button
                type="button"
                onClick={handleConfirmAddPhotos}
                disabled={isProcessing}
                className="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold transition shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Check className="w-4 h-4" />
                <span>
                  {pendingModalData.items.length > 1
                    ? `Salvar ${pendingModalData.items.length} Fotos no Componente`
                    : 'Salvar Foto no Componente'}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL DE ZOOM                                                         */}
      {/* ===================================================================== */}
      {zoomPhoto && (
        <div className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-3 sm:p-4">
          <div className="relative max-w-4xl w-full bg-slate-900 text-white rounded-xl overflow-hidden shadow-2xl">
            <div className="p-3 bg-slate-950 flex items-center justify-between border-b border-slate-800">
              <div>
                <span className="font-bold text-xs text-emerald-400">{zoomPhoto.componentName}</span>
                <p className="text-xs text-slate-300 font-medium">{zoomPhoto.caption || 'Sem legenda'}</p>
              </div>
              <button
                onClick={() => setZoomPhoto(null)}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-2 bg-black flex items-center justify-center max-h-[75vh]">
              <img
                src={zoomPhoto.dataUrl}
                alt={zoomPhoto.caption}
                className="max-h-[70vh] w-auto object-contain"
              />
            </div>
            <div className="p-2.5 bg-slate-950 border-t border-slate-800 text-[11px] text-slate-400 flex flex-wrap justify-between gap-2 font-mono">
              <span>Timestamp: {zoomPhoto.timestamp}</span>
              {zoomPhoto.latitude && zoomPhoto.longitude && (
                <span>
                  Coordenadas: {formatGmsString(zoomPhoto.latitude, true)}, {formatGmsString(zoomPhoto.longitude, false)}
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
