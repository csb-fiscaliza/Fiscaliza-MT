import React, { useState } from 'react';
import { 
  FileSpreadsheet, 
  ChevronDown, 
  ChevronUp, 
  MapPin, 
  User, 
  Compass, 
  Layers, 
  Ruler, 
  ShieldAlert, 
  ArrowLeft, 
  ArrowRight,
  Navigation,
  Plus,
  Trash2,
  Activity,
  Droplet,
  Waves,
  Eye,
  CheckCircle2,
  Save,
  FileDown,
  Printer,
  ShieldCheck,
  RefreshCw,
  Lock,
  WifiOff,
  CloudCheck,
  AlertCircle,
  CalendarClock,
  PlayCircle,
  Sparkles,
  Check
} from 'lucide-react';
import { exportInspectionSheetPdf } from '../utils/exportInspectionSheetPdf';
import { BASINS_MT, MUNICIPALITIES_MT } from '../data/damComponents';
import { 
  InspectionData, 
  ItemAvaliadoEntity, 
  EvaluationResponseType, 
  DamType 
} from '../types/inspection';
import { getNextVistoriaNumber } from '../services/storage';
import { EvaluationItemCard } from './EvaluationItemCard';
import { LocationCaptureWidget } from './LocationCaptureWidget';
import { ComponentPhotoUploader } from './ComponentPhotoUploader';
import { GeneralPhotoAttachmentSection } from './GeneralPhotoAttachmentSection';
import { FiscalizaLogo } from './FiscalizaLogo';
import { FloatingSheetNavMenu } from './FloatingSheetNavMenu';
import { formatGmsString } from '../utils/geoCoordinates';
import { InspectionPhoto } from '../types/inspection';
import { SpeechTextarea } from './SpeechTextarea';

interface Props {
  data: InspectionData;
  onChange: (updater: (prev: InspectionData) => InspectionData) => void;
  onNext: () => void;
  onPrev: () => void;
  onSave?: () => void;
  onSyncNow?: () => void;
  isSyncing?: boolean;
  onOpenAuthModal?: () => void;
}

