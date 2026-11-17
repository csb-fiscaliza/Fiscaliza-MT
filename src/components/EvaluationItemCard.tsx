// ==============================================================================
// ARQUIVO: src/components/EvaluationItemCard.tsx
// Card de Avaliação de Item/Anomalia de Componente de Barragem (CSB / SEMA-MT)
// Ao selecionar "Sim", exibe os campos obrigatórios "Nível de Perigo" e "Magnitude"
// com layout responsivo para celular e tablet.
// Ao mudar para outra opção, oculta os campos e limpa os valores.
// ==============================================================================

import React, { useEffect, useRef, useState } from 'react';
import { 
  CheckCircle2, 
  EyeOff, 
  Ban, 
  HelpCircle, 
  AlertCircle,
  MapPin,
  AlertTriangle,
  Activity,
  Camera,
  Image as ImageIcon,
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

  const [photoSuccessToast, setPhotoSuccessToast] = useState<string | null>(null);
  const [isCameraModalOpen, setIsCameraModalOpen] = useState(false);
  const [fileForModal, setFileForModal] = useState<File | undefined>(undefined);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

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


  // Borda e fundo com alto contraste para visibilidade sob luz solar no campo
  const cardStatusBorder = 
    currentResponse === 'sim' 
      ? 'border-rose-300 dark:border-rose-800 bg-rose-50/30 dark:bg-rose-950/20 shadow-xs ring-1 ring-rose-400/40'
      : currentResponse === 'nao'
      ? 'border-emerald-300 dark:border-emerald-800/80 bg-emerald-50/20 dark:bg-emerald-950/20 shadow-xs'
      : currentResponse === 'impossivel_observar'
      ? 'border-amber-300 dark:border-amber-800/80 bg-amber-50/20 dark:bg-amber-950/20'
      : currentResponse === 'sem_informacao'
      ? 'border-dashed border-amber-300/80 dark:border-amber-700/60 bg-white dark:bg-slate-900'
      : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900';

  return (
    <div
      data-eval-label={itemLabel}
      className={`p-3.5 sm:p-4 rounded-xl border ${cardStatusBorder} space-y-3 transition-all duration-150`}
    >
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

      {/* Cabeçalho do Item: Título + Badge de Status + Ícone de Registro Fotográfico */}
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-1 min-w-0 flex-1">
          <div className="flex items-center flex-wrap gap-1.5">
            <span className="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100 leading-snug">
              {itemLabel}
            </span>
            {/* Badge visual de status rápido para escaneamento no celular/tablet */}
            {currentResponse === 'sim' && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-100 dark:bg-rose-900/60 text-rose-800 dark:text-rose-200 text-[10px] font-black uppercase tracking-wider shadow-2xs">
                <AlertTriangle className="w-3 h-3 text-rose-600 shrink-0" />
                <span>Anomalia</span>
              </span>
            )}
            {currentResponse === 'nao' && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-200 text-[10px] font-bold shadow-2xs">
                <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
                <span>Sem anomalia</span>
              </span>
            )}
            {currentResponse === 'sem_informacao' && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/70 border border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300 text-[10px] font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping shrink-0" />
                <span>Pendente</span>
              </span>
            )}
            {currentResponse === 'nao_observado' && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[10px]">
                <EyeOff className="w-3 h-3 text-slate-500 shrink-0" />
                <span>Não observado</span>
              </span>
            )}
            {currentResponse === 'impossivel_observar' && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-200 text-[10px] font-bold">
                <Ban className="w-3 h-3 text-amber-600 shrink-0" />
                <span>Impossível</span>
              </span>
            )}
            {currentResponse === 'nao_se_aplica' && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 text-[10px]">
                <HelpCircle className="w-3 h-3 text-slate-400 shrink-0" />
                <span>N/A</span>
              </span>
            )}
          </div>
        </div>

        {/* Botão/Ícone para Registro Fotográfico Direto do Item */}
        <div className="flex items-center gap-1 shrink-0">
          {/* Botão Câmera do Aparelho (Tirar Foto / Legenda / Time Stamp) */}
          <button
            type="button"
            onClick={() => handleOpenPhotoCapture()}
            className={`min-h-[38px] px-3 py-1 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer select-none shadow-xs active:scale-95 ${
              existingItemPhotos.length > 0
                ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700 hover:bg-emerald-100'
                : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-300 dark:border-slate-700 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-400'
            }`}
            title={`Tirar foto ou anexar com legenda e time stamp: "${preformattedCaption}"`}
          >
            <Camera className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span className="text-xs font-bold">Foto</span>
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
            className="min-h-[38px] min-w-[38px] p-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-emerald-700 hover:bg-slate-100 dark:hover:bg-slate-700 transition cursor-pointer flex items-center justify-center active:scale-95"
            title="Selecionar foto da galeria e inserir legenda/timestamp"
          >
            <ImageIcon className="w-4 h-4" />
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
            if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
            toastTimerRef.current = setTimeout(() => setPhotoSuccessToast(null), 3500);
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

      {/* Botões de resposta ergonomicamente otimizados para Mobile e Tablet */}
      {/* No Mobile: Linha 1 tem SIM e NÃO grandes (ação rápida de polegar); Linha 2 tem as 3 opções secundárias */}
      {/* No Tablet/Desktop (sm:): Unifica na grade de 5 colunas */}
      <div className="space-y-1.5 sm:space-y-0 sm:grid sm:grid-cols-5 sm:gap-2">
        {/* Linha 1 no celular: Sim vs Não (90% dos toques em campo) */}
        <div className="grid grid-cols-2 gap-2 sm:contents">
          {/* SIM */}
          <button
            type="button"
            onClick={() => setResponse('sim')}
            className={`min-h-[46px] py-2.5 px-3 rounded-xl border text-xs sm:text-xs font-bold flex items-center justify-center gap-2 text-center transition cursor-pointer select-none active:scale-95 ${
              currentResponse === 'sim'
                ? 'bg-rose-600 text-white border-rose-700 shadow-md ring-2 ring-rose-400'
                : 'bg-white dark:bg-slate-900 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-900/60 hover:bg-rose-50 dark:hover:bg-rose-950/50'
            }`}
          >
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span className="font-extrabold tracking-wide">Sim (Anomalia)</span>
          </button>

          {/* NÃO */}
          <button
            type="button"
            onClick={() => setResponse('nao')}
            className={`min-h-[46px] py-2.5 px-3 rounded-xl border text-xs sm:text-xs font-bold flex items-center justify-center gap-2 text-center transition cursor-pointer select-none active:scale-95 ${
              currentResponse === 'nao'
                ? 'bg-emerald-600 text-white border-emerald-700 shadow-md ring-2 ring-emerald-400'
                : 'bg-white dark:bg-slate-900 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900/60 hover:bg-emerald-50 dark:hover:bg-emerald-950/50'
            }`}
          >
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span className="font-extrabold tracking-wide">Não (Normal)</span>
          </button>
        </div>

        {/* Linha 2 no celular: 3 opções secundárias distribuídas em 3 colunas perfeitas */}
        <div className="grid grid-cols-3 gap-1.5 sm:contents">
          {/* Não observado */}
          <button
            type="button"
            onClick={() => setResponse('nao_observado')}
            className={`min-h-[42px] sm:min-h-[46px] py-2 px-1.5 rounded-xl border text-[11px] sm:text-xs font-semibold flex items-center justify-center gap-1 text-center transition cursor-pointer select-none active:scale-95 ${
              currentResponse === 'nao_observado'
                ? 'bg-slate-700 text-white border-slate-800 shadow-sm ring-2 ring-slate-400'
                : 'bg-slate-50/80 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
            }`}
          >
            <EyeOff className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">Não observado</span>
          </button>

          {/* Impossível observar */}
          <button
            type="button"
            onClick={() => setResponse('impossivel_observar')}
            className={`min-h-[42px] sm:min-h-[46px] py-2 px-1.5 rounded-xl border text-[11px] sm:text-xs font-semibold flex items-center justify-center gap-1 text-center transition cursor-pointer select-none active:scale-95 ${
              currentResponse === 'impossivel_observar'
                ? 'bg-amber-600 text-white border-amber-700 shadow-sm ring-2 ring-amber-400'
                : 'bg-slate-50/80 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
            }`}
          >
            <Ban className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">Impossível</span>
          </button>

          {/* Não se aplica */}
          <button
            type="button"
            onClick={() => setResponse('nao_se_aplica')}
            className={`min-h-[42px] sm:min-h-[46px] py-2 px-1.5 rounded-xl border text-[11px] sm:text-xs font-semibold flex items-center justify-center gap-1 text-center transition cursor-pointer select-none active:scale-95 ${
              currentResponse === 'nao_se_aplica'
                ? 'bg-slate-500 text-white border-slate-600 shadow-sm ring-2 ring-slate-400'
                : 'bg-slate-50/80 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
            }`}
          >
            <HelpCircle className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">Não se aplica</span>
          </button>
        </div>
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
