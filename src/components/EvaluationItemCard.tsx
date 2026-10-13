// ==============================================================================
// ARQUIVO: src/components/EvaluationItemCard.tsx
// Card de Avaliação de Item/Anomalia de Componente de Barragem (CSB / SEMA-MT)
// Ao selecionar "Sim", exibe os campos obrigatórios "Nível de Perigo" e "Magnitude"
// com layout responsivo para celular e tablet.
// Ao mudar para outra opção, oculta os campos e limpa os valores.
// ==============================================================================

import React, { useRef, useState } from 'react';
import { 
  CheckCircle2, 
  XCircle, 
  EyeOff, 
  Ban, 
  HelpCircle, 
  AlertCircle,
  MapPin,
  AlertTriangle,
  Activity,
  Camera,
  Image as ImageIcon,
  Loader2,
  Check
} from 'lucide-react';
import { 
  EvaluationResponseType, 
  ConservationState, 
  ItemAvaliadoEntity,
  NivelPerigoType,
  MagnitudeType,
  InspectionPhoto
} from '../types/inspection';
import { 
  compressImageToDataUrlAndBlob, 
  formatTimestampPtBr, 
  getDeviceGpsCoordinates 
} from '../utils/photoCaptureUtils';
import { savePhotoBlob } from '../services/photoStorage';
import { DeviceCameraCaptureModal } from './DeviceCameraCaptureModal';
import { VoiceInputButton } from './VoiceInputButton';

interface Props {
  componentCode: string;
  componentName?: string;
  itemCode: string;
  itemLabel: string;
  value?: ItemAvaliadoEntity;
  onChange: (updated: ItemAvaliadoEntity) => void;
  showLocationOnYes?: boolean;
  showConservationOnYes?: boolean;
  photos?: InspectionPhoto[];
  onAddPhoto?: (newPhoto: InspectionPhoto) => void;
}

