// ==============================================================================
// ARQUIVO: src/components/ComponentPhotoUploader.tsx
// Upload e captura fotográfica direta inserida em cada componente da barragem
// Suporta Câmera ao vivo, Galeria, Legenda imediata, GPS e Timestamp
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
  AlertCircle,
  Sparkles,
  Layers,
  ArrowRightLeft
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

export const ComponentPhotoUploader: React.FC<ComponentPhotoUploaderProps> = ({
  componentId,
  componentName,
  allPhotos,
  onUpdatePhotos,
  inspectionId
}) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [includeGps, setIncludeGps] = useState(true);
  const [zoomPhoto, setZoomPhoto] = useState<InspectionPhoto | null>(null);

  // Modal para confirmação/inserção imediata de legenda após captura
  const [pendingModalPhoto, setPendingModalPhoto] = useState<{
    file: File;
    previewUrl: string;
    caption: string;
    latitude?: number;
    longitude?: number;
    accuracyMeters?: number;
    timestamp: string;
    componentId: string;
  } | null>(null);

  // Edição rápida de legenda inline
  const [editingPhotoId, setEditingPhotoId] = useState<string | null>(null);
  const [editingCaption, setEditingCaption] = useState<string>('');

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  // Filtra fotos pertencentes a este componente (compatível com sinônimos como crista/coroamento, etc.)
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

  const handleFileSelected = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0]; // Captura primária para preenchimento de legenda
    setIsProcessing(true);
    setGpsLoading(true);

    try {
      // 1. Obter GPS se habilitado
      let gpsCoords = null;
      if (includeGps) {
        gpsCoords = await getDeviceGpsCoordinates(8000);
      }
      setGpsLoading(false);

      // 2. Comprimir imagem e gerar preview
      const { dataUrl } = await compressImageToDataUrlAndBlob(file, 1600, 0.82);

      // 3. Abrir modal para o usuário inserir legenda imediatamente
      setPendingModalPhoto({
        file,
        previewUrl: dataUrl,
        caption: `Registro de ${componentName}`,
        latitude: gpsCoords?.latitude,
        longitude: gpsCoords?.longitude,
        accuracyMeters: gpsCoords?.accuracyMeters,
        timestamp: formatTimestampPtBr(new Date()),
        componentId: componentId
      });
    } catch (err) {
      console.error('Erro ao ler fotografia:', err);
      alert('Não foi possível processar a imagem selecionada.');
    } finally {
      setIsProcessing(false);
      setGpsLoading(false);
      // Limpa os inputs de arquivo
      if (cameraInputRef.current) cameraInputRef.current.value = '';
      if (galleryInputRef.current) galleryInputRef.current.value = '';
    }
  };

  const handleConfirmAddPhoto = async () => {
    if (!pendingModalPhoto) return;
    setIsProcessing(true);

    try {
      const photoId = `foto-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      const { blob } = await compressImageToDataUrlAndBlob(pendingModalPhoto.file, 1600, 0.82);

      // Salva no IndexedDB local seguro
      await savePhotoBlob(photoId, blob);

      const newPhoto: InspectionPhoto = {
        id: photoId,
        dataUrl: pendingModalPhoto.previewUrl,
        componentId: pendingModalPhoto.componentId || componentId,
        componentName: getComponentNameById(pendingModalPhoto.componentId || componentId),
        locationDescription: `Componente: ${componentName}`,
        caption: pendingModalPhoto.caption.trim() || `Registro de ${componentName}`,
        timestamp: pendingModalPhoto.timestamp,
        latitude: pendingModalPhoto.latitude,
        longitude: pendingModalPhoto.longitude,
        accuracyMeters: pendingModalPhoto.accuracyMeters,
        syncStatus: 'local'
      };

      onUpdatePhotos([...allPhotos, newPhoto]);
      setPendingModalPhoto(null);
    } catch (err) {
      console.error('Erro ao salvar foto:', err);
      alert('Erro ao salvar a fotografia. Tente novamente.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDeletePhoto = async (photoId: string) => {
    if (confirm('Deseja realmente remover esta foto deste componente?')) {
      await deletePhotoBlob(photoId);
      const remaining = allPhotos.filter(p => p.id !== photoId);
      onUpdatePhotos(remaining);
      if (zoomPhoto?.id === photoId) setZoomPhoto(null);
    }
  };

  const handleSaveInlineCaption = (photoId: string) => {
    const updated = allPhotos.map(p => {
      if (p.id === photoId) {
        return { ...p, caption: editingCaption.trim() || p.caption };
      }
      return p;
    });
    onUpdatePhotos(updated);
    setEditingPhotoId(null);
    setEditingCaption('');
  };

  const handleChangeComponent = (photoId: string, newComponentId: string) => {
    const updated = allPhotos.map(p => {
      if (p.id === photoId) {
        return {
          ...p,
          componentId: newComponentId,
          componentName: getComponentNameById(newComponentId),
          locationDescription: `Componente: ${getComponentNameById(newComponentId)}`
        };
      }
      return p;
    });
    onUpdatePhotos(updated);
  };

  return (
    <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 rounded-xl p-3.5 space-y-3 transition-colors">
      {/* Cabeçalho da Seção Fotográfica do Componente */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-400 flex items-center justify-center font-bold">
            <Camera className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-slate-800 dark:text-slate-100">
              Fotografias de Campo – {componentName}
            </h4>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              {componentPhotos.length === 0 
                ? 'Nenhuma foto anexada a este elemento ainda' 
                : `${componentPhotos.length} foto(s) associada(s) que constarão neste componente no relatório`}
            </p>
          </div>
        </div>

        {/* Botões de Ação para Captura */}
        <div className="flex items-center flex-wrap gap-2">
          {/* Opção de GPS */}
          <label className="flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-slate-400 cursor-pointer select-none bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-2 py-1 rounded-md">
            <input
              type="checkbox"
              checked={includeGps}
              onChange={e => setIncludeGps(e.target.checked)}
              className="rounded text-emerald-600 w-3.5 h-3.5"
            />
            <span className="hidden sm:inline">GPS Automático</span>
            <span className="sm:hidden">GPS</span>
          </label>

          {/* Botão Tirar Foto (Câmera Nativa Smartphone/Tablet) */}
          <button
            type="button"
            onClick={() => cameraInputRef.current?.click()}
            disabled={isProcessing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs transition cursor-pointer shadow-xs disabled:opacity-50"
            title="Abrir câmera do dispositivo móvel para registrar este componente"
          >
            <Camera className="w-3.5 h-3.5" />
            <span>Tirar Foto</span>
          </button>
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={e => handleFileSelected(e.target.files)}
          />

          {/* Botão Anexar Foto (Galeria / Arquivo) */}
          <button
            type="button"
            onClick={() => galleryInputRef.current?.click()}
            disabled={isProcessing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 font-semibold text-xs transition cursor-pointer disabled:opacity-50"
            title="Selecionar foto da galeria ou arquivo salvo"
          >
            <Upload className="w-3.5 h-3.5 text-slate-500" />
            <span>Galeria</span>
          </button>
          <input
            ref={galleryInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={e => handleFileSelected(e.target.files)}
          />
        </div>
      </div>

      {/* Indicador de Processamento / GPS */}
      {(isProcessing || gpsLoading) && (
        <div className="bg-sky-50 dark:bg-sky-950/60 border border-sky-200 dark:border-sky-800 text-sky-800 dark:text-sky-300 p-2.5 rounded-lg text-xs flex items-center gap-2 animate-pulse">
          <MapPin className="w-4 h-4 shrink-0 text-sky-600" />
          <span>Obtendo coordenadas do satélite GPS e preparando registro fotográfico...</span>
        </div>
      )}

      {/* Galeria de Fotos Já Inseridas Neste Componente */}
      {componentPhotos.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 pt-1">
          {componentPhotos.map((photo, idx) => {
            const isEditing = editingPhotoId === photo.id;

            return (
              <div
                key={photo.id}
                className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs flex flex-col group transition-all"
              >
                {/* Imagem com Overlay de Detalhes e Zoom */}
                <div className="relative aspect-4/3 bg-slate-100 dark:bg-slate-950 overflow-hidden">
                  <img
                    src={photo.dataUrl}
                    alt={photo.caption || photo.componentName}
                    className="w-full h-full object-cover group-hover:scale-102 transition duration-200 cursor-pointer"
                    onClick={() => setZoomPhoto(photo)}
                  />

                  {/* Badge de Posição / Índice */}
                  <span className="absolute top-1.5 left-1.5 bg-black/70 text-white text-[10px] font-mono px-1.5 py-0.5 rounded">
                    #{idx + 1}
                  </span>

                  {/* Botão de Excluir */}
                  <button
                    type="button"
                    onClick={() => handleDeletePhoto(photo.id)}
                    className="absolute top-1.5 right-1.5 bg-rose-600/90 hover:bg-rose-700 text-white p-1 rounded-md cursor-pointer transition shadow-xs"
                    title="Remover esta foto"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>

                  {/* Carimbo de GPS / Timestamp na imagem */}
                  <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/85 via-black/50 to-transparent p-1.5 text-[9px] text-white font-mono flex flex-col gap-0.5">
                    <div className="flex items-center gap-1 truncate">
                      <Clock className="w-3 h-3 text-emerald-400 shrink-0" />
                      <span className="truncate">{photo.timestamp}</span>
                    </div>
                    {photo.latitude && photo.longitude && (
                      <div className="flex items-center gap-1 truncate text-slate-300">
                        <MapPin className="w-3 h-3 text-rose-400 shrink-0" />
                        <span className="truncate">
                          {formatGmsString(photo.latitude, true)}, {formatGmsString(photo.longitude, false)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Bloco de Legenda e Ações */}
                <div className="p-2.5 text-xs flex-1 flex flex-col justify-between space-y-2">
                  <div>
                    {isEditing ? (
                      <div className="space-y-1.5">
                        <label className="block text-[10px] font-bold text-slate-600 dark:text-slate-400">
                          Editar Legenda Oficial:
                        </label>
                        <textarea
                          rows={2}
                          value={editingCaption}
                          onChange={e => setEditingCaption(e.target.value)}
                          className="w-full text-xs p-1.5 border border-emerald-500 rounded bg-emerald-50/30 dark:bg-slate-800 text-slate-800 dark:text-slate-100"
                        />
                        <div className="flex justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => setEditingPhotoId(null)}
                            className="px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700 text-[11px]"
                          >
                            Cancelar
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSaveInlineCaption(photo.id)}
                            className="px-2 py-0.5 rounded bg-emerald-600 text-white font-semibold text-[11px] flex items-center gap-1"
                          >
                            <Check className="w-3 h-3" />
                            <span>Salvar</span>
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <div className="flex items-start justify-between gap-1">
                          <p className="text-slate-800 dark:text-slate-200 font-medium text-[11px] line-clamp-2">
                            {photo.caption || 'Sem legenda informada'}
                          </p>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingPhotoId(photo.id);
                              setEditingCaption(photo.caption || '');
                            }}
                            className="text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 p-0.5"
                            title="Editar legenda da fotografia"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Reatribuição rápida de componente */}
                  <div className="pt-1.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[10px] text-slate-500">
                    <span className="flex items-center gap-1">
                      <Layers className="w-3 h-3 text-emerald-600" />
                      <span>{componentName.split(' ')[0]}</span>
                    </span>

                    <select
                      value={photo.componentId}
                      onChange={e => handleChangeComponent(photo.id, e.target.value)}
                      className="text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded px-1.5 py-0.5 border border-slate-200 dark:border-slate-700"
                      title="Mudar o componente vinculado a esta foto"
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
        <div className="text-center py-3 px-2 border border-dashed border-slate-300 dark:border-slate-800 rounded-lg bg-white/60 dark:bg-slate-900/60">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Fotografias registradas aqui são incluídas automaticamente na subseção deste componente no Relatório Técnico de Inspeção.
          </p>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL PARA PREENCHIMENTO OBRIGATÓRIO DE LEGENDA APÓS TIRAR/ANEXAR FOTO    */}
      {/* ========================================================================= */}
      {pendingModalPhoto && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-lg w-full border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 bg-emerald-600 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Camera className="w-5 h-5" />
                <h3 className="font-bold text-sm">Identificação da Fotografia de Campo</h3>
              </div>
              <button
                type="button"
                onClick={() => setPendingModalPhoto(null)}
                className="p-1 rounded-lg bg-emerald-700/60 hover:bg-emerald-700 text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 sm:p-5 space-y-4 overflow-y-auto flex-1">
              {/* Preview da Imagem */}
              <div className="relative aspect-video rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-950">
                <img
                  src={pendingModalPhoto.previewUrl}
                  alt="Foto capturada"
                  className="w-full h-full object-contain"
                />
              </div>

              {/* Dados de Timestamp e GPS Capturados do Aparelho */}
              <div className="bg-slate-50 dark:bg-slate-950 p-3 rounded-xl border border-slate-200 dark:border-slate-800 text-xs space-y-1.5 font-mono">
                <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
                  <Clock className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>
                    <strong>Data/Hora (Timestamp):</strong> {pendingModalPhoto.timestamp}
                  </span>
                </div>

                <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
                  <MapPin className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>
                    <strong>Coordenadas GPS:</strong>{' '}
                    {pendingModalPhoto.latitude && pendingModalPhoto.longitude ? (
                      <span className="text-emerald-700 dark:text-emerald-400 font-bold">
                        {formatGmsString(pendingModalPhoto.latitude, true)}, {formatGmsString(pendingModalPhoto.longitude, false)}
                        {pendingModalPhoto.accuracyMeters && ` (±${pendingModalPhoto.accuracyMeters}m)`}
                      </span>
                    ) : (
                      <span className="text-amber-600">Sem sinal GPS no momento do disparo</span>
                    )}
                  </span>
                </div>
              </div>

              {/* Seletor de Componente Vinculado */}
              <div>
                <label className="block text-xs font-bold text-slate-800 dark:text-slate-200 mb-1">
                  Vincular ao Componente da Barragem:
                </label>
                <select
                  value={pendingModalPhoto.componentId}
                  onChange={e => setPendingModalPhoto({ ...pendingModalPhoto, componentId: e.target.value })}
                  className="w-full text-xs sm:text-sm p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100"
                >
                  {OFFICIAL_DAM_COMPONENTS_OPTIONS.map(opt => (
                    <option key={opt.id} value={opt.id}>
                      {opt.name}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Esta foto será inserida junto com este componente no relatório oficial.
                </p>
              </div>

              {/* Campo para o usuário inserir legenda (SEMPRE ABERTO CONFORME SOLICITADO) */}
              <div>
                <label className="block text-xs font-bold text-slate-800 dark:text-slate-200 mb-1">
                  Legenda da Fotografia (Obrigatória para o Relatório Oficial):
                </label>
                <textarea
                  rows={3}
                  value={pendingModalPhoto.caption}
                  onChange={e => setPendingModalPhoto({ ...pendingModalPhoto, caption: e.target.value })}
                  placeholder="ex: Vista panorâmica da crista observando-se pista de rolamento com boa conservação e ausência de trincas estruturais..."
                  className="w-full text-xs sm:text-sm p-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-emerald-500"
                  autoFocus
                />
              </div>
            </div>

            {/* Rodapé com Botão de Confirmação */}
            <div className="p-4 bg-slate-50 dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingModalPhoto(null)}
                className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold cursor-pointer"
              >
                Descartar
              </button>

              <button
                type="button"
                onClick={handleConfirmAddPhoto}
                disabled={isProcessing}
                className="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Check className="w-4 h-4" />
                <span>Salvar Foto no Componente</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Zoom */}
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
