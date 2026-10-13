// ==============================================================================
// ARQUIVO: src/components/DeviceCameraCaptureModal.tsx
// Modal de Captura Fotográfica Direta com Acesso à Câmera do Aparelho (WebRTC / Câmera Nativa)
// e Inclusão de Legenda Pré-Formatada, Time Stamp e Geolocalização GPS (CSB / SEMA-MT)
// ==============================================================================

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  Camera, 
  X, 
  RotateCcw, 
  SwitchCamera, 
  Check, 
  Upload, 
  MapPin, 
  Clock, 
  Navigation, 
  AlertCircle, 
  FileImage, 
  RefreshCw,
  Smartphone,
  Eye,
  Tag
} from 'lucide-react';
import { InspectionPhoto } from '../types/inspection';
import { 
  compressImageToDataUrlAndBlob, 
  formatTimestampPtBr, 
  getDeviceGpsCoordinates,
  stampPhotoWithCaptionAndTimestamp
} from '../utils/photoCaptureUtils';
import { savePhotoBlob } from '../services/photoStorage';
import { enqueuePhotoForSync } from '../services/photoSyncQueueService';
import { formatGmsString } from '../utils/geoCoordinates';
import { VoiceInputButton } from './VoiceInputButton';

interface DeviceCameraCaptureModalProps {
  isOpen: boolean;
  onClose: () => void;
  componentName: string;
  itemLabel?: string;
  canonicalComponentId: string;
  onPhotoSaved: (newPhoto: InspectionPhoto) => void;
  initialFile?: File;
}

