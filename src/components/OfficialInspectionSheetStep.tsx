import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  ChevronDown, 
  ChevronUp, 
  ChevronRight,
  ArrowLeft, 
  ArrowRight,
  ArrowUp,
  CheckCircle2,
  Save,
  FileDown,
  RefreshCw,
  Lock,
  AlertCircle,
  CalendarClock,
  PlayCircle,
  Sparkles,
  Check,
  Network,
  Link2,
  Send,
  FileSearch,
  HardHat,
  Layers,
  MapPin,
  Ruler,
  Droplets,
  UserCheck,
  Building2,
  ClipboardList,
  Camera,
  FolderOpen,
  Search,
  Calendar,
  Edit3,
  X,
  Play
} from 'lucide-react';
import { exportInspectionSheetPdf } from '../utils/exportInspectionSheetPdf';
import { MUNICIPALITIES_MT } from '../data/damComponents';
import { 
  InspectionData, 
  ItemAvaliadoEntity, 
  DamType,
  InspectionPhoto,
  ProdutoEcossistema,
  SistemaOrigem,
  EntidadeMestreTipo
} from '../types/inspection';
import {
  getNextVistoriaNumber,
  getAllInspections,
  loadAllInspectionsWithFallback,
  isSampleInspection,
  isInspectionEmpty
} from '../services/storage';
import {
  applyMasterSelectionToInspection,
  canFiscalizaEditMasterEntity,
  findProductsByDamOrOwner,
  registerSingleEntityToAdministra,
  subscribeEcosystemUpdates
} from '../services/administraEcosystemService';
import {
  findNewerCompletedInspectionsAlert,
  queryRelatedContextSummaryOnDemand,
  RelatedContextSummary
} from '../services/mesaVirtualService';
import { getSistemaLabel } from '../services/ecosystemConfig';
import { EcosystemImportedField } from './EcosystemImportedField';
import { EcosystemTopic2Lookup } from './EcosystemTopic2Lookup';
import { AdministraCadastroBanner } from './AdministraCadastroBanner';
import { VistoriaConclusaoBar } from './VistoriaConclusaoBar';
import { EvaluationItemCard } from './EvaluationItemCard';
import { LocationCaptureWidget } from './LocationCaptureWidget';
import { ComponentPhotoUploader } from './ComponentPhotoUploader';
import { GeneralPhotoAttachmentSection } from './GeneralPhotoAttachmentSection';
import { FiscalizaLogo } from './FiscalizaLogo';
import { FloatingSheetNavMenu } from './FloatingSheetNavMenu';
import { SpeechTextarea } from './SpeechTextarea';
import { FutureObservationChecklist } from './FutureObservationChecklist';

interface Props {
  data: InspectionData;
  onChange: (updater: (prev: InspectionData) => InspectionData) => void;
  onNext: () => void;
  onPrev: () => void;
  onSave?: () => void;
  onPersistInspection?: (updated?: InspectionData) => void;
  onSyncNow?: () => void;
  isSyncing?: boolean;
  savedInspections?: InspectionData[];
  onLoadSavedInspection?: (inspection: InspectionData, options?: { convertToAtual?: boolean }) => void;
  onOpenAuthModal?: () => void;
  onOpenEcosystemModal?: (options?: {
    tab?: 'status' | 'catalogo' | 'solicitacoes' | 'notificacoes';
    requestTarget?: {
      entidadeTipo: EntidadeMestreTipo;
      entidadeId: string;
      entidadeNome: string;
      sistemaDetentor: SistemaOrigem;
      campoSugerido?: string;
      valorAtualSugerido?: string;
    };
  }) => void;
  currentUser?: { id?: string; email?: string; fullName?: string; role?: string } | null;
}