export const OfficialInspectionSheetStep: React.FC<Props> = ({
  data,
  onChange,
  onNext,
  onPrev,
  onSave,
  onSyncNow,
  isSyncing = false,
  onOpenAuthModal
}) => {
  // Estado de recolher/expandir seções preservando as respostas
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    sec1: true,
    sec2: true,
    sec3: true,
    sec4: true,
    secComponentes: true,
    sec5: true,
    sec6: true,
    sec7: true,
    sec8: true,
    sec9: true,
    sec10: true,
    sec11: true,
    sec12: true,
    secFotos: true
  });

  // Estado dos comentários das seções e componentes com suporte a ditado por voz
  const [sectionComments, setSectionComments] = useState<Record<string, string>>({});
  const updateSectionComment = (key: string, text: string) => {
    setSectionComments(prev => ({ ...prev, [key]: text }));
  };

  const toggleSection = (key: string) => {
    setOpenSections(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // Navegação direta com abertura automática de tópicos e subtópicos
  const handleNavigateToSection = (sectionKey: string, elementId: string, parentKey?: string) => {
    setOpenSections(prev => {
      const next = { ...prev, [sectionKey]: true };
      if (parentKey) {
        next[parentKey] = true;
      }
      return next;
    });

    setTimeout(() => {
      const el = document.getElementById(elementId);
      if (el) {
        const headerOffset = window.innerWidth < 640 ? 110 : 130;
        const elementPosition = el.getBoundingClientRect().top;
        const offsetPosition = elementPosition + window.pageYOffset - headerOffset;
        window.scrollTo({
          top: Math.max(0, offsetPosition),
          behavior: 'smooth'
        });
        el.classList.add('ring-2', 'ring-emerald-500', 'transition-all');
        setTimeout(() => {
          el.classList.remove('ring-2', 'ring-emerald-500');
        }, 2200);
      }
    }, 80);
  };

  const handleExpandAllSections = () => {
    setOpenSections({
      sec1: true,
      sec2: true,
      sec3: true,
      sec4: true,
      secComponentes: true,
      sec5: true,
      sec6: true,
      sec7: true,
      sec8: true,
      sec9: true,
      sec10: true,
      sec11: true,
      sec12: true,
      secFotos: true
    });
  };

  const handleCollapseAllSections = () => {
    setOpenSections({
      sec1: false,
      sec2: false,
      sec3: false,
      sec4: false,
      secComponentes: false,
      sec5: false,
      sec6: false,
      sec7: false,
      sec8: false,
      sec9: false,
      sec10: false,
      sec11: false,
      sec12: false,
      secFotos: false
    });
  };

  // Helper para atualizar fotos de campo sincronizadamente
  const handleUpdatePhotos = (updatedPhotos: InspectionPhoto[]) => {
    onChange(prev => ({
      ...prev,
      photos: updatedPhotos
    }));
  };

  // Helper para adicionar foto inserida diretamente a partir do ícone de um item avaliado
  const handleAddDirectPhoto = (newPhoto: InspectionPhoto) => {
    onChange(prev => ({
      ...prev,
      photos: [...(prev.photos || []), newPhoto]
    }));
  };

  // Helper para atualizar item avaliado individual
  const updateItemAvaliado = (item: ItemAvaliadoEntity) => {
    onChange(prev => {
      const key = `${item.componenteCodigo}_${item.itemCodigo}`;
      return {
        ...prev,
        itensAvaliadosDetalhados: {
          ...(prev.itensAvaliadosDetalhados || {}),
          [key]: item
        }
      };
    });
  };

  const getItem = (componentCode: string, itemCode: string, labelDefault: string): ItemAvaliadoEntity => {
    const key = `${componentCode}_${itemCode}`;
    if (data.itensAvaliadosDetalhados?.[key]) {
      return data.itensAvaliadosDetalhados[key];
    }
    return {
      id: `item-${componentCode}-${itemCode}`,
      vistoriaId: data.id,
      componenteCodigo: componentCode,
      itemCodigo: itemCode,
      itemRotuloOriginal: labelDefault,
      resposta: 'sem_informacao',
      localizacaoDetalhe: '',
      estadoConservacao: null,
      observacaoComplementar: ''
    };
  };

  // Captura de GPS
  const [gpsLoading, setGpsLoading] = useState(false);
  const handleCaptureGps = () => {
    if (!navigator.geolocation) {
      console.warn('Geolocalização não suportada neste dispositivo.');
      return;
    }
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      pos => {
        const lat = formatGmsString(pos.coords.latitude, true, false);
        const lng = formatGmsString(pos.coords.longitude, false, false);
        onChange(prev => ({
          ...prev,
          damIdentification: {
            ...prev.damIdentification,
            coordinates: {
              ...prev.damIdentification.coordinates,
              latitude: lat,
              longitude: lng,
              accuracyMeters: pos.coords.accuracy
            }
          }
        }));
        setGpsLoading(false);
      },
      err => {
        setGpsLoading(false);
        console.warn('Erro ao obter satélites GPS:', err.message);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  };

  // Listas de itens avaliados por componente oficial para apoio a preenchimento rápido em campo
  const MONTANTE_ITEMS = [
    { code: 'erosoes', label: 'Erosões' },
    { code: 'escorregamento', label: 'Escorregamento' },
    { code: 'afundamento', label: 'Afundamento e/ou Buracos' },
    { code: 'arvores_arbustos', label: 'Árvores e Arbustos' },
    { code: 'drenos_canaletas', label: 'Drenos / Canaletas' },
    { code: 'biologicos', label: 'Formigueiros / Cupinzeiros / Tocas de Animais' },
    { code: 'sinais_movimentacao', label: 'Sinais de Movimentação' }
  ];

  const COROAMENTO_ITEMS = [
    { code: 'erosoes', label: 'Erosões' },
    { code: 'rachaduras', label: 'Rachaduras / Trincas' },
    { code: 'revestimento', label: 'Revestimento da Pista' },
    { code: 'afundamento', label: 'Afundamento e/ou Buracos' },
    { code: 'arvores_arbustos', label: 'Árvores e Arbustos' },
    { code: 'drenos_canaletas', label: 'Drenos / Canaletas' },
    { code: 'meio_fio', label: 'Possui Meio-Fio' },
    { code: 'ameaca_transbordamento', label: 'Ameaça de Transbordamento (Borda Livre < 0,5m)' }
  ];

  const JUSANTE_ITEMS = [
    { code: 'erosoes', label: 'Erosões' },
    { code: 'escorregamento', label: 'Escorregamento' },
    { code: 'afundamento', label: 'Afundamento e/ou Buracos' },
    { code: 'arvores_arbustos', label: 'Árvores e Arbustos' },
    { code: 'drenos_canaletas', label: 'Drenos / Canaletas' },
    { code: 'biologicos', label: 'Formigueiros / Cupinzeiros / Tocas de Animais' },
    { code: 'sinais_movimentacao', label: 'Sinais de Movimentação' },
    { code: 'fuga_agua', label: "Sinais de Fuga D'Água ou Áreas Úmidas" },
    { code: 'carregamento_material', label: 'Carregamento de Material na Água dos Drenos (Piping)' }
  ];

  const REGIAO_JUSANTE_ITEMS = [
    { code: 'construcoes_leito', label: 'Construções Próximas ao Leito do Rio' },
    { code: 'fuga_agua', label: "Fuga D'Água / Percolação Anormal" },
    { code: 'erosao_cavernas', label: 'Erosão / Cavernas / Buracos' },
    { code: 'arvores_faixa_10m', label: 'Árvores e Arbustos na Faixa de 10 m – Pé da Barragem' }
  ];

  const RESERVATORIO_ITEMS = [
    { code: 'erosoes_entorno', label: 'Erosões Próximas do Entorno' },
    { code: 'assoreamento', label: 'Assoreamento' },
    { code: 'desmoronamento_margens', label: 'Desmoronamento das Margens' },
    { code: 'vegetacao_aquatica', label: 'Vegetação Aquática Excessiva' },
    { code: 'gado_pastando', label: 'Gado Pastando no Entorno' }
  ];

  // Feedback rápido flutuante para o fiscal em campo
  const [fieldQuickToast, setFieldQuickToast] = useState<string | null>(null);
  const showFieldToast = (msg: string) => {
    setFieldQuickToast(msg);
    setTimeout(() => setFieldQuickToast(null), 3500);
  };

  // Helper de Preenchimento Rápido em Campo no Celular e Tablet:
  // Marca pendentes como 'Não' (Sem anomalias) apenas para os itens que ainda estão 'sem_informacao',
  // preservando quaisquer anomalias 'sim' ou justificativas já registradas pelo usuário.
  const handleBulkMarkComponentPendingAsNo = (
    componentCode: string,
    componentName: string,
    itemsList: { code: string; label: string }[]
  ) => {
    let count = 0;
    onChange(prev => {
      const detailed = { ...(prev.itensAvaliadosDetalhados || {}) };
      itemsList.forEach(it => {
        const key = `${componentCode}_${it.code}`;
        const existing = detailed[key];
        if (!existing || !existing.resposta || existing.resposta === 'sem_informacao') {
          detailed[key] = {
            id: existing?.id || `item-${componentCode}-${it.code}`,
            vistoriaId: prev.id,
            componenteCodigo: componentCode,
            itemCodigo: it.code,
            itemRotuloOriginal: it.label,
            resposta: 'nao',
            localizacaoDetalhe: '',
            estadoConservacao: null,
            observacaoComplementar: ''
          };
          count++;
        }
      });
      return {
        ...prev,
        itensAvaliadosDetalhados: detailed
      };
    });

    if (count > 0) {
      showFieldToast(`${count} item(ns) pendente(s) em "${componentName}" marcado(s) como "Não (Normal)"`);
    } else {
      showFieldToast(`Todos os itens de "${componentName}" já foram avaliados.`);
    }
  };

  // Helper para obter estatísticas de preenchimento do componente em tempo real
  const getComponentEvaluationStats = (
    componentCode: string,
    itemsList: { code: string }[]
  ) => {
    const total = itemsList.length;
    let evaluated = 0;
    let withAnomalies = 0;
    itemsList.forEach(it => {
      const key = `${componentCode}_${it.code}`;
      const item = data.itensAvaliadosDetalhados?.[key];
      if (item && item.resposta && item.resposta !== 'sem_informacao') {
        evaluated++;
        if (item.resposta === 'sim') withAnomalies++;
      }
    });
    return {
      total,
      evaluated,
      withAnomalies,
      isComplete: evaluated === total,
      pending: total - evaluated
    };
  };

  // Componente de Sugestões Rápidas de Campo para Textareas
  const FieldCommentChips = ({
    suggestions,
    currentValue,
    onAppend
  }: {
    suggestions: string[];
    currentValue: string;
    onAppend: (newText: string) => void;
  }) => (
    <div className="flex flex-wrap items-center gap-1.5 mt-2 pt-1 border-t border-slate-100 dark:border-slate-800">
      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
        <Sparkles className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
        <span>Sugestões de Campo:</span>
      </span>
      {suggestions.map(s => (
        <button
          key={s}
          type="button"
          onClick={() => {
            const sep = currentValue.trim() ? '; ' : '';
            if (!currentValue.includes(s)) {
              onAppend(currentValue.trim() + sep + s);
            }
          }}
          className="text-[11px] px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/60 dark:hover:bg-emerald-900 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 font-medium transition cursor-pointer select-none active:scale-95"
        >
          + {s}
        </button>
      ))}
    </div>
  );

  return (
    <div className="space-y-4 pb-20 sm:pb-12">
      {/* Toast Flutuante de Ação Rápida em Campo (Mobile e Tablet) */}
      {fieldQuickToast && (
        <div className="fixed top-16 sm:top-20 right-3 sm:right-6 z-50 max-w-sm bg-emerald-950/95 text-white px-4 py-2.5 rounded-2xl shadow-2xl border-2 border-emerald-400/80 flex items-center gap-2.5 animate-in fade-in slide-in-from-top-3 duration-200 backdrop-blur-md">
          <div className="w-6 h-6 rounded-full bg-emerald-500 text-slate-950 flex items-center justify-center font-bold text-xs shrink-0 shadow-xs">
            <Check className="w-3.5 h-3.5" />
          </div>
          <span className="text-xs font-bold leading-tight text-emerald-100">{fieldQuickToast}</span>
        </div>
      )}

      {/* Banner de Identificação da Ficha Aprovada */}
      <div className="bg-slate-900 text-white rounded-xl p-4 shadow-sm flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <FiscalizaLogo size="md" className="shadow-sm shrink-0" />
          <div>
            <h1 className="text-sm sm:text-base font-extrabold tracking-tight">
              Ficha de Inspeção para Segurança de Barragens
            </h1>
            <p className="text-xs text-slate-300">
              Formulário Oficial CSB / SEMA-MT • Respostas estritas e anotações de campo
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => exportInspectionSheetPdf(data)}
            className="min-h-[38px] px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-bold text-white flex items-center gap-1.5 shadow-sm transition cursor-pointer"
            title="Exportar ficha de vistoria completa para arquivo PDF estilizado no padrão oficial da SEMA-MT"
          >
            <FileDown className="w-4 h-4" />
            <span>Exportar PDF SEMA-MT</span>
          </button>

          <button
            type="button"
            onClick={() => {
              const allOpen = Object.values(openSections).every(Boolean);
              const nextState: Record<string, boolean> = {};
              Object.keys(openSections).forEach(k => {
                nextState[k] = !allOpen;
              });
              setOpenSections(nextState);
            }}
            className="min-h-[38px] px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold border border-slate-700 text-slate-200 cursor-pointer"
          >
            {Object.values(openSections).every(Boolean) ? 'Recolher Todas' : 'Expandir Todas'}
          </button>
        </div>
      </div>
      <div className={`p-3.5 rounded-xl border text-xs flex flex-wrap items-center justify-between gap-3 shadow-xs ${
        data.syncStatus === 'synced'
          ? 'bg-emerald-50/80 border-emerald-200 text-emerald-900'
          : data.syncStatus === 'error'
          ? 'bg-rose-50/80 border-rose-200 text-rose-900'
          : 'bg-amber-50/80 border-amber-200 text-amber-900'
      }`}>
        <div className="flex items-center gap-2.5">
          {data.syncStatus === 'synced' ? (
            <div className="w-7 h-7 rounded-lg bg-emerald-100 flex items-center justify-center shrink-0 text-emerald-700">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          ) : data.syncStatus === 'error' ? (
            <div className="w-7 h-7 rounded-lg bg-rose-100 flex items-center justify-center shrink-0 text-rose-700">
              <AlertCircle className="w-4 h-4" />
            </div>
          ) : (
            <div className="w-7 h-7 rounded-lg bg-amber-100 flex items-center justify-center shrink-0 text-amber-700">
              <Lock className="w-4 h-4" />
            </div>
          )}
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold">
                {data.syncStatus === 'synced' 
                  ? 'Ficha Sincronizada no Banco de Dados' 
                  : data.syncStatus === 'error'
                  ? 'Pendente de Sincronização (Erro na Transmissão)'
                  : 'Ficha Salva Offline no Dispositivo (Criptografia Ativa)'}
              </span>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-white/80 border border-current">
                {data.syncStatus === 'synced' ? 'Banco de Dados' : 'Apenas Local'}
              </span>
            </div>
            <p className="text-[11px] opacity-85 mt-0.5">
              {data.syncStatus === 'synced' 
                ? `Registro persistido no banco centralizado em ${data.lastSyncedAt ? new Date(data.lastSyncedAt).toLocaleString('pt-BR') : 'recente'}. Cópia de segurança íntegra.`
                : 'Trabalhe offline com tranquilidade. Seus dados estão criptografados em cofre local seguro (AES-GCM 256-bit) e serão sincronizados automaticamente assim que houver rede.'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {data.syncStatus === 'error' && onOpenAuthModal && (
            <button
              type="button"
              onClick={onOpenAuthModal}
              className="px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-2xs bg-rose-700 hover:bg-rose-800 text-white border border-rose-800"
              title="Resolver permissão RLS do Supabase ou entrar como fiscal"
            >
              <Lock className="w-3.5 h-3.5 text-rose-200" />
              <span>Resolver Permissão / Acesso</span>
            </button>
          )}

          {onSyncNow && (
            <button
              type="button"
              onClick={onSyncNow}
              disabled={isSyncing}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-2xs ${
                data.syncStatus === 'synced'
                  ? 'bg-white hover:bg-emerald-100/50 text-emerald-800 border border-emerald-300'
                  : 'bg-emerald-700 hover:bg-emerald-800 text-white border border-emerald-800'
              }`}
              title="Sincronizar esta ficha com o banco de dados seguro agora"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>{isSyncing ? 'Sincronizando...' : data.syncStatus === 'synced' ? 'Sincronizar Novamente' : 'Sincronizar com Banco'}</span>
            </button>
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* SELETOR DESTACADO: VISTORIA ATUAL VS VISTORIA FUTURA                      */}
      {/* ========================================================================= */}
      <div className={`p-4 sm:p-5 rounded-2xl border transition-all duration-200 shadow-sm ${
        data.tipoPlanejamento === 'futura'
          ? 'bg-gradient-to-r from-indigo-50/90 via-purple-50/80 to-blue-50/90 border-indigo-300 ring-2 ring-indigo-500/20'
          : 'bg-gradient-to-r from-emerald-50/90 via-teal-50/80 to-slate-50 border-emerald-300 ring-2 ring-emerald-500/20'
      }`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3 pb-3 border-b border-slate-200/60">
          <div className="flex items-center gap-2.5">
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-white shadow-xs ${
              data.tipoPlanejamento === 'futura' ? 'bg-indigo-600' : 'bg-emerald-600'
            }`}>
              {data.tipoPlanejamento === 'futura' ? <CalendarClock className="w-4 h-4" /> : <PlayCircle className="w-4 h-4" />}
            </div>
            <div>
              <span className="text-[11px] uppercase tracking-wider font-extrabold text-slate-700 block">
                Classificação da Ficha de Campo
              </span>
              <h2 className="text-sm sm:text-base font-black text-slate-900 leading-tight">
                {data.tipoPlanejamento === 'futura' 
                  ? 'Vistoria Futura (Pré-cadastro de Local para Planejamento)' 
                  : 'Vistoria Atual (Inspeção em Andamento / Realizada)'}
              </h2>
            </div>
          </div>
          
          <span className={`text-[11px] font-bold px-3 py-1 rounded-full uppercase tracking-wider self-start sm:self-auto border ${
            data.tipoPlanejamento === 'futura'
              ? 'bg-indigo-100 text-indigo-800 border-indigo-300'
              : 'bg-emerald-100 text-emerald-800 border-emerald-300'
          }`}>
            {data.tipoPlanejamento === 'futura' ? 'Sem Numeração Oficial' : `Oficial: ${data.generalInfo.numeroVistoria || 'A Definir'}`}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Opção Vistoria Atual */}
          <button
            type="button"
            onClick={() => {
              if (data.tipoPlanejamento === 'atual') return;
              const nextNum = getNextVistoriaNumber();
              const today = new Date().toISOString().split('T')[0];
              onChange(p => ({
                ...p,
                tipoPlanejamento: 'atual',
                isDraft: false, // Entende que está sendo ou já foi realizada
                generalInfo: {
                  ...p.generalInfo,
                  tipoPlanejamento: 'atual',
                  inspectionDate: p.generalInfo.inspectionDate || today,
                  numeroVistoria: p.generalInfo.numeroVistoria || nextNum
                }
              }));
            }}
            className={`p-3.5 rounded-xl border-2 text-left transition-all cursor-pointer flex items-start gap-3 relative ${
              data.tipoPlanejamento !== 'futura'
                ? 'bg-white border-emerald-600 shadow-sm ring-1 ring-emerald-500'
                : 'bg-white/70 border-slate-200 hover:border-emerald-300 opacity-80 hover:opacity-100'
            }`}
          >
            <div className={`w-5 h-5 rounded-full border-2 mt-0.5 flex items-center justify-center shrink-0 ${
              data.tipoPlanejamento !== 'futura'
                ? 'border-emerald-600 bg-emerald-600 text-white'
                : 'border-slate-300 bg-white'
            }`}>
              {data.tipoPlanejamento !== 'futura' && <div className="w-2 h-2 rounded-full bg-white" />}
            </div>
            <div>
              <div className="flex items-center gap-1.5 font-bold text-xs sm:text-sm text-slate-900">
                <span>Vistoria Atual</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800 font-semibold">Oficial</span>
              </div>
              <p className="text-[11px] text-slate-600 mt-1 leading-snug">
                Vistoria sendo executada ou já realizada. Atribui <strong>numeração sequencial oficial</strong> e atualiza o status de campo.
              </p>
            </div>
          </button>

          {/* Opção Vistoria Futura */}
          <button
            type="button"
            onClick={() => {
              if (data.tipoPlanejamento === 'futura') return;
              onChange(p => ({
                ...p,
                tipoPlanejamento: 'futura',
                isDraft: true,
                generalInfo: {
                  ...p.generalInfo,
                  tipoPlanejamento: 'futura',
                  numeroVistoria: '' // Não dá numeração para vistoria futura!
                }
              }));
            }}
            className={`p-3.5 rounded-xl border-2 text-left transition-all cursor-pointer flex items-start gap-3 relative ${
              data.tipoPlanejamento === 'futura'
                ? 'bg-white border-indigo-600 shadow-sm ring-1 ring-indigo-500'
                : 'bg-white/70 border-slate-200 hover:border-indigo-300 opacity-80 hover:opacity-100'
            }`}
          >
            <div className={`w-5 h-5 rounded-full border-2 mt-0.5 flex items-center justify-center shrink-0 ${
              data.tipoPlanejamento === 'futura'
                ? 'border-indigo-600 bg-indigo-600 text-white'
                : 'border-slate-300 bg-white'
            }`}>
              {data.tipoPlanejamento === 'futura' && <div className="w-2 h-2 rounded-full bg-white" />}
            </div>
            <div>
              <div className="flex items-center gap-1.5 font-bold text-xs sm:text-sm text-slate-900">
                <span>Vistoria Futura</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-indigo-100 text-indigo-800 font-semibold">Pré-salva</span>
              </div>
              <p className="text-[11px] text-slate-600 mt-1 leading-snug">
                Pré-salva dados do local e da barragem para planejar a ida a campo. <strong>Não consome número</strong> até ser iniciada.
              </p>
            </div>
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* SEÇÃO 1: DADOS GERAIS DA BARRAGEM */}
      {/* ========================================================================= */}
      <div id="sec-topico-1" className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden scroll-mt-24 transition-all">
        <button
          type="button"
          onClick={() => toggleSection('sec1')}
          className="w-full p-4 bg-slate-50 flex items-center justify-between font-bold text-slate-800 text-xs sm:text-sm uppercase tracking-wide cursor-pointer select-none"
        >
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center text-xs">1</span>
            <span>1. Dados Gerais da Barragem</span>
          </div>
          {openSections.sec1 ? <ChevronUp className="w-5 h-5 text-slate-500" /> : <ChevronDown className="w-5 h-5 text-slate-500" />}
        </button>

        {openSections.sec1 && (
          <div className="p-4 sm:p-5 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Data da Vistoria <span className="text-rose-500">*</span>
                </label>
                <input
                  type="date"
                  value={data.generalInfo.inspectionDate}
                  onChange={e => onChange(p => ({ ...p, generalInfo: { ...p.generalInfo, inspectionDate: e.target.value } }))}
                  className="w-full text-xs sm:text-sm min-h-[44px] px-3 py-2 border border-slate-300 rounded-lg bg-slate-50/50"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Hora de Início
                </label>
                <input
                  type="time"
                  value={data.generalInfo.startTime}
                  onChange={e => onChange(p => ({ ...p, generalInfo: { ...p.generalInfo, startTime: e.target.value } }))}
                  className="w-full text-xs sm:text-sm min-h-[44px] px-3 py-2 border border-slate-300 rounded-lg bg-slate-50/50"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Número do Processo <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="ex: PROC-2026/01234-SEMA"
                  value={data.generalInfo.recordNumber}
                  onChange={e => onChange(p => ({ ...p, generalInfo: { ...p.generalInfo, recordNumber: e.target.value } }))}
                  className="w-full text-xs sm:text-sm min-h-[44px] px-3 py-2 border border-slate-300 rounded-lg bg-slate-50/50"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Número de Vistoria{' '}
                  {data.tipoPlanejamento === 'futura' ? (
                    <span className="text-indigo-600 text-[11px] font-medium">(Sem numeração - Vistoria Futura)</span>
                  ) : (
                    <span className="text-emerald-700 text-[11px] font-medium">(Editável - ex: 0001/2026)</span>
                  )}
                </label>
                {data.tipoPlanejamento === 'futura' ? (
                  <div className="w-full text-xs sm:text-sm min-h-[44px] px-3 py-2 border border-indigo-200 rounded-lg bg-indigo-50/60 text-indigo-700 font-medium flex items-center justify-between">
                    <span>(Sem numeração)</span>
                    <span className="text-[10px] bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded font-bold">
                      Gerada ao iniciar
                    </span>
                  </div>
                ) : (
                  <input
                    type="text"
                    placeholder="ex: 0001/2026"
                    value={data.generalInfo.numeroVistoria ?? ''}
                    onChange={e => onChange(p => ({ ...p, generalInfo: { ...p.generalInfo, numeroVistoria: e.target.value } }))}
                    className="w-full text-xs sm:text-sm min-h-[44px] px-3 py-2 border border-slate-300 rounded-lg bg-slate-50/50 font-medium text-slate-900"
                  />
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nome da Barragem <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="ex: Açude Fazenda Esperança"
                  value={data.damIdentification.damName}
                  onChange={e => onChange(p => ({ ...p, damIdentification: { ...p.damIdentification, damName: e.target.value } }))}
                  className="w-full text-xs sm:text-sm min-h-[44px] px-3 py-2 border border-slate-300 rounded-lg bg-slate-50/50"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Município (Mato Grosso) <span className="text-rose-500">*</span>
                </label>
                <select
                  value={data.damIdentification.municipality}
                  onChange={e => onChange(p => ({ ...p, damIdentification: { ...p.damIdentification, municipality: e.target.value } }))}
                  className="w-full text-xs sm:text-sm min-h-[44px] px-3 py-2 border border-slate-300 rounded-lg bg-slate-50/50"
                >
                  <option value="">Selecione...</option>
                  {MUNICIPALITIES_MT.map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nome do Curso D'Água Barrado
                </label>
                <input
                  type="text"
                  placeholder="ex: Córrego do Barreiro"
                  value={data.damIdentification.waterCourse}
                  onChange={e => onChange(p => ({ ...p, damIdentification: { ...p.damIdentification, waterCourse: e.target.value } }))}
                  className="w-full text-xs sm:text-sm min-h-[44px] px-3 py-2 border border-slate-300 rounded-lg bg-slate-50/50"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Ano Início da Obra
                </label>
                <input
                  type="number"
                  placeholder="ex: 2012"
                  value={data.damIdentification.estimatedDimensions.heightMeters ? '' : ''}
                  onChange={() => {}}
                  className="w-full text-xs sm:text-sm min-h-[44px] px-3 py-2 border border-slate-300 rounded-lg bg-slate-50/50"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Ano Final da Obra
                </label>
                <input
                  type="number"
                  placeholder="ex: 2014"
                  className="w-full text-xs sm:text-sm min-h-[44px] px-3 py-2 border border-slate-300 rounded-lg bg-slate-50/50"
                />
              </div>
            </div>

            {/* Coordenadas e GPS com Widget Rigoroso */}
            <div className="pt-2">
              <LocationCaptureWidget
                latitude={data.damIdentification.coordinates.latitude}
                longitude={data.damIdentification.coordinates.longitude}
                accuracyMeters={data.damIdentification.coordinates.accuracyMeters}
                altitudeMeters={data.damIdentification.coordinates.altitudeMeters}
                captureTimestamp={data.damIdentification.coordinates.captureTimestamp}
                isManualEdit={data.damIdentification.coordinates.isManualEdit}
                datum={data.damIdentification.coordinates.datum || 'SIRGAS 2000'}
                onChange={coords => {
                  onChange(p => ({
                    ...p,
                    damIdentification: {
                      ...p.damIdentification,
                      coordinates: {
                        ...p.damIdentification.coordinates,
                        ...coords
                      }
                    }
                  }));
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* SEÇÃO 2: IDENTIFICAÇÃO DO EMPREENDEDOR E PROPRIEDADE */}
      {/* ========================================================================= */}
      <div id="sec-topico-2" className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden scroll-mt-24 transition-all">
        <button
          type="button"
          onClick={() => toggleSection('sec2')}
          className="w-full p-4 bg-slate-50 flex items-center justify-between font-bold text-slate-800 text-xs sm:text-sm uppercase tracking-wide cursor-pointer select-none"
        >
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center text-xs">2</span>
            <span>2. Identificação do Empreendedor e Propriedade</span>
          </div>
          {openSections.sec2 ? <ChevronUp className="w-5 h-5 text-slate-500" /> : <ChevronDown className="w-5 h-5 text-slate-500" />}
        </button>

        {openSections.sec2 && (
          <div className="p-4 sm:p-5 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nome do Empreendedor / Razão Social <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="Nome completo ou Razão Social"
                  value={data.damIdentification.propertyOrBusinessName}
                  onChange={e => onChange(p => ({
                    ...p,
                    damIdentification: { ...p.damIdentification, propertyOrBusinessName: e.target.value }
                  }))}
                  className="w-full text-xs sm:text-sm min-h-[44px] px-3 py-2 border border-slate-300 rounded-lg bg-slate-50/50"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  CPF ou CNPJ
                </label>
                <input
                  type="text"
                  placeholder="000.000.000-00 ou 00.000.000/0001-00"
                  className="w-full text-xs sm:text-sm min-h-[44px] px-3 py-2 border border-slate-300 rounded-lg bg-slate-50/50"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Figura Jurídica
                </label>
                <select className="w-full text-xs sm:text-sm min-h-[44px] px-3 py-2 border border-slate-300 rounded-lg bg-slate-50/50">
                  <option value="empresa_privada">Empresa Privada</option>
                  <option value="pessoa_fisica">Pessoa Física</option>
                  <option value="orgao_publico">Órgão Público</option>
                  <option value="cooperativa">Cooperativa / Associação</option>
                  <option value="outra">Outra</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Processo SEMA
                </label>
                <input
                  type="text"
                  placeholder="ex: PROC-2026/04812"
                  className="w-full text-xs sm:text-sm min-h-[44px] px-3 py-2 border border-slate-300 rounded-lg bg-slate-50/50"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Telefone / WhatsApp
                </label>
                <input
                  type="text"
                  placeholder="(65) 99999-0000"
                  className="w-full text-xs sm:text-sm min-h-[44px] px-3 py-2 border border-slate-300 rounded-lg bg-slate-50/50"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Endereço / Localização da Propriedade
                </label>
                <input
                  type="text"
                  placeholder="Rodovia, Km, Zona Rural"
                  className="w-full text-xs sm:text-sm min-h-[44px] px-3 py-2 border border-slate-300 rounded-lg bg-slate-50/50"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  E-mail
                </label>
                <input
                  type="email"
                  placeholder="contato@fazenda.com.br"
                  className="w-full text-xs sm:text-sm min-h-[44px] px-3 py-2 border border-slate-300 rounded-lg bg-slate-50/50"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  CAR / Recibo de Inscrição
                </label>
                <input
                  type="text"
                  placeholder="MT-XXXXXXX-..."
                  value={data.damIdentification.regulatoryStatus.carNumber}
                  onChange={e => onChange(p => ({
                    ...p,
                    damIdentification: {
                      ...p.damIdentification,
                      regulatoryStatus: { ...p.damIdentification.regulatoryStatus, carNumber: e.target.value }
                    }
                  }))}
                  className="w-full text-xs sm:text-sm min-h-[44px] px-3 py-2 border border-slate-300 rounded-lg bg-slate-50/50"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Declaração de Uso / Outorga
                </label>
                <input
                  type="text"
                  placeholder="Nº da outorga ou dispensa"
                  value={data.damIdentification.regulatoryStatus.permitNumber}
                  onChange={e => onChange(p => ({
                    ...p,
                    damIdentification: {
                      ...p.damIdentification,
                      regulatoryStatus: { ...p.damIdentification.regulatoryStatus, permitNumber: e.target.value }
                    }
                  }))}
                  className="w-full text-xs sm:text-sm min-h-[44px] px-3 py-2 border border-slate-300 rounded-lg bg-slate-50/50"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Quantidade de Barragens no Imóvel
                </label>
                <input
                  type="number"
                  defaultValue="1"
                  min="1"
                  className="w-full text-xs sm:text-sm min-h-[44px] px-3 py-2 border border-slate-300 rounded-lg bg-slate-50/50"
                />
              </div>
            </div>

            <div>
              <SpeechTextarea
                label="Comentários da Seção 2:"
                rows={2}
                value={sectionComments.sec2 || ''}
                onValueChange={val => updateSectionComment('sec2', val)}
                placeholder="Anotações sobre documentação, posse, arrendamento..."
              />
            </div>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* SEÇÃO 3: USOS DA BARRAGEM */}
      {/* ========================================================================= */}
      <div id="sec-topico-3" className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden scroll-mt-24 transition-all">
        <button
          type="button"
          onClick={() => toggleSection('sec3')}
          className="w-full p-4 bg-slate-50 flex items-center justify-between font-bold text-slate-800 text-xs sm:text-sm uppercase tracking-wide cursor-pointer select-none"
        >
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center text-xs">3</span>
            <span>3. Usos da Barragem</span>
          </div>
          {openSections.sec3 ? <ChevronUp className="w-5 h-5 text-slate-500" /> : <ChevronDown className="w-5 h-5 text-slate-500" />}
        </button>

        {openSections.sec3 && (
          <div className="p-4 sm:p-5 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Finalidade de Uso Principal <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="ex: Irrigação de lavoura, Dessedentação de gado, Piscicultura"
                  value={data.damIdentification.mainWaterUse}
                  onChange={e => onChange(p => ({
                    ...p,
                    damIdentification: { ...p.damIdentification, mainWaterUse: e.target.value }
                  }))}
                  className="w-full text-xs sm:text-sm min-h-[44px] px-3 py-2 border border-slate-300 rounded-lg bg-slate-50/50"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Outros Usos Secundários?
                </label>
                <div className="flex items-center gap-4 min-h-[44px]">
                  <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
                    <input
                      type="radio"
                      name="outrosUsos"
                      checked={data.damIdentification.secondaryWaterUses.length > 0}
                      onChange={() => onChange(p => ({
                        ...p,
                        damIdentification: {
                          ...p.damIdentification,
                          secondaryWaterUses: ['Dessedentação animal']
                        }
                      }))}
                      className="w-4 h-4 text-emerald-600"
                    />
                    <span>Sim</span>
                  </label>
                  <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
                    <input
                      type="radio"
                      name="outrosUsos"
                      checked={data.damIdentification.secondaryWaterUses.length === 0}
                      onChange={() => onChange(p => ({
                        ...p,
                        damIdentification: {
                          ...p.damIdentification,
                          secondaryWaterUses: []
                        }
                      }))}
                      className="w-4 h-4 text-emerald-600"
                    />
                    <span>Não</span>
                  </label>
                </div>
              </div>
            </div>

            {data.damIdentification.secondaryWaterUses.length > 0 && (
              <div className="pt-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Quais usos secundários?
                </label>
                <input
                  type="text"
                  placeholder="ex: Lazer/Pesca, Dessedentação animal, Abastecimento de pulverizadores"
                  value={data.damIdentification.secondaryWaterUses.join(', ')}
                  onChange={e => {
                    const list = e.target.value.split(',').map(s => s.trim()).filter(Boolean);
                    onChange(p => ({
                      ...p,
                      damIdentification: { ...p.damIdentification, secondaryWaterUses: list }
                    }));
                  }}
                  className="w-full text-xs sm:text-sm min-h-[44px] px-3 py-2 border border-slate-300 rounded-lg bg-slate-50/50"
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* SEÇÃO 4: CARACTERÍSTICAS TÉCNICAS (AFERIÇÃO DE MEDIDAS) */}
      {/* ========================================================================= */}
      <div id="sec-topico-4" className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden scroll-mt-24 transition-all">
        <button
          type="button"
          onClick={() => toggleSection('sec4')}
          className="w-full p-4 bg-slate-50 flex items-center justify-between font-bold text-slate-800 text-xs sm:text-sm uppercase tracking-wide cursor-pointer select-none"
        >
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center text-xs">4</span>
            <span>4. Características Técnicas (Aferição de Medidas)</span>
          </div>
          {openSections.sec4 ? <ChevronUp className="w-5 h-5 text-slate-500" /> : <ChevronDown className="w-5 h-5 text-slate-500" />}
        </button>

        {openSections.sec4 && (
          <div className="p-4 sm:p-5 space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Altura da Barragem (m)
                </label>
                <input
                  type="text"
                  placeholder="ex: 4.8"
                  value={data.damIdentification.estimatedDimensions.heightMeters}
                  onChange={e => onChange(p => ({
                    ...p,
                    damIdentification: {
                      ...p.damIdentification,
                      estimatedDimensions: { ...p.damIdentification.estimatedDimensions, heightMeters: e.target.value }
                    }
                  }))}
                  className="w-full text-xs sm:text-sm min-h-[44px] p-2.5 border rounded-lg bg-slate-50"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Distância (Crista – Pé) (m)
                </label>
                <input
                  type="text"
                  placeholder="ex: 18.0"
                  className="w-full text-xs sm:text-sm min-h-[44px] p-2.5 border rounded-lg bg-slate-50"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Declividade Talude Jusante (°)
                </label>
                <input
                  type="text"
                  placeholder="ex: 28°"
                  className="w-full text-xs sm:text-sm min-h-[44px] p-2.5 border rounded-lg bg-slate-50"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Largura do Coroamento (m)
                </label>
                <input
                  type="text"
                  placeholder="ex: 4.5"
                  value={data.damIdentification.estimatedDimensions.crestWidthMeters}
                  onChange={e => onChange(p => ({
                    ...p,
                    damIdentification: {
                      ...p.damIdentification,
                      estimatedDimensions: { ...p.damIdentification.estimatedDimensions, crestWidthMeters: e.target.value }
                    }
                  }))}
                  className="w-full text-xs sm:text-sm min-h-[44px] p-2.5 border rounded-lg bg-slate-50"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Extensão do Coroamento (m)
                </label>
                <input
                  type="text"
                  placeholder="ex: 150.0"
                  value={data.damIdentification.estimatedDimensions.crestLengthMeters}
                  onChange={e => onChange(p => ({
                    ...p,
                    damIdentification: {
                      ...p.damIdentification,
                      estimatedDimensions: { ...p.damIdentification.estimatedDimensions, crestLengthMeters: e.target.value }
                    }
                  }))}
                  className="w-full text-xs sm:text-sm min-h-[44px] p-2.5 border rounded-lg bg-slate-50"
                />
              </div>
            </div>

            {/* Tipo de Material */}
            <div className="pt-2">
              <label className="block text-xs font-bold text-slate-800 mb-2">
                Tipo de Barragem Quanto ao Material – Definição:
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {[
                  { id: 'terra_homogenea', label: 'Barragem de Terra Homogênea' },
                  { id: 'terra_zoneada', label: 'Barragem de Terra Zoneada' },
                  { id: 'enrocamento', label: 'Barragem de Enrocamento' },
                  { id: 'terra_enrocamento', label: 'Barragem de Terra / Enrocamento' },
                  { id: 'aterro_barragem', label: 'Aterro Barragem' }
                ].map(mat => (
                  <label
                    key={mat.id}
                    className={`min-h-[44px] flex items-center gap-2 p-2.5 rounded-lg border text-xs font-medium cursor-pointer transition ${
                      data.damIdentification.damType === mat.id
                        ? 'bg-emerald-50 border-emerald-500 text-emerald-950 font-bold ring-1 ring-emerald-400'
                        : 'bg-slate-50/60 border-slate-200 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <input
                      type="radio"
                      name="damMaterial"
                      checked={data.damIdentification.damType === mat.id}
                      onChange={() => onChange(p => ({
                        ...p,
                        damIdentification: { ...p.damIdentification, damType: mat.id as DamType }
                      }))}
                      className="w-4 h-4 text-emerald-600"
                    />
                    <span>{mat.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <SpeechTextarea
                label="Comentários da Seção 4:"
                rows={2}
                value={sectionComments.sec4 || ''}
                onValueChange={val => updateSectionComment('sec4', val)}
                placeholder="Particularidades das medições em campo..."
              />
            </div>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* TÓPICO: COMPONENTES DA BARRAGEM */}
      {/* ========================================================================= */}
      <div id="sec-topico-5" className="bg-white rounded-xl border-2 border-emerald-600/30 shadow-xs overflow-hidden scroll-mt-24 transition-all">
        <button
          type="button"
          onClick={() => toggleSection('secComponentes')}
          className="w-full p-4 bg-gradient-to-r from-emerald-50 via-teal-50 to-slate-50 border-b border-emerald-100 flex items-center justify-between font-bold text-slate-800 text-xs sm:text-sm uppercase tracking-wide cursor-pointer select-none transition-colors hover:from-emerald-100/70 hover:to-slate-100"
        >
          <div className="flex items-center gap-2.5">
            <span className="w-7 h-7 rounded-lg bg-emerald-600 text-white flex items-center justify-center text-xs font-bold shadow-xs">
              5
            </span>
            <div className="text-left">
              <span className="font-extrabold text-slate-900 block text-xs sm:text-sm">
                5. COMPONENTES DA BARRAGEM
              </span>
              <span className="text-[11px] font-normal text-slate-600 normal-case hidden sm:inline">
                Subtópicos de inspeção: Talude de Montante, Coroamento, Talude de Jusante, Região a Jusante, Instrumentação, Estruturas Vertedoras e Reservatório
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 text-emerald-700">
            <span className="text-xs font-semibold hidden md:inline">
              {openSections.secComponentes ? 'Recolher' : 'Expandir'}
            </span>
            {openSections.secComponentes ? <ChevronUp className="w-5 h-5 text-emerald-700" /> : <ChevronDown className="w-5 h-5 text-emerald-700" />}
          </div>
        </button>

        {openSections.secComponentes && (
          <div className="p-3 sm:p-5 space-y-4 bg-slate-50/40">
            {/* ========================================================================= */}
            {/* SUBTÓPICO 5.1: TALUDE DE MONTANTE */}
            {/* ========================================================================= */}
            <div id="sec-subtopico-5-1" className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden scroll-mt-24 transition-all">
              <button
                type="button"
                onClick={() => toggleSection('sec5')}
                className="w-full p-3.5 sm:p-4 bg-slate-50 flex items-center justify-between font-bold text-slate-800 text-xs sm:text-sm uppercase tracking-wide cursor-pointer select-none hover:bg-slate-100/70 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center text-xs font-bold">5.1</span>
                  <span>5.1. Talude de Montante</span>
                </div>
                {openSections.sec5 ? <ChevronUp className="w-5 h-5 text-slate-500" /> : <ChevronDown className="w-5 h-5 text-slate-500" />}
              </button>

        {openSections.sec5 && (
          <div className="p-4 sm:p-5 space-y-4">
            {/* Barra de Ações Rápidas de Campo (Mobile & Tablet) */}
            {(() => {
              const stats = getComponentEvaluationStats('montante', MONTANTE_ITEMS);
              return (
                <div className="flex flex-wrap items-center justify-between gap-2.5 p-3 rounded-xl bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-800 shadow-2xs">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-bold px-2.5 py-1 rounded-lg flex items-center gap-1.5 ${
                      stats.isComplete
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700'
                        : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-300 dark:border-amber-700'
                    }`}>
                      {stats.isComplete ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> : <AlertCircle className="w-3.5 h-3.5 text-amber-600" />}
                      <span>{stats.evaluated}/{stats.total} avaliados</span>
                    </span>
                    {stats.withAnomalies > 0 && (
                      <span className="text-xs font-extrabold px-2 py-0.5 rounded-lg bg-rose-100 text-rose-800 border border-rose-300 animate-pulse">
                        {stats.withAnomalies} anomalia(s)
                      </span>
                    )}
                  </div>

                  {stats.pending > 0 && (
                    <button
                      type="button"
                      onClick={() => handleBulkMarkComponentPendingAsNo('montante', 'Talude de Montante', MONTANTE_ITEMS)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold text-xs shadow-xs transition cursor-pointer select-none"
                      title="Preenche todos os itens não respondidos do Talude de Montante como 'Não' (Sem anomalias)"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>Preencher {stats.pending} pendente(s) como "Não"</span>
                    </button>
                  )}
                </div>
              );
            })()}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <EvaluationItemCard
                componentCode="montante"
                componentName="Talude de Montante"
                itemCode="erosoes"
                itemLabel="Erosões"
                value={getItem('montante', 'erosoes', 'Erosões')}
                onChange={updateItemAvaliado}
                showLocationOnYes
                photos={data.photos || []}
                onAddPhoto={handleAddDirectPhoto}
              />
              <EvaluationItemCard
                componentCode="montante"
                componentName="Talude de Montante"
                itemCode="escorregamento"
                itemLabel="Escorregamento"
                value={getItem('montante', 'escorregamento', 'Escorregamento')}
                onChange={updateItemAvaliado}
                showLocationOnYes
                photos={data.photos || []}
                onAddPhoto={handleAddDirectPhoto}
              />
              <EvaluationItemCard
                componentCode="montante"
                componentName="Talude de Montante"
                itemCode="afundamento"
                itemLabel="Afundamento e/ou Buracos"
                value={getItem('montante', 'afundamento', 'Afundamento e/ou Buracos')}
                onChange={updateItemAvaliado}
                photos={data.photos || []}
                onAddPhoto={handleAddDirectPhoto}
              />
              <EvaluationItemCard
                componentCode="montante"
                componentName="Talude de Montante"
                itemCode="arvores_arbustos"
                itemLabel="Árvores e Arbustos"
                value={getItem('montante', 'arvores_arbustos', 'Árvores e Arbustos')}
                onChange={updateItemAvaliado}
                photos={data.photos || []}
                onAddPhoto={handleAddDirectPhoto}
              />
              <EvaluationItemCard
                componentCode="montante"
                componentName="Talude de Montante"
                itemCode="drenos_canaletas"
                itemLabel="Drenos / Canaletas"
                value={getItem('montante', 'drenos_canaletas', 'Drenos / Canaletas')}
                onChange={updateItemAvaliado}
                showConservationOnYes
                photos={data.photos || []}
                onAddPhoto={handleAddDirectPhoto}
              />
              <EvaluationItemCard
                componentCode="montante"
                componentName="Talude de Montante"
                itemCode="biologicos"
                itemLabel="Formigueiros / Cupinzeiros / Tocas de Animais"
                value={getItem('montante', 'biologicos', 'Formigueiros / Cupinzeiros / Tocas')}
                onChange={updateItemAvaliado}
                photos={data.photos || []}
                onAddPhoto={handleAddDirectPhoto}
              />
              <EvaluationItemCard
                componentCode="montante"
                componentName="Talude de Montante"
                itemCode="sinais_movimentacao"
                itemLabel="Sinais de Movimentação"
                value={getItem('montante', 'sinais_movimentacao', 'Sinais de Movimentação')}
                onChange={updateItemAvaliado}
                photos={data.photos || []}
                onAddPhoto={handleAddDirectPhoto}
              />
            </div>

            {/* Proteção do Talude de Montante */}
            <div className="pt-2">
              <label className="block text-xs font-bold text-slate-800 mb-2">
                Proteção do Talude:
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-6 gap-2">
                {['RIP RAP', 'Grama', 'Concreto', 'Cascalho', 'Ausente', 'Outros'].map(prot => (
                  <label key={prot} className="min-h-[40px] flex items-center gap-2 p-2 rounded-lg border border-slate-200 text-xs cursor-pointer hover:bg-slate-50">
                    <input type="checkbox" className="w-4 h-4 text-emerald-600 rounded" />
                    <span>{prot}</span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <SpeechTextarea
                label="Comentários - Talude de Montante:"
                rows={2}
                value={sectionComments.talude_montante || ''}
                onValueChange={val => updateSectionComment('talude_montante', val)}
                placeholder="Observações complementares deste talude..."
              />
              <FieldCommentChips
                suggestions={['Sem anomalias visíveis', 'Talude estável sem trincas', 'Vegetação roçada e conservada', 'Drenos desobstruídos']}
                currentValue={sectionComments.talude_montante || ''}
                onAppend={val => updateSectionComment('talude_montante', val)}
              />
            </div>

            {/* Campo para fotos inseridas no componente Talude de Montante */}
            <ComponentPhotoUploader
              componentId="talude_montante"
              componentName="Talude de Montante"
              allPhotos={data.photos || []}
              onUpdatePhotos={handleUpdatePhotos}
              inspectionId={data.id}
            />
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* SUBTÓPICO 5.2: COROAMENTO (CRISTA) */}
      {/* ========================================================================= */}
      <div id="sec-subtopico-5-2" className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden scroll-mt-24 transition-all">
        <button
          type="button"
          onClick={() => toggleSection('sec6')}
          className="w-full p-3.5 sm:p-4 bg-slate-50 flex items-center justify-between font-bold text-slate-800 text-xs sm:text-sm uppercase tracking-wide cursor-pointer select-none hover:bg-slate-100/70 transition-colors"
        >
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center text-xs font-bold">5.2</span>
            <span>5.2. Coroamento (Crista)</span>
          </div>
          {openSections.sec6 ? <ChevronUp className="w-5 h-5 text-slate-500" /> : <ChevronDown className="w-5 h-5 text-slate-500" />}
        </button>

        {openSections.sec6 && (
          <div className="p-4 sm:p-5 space-y-4">
            {/* Barra de Ações Rápidas de Campo (Mobile & Tablet) */}
            {(() => {
              const stats = getComponentEvaluationStats('coroamento', COROAMENTO_ITEMS);
              return (
                <div className="flex flex-wrap items-center justify-between gap-2.5 p-3 rounded-xl bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-800 shadow-2xs">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-bold px-2.5 py-1 rounded-lg flex items-center gap-1.5 ${
                      stats.isComplete
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700'
                        : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-300 dark:border-amber-700'
                    }`}>
                      {stats.isComplete ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> : <AlertCircle className="w-3.5 h-3.5 text-amber-600" />}
                      <span>{stats.evaluated}/{stats.total} avaliados</span>
                    </span>
                    {stats.withAnomalies > 0 && (
                      <span className="text-xs font-extrabold px-2 py-0.5 rounded-lg bg-rose-100 text-rose-800 border border-rose-300 animate-pulse">
                        {stats.withAnomalies} anomalia(s)
                      </span>
                    )}
                  </div>

                  {stats.pending > 0 && (
                    <button
                      type="button"
                      onClick={() => handleBulkMarkComponentPendingAsNo('coroamento', 'Coroamento (Crista)', COROAMENTO_ITEMS)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold text-xs shadow-xs transition cursor-pointer select-none"
                      title="Preenche todos os itens não respondidos do Coroamento como 'Não' (Sem anomalias)"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>Preencher {stats.pending} pendente(s) como "Não"</span>
                    </button>
                  )}
                </div>
              );
            })()}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <EvaluationItemCard
                componentCode="coroamento"
                componentName="Coroamento (Crista)"
                itemCode="erosoes"
                itemLabel="Erosões"
                value={getItem('coroamento', 'erosoes', 'Erosões')}
                onChange={updateItemAvaliado}
                showLocationOnYes
                photos={data.photos || []}
                onAddPhoto={handleAddDirectPhoto}
              />
              <EvaluationItemCard
                componentCode="coroamento"
                componentName="Coroamento (Crista)"
                itemCode="rachaduras"
                itemLabel="Rachaduras / Trincas"
                value={getItem('coroamento', 'rachaduras', 'Rachaduras')}
                onChange={updateItemAvaliado}
                showLocationOnYes
                photos={data.photos || []}
                onAddPhoto={handleAddDirectPhoto}
              />
              <EvaluationItemCard
                componentCode="coroamento"
                componentName="Coroamento (Crista)"
                itemCode="revestimento"
                itemLabel="Revestimento da Pista"
                value={getItem('coroamento', 'revestimento', 'Revestimento')}
                onChange={updateItemAvaliado}
                photos={data.photos || []}
                onAddPhoto={handleAddDirectPhoto}
              />
              <EvaluationItemCard
                componentCode="coroamento"
                componentName="Coroamento (Crista)"
                itemCode="afundamento"
                itemLabel="Afundamento e/ou Buracos"
                value={getItem('coroamento', 'afundamento', 'Afundamento e/ou Buracos')}
                onChange={updateItemAvaliado}
                showLocationOnYes
                photos={data.photos || []}
                onAddPhoto={handleAddDirectPhoto}
              />
              <EvaluationItemCard
                componentCode="coroamento"
                componentName="Coroamento (Crista)"
                itemCode="arvores_arbustos"
                itemLabel="Árvores e Arbustos"
                value={getItem('coroamento', 'arvores_arbustos', 'Árvores e Arbustos')}
                onChange={updateItemAvaliado}
                photos={data.photos || []}
                onAddPhoto={handleAddDirectPhoto}
              />
              <EvaluationItemCard
                componentCode="coroamento"
                componentName="Coroamento (Crista)"
                itemCode="drenos_canaletas"
                itemLabel="Drenos / Canaletas"
                value={getItem('coroamento', 'drenos_canaletas', 'Drenos / Canaletas')}
                onChange={updateItemAvaliado}
                showConservationOnYes
                photos={data.photos || []}
                onAddPhoto={handleAddDirectPhoto}
              />
              <EvaluationItemCard
                componentCode="coroamento"
                componentName="Coroamento (Crista)"
                itemCode="meio_fio"
                itemLabel="Possui Meio-Fio"
                value={getItem('coroamento', 'meio_fio', 'Possui Meio Fio')}
                onChange={updateItemAvaliado}
                showConservationOnYes
                photos={data.photos || []}
                onAddPhoto={handleAddDirectPhoto}
              />
              <EvaluationItemCard
                componentCode="coroamento"
                componentName="Coroamento (Crista)"
                itemCode="ameaca_transbordamento"
                itemLabel="Ameaça de Transbordamento (Borda Livre < 0,5m)"
                value={getItem('coroamento', 'ameaca_transbordamento', 'Ameaça de Transbordamento')}
                onChange={updateItemAvaliado}
                photos={data.photos || []}
                onAddPhoto={handleAddDirectPhoto}
              />
            </div>

            {/* Conservação das Ombreiras */}
            <div className="pt-2 border-t border-slate-100">
              <label className="block text-xs font-bold text-slate-800 mb-2">
                Estado de Conservação das Ombreiras:
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Ombreira Esquerda:
                  </label>
                  <input
                    type="text"
                    placeholder="Condição visual, trincas, erosão no contato..."
                    className="w-full text-xs p-2.5 rounded-lg border border-slate-300 bg-slate-50"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Ombreira Direita:
                  </label>
                  <input
                    type="text"
                    placeholder="Condição visual, trincas, erosão no contato..."
                    className="w-full text-xs p-2.5 rounded-lg border border-slate-300 bg-slate-50"
                  />
                </div>
              </div>
            </div>

            <div>
              <SpeechTextarea
                label="Comentários - Coroamento:"
                rows={2}
                value={sectionComments.crista || ''}
                onValueChange={val => updateSectionComment('crista', val)}
                placeholder="Observações complementares do coroamento..."
              />
              <FieldCommentChips
                suggestions={['Pista regular sem afundamento', 'Borda livre adequada (>1,0m)', 'Sem trincas transversais', 'Meio-fio e drenagem íntegros']}
                currentValue={sectionComments.crista || ''}
                onAppend={val => updateSectionComment('crista', val)}
              />
            </div>

            {/* Campo para fotos inseridas no componente Crista (Coroamento) */}
            <ComponentPhotoUploader
              componentId="crista"
              componentName="Crista da Barragem (Coroamento)"
              allPhotos={data.photos || []}
              onUpdatePhotos={handleUpdatePhotos}
              inspectionId={data.id}
            />
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* SUBTÓPICO 5.3: TALUDE DE JUSANTE */}
      {/* ========================================================================= */}
      <div id="sec-subtopico-5-3" className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden scroll-mt-24 transition-all">
        <button
          type="button"
          onClick={() => toggleSection('sec7')}
          className="w-full p-3.5 sm:p-4 bg-slate-50 flex items-center justify-between font-bold text-slate-800 text-xs sm:text-sm uppercase tracking-wide cursor-pointer select-none hover:bg-slate-100/70 transition-colors"
        >
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center text-xs font-bold">5.3</span>
            <span>5.3. Talude de Jusante</span>
          </div>
          {openSections.sec7 ? <ChevronUp className="w-5 h-5 text-slate-500" /> : <ChevronDown className="w-5 h-5 text-slate-500" />}
        </button>

        {openSections.sec7 && (
          <div className="p-4 sm:p-5 space-y-4">
            {/* Barra de Ações Rápidas de Campo (Mobile & Tablet) */}
            {(() => {
              const stats = getComponentEvaluationStats('jusante', JUSANTE_ITEMS);
              return (
                <div className="flex flex-wrap items-center justify-between gap-2.5 p-3 rounded-xl bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-800 shadow-2xs">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-bold px-2.5 py-1 rounded-lg flex items-center gap-1.5 ${
                      stats.isComplete
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700'
                        : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-300 dark:border-amber-700'
                    }`}>
                      {stats.isComplete ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> : <AlertCircle className="w-3.5 h-3.5 text-amber-600" />}
                      <span>{stats.evaluated}/{stats.total} avaliados</span>
                    </span>
                    {stats.withAnomalies > 0 && (
                      <span className="text-xs font-extrabold px-2 py-0.5 rounded-lg bg-rose-100 text-rose-800 border border-rose-300 animate-pulse">
                        {stats.withAnomalies} anomalia(s)
                      </span>
                    )}
                  </div>

                  {stats.pending > 0 && (
                    <button
                      type="button"
                      onClick={() => handleBulkMarkComponentPendingAsNo('jusante', 'Talude de Jusante', JUSANTE_ITEMS)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold text-xs shadow-xs transition cursor-pointer select-none"
                      title="Preenche todos os itens não respondidos do Talude de Jusante como 'Não' (Sem anomalias)"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>Preencher {stats.pending} pendente(s) como "Não"</span>
                    </button>
                  )}
                </div>
              );
            })()}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <EvaluationItemCard
                componentCode="jusante"
                componentName="Talude de Jusante"
                itemCode="erosoes"
                itemLabel="Erosões"
                value={getItem('jusante', 'erosoes', 'Erosões')}
                onChange={updateItemAvaliado}
                showLocationOnYes
                photos={data.photos || []}
                onAddPhoto={handleAddDirectPhoto}
              />
              <EvaluationItemCard
                componentCode="jusante"
                componentName="Talude de Jusante"
                itemCode="escorregamento"
                itemLabel="Escorregamento"
                value={getItem('jusante', 'escorregamento', 'Escorregamento')}
                onChange={updateItemAvaliado}
                showLocationOnYes
                photos={data.photos || []}
                onAddPhoto={handleAddDirectPhoto}
              />
              <EvaluationItemCard
                componentCode="jusante"
                componentName="Talude de Jusante"
                itemCode="afundamento"
                itemLabel="Afundamento e/ou Buracos"
                value={getItem('jusante', 'afundamento', 'Afundamento e/ou Buracos')}
                onChange={updateItemAvaliado}
                photos={data.photos || []}
                onAddPhoto={handleAddDirectPhoto}
              />
              <EvaluationItemCard
                componentCode="jusante"
                componentName="Talude de Jusante"
                itemCode="arvores_arbustos"
                itemLabel="Árvores e Arbustos"
                value={getItem('jusante', 'arvores_arbustos', 'Árvores e Arbustos')}
                onChange={updateItemAvaliado}
                photos={data.photos || []}
                onAddPhoto={handleAddDirectPhoto}
              />
              <EvaluationItemCard
                componentCode="jusante"
                componentName="Talude de Jusante"
                itemCode="drenos_canaletas"
                itemLabel="Drenos / Canaletas"
                value={getItem('jusante', 'drenos_canaletas', 'Drenos / Canaletas')}
                onChange={updateItemAvaliado}
                showConservationOnYes
                photos={data.photos || []}
                onAddPhoto={handleAddDirectPhoto}
              />
              <EvaluationItemCard
                componentCode="jusante"
                componentName="Talude de Jusante"
                itemCode="biologicos"
                itemLabel="Formigueiros / Cupinzeiros / Tocas de Animais"
                value={getItem('jusante', 'biologicos', 'Formigueiros / Cupinzeiros / Tocas')}
                onChange={updateItemAvaliado}
                photos={data.photos || []}
                onAddPhoto={handleAddDirectPhoto}
              />
              <EvaluationItemCard
                componentCode="jusante"
                componentName="Talude de Jusante"
                itemCode="sinais_movimentacao"
                itemLabel="Sinais de Movimentação"
                value={getItem('jusante', 'sinais_movimentacao', 'Sinais de Movimentação')}
                onChange={updateItemAvaliado}
                photos={data.photos || []}
                onAddPhoto={handleAddDirectPhoto}
              />
              <EvaluationItemCard
                componentCode="jusante"
                componentName="Talude de Jusante"
                itemCode="fuga_agua"
                itemLabel="Sinais de Fuga D'Água ou Áreas Úmidas"
                value={getItem('jusante', 'fuga_agua', 'Sinais de Fuga D\'Água ou Áreas Úmidas')}
                onChange={updateItemAvaliado}
                showLocationOnYes
                photos={data.photos || []}
                onAddPhoto={handleAddDirectPhoto}
              />
              <EvaluationItemCard
                componentCode="jusante"
                componentName="Talude de Jusante"
                itemCode="carregamento_material"
                itemLabel="Carregamento de Material na Água dos Drenos (Piping)"
                value={getItem('jusante', 'carregamento_material', 'Carregamento de Material na Água dos Drenos')}
                onChange={updateItemAvaliado}
                photos={data.photos || []}
                onAddPhoto={handleAddDirectPhoto}
              />
            </div>

            <div>
              <SpeechTextarea
                label="Comentários - Talude de Jusante:"
                rows={2}
                value={sectionComments.talude_jusante || ''}
                onValueChange={val => updateSectionComment('talude_jusante', val)}
                placeholder="Observações complementares de surgências, minadouros..."
              />
              <FieldCommentChips
                suggestions={['Sem surgências ou umidade', 'Água dos drenos límpida', 'Encosta com boa cobertura vegetal', 'Sem sinais de piping']}
                currentValue={sectionComments.talude_jusante || ''}
                onAppend={val => updateSectionComment('talude_jusante', val)}
              />
            </div>

            {/* Campo para fotos inseridas no componente Talude de Jusante */}
            <ComponentPhotoUploader
              componentId="talude_jusante"
              componentName="Talude de Jusante"
              allPhotos={data.photos || []}
              onUpdatePhotos={handleUpdatePhotos}
              inspectionId={data.id}
            />
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* SUBTÓPICO 5.4: REGIÃO A JUSANTE DA BARRAGEM */}
      {/* ========================================================================= */}
      <div id="sec-subtopico-5-4" className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden scroll-mt-24 transition-all">
        <button
          type="button"
          onClick={() => toggleSection('sec8')}
          className="w-full p-3.5 sm:p-4 bg-slate-50 flex items-center justify-between font-bold text-slate-800 text-xs sm:text-sm uppercase tracking-wide cursor-pointer select-none hover:bg-slate-100/70 transition-colors"
        >
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center text-xs font-bold">5.4</span>
            <span>5.4. Região a Jusante da Barragem</span>
          </div>
          {openSections.sec8 ? <ChevronUp className="w-5 h-5 text-slate-500" /> : <ChevronDown className="w-5 h-5 text-slate-500" />}
        </button>

        {openSections.sec8 && (
          <div className="p-4 sm:p-5 space-y-4">
            {/* Barra de Ações Rápidas de Campo (Mobile & Tablet) */}
            {(() => {
              const stats = getComponentEvaluationStats('regiao_jusante', REGIAO_JUSANTE_ITEMS);
              return (
                <div className="flex flex-wrap items-center justify-between gap-2.5 p-3 rounded-xl bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-800 shadow-2xs">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-bold px-2.5 py-1 rounded-lg flex items-center gap-1.5 ${
                      stats.isComplete
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700'
                        : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-300 dark:border-amber-700'
                    }`}>
                      {stats.isComplete ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> : <AlertCircle className="w-3.5 h-3.5 text-amber-600" />}
                      <span>{stats.evaluated}/{stats.total} avaliados</span>
                    </span>
                    {stats.withAnomalies > 0 && (
                      <span className="text-xs font-extrabold px-2 py-0.5 rounded-lg bg-rose-100 text-rose-800 border border-rose-300 animate-pulse">
                        {stats.withAnomalies} anomalia(s)
                      </span>
                    )}
                  </div>

                  {stats.pending > 0 && (
                    <button
                      type="button"
                      onClick={() => handleBulkMarkComponentPendingAsNo('regiao_jusante', 'Região a Jusante', REGIAO_JUSANTE_ITEMS)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold text-xs shadow-xs transition cursor-pointer select-none"
                      title="Preenche todos os itens não respondidos da Região a Jusante como 'Não' (Sem anomalias)"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>Preencher {stats.pending} pendente(s) como "Não"</span>
                    </button>
                  )}
                </div>
              );
            })()}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <EvaluationItemCard
                componentCode="regiao_jusante"
                componentName="Região a Jusante da Barragem"
                itemCode="construcoes_leito"
                itemLabel="Construções Próximas ao Leito do Rio"
                value={getItem('regiao_jusante', 'construcoes_leito', 'Construções Próximas ao Leito do Rio')}
                onChange={updateItemAvaliado}
                showLocationOnYes
                photos={data.photos || []}
                onAddPhoto={handleAddDirectPhoto}
              />
              <EvaluationItemCard
                componentCode="regiao_jusante"
                componentName="Região a Jusante da Barragem"
                itemCode="fuga_agua"
                itemLabel="Fuga D'Água / Percolação Anormal"
                value={getItem('regiao_jusante', 'fuga_agua', 'Fuga D\'Água / Percolação Anormal')}
                onChange={updateItemAvaliado}
                showLocationOnYes
                photos={data.photos || []}
                onAddPhoto={handleAddDirectPhoto}
              />
              <EvaluationItemCard
                componentCode="regiao_jusante"
                componentName="Região a Jusante da Barragem"
                itemCode="erosao_cavernas"
                itemLabel="Erosão / Cavernas / Buracos"
                value={getItem('regiao_jusante', 'erosao_cavernas', 'Erosão / Cavernas / Buracos')}
                onChange={updateItemAvaliado}
                showLocationOnYes
                photos={data.photos || []}
                onAddPhoto={handleAddDirectPhoto}
              />
              <EvaluationItemCard
                componentCode="regiao_jusante"
                componentName="Região a Jusante da Barragem"
                itemCode="arvores_faixa_10m"
                itemLabel="Árvores e Arbustos na Faixa de 10 m – Pé da Barragem"
                value={getItem('regiao_jusante', 'arvores_faixa_10m', 'Árvores e Arbustos na Faixa de 10 m – Pé')}
                onChange={updateItemAvaliado}
                photos={data.photos || []}
                onAddPhoto={handleAddDirectPhoto}
              />
            </div>

            <div>
              <SpeechTextarea
                label="Comentários - Região a Jusante:"
                rows={2}
                value={sectionComments.area_jusante || ''}
                onValueChange={val => updateSectionComment('area_jusante', val)}
                placeholder="Presença de pontes, casas, estradas vicinais..."
              />
              <FieldCommentChips
                suggestions={['Sem construções vulneráveis no vale', 'Leito desimpedido sem barramentos', 'Faixa de 10m preservada']}
                currentValue={sectionComments.area_jusante || ''}
                onAppend={val => updateSectionComment('area_jusante', val)}
              />
            </div>

            {/* Campo para fotos inseridas no componente Região a Jusante */}
            <ComponentPhotoUploader
              componentId="area_jusante"
              componentName="Região a Jusante da Barragem"
              allPhotos={data.photos || []}
              onUpdatePhotos={handleUpdatePhotos}
              inspectionId={data.id}
            />
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* SUBTÓPICO 5.5: INSTRUMENTAÇÃO DE MONITORAMENTO */}
      {/* ========================================================================= */}
      <div id="sec-subtopico-5-5" className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden scroll-mt-24 transition-all">
        <button
          type="button"
          onClick={() => toggleSection('sec9')}
          className="w-full p-3.5 sm:p-4 bg-slate-50 flex items-center justify-between font-bold text-slate-800 text-xs sm:text-sm uppercase tracking-wide cursor-pointer select-none hover:bg-slate-100/70 transition-colors"
        >
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center text-xs font-bold">5.5</span>
            <span>5.5. Instrumentação de Monitoramento</span>
          </div>
          {openSections.sec9 ? <ChevronUp className="w-5 h-5 text-slate-500" /> : <ChevronDown className="w-5 h-5 text-slate-500" />}
        </button>

        {openSections.sec9 && (
          <div className="p-4 sm:p-5 space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {[
                'Piezômetro',
                'Marcos de Recalque',
                'Medidores de Vazão de Percolação',
                'Poços de Alívio',
                'Réguas Limnimétricas',
                'NÃO POSSUI'
              ].map(inst => (
                <label key={inst} className="min-h-[44px] flex items-center gap-2 p-2.5 rounded-lg border border-slate-200 text-xs cursor-pointer hover:bg-slate-50 font-medium">
                  <input type="checkbox" className="w-4 h-4 text-emerald-600 rounded" />
                  <span>{inst}</span>
                </label>
              ))}
            </div>

            <div>
              <SpeechTextarea
                label="Comentários - Instrumentação:"
                rows={2}
                value={sectionComments.instrumentacao || ''}
                onValueChange={val => updateSectionComment('instrumentacao', val)}
                placeholder="Leituras realizadas, conservação dos instrumentos..."
              />
            </div>

            {/* Campo para fotos inseridas no componente Instrumentação */}
            <ComponentPhotoUploader
              componentId="instrumentacao"
              componentName="Instrumentação de Monitoramento"
              allPhotos={data.photos || []}
              onUpdatePhotos={handleUpdatePhotos}
              inspectionId={data.id}
            />
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* SUBTÓPICO 5.6: ESTRUTURAS VERTEDORAS */}
      {/* ========================================================================= */}
      <div id="sec-subtopico-5-6" className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden scroll-mt-24 transition-all">
        <button
          type="button"
          onClick={() => toggleSection('sec10')}
          className="w-full p-3.5 sm:p-4 bg-slate-50 flex items-center justify-between font-bold text-slate-800 text-xs sm:text-sm uppercase tracking-wide cursor-pointer select-none hover:bg-slate-100/70 transition-colors"
        >
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center text-xs font-bold">5.6</span>
            <span>5.6. Estruturas Vertedoras (Vertedor, Monge, Ladrão, etc.)</span>
          </div>
          {openSections.sec10 ? <ChevronUp className="w-5 h-5 text-slate-500" /> : <ChevronDown className="w-5 h-5 text-slate-500" />}
        </button>

        {openSections.sec10 && (
          <div className="p-4 sm:p-5 space-y-4">
            <div>
              <SpeechTextarea
                label="Descrição (Quantidade, Dimensões e Localização):"
                rows={4}
                value={sectionComments.vertedouro || ''}
                onValueChange={val => updateSectionComment('vertedouro', val)}
                placeholder="ex: Vertedouro lateral escavado em rocha/solo na ombreira direita, largura de soleira 6,0m, canal de restituição com 40m de extensão. Desobstruído e funcional..."
              />
              <FieldCommentChips
                suggestions={['Vertedouro desobstruído e funcional', 'Estrutura de concreto íntegra', 'Canal de dissipação operante', 'Soleira livre sem entulhos']}
                currentValue={sectionComments.vertedouro || ''}
                onAppend={val => updateSectionComment('vertedouro', val)}
              />
            </div>

            {/* Campo para fotos inseridas no componente Estruturas Vertedoras */}
            <ComponentPhotoUploader
              componentId="vertedouro"
              componentName="Estruturas Vertedoras (Vertedouro, Extravasor)"
              allPhotos={data.photos || []}
              onUpdatePhotos={handleUpdatePhotos}
              inspectionId={data.id}
            />
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* SUBTÓPICO 5.7: RESERVATÓRIO */}
      {/* ========================================================================= */}
      <div id="sec-subtopico-5-7" className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden scroll-mt-24 transition-all">
        <button
          type="button"
          onClick={() => toggleSection('sec11')}
          className="w-full p-3.5 sm:p-4 bg-slate-50 flex items-center justify-between font-bold text-slate-800 text-xs sm:text-sm uppercase tracking-wide cursor-pointer select-none hover:bg-slate-100/70 transition-colors"
        >
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center text-xs font-bold">5.7</span>
            <span>5.7. Reservatório</span>
          </div>
          {openSections.sec11 ? <ChevronUp className="w-5 h-5 text-slate-500" /> : <ChevronDown className="w-5 h-5 text-slate-500" />}
        </button>

        {openSections.sec11 && (
          <div className="p-4 sm:p-5 space-y-4">
            {/* Barra de Ações Rápidas de Campo (Mobile & Tablet) */}
            {(() => {
              const stats = getComponentEvaluationStats('reservatorio', RESERVATORIO_ITEMS);
              return (
                <div className="flex flex-wrap items-center justify-between gap-2.5 p-3 rounded-xl bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-800 shadow-2xs">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-bold px-2.5 py-1 rounded-lg flex items-center gap-1.5 ${
                      stats.isComplete
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700'
                        : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-300 dark:border-amber-700'
                    }`}>
                      {stats.isComplete ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> : <AlertCircle className="w-3.5 h-3.5 text-amber-600" />}
                      <span>{stats.evaluated}/{stats.total} avaliados</span>
                    </span>
                    {stats.withAnomalies > 0 && (
                      <span className="text-xs font-extrabold px-2 py-0.5 rounded-lg bg-rose-100 text-rose-800 border border-rose-300 animate-pulse">
                        {stats.withAnomalies} anomalia(s)
                      </span>
                    )}
                  </div>

                  {stats.pending > 0 && (
                    <button
                      type="button"
                      onClick={() => handleBulkMarkComponentPendingAsNo('reservatorio', 'Reservatório', RESERVATORIO_ITEMS)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold text-xs shadow-xs transition cursor-pointer select-none"
                      title="Preenche todos os itens não respondidos do Reservatório como 'Não' (Sem anomalias)"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>Preencher {stats.pending} pendente(s) como "Não"</span>
                    </button>
                  )}
                </div>
              );
            })()}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <EvaluationItemCard
                componentCode="reservatorio"
                componentName="Reservatório"
                itemCode="erosoes_entorno"
                itemLabel="Erosões Próximas do Entorno"
                value={getItem('reservatorio', 'erosoes_entorno', 'Erosões Próximas do Entorno')}
                onChange={updateItemAvaliado}
                showLocationOnYes
                photos={data.photos || []}
                onAddPhoto={handleAddDirectPhoto}
              />
              <EvaluationItemCard
                componentCode="reservatorio"
                componentName="Reservatório"
                itemCode="assoreamento"
                itemLabel="Assoreamento"
                value={getItem('reservatorio', 'assoreamento', 'Assoreamento')}
                onChange={updateItemAvaliado}
                photos={data.photos || []}
                onAddPhoto={handleAddDirectPhoto}
              />
              <EvaluationItemCard
                componentCode="reservatorio"
                componentName="Reservatório"
                itemCode="desmoronamento_margens"
                itemLabel="Desmoronamento das Margens"
                value={getItem('reservatorio', 'desmoronamento_margens', 'Desmoronamento das Margens')}
                onChange={updateItemAvaliado}
                showLocationOnYes
                photos={data.photos || []}
                onAddPhoto={handleAddDirectPhoto}
              />
              <EvaluationItemCard
                componentCode="reservatorio"
                componentName="Reservatório"
                itemCode="vegetacao_aquatica"
                itemLabel="Vegetação Aquática Excessiva"
                value={getItem('reservatorio', 'vegetacao_aquatica', 'Vegetação Aquática Excessiva')}
                onChange={updateItemAvaliado}
                photos={data.photos || []}
                onAddPhoto={handleAddDirectPhoto}
              />
              <EvaluationItemCard
                componentCode="reservatorio"
                componentName="Reservatório"
                itemCode="gado_pastando"
                itemLabel="Gado Pastando no Entorno"
                value={getItem('reservatorio', 'gado_pastando', 'Gado Pastando no Entorno')}
                onChange={updateItemAvaliado}
                photos={data.photos || []}
                onAddPhoto={handleAddDirectPhoto}
              />
            </div>

            <div>
              <SpeechTextarea
                label="Comentários - Reservatório:"
                rows={2}
                value={sectionComments.reservatorio || ''}
                onValueChange={val => updateSectionComment('reservatorio', val)}
                placeholder="Qualidade da água, espelho d'água, encostas marginais..."
              />
              <FieldCommentChips
                suggestions={['Nível normal de operação', 'Margens estáveis sem erosão', 'Sem proliferação excessiva de macrófitas', 'Espelho d’água límpido']}
                currentValue={sectionComments.reservatorio || ''}
                onAppend={val => updateSectionComment('reservatorio', val)}
              />
            </div>

            {/* Campo para fotos inseridas no componente Reservatório */}
            <ComponentPhotoUploader
              componentId="reservatorio_borda"
              componentName="Reservatório, Borda Livre e Margens"
              allPhotos={data.photos || []}
              onUpdatePhotos={handleUpdatePhotos}
              inspectionId={data.id}
            />
          </div>
        )}
      </div>

          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* SEÇÃO 6: OUTROS PROBLEMAS E PESSOAS QUE ACOMPANHARAM */}
      {/* ========================================================================= */}
      <div id="sec-topico-6" className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden scroll-mt-24 transition-all">
        <button
          type="button"
          onClick={() => toggleSection('sec12')}
          className="w-full p-4 bg-slate-50 flex items-center justify-between font-bold text-slate-800 text-xs sm:text-sm uppercase tracking-wide cursor-pointer select-none"
        >
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center text-xs">6</span>
            <span>6. Outros Problemas e Pessoas que Acompanharam</span>
          </div>
          {openSections.sec12 ? <ChevronUp className="w-5 h-5 text-slate-500" /> : <ChevronDown className="w-5 h-5 text-slate-500" />}
        </button>

        {openSections.sec12 && (
          <div className="p-4 sm:p-5 space-y-4">
            <div>
              <SpeechTextarea
                label="Outros Problemas Existentes:"
                rows={3}
                value={sectionComments.outros_problemas || ''}
                onValueChange={val => updateSectionComment('outros_problemas', val)}
                placeholder="Anomalias ou questões não abordadas nos itens anteriores..."
              />
              <FieldCommentChips
                suggestions={['Propriedade com acesso livre e liberado', 'Acompanhado pelo responsável legal', 'Apresentou documentação no ato da vistoria', 'Sem outras anomalias observadas']}
                currentValue={sectionComments.outros_problemas || ''}
                onAppend={val => updateSectionComment('outros_problemas', val)}
              />
            </div>

            <div className="pt-2 border-t border-slate-100">
              <label className="block text-xs font-bold text-slate-800 mb-2">
                Relação de Pessoas que Acompanharam a Vistoria (Nome e CPF):
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input
                  type="text"
                  placeholder="Nome Completo do Acompanhante"
                  value={data.generalInfo.accompaniedBy.name}
                  onChange={e => onChange(p => ({
                    ...p,
                    generalInfo: {
                      ...p.generalInfo,
                      accompaniedBy: { ...p.generalInfo.accompaniedBy, name: e.target.value }
                    }
                  }))}
                  className="w-full text-xs sm:text-sm min-h-[44px] p-2.5 border rounded-lg bg-slate-50"
                />
                <input
                  type="text"
                  placeholder="CPF (000.000.000-00)"
                  value={data.generalInfo.accompaniedBy.document}
                  onChange={e => onChange(p => ({
                    ...p,
                    generalInfo: {
                      ...p.generalInfo,
                      accompaniedBy: { ...p.generalInfo.accompaniedBy, document: e.target.value }
                    }
                  }))}
                  className="w-full text-xs sm:text-sm min-h-[44px] p-2.5 border rounded-lg bg-slate-50"
                />
              </div>
            </div>

            {/* Campo para fotos de outros problemas / estruturas */}
            <ComponentPhotoUploader
              componentId="outros"
              componentName="Outros Problemas e Anomalias Gerais"
              allPhotos={data.photos || []}
              onUpdatePhotos={handleUpdatePhotos}
              inspectionId={data.id}
            />
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* ESPAÇO PARA ANEXAR FOTOS APÓS O PREENCHIMENTO E VINCULAR AOS COMPONENTES */}
      {/* ========================================================================= */}
      <div id="sec-topico-fotos" className="scroll-mt-24 transition-all">
        <GeneralPhotoAttachmentSection
          allPhotos={data.photos || []}
          onUpdatePhotos={handleUpdatePhotos}
          inspectionId={data.id}
        />
      </div>

      {/* Menu Flutuante de Tópicos e Subtópicos da Ficha */}
      <FloatingSheetNavMenu
        openSections={openSections}
        onNavigateToSection={handleNavigateToSection}
        onExpandAll={handleExpandAllSections}
        onCollapseAll={handleCollapseAllSections}
        photosCount={data.photos?.length || 0}
      />

      {/* Barra de Ações e Navegação Inferior (In-flow e Otimizada para Celular e Tablet) */}
      <div className="mt-8 pt-4 pb-28 lg:pb-8 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={onPrev}
          className="min-h-[46px] flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs sm:text-sm font-bold transition cursor-pointer active:scale-95 shadow-xs"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Voltar</span>
        </button>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => exportInspectionSheetPdf(data)}
            className="min-h-[46px] flex items-center gap-2 px-3.5 sm:px-4 py-2.5 rounded-xl border border-emerald-600 bg-emerald-50 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-200 hover:bg-emerald-100 dark:hover:bg-emerald-900 font-bold text-xs sm:text-sm transition cursor-pointer shadow-xs active:scale-95"
            title="Exportar ficha de vistoria oficial preenchida em formato PDF estilizado SEMA-MT com selo e fotos"
          >
            <FileDown className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
            <span className="hidden sm:inline">Exportar PDF</span>
            <span className="sm:hidden font-extrabold">PDF</span>
          </button>

          {onSave && (
            <button
              type="button"
              onClick={onSave}
              className="min-h-[46px] flex items-center gap-2 px-4 py-2.5 rounded-xl border border-emerald-300 dark:border-emerald-700 bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-slate-800 text-xs sm:text-sm font-bold transition cursor-pointer shadow-xs active:scale-95"
              title="Salvar dados da vistoria e registrar localização"
            >
              <Save className="w-4 h-4" />
              <span>Salvar</span>
            </button>
          )}

          <button
            type="button"
            onClick={onNext}
            className="min-h-[46px] flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold text-xs sm:text-sm shadow-md transition cursor-pointer"
          >
            <span>Fotos de Campo</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