export const EvaluationItemCard: React.FC<Props> = ({
  componentCode,
  componentName,
  itemCode,
  itemLabel,
  value,
  onChange,
  showLocationOnYes = true,
  showConservationOnYes = false,
  photos = [],
  onAddPhoto
}) => {
  const currentResponse: EvaluationResponseType = value?.resposta || 'sem_informacao';
  const currentId = value?.id || `item-${componentCode}-${itemCode}`;

  const [isProcessingPhoto, setIsProcessingPhoto] = useState(false);
  const [photoSuccessToast, setPhotoSuccessToast] = useState<string | null>(null);
  const [isCameraModalOpen, setIsCameraModalOpen] = useState(false);
  const [fileForModal, setFileForModal] = useState<File | undefined>(undefined);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  // Mapeia o nome oficial do componente para a legenda pré-formatada (ex: Talude de Montante)
  const getPreformattedComponentName = (): string => {
    if (componentName) return componentName;
    const lower = (componentCode || '').toLowerCase();
    if (lower.includes('montante')) return 'Talude de Montante';
    if (lower.includes('coroamento') || lower.includes('crista')) return 'Coroamento (Crista)';
    if (lower.includes('talude_jusante') || lower === 'jusante') return 'Talude de Jusante';
    if (lower.includes('regiao_jusante') || lower.includes('area_jusante')) return 'Região a Jusante';
    if (lower.includes('instrument')) return 'Instrumentação';
    if (lower.includes('vertedouro') || lower.includes('extravasor')) return 'Estruturas Vertedoras';
    if (lower.includes('reservatorio')) return 'Reservatório';
    if (lower.includes('outros')) return 'Outros Problemas';
    return componentCode;
  };

  // Mapeia o id do componente para o ComponentPhotoUploader
  const getCanonicalComponentId = (): string => {
    const lower = (componentCode || '').toLowerCase();
    if (lower.includes('montante')) return 'talude_montante';
    if (lower.includes('coroamento') || lower.includes('crista')) return 'crista';
    if (lower.includes('talude_jusante') || lower === 'jusante') return 'talude_jusante';
    if (lower.includes('regiao_jusante') || lower.includes('area_jusante')) return 'area_jusante';
    if (lower.includes('instrument')) return 'instrumentacao';
    if (lower.includes('vertedouro') || lower.includes('extravasor')) return 'vertedouro';
    if (lower.includes('reservatorio')) return 'reservatorio_borda';
    return lower || 'outros';
  };

  // Legenda pré-formatada: ex: Talude de Montante - Erosões
  const preformattedCaption = `${getPreformattedComponentName()} - ${itemLabel}`;

  // Conta quantas fotos já existem para este item
  const existingItemPhotos = photos.filter(p => {
    const cap = (p.caption || '').toLowerCase();
    const targetLabel = itemLabel.toLowerCase();
    const targetCode = itemCode.toLowerCase();
    return cap.includes(targetLabel) || cap.includes(targetCode);
  });

  const handleOpenPhotoCapture = (file?: File) => {
    setFileForModal(file);
    setIsCameraModalOpen(true);
  };

  const setResponse = (resp: EvaluationResponseType) => {
    onChange({
      id: currentId,
      vistoriaId: value?.vistoriaId || '',
      componenteCodigo: componentCode,
      itemCodigo: itemCode,
      itemRotuloOriginal: itemLabel,
      resposta: resp,
      localizacaoDetalhe: resp === 'sim' ? (value?.localizacaoDetalhe || '') : '',
      estadoConservacao: resp === 'sim' ? (value?.estadoConservacao || null) : null,
      observacaoComplementar: value?.observacaoComplementar || '',
      // Se a resposta mudar para outra opção além de "sim", limpa os valores de nível de perigo e magnitude
      nivelPerigo: resp === 'sim' ? (value?.nivelPerigo || null) : null,
      magnitude: resp === 'sim' ? (value?.magnitude || null) : null
    });
  };

  const updateField = (field: keyof ItemAvaliadoEntity, val: any) => {
    onChange({
      id: currentId,
      vistoriaId: value?.vistoriaId || '',
      componenteCodigo: componentCode,
      itemCodigo: itemCode,
      itemRotuloOriginal: itemLabel,
      resposta: currentResponse,
      localizacaoDetalhe: value?.localizacaoDetalhe || '',
      estadoConservacao: value?.estadoConservacao || null,
      observacaoComplementar: value?.observacaoComplementar || '',
      nivelPerigo: value?.nivelPerigo || null,
      magnitude: value?.magnitude || null,
      [field]: val
    });
  };

  const options: { id: EvaluationResponseType; label: string; icon: React.ReactNode; activeClass: string }[] = [
    {
      id: 'sim',
      label: 'Sim',
      icon: <CheckCircle2 className="w-4 h-4" />,
      activeClass: 'bg-rose-600 text-white border-rose-700 shadow-sm'
    },
    {
      id: 'nao',
      label: 'Não',
      icon: <XCircle className="w-4 h-4" />,
      activeClass: 'bg-emerald-600 text-white border-emerald-700 shadow-sm'
    },
    {
      id: 'nao_observado',
      label: 'Não observado',
      icon: <EyeOff className="w-4 h-4" />,
      activeClass: 'bg-slate-700 text-white border-slate-800 shadow-sm'
    },
    {
      id: 'impossivel_observar',
      label: 'Impossível observar',
      icon: <Ban className="w-4 h-4" />,
      activeClass: 'bg-amber-600 text-white border-amber-700 shadow-sm'
    },
    {
      id: 'nao_se_aplica',
      label: 'Não se aplica',
      icon: <HelpCircle className="w-4 h-4" />,
      activeClass: 'bg-slate-500 text-white border-slate-600 shadow-sm'
    }
  ];

  return (
    <div className="p-3.5 sm:p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs space-y-3 transition-colors">
      {/* Input oculto de galeria para seleção rápida de arquivo com posterior legenda/timestamp */}
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={e => {
          const file = e.target.files?.[0];
          if (file) {
            handleOpenPhotoCapture(file);
          }
          if (galleryInputRef.current) galleryInputRef.current.value = '';
        }}
      />

      {/* Cabeçalho do Item: Título + Ícone de Registro Fotográfico */}
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-0.5 min-w-0">
          <span className="text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-100 leading-snug block">
            {itemLabel}
          </span>
          {currentResponse === 'sem_informacao' && (
            <span className="text-[10px] text-slate-400 dark:text-slate-500 italic block">Pendente de avaliação</span>
          )}
        </div>

        {/* Botão/Ícone para Registro Fotográfico Direto do Item */}
        <div className="flex items-center gap-1 shrink-0">
          {/* Botão Câmera do Aparelho (Tirar Foto / Legenda / Time Stamp) */}
          <button
            type="button"
            onClick={() => handleOpenPhotoCapture()}
            disabled={isProcessingPhoto}
            className={`min-h-[34px] px-2.5 py-1 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer select-none shadow-xs active:scale-95 ${
              existingItemPhotos.length > 0
                ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700 hover:bg-emerald-100'
                : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-300 dark:border-slate-700 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-400'
            }`}
            title={`Tirar foto ou anexar com legenda e time stamp: "${preformattedCaption}"`}
          >
            {isProcessingPhoto ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-600" />
            ) : (
              <Camera className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            )}
            <span className="text-[11px] font-bold">Foto</span>
            {existingItemPhotos.length > 0 && (
              <span className="text-[10px] font-extrabold px-1.5 py-0.2 rounded-full bg-emerald-600 text-white">
                {existingItemPhotos.length}
              </span>
            )}
          </button>

          {/* Botão Galeria / Arquivos Direto (Abre com tela de legenda e timestamp) */}
          <button
            type="button"
            onClick={() => galleryInputRef.current?.click()}
            disabled={isProcessingPhoto}
            className="min-h-[34px] p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-500 hover:text-emerald-700 hover:bg-slate-100 dark:hover:bg-slate-700 transition cursor-pointer"
            title="Selecionar foto da galeria e inserir legenda/timestamp"
          >
            <ImageIcon className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Modal de Câmera do Aparelho com Legenda e Time Stamp */}
      <DeviceCameraCaptureModal
        isOpen={isCameraModalOpen}
        onClose={() => {
          setIsCameraModalOpen(false);
          setFileForModal(undefined);
        }}
        initialFile={fileForModal}
        componentName={getPreformattedComponentName()}
        itemLabel={itemLabel}
        canonicalComponentId={getCanonicalComponentId()}
        onPhotoSaved={newPhoto => {
          if (onAddPhoto) {
            onAddPhoto(newPhoto);
            setPhotoSuccessToast(`Foto inserida: "${newPhoto.caption || preformattedCaption}"`);
            setTimeout(() => setPhotoSuccessToast(null), 3500);
          }
        }}
      />

      {/* Toast de confirmação visual da foto adicionada */}
      {photoSuccessToast && (
        <div className="flex items-center gap-2 p-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-[11px] text-emerald-800 dark:text-emerald-200 animate-fadeIn">
          <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
          <span className="truncate">{photoSuccessToast}</span>
        </div>
      )}

      {/* Botões de resposta com toque amplo para Mobile/Tablet */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5 sm:gap-2">
        {options.map(opt => {
          const isSelected = currentResponse === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => setResponse(opt.id)}
              className={`min-h-[44px] py-2 px-2.5 rounded-lg border text-xs font-semibold flex items-center justify-center gap-1.5 text-center transition cursor-pointer select-none active:scale-98 ${
                isSelected
                  ? opt.activeClass
                  : 'bg-slate-50/80 dark:bg-slate-800/80 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 active:bg-slate-200'
              }`}
            >
              {opt.icon}
              <span className="truncate">{opt.label}</span>
            </button>
          );
        })}
      </div>

      {/* Conditional: Se "Sim" em qualquer anomalia -> Campos obrigatórios "Nível de Perigo" e "Magnitude" */}
      {currentResponse === 'sim' && (
        <div className="pt-2.5 border-t border-rose-200 dark:border-rose-900/50 space-y-3 bg-rose-50/50 dark:bg-rose-950/25 p-3 rounded-xl border border-rose-200/80 dark:border-rose-900/40">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Campo 1: Nível de Perigo (Normal, Atenção, Alerta ou Emergência) */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-rose-900 dark:text-rose-300 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400 shrink-0" />
                  <span>Nível de Perigo:</span>
                </span>
                <span className="text-[10px] font-bold uppercase tracking-wider text-rose-700 dark:text-rose-300 bg-rose-100 dark:bg-rose-900/60 px-1.5 py-0.5 rounded">
                  Obrigatório *
                </span>
              </label>

              {/* Layout otimizado para celular e tablet */}
              <div className="grid grid-cols-2 gap-1.5">
                {[
                  { id: 'normal', label: 'Normal', activeClass: 'bg-emerald-600 text-white border-emerald-700' },
                  { id: 'atencao', label: 'Atenção', activeClass: 'bg-amber-500 text-white border-amber-600' },
                  { id: 'alerta', label: 'Alerta', activeClass: 'bg-orange-600 text-white border-orange-700' },
                  { id: 'emergencia', label: 'Emergência', activeClass: 'bg-rose-600 text-white border-rose-700' }
                ].map(item => {
                  const isChecked = value?.nivelPerigo === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => updateField('nivelPerigo', item.id as NivelPerigoType)}
                      className={`min-h-[44px] px-2 py-1.5 rounded-lg border text-xs font-bold transition flex items-center justify-center text-center cursor-pointer select-none active:scale-98 ${
                        isChecked
                          ? `${item.activeClass} shadow-xs ring-2 ring-rose-400 ring-offset-1`
                          : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
                      }`}
                    >
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Campo 2: Magnitude (Insignificante, Pequena, Média ou Grande) */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-rose-900 dark:text-rose-300 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400 shrink-0" />
                  <span>Magnitude:</span>
                </span>
                <span className="text-[10px] font-bold uppercase tracking-wider text-rose-700 dark:text-rose-300 bg-rose-100 dark:bg-rose-900/60 px-1.5 py-0.5 rounded">
                  Obrigatório *
                </span>
              </label>

              {/* Layout otimizado para celular e tablet */}
              <div className="grid grid-cols-2 gap-1.5">
                {[
                  { id: 'insignificante', label: 'Insignificante', activeClass: 'bg-slate-600 text-white border-slate-700' },
                  { id: 'pequena', label: 'Pequena', activeClass: 'bg-blue-600 text-white border-blue-700' },
                  { id: 'media', label: 'Média', activeClass: 'bg-amber-600 text-white border-amber-700' },
                  { id: 'grande', label: 'Grande', activeClass: 'bg-purple-600 text-white border-purple-700' }
                ].map(item => {
                  const isChecked = value?.magnitude === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => updateField('magnitude', item.id as MagnitudeType)}
                      className={`min-h-[44px] px-2 py-1.5 rounded-lg border text-xs font-bold transition flex items-center justify-center text-center cursor-pointer select-none active:scale-98 ${
                        isChecked
                          ? `${item.activeClass} shadow-xs ring-2 ring-rose-400 ring-offset-1`
                          : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
                      }`}
                    >
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Conditional: Se "Sim" e requer localização */}
      {currentResponse === 'sim' && showLocationOnYes && (
        <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <label className="text-[11px] font-semibold text-rose-700 dark:text-rose-400 flex items-center gap-1">
              <MapPin className="w-3 h-3 text-rose-600 dark:text-rose-400" />
              <span>Localização da anomalia constatada:</span>
            </label>
            <VoiceInputButton
              currentValue={value?.localizacaoDetalhe || ''}
              onValueChange={val => updateField('localizacaoDetalhe', val)}
              size="xs"
              label="Ditar"
              showLabel={true}
              title="Ditar localização da anomalia (Web Speech API)"
            />
          </div>
          <input
            type="text"
            value={value?.localizacaoDetalhe || ''}
            onChange={e => updateField('localizacaoDetalhe', e.target.value)}
            placeholder="ex: Terço superior próximo ao vertedouro, margem esquerda..."
            className="w-full text-xs p-2.5 rounded-lg border border-rose-300 dark:border-rose-900/60 bg-rose-50/40 dark:bg-rose-950/30 text-slate-800 dark:text-slate-100 focus:ring-1 focus:ring-rose-500 focus:outline-none"
          />
        </div>
      )}

      {/* Conditional: Se "Sim" e requer estado de conservação */}
      {currentResponse === 'sim' && showConservationOnYes && (
        <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex flex-col gap-1">
          <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
            Estado de conservação do dispositivo:
          </label>
          <select
            value={value?.estadoConservacao || ''}
            onChange={e => updateField('estadoConservacao', (e.target.value as ConservationState) || null)}
            className="w-full text-xs p-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100"
          >
            <option value="">Selecione o estado...</option>
            <option value="bom">Bom (Funcional e íntegro)</option>
            <option value="regular">Regular (Pequeno desgaste)</option>
            <option value="ruim">Ruim (Danificado / Quebrado)</option>
            <option value="obstruido">Obstruído (Assoreado / Entupido)</option>
          </select>
        </div>
      )}

      {/* Conditional: Se "Impossível observar", exige/permite o motivo do impedimento (justificativa) */}
      {currentResponse === 'impossivel_observar' && (
        <div className="pt-2 border-t border-amber-100 dark:border-amber-900/40 flex flex-col gap-1.5 bg-amber-50/50 dark:bg-amber-950/30 p-2.5 rounded-lg border border-amber-200 dark:border-amber-800/50">
          <div className="flex items-center justify-between">
            <label className="text-[11px] font-bold text-amber-900 dark:text-amber-300 flex items-center gap-1">
              <AlertCircle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
              <span>Motivo/Justificativa do impedimento de observação:</span>
            </label>
            <VoiceInputButton
              currentValue={value?.observacaoComplementar || ''}
              onValueChange={val => updateField('observacaoComplementar', val)}
              size="xs"
              label="Ditar"
              showLabel={true}
              title="Ditar justificativa de impedimento de observação"
            />
          </div>
          <textarea
            rows={2}
            value={value?.observacaoComplementar || ''}
            onChange={e => updateField('observacaoComplementar', e.target.value)}
            placeholder="ex: Cobertura vegetal espessa impenetrável; nível d'água cobrindo a estrutura; ausência de acesso seguro..."
            className="w-full text-xs p-2 rounded-lg border border-amber-300 dark:border-amber-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 focus:ring-1 focus:ring-amber-500 focus:outline-none"
          />
        </div>
      )}

      {/* Observação complementar opcional para qualquer outro estado se o servidor desejar detalhar */}
      {currentResponse !== 'impossivel_observar' && (
        <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-[11px] font-medium text-slate-600 dark:text-slate-300">
              Observações / Dimensões da anomalia em campo:
            </label>
            <VoiceInputButton
              currentValue={value?.observacaoComplementar || ''}
              onValueChange={val => updateField('observacaoComplementar', val)}
              size="xs"
              label="Ditar"
              showLabel={true}
              title="Ditar observações da anomalia (Web Speech API)"
            />
          </div>
          <textarea
            rows={2}
            value={value?.observacaoComplementar || ''}
            onChange={e => updateField('observacaoComplementar', e.target.value)}
            placeholder="Observações complementares deste item, dimensões aproximadas, extensão visual da anomalia..."
            className="w-full text-xs p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-950/50 text-slate-700 dark:text-slate-200 focus:bg-white dark:focus:bg-slate-900 focus:ring-1 focus:ring-emerald-500 focus:outline-none"
          />
        </div>
      )}
    </div>
  );
};