export const OfficialInspectionSheetStep: React.FC<Props> = ({
  data,
  onChange,
  onNext,
  onPrev,
  onSave,
  onPersistInspection,
  onSyncNow,
  isSyncing = false,
  savedInspections,
  onLoadSavedInspection,
  onOpenAuthModal,
  onOpenEcosystemModal,
  currentUser
}) => {
  const [crossSystemProducts, setCrossSystemProducts] = useState<ProdutoEcossistema[]>([]);
  const [unlockedImportedFields, setUnlockedImportedFields] = useState<Record<string, boolean>>({});
  const unlockImportedField = (fieldKey: string) =>
    setUnlockedImportedFields(prev => ({ ...prev, [fieldKey]: true }));
  const importedOriginMap = data.importedFieldsOrigin || {};

  const [registeringEntity, setRegisteringEntity] = useState<Record<EntidadeMestreTipo, boolean>>({
    barragem: false,
    empreendedor: false,
    responsavel_tecnico: false
  });
  const [entityCadastroFeedback, setEntityCadastroFeedback] = useState<
    Partial<Record<EntidadeMestreTipo, { type: 'success' | 'error'; message: string }>>
  >({});

  // Seletor de "Vistoria Pré-Cadastrada" (fichas pré-salvas no sistema)
  const [showPreSavedPanel, setShowPreSavedPanel] = useState<boolean>(false);
  const [preSavedSearch, setPreSavedSearch] = useState<string>('');
  const [preSavedFilter, setPreSavedFilter] = useState<'futura' | 'draft' | 'all'>('all');
  const [isRefreshingPreSaved, setIsRefreshingPreSaved] = useState<boolean>(false);
  const [localSavedPool, setLocalSavedPool] = useState<InspectionData[]>(() => {
    const base = savedInspections && savedInspections.length > 0 ? savedInspections : getAllInspections();
    return base.filter(item => !isSampleInspection(item) && !isInspectionEmpty(item));
  });

  const refreshPreSavedSheets = useCallback(async () => {
    setIsRefreshingPreSaved(true);
    try {
      const loaded = await loadAllInspectionsWithFallback();
      const source = loaded.length > 0 ? loaded : (savedInspections || getAllInspections());
      setLocalSavedPool(source.filter(item => !isSampleInspection(item) && !isInspectionEmpty(item)));
    } catch {
      const fallback = (savedInspections || getAllInspections()).filter(
        item => !isSampleInspection(item) && !isInspectionEmpty(item)
      );
      setLocalSavedPool(fallback);
    } finally {
      setIsRefreshingPreSaved(false);
    }
  }, [savedInspections]);

  useEffect(() => {
    const source = savedInspections && savedInspections.length > 0 ? savedInspections : getAllInspections();
    setLocalSavedPool(source.filter(item => !isSampleInspection(item) && !isInspectionEmpty(item)));
  }, [savedInspections]);

  useEffect(() => {
    const handleStorageUpdate = () => {
      const updated = getAllInspections().filter(
        item => !isSampleInspection(item) && !isInspectionEmpty(item)
      );
      setLocalSavedPool(updated);
    };
    window.addEventListener('csb:notificacao_changed', handleStorageUpdate);
    return () => window.removeEventListener('csb:notificacao_changed', handleStorageUpdate);
  }, []);

  const preSavedFutureList = localSavedPool.filter(
    item => item.tipoPlanejamento === 'futura' || item.generalInfo?.tipoPlanejamento === 'futura'
  );
  const preSavedDraftList = localSavedPool.filter(item => item.isDraft);

  const filteredPreSavedSheets = localSavedPool
    .filter(item => {
      const isFuturaItem =
        item.tipoPlanejamento === 'futura' || item.generalInfo?.tipoPlanejamento === 'futura';
      if (preSavedFilter === 'futura' && !isFuturaItem) return false;
      if (preSavedFilter === 'draft' && !item.isDraft) return false;

      if (!preSavedSearch.trim()) return true;
      const q = preSavedSearch.trim().toLowerCase();
      const d = item.damIdentification;
      const g = item.generalInfo;
      return (
        (d.damName && d.damName.toLowerCase().includes(q)) ||
        (d.propertyOrBusinessName && d.propertyOrBusinessName.toLowerCase().includes(q)) ||
        (d.ownerCpfCnpj && d.ownerCpfCnpj.toLowerCase().includes(q)) ||
        (d.municipality && d.municipality.toLowerCase().includes(q)) ||
        (g.recordNumber && g.recordNumber.toLowerCase().includes(q)) ||
        (g.numeroVistoria && g.numeroVistoria.toLowerCase().includes(q))
      );
    })
    .sort((a, b) => {
      const aFut = a.tipoPlanejamento === 'futura' || a.generalInfo?.tipoPlanejamento === 'futura' ? 1 : 0;
      const bFut = b.tipoPlanejamento === 'futura' || b.generalInfo?.tipoPlanejamento === 'futura' ? 1 : 0;
      if (aFut !== bFut) return bFut - aFut;
      return (b.updatedAt || b.createdAt || '').localeCompare(a.updatedAt || a.createdAt || '');
    });

  const handleSelectPreSavedSheet = (target: InspectionData, convertToAtual: boolean) => {
    if (onLoadSavedInspection) {
      onLoadSavedInspection(target, { convertToAtual });
    } else {
      let prepared = target;
      if (convertToAtual) {
        const today = new Date().toISOString().split('T')[0];
        const nowTime = new Date().toTimeString().slice(0, 5);
        const nextNum = target.generalInfo?.numeroVistoria?.trim() || getNextVistoriaNumber();
        prepared = {
          ...target,
          tipoPlanejamento: 'atual',
          isDraft: true,
          generalInfo: {
            ...target.generalInfo,
            tipoPlanejamento: 'atual',
            numeroVistoria: nextNum,
            inspectionDate: target.generalInfo?.inspectionDate || today,
            startTime: target.generalInfo?.startTime || nowTime
          }
        };
      }
      onChange(() => prepared);
    }
    setUnlockedImportedFields({});
    setShowPreSavedPanel(false);
  };

  const [relatedContextSummary, setRelatedContextSummary] = useState<RelatedContextSummary | null>(null);

  const newerInspectionAlert = React.useMemo(
    () =>
      findNewerCompletedInspectionsAlert({
        currentInspection: data,
        allInspections: localSavedPool
      }),
    [data, localSavedPool]
  );

  React.useEffect(() => {
    const hasLookupKey = Boolean(
      data.barragemId ||
        data.empreendedorId ||
        (data.generalInfo?.recordNumber || '').trim().length >= 3
    );
    if (!hasLookupKey) {
      setRelatedContextSummary(null);
      return;
    }

    let active = true;
    const timer = window.setTimeout(async () => {
      try {
        const res = await queryRelatedContextSummaryOnDemand({
          barragemId: data.barragemId,
          empreendedorId: data.empreendedorId,
          barragemNome: data.damIdentification?.damName,
          empreendedorNome: data.damIdentification?.propertyOrBusinessName,
          processoNumero: data.generalInfo?.recordNumber,
          excludeVistoriaId: data.id,
          localInspections: localSavedPool
        });
        if (active) setRelatedContextSummary(res);
      } catch {
        // non-blocking
      }
    }, 350);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [
    data.id,
    data.barragemId,
    data.empreendedorId,
    data.damIdentification?.damName,
    data.damIdentification?.propertyOrBusinessName,
    data.generalInfo?.recordNumber,
    localSavedPool
  ]);

  React.useEffect(() => {
    let active = true;
    const refreshProducts = async () => {
      try {
        const list = await findProductsByDamOrOwner({
          barragemId: data.barragemId,
          empreendedorId: data.empreendedorId,
          barragemNome: data.damIdentification?.damName,
          empreendedorNome: data.damIdentification?.propertyOrBusinessName
        });
        if (active) {
          // Exibe preferencialmente produtos de outros registros ou outros sistemas
          setCrossSystemProducts(list.filter(p => p.origemRegistroId !== data.id));
        }
      } catch {}
    };
    refreshProducts();
    const unsub = subscribeEcosystemUpdates(refreshProducts);
    return () => {
      active = false;
      unsub();
    };
  }, [
    data.id,
    data.barragemId,
    data.empreendedorId,
    data.damIdentification?.damName,
    data.damIdentification?.propertyOrBusinessName
  ]);

  const damPerm = canFiscalizaEditMasterEntity(data.barragemOrigemSistema);
  const ownerPerm = canFiscalizaEditMasterEntity(data.empreendedorOrigemSistema);
  const rtPerm = canFiscalizaEditMasterEntity(
    data.responsavelTecnicoOrigemSistema || data.responsavelTecnico?.sistemaOrigem
  );
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

  // Comentários das seções e componentes persistidos diretamente na ficha (com suporte a ditado por voz)
  const sectionComments = data.sectionComments || {};
  const updateSectionComment = (key: string, text: string) => {
    onChange(prev => ({
      ...prev,
      sectionComments: {
        ...(prev.sectionComments || {}),
        [key]: text
      }
    }));
  };

  const handleRegisterEntityToAdministra = async (tipo: EntidadeMestreTipo) => {
    setRegisteringEntity(prev => ({ ...prev, [tipo]: true }));
    setEntityCadastroFeedback(prev => ({ ...prev, [tipo]: undefined }));
    try {
      const res = await registerSingleEntityToAdministra({
        tipo,
        inspection: data,
        actorEmail: data.createdByEmail
      });
      if (!res.success || !res.updatedInspection) {
        setEntityCadastroFeedback(prev => ({
          ...prev,
          [tipo]: {
            type: 'error',
            message: res.error || 'Não foi possível concluir o cadastro na base do Administra.'
          }
        }));
        return;
      }

      onChange(() => res.updatedInspection!);
      onPersistInspection?.(res.updatedInspection!);
      const label =
        tipo === 'barragem' ? 'Barragem' : tipo === 'empreendedor' ? 'Empreendedor' : 'Responsável Técnico';
      const successMsg = res.savedRemote
        ? `${label} cadastrado(a) e gravado(a) na base central do Administra com sucesso.`
        : `${label} registrado(a) na base local do Administra (aguardando sincronização remota).`;
      setEntityCadastroFeedback(prev => ({
        ...prev,
        [tipo]: {
          type: 'success',
          message: successMsg
        }
      }));
      showFieldToast(successMsg);
    } catch (err: any) {
      setEntityCadastroFeedback(prev => ({
        ...prev,
        [tipo]: {
          type: 'error',
          message: err?.message || 'Falha inesperada ao cadastrar na base do Administra.'
        }
      }));
    } finally {
      setRegisteringEntity(prev => ({ ...prev, [tipo]: false }));
    }
  };

  // Controle de altura do cabeçalho global e bloco/sub-bloco/componente congelado na tela
  const [stickyTopOffset, setStickyTopOffset] = useState<number>(108);
  const [isFrozenBarVisible, setIsFrozenBarVisible] = useState<boolean>(false);
  const [frozenContext, setFrozenContext] = useState<{
    blockId: string;
    blockSecKey: string;
    blockLabel: string;
    componentId?: string;
    componentSecKey?: string;
    componentParentKey?: string;
    componentLabel?: string;
    subblockLabel?: string;
    focusedItemLabel?: string;
  }>({
    blockId: 'sec-topico-1',
    blockSecKey: 'sec1',
    blockLabel: '1. Dados Gerais da Barragem',
    subblockLabel: '1A · Dados da Vistoria e Identificação'
  });

  const formRootRef = useRef<HTMLDivElement | null>(null);
  const frozenSentinelRef = useRef<HTMLDivElement | null>(null);
  const timersRef = useRef<number[]>([]);
  const toastTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const headerEl = document.querySelector('header');
    const fichaMenuEl = document.querySelector('[data-ficha-frozen-menu]');
    if (!headerEl && !fichaMenuEl) return;
    const updateOffset = () => {
      const headerHeight = headerEl ? Math.round(headerEl.getBoundingClientRect().height) : 0;
      const fichaMenuHeight = fichaMenuEl ? Math.round(fichaMenuEl.getBoundingClientRect().height) : 0;
      setStickyTopOffset(Math.max(0, headerHeight + fichaMenuHeight));
    };
    updateOffset();
    const ro = new ResizeObserver(updateOffset);
    if (headerEl) ro.observe(headerEl);
    if (fichaMenuEl) ro.observe(fichaMenuEl);
    window.addEventListener('resize', updateOffset);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', updateOffset);
    };
  }, []);

  useEffect(() => {
    return () => {
      timersRef.current.forEach(id => window.clearTimeout(id));
      timersRef.current = [];
      if (toastTimerRef.current !== null) {
        window.clearTimeout(toastTimerRef.current);
        toastTimerRef.current = null;
      }
    };
  }, []);

  const toggleSection = (key: string) => {
    setOpenSections(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // Navegação direta com abertura automática de tópicos e subtópicos
  const handleNavigateToSection = useCallback((sectionKey: string, elementId: string, parentKey?: string) => {
    setOpenSections(prev => {
      const next = { ...prev, [sectionKey]: true };
      if (parentKey) {
        next[parentKey] = true;
      }
      return next;
    });

    const scrollTimer = window.setTimeout(() => {
      const el = document.getElementById(elementId);
      if (el) {
        const barAllowance = 56;
        const headerOffset = stickyTopOffset + barAllowance;
        const elementPosition = el.getBoundingClientRect().top;
        const offsetPosition = elementPosition + window.pageYOffset - headerOffset;
        window.scrollTo({
          top: Math.max(0, offsetPosition),
          behavior: 'smooth'
        });
        el.classList.add('ring-2', 'ring-emerald-500', 'transition-all');
        const highlightTimer = window.setTimeout(() => {
          el.classList.remove('ring-2', 'ring-emerald-500');
        }, 2000);
        timersRef.current.push(highlightTimer);
      }
    }, 80);
    timersRef.current.push(scrollTimer);
  }, [stickyTopOffset]);

  // Monitora rolagem para manter atualizado e congelado o nome do bloco, sub-bloco e componente visível
  useEffect(() => {
    const syncFrozenContextFromScroll = () => {
      if (frozenSentinelRef.current) {
        const sentinelTop = frozenSentinelRef.current.getBoundingClientRect().top;
        setIsFrozenBarVisible(sentinelTop <= stickyTopOffset + 6);
      }

      const root = formRootRef.current;
      if (!root) return;

      const probeY = stickyTopOffset + 92;

      const blocks = Array.from(root.querySelectorAll<HTMLElement>('[data-form-block]'));
      let activeBlock = blocks[0];
      for (const b of blocks) {
        const r = b.getBoundingClientRect();
        if (r.top <= probeY && r.bottom > stickyTopOffset + 32) {
          activeBlock = b;
        }
      }
      if (!activeBlock) return;

      const components = Array.from(activeBlock.querySelectorAll<HTMLElement>('[data-form-component]'));
      let activeComponent: HTMLElement | undefined;
      for (const c of components) {
        const r = c.getBoundingClientRect();
        if (r.top <= probeY && r.bottom > stickyTopOffset + 32) {
          activeComponent = c;
        }
      }

      const subScope = activeComponent || activeBlock;
      const subblocks = Array.from(subScope.querySelectorAll<HTMLElement>('[data-form-subblock]'));
      let activeSubblock: HTMLElement | undefined;
      for (const s of subblocks) {
        const r = s.getBoundingClientRect();
        if (r.top <= probeY + 24 && r.bottom > stickyTopOffset + 32) {
          activeSubblock = s;
        }
      }

      setFrozenContext(prev => ({
        blockId: activeBlock.dataset.formBlockId || prev.blockId,
        blockSecKey: activeBlock.dataset.formBlockSeckey || prev.blockSecKey,
        blockLabel: activeBlock.dataset.formBlock || prev.blockLabel,
        componentId: activeComponent?.dataset.formComponentId,
        componentSecKey: activeComponent?.dataset.formComponentSeckey,
        componentParentKey: activeComponent?.dataset.formComponentParentkey,
        componentLabel: activeComponent?.dataset.formComponent,
        subblockLabel: activeSubblock?.dataset.formSubblock,
        focusedItemLabel: prev.focusedItemLabel
      }));
    };

    syncFrozenContextFromScroll();
    window.addEventListener('scroll', syncFrozenContextFromScroll, { passive: true });
    return () => window.removeEventListener('scroll', syncFrozenContextFromScroll);
  }, [stickyTopOffset, openSections]);

  // Atualiza imediatamente o contexto congelado ao tocar ou focar em qualquer campo/card
  const handleFormFocusOrPointer = useCallback((e: React.SyntheticEvent<HTMLElement>) => {
    const target = e.target as HTMLElement | null;
    if (!target) return;

    const blockEl = target.closest<HTMLElement>('[data-form-block]');
    if (!blockEl) return;

    const compEl = target.closest<HTMLElement>('[data-form-component]');
    const subEl = target.closest<HTMLElement>('[data-form-subblock]');
    const evalCard = target.closest<HTMLElement>('[data-eval-label]');

    setFrozenContext({
      blockId: blockEl.dataset.formBlockId || 'sec-topico-1',
      blockSecKey: blockEl.dataset.formBlockSeckey || 'sec1',
      blockLabel: blockEl.dataset.formBlock || '',
      componentId: compEl?.dataset.formComponentId,
      componentSecKey: compEl?.dataset.formComponentSeckey,
      componentParentKey: compEl?.dataset.formComponentParentkey,
      componentLabel: compEl?.dataset.formComponent,
      subblockLabel: subEl?.dataset.formSubblock,
      focusedItemLabel: evalCard?.dataset.evalLabel
    });
  }, []);

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
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => {
      setFieldQuickToast(null);
      toastTimerRef.current = null;
    }, 3500);
  };

  // Helper de Preenchimento Rápido em Campo no Celular e Tablet:
  // Marca pendentes como 'Não' (Sem anomalias) apenas para os itens que ainda estão 'sem_informacao',
  // preservando quaisquer anomalias 'sim' ou justificativas já registradas pelo usuário.
  const handleBulkMarkComponentPendingAsNo = (
    componentCode: string,
    componentName: string,
    itemsList: { code: string; label: string }[]
  ) => {
    const currentDetailed = data.itensAvaliadosDetalhados || {};
    const pendingItemsCount = itemsList.reduce((acc, it) => {
      const existing = currentDetailed[`${componentCode}_${it.code}`];
      return !existing || !existing.resposta || existing.resposta === 'sem_informacao'
        ? acc + 1
        : acc;
    }, 0);

    if (pendingItemsCount === 0) {
      showFieldToast(`Todos os itens de "${componentName}" já foram avaliados.`);
      return;
    }

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
        }
      });
      return {
        ...prev,
        itensAvaliadosDetalhados: detailed
      };
    });

    showFieldToast(`${pendingItemsCount} item(ns) pendente(s) em "${componentName}" marcado(s) como "Não (Normal)"`);
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

  // Ordem linear dos blocos/componentes para avanço rápido direto pela barra congelada
  const linearNavSteps: { id: string; secKey: string; parentKey?: string; label: string }[] = [
    { id: 'sec-topico-1', secKey: 'sec1', label: '1. Dados Gerais' },
    { id: 'sec-topico-2', secKey: 'sec2', label: '2. Empreendedor' },
    { id: 'sec-topico-3', secKey: 'sec3', label: '3. Usos' },
    { id: 'sec-topico-4', secKey: 'sec4', label: '4. Medidas Técnicas' },
    { id: 'sec-subtopico-5-1', secKey: 'sec5', parentKey: 'secComponentes', label: '5.1 Montante' },
    { id: 'sec-subtopico-5-2', secKey: 'sec6', parentKey: 'secComponentes', label: '5.2 Coroamento' },
    { id: 'sec-subtopico-5-3', secKey: 'sec7', parentKey: 'secComponentes', label: '5.3 Jusante' },
    { id: 'sec-subtopico-5-4', secKey: 'sec8', parentKey: 'secComponentes', label: '5.4 Região Jusante' },
    { id: 'sec-subtopico-5-5', secKey: 'sec9', parentKey: 'secComponentes', label: '5.5 Instrumentação' },
    { id: 'sec-subtopico-5-6', secKey: 'sec10', parentKey: 'secComponentes', label: '5.6 Vertedouro' },
    { id: 'sec-subtopico-5-7', secKey: 'sec11', parentKey: 'secComponentes', label: '5.7 Reservatório' },
    { id: 'sec-topico-6', secKey: 'sec12', label: '6. Outros Problemas' },
    { id: 'sec-topico-fotos', secKey: 'secFotos', label: '7. Fotos de Campo' }
  ];

  const activeNavStepId = frozenContext.componentId || frozenContext.blockId;
  const activeLinearIndex = Math.max(0, linearNavSteps.findIndex(s => s.id === activeNavStepId));
  const prevLinearStep = activeLinearIndex > 0 ? linearNavSteps[activeLinearIndex - 1] : null;
  const nextLinearStep = activeLinearIndex < linearNavSteps.length - 1 ? linearNavSteps[activeLinearIndex + 1] : null;

  // Sub-bloco visual coeso com título e borda estrutural bem definidos
  const SubBlockCard = ({
    code,
    title,
    icon: Icon,
    badge,
    action,
    children
  }: {
    code: string;
    title: string;
    icon?: React.ElementType;
    badge?: React.ReactNode;
    action?: React.ReactNode;
    children: React.ReactNode;
  }) => (
    <div
      data-form-subblock={`${code} · ${title}`}
      className="rounded-xl border border-slate-200/95 dark:border-slate-700/90 bg-slate-50/75 dark:bg-slate-950/60 p-3.5 sm:p-4 space-y-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-2 min-w-0">
          <span className="px-2 py-0.5 rounded-md bg-emerald-700 dark:bg-emerald-600 text-white text-[10px] font-black font-mono tracking-wider shrink-0">
            {code}
          </span>
          {Icon && <Icon className="w-4 h-4 text-emerald-700 dark:text-emerald-400 shrink-0" />}
          <h4 className="text-xs sm:text-sm font-extrabold text-slate-800 dark:text-slate-100 tracking-tight truncate">
            {title}
          </h4>
          {badge}
        </div>
        {action}
      </div>
      {children}
    </div>
  );

  // Rodapé explícito de encerramento de Bloco ou Componente com atalho direto ao próximo
  const BoundaryFooter = ({
    endLabel,
    nextLabel,
    onJumpNext,
    prevLabel,
    onJumpPrev
  }: {
    endLabel: string;
    nextLabel?: string;
    onJumpNext?: () => void;
    prevLabel?: string;
    onJumpPrev?: () => void;
  }) => (
    <div className="px-4 py-2.5 bg-slate-100/90 dark:bg-slate-950/85 border-t border-slate-200 dark:border-slate-800 rounded-b-[14px] flex flex-wrap items-center justify-between gap-2 text-[11px]">
      <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400 font-semibold">
        <span className="w-2 h-2 rounded-xs bg-slate-400 dark:bg-slate-600 shrink-0" />
        <span>Fim de {endLabel}</span>
      </div>
      <div className="flex items-center gap-2">
        {onJumpPrev && prevLabel && (
          <button
            type="button"
            onClick={onJumpPrev}
            className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-bold transition cursor-pointer flex items-center gap-1"
          >
            <ArrowLeft className="w-3 h-3" />
            <span>{prevLabel}</span>
          </button>
        )}
        {onJumpNext && nextLabel && (
          <button
            type="button"
            onClick={onJumpNext}
            className="px-2.5 py-1 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white font-bold transition cursor-pointer flex items-center gap-1 shadow-2xs"
          >
            <span>Próximo: {nextLabel}</span>
            <ArrowRight className="w-3 h-3" />
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div
      ref={formRootRef}
      onFocusCapture={handleFormFocusOrPointer}
      onPointerDownCapture={handleFormFocusOrPointer}
      className="space-y-6 sm:space-y-7 pb-4 sm:pb-6"
    >
      {/* BARRA CONGELADA DE CONTEXTO ATIVO (SEMPRE VISÍVEL DURANTE O PREENCHIMENTO) */}
      {isFrozenBarVisible && (
        <div
          style={{ top: `${stickyTopOffset}px` }}
          className="fixed left-0 right-0 z-30 bg-slate-900/95 dark:bg-slate-950/95 text-white border-b-2 border-emerald-500/80 shadow-lg backdrop-blur-md transition-all"
        >
          <div className="max-w-7xl 2xl:max-w-[1440px] mx-auto px-2.5 xs:px-3 sm:px-5 lg:px-6 pl-[max(0.625rem,env(safe-area-inset-left))] pr-[max(0.625rem,env(safe-area-inset-right))] py-1.5 flex items-center justify-between gap-2">
            {/* Trilha congelada: Bloco > Componente > Sub-bloco / Item */}
            <div className="flex items-center gap-1.5 min-w-0 flex-1 text-[11px] sm:text-xs">
              <span className="px-2 py-0.5 rounded-md bg-emerald-500 text-slate-950 font-black uppercase tracking-wider text-[10px] shrink-0">
                Em preenchimento
              </span>

              <div className="flex items-center gap-1.5 min-w-0 flex-wrap sm:flex-nowrap">
                <button
                  type="button"
                  onClick={() => handleNavigateToSection(frozenContext.blockSecKey, frozenContext.blockId)}
                  className="font-extrabold text-emerald-300 hover:text-emerald-200 truncate max-w-[145px] xs:max-w-[190px] sm:max-w-none cursor-pointer text-left"
                  title="Voltar ao início deste bloco"
                >
                  {frozenContext.blockLabel}
                </button>

                {frozenContext.componentLabel && (
                  <>
                    <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <button
                      type="button"
                      onClick={() =>
                        frozenContext.componentSecKey &&
                        frozenContext.componentId &&
                        handleNavigateToSection(
                          frozenContext.componentSecKey,
                          frozenContext.componentId,
                          frozenContext.componentParentKey
                        )
                      }
                      className="font-black text-white bg-emerald-700/80 hover:bg-emerald-600 px-2 py-0.5 rounded-md truncate max-w-[155px] xs:max-w-[210px] sm:max-w-none cursor-pointer"
                      title="Voltar ao topo deste componente"
                    >
                      {frozenContext.componentLabel}
                    </button>
                  </>
                )}

                {frozenContext.subblockLabel && (
                  <>
                    <ChevronRight className="w-3.5 h-3.5 text-slate-500 shrink-0 hidden md:block" />
                    <span className="hidden md:inline font-semibold text-amber-300 truncate max-w-[230px]">
                      {frozenContext.subblockLabel}
                    </span>
                  </>
                )}

                {frozenContext.focusedItemLabel && (
                  <>
                    <ChevronRight className="w-3.5 h-3.5 text-slate-500 shrink-0 hidden xl:block" />
                    <span className="hidden xl:inline text-slate-300 truncate max-w-[200px] font-medium">
                      {frozenContext.focusedItemLabel}
                    </span>
                  </>
                )}
              </div>
            </div>

            {/* Navegação Rápida Anterior / Próximo / Topo do Bloco */}
            <div className="flex items-center gap-1 shrink-0">
              {prevLinearStep && (
                <button
                  type="button"
                  onClick={() => handleNavigateToSection(prevLinearStep.secKey, prevLinearStep.id, prevLinearStep.parentKey)}
                  className="h-7 px-2 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-[11px] font-bold flex items-center gap-1 cursor-pointer transition whitespace-nowrap"
                  title={`Ir para: ${prevLinearStep.label}`}
                >
                  <ArrowLeft className="w-3 h-3" />
                  <span className="hidden lg:inline">{prevLinearStep.label}</span>
                </button>
              )}

              <button
                type="button"
                onClick={() =>
                  frozenContext.componentId && frozenContext.componentSecKey
                    ? handleNavigateToSection(
                        frozenContext.componentSecKey,
                        frozenContext.componentId,
                        frozenContext.componentParentKey
                      )
                    : handleNavigateToSection(frozenContext.blockSecKey, frozenContext.blockId)
                }
                className="h-7 px-2 rounded-md bg-slate-800 hover:bg-slate-700 text-emerald-300 border border-slate-700 text-[11px] font-bold flex items-center gap-1 cursor-pointer transition"
                title="Rolar para o título do bloco/componente atual"
              >
                <ArrowUp className="w-3 h-3" />
                <span className="hidden sm:inline">Topo</span>
              </button>

              {nextLinearStep && (
                <button
                  type="button"
                  onClick={() => handleNavigateToSection(nextLinearStep.secKey, nextLinearStep.id, nextLinearStep.parentKey)}
                  className="h-7 px-2 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold flex items-center gap-1 cursor-pointer transition whitespace-nowrap"
                  title={`Avançar para: ${nextLinearStep.label}`}
                >
                  <span className="hidden lg:inline">{nextLinearStep.label}</span>
                  <ArrowRight className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Toast Flutuante de Ação Rápida em Campo (Mobile e Tablet) */}
      {fieldQuickToast && (
        <div className="fixed top-[calc(7rem+env(safe-area-inset-top,0px))] sm:top-32 right-3 sm:right-6 z-50 max-w-[calc(100vw-1.5rem)] sm:max-w-sm bg-emerald-950/95 text-white px-4 py-2.5 rounded-2xl shadow-2xl border-2 border-emerald-400/80 flex items-center gap-2.5 animate-in fade-in slide-in-from-top-3 duration-200 backdrop-blur-md">
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
              title="Autenticar sessão institucional ou entrar como fiscal"
            >
              <Lock className="w-3.5 h-3.5 text-rose-200" />
              <span>Autenticar Acesso / Sessão</span>
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
      {/* SELETOR DESTACADO: VISTORIA ATUAL VS FUTURA VS PRÉ-CADASTRADA             */}
      {/* ========================================================================= */}
      <div className={`p-4 sm:p-5 rounded-2xl border transition-all duration-200 shadow-sm ${
        showPreSavedPanel
          ? 'bg-gradient-to-r from-sky-50/95 via-cyan-50/80 to-slate-50 dark:from-sky-950/60 dark:via-slate-900 dark:to-slate-900 border-sky-300 dark:border-sky-800 ring-2 ring-sky-500/20'
          : data.tipoPlanejamento === 'futura'
          ? 'bg-gradient-to-r from-indigo-50/90 via-purple-50/80 to-blue-50/90 dark:from-indigo-950/60 dark:via-slate-900 dark:to-slate-900 border-indigo-300 dark:border-indigo-800 ring-2 ring-indigo-500/20'
          : 'bg-gradient-to-r from-emerald-50/90 via-teal-50/80 to-slate-50 dark:from-emerald-950/50 dark:via-slate-900 dark:to-slate-900 border-emerald-300 dark:border-emerald-800 ring-2 ring-emerald-500/20'
      }`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3 pb-3 border-b border-slate-200/70 dark:border-slate-700/70">
          <div className="flex items-center gap-2.5">
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-white shadow-xs shrink-0 ${
              showPreSavedPanel
                ? 'bg-sky-600'
                : data.tipoPlanejamento === 'futura'
                ? 'bg-indigo-600'
                : 'bg-emerald-600'
            }`}>
              {showPreSavedPanel ? (
                <FolderOpen className="w-4 h-4" />
              ) : data.tipoPlanejamento === 'futura' ? (
                <CalendarClock className="w-4 h-4" />
              ) : (
                <PlayCircle className="w-4 h-4" />
              )}
            </div>
            <div>
              <span className="text-[11px] uppercase tracking-wider font-extrabold text-slate-700 dark:text-slate-300 block">
                Classificação da Ficha de Campo
              </span>
              <h2 className="text-sm sm:text-base font-black text-slate-900 dark:text-white leading-tight">
                {showPreSavedPanel
                  ? 'Vistoria Pré-Cadastrada (Selecionar Ficha Pré-salva no Sistema)'
                  : data.tipoPlanejamento === 'futura'
                  ? 'Vistoria Futura (Pré-cadastro de Local para Planejamento)'
                  : 'Vistoria Atual (Inspeção em Andamento / Realizada)'}
              </h2>
            </div>
          </div>
          
          <span className={`text-[11px] font-bold px-3 py-1 rounded-full uppercase tracking-wider self-start sm:self-auto border ${
            showPreSavedPanel
              ? 'bg-sky-100 dark:bg-sky-950 text-sky-800 dark:text-sky-200 border-sky-300 dark:border-sky-700'
              : data.tipoPlanejamento === 'futura'
              ? 'bg-indigo-100 dark:bg-indigo-950 text-indigo-800 dark:text-indigo-200 border-indigo-300 dark:border-indigo-700'
              : 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-200 border-emerald-300 dark:border-emerald-700'
          }`}>
            {showPreSavedPanel
              ? `${localSavedPool.length} Ficha(s) Pré-salva(s)`
              : data.tipoPlanejamento === 'futura'
              ? 'Sem Numeração Oficial'
              : `Oficial: ${data.generalInfo.numeroVistoria || 'A Definir'}`}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {/* Opção Vistoria Atual */}
          <button
            type="button"
            onClick={() => {
              setShowPreSavedPanel(false);
              if (data.tipoPlanejamento === 'atual') return;
              const nextNum = getNextVistoriaNumber();
              const today = new Date().toISOString().split('T')[0];
              onChange(p => ({
                ...p,
                tipoPlanejamento: 'atual',
                isDraft: true,
                generalInfo: {
                  ...p.generalInfo,
                  tipoPlanejamento: 'atual',
                  inspectionDate: p.generalInfo.inspectionDate || today,
                  numeroVistoria: p.generalInfo.numeroVistoria || nextNum
                }
              }));
            }}
            className={`p-3.5 rounded-xl border-2 text-left transition-all cursor-pointer flex items-start gap-3 relative ${
              !showPreSavedPanel && data.tipoPlanejamento !== 'futura'
                ? 'bg-white dark:bg-slate-900 border-emerald-600 shadow-sm ring-1 ring-emerald-500'
                : 'bg-white/75 dark:bg-slate-900/60 border-slate-200 dark:border-slate-700 hover:border-emerald-300 dark:hover:border-emerald-700 opacity-85 hover:opacity-100'
            }`}
          >
            <div className={`w-5 h-5 rounded-full border-2 mt-0.5 flex items-center justify-center shrink-0 ${
              !showPreSavedPanel && data.tipoPlanejamento !== 'futura'
                ? 'border-emerald-600 bg-emerald-600 text-white'
                : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800'
            }`}>
              {!showPreSavedPanel && data.tipoPlanejamento !== 'futura' && <div className="w-2 h-2 rounded-full bg-white" />}
            </div>
            <div>
              <div className="flex items-center flex-wrap gap-1.5 font-bold text-xs sm:text-sm text-slate-900 dark:text-white">
                <span>Vistoria Atual</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 font-semibold">Oficial</span>
              </div>
              <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-1 leading-snug">
                Vistoria sendo executada ou já realizada. Atribui <strong>numeração sequencial oficial</strong> e atualiza o status de campo.
              </p>
            </div>
          </button>

          {/* Opção Vistoria Futura */}
          <button
            type="button"
            onClick={() => {
              setShowPreSavedPanel(false);
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
              !showPreSavedPanel && data.tipoPlanejamento === 'futura'
                ? 'bg-white dark:bg-slate-900 border-indigo-600 shadow-sm ring-1 ring-indigo-500'
                : 'bg-white/75 dark:bg-slate-900/60 border-slate-200 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-indigo-700 opacity-85 hover:opacity-100'
            }`}
          >
            <div className={`w-5 h-5 rounded-full border-2 mt-0.5 flex items-center justify-center shrink-0 ${
              !showPreSavedPanel && data.tipoPlanejamento === 'futura'
                ? 'border-indigo-600 bg-indigo-600 text-white'
                : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800'
            }`}>
              {!showPreSavedPanel && data.tipoPlanejamento === 'futura' && <div className="w-2 h-2 rounded-full bg-white" />}
            </div>
            <div>
              <div className="flex items-center flex-wrap gap-1.5 font-bold text-xs sm:text-sm text-slate-900 dark:text-white">
                <span>Vistoria Futura</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-100 dark:bg-indigo-950 text-indigo-800 dark:text-indigo-300 font-semibold">Pré-salva</span>
              </div>
              <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-1 leading-snug">
                Pré-salva dados do local e da barragem para planejar a ida a campo. <strong>Não consome número</strong> até ser iniciada.
              </p>
            </div>
          </button>

          {/* Opção Vistoria Pré-Cadastrada */}
          <button
            type="button"
            onClick={() => {
              const nextOpen = !showPreSavedPanel;
              setShowPreSavedPanel(nextOpen);
              if (nextOpen) {
                setPreSavedFilter(preSavedFutureList.length > 0 ? 'futura' : 'all');
                refreshPreSavedSheets();
              }
            }}
            className={`sm:col-span-2 lg:col-span-1 p-3.5 rounded-xl border-2 text-left transition-all cursor-pointer flex items-start gap-3 relative ${
              showPreSavedPanel
                ? 'bg-white dark:bg-slate-900 border-sky-600 shadow-sm ring-1 ring-sky-500'
                : 'bg-white/75 dark:bg-slate-900/60 border-slate-200 dark:border-slate-700 hover:border-sky-300 dark:hover:border-sky-700 opacity-90 hover:opacity-100'
            }`}
          >
            <div className={`w-5 h-5 rounded-full border-2 mt-0.5 flex items-center justify-center shrink-0 ${
              showPreSavedPanel
                ? 'border-sky-600 bg-sky-600 text-white'
                : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800'
            }`}>
              {showPreSavedPanel && <div className="w-2 h-2 rounded-full bg-white" />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center flex-wrap gap-1.5 font-bold text-xs sm:text-sm text-slate-900 dark:text-white">
                <span>Vistoria Pré-Cadastrada</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-sky-100 dark:bg-sky-950 text-sky-800 dark:text-sky-300 font-semibold">
                  {preSavedFutureList.length > 0
                    ? `${preSavedFutureList.length} pré-salva(s)`
                    : `${localSavedPool.length} salva(s)`}
                </span>
              </div>
              <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-1 leading-snug">
                Abre as opções de <strong>fichas pré-salvas no sistema</strong> para iniciar a vistoria em campo ou continuar o preenchimento.
              </p>
            </div>
          </button>
        </div>

        {/* ========================================================================= */}
        {/* PAINEL EXPANSÍVEL: FICHAS PRÉ-CADASTRADAS / PRÉ-SALVAS NO SISTEMA         */}
        {/* ========================================================================= */}
        {showPreSavedPanel && (
          <div className="mt-4 p-3.5 sm:p-4 rounded-xl bg-white dark:bg-slate-900 border border-sky-200 dark:border-sky-800 shadow-sm space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <FolderOpen className="w-4 h-4 text-sky-600 dark:text-sky-400 shrink-0" />
                <div>
                  <h3 className="text-xs sm:text-sm font-black text-slate-900 dark:text-white">
                    Opções para Preencher Vistoria de Fichas Pré-Salvas no Sistema
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Selecione uma ficha pré-cadastrada abaixo para iniciar a vistoria oficial em campo ou continuar preenchendo seus dados.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={refreshPreSavedSheets}
                  disabled={isRefreshingPreSaved}
                  className="px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-[11px] font-bold flex items-center gap-1 cursor-pointer transition"
                  title="Recarregar fichas pré-salvas do dispositivo"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isRefreshingPreSaved ? 'animate-spin' : ''}`} />
                  <span>Atualizar</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowPreSavedPanel(false)}
                  className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 cursor-pointer transition"
                  title="Fechar lista de fichas pré-cadastradas"
                  aria-label="Fechar lista de fichas pré-cadastradas"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Busca e Filtros de Fichas Pré-Salvas */}
            <div className="flex flex-col md:flex-row md:items-center gap-2.5">
              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={preSavedSearch}
                  onChange={e => setPreSavedSearch(e.target.value)}
                  placeholder="Buscar por nome da barragem, empreendedor, CPF/CNPJ, município ou processo..."
                  className="w-full pl-8 pr-8 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
                {preSavedSearch && (
                  <button
                    type="button"
                    onClick={() => setPreSavedSearch('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                    aria-label="Limpar busca"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-bold">
                <button
                  type="button"
                  onClick={() => setPreSavedFilter('futura')}
                  className={`px-2.5 py-1.5 rounded-lg border transition cursor-pointer ${
                    preSavedFilter === 'futura'
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-indigo-300'
                  }`}
                >
                  Vistorias Futuras ({preSavedFutureList.length})
                </button>
                <button
                  type="button"
                  onClick={() => setPreSavedFilter('draft')}
                  className={`px-2.5 py-1.5 rounded-lg border transition cursor-pointer ${
                    preSavedFilter === 'draft'
                      ? 'bg-sky-600 text-white border-sky-600'
                      : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-sky-300'
                  }`}
                >
                  Rascunhos ({preSavedDraftList.length})
                </button>
                <button
                  type="button"
                  onClick={() => setPreSavedFilter('all')}
                  className={`px-2.5 py-1.5 rounded-lg border transition cursor-pointer ${
                    preSavedFilter === 'all'
                      ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 border-slate-900 dark:border-slate-100'
                      : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-slate-400'
                  }`}
                >
                  Todas as Fichas ({localSavedPool.length})
                </button>
              </div>
            </div>

            {/* Lista de Fichas Pré-Salvas */}
            {filteredPreSavedSheets.length > 0 ? (
              <div className="max-h-[360px] overflow-y-auto space-y-2.5 pr-1">
                {filteredPreSavedSheets.map(item => {
                  const d = item.damIdentification;
                  const g = item.generalInfo;
                  const isFuturaItem =
                    item.tipoPlanejamento === 'futura' || g?.tipoPlanejamento === 'futura';
                  const isCurrentActive = item.id === data.id;
                  const obsCount = item.itensObservacaoFutura?.length || 0;

                  return (
                    <div
                      key={item.id}
                      className={`p-3 rounded-xl border transition-all flex flex-col lg:flex-row lg:items-center justify-between gap-3 ${
                        isCurrentActive
                          ? 'bg-sky-50/80 dark:bg-sky-950/40 border-sky-400 dark:border-sky-600 ring-1 ring-sky-400/40'
                          : isFuturaItem
                          ? 'bg-indigo-50/40 dark:bg-indigo-950/20 border-indigo-200 dark:border-indigo-800/70 hover:border-indigo-400'
                          : 'bg-slate-50/70 dark:bg-slate-950/60 border-slate-200 dark:border-slate-800 hover:border-sky-300'
                      }`}
                    >
                      <div className="space-y-1 min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-xs sm:text-sm font-black text-slate-900 dark:text-white truncate">
                            {d.damName || d.propertyOrBusinessName || 'Ficha sem denominação'}
                          </span>

                          {isFuturaItem ? (
                            <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-950 text-indigo-800 dark:text-indigo-300 border border-indigo-300 dark:border-indigo-700 inline-flex items-center gap-1">
                              <CalendarClock className="w-3 h-3" />
                              <span>Vistoria Futura (Pré-salva)</span>
                            </span>
                          ) : (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700">
                              Vistoria Atual{g.numeroVistoria ? ` · Nº ${g.numeroVistoria}` : ''}
                            </span>
                          )}

                          {isCurrentActive && (
                            <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-sky-600 text-white">
                              Ficha Aberta
                            </span>
                          )}

                          {obsCount > 0 && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-700">
                              {obsCount} item(ns) a observar
                            </span>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-600 dark:text-slate-400">
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="w-3 h-3 text-slate-400" />
                            <span>{d.municipality || 'Mato Grosso'}/MT</span>
                          </span>
                          {d.propertyOrBusinessName && (
                            <span className="truncate max-w-[240px]">
                              Empreendedor: <strong className="text-slate-800 dark:text-slate-200">{d.propertyOrBusinessName}</strong>
                            </span>
                          )}
                          {g.recordNumber && (
                            <span>Processo: <strong>{g.recordNumber}</strong></span>
                          )}
                          <span className="inline-flex items-center gap-1">
                            <Calendar className="w-3 h-3 text-slate-400" />
                            <span>
                              {g.inspectionDate
                                ? new Date(g.inspectionDate + 'T00:00:00').toLocaleDateString('pt-BR')
                                : 'Data a definir'}
                            </span>
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <Camera className="w-3 h-3 text-slate-400" />
                            <span>{item.photos?.length || 0} foto(s)</span>
                          </span>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        {isFuturaItem ? (
                          <>
                            <button
                              type="button"
                              onClick={() => handleSelectPreSavedSheet(item, true)}
                              className="px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-xs transition"
                              title="Carrega esta ficha pré-salva e inicia como Vistoria Atual com numeração oficial"
                            >
                              <Play className="w-3.5 h-3.5" />
                              <span>Iniciar e Preencher Vistoria</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSelectPreSavedSheet(item, false)}
                              className="px-3 py-2 rounded-lg bg-indigo-100 dark:bg-indigo-950/70 hover:bg-indigo-200 dark:hover:bg-indigo-900 text-indigo-800 dark:text-indigo-200 border border-indigo-300 dark:border-indigo-700 text-xs font-bold flex items-center gap-1.5 cursor-pointer transition"
                              title="Abrir mantendo como pré-cadastro (Vistoria Futura) sem gerar numeração"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                              <span>Editar Pré-cadastro</span>
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleSelectPreSavedSheet(item, false)}
                            className="px-3 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-xs transition"
                          >
                            <FolderOpen className="w-3.5 h-3.5" />
                            <span>Abrir para Preencher</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="p-5 rounded-xl bg-slate-50 dark:bg-slate-950/70 border border-dashed border-slate-300 dark:border-slate-700 text-center space-y-2.5">
                <p className="text-xs font-bold text-slate-700 dark:text-slate-200">
                  {localSavedPool.length === 0
                    ? 'Nenhuma ficha pré-salva encontrada no sistema até o momento.'
                    : 'Nenhuma ficha pré-salva corresponde aos filtros selecionados.'}
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 max-w-lg mx-auto">
                  Você pode pré-cadastrar uma nova barragem utilizando a opção <strong>Vistoria Futura</strong> para salvá-la no sistema e abri-la depois em campo.
                </p>
                <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                  {(preSavedSearch || preSavedFilter !== 'all') && localSavedPool.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setPreSavedSearch('');
                        setPreSavedFilter('all');
                      }}
                      className="px-3 py-1.5 rounded-lg bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 text-slate-800 dark:text-slate-200 text-xs font-bold cursor-pointer"
                    >
                      Mostrar Todas ({localSavedPool.length})
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setShowPreSavedPanel(false);
                      onChange(p => ({
                        ...p,
                        tipoPlanejamento: 'futura',
                        isDraft: true,
                        generalInfo: {
                          ...p.generalInfo,
                          tipoPlanejamento: 'futura',
                          numeroVistoria: ''
                        }
                      }));
                    }}
                    className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                  >
                    <CalendarClock className="w-3.5 h-3.5" />
                    <span>Criar Vistoria Futura (Pré-salva)</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* BLOCO: ITENS A SEREM OBSERVADOS (FUTURA: LISTA / ATUAL: CHECKLIST)        */}
        {/* ========================================================================= */}
        {(data.tipoPlanejamento === 'futura' || (data.itensObservacaoFutura && data.itensObservacaoFutura.length > 0)) && (
          <div className="mt-4 pt-3 border-t border-slate-200/80 dark:border-slate-700/80">
            <FutureObservationChecklist
              tipoPlanejamento={data.tipoPlanejamento}
              items={data.itensObservacaoFutura || []}
              onChange={newItems => onChange(p => ({
                ...p,
                itensObservacaoFutura: newItems
              }))}
            />
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* INTEGRAÇÃO ECOSSISTEMA CSB (ADMINISTRA / CLASSIFICA / NOTIFICA)          */}
      {/* ========================================================================= */}
      <div className="p-3.5 sm:p-4 rounded-2xl border border-indigo-200 dark:border-indigo-900/60 bg-indigo-50/70 dark:bg-indigo-950/30 space-y-2.5 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="flex items-start gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0">
              <Network className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs sm:text-sm font-black text-indigo-950 dark:text-indigo-100">
                Base Padronizada Administra Barragens & Descoberta no Ecossistema
              </h3>
              <p className="text-[11px] text-indigo-800/90 dark:text-indigo-300">
                Utilize cadastros existentes no Administra ou cadastre novos aqui. Mesmo utilizando dados pré-cadastrados, todos os campos permanecem editáveis em campo para gravar a versão atualizada no banco de dados.
              </p>
            </div>
          </div>

          {onOpenEcosystemModal && (
            <button
              type="button"
              onClick={() => onOpenEcosystemModal({ tab: 'catalogo' })}
              className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1.5 shrink-0 cursor-pointer shadow-xs"
            >
              <Link2 className="w-3.5 h-3.5" />
              <span>Vincular Cadastro Central (Administra)</span>
            </button>
          )}
        </div>

        {crossSystemProducts.length > 0 && (
          <div className="p-2.5 rounded-xl bg-white/90 dark:bg-slate-900 border border-indigo-200 dark:border-indigo-800 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs text-slate-800 dark:text-slate-200">
              <FileSearch className="w-4 h-4 text-indigo-600 shrink-0" />
              <span>
                Identificados <strong>{crossSystemProducts.length} produto(s) prévio(s)</strong> no ecossistema (Classifica / Notifica / Administra / Fiscaliza) para esta barragem/empreendedor.
              </span>
            </div>
            {onOpenEcosystemModal && (
              <button
                type="button"
                onClick={() => onOpenEcosystemModal({ tab: 'catalogo' })}
                className="text-[11px] font-bold text-indigo-700 dark:text-indigo-300 underline cursor-pointer"
              >
                Ver Produtos Existentes
              </button>
            )}
          </div>
        )}
      </div>

      {/* Sentinela para ativação da barra congelada ao entrar nos blocos do formulário */}
      <div ref={frozenSentinelRef} className="h-0.5 w-full" aria-hidden="true" />

      {/* ========================================================================= */}
      {/* BLOCO 1: DADOS GERAIS DA BARRAGEM                                         */}
      {/* ========================================================================= */}
      <section
        id="sec-topico-1"
        data-form-block="1. Dados Gerais da Barragem"
        data-form-block-id="sec-topico-1"
        data-form-block-seckey="sec1"
        className={`bg-white dark:bg-slate-900 rounded-2xl border-2 shadow-sm scroll-mt-36 transition-all ${
          frozenContext.blockId === 'sec-topico-1'
            ? 'border-emerald-500/70 ring-2 ring-emerald-500/20'
            : 'border-slate-300/90 dark:border-slate-700'
        }`}
      >
        <button
          type="button"
          onClick={() => toggleSection('sec1')}
          className={`w-full px-4 py-3 sm:px-5 sm:py-3.5 bg-slate-900 dark:bg-slate-950 text-white ${
            openSections.sec1 ? 'rounded-t-[14px]' : 'rounded-[14px]'
          } flex items-center justify-between gap-3 cursor-pointer select-none hover:bg-slate-800/95 transition-colors`}
        >
          <div className="flex items-center gap-3 min-w-0 flex-wrap text-left">
            <span className="w-7 h-7 rounded-lg bg-emerald-500 text-slate-950 flex items-center justify-center text-xs font-black shrink-0 shadow-xs">
              1
            </span>
            <div className="min-w-0">
              <span className="block text-xs sm:text-sm font-black uppercase tracking-wide text-white">
                1. Dados Gerais da Barragem
              </span>
              <span className="block text-[11px] font-medium text-slate-300">
                Sub-blocos: 1A Registro e Identificação · 1B Coordenadas Geográficas e CAR/MT
              </span>
            </div>
            {data.barragemOrigemSistema && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-emerald-300">
                Titularidade: {getSistemaLabel(data.barragemOrigemSistema)}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0 text-emerald-400 text-xs font-bold">
            <span className="hidden sm:inline">{openSections.sec1 ? 'Recolher' : 'Expandir'}</span>
            {openSections.sec1 ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
          </div>
        </button>

        {openSections.sec1 && (
          <>
            <div className="p-4 sm:p-5 space-y-4">
              {!damPerm.allowed && (
                <div className="p-3 rounded-xl bg-orange-50 dark:bg-orange-950/40 border border-orange-300 dark:border-orange-800 text-orange-950 dark:text-orange-200 text-xs flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-orange-600 shrink-0" />
                    <span>
                      Dados da barragem importados de <strong>{getSistemaLabel(damPerm.sistemaDetentor)}</strong> (campos em laranja com <strong>*</strong>). Passe o mouse ou clique em um campo para abrir e alterar — a vistoria tem superioridade, atualiza os demais sistemas e notifica o analista autor.
                    </span>
                  </div>
                  {onOpenEcosystemModal && (
                    <button
                      type="button"
                      onClick={() =>
                        onOpenEcosystemModal({
                          tab: 'catalogo',
                          requestTarget: {
                            entidadeTipo: 'barragem',
                            entidadeId: data.barragemId || data.id,
                            entidadeNome: data.damIdentification.damName || 'Barragem vinculada',
                            sistemaDetentor: damPerm.sistemaDetentor,
                            campoSugerido: 'nome',
                            valorAtualSugerido: data.damIdentification.damName
                          }
                        })
                      }
                      className="px-3 py-1 rounded-lg bg-orange-600 hover:bg-orange-700 text-white font-bold text-[11px] flex items-center gap-1 cursor-pointer"
                    >
                      <Send className="w-3 h-3" />
                      <span>Registrar Solicitação Formal</span>
                    </button>
                  )}
                </div>
              )}

              {/* Alerta contextual não bloqueante: vistoria mais recente / documentos relacionados / conflitos */}
              {(newerInspectionAlert.hasNewerOfficialMatch ||
                newerInspectionAlert.auxiliaryTextMatches.length > 0 ||
                (relatedContextSummary && relatedContextSummary.relatedInspections.length > 0) ||
                (data.conflitosSincronizacao || []).some(c => c.status === 'pendente')) && (
                <div className="p-3 rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50/80 dark:bg-amber-950/35 text-xs space-y-1.5">
                  {newerInspectionAlert.hasNewerOfficialMatch && (
                    <div className="flex items-start gap-2 text-amber-950 dark:text-amber-200">
                      <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      <div>
                        <strong>Aviso contextual (não bloqueante):</strong> Existe vistoria concluída mais recente para esta barragem vinculada por ID ({newerInspectionAlert.officialMatches.map(m => `Vistoria ${m.numeroVistoria} em ${m.inspectionDate || m.updatedAt.slice(0, 10)}`).join(', ')}). Você pode prosseguir normalmente.
                      </div>
                    </div>
                  )}
                  {!newerInspectionAlert.hasNewerOfficialMatch &&
                    newerInspectionAlert.auxiliaryTextMatches.length > 0 && (
                      <div className="flex items-start gap-2 text-slate-800 dark:text-slate-200">
                        <FileSearch className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
                        <div>
                          <strong>Referência auxiliar por processo/nome:</strong> Localizada(s) {newerInspectionAlert.auxiliaryTextMatches.length} vistoria(s) concluída(s) com processo ou nome semelhante ({newerInspectionAlert.auxiliaryTextMatches.map(m => m.numeroVistoria).join(', ')}). Confirme pelo vínculo oficial da barragem se aplicável.
                        </div>
                      </div>
                    )}
                  {relatedContextSummary && relatedContextSummary.relatedInspections.length > 0 && (
                    <div className="text-[11px] text-slate-700 dark:text-slate-300">
                      Documentos relacionados sob demanda no Fiscaliza: <strong>{relatedContextSummary.relatedInspections.length}</strong> registro(s) para o mesmo processo, barragem ou empreendedor.
                    </div>
                  )}
                  {(data.conflitosSincronizacao || []).some(c => c.status === 'pendente') && (
                    <div className="text-[11px] font-bold text-rose-700 dark:text-rose-300">
                      Conflito de sincronização pendente: seus dados locais estão preservados. Resolva na Mesa Virtual antes da próxima sincronização.
                    </div>
                  )}
                </div>
              )}

              {/* Sub-bloco 1A: Registro da Vistoria & Identificação da Barragem */}
              <SubBlockCard
                code="1A"
                title="Registro da Vistoria e Identificação da Barragem"
                icon={ClipboardList}
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Data da Vistoria <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="date"
                      value={data.generalInfo.inspectionDate}
                      onChange={e => onChange(p => ({ ...p, generalInfo: { ...p.generalInfo, inspectionDate: e.target.value } }))}
                      className="w-full text-xs sm:text-sm min-h-[44px] px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Hora de Início
                    </label>
                    <input
                      type="time"
                      value={data.generalInfo.startTime}
                      onChange={e => onChange(p => ({ ...p, generalInfo: { ...p.generalInfo, startTime: e.target.value } }))}
                      className="w-full text-xs sm:text-sm min-h-[44px] px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Número do Processo <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="Informe o nº do processo SEMA"
                      value={data.generalInfo.recordNumber}
                      onChange={e => onChange(p => ({ ...p, generalInfo: { ...p.generalInfo, recordNumber: e.target.value } }))}
                      className="w-full text-xs sm:text-sm min-h-[44px] px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Número de Vistoria{' '}
                      {data.tipoPlanejamento === 'futura' ? (
                        <span className="text-indigo-600 dark:text-indigo-400 text-[11px] font-medium">(Sem numeração - Vistoria Futura)</span>
                      ) : (
                        <span className="text-emerald-700 dark:text-emerald-400 text-[11px] font-medium">(Editável - ex: 0001/2026)</span>
                      )}
                    </label>
                    {data.tipoPlanejamento === 'futura' ? (
                      <div className="w-full text-xs sm:text-sm min-h-[44px] px-3 py-2 border border-indigo-200 dark:border-indigo-800 rounded-lg bg-indigo-50/60 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 font-medium flex items-center justify-between">
                        <span>(Sem numeração)</span>
                        <span className="text-[10px] bg-indigo-100 dark:bg-indigo-900 text-indigo-800 dark:text-indigo-200 px-2 py-0.5 rounded font-bold">
                          Gerada ao iniciar
                        </span>
                      </div>
                    ) : (
                      <input
                        type="text"
                        placeholder="ex: 0001/2026"
                        value={data.generalInfo.numeroVistoria ?? ''}
                        onChange={e => onChange(p => ({ ...p, generalInfo: { ...p.generalInfo, numeroVistoria: e.target.value } }))}
                        className="w-full text-xs sm:text-sm min-h-[44px] px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 font-medium text-slate-900 dark:text-slate-100"
                      />
                    )}
                  </div>

                  <EcosystemImportedField
                    label="Nome da Barragem"
                    required
                    meta={importedOriginMap.damName}
                    currentValue={data.damIdentification.damName}
                    isUnlocked={!!unlockedImportedFields.damName}
                    onUnlock={() => unlockImportedField('damName')}
                  >
                    {({ className, readOnlyByImport, onFocusOrClick, titleTooltip }) => (
                      <input
                        type="text"
                        readOnly={readOnlyByImport}
                        title={titleTooltip}
                        onClick={onFocusOrClick}
                        placeholder="Informe o nome da barragem ou barramento"
                        value={data.damIdentification.damName}
                        onChange={e => onChange(p => ({ ...p, damIdentification: { ...p.damIdentification, damName: e.target.value } }))}
                        className={className}
                      />
                    )}
                  </EcosystemImportedField>

                  <EcosystemImportedField
                    label="Município (Mato Grosso)"
                    required
                    meta={importedOriginMap.municipality}
                    currentValue={data.damIdentification.municipality}
                    isUnlocked={!!unlockedImportedFields.municipality}
                    onUnlock={() => unlockImportedField('municipality')}
                  >
                    {({ className, readOnlyByImport, onFocusOrClick, titleTooltip }) => (
                      <select
                        disabled={readOnlyByImport}
                        title={titleTooltip}
                        onClick={onFocusOrClick}
                        value={data.damIdentification.municipality}
                        onChange={e => onChange(p => ({ ...p, damIdentification: { ...p.damIdentification, municipality: e.target.value } }))}
                        className={className}
                      >
                        <option value="">Selecione...</option>
                        {MUNICIPALITIES_MT.map(m => (
                          <option key={m} value={m}>{m}</option>
                        ))}
                      </select>
                    )}
                  </EcosystemImportedField>

                  <EcosystemImportedField
                    label="Nome do Curso D'Água Barrado"
                    meta={importedOriginMap.waterCourse}
                    currentValue={data.damIdentification.waterCourse}
                    isUnlocked={!!unlockedImportedFields.waterCourse}
                    onUnlock={() => unlockImportedField('waterCourse')}
                  >
                    {({ className, readOnlyByImport, onFocusOrClick, titleTooltip }) => (
                      <input
                        type="text"
                        readOnly={readOnlyByImport}
                        title={titleTooltip}
                        onClick={onFocusOrClick}
                        placeholder="Informe o curso d'água barrado"
                        value={data.damIdentification.waterCourse}
                        onChange={e => onChange(p => ({ ...p, damIdentification: { ...p.damIdentification, waterCourse: e.target.value } }))}
                        className={className}
                      />
                    )}
                  </EcosystemImportedField>

                  <EcosystemImportedField
                    label="Ano Início da Obra"
                    meta={importedOriginMap.workStartYear}
                    currentValue={data.damIdentification.workStartYear || ''}
                    isUnlocked={!!unlockedImportedFields.workStartYear}
                    onUnlock={() => unlockImportedField('workStartYear')}
                  >
                    {({ className, readOnlyByImport, onFocusOrClick, titleTooltip }) => (
                      <input
                        type="number"
                        readOnly={readOnlyByImport}
                        title={titleTooltip}
                        onClick={onFocusOrClick}
                        placeholder="ex: 2012"
                        value={data.damIdentification.workStartYear || ''}
                        onChange={e => onChange(p => ({ ...p, damIdentification: { ...p.damIdentification, workStartYear: e.target.value } }))}
                        className={className}
                      />
                    )}
                  </EcosystemImportedField>

                  <EcosystemImportedField
                    label="Ano Final da Obra"
                    meta={importedOriginMap.workEndYear}
                    currentValue={data.damIdentification.workEndYear || ''}
                    isUnlocked={!!unlockedImportedFields.workEndYear}
                    onUnlock={() => unlockImportedField('workEndYear')}
                  >
                    {({ className, readOnlyByImport, onFocusOrClick, titleTooltip }) => (
                      <input
                        type="number"
                        readOnly={readOnlyByImport}
                        title={titleTooltip}
                        onClick={onFocusOrClick}
                        placeholder="ex: 2014"
                        value={data.damIdentification.workEndYear || ''}
                        onChange={e => onChange(p => ({ ...p, damIdentification: { ...p.damIdentification, workEndYear: e.target.value } }))}
                        className={className}
                      />
                    )}
                  </EcosystemImportedField>
                </div>
              </SubBlockCard>

              {/* Sub-bloco 1B: Coordenadas Geográficas e Busca CAR/MT */}
              <SubBlockCard
                code="1B"
                title="Localização Geográfica, GPS e Busca Pública CAR/MT (SEMA-MT)"
                icon={MapPin}
              >
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
                  onApplyLookupData={payload => {
                    onChange(prev => {
                      let next = prev;
                      if (payload.empreendedor || payload.barragem || payload.responsavelTecnico) {
                        next = applyMasterSelectionToInspection(next, {
                          empreendedor: payload.empreendedor,
                          barragem: payload.barragem,
                          responsavelTecnico: payload.responsavelTecnico
                        });
                      }
                      if (payload.carImovel) {
                        const car = payload.carImovel;
                        const matchedMun = MUNICIPALITIES_MT.find(
                          m =>
                            m.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase() ===
                            (car.municipio || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
                        );
                        next = {
                          ...next,
                          damIdentification: {
                            ...next.damIdentification,
                            municipality: matchedMun || car.municipio || next.damIdentification.municipality,
                            regulatoryStatus: {
                              ...next.damIdentification.regulatoryStatus,
                              hasCar: 'sim',
                              carNumber: car.codImovel
                            }
                          }
                        };
                      }
                      return next;
                    });
                    showFieldToast(
                      payload.carImovel
                        ? `CAR/MT ${payload.carImovel.codImovel} aplicado. Todos os campos seguem editáveis.`
                        : 'Dados cadastrados aplicados ao formulário (editáveis).'
                    );
                  }}
                />
              </SubBlockCard>

              <AdministraCadastroBanner
                tipo="barragem"
                inspection={data}
                isSubmitting={registeringEntity.barragem}
                feedback={entityCadastroFeedback.barragem || null}
                onRegister={() => handleRegisterEntityToAdministra('barragem')}
                onOpenLookup={() => handleNavigateToSection('sec2', 'sec-topico-2')}
              />
            </div>
            <BoundaryFooter
              endLabel="Bloco 1 · Dados Gerais da Barragem"
              nextLabel="2. Empreendedor e Propriedade"
              onJumpNext={() => handleNavigateToSection('sec2', 'sec-topico-2')}
            />
          </>
        )}
      </section>

      {/* ========================================================================= */}
      {/* BLOCO 2: IDENTIFICAÇÃO DO EMPREENDEDOR E PROPRIEDADE                      */}
      {/* ========================================================================= */}
      <section
        id="sec-topico-2"
        data-form-block="2. Identificação do Empreendedor e Propriedade"
        data-form-block-id="sec-topico-2"
        data-form-block-seckey="sec2"
        className={`bg-white dark:bg-slate-900 rounded-2xl border-2 shadow-sm scroll-mt-36 transition-all ${
          frozenContext.blockId === 'sec-topico-2'
            ? 'border-emerald-500/70 ring-2 ring-emerald-500/20'
            : 'border-slate-300/90 dark:border-slate-700'
        }`}
      >
        <button
          type="button"
          onClick={() => toggleSection('sec2')}
          className={`w-full px-4 py-3 sm:px-5 sm:py-3.5 bg-slate-900 dark:bg-slate-950 text-white ${
            openSections.sec2 ? 'rounded-t-[14px]' : 'rounded-[14px]'
          } flex items-center justify-between gap-3 cursor-pointer select-none hover:bg-slate-800/95 transition-colors`}
        >
          <div className="flex items-center gap-3 min-w-0 flex-wrap text-left">
            <span className="w-7 h-7 rounded-lg bg-emerald-500 text-slate-950 flex items-center justify-center text-xs font-black shrink-0 shadow-xs">
              2
            </span>
            <div className="min-w-0">
              <span className="block text-xs sm:text-sm font-black uppercase tracking-wide text-white">
                2. Identificação do Empreendedor e Propriedade
              </span>
              <span className="block text-[11px] font-medium text-slate-300">
                Sub-blocos: 2A Proprietário e Imóvel · 2B Consulta Ecossistema · 2C Responsável Técnico
              </span>
            </div>
            {data.empreendedorOrigemSistema && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-emerald-300">
                Titularidade: {getSistemaLabel(data.empreendedorOrigemSistema)}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0 text-emerald-400 text-xs font-bold">
            <span className="hidden sm:inline">{openSections.sec2 ? 'Recolher' : 'Expandir'}</span>
            {openSections.sec2 ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
          </div>
        </button>

        {openSections.sec2 && (
          <>
          <div className="p-4 sm:p-5 space-y-4">
            {!ownerPerm.allowed && (
              <div className="p-3 rounded-xl bg-orange-50 dark:bg-orange-950/40 border border-orange-300 dark:border-orange-800 text-orange-950 dark:text-orange-200 text-xs flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-orange-600 shrink-0" />
                  <span>
                    Dados do empreendedor importados de <strong>{getSistemaLabel(ownerPerm.sistemaDetentor)}</strong> (caixas em laranja com <strong>*</strong>). Passe o mouse ou clique para abrir e alterar — a vistoria tem superioridade, atualiza os demais sistemas e notifica a caixa do analista autor.
                  </span>
                </div>
                {onOpenEcosystemModal && (
                  <button
                    type="button"
                    onClick={() =>
                      onOpenEcosystemModal({
                        tab: 'catalogo',
                        requestTarget: {
                          entidadeTipo: 'empreendedor',
                          entidadeId: data.empreendedorId || data.id,
                          entidadeNome: data.damIdentification.propertyOrBusinessName || 'Empreendedor vinculado',
                          sistemaDetentor: ownerPerm.sistemaDetentor,
                          campoSugerido: 'nomeRazaoSocial',
                          valorAtualSugerido: data.damIdentification.propertyOrBusinessName
                        }
                      })
                    }
                    className="px-3 py-1 rounded-lg bg-orange-600 hover:bg-orange-700 text-white font-bold text-[11px] flex items-center gap-1 cursor-pointer"
                  >
                    <Send className="w-3 h-3" />
                    <span>Registrar Solicitação Formal</span>
                  </button>
                )}
              </div>
            )}

            <SubBlockCard
              code="2A"
              title="Dados do Empreendedor / Propriedade e Documentação"
              icon={Building2}
            >
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
              <EcosystemImportedField
                className="sm:col-span-2"
                label="Nome do Empreendedor / Razão Social"
                required
                meta={importedOriginMap.propertyOrBusinessName}
                currentValue={data.damIdentification.propertyOrBusinessName}
                isUnlocked={!!unlockedImportedFields.propertyOrBusinessName}
                onUnlock={() => unlockImportedField('propertyOrBusinessName')}
              >
                {({ className, readOnlyByImport, onFocusOrClick, titleTooltip }) => (
                  <input
                    type="text"
                    readOnly={readOnlyByImport}
                    title={titleTooltip}
                    onClick={onFocusOrClick}
                    placeholder="Nome completo ou Razão Social"
                    value={data.damIdentification.propertyOrBusinessName}
                    onChange={e => onChange(p => ({
                      ...p,
                      damIdentification: { ...p.damIdentification, propertyOrBusinessName: e.target.value }
                    }))}
                    className={className}
                  />
                )}
              </EcosystemImportedField>

              <EcosystemImportedField
                label="CPF ou CNPJ"
                meta={importedOriginMap.ownerCpfCnpj}
                currentValue={data.damIdentification.ownerCpfCnpj || ''}
                isUnlocked={!!unlockedImportedFields.ownerCpfCnpj}
                onUnlock={() => unlockImportedField('ownerCpfCnpj')}
              >
                {({ className, readOnlyByImport, onFocusOrClick, titleTooltip }) => (
                  <input
                    type="text"
                    readOnly={readOnlyByImport}
                    title={titleTooltip}
                    onClick={onFocusOrClick}
                    placeholder="000.000.000-00 ou 00.000.000/0001-00"
                    value={data.damIdentification.ownerCpfCnpj || ''}
                    onChange={e => onChange(p => ({
                      ...p,
                      damIdentification: { ...p.damIdentification, ownerCpfCnpj: e.target.value }
                    }))}
                    className={className}
                  />
                )}
              </EcosystemImportedField>

              <EcosystemImportedField
                label="Figura Jurídica"
                meta={importedOriginMap.ownerLegalType}
                currentValue={data.damIdentification.ownerLegalType || ''}
                isUnlocked={!!unlockedImportedFields.ownerLegalType}
                onUnlock={() => unlockImportedField('ownerLegalType')}
              >
                {({ className, readOnlyByImport, onFocusOrClick, titleTooltip }) => (
                  <select
                    disabled={readOnlyByImport}
                    title={titleTooltip}
                    onClick={onFocusOrClick}
                    value={data.damIdentification.ownerLegalType || ''}
                    onChange={e => onChange(p => ({
                      ...p,
                      damIdentification: {
                        ...p.damIdentification,
                        ownerLegalType: e.target.value as any
                      }
                    }))}
                    className={className}
                  >
                    <option value="">Selecione...</option>
                    <option value="empresa_privada">Empresa Privada</option>
                    <option value="pessoa_fisica">Pessoa Física</option>
                    <option value="orgao_publico">Órgão Público</option>
                    <option value="cooperativa">Cooperativa / Associação</option>
                    <option value="outra">Outra</option>
                  </select>
                )}
              </EcosystemImportedField>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Processo SEMA
                </label>
                <input
                  type="text"
                  placeholder="Informe o nº do processo"
                  value={data.generalInfo.recordNumber}
                  onChange={e => onChange(p => ({
                    ...p,
                    generalInfo: { ...p.generalInfo, recordNumber: e.target.value }
                  }))}
                  className="w-full text-xs sm:text-sm min-h-[44px] px-3 py-2 border border-slate-300 rounded-lg bg-slate-50/50"
                />
              </div>

              <EcosystemImportedField
                label="Telefone / WhatsApp"
                meta={importedOriginMap.ownerPhone}
                currentValue={data.damIdentification.ownerPhone || ''}
                isUnlocked={!!unlockedImportedFields.ownerPhone}
                onUnlock={() => unlockImportedField('ownerPhone')}
              >
                {({ className, readOnlyByImport, onFocusOrClick, titleTooltip }) => (
                  <input
                    type="text"
                    readOnly={readOnlyByImport}
                    title={titleTooltip}
                    onClick={onFocusOrClick}
                    placeholder="(65) 99999-0000"
                    value={data.damIdentification.ownerPhone || ''}
                    onChange={e => onChange(p => ({
                      ...p,
                      damIdentification: { ...p.damIdentification, ownerPhone: e.target.value }
                    }))}
                    className={className}
                  />
                )}
              </EcosystemImportedField>

              <EcosystemImportedField
                className="sm:col-span-2"
                label="Endereço / Localização da Propriedade"
                meta={importedOriginMap.ownerAddress}
                currentValue={data.damIdentification.ownerAddress || ''}
                isUnlocked={!!unlockedImportedFields.ownerAddress}
                onUnlock={() => unlockImportedField('ownerAddress')}
              >
                {({ className, readOnlyByImport, onFocusOrClick, titleTooltip }) => (
                  <input
                    type="text"
                    readOnly={readOnlyByImport}
                    title={titleTooltip}
                    onClick={onFocusOrClick}
                    placeholder="Rodovia, Km, Zona Rural"
                    value={data.damIdentification.ownerAddress || ''}
                    onChange={e => onChange(p => ({
                      ...p,
                      damIdentification: { ...p.damIdentification, ownerAddress: e.target.value }
                    }))}
                    className={className}
                  />
                )}
              </EcosystemImportedField>

              <EcosystemImportedField
                label="E-mail"
                meta={importedOriginMap.ownerEmail}
                currentValue={data.conclusions.notificationDetails.destinatario.email || ''}
                isUnlocked={!!unlockedImportedFields.ownerEmail}
                onUnlock={() => unlockImportedField('ownerEmail')}
              >
                {({ className, readOnlyByImport, onFocusOrClick, titleTooltip }) => (
                  <input
                    type="email"
                    readOnly={readOnlyByImport}
                    title={titleTooltip}
                    onClick={onFocusOrClick}
                    placeholder="e-mail do empreendedor"
                    value={data.conclusions.notificationDetails.destinatario.email || ''}
                    onChange={e => onChange(p => ({
                      ...p,
                      conclusions: {
                        ...p.conclusions,
                        notificationDetails: {
                          ...p.conclusions.notificationDetails,
                          destinatario: {
                            ...p.conclusions.notificationDetails.destinatario,
                            email: e.target.value
                          }
                        }
                      }
                    }))}
                    className={className}
                  />
                )}
              </EcosystemImportedField>

              <EcosystemImportedField
                label="CAR / Recibo de Inscrição"
                meta={importedOriginMap.carNumber}
                currentValue={data.damIdentification.regulatoryStatus.carNumber}
                isUnlocked={!!unlockedImportedFields.carNumber}
                onUnlock={() => unlockImportedField('carNumber')}
              >
                {({ className, readOnlyByImport, onFocusOrClick, titleTooltip }) => (
                  <input
                    type="text"
                    readOnly={readOnlyByImport}
                    title={titleTooltip}
                    onClick={onFocusOrClick}
                    placeholder="MT-XXXXXXX-..."
                    value={data.damIdentification.regulatoryStatus.carNumber}
                    onChange={e => onChange(p => ({
                      ...p,
                      damIdentification: {
                        ...p.damIdentification,
                        regulatoryStatus: { ...p.damIdentification.regulatoryStatus, carNumber: e.target.value }
                      }
                    }))}
                    className={className}
                  />
                )}
              </EcosystemImportedField>

              <EcosystemImportedField
                label="Declaração de Uso / Outorga"
                meta={importedOriginMap.permitNumber}
                currentValue={data.damIdentification.regulatoryStatus.permitNumber}
                isUnlocked={!!unlockedImportedFields.permitNumber}
                onUnlock={() => unlockImportedField('permitNumber')}
              >
                {({ className, readOnlyByImport, onFocusOrClick, titleTooltip }) => (
                  <input
                    type="text"
                    readOnly={readOnlyByImport}
                    title={titleTooltip}
                    onClick={onFocusOrClick}
                    placeholder="Nº da outorga ou dispensa"
                    value={data.damIdentification.regulatoryStatus.permitNumber}
                    onChange={e => onChange(p => ({
                      ...p,
                      damIdentification: {
                        ...p.damIdentification,
                        regulatoryStatus: { ...p.damIdentification.regulatoryStatus, permitNumber: e.target.value }
                      }
                    }))}
                    className={className}
                  />
                )}
              </EcosystemImportedField>

              <EcosystemImportedField
                label="Quantidade de Barragens no Imóvel"
                meta={importedOriginMap.damsCountOnProperty}
                currentValue={data.damIdentification.damsCountOnProperty || ''}
                isUnlocked={!!unlockedImportedFields.damsCountOnProperty}
                onUnlock={() => unlockImportedField('damsCountOnProperty')}
              >
                {({ className, readOnlyByImport, onFocusOrClick, titleTooltip }) => (
                  <input
                    type="number"
                    readOnly={readOnlyByImport}
                    title={titleTooltip}
                    onClick={onFocusOrClick}
                    placeholder="Informe a quantidade"
                    value={data.damIdentification.damsCountOnProperty || ''}
                    min="1"
                    onChange={e => onChange(p => ({
                      ...p,
                      damIdentification: { ...p.damIdentification, damsCountOnProperty: e.target.value }
                    }))}
                    className={className}
                  />
                )}
              </EcosystemImportedField>
            </div>

            <AdministraCadastroBanner
              tipo="empreendedor"
              inspection={data}
              isSubmitting={registeringEntity.empreendedor}
              feedback={entityCadastroFeedback.empreendedor || null}
              onRegister={() => handleRegisterEntityToAdministra('empreendedor')}
              onOpenLookup={() => handleNavigateToSection('sec2', 'subbloco-2b-lookup')}
            />
            </SubBlockCard>

            {/* Sub-bloco 2B: Lupinha de Consulta ao Ecossistema */}
            <div id="subbloco-2b-lookup" className="scroll-mt-36">
            <SubBlockCard
              code="2B"
              title="Consulta na Base do Ecossistema (Administra / SEMA-MT)"
              icon={FileSearch}
            >
              <EcosystemTopic2Lookup
                initialQuery={data.damIdentification.propertyOrBusinessName || data.damIdentification.ownerCpfCnpj || ''}
                onExportSelection={payload => {
                  onChange(prev => applyMasterSelectionToInspection(prev, payload));
                  setUnlockedImportedFields({});
                  const ownerName = payload.empreendedor?.nomeRazaoSocial || 'Sem empreendedor vinculado';
                  showFieldToast(
                    payload.barragem
                      ? `Dados de "${ownerName}" e da barragem "${payload.barragem.nome}" aplicados (editáveis e marcados em laranja*).`
                      : `Dados de "${ownerName}" aplicados (editáveis e marcados em laranja*).`
                  );
                }}
                onApplyCarOnly={car => {
                  const matchedMun = MUNICIPALITIES_MT.find(
                    m =>
                      m.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase() ===
                      (car.municipio || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
                  );
                  onChange(prev => ({
                    ...prev,
                    damIdentification: {
                      ...prev.damIdentification,
                      municipality: matchedMun || car.municipio || prev.damIdentification.municipality,
                      regulatoryStatus: {
                        ...prev.damIdentification.regulatoryStatus,
                        hasCar: 'sim',
                        carNumber: car.codImovel
                      }
                    }
                  }));
                  showFieldToast(`CAR/MT ${car.codImovel} inserido no formulário (editável).`);
                }}
              />
            </SubBlockCard>
            </div>

            {/* Sub-bloco 2C: Responsável Técnico pela Segurança da Barragem */}
            <SubBlockCard
              code="2C"
              title="Responsável Técnico pela Segurança da Barragem"
              icon={HardHat}
              badge={(data.responsavelTecnicoOrigemSistema || data.responsavelTecnico?.sistemaOrigem) ? (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                  Titularidade: {getSistemaLabel(data.responsavelTecnicoOrigemSistema || data.responsavelTecnico?.sistemaOrigem)}
                </span>
              ) : undefined}
              action={!rtPerm.allowed && onOpenEcosystemModal ? (
                <button
                  type="button"
                  onClick={() =>
                    onOpenEcosystemModal({
                      tab: 'catalogo',
                      requestTarget: {
                        entidadeTipo: 'responsavel_tecnico',
                        entidadeId: data.responsavelTecnicoId || data.responsavelTecnico?.id || data.id,
                        entidadeNome: data.responsavelTecnico?.nome || 'Responsável Técnico vinculado',
                        sistemaDetentor: rtPerm.sistemaDetentor,
                        campoSugerido: 'registroProfissional',
                        valorAtualSugerido: data.responsavelTecnico?.registroProfissional || ''
                      }
                    })
                  }
                  className="px-2.5 py-1 rounded-lg bg-orange-600 hover:bg-orange-700 text-white font-bold text-[11px] flex items-center gap-1 cursor-pointer"
                >
                  <Send className="w-3 h-3" />
                  <span>Registrar Solicitação Formal</span>
                </button>
              ) : undefined}
            >

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <EcosystemImportedField
                  label="Nome do Responsável Técnico"
                  meta={importedOriginMap.rtNome}
                  currentValue={data.responsavelTecnico?.nome || ''}
                  isUnlocked={!!unlockedImportedFields.rtNome}
                  onUnlock={() => unlockImportedField('rtNome')}
                >
                  {({ className, readOnlyByImport, onFocusOrClick, titleTooltip }) => (
                    <input
                      type="text"
                      readOnly={readOnlyByImport}
                      title={titleTooltip}
                      onClick={onFocusOrClick}
                      placeholder="Engenheiro(a) / Geólogo(a)"
                      value={data.responsavelTecnico?.nome || ''}
                      onChange={e =>
                        onChange(p => ({
                          ...p,
                          responsavelTecnico: { ...(p.responsavelTecnico || { nome: '' }), nome: e.target.value }
                        }))
                      }
                      className={className}
                    />
                  )}
                </EcosystemImportedField>

                <EcosystemImportedField
                  label="Registro Profissional (CREA/CONFEA)"
                  meta={importedOriginMap.rtRegistro}
                  currentValue={data.responsavelTecnico?.registroProfissional || ''}
                  isUnlocked={!!unlockedImportedFields.rtRegistro}
                  onUnlock={() => unlockImportedField('rtRegistro')}
                >
                  {({ className, readOnlyByImport, onFocusOrClick, titleTooltip }) => (
                    <input
                      type="text"
                      readOnly={readOnlyByImport}
                      title={titleTooltip}
                      onClick={onFocusOrClick}
                      placeholder="CREA-MT 00000/D"
                      value={data.responsavelTecnico?.registroProfissional || ''}
                      onChange={e =>
                        onChange(p => ({
                          ...p,
                          responsavelTecnico: {
                            ...(p.responsavelTecnico || { nome: '' }),
                            registroProfissional: e.target.value
                          }
                        }))
                      }
                      className={className}
                    />
                  )}
                </EcosystemImportedField>

                <EcosystemImportedField
                  label="Nº ART / TRT"
                  meta={importedOriginMap.rtArt}
                  currentValue={data.responsavelTecnico?.artNumero || ''}
                  isUnlocked={!!unlockedImportedFields.rtArt}
                  onUnlock={() => unlockImportedField('rtArt')}
                >
                  {({ className, readOnlyByImport, onFocusOrClick, titleTooltip }) => (
                    <input
                      type="text"
                      readOnly={readOnlyByImport}
                      title={titleTooltip}
                      onClick={onFocusOrClick}
                      placeholder="Número da ART"
                      value={data.responsavelTecnico?.artNumero || ''}
                      onChange={e =>
                        onChange(p => ({
                          ...p,
                          responsavelTecnico: { ...(p.responsavelTecnico || { nome: '' }), artNumero: e.target.value }
                        }))
                      }
                      className={className}
                    />
                  )}
                </EcosystemImportedField>

                <EcosystemImportedField
                  label="CPF do RT"
                  meta={importedOriginMap.rtCpf}
                  currentValue={data.responsavelTecnico?.cpf || ''}
                  isUnlocked={!!unlockedImportedFields.rtCpf}
                  onUnlock={() => unlockImportedField('rtCpf')}
                >
                  {({ className, readOnlyByImport, onFocusOrClick, titleTooltip }) => (
                    <input
                      type="text"
                      readOnly={readOnlyByImport}
                      title={titleTooltip}
                      onClick={onFocusOrClick}
                      placeholder="000.000.000-00"
                      value={data.responsavelTecnico?.cpf || ''}
                      onChange={e =>
                        onChange(p => ({
                          ...p,
                          responsavelTecnico: { ...(p.responsavelTecnico || { nome: '' }), cpf: e.target.value }
                        }))
                      }
                      className={className}
                    />
                  )}
                </EcosystemImportedField>

                <EcosystemImportedField
                  label="Telefone do RT"
                  meta={importedOriginMap.rtTelefone}
                  currentValue={data.responsavelTecnico?.telefone || ''}
                  isUnlocked={!!unlockedImportedFields.rtTelefone}
                  onUnlock={() => unlockImportedField('rtTelefone')}
                >
                  {({ className, readOnlyByImport, onFocusOrClick, titleTooltip }) => (
                    <input
                      type="text"
                      readOnly={readOnlyByImport}
                      title={titleTooltip}
                      onClick={onFocusOrClick}
                      placeholder="(65) 99999-0000"
                      value={data.responsavelTecnico?.telefone || ''}
                      onChange={e =>
                        onChange(p => ({
                          ...p,
                          responsavelTecnico: { ...(p.responsavelTecnico || { nome: '' }), telefone: e.target.value }
                        }))
                      }
                      className={className}
                    />
                  )}
                </EcosystemImportedField>

                <EcosystemImportedField
                  label="E-mail do RT"
                  meta={importedOriginMap.rtEmail}
                  currentValue={data.responsavelTecnico?.email || ''}
                  isUnlocked={!!unlockedImportedFields.rtEmail}
                  onUnlock={() => unlockImportedField('rtEmail')}
                >
                  {({ className, readOnlyByImport, onFocusOrClick, titleTooltip }) => (
                    <input
                      type="email"
                      readOnly={readOnlyByImport}
                      title={titleTooltip}
                      onClick={onFocusOrClick}
                      placeholder="E-mail do responsável técnico"
                      value={data.responsavelTecnico?.email || ''}
                      onChange={e =>
                        onChange(p => ({
                          ...p,
                          responsavelTecnico: { ...(p.responsavelTecnico || { nome: '' }), email: e.target.value }
                        }))
                      }
                      className={className}
                    />
                  )}
                </EcosystemImportedField>
              </div>

              <AdministraCadastroBanner
                tipo="responsavel_tecnico"
                inspection={data}
                isSubmitting={registeringEntity.responsavel_tecnico}
                feedback={entityCadastroFeedback.responsavel_tecnico || null}
                onRegister={() => handleRegisterEntityToAdministra('responsavel_tecnico')}
                onOpenLookup={() => handleNavigateToSection('sec2', 'subbloco-2b-lookup')}
              />
            </SubBlockCard>

            <SubBlockCard code="2D" title="Comentários Complementares do Bloco 2">
              <SpeechTextarea
                label="Comentários da Seção 2:"
                rows={2}
                value={sectionComments.sec2 || ''}
                onValueChange={val => updateSectionComment('sec2', val)}
                placeholder="Anotações sobre documentação, posse, arrendamento..."
              />
            </SubBlockCard>
          </div>
          <BoundaryFooter
            endLabel="Bloco 2 · Empreendedor e Propriedade"
            prevLabel="1. Dados Gerais"
            onJumpPrev={() => handleNavigateToSection('sec1', 'sec-topico-1')}
            nextLabel="3. Usos da Barragem"
            onJumpNext={() => handleNavigateToSection('sec3', 'sec-topico-3')}
          />
          </>
        )}
      </section>

      {/* ========================================================================= */}
      {/* BLOCO 3: USOS DA BARRAGEM                                                 */}
      {/* ========================================================================= */}
      <section
        id="sec-topico-3"
        data-form-block="3. Usos da Barragem"
        data-form-block-id="sec-topico-3"
        data-form-block-seckey="sec3"
        className={`bg-white dark:bg-slate-900 rounded-2xl border-2 shadow-sm scroll-mt-36 transition-all ${
          frozenContext.blockId === 'sec-topico-3'
            ? 'border-emerald-500/70 ring-2 ring-emerald-500/20'
            : 'border-slate-300/90 dark:border-slate-700'
        }`}
      >
        <button
          type="button"
          onClick={() => toggleSection('sec3')}
          className={`w-full px-4 py-3 sm:px-5 sm:py-3.5 bg-slate-900 dark:bg-slate-950 text-white ${
            openSections.sec3 ? 'rounded-t-[14px]' : 'rounded-[14px]'
          } flex items-center justify-between gap-3 cursor-pointer select-none hover:bg-slate-800/95 transition-colors`}
        >
          <div className="flex items-center gap-3 min-w-0 flex-wrap text-left">
            <span className="w-7 h-7 rounded-lg bg-emerald-500 text-slate-950 flex items-center justify-center text-xs font-black shrink-0 shadow-xs">
              3
            </span>
            <div>
              <span className="block text-xs sm:text-sm font-black uppercase tracking-wide text-white">
                3. Usos da Barragem
              </span>
              <span className="block text-[11px] font-medium text-slate-300">
                Sub-bloco: 3A Finalidade de Uso Principal e Usos Secundários
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 text-emerald-400 text-xs font-bold">
            <span className="hidden sm:inline">{openSections.sec3 ? 'Recolher' : 'Expandir'}</span>
            {openSections.sec3 ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
          </div>
        </button>

        {openSections.sec3 && (
          <>
          <div className="p-4 sm:p-5 space-y-4">
            <SubBlockCard code="3A" title="Finalidade Principal e Usos Secundários" icon={Droplets}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
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
                  className="w-full text-xs sm:text-sm min-h-[44px] px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Outros Usos Secundários?
                </label>
                <div className="flex items-center gap-4 min-h-[44px]">
                  <label className="flex items-center gap-2 text-xs font-semibold text-slate-800 dark:text-slate-200 cursor-pointer">
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
                  <label className="flex items-center gap-2 text-xs font-semibold text-slate-800 dark:text-slate-200 cursor-pointer">
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
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
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
                  className="w-full text-xs sm:text-sm min-h-[44px] px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                />
              </div>
            )}
            </SubBlockCard>
          </div>
          <BoundaryFooter
            endLabel="Bloco 3 · Usos da Barragem"
            prevLabel="2. Empreendedor"
            onJumpPrev={() => handleNavigateToSection('sec2', 'sec-topico-2')}
            nextLabel="4. Características Técnicas"
            onJumpNext={() => handleNavigateToSection('sec4', 'sec-topico-4')}
          />
          </>
        )}
      </section>

      {/* ========================================================================= */}
      {/* BLOCO 4: CARACTERÍSTICAS TÉCNICAS (AFERIÇÃO DE MEDIDAS)                   */}
      {/* ========================================================================= */}
      <section
        id="sec-topico-4"
        data-form-block="4. Características Técnicas (Aferição)"
        data-form-block-id="sec-topico-4"
        data-form-block-seckey="sec4"
        className={`bg-white dark:bg-slate-900 rounded-2xl border-2 shadow-sm scroll-mt-36 transition-all ${
          frozenContext.blockId === 'sec-topico-4'
            ? 'border-emerald-500/70 ring-2 ring-emerald-500/20'
            : 'border-slate-300/90 dark:border-slate-700'
        }`}
      >
        <button
          type="button"
          onClick={() => toggleSection('sec4')}
          className={`w-full px-4 py-3 sm:px-5 sm:py-3.5 bg-slate-900 dark:bg-slate-950 text-white ${
            openSections.sec4 ? 'rounded-t-[14px]' : 'rounded-[14px]'
          } flex items-center justify-between gap-3 cursor-pointer select-none hover:bg-slate-800/95 transition-colors`}
        >
          <div className="flex items-center gap-3 min-w-0 flex-wrap text-left">
            <span className="w-7 h-7 rounded-lg bg-emerald-500 text-slate-950 flex items-center justify-center text-xs font-black shrink-0 shadow-xs">
              4
            </span>
            <div>
              <span className="block text-xs sm:text-sm font-black uppercase tracking-wide text-white">
                4. Características Técnicas (Aferição de Medidas)
              </span>
              <span className="block text-[11px] font-medium text-slate-300">
                Sub-blocos: 4A Dimensões Aferidas · 4B Material Construtivo e Comentários
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 text-emerald-400 text-xs font-bold">
            <span className="hidden sm:inline">{openSections.sec4 ? 'Recolher' : 'Expandir'}</span>
            {openSections.sec4 ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
          </div>
        </button>

        {openSections.sec4 && (
          <>
          <div className="p-4 sm:p-5 space-y-4">
            <SubBlockCard code="4A" title="Dimensões Aferidas em Campo" icon={Ruler}>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
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
                  className="w-full text-xs sm:text-sm min-h-[44px] p-2.5 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Distância (Crista – Pé) (m)
                </label>
                <input
                  type="text"
                  placeholder="ex: 18.0"
                  value={data.damIdentification.estimatedDimensions.cristaPeDistanceMeters || ''}
                  onChange={e => onChange(p => ({
                    ...p,
                    damIdentification: {
                      ...p.damIdentification,
                      estimatedDimensions: { ...p.damIdentification.estimatedDimensions, cristaPeDistanceMeters: e.target.value }
                    }
                  }))}
                  className="w-full text-xs sm:text-sm min-h-[44px] p-2.5 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Declividade Talude Jusante (°)
                </label>
                <input
                  type="text"
                  placeholder="ex: 28°"
                  value={data.damIdentification.estimatedDimensions.downstreamSlopeDegrees || ''}
                  onChange={e => onChange(p => ({
                    ...p,
                    damIdentification: {
                      ...p.damIdentification,
                      estimatedDimensions: { ...p.damIdentification.estimatedDimensions, downstreamSlopeDegrees: e.target.value }
                    }
                  }))}
                  className="w-full text-xs sm:text-sm min-h-[44px] p-2.5 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
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
                  className="w-full text-xs sm:text-sm min-h-[44px] p-2.5 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
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
                  className="w-full text-xs sm:text-sm min-h-[44px] p-2.5 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                />
              </div>
            </div>
            </SubBlockCard>

            {/* Sub-bloco 4B: Tipo de Material e Comentários */}
            <SubBlockCard code="4B" title="Tipo de Material Construtivo e Particularidades">
              <div>
                <label className="block text-xs font-bold text-slate-800 dark:text-slate-200 mb-2">
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
                          ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-500 text-emerald-950 dark:text-emerald-200 font-bold ring-1 ring-emerald-400'
                          : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
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

              <SpeechTextarea
                label="Comentários da Seção 4:"
                rows={2}
                value={sectionComments.sec4 || ''}
                onValueChange={val => updateSectionComment('sec4', val)}
                placeholder="Particularidades das medições em campo..."
              />
            </SubBlockCard>
          </div>
          <BoundaryFooter
            endLabel="Bloco 4 · Características Técnicas"
            prevLabel="3. Usos da Barragem"
            onJumpPrev={() => handleNavigateToSection('sec3', 'sec-topico-3')}
            nextLabel="5. Componentes da Barragem"
            onJumpNext={() => handleNavigateToSection('secComponentes', 'sec-topico-5')}
          />
          </>
        )}
      </section>

      {/* ========================================================================= */}
      {/* BLOCO 5: COMPONENTES DA BARRAGEM                                          */}
      {/* ========================================================================= */}
      <section
        id="sec-topico-5"
        data-form-block="5. Componentes da Barragem"
        data-form-block-id="sec-topico-5"
        data-form-block-seckey="secComponentes"
        className={`bg-white dark:bg-slate-900 rounded-2xl border-2 shadow-sm scroll-mt-36 transition-all ${
          frozenContext.blockId === 'sec-topico-5'
            ? 'border-emerald-500/70 ring-2 ring-emerald-500/20'
            : 'border-slate-300/90 dark:border-slate-700'
        }`}
      >
        <button
          type="button"
          onClick={() => toggleSection('secComponentes')}
          className={`w-full px-4 py-3 sm:px-5 sm:py-3.5 bg-slate-900 dark:bg-slate-950 text-white ${
            openSections.secComponentes ? 'rounded-t-[14px]' : 'rounded-[14px]'
          } flex items-center justify-between gap-3 cursor-pointer select-none hover:bg-slate-800/95 transition-colors`}
        >
          <div className="flex items-center gap-3 min-w-0 flex-wrap text-left">
            <span className="w-7 h-7 rounded-lg bg-emerald-500 text-slate-950 flex items-center justify-center text-xs font-black shrink-0 shadow-xs">
              5
            </span>
            <div className="min-w-0">
              <span className="flex items-center gap-1.5 text-xs sm:text-sm font-black uppercase tracking-wide text-white">
                <Layers className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>5. Componentes da Barragem</span>
              </span>
              <span className="block text-[11px] font-medium text-slate-300">
                7 componentes independentes: 5.1 Montante · 5.2 Coroamento · 5.3 Jusante · 5.4 Região a Jusante · 5.5 Instrumentação · 5.6 Vertedoras · 5.7 Reservatório
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 text-emerald-400 text-xs font-bold">
            <span className="hidden sm:inline">{openSections.secComponentes ? 'Recolher' : 'Expandir'}</span>
            {openSections.secComponentes ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
          </div>
        </button>

        {openSections.secComponentes && (
          <>
          <div className="p-3 sm:p-5 space-y-6 bg-slate-100/80 dark:bg-slate-950/75">
            {/* ========================================================================= */}
            {/* COMPONENTE 5.1: TALUDE DE MONTANTE                                        */}
            {/* ========================================================================= */}
            {(() => {
              const stats = getComponentEvaluationStats('montante', MONTANTE_ITEMS);
              const isFocused = frozenContext.componentId === 'sec-subtopico-5-1';
              return (
                <div
                  id="sec-subtopico-5-1"
                  data-form-component="5.1. Talude de Montante"
                  data-form-component-id="sec-subtopico-5-1"
                  data-form-component-seckey="sec5"
                  data-form-component-parentkey="secComponentes"
                  className={`bg-white dark:bg-slate-900 rounded-2xl border-2 shadow-sm scroll-mt-36 transition-all ${
                    isFocused
                      ? 'border-emerald-600 dark:border-emerald-500 ring-2 ring-emerald-500/20'
                      : 'border-slate-300 dark:border-slate-700'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => toggleSection('sec5')}
                    className={`w-full px-4 py-3 bg-gradient-to-r from-emerald-800 via-emerald-700 to-teal-700 text-white ${
                      openSections.sec5 ? 'rounded-t-[14px]' : 'rounded-[14px]'
                    } flex flex-wrap items-center justify-between gap-2.5 cursor-pointer select-none hover:brightness-105 transition`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0 text-left">
                      <span className="px-2 py-0.5 rounded-md bg-white text-emerald-900 text-xs font-black shrink-0">
                        5.1
                      </span>
                      <span className="text-xs sm:text-sm font-black uppercase tracking-wide truncate">
                        Talude de Montante
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-slate-950/35 border border-white/20 text-emerald-100">
                        {stats.evaluated}/{stats.total} avaliados
                      </span>
                      {stats.withAnomalies > 0 && (
                        <span className="text-[11px] font-black px-2 py-0.5 rounded-md bg-rose-600 text-white border border-rose-300">
                          {stats.withAnomalies} anomalia(s)
                        </span>
                      )}
                      {openSections.sec5 ? <ChevronUp className="w-5 h-5 text-white" /> : <ChevronDown className="w-5 h-5 text-white" />}
                    </div>
                  </button>

                  {openSections.sec5 && (
                    <>
                      <div className="p-4 sm:p-5 space-y-4">
                        <SubBlockCard
                          code="5.1.A"
                          title="Checklist de Inspeção Visual — Talude de Montante"
                          icon={ClipboardList}
                          action={
                            stats.pending > 0 ? (
                              <button
                                type="button"
                                onClick={() => handleBulkMarkComponentPendingAsNo('montante', 'Talude de Montante', MONTANTE_ITEMS)}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold text-xs shadow-xs transition cursor-pointer select-none"
                                title="Preenche todos os itens não respondidos do Talude de Montante como 'Não' (Sem anomalias)"
                              >
                                <Check className="w-3.5 h-3.5" />
                                <span>Preencher {stats.pending} pendente(s) como &quot;Não&quot;</span>
                              </button>
                            ) : (
                              <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 flex items-center gap-1">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>Checklist concluído</span>
                              </span>
                            )
                          }
                        >
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
                        </SubBlockCard>

                        <SubBlockCard code="5.1.B" title="Proteção Superficial e Comentários — Talude de Montante">
                          <div>
                            <label className="block text-xs font-bold text-slate-800 dark:text-slate-200 mb-2">
                              Proteção do Talude:
                            </label>
                            <div className="grid grid-cols-2 sm:grid-cols-6 gap-2">
                              {['RIP RAP', 'Grama', 'Concreto', 'Cascalho', 'Ausente', 'Outros'].map(prot => {
                                const selectedList = data.taludeMontanteProtecao || [];
                                const isChecked = selectedList.includes(prot);
                                return (
                                  <label
                                    key={prot}
                                    className={`min-h-[40px] flex items-center gap-2 p-2 rounded-lg border text-xs cursor-pointer transition ${
                                      isChecked
                                        ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-500 text-emerald-950 dark:text-emerald-200 font-bold'
                                        : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                                    }`}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={isChecked}
                                      onChange={() => {
                                        onChange(p => {
                                          const current = p.taludeMontanteProtecao || [];
                                          let next: string[];
                                          if (current.includes(prot)) {
                                            next = current.filter(item => item !== prot);
                                          } else if (prot === 'Ausente') {
                                            next = ['Ausente'];
                                          } else {
                                            next = [...current.filter(item => item !== 'Ausente'), prot];
                                          }
                                          return { ...p, taludeMontanteProtecao: next };
                                        });
                                      }}
                                      className="w-4 h-4 text-emerald-600 rounded"
                                    />
                                    <span>{prot}</span>
                                  </label>
                                );
                              })}
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
                        </SubBlockCard>

                        <SubBlockCard code="5.1.C" title="Registro Fotográfico — Talude de Montante" icon={Camera}>
                          <ComponentPhotoUploader
                            componentId="talude_montante"
                            componentName="Talude de Montante"
                            allPhotos={data.photos || []}
                            onUpdatePhotos={handleUpdatePhotos}
                            inspectionId={data.id}
                          />
                        </SubBlockCard>
                      </div>
                      <BoundaryFooter
                        endLabel="Componente 5.1 · Talude de Montante"
                        prevLabel="4. Medidas Técnicas"
                        onJumpPrev={() => handleNavigateToSection('sec4', 'sec-topico-4')}
                        nextLabel="5.2 Coroamento"
                        onJumpNext={() => handleNavigateToSection('sec6', 'sec-subtopico-5-2', 'secComponentes')}
                      />
                    </>
                  )}
                </div>
              );
            })()}

            {/* ========================================================================= */}
            {/* COMPONENTE 5.2: COROAMENTO (CRISTA)                                       */}
            {/* ========================================================================= */}
            {(() => {
              const stats = getComponentEvaluationStats('coroamento', COROAMENTO_ITEMS);
              const isFocused = frozenContext.componentId === 'sec-subtopico-5-2';
              return (
                <div
                  id="sec-subtopico-5-2"
                  data-form-component="5.2. Coroamento (Crista)"
                  data-form-component-id="sec-subtopico-5-2"
                  data-form-component-seckey="sec6"
                  data-form-component-parentkey="secComponentes"
                  className={`bg-white dark:bg-slate-900 rounded-2xl border-2 shadow-sm scroll-mt-36 transition-all ${
                    isFocused
                      ? 'border-emerald-600 dark:border-emerald-500 ring-2 ring-emerald-500/20'
                      : 'border-slate-300 dark:border-slate-700'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => toggleSection('sec6')}
                    className={`w-full px-4 py-3 bg-gradient-to-r from-emerald-800 via-emerald-700 to-teal-700 text-white ${
                      openSections.sec6 ? 'rounded-t-[14px]' : 'rounded-[14px]'
                    } flex flex-wrap items-center justify-between gap-2.5 cursor-pointer select-none hover:brightness-105 transition`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0 text-left">
                      <span className="px-2 py-0.5 rounded-md bg-white text-emerald-900 text-xs font-black shrink-0">
                        5.2
                      </span>
                      <span className="text-xs sm:text-sm font-black uppercase tracking-wide truncate">
                        Coroamento (Crista)
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-slate-950/35 border border-white/20 text-emerald-100">
                        {stats.evaluated}/{stats.total} avaliados
                      </span>
                      {stats.withAnomalies > 0 && (
                        <span className="text-[11px] font-black px-2 py-0.5 rounded-md bg-rose-600 text-white border border-rose-300">
                          {stats.withAnomalies} anomalia(s)
                        </span>
                      )}
                      {openSections.sec6 ? <ChevronUp className="w-5 h-5 text-white" /> : <ChevronDown className="w-5 h-5 text-white" />}
                    </div>
                  </button>

                  {openSections.sec6 && (
                    <>
                      <div className="p-4 sm:p-5 space-y-4">
                        <SubBlockCard
                          code="5.2.A"
                          title="Checklist de Inspeção Visual — Coroamento (Crista)"
                          icon={ClipboardList}
                          action={
                            stats.pending > 0 ? (
                              <button
                                type="button"
                                onClick={() => handleBulkMarkComponentPendingAsNo('coroamento', 'Coroamento (Crista)', COROAMENTO_ITEMS)}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold text-xs shadow-xs transition cursor-pointer select-none"
                                title="Preenche todos os itens não respondidos do Coroamento como 'Não' (Sem anomalias)"
                              >
                                <Check className="w-3.5 h-3.5" />
                                <span>Preencher {stats.pending} pendente(s) como &quot;Não&quot;</span>
                              </button>
                            ) : (
                              <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 flex items-center gap-1">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>Checklist concluído</span>
                              </span>
                            )
                          }
                        >
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
                        </SubBlockCard>

                        <SubBlockCard code="5.2.B" title="Conservação das Ombreiras e Comentários — Coroamento">
                          <div>
                            <label className="block text-xs font-bold text-slate-800 dark:text-slate-200 mb-2">
                              Estado de Conservação das Ombreiras:
                            </label>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              <div>
                                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                                  Ombreira Esquerda:
                                </label>
                                <input
                                  type="text"
                                  placeholder="Condição visual, trincas, erosão no contato..."
                                  value={data.ombreiras?.esquerda || ''}
                                  onChange={e => onChange(p => ({
                                    ...p,
                                    ombreiras: { ...(p.ombreiras || {}), esquerda: e.target.value }
                                  }))}
                                  className="w-full text-xs sm:text-sm min-h-[44px] p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                                />
                              </div>
                              <div>
                                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                                  Ombreira Direita:
                                </label>
                                <input
                                  type="text"
                                  placeholder="Condição visual, trincas, erosão no contato..."
                                  value={data.ombreiras?.direita || ''}
                                  onChange={e => onChange(p => ({
                                    ...p,
                                    ombreiras: { ...(p.ombreiras || {}), direita: e.target.value }
                                  }))}
                                  className="w-full text-xs sm:text-sm min-h-[44px] p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
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
                        </SubBlockCard>

                        <SubBlockCard code="5.2.C" title="Registro Fotográfico — Coroamento (Crista)" icon={Camera}>
                          <ComponentPhotoUploader
                            componentId="crista"
                            componentName="Crista da Barragem (Coroamento)"
                            allPhotos={data.photos || []}
                            onUpdatePhotos={handleUpdatePhotos}
                            inspectionId={data.id}
                          />
                        </SubBlockCard>
                      </div>
                      <BoundaryFooter
                        endLabel="Componente 5.2 · Coroamento"
                        prevLabel="5.1 Montante"
                        onJumpPrev={() => handleNavigateToSection('sec5', 'sec-subtopico-5-1', 'secComponentes')}
                        nextLabel="5.3 Talude de Jusante"
                        onJumpNext={() => handleNavigateToSection('sec7', 'sec-subtopico-5-3', 'secComponentes')}
                      />
                    </>
                  )}
                </div>
              );
            })()}

            {/* ========================================================================= */}
            {/* COMPONENTE 5.3: TALUDE DE JUSANTE                                         */}
            {/* ========================================================================= */}
            {(() => {
              const stats = getComponentEvaluationStats('jusante', JUSANTE_ITEMS);
              const isFocused = frozenContext.componentId === 'sec-subtopico-5-3';
              return (
                <div
                  id="sec-subtopico-5-3"
                  data-form-component="5.3. Talude de Jusante"
                  data-form-component-id="sec-subtopico-5-3"
                  data-form-component-seckey="sec7"
                  data-form-component-parentkey="secComponentes"
                  className={`bg-white dark:bg-slate-900 rounded-2xl border-2 shadow-sm scroll-mt-36 transition-all ${
                    isFocused
                      ? 'border-emerald-600 dark:border-emerald-500 ring-2 ring-emerald-500/20'
                      : 'border-slate-300 dark:border-slate-700'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => toggleSection('sec7')}
                    className={`w-full px-4 py-3 bg-gradient-to-r from-emerald-800 via-emerald-700 to-teal-700 text-white ${
                      openSections.sec7 ? 'rounded-t-[14px]' : 'rounded-[14px]'
                    } flex flex-wrap items-center justify-between gap-2.5 cursor-pointer select-none hover:brightness-105 transition`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0 text-left">
                      <span className="px-2 py-0.5 rounded-md bg-white text-emerald-900 text-xs font-black shrink-0">
                        5.3
                      </span>
                      <span className="text-xs sm:text-sm font-black uppercase tracking-wide truncate">
                        Talude de Jusante
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-slate-950/35 border border-white/20 text-emerald-100">
                        {stats.evaluated}/{stats.total} avaliados
                      </span>
                      {stats.withAnomalies > 0 && (
                        <span className="text-[11px] font-black px-2 py-0.5 rounded-md bg-rose-600 text-white border border-rose-300">
                          {stats.withAnomalies} anomalia(s)
                        </span>
                      )}
                      {openSections.sec7 ? <ChevronUp className="w-5 h-5 text-white" /> : <ChevronDown className="w-5 h-5 text-white" />}
                    </div>
                  </button>

                  {openSections.sec7 && (
                    <>
                      <div className="p-4 sm:p-5 space-y-4">
                        <SubBlockCard
                          code="5.3.A"
                          title="Checklist de Inspeção Visual — Talude de Jusante"
                          icon={ClipboardList}
                          action={
                            stats.pending > 0 ? (
                              <button
                                type="button"
                                onClick={() => handleBulkMarkComponentPendingAsNo('jusante', 'Talude de Jusante', JUSANTE_ITEMS)}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold text-xs shadow-xs transition cursor-pointer select-none"
                                title="Preenche todos os itens não respondidos do Talude de Jusante como 'Não' (Sem anomalias)"
                              >
                                <Check className="w-3.5 h-3.5" />
                                <span>Preencher {stats.pending} pendente(s) como &quot;Não&quot;</span>
                              </button>
                            ) : (
                              <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 flex items-center gap-1">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>Checklist concluído</span>
                              </span>
                            )
                          }
                        >
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
                              value={getItem('jusante', 'fuga_agua', "Sinais de Fuga D'Água ou Áreas Úmidas")}
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
                        </SubBlockCard>

                        <SubBlockCard code="5.3.B" title="Comentários Técnicos — Talude de Jusante">
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
                        </SubBlockCard>

                        <SubBlockCard code="5.3.C" title="Registro Fotográfico — Talude de Jusante" icon={Camera}>
                          <ComponentPhotoUploader
                            componentId="talude_jusante"
                            componentName="Talude de Jusante"
                            allPhotos={data.photos || []}
                            onUpdatePhotos={handleUpdatePhotos}
                            inspectionId={data.id}
                          />
                        </SubBlockCard>
                      </div>
                      <BoundaryFooter
                        endLabel="Componente 5.3 · Talude de Jusante"
                        prevLabel="5.2 Coroamento"
                        onJumpPrev={() => handleNavigateToSection('sec6', 'sec-subtopico-5-2', 'secComponentes')}
                        nextLabel="5.4 Região a Jusante"
                        onJumpNext={() => handleNavigateToSection('sec8', 'sec-subtopico-5-4', 'secComponentes')}
                      />
                    </>
                  )}
                </div>
              );
            })()}

            {/* ========================================================================= */}
            {/* COMPONENTE 5.4: REGIÃO A JUSANTE DA BARRAGEM                              */}
            {/* ========================================================================= */}
            {(() => {
              const stats = getComponentEvaluationStats('regiao_jusante', REGIAO_JUSANTE_ITEMS);
              const isFocused = frozenContext.componentId === 'sec-subtopico-5-4';
              return (
                <div
                  id="sec-subtopico-5-4"
                  data-form-component="5.4. Região a Jusante"
                  data-form-component-id="sec-subtopico-5-4"
                  data-form-component-seckey="sec8"
                  data-form-component-parentkey="secComponentes"
                  className={`bg-white dark:bg-slate-900 rounded-2xl border-2 shadow-sm scroll-mt-36 transition-all ${
                    isFocused
                      ? 'border-emerald-600 dark:border-emerald-500 ring-2 ring-emerald-500/20'
                      : 'border-slate-300 dark:border-slate-700'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => toggleSection('sec8')}
                    className={`w-full px-4 py-3 bg-gradient-to-r from-emerald-800 via-emerald-700 to-teal-700 text-white ${
                      openSections.sec8 ? 'rounded-t-[14px]' : 'rounded-[14px]'
                    } flex flex-wrap items-center justify-between gap-2.5 cursor-pointer select-none hover:brightness-105 transition`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0 text-left">
                      <span className="px-2 py-0.5 rounded-md bg-white text-emerald-900 text-xs font-black shrink-0">
                        5.4
                      </span>
                      <span className="text-xs sm:text-sm font-black uppercase tracking-wide truncate">
                        Região a Jusante da Barragem
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-slate-950/35 border border-white/20 text-emerald-100">
                        {stats.evaluated}/{stats.total} avaliados
                      </span>
                      {stats.withAnomalies > 0 && (
                        <span className="text-[11px] font-black px-2 py-0.5 rounded-md bg-rose-600 text-white border border-rose-300">
                          {stats.withAnomalies} anomalia(s)
                        </span>
                      )}
                      {openSections.sec8 ? <ChevronUp className="w-5 h-5 text-white" /> : <ChevronDown className="w-5 h-5 text-white" />}
                    </div>
                  </button>

                  {openSections.sec8 && (
                    <>
                      <div className="p-4 sm:p-5 space-y-4">
                        <SubBlockCard
                          code="5.4.A"
                          title="Checklist de Inspeção Visual — Região a Jusante"
                          icon={ClipboardList}
                          action={
                            stats.pending > 0 ? (
                              <button
                                type="button"
                                onClick={() => handleBulkMarkComponentPendingAsNo('regiao_jusante', 'Região a Jusante', REGIAO_JUSANTE_ITEMS)}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold text-xs shadow-xs transition cursor-pointer select-none"
                                title="Preenche todos os itens não respondidos da Região a Jusante como 'Não' (Sem anomalias)"
                              >
                                <Check className="w-3.5 h-3.5" />
                                <span>Preencher {stats.pending} pendente(s) como &quot;Não&quot;</span>
                              </button>
                            ) : (
                              <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 flex items-center gap-1">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>Checklist concluído</span>
                              </span>
                            )
                          }
                        >
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
                              value={getItem('regiao_jusante', 'fuga_agua', "Fuga D'Água / Percolação Anormal")}
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
                        </SubBlockCard>

                        <SubBlockCard code="5.4.B" title="Comentários Técnicos — Região a Jusante">
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
                        </SubBlockCard>

                        <SubBlockCard code="5.4.C" title="Registro Fotográfico — Região a Jusante" icon={Camera}>
                          <ComponentPhotoUploader
                            componentId="area_jusante"
                            componentName="Região a Jusante da Barragem"
                            allPhotos={data.photos || []}
                            onUpdatePhotos={handleUpdatePhotos}
                            inspectionId={data.id}
                          />
                        </SubBlockCard>
                      </div>
                      <BoundaryFooter
                        endLabel="Componente 5.4 · Região a Jusante"
                        prevLabel="5.3 Talude de Jusante"
                        onJumpPrev={() => handleNavigateToSection('sec7', 'sec-subtopico-5-3', 'secComponentes')}
                        nextLabel="5.5 Instrumentação"
                        onJumpNext={() => handleNavigateToSection('sec9', 'sec-subtopico-5-5', 'secComponentes')}
                      />
                    </>
                  )}
                </div>
              );
            })()}

            {/* ========================================================================= */}
            {/* COMPONENTE 5.5: INSTRUMENTAÇÃO DE MONITORAMENTO                           */}
            {/* ========================================================================= */}
            <div
              id="sec-subtopico-5-5"
              data-form-component="5.5. Instrumentação"
              data-form-component-id="sec-subtopico-5-5"
              data-form-component-seckey="sec9"
              data-form-component-parentkey="secComponentes"
              className={`bg-white dark:bg-slate-900 rounded-2xl border-2 shadow-sm scroll-mt-36 transition-all ${
                frozenContext.componentId === 'sec-subtopico-5-5'
                  ? 'border-emerald-600 dark:border-emerald-500 ring-2 ring-emerald-500/20'
                  : 'border-slate-300 dark:border-slate-700'
              }`}
            >
              <button
                type="button"
                onClick={() => toggleSection('sec9')}
                className={`w-full px-4 py-3 bg-gradient-to-r from-emerald-800 via-emerald-700 to-teal-700 text-white ${
                  openSections.sec9 ? 'rounded-t-[14px]' : 'rounded-[14px]'
                } flex flex-wrap items-center justify-between gap-2.5 cursor-pointer select-none hover:brightness-105 transition`}
              >
                <div className="flex items-center gap-2.5 min-w-0 text-left">
                  <span className="px-2 py-0.5 rounded-md bg-white text-emerald-900 text-xs font-black shrink-0">
                    5.5
                  </span>
                  <span className="text-xs sm:text-sm font-black uppercase tracking-wide truncate">
                    Instrumentação de Monitoramento
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-slate-950/35 border border-white/20 text-emerald-100">
                    {(data.instrumentacaoTipos || []).length > 0
                      ? `${data.instrumentacaoTipos!.length} selecionado(s)`
                      : 'Sem seleção'}
                  </span>
                  {openSections.sec9 ? <ChevronUp className="w-5 h-5 text-white" /> : <ChevronDown className="w-5 h-5 text-white" />}
                </div>
              </button>

              {openSections.sec9 && (
                <>
                  <div className="p-4 sm:p-5 space-y-4">
                    <SubBlockCard code="5.5.A" title="Instrumentos de Monitoramento Existentes">
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {[
                          'Piezômetro',
                          'Marcos de Recalque',
                          'Medidores de Vazão de Percolação',
                          'Poços de Alívio',
                          'Réguas Limnimétricas',
                          'NÃO POSSUI'
                        ].map(inst => {
                          const selectedInsts = data.instrumentacaoTipos || [];
                          const isChecked = selectedInsts.includes(inst);
                          return (
                            <label
                              key={inst}
                              className={`min-h-[44px] flex items-center gap-2 p-2.5 rounded-lg border text-xs cursor-pointer font-medium transition ${
                                isChecked
                                  ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-500 text-emerald-950 dark:text-emerald-200 font-bold'
                                  : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => {
                                  onChange(p => {
                                    const current = p.instrumentacaoTipos || [];
                                    let next: string[];
                                    if (current.includes(inst)) {
                                      next = current.filter(item => item !== inst);
                                    } else if (inst === 'NÃO POSSUI') {
                                      next = ['NÃO POSSUI'];
                                    } else {
                                      next = [...current.filter(item => item !== 'NÃO POSSUI'), inst];
                                    }
                                    return { ...p, instrumentacaoTipos: next };
                                  });
                                }}
                                className="w-4 h-4 text-emerald-600 rounded"
                              />
                              <span>{inst}</span>
                            </label>
                          );
                        })}
                      </div>
                    </SubBlockCard>

                    <SubBlockCard code="5.5.B" title="Comentários e Fotos — Instrumentação" icon={Camera}>
                      <SpeechTextarea
                        label="Comentários - Instrumentação:"
                        rows={2}
                        value={sectionComments.instrumentacao || ''}
                        onValueChange={val => updateSectionComment('instrumentacao', val)}
                        placeholder="Leituras realizadas, conservação dos instrumentos..."
                      />
                      <ComponentPhotoUploader
                        componentId="instrumentacao"
                        componentName="Instrumentação de Monitoramento"
                        allPhotos={data.photos || []}
                        onUpdatePhotos={handleUpdatePhotos}
                        inspectionId={data.id}
                      />
                    </SubBlockCard>
                  </div>
                  <BoundaryFooter
                    endLabel="Componente 5.5 · Instrumentação"
                    prevLabel="5.4 Região a Jusante"
                    onJumpPrev={() => handleNavigateToSection('sec8', 'sec-subtopico-5-4', 'secComponentes')}
                    nextLabel="5.6 Estruturas Vertedoras"
                    onJumpNext={() => handleNavigateToSection('sec10', 'sec-subtopico-5-6', 'secComponentes')}
                  />
                </>
              )}
            </div>

            {/* ========================================================================= */}
            {/* COMPONENTE 5.6: ESTRUTURAS VERTEDORAS                                     */}
            {/* ========================================================================= */}
            <div
              id="sec-subtopico-5-6"
              data-form-component="5.6. Estruturas Vertedoras"
              data-form-component-id="sec-subtopico-5-6"
              data-form-component-seckey="sec10"
              data-form-component-parentkey="secComponentes"
              className={`bg-white dark:bg-slate-900 rounded-2xl border-2 shadow-sm scroll-mt-36 transition-all ${
                frozenContext.componentId === 'sec-subtopico-5-6'
                  ? 'border-emerald-600 dark:border-emerald-500 ring-2 ring-emerald-500/20'
                  : 'border-slate-300 dark:border-slate-700'
              }`}
            >
              <button
                type="button"
                onClick={() => toggleSection('sec10')}
                className={`w-full px-4 py-3 bg-gradient-to-r from-emerald-800 via-emerald-700 to-teal-700 text-white ${
                  openSections.sec10 ? 'rounded-t-[14px]' : 'rounded-[14px]'
                } flex flex-wrap items-center justify-between gap-2.5 cursor-pointer select-none hover:brightness-105 transition`}
              >
                <div className="flex items-center gap-2.5 min-w-0 text-left">
                  <span className="px-2 py-0.5 rounded-md bg-white text-emerald-900 text-xs font-black shrink-0">
                    5.6
                  </span>
                  <span className="text-xs sm:text-sm font-black uppercase tracking-wide truncate">
                    Estruturas Vertedoras (Vertedor, Monge, Ladrão, etc.)
                  </span>
                </div>
                {openSections.sec10 ? <ChevronUp className="w-5 h-5 text-white shrink-0" /> : <ChevronDown className="w-5 h-5 text-white shrink-0" />}
              </button>

              {openSections.sec10 && (
                <>
                  <div className="p-4 sm:p-5 space-y-4">
                    <SubBlockCard code="5.6.A" title="Descrição Técnica e Condição Operacional do Vertedouro">
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
                    </SubBlockCard>

                    <SubBlockCard code="5.6.B" title="Registro Fotográfico — Estruturas Vertedoras" icon={Camera}>
                      <ComponentPhotoUploader
                        componentId="vertedouro"
                        componentName="Estruturas Vertedoras (Vertedouro, Extravasor)"
                        allPhotos={data.photos || []}
                        onUpdatePhotos={handleUpdatePhotos}
                        inspectionId={data.id}
                      />
                    </SubBlockCard>
                  </div>
                  <BoundaryFooter
                    endLabel="Componente 5.6 · Estruturas Vertedoras"
                    prevLabel="5.5 Instrumentação"
                    onJumpPrev={() => handleNavigateToSection('sec9', 'sec-subtopico-5-5', 'secComponentes')}
                    nextLabel="5.7 Reservatório"
                    onJumpNext={() => handleNavigateToSection('sec11', 'sec-subtopico-5-7', 'secComponentes')}
                  />
                </>
              )}
            </div>

            {/* ========================================================================= */}
            {/* COMPONENTE 5.7: RESERVATÓRIO                                              */}
            {/* ========================================================================= */}
            {(() => {
              const stats = getComponentEvaluationStats('reservatorio', RESERVATORIO_ITEMS);
              const isFocused = frozenContext.componentId === 'sec-subtopico-5-7';
              return (
                <div
                  id="sec-subtopico-5-7"
                  data-form-component="5.7. Reservatório"
                  data-form-component-id="sec-subtopico-5-7"
                  data-form-component-seckey="sec11"
                  data-form-component-parentkey="secComponentes"
                  className={`bg-white dark:bg-slate-900 rounded-2xl border-2 shadow-sm scroll-mt-36 transition-all ${
                    isFocused
                      ? 'border-emerald-600 dark:border-emerald-500 ring-2 ring-emerald-500/20'
                      : 'border-slate-300 dark:border-slate-700'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => toggleSection('sec11')}
                    className={`w-full px-4 py-3 bg-gradient-to-r from-emerald-800 via-emerald-700 to-teal-700 text-white ${
                      openSections.sec11 ? 'rounded-t-[14px]' : 'rounded-[14px]'
                    } flex flex-wrap items-center justify-between gap-2.5 cursor-pointer select-none hover:brightness-105 transition`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0 text-left">
                      <span className="px-2 py-0.5 rounded-md bg-white text-emerald-900 text-xs font-black shrink-0">
                        5.7
                      </span>
                      <span className="text-xs sm:text-sm font-black uppercase tracking-wide truncate">
                        Reservatório
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-slate-950/35 border border-white/20 text-emerald-100">
                        {stats.evaluated}/{stats.total} avaliados
                      </span>
                      {stats.withAnomalies > 0 && (
                        <span className="text-[11px] font-black px-2 py-0.5 rounded-md bg-rose-600 text-white border border-rose-300">
                          {stats.withAnomalies} anomalia(s)
                        </span>
                      )}
                      {openSections.sec11 ? <ChevronUp className="w-5 h-5 text-white" /> : <ChevronDown className="w-5 h-5 text-white" />}
                    </div>
                  </button>

                  {openSections.sec11 && (
                    <>
                      <div className="p-4 sm:p-5 space-y-4">
                        <SubBlockCard
                          code="5.7.A"
                          title="Checklist de Inspeção Visual — Reservatório"
                          icon={ClipboardList}
                          action={
                            stats.pending > 0 ? (
                              <button
                                type="button"
                                onClick={() => handleBulkMarkComponentPendingAsNo('reservatorio', 'Reservatório', RESERVATORIO_ITEMS)}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold text-xs shadow-xs transition cursor-pointer select-none"
                                title="Preenche todos os itens não respondidos do Reservatório como 'Não' (Sem anomalias)"
                              >
                                <Check className="w-3.5 h-3.5" />
                                <span>Preencher {stats.pending} pendente(s) como &quot;Não&quot;</span>
                              </button>
                            ) : (
                              <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 flex items-center gap-1">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>Checklist concluído</span>
                              </span>
                            )
                          }
                        >
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
                        </SubBlockCard>

                        <SubBlockCard code="5.7.B" title="Comentários Técnicos — Reservatório">
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
                        </SubBlockCard>

                        <SubBlockCard code="5.7.C" title="Registro Fotográfico — Reservatório e Margens" icon={Camera}>
                          <ComponentPhotoUploader
                            componentId="reservatorio_borda"
                            componentName="Reservatório, Borda Livre e Margens"
                            allPhotos={data.photos || []}
                            onUpdatePhotos={handleUpdatePhotos}
                            inspectionId={data.id}
                          />
                        </SubBlockCard>
                      </div>
                      <BoundaryFooter
                        endLabel="Componente 5.7 · Reservatório"
                        prevLabel="5.6 Vertedoras"
                        onJumpPrev={() => handleNavigateToSection('sec10', 'sec-subtopico-5-6', 'secComponentes')}
                        nextLabel="6. Outros Problemas"
                        onJumpNext={() => handleNavigateToSection('sec12', 'sec-topico-6')}
                      />
                    </>
                  )}
                </div>
              );
            })()}
          </div>
          <BoundaryFooter
            endLabel="Bloco 5 · Componentes da Barragem"
            prevLabel="4. Características Técnicas"
            onJumpPrev={() => handleNavigateToSection('sec4', 'sec-topico-4')}
            nextLabel="6. Outros Problemas e Acompanhantes"
            onJumpNext={() => handleNavigateToSection('sec12', 'sec-topico-6')}
          />
          </>
        )}
      </section>

      {/* ========================================================================= */}
      {/* BLOCO 6: OUTROS PROBLEMAS E PESSOAS QUE ACOMPANHARAM                      */}
      {/* ========================================================================= */}
      <section
        id="sec-topico-6"
        data-form-block="6. Outros Problemas e Acompanhantes"
        data-form-block-id="sec-topico-6"
        data-form-block-seckey="sec12"
        className={`bg-white dark:bg-slate-900 rounded-2xl border-2 shadow-sm scroll-mt-36 transition-all ${
          frozenContext.blockId === 'sec-topico-6'
            ? 'border-emerald-500/70 ring-2 ring-emerald-500/20'
            : 'border-slate-300/90 dark:border-slate-700'
        }`}
      >
        <button
          type="button"
          onClick={() => toggleSection('sec12')}
          className={`w-full px-4 py-3 sm:px-5 sm:py-3.5 bg-slate-900 dark:bg-slate-950 text-white ${
            openSections.sec12 ? 'rounded-t-[14px]' : 'rounded-[14px]'
          } flex items-center justify-between gap-3 cursor-pointer select-none hover:bg-slate-800/95 transition-colors`}
        >
          <div className="flex items-center gap-3 min-w-0 flex-wrap text-left">
            <span className="w-7 h-7 rounded-lg bg-emerald-500 text-slate-950 flex items-center justify-center text-xs font-black shrink-0 shadow-xs">
              6
            </span>
            <div className="min-w-0">
              <span className="block text-xs sm:text-sm font-black uppercase tracking-wide text-white">
                6. Outros Problemas e Pessoas que Acompanharam
              </span>
              <span className="block text-[11px] font-medium text-slate-300">
                Sub-blocos: 6A Ocorrências Gerais · 6B Acompanhantes em Campo · 6C Fotos Complementares
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 text-emerald-400 text-xs font-bold">
            <span className="hidden sm:inline">{openSections.sec12 ? 'Recolher' : 'Expandir'}</span>
            {openSections.sec12 ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
          </div>
        </button>

        {openSections.sec12 && (
          <>
            <div className="p-4 sm:p-5 space-y-4">
              <SubBlockCard code="6A" title="Outros Problemas Existentes e Observações Gerais">
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
              </SubBlockCard>

              <SubBlockCard code="6B" title="Relação de Pessoas que Acompanharam a Vistoria" icon={UserCheck}>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Nome Completo do Acompanhante
                    </label>
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
                      className="w-full text-xs sm:text-sm min-h-[44px] p-2.5 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      CPF do Acompanhante
                    </label>
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
                      className="w-full text-xs sm:text-sm min-h-[44px] p-2.5 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                    />
                  </div>
                </div>
              </SubBlockCard>

              <SubBlockCard code="6C" title="Registro Fotográfico — Outros Problemas" icon={Camera}>
                <ComponentPhotoUploader
                  componentId="outros"
                  componentName="Outros Problemas e Anomalias Gerais"
                  allPhotos={data.photos || []}
                  onUpdatePhotos={handleUpdatePhotos}
                  inspectionId={data.id}
                />
              </SubBlockCard>
            </div>
            <BoundaryFooter
              endLabel="Bloco 6 · Outros Problemas e Acompanhantes"
              prevLabel="5.7 Reservatório"
              onJumpPrev={() => handleNavigateToSection('sec11', 'sec-subtopico-5-7', 'secComponentes')}
              nextLabel="7. Fotos de Campo e Anexos"
              onJumpNext={() => handleNavigateToSection('secFotos', 'sec-topico-fotos')}
            />
          </>
        )}
      </section>

      {/* ========================================================================= */}
      {/* BLOCO 7: ANEXAR FOTOS APÓS O PREENCHIMENTO E VINCULAR AOS COMPONENTES     */}
      {/* ========================================================================= */}
      <section
        id="sec-topico-fotos"
        data-form-block="7. Fotos de Campo e Anexos"
        data-form-block-id="sec-topico-fotos"
        data-form-block-seckey="secFotos"
        className={`bg-white dark:bg-slate-900 rounded-2xl border-2 shadow-sm scroll-mt-36 transition-all ${
          frozenContext.blockId === 'sec-topico-fotos'
            ? 'border-emerald-500/70 ring-2 ring-emerald-500/20'
            : 'border-slate-300/90 dark:border-slate-700'
        }`}
      >
        <button
          type="button"
          onClick={() => toggleSection('secFotos')}
          className={`w-full px-4 py-3 sm:px-5 sm:py-3.5 bg-slate-900 dark:bg-slate-950 text-white ${
            openSections.secFotos ? 'rounded-t-[14px]' : 'rounded-[14px]'
          } flex items-center justify-between gap-3 cursor-pointer select-none hover:bg-slate-800/95 transition-colors`}
        >
          <div className="flex items-center gap-3 min-w-0 flex-wrap text-left">
            <span className="w-7 h-7 rounded-lg bg-emerald-500 text-slate-950 flex items-center justify-center text-xs font-black shrink-0 shadow-xs">
              7
            </span>
            <div className="min-w-0">
              <span className="flex items-center gap-1.5 text-xs sm:text-sm font-black uppercase tracking-wide text-white">
                <Camera className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>7. Fotos de Campo e Anexos</span>
              </span>
              <span className="block text-[11px] font-medium text-slate-300">
                Sub-bloco: 7A Painel Central de Fotos ({(data.photos || []).length} foto(s) anexada(s))
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 text-emerald-400 text-xs font-bold">
            <span className="hidden sm:inline">{openSections.secFotos ? 'Recolher' : 'Expandir'}</span>
            {openSections.secFotos ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
          </div>
        </button>

        {openSections.secFotos && (
          <>
            <div className="p-4 sm:p-5">
              <SubBlockCard code="7A" title="Painel Central de Fotos e Vinculação por Componente" icon={Camera}>
                <GeneralPhotoAttachmentSection
                  allPhotos={data.photos || []}
                  onUpdatePhotos={handleUpdatePhotos}
                  inspectionId={data.id}
                />
              </SubBlockCard>
            </div>
            <BoundaryFooter
              endLabel="Bloco 7 · Fotos de Campo"
              prevLabel="6. Outros Problemas"
              onJumpPrev={() => handleNavigateToSection('sec12', 'sec-topico-6')}
            />
          </>
        )}
      </section>

      {/* Menu Flutuante de Tópicos e Subtópicos da Ficha */}
      <FloatingSheetNavMenu
        openSections={openSections}
        onNavigateToSection={handleNavigateToSection}
        onExpandAll={handleExpandAllSections}
        onCollapseAll={handleCollapseAllSections}
        photosCount={data.photos?.length || 0}
      />

      {/* Status de Rascunho Temporário vs Conclusão e Validação no Administra */}
      <div className="mt-6 space-y-3">
        {data.isDraft === false && (
          <div className="p-3 rounded-xl border border-indigo-300 dark:border-indigo-800 bg-indigo-50/80 dark:bg-indigo-950/40 text-xs text-indigo-950 dark:text-indigo-200 flex items-center gap-2">
            <Lock className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
            <span>
              <strong>Documento concluído (versão v{data.revisaoVersao || 1}):</strong> Edições silenciosas permanecem bloqueadas. Utilize o botão <strong>Retificar</strong> na <strong>Mesa Virtual</strong> para registrar correções auditáveis com justificativa.
            </span>
          </div>
        )}
        <VistoriaConclusaoBar
          data={data}
          onChange={onChange}
          currentUser={currentUser}
          onSaveDraft={(updated) => {
            if (updated && onPersistInspection) {
              onPersistInspection(updated);
            } else if (onSave) {
              onSave();
            }
          }}
          onNavigateToEntityBlock={(tipo) => {
            if (tipo === 'barragem') {
              handleNavigateToSection('sec1', 'sec-topico-1');
            } else {
              handleNavigateToSection('sec2', 'sec-topico-2');
            }
          }}
        />
      </div>

      {/* Barra de Ações e Navegação Inferior (In-flow e Otimizada para Celular e Tablet) */}
      <div className="mt-4 pt-4 pb-2 lg:pb-4 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2.5 sm:gap-3">
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
              title="Salvar rascunho da vistoria e manter dados temporários localmente"
            >
              <Save className="w-4 h-4" />
              <span>Salvar Rascunho</span>
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
