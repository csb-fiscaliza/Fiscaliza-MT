// ==============================================================================
// ARQUIVO: src/components/GeneralPhotoAttachmentSection.tsx
// Espaço após o preenchimento da ficha para anexar fotos gerais
// e vincular posteriormente ao componente selecionado pelo usuário.
// ==============================================================================

import React, { useState, useRef } from 'react';
import { 
  Camera, 
  Upload, 
  Trash2, 
  MapPin, 
  Clock, 
  Check, 
  Edit3, 
  X, 
  Image as ImageIcon,
  CheckCircle2
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
import { SpeechTextarea } from './SpeechTextarea';

interface GeneralPhotoAttachmentSectionProps {
  allPhotos: InspectionPhoto[];
  onUpdatePhotos: (updatedPhotos: InspectionPhoto[]) => void;
  inspectionId?: string;
}

export const GeneralPhotoAttachmentSection: React.FC<GeneralPhotoAttachmentSectionProps> = ({
  allPhotos,
  onUpdatePhotos
}) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [includeGps, setIncludeGps] = useState(true);
  const [zoomPhoto, setZoomPhoto] = useState<InspectionPhoto | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Modal para confirmação de legenda
  const [pendingModalPhoto, setPendingModalPhoto] = useState<{
    previewUrl: string;
    blob: Blob;
    caption: string;
    selectedComponentId: string;
    latitude?: number;
    longitude?: number;
    accuracyMeters?: number;
    timestamp: string;
  } | null>(null);

  // Edição inline de legenda
  const [editingPhotoId, setEditingPhotoId] = useState<string | null>(null);
  const [editingCaption, setEditingCaption] = useState<string>('');

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelected = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setIsProcessing(true);
    setPhotoError(null);

    try {
      const file = files[0];
      let gpsCoords = null;
      if (includeGps) {
        gpsCoords = await getDeviceGpsCoordinates(8000);
      }

      const { dataUrl, blob } = await compressImageToDataUrlAndBlob(file, 1600, 0.82);

      // Sempre abre para o usuário inserir legenda e escolher se pertence a um componente
      setPendingModalPhoto({
        previewUrl: dataUrl,
        blob,
        caption: '',
        selectedComponentId: 'geral',
        latitude: gpsCoords?.latitude,
        longitude: gpsCoords?.longitude,
        accuracyMeters: gpsCoords?.accuracyMeters,
        timestamp: formatTimestampPtBr(new Date())
      });
    } catch (err) {
      console.error('Erro ao ler foto:', err);
      setPhotoError('Não foi possível ler o arquivo da imagem.');
    } finally {
      setIsProcessing(false);
      if (cameraInputRef.current) cameraInputRef.current.value = '';
      if (galleryInputRef.current) galleryInputRef.current.value = '';
    }
  };

  const handleConfirmAddPhoto = async () => {
    if (!pendingModalPhoto) return;
    setIsProcessing(true);
    setPhotoError(null);

    try {
      const photoId = `foto-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

      await savePhotoBlob(photoId, pendingModalPhoto.blob);

      const compId = pendingModalPhoto.selectedComponentId;
      const compName = getComponentNameById(compId);

      const newPhoto: InspectionPhoto = {
        id: photoId,
        dataUrl: pendingModalPhoto.previewUrl,
        componentId: compId,
        componentName: compName,
        locationDescription: compId === 'geral' ? 'Visão Geral' : `Componente: ${compName}`,
        caption: pendingModalPhoto.caption.trim() || `Registro fotográfico – ${compName}`,
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
      setPhotoError('Erro ao salvar a fotografia no armazenamento local.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDeletePhoto = async (photoId: string) => {
    await deletePhotoBlob(photoId);
    const remaining = allPhotos.filter(p => p.id !== photoId);
    onUpdatePhotos(remaining);
    setConfirmDeleteId(null);
    if (zoomPhoto?.id === photoId) setZoomPhoto(null);
  };

  const handleChangeComponent = (photoId: string, newComponentId: string) => {
    const newName = getComponentNameById(newComponentId);
    const updated = allPhotos.map(p => {
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
    onUpdatePhotos(updated);
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

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden transition-colors">
      {/* Cabeçalho da Seção */}
      <div className="p-4 bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center font-bold">
            <Camera className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-100 uppercase tracking-wide">
              Anexo Geral de Fotos e Vinculação aos Componentes
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Anexe fotos adicionais após o preenchimento e selecione se pertencem a um componente (Crista, Taludes, Vertedouro, etc.)
            </p>
          </div>
        </div>

        {/* Botões de Ação */}
        <div className="flex items-center flex-wrap gap-2">
          {/* Toggle GPS */}
          <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-2.5 py-1.5 rounded-lg cursor-pointer">
            <input
              type="checkbox"
              checked={includeGps}
              onChange={e => setIncludeGps(e.target.checked)}
              className="rounded text-emerald-600 w-3.5 h-3.5"
            />
            <span>Coordenadas GPS & Timestamp</span>
          </label>

          {/* Tirar Foto Câmera */}
          <button
            type="button"
            onClick={() => cameraInputRef.current?.click()}
            disabled={isProcessing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs transition cursor-pointer shadow-xs disabled:opacity-50"
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

          {/* Anexar da Galeria */}
          <button
            type="button"
            onClick={() => galleryInputRef.current?.click()}
            disabled={isProcessing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 font-semibold text-xs transition cursor-pointer disabled:opacity-50"
          >
            <Upload className="w-3.5 h-3.5 text-slate-500" />
            <span>Anexar da Galeria</span>
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

      {/* Conteúdo Principal */}
      <div className="p-4 sm:p-5 space-y-4">
        {photoError && (
          <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs font-semibold text-rose-700 dark:text-rose-300 flex items-center justify-between gap-2">
            <span>{photoError}</span>
            <button type="button" onClick={() => setPhotoError(null)} className="underline cursor-pointer">
              Fechar
            </button>
          </div>
        )}

        {/* Banner Explicativo sobre a Vinculação no Relatório */}
        <div className="p-3 bg-emerald-50/70 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 rounded-xl text-xs text-emerald-950 dark:text-emerald-300 flex items-start gap-2.5">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <p className="font-semibold">
              Vinculação Inteligente ao Relatório Técnico de Inspeção:
            </p>
            <p className="text-[11px] text-emerald-800 dark:text-emerald-400">
              Se você vincular a foto a um componente (ex: <strong>Crista</strong>, <strong>Talude de Montante</strong>, <strong>Vertedouro</strong>), ela será automaticamente posicionada junto à seção desse componente no Relatório Oficial com numeração sequencial de Figura e carimbo com data, hora e coordenadas GPS.
            </p>
          </div>
        </div>

        {/* Galeria de Fotos Anexadas */}
        {allPhotos.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {allPhotos.map((photo, idx) => {
              const isEditing = editingPhotoId === photo.id;
              const isLinked = photo.componentId && photo.componentId !== 'geral';

              return (
                <div
                  key={photo.id}
                  className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs flex flex-col group transition-colors"
                >
                  {/* Imagem Preview */}
                  <div className="relative aspect-4/3 bg-slate-100 dark:bg-slate-950 overflow-hidden">
                    <img
                      src={photo.dataUrl}
                      alt={photo.caption || photo.componentName}
                      className="w-full h-full object-cover group-hover:scale-102 transition duration-200 cursor-pointer"
                      onClick={() => setZoomPhoto(photo)}
                    />

                    {/* Tag de Índice */}
                    <span className="absolute top-2 left-2 bg-black/75 text-white text-[10px] font-mono px-2 py-0.5 rounded">
                      #{idx + 1}
                    </span>

                    {/* Botão Excluir (Confirmação em 2 cliques sem window.confirm) */}
                    {confirmDeleteId === photo.id ? (
                      <div className="absolute top-2 right-2 flex items-center gap-1 bg-slate-950/90 px-1.5 py-1 rounded-lg shadow-md">
                        <button
                          type="button"
                          onClick={() => handleDeletePhoto(photo.id)}
                          className="px-1.5 py-0.5 rounded bg-rose-600 hover:bg-rose-700 text-white text-[10px] font-bold cursor-pointer"
                        >
                          Excluir
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(null)}
                          className="px-1.5 py-0.5 rounded bg-slate-700 hover:bg-slate-600 text-white text-[10px] font-semibold cursor-pointer"
                        >
                          Não
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(photo.id)}
                        className="absolute top-2 right-2 bg-rose-600/90 hover:bg-rose-700 text-white p-1 rounded-md cursor-pointer transition shadow-xs"
                        title="Excluir esta foto"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}

                    {/* Carimbo de dados */}
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

                  {/* Informações e Seletor de Vinculação ao Componente */}
                  <div className="p-3 text-xs flex-1 flex flex-col justify-between space-y-2.5">
                    {/* Legenda */}
                    <div>
                      {isEditing ? (
                        <div className="space-y-1.5">
                          <SpeechTextarea
                            label="Editar Legenda:"
                            rows={2}
                            value={editingCaption}
                            onChange={e => setEditingCaption(e.target.value)}
                            className="text-xs p-1.5"
                          />
                          <div className="flex justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => setEditingPhotoId(null)}
                              className="px-2 py-0.5 rounded border text-[11px]"
                            >
                              Cancelar
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSaveInlineCaption(photo.id)}
                              className="px-2 py-0.5 rounded bg-emerald-600 text-white text-[11px] font-bold"
                            >
                              Salvar
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-start justify-between gap-1">
                          <div>
                            <span className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 block">
                              Legenda:
                            </span>
                            <p className="text-slate-900 dark:text-slate-100 font-medium text-[11px] line-clamp-2">
                              {photo.caption || 'Sem legenda inserida'}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingPhotoId(photo.id);
                              setEditingCaption(photo.caption || '');
                            }}
                            className="text-slate-400 hover:text-emerald-600 p-0.5 shrink-0"
                            title="Editar legenda"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>

                    {/* SELEÇÃO SE PERTENCE A UM COMPONENTE */}
                    <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-1">
                      <div className="flex items-center justify-between">
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                          Vínculo a Componente:
                        </label>
                        {isLinked ? (
                          <span className="text-[9px] px-1.5 py-0.2 rounded font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700/60">
                            Vinculado
                          </span>
                        ) : (
                          <span className="text-[9px] px-1.5 py-0.2 rounded font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                            Geral
                          </span>
                        )}
                      </div>

                      <select
                        value={photo.componentId || 'geral'}
                        onChange={e => handleChangeComponent(photo.id, e.target.value)}
                        className={`w-full text-xs p-1.5 rounded-lg border focus:ring-1 focus:ring-emerald-500 font-medium transition cursor-pointer ${
                          isLinked 
                            ? 'bg-emerald-50/50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-700/70 text-emerald-950 dark:text-emerald-200' 
                            : 'bg-slate-50 dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                        }`}
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
          <div className="text-center py-8 border-2 border-dashed border-slate-300 dark:border-slate-800 rounded-xl bg-slate-50/50 dark:bg-slate-950/30">
            <ImageIcon className="w-8 h-8 text-slate-400 mx-auto mb-2" />
            <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              Nenhuma fotografia anexada nesta seção ainda
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 max-w-md mx-auto">
              Utilize os botões acima para fotografar com o tablet/smartphone ou anexar arquivos. Você poderá escolher o componente e digitar a legenda para cada registro.
            </p>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* MODAL PARA PREENCHIMENTO DE LEGENDA E COMPONENTE                          */}
      {/* ========================================================================= */}
      {pendingModalPhoto && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-2.5 sm:p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-lg w-full border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[90dvh]">
            <div className="p-4 bg-emerald-600 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Camera className="w-5 h-5" />
                <h3 className="font-bold text-sm">Nova Fotografia – Vincular e Legendar</h3>
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
              {/* Preview */}
              <div className="relative aspect-video rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-950">
                <img
                  src={pendingModalPhoto.previewUrl}
                  alt="Foto capturada"
                  className="w-full h-full object-contain"
                />
              </div>

              {/* Timestamp e Coordenadas GPS */}
              <div className="bg-slate-50 dark:bg-slate-950 p-3 rounded-xl border border-slate-200 dark:border-slate-800 text-xs space-y-1.5 font-mono">
                <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
                  <Clock className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>
                    <strong>Data/Hora do Disparo:</strong> {pendingModalPhoto.timestamp}
                  </span>
                </div>

                <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
                  <MapPin className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>
                    <strong>GPS Integrado:</strong>{' '}
                    {pendingModalPhoto.latitude && pendingModalPhoto.longitude ? (
                      <span className="text-emerald-700 dark:text-emerald-400 font-bold">
                        {formatGmsString(pendingModalPhoto.latitude, true)}, {formatGmsString(pendingModalPhoto.longitude, false)}
                        {pendingModalPhoto.accuracyMeters && ` (±${pendingModalPhoto.accuracyMeters}m)`}
                      </span>
                    ) : (
                      <span className="text-amber-600">Dispositivo sem sinal GPS ou permissão</span>
                    )}
                  </span>
                </div>
              </div>

              {/* SELEÇÃO SE PERTENCE A UM COMPONENTE */}
              <div>
                <label className="block text-xs font-bold text-slate-800 dark:text-slate-200 mb-1">
                  Pertence a qual Componente da Barragem?
                </label>
                <select
                  value={pendingModalPhoto.selectedComponentId}
                  onChange={e => setPendingModalPhoto({ ...pendingModalPhoto, selectedComponentId: e.target.value })}
                  className="w-full text-xs sm:text-sm p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 font-medium"
                >
                  {OFFICIAL_DAM_COMPONENTS_OPTIONS.map(opt => (
                    <option key={opt.id} value={opt.id}>
                      {opt.name}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-slate-500 mt-1">
                  Se selecionado um componente, esta foto será inserida no relatório técnico junto com as constatações deste componente.
                </p>
              </div>

              {/* CAMPO DE LEGENDA SEMPRE ABERTO */}
              <SpeechTextarea
                label="Legenda da Fotografia:"
                rows={3}
                value={pendingModalPhoto.caption}
                onChange={e => setPendingModalPhoto({ ...pendingModalPhoto, caption: e.target.value })}
                placeholder="Descreva a constatação observada nesta foto (ex: Crista da barragem observando-se pista de tráfego, ausência de trincas)..."
                autoFocus
              />
            </div>

            {/* Ações */}
            <div className="p-4 bg-slate-50 dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingModalPhoto(null)}
                className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold cursor-pointer"
              >
                Cancelar
              </button>

              <button
                type="button"
                onClick={handleConfirmAddPhoto}
                disabled={isProcessing}
                className="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Check className="w-4 h-4" />
                <span>Salvar Foto</span>
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