export const DeviceCameraCaptureModal: React.FC<DeviceCameraCaptureModalProps> = ({
  isOpen,
  onClose,
  componentName,
  itemLabel,
  canonicalComponentId,
  onPhotoSaved,
  initialFile
}) => {
  // Modo de exibição: 'camera' (captura ao vivo ou escolha) ou 'preview' (revisão de legenda/timestamp)
  const [mode, setMode] = useState<'camera' | 'preview'>('camera');
  const [cameraFacing, setCameraFacing] = useState<'environment' | 'user'>('environment');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isInitializingCamera, setIsInitializingCamera] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  // Foto capturada/selecionada
  const [capturedDataUrl, setCapturedDataUrl] = useState<string | null>(null);
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);

  // Campos de Legenda e Time Stamp
  const defaultCaptionText = itemLabel ? `${componentName} - ${itemLabel}` : `Registro de ${componentName}`;
  const [caption, setCaption] = useState<string>(defaultCaptionText);
  const [hasCaption, setHasCaption] = useState<boolean>(true);

  const [timestamp, setTimestamp] = useState<string>(formatTimestampPtBr(new Date()));
  const [hasTimestamp, setHasTimestamp] = useState<boolean>(true);

  // Opção de estampar na imagem (carimbo pericial oficial)
  const [stampOnImage, setStampOnImage] = useState<boolean>(true);

  // Coordenadas GPS
  const [latitude, setLatitude] = useState<string>('');
  const [longitude, setLongitude] = useState<string>('');
  const [gpsLoading, setGpsLoading] = useState<boolean>(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const nativeCameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  // Interrompe o stream de vídeo da câmera ao vivo
  const stopCameraStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => {
        try {
          track.stop();
        } catch {
          // ignore
        }
      });
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  // Inicializa o fluxo de vídeo da câmera do aparelho
  const startCameraStream = useCallback(async (facing: 'environment' | 'user') => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraError('Câmera via navegador não disponível neste ambiente. Use o botão "Câmera do Celular" abaixo para abrir o app nativo de câmera.');
      return;
    }

    stopCameraStream();
    setIsInitializingCamera(true);
    setCameraError(null);

    // Tentativa progressiva de restrições de câmera para máxima compatibilidade
    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: facing }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false
      });
    } catch {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: facing },
          audio: false
        });
      } catch {
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false
          });
        } catch (fallbackErr: any) {
          console.warn('Erro ao acessar getUserMedia:', fallbackErr);
          setCameraError('Permissão para a câmera não concedida no navegador. Toque no botão "Câmera do Aparelho" abaixo para abrir a câmera do seu telefone.');
        }
      }
    }

    if (stream) {
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play().catch(e => console.warn('Erro ao reproduzir stream:', e));
        };
      }
    }

    setIsInitializingCamera(false);
  }, [stopCameraStream]);

  // Captura GPS inicial
  const fetchGps = useCallback(async () => {
    setGpsLoading(true);
    try {
      const coords = await getDeviceGpsCoordinates(7000);
      if (coords) {
        setLatitude(coords.latitude.toString());
        setLongitude(coords.longitude.toString());
      }
    } catch (err) {
      console.warn('GPS não obtido:', err);
    } finally {
      setGpsLoading(false);
    }
  }, []);

  // Processa arquivo selecionado (seja da câmera nativa ou da galeria)
  const processSelectedFile = useCallback(async (file: File) => {
    try {
      setIsInitializingCamera(true);
      const { dataUrl, blob } = await compressImageToDataUrlAndBlob(file, 1600, 0.85);
      setCapturedDataUrl(dataUrl);
      setCapturedBlob(blob);
      setTimestamp(formatTimestampPtBr(new Date()));
      stopCameraStream();
      setMode('preview');
      fetchGps();
    } catch (err) {
      console.error('Erro ao ler imagem selecionada:', err);
    } finally {
      setIsInitializingCamera(false);
      if (nativeCameraInputRef.current) nativeCameraInputRef.current.value = '';
      if (galleryInputRef.current) galleryInputRef.current.value = '';
    }
  }, [stopCameraStream, fetchGps]);

  // Efeito ao abrir o modal
  useEffect(() => {
    if (isOpen) {
      setCaption(itemLabel ? `${componentName} - ${itemLabel}` : `Registro de ${componentName}`);
      setHasCaption(true);
      setTimestamp(formatTimestampPtBr(new Date()));
      setHasTimestamp(true);
      setStampOnImage(true);
      setLatitude('');
      setLongitude('');

      if (initialFile) {
        processSelectedFile(initialFile);
      } else {
        setMode('camera');
        setCameraFacing('environment');
        setCapturedDataUrl(null);
        setCapturedBlob(null);
        startCameraStream('environment');
        fetchGps();
      }
    } else {
      stopCameraStream();
    }

    return () => {
      stopCameraStream();
    };
  }, [isOpen, componentName, itemLabel, initialFile, startCameraStream, stopCameraStream, fetchGps, processSelectedFile]);

  if (!isOpen) return null;

  // Inverter câmera (frontal vs traseira)
  const handleToggleCamera = () => {
    const nextFacing = cameraFacing === 'environment' ? 'user' : 'environment';
    setCameraFacing(nextFacing);
    startCameraStream(nextFacing);
  };

  // Disparar foto a partir do stream da câmera do navegador
  const handleSnapLivePhoto = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;

    const width = video.videoWidth || 1280;
    const height = video.videoHeight || 720;

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (cameraFacing === 'user') {
      ctx.translate(width, 0);
      ctx.scale(-1, 1);
    }

    ctx.drawImage(video, 0, 0, width, height);

    const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
    canvas.toBlob(blob => {
      if (blob) {
        setCapturedBlob(blob);
      }
    }, 'image/jpeg', 0.88);

    setCapturedDataUrl(dataUrl);
    setTimestamp(formatTimestampPtBr(new Date()));
    stopCameraStream();
    setMode('preview');
  };

  // Aciona câmera nativa do aparelho (Android/iOS)
  const handleTriggerNativeCamera = () => {
    nativeCameraInputRef.current?.click();
  };

  // Aciona galeria do aparelho
  const handleTriggerGallery = () => {
    galleryInputRef.current?.click();
  };

  // Tirar outra foto (reinicia câmera)
  const handleRetake = () => {
    setCapturedDataUrl(null);
    setCapturedBlob(null);
    setMode('camera');
    startCameraStream(cameraFacing);
  };

  // Salvar a foto final com legenda e time stamp
  const handleSavePhoto = async () => {
    if (!capturedDataUrl) return;
    setIsSaving(true);

    try {
      const photoId = `foto-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      const finalCaption = hasCaption ? caption.trim() : '';
      const finalTimestamp = hasTimestamp ? (timestamp.trim() || formatTimestampPtBr(new Date())) : '';

      const latNum = hasTimestamp && latitude.trim() ? parseFloat(latitude.replace(',', '.')) : undefined;
      const lngNum = hasTimestamp && longitude.trim() ? parseFloat(longitude.replace(',', '.')) : undefined;

      const coordsStr = (latNum !== undefined && lngNum !== undefined)
        ? `${latNum.toFixed(6)}, ${lngNum.toFixed(6)}`
        : undefined;

      let finalDataUrl = capturedDataUrl;
      let finalBlob = capturedBlob;

      // Se solicitado, estampa o carimbo pericial na própria imagem
      if (stampOnImage) {
        try {
          const stamped = await stampPhotoWithCaptionAndTimestamp(capturedDataUrl, {
            caption: finalCaption,
            timestamp: finalTimestamp,
            coordinates: coordsStr,
            agency: 'CSB / SEMA-MT – FISCALIZAÇÃO DE SEGURANÇA DE BARRAGENS'
          });
          finalDataUrl = stamped.dataUrl;
          finalBlob = stamped.blob;
        } catch (stampErr) {
          console.warn('Erro ao estampar foto:', stampErr);
        }
      }

      if (!finalBlob) {
        const res = await fetch(finalDataUrl);
        finalBlob = await res.blob();
      }

      await savePhotoBlob(photoId, finalBlob);

      enqueuePhotoForSync({
        id: photoId,
        vistoriaId: 'current',
        componentId: canonicalComponentId,
        componentName: componentName,
        locationDescription: itemLabel ? `${componentName} - ${itemLabel}` : componentName,
        caption: finalCaption,
        timestamp: finalTimestamp,
        thumbnailUrl: finalDataUrl,
        blob: finalBlob,
        coordinates: !isNaN(latNum as number) && !isNaN(lngNum as number) ? {
          latitude: latNum as number,
          longitude: lngNum as number
        } : undefined
      }).catch(err => console.warn('[IndexedDB Queue] Aviso ao enfileirar foto:', err));

      const newPhoto: InspectionPhoto = {
        id: photoId,
        dataUrl: finalDataUrl,
        componentId: canonicalComponentId,
        componentName: componentName,
        locationDescription: itemLabel ? `${componentName} - ${itemLabel}` : componentName,
        caption: finalCaption,
        timestamp: finalTimestamp,
        latitude: !isNaN(latNum as number) ? latNum : undefined,
        longitude: !isNaN(lngNum as number) ? lngNum : undefined,
        syncStatus: 'local'
      };

      onPhotoSaved(newPhoto);
      onClose();
    } catch (err) {
      console.error('Erro ao salvar foto:', err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col my-auto animate-in fade-in zoom-in duration-200">
        
        {/* Header do Modal */}
        <div className="bg-slate-900 text-white px-4 sm:px-5 py-3.5 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-emerald-600 flex items-center justify-center text-white shrink-0 shadow-xs">
              <Camera className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-white tracking-tight flex items-center gap-2 truncate">
                <span>{mode === 'camera' ? 'Tirar Foto ou Anexar' : 'Revisão com Legenda e Time Stamp'}</span>
              </h3>
              <p className="text-[11px] text-emerald-400 font-medium truncate">
                {componentName} {itemLabel ? `• ${itemLabel}` : ''}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer shrink-0"
            title="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Inputs ocultos de acionamento nativo */}
        <input
          ref={nativeCameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={e => e.target.files?.[0] && processSelectedFile(e.target.files[0])}
        />
        <input
          ref={galleryInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={e => e.target.files?.[0] && processSelectedFile(e.target.files[0])}
        />

        {/* ========================================================================= */}
        {/* MODO 1: CÂMERA AO VIVO / OPÇÕES DE CAPTURA                                */}
        {/* ========================================================================= */}
        {mode === 'camera' && (
          <div className="flex flex-col">
            {/* Viewport da Câmera do Aparelho */}
            <div className="relative aspect-4/3 sm:aspect-16/10 bg-slate-950 flex items-center justify-center overflow-hidden">
              {cameraError ? (
                <div className="p-6 text-center text-slate-300 space-y-4 max-w-sm">
                  <div className="w-12 h-12 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center mx-auto">
                    <Smartphone className="w-6 h-6" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-bold text-slate-100">Câmera Direta do Aparelho</p>
                    <p className="text-[11px] text-slate-400 leading-relaxed">{cameraError}</p>
                  </div>
                  <div className="flex flex-col gap-2 pt-1">
                    <button
                      type="button"
                      onClick={handleTriggerNativeCamera}
                      className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-98 text-white font-bold text-xs flex items-center justify-center gap-2 cursor-pointer shadow-sm transition"
                    >
                      <Camera className="w-4 h-4" />
                      <span>Abrir Câmera do Aparelho (Foto ao Vivo)</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleTriggerGallery}
                      className="w-full py-2 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs flex items-center justify-center gap-2 cursor-pointer border border-slate-700 transition"
                    >
                      <FileImage className="w-4 h-4 text-emerald-400" />
                      <span>Anexar Foto da Galeria</span>
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover"
                  />

                  {/* Linhas de Enquadramento Pericial */}
                  <div className="absolute inset-0 pointer-events-none border-2 border-emerald-500/30 m-4 rounded-xl flex items-center justify-center">
                    <div className="w-14 h-14 border border-white/50 rounded-full flex items-center justify-center">
                      <div className="w-2 h-2 bg-emerald-400 rounded-full" />
                    </div>
                  </div>

                  {isInitializingCamera && (
                    <div className="absolute inset-0 bg-black/60 flex items-center justify-center text-white text-xs gap-2">
                      <RefreshCw className="w-4 h-4 animate-spin text-emerald-400" />
                      <span>Acessando câmera do aparelho...</span>
                    </div>
                  )}

                  {/* Botão de Trocar Câmera (Frontal / Traseira) */}
                  <button
                    type="button"
                    onClick={handleToggleCamera}
                    className="absolute top-3 right-3 p-2.5 rounded-full bg-black/60 hover:bg-black/80 text-white border border-white/20 transition cursor-pointer shadow-md"
                    title="Alternar entre câmera traseira e frontal"
                  >
                    <SwitchCamera className="w-4 h-4" />
                  </button>

                  {/* Badge de componente no topo do visor */}
                  <div className="absolute top-3 left-3 bg-black/70 backdrop-blur-xs text-white text-[10px] font-mono px-2.5 py-1 rounded-full border border-white/20 flex items-center gap-1.5">
                    <Tag className="w-3 h-3 text-emerald-400" />
                    <span className="truncate max-w-[200px]">{componentName}</span>
                  </div>
                </>
              )}
            </div>

            {/* Barra Inferior com Botões de Disparo e Acesso */}
            <div className="p-3.5 sm:p-4 bg-slate-900 border-t border-slate-800 flex items-center justify-between gap-2 sm:gap-3">
              {/* Botão Câmera Nativa do Celular */}
              <button
                type="button"
                onClick={handleTriggerNativeCamera}
                className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition cursor-pointer shrink-0"
                title="Acessar app de câmera nativo do aparelho"
              >
                <Smartphone className="w-4 h-4 text-emerald-400" />
                <span className="hidden sm:inline">Câmera do Celular</span>
                <span className="sm:hidden">Câmera</span>
              </button>

              {/* Botão Central de Disparo (Tirar Foto) */}
              <button
                type="button"
                onClick={cameraError ? handleTriggerNativeCamera : handleSnapLivePhoto}
                disabled={isInitializingCamera}
                className="w-14 h-14 rounded-full bg-emerald-500 hover:bg-emerald-400 active:scale-95 text-slate-950 font-bold flex items-center justify-center shadow-lg shadow-emerald-500/30 transition cursor-pointer disabled:opacity-40 border-4 border-white shrink-0"
                title="Tirar foto agora"
              >
                <Camera className="w-6 h-6 text-slate-950" />
              </button>

              {/* Botão Galeria / Anexar */}
              <button
                type="button"
                onClick={handleTriggerGallery}
                className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition cursor-pointer shrink-0"
                title="Escolher foto existente da galeria"
              >
                <FileImage className="w-4 h-4 text-emerald-400" />
                <span className="hidden sm:inline">Anexar Galeria</span>
                <span className="sm:hidden">Galeria</span>
              </button>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* MODO 2: PREVIEW DA FOTO COM FORMULÁRIO DE LEGENDA E TIME STAMP            */}
        {/* ========================================================================= */}
        {mode === 'preview' && capturedDataUrl && (
          <div className="p-4 sm:p-5 space-y-4 max-h-[80vh] overflow-y-auto">
            {/* Imagem Capturada com carimbo visual */}
            <div className="relative aspect-video rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-950 shadow-inner group">
              <img
                src={capturedDataUrl}
                alt="Foto capturada"
                className="w-full h-full object-contain"
              />

              {/* Botão Tirar Outra / Trocar Foto */}
              <button
                type="button"
                onClick={handleRetake}
                className="absolute top-2.5 right-2.5 px-2.5 py-1.5 rounded-lg bg-black/75 hover:bg-black/90 text-white text-[11px] font-bold flex items-center gap-1.5 border border-white/20 transition cursor-pointer shadow-md"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Tirar Outra Foto</span>
              </button>

              {/* Indicador de Visualização da Estampa */}
              {stampOnImage && (
                <div className="absolute bottom-0 left-0 right-0 bg-slate-950/85 border-t border-emerald-500/80 p-2 text-left text-white text-[10px] font-mono leading-tight space-y-0.5">
                  <div className="text-emerald-400 font-bold truncate">CSB / SEMA-MT – FISCALIZAÇÃO DE BARRAGENS</div>
                  {hasCaption && caption.trim() && (
                    <div className="truncate text-slate-100 font-semibold">Legenda: {caption.trim()}</div>
                  )}
                  {hasTimestamp && (
                    <div className="truncate text-slate-300">
                      Data/Hora: {timestamp.trim()} {latitude && longitude ? `| GPS: ${parseFloat(latitude).toFixed(4)}, ${parseFloat(longitude).toFixed(4)}` : ''}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Caixas de Seleção de Recursos */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 bg-slate-50 dark:bg-slate-950 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-xs">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={hasCaption}
                  onChange={e => setHasCaption(e.target.checked)}
                  className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 border-slate-300 dark:border-slate-700"
                />
                <span className="font-semibold text-slate-800 dark:text-slate-200">
                  Inserir legenda
                </span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={hasTimestamp}
                  onChange={e => setHasTimestamp(e.target.checked)}
                  className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 border-slate-300 dark:border-slate-700"
                />
                <span className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1">
                  <span>Time stamp & GPS</span>
                  <MapPin className="w-3.5 h-3.5 text-rose-500" />
                </span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={stampOnImage}
                  onChange={e => setStampOnImage(e.target.checked)}
                  className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 border-slate-300 dark:border-slate-700"
                />
                <span className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1">
                  <span>Estampar na foto</span>
                  <Eye className="w-3.5 h-3.5 text-emerald-500" />
                </span>
              </label>
            </div>

            {/* Campo: Legenda da Foto (Editável) */}
            {hasCaption && (
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-slate-800 dark:text-slate-200">
                    Legenda da Fotografia:
                  </label>
                  <div className="flex items-center gap-2">
                    <VoiceInputButton
                      currentValue={caption}
                      onValueChange={val => setCaption(val)}
                      size="xs"
                      label="Ditar Legenda"
                      showLabel={true}
                      title="Ditar legenda da foto (Web Speech API)"
                    />
                    <button
                      type="button"
                      onClick={() => setCaption(defaultCaptionText)}
                      className="text-[10px] text-emerald-600 dark:text-emerald-400 hover:underline font-medium cursor-pointer"
                    >
                      Restaurar padrão
                    </button>
                  </div>
                </div>
                <input
                  type="text"
                  value={caption}
                  onChange={e => setCaption(e.target.value)}
                  placeholder="Ex: Talude de Montante - Erosões"
                  className="w-full px-3 py-2 text-xs border border-slate-300 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-emerald-500 font-medium"
                />
              </div>
            )}

            {/* Campo: Time Stamp e Coordenadas GPS */}
            {hasTimestamp && (
              <div className="p-3 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 dark:text-slate-200">
                    <Clock className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                    <span>Time Stamp (Data, Hora e Coordenadas)</span>
                  </div>

                  <button
                    type="button"
                    onClick={async () => {
                      setTimestamp(formatTimestampPtBr(new Date()));
                      await fetchGps();
                    }}
                    disabled={gpsLoading}
                    className="px-2.5 py-1 rounded-lg bg-emerald-100 hover:bg-emerald-200 dark:bg-emerald-950 dark:hover:bg-emerald-900 text-emerald-800 dark:text-emerald-300 font-bold text-[11px] flex items-center gap-1 cursor-pointer transition shadow-xs"
                    title="Atualizar horário e coordenadas via GPS do satélite"
                  >
                    <Navigation className={`w-3 h-3 ${gpsLoading ? 'animate-spin' : ''}`} />
                    <span>{gpsLoading ? 'Obtendo GPS...' : 'Atualizar Time Stamp & GPS'}</span>
                  </button>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-600 dark:text-slate-400 mb-0.5">
                    Data e Hora do Registro (Time Stamp):
                  </label>
                  <input
                    type="text"
                    value={timestamp}
                    onChange={e => setTimestamp(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs font-mono border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-600 dark:text-slate-400 mb-0.5">
                      Latitude:
                    </label>
                    <input
                      type="text"
                      value={latitude}
                      onChange={e => setLatitude(e.target.value)}
                      placeholder="-15.123456"
                      className="w-full px-2 py-1.5 text-xs font-mono border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-600 dark:text-slate-400 mb-0.5">
                      Longitude:
                    </label>
                    <input
                      type="text"
                      value={longitude}
                      onChange={e => setLongitude(e.target.value)}
                      placeholder="-56.123456"
                      className="w-full px-2 py-1.5 text-xs font-mono border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100"
                    />
                  </div>
                </div>

                {latitude && longitude && (
                  <div className="text-[11px] text-emerald-700 dark:text-emerald-400 font-mono font-medium truncate pt-0.5">
                    GMS: {formatGmsString(parseFloat(latitude), true)}, {formatGmsString(parseFloat(longitude), false)}
                  </div>
                )}
              </div>
            )}

            {/* Ações Finais: Cancelar ou Salvar */}
            <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
              >
                Cancelar
              </button>

              <button
                type="button"
                onClick={handleSavePhoto}
                disabled={isSaving}
                className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {isSaving ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Salvando Foto...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    <span>Salvar Foto no Componente</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
