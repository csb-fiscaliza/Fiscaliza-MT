import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  Clock,
  Edit3,
  History,
  Inbox,
  Plus,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  UserCheck,
  X,
  XCircle
} from 'lucide-react';
import { InspectionData, UserProfile } from '../types/inspection';
import {
  PENDENCIA_SITUACOES,
  PendenciaHistoricoRecord,
  PendenciaRecord,
  PendenciaSituacao
} from '../types/pendencias';
import {
  PendenciasActor,
  canActorEditPendencia,
  canActorResolvePendencia,
  createPendencia,
  direcionarPendencia,
  isPendenciaAssignedToActor,
  listPendenciaHistorico,
  listPendencias,
  resolvePendenciasActor,
  updatePendencia,
  updatePendenciaSituacao
} from '../services/pendenciasService';
import { getUsers, subscribeUsers } from '../services/userService';

interface PendenciasStepProps {
  currentInspection: InspectionData;
  allInspections: InspectionData[];
  onGoToDashboard: () => void;
}

type ActiveTab = 'minhas' | 'geral' | 'direcionado';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SITUACAO_LABELS: Record<PendenciaSituacao, string> = {
  aberta: 'Aberta',
  direcionada: 'Direcionada',
  em_analise: 'Em análise',
  resolvida: 'Resolvida',
  cancelada: 'Cancelada'
};

const SITUACAO_BADGE_CLASSES: Record<PendenciaSituacao, string> = {
  aberta: 'bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950/60 dark:text-amber-200 dark:border-amber-800',
  direcionada: 'bg-indigo-100 text-indigo-900 border-indigo-300 dark:bg-indigo-950/60 dark:text-indigo-200 dark:border-indigo-800',
  em_analise: 'bg-cyan-100 text-cyan-900 border-cyan-300 dark:bg-cyan-950/60 dark:text-cyan-200 dark:border-cyan-800',
  resolvida: 'bg-emerald-100 text-emerald-900 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-200 dark:border-emerald-800',
  cancelada: 'bg-slate-200 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'
};

const TIPO_OPTIONS = [
  { value: 'vistoria_campo', label: 'Vistoria de Campo' },
  { value: 'anomalia_critica', label: 'Anomalia / Segurança' },
  { value: 'correcao_dados', label: 'Correção Cadastral' },
  { value: 'documentacao', label: 'Documentação / Minuta' },
  { value: 'notificacao', label: 'Notificação Técnica' },
  { value: 'outro', label: 'Outro' }
];

const REFERENCIA_TIPO_OPTIONS = [
  { value: '', label: 'Sem vínculo específico' },
  { value: 'vistoria', label: 'Vistoria' },
  { value: 'barragem', label: 'Barragem' },
  { value: 'empreendedor', label: 'Empreendedor' },
  { value: 'documento', label: 'Documento' },
  { value: 'outro', label: 'Outro' }
];

const HISTORICO_ACAO_LABELS: Record<string, string> = {
  criacao: 'Criação',
  direcionamento: 'Direcionamento',
  mudanca_situacao: 'Mudança de situação',
  edicao: 'Edição',
  resolucao: 'Resolução'
};

function formatDateTime(iso?: string | null): string {
  if (!iso) return '—';
  const dt = new Date(iso);
  if (isNaN(dt.getTime())) return iso;
  return dt.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function shortUuid(id?: string | null): string {
  if (!id) return '—';
  return id.length > 12 ? `${id.slice(0, 8)}…` : id;
}

export const PendenciasStep: React.FC<PendenciasStepProps> = ({
  currentInspection,
  allInspections,
  onGoToDashboard
}) => {
  const [actor, setActor] = useState<PendenciasActor | null>(null);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [pendencias, setPendencias] = useState<PendenciaRecord[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionFeedback, setActionFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [activeTab, setActiveTab] = useState<ActiveTab>('minhas');
  const [searchQuery, setSearchQuery] = useState('');
  const [situacaoFilter, setSituacaoFilter] = useState<'todas' | PendenciaSituacao>('todas');

  // Modal de criação
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [createForm, setCreateForm] = useState({
    titulo: '',
    tipo: 'vistoria_campo',
    descricao: '',
    responsavel_id: '',
    selectedInspectionId: '',
    tipo_referencia: '',
    referencia_id: '',
    origem_ref_id: '',
    barragem_id: '',
    empreendedor_id: '',
    motivo: ''
  });

  // Modal de edição
  const [editingItem, setEditingItem] = useState<PendenciaRecord | null>(null);
  const [editForm, setEditForm] = useState({
    titulo: '',
    tipo: 'vistoria_campo',
    descricao: '',
    tipo_referencia: '',
    referencia_id: '',
    origem_ref_id: '',
    barragem_id: '',
    empreendedor_id: '',
    motivo: ''
  });

  // Modal de direcionamento (Admin)
  const [direcionarItem, setDirecionarItem] = useState<PendenciaRecord | null>(null);
  const [direcionarResponsavelId, setDirecionarResponsavelId] = useState('');
  const [direcionarMotivo, setDirecionarMotivo] = useState('');

  // Modal de alteração de situação / resolução
  const [statusItem, setStatusItem] = useState<PendenciaRecord | null>(null);
  const [targetSituacao, setTargetSituacao] = useState<PendenciaSituacao>('resolvida');
  const [statusMotivo, setStatusMotivo] = useState('');

  // Modal de histórico (somente leitura)
  const [historyItem, setHistoryItem] = useState<PendenciaRecord | null>(null);
  const [historyRows, setHistoryRows] = useState<PendenciaHistoricoRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const loadUsersCatalog = useCallback(async () => {
    try {
      const list = await getUsers();
      setUsers(list);
    } catch {
      // mantém catálogo vazio caso indisponível
    }
  }, []);

  const loadModuleData = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const actorRes = await resolvePendenciasActor();
      if (!actorRes.success || !actorRes.data) {
        setActor(null);
        setPendencias([]);
        setLoadError(actorRes.error || 'Não foi possível validar sua sessão.');
        return;
      }

      setActor(actorRes.data);
      if (!actorRes.data.isAdmin && activeTab === 'direcionado') {
        setActiveTab('minhas');
      }

      const [listRes] = await Promise.all([listPendencias(), loadUsersCatalog()]);
      if (!listRes.success) {
        setPendencias([]);
        setLoadError(listRes.error || 'Falha ao carregar pendências.');
        return;
      }

      setPendencias(listRes.data || []);
    } finally {
      setIsLoading(false);
    }
  }, [activeTab, loadUsersCatalog]);

  useEffect(() => {
    loadModuleData();
    const unsub = subscribeUsers(() => {
      loadUsersCatalog();
    });
    return unsub;
  }, [loadModuleData, loadUsersCatalog]);

  const userDisplayById = useMemo(() => {
    const map = new Map<string, string>();
    users.forEach(u => {
      if (u.id) {
        map.set(u.id, `${u.name} (${u.email})`);
      }
    });
    if (actor) {
      actor.matchingIds.forEach(id => {
        if (!map.has(id)) {
          map.set(id, `${actor.fullName} (${actor.email})`);
        }
      });
    }
    return map;
  }, [users, actor]);

  const activeAssignableUsers = useMemo(
    () => users.filter(u => u.status === 'ativo'),
    [users]
  );

  const inspectionReferenceOptions = useMemo(() => {
    const map = new Map<string, InspectionData>();
    if (currentInspection?.id && UUID_REGEX.test(currentInspection.id)) {
      map.set(currentInspection.id, currentInspection);
    }
    allInspections.forEach(insp => {
      if (insp?.id && UUID_REGEX.test(insp.id)) {
        map.set(insp.id, insp);
      }
    });
    return Array.from(map.values());
  }, [currentInspection, allInspections]);

  const resolveUserLabel = (userId?: string | null): string => {
    if (!userId) return 'Sem responsável';
    if (actor && actor.matchingIds.includes(userId)) {
      return `${actor.fullName} (Você)`;
    }
    return userDisplayById.get(userId) || `Usuário ${shortUuid(userId)}`;
  };

  const resolveHistoryValueLabel = (campo: string | null, val: string | null): string => {
    if (!val) return '—';
    if (campo === 'responsavel_id') {
      return resolveUserLabel(val);
    }
    if (campo === 'situacao' && val in SITUACAO_LABELS) {
      return SITUACAO_LABELS[val as PendenciaSituacao];
    }
    return val;
  };

  const tabBaseList = useMemo(() => {
    if (!actor) return [];
    if (activeTab === 'minhas') {
      return pendencias.filter(p => isPendenciaAssignedToActor(p, actor));
    }
    if (activeTab === 'direcionado') {
      if (!actor.isAdmin) return [];
      return pendencias.filter(p => Boolean(p.responsavel_id));
    }
    return pendencias;
  }, [pendencias, activeTab, actor]);

  const filteredList = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return tabBaseList.filter(p => {
      if (situacaoFilter !== 'todas' && p.situacao !== situacaoFilter) {
        return false;
      }
      if (!q) return true;
      return (
        p.titulo.toLowerCase().includes(q) ||
        (p.descricao || '').toLowerCase().includes(q) ||
        p.tipo.toLowerCase().includes(q) ||
        p.id.toLowerCase().includes(q) ||
        (p.tipo_referencia || '').toLowerCase().includes(q)
      );
    });
  }, [tabBaseList, situacaoFilter, searchQuery]);

  const minhasCount = useMemo(
    () => (actor ? pendencias.filter(p => isPendenciaAssignedToActor(p, actor)).length : 0),
    [pendencias, actor]
  );
  const direcionadoCount = useMemo(
    () => (actor?.isAdmin ? pendencias.filter(p => Boolean(p.responsavel_id)).length : 0),
    [pendencias, actor]
  );

  const openHistoryModal = async (item: PendenciaRecord) => {
    setHistoryItem(item);
    setHistoryRows([]);
    setHistoryError(null);
    setHistoryLoading(true);
    try {
      const res = await listPendenciaHistorico(item.id);
      if (!res.success) {
        setHistoryError(res.error || 'Erro ao carregar histórico.');
      } else {
        setHistoryRows(res.data || []);
      }
    } finally {
      setHistoryLoading(false);
    }
  };

  const refreshHistoryIfOpen = async (pendenciaId: string) => {
    if (historyItem && historyItem.id === pendenciaId) {
      const res = await listPendenciaHistorico(pendenciaId);
      if (res.success) {
        setHistoryRows(res.data || []);
      }
    }
  };

  const handleOpenCreateModal = () => {
    setModalError(null);
    setCreateForm({
      titulo: '',
      tipo: 'vistoria_campo',
      descricao: '',
      responsavel_id: '',
      selectedInspectionId: '',
      tipo_referencia: '',
      referencia_id: '',
      origem_ref_id: '',
      barragem_id: '',
      empreendedor_id: '',
      motivo: ''
    });
    setShowCreateModal(true);
  };

  const handleSelectInspectionRef = (inspId: string, target: 'create' | 'edit') => {
    const selected = inspectionReferenceOptions.find(i => i.id === inspId);
    if (!selected) {
      if (target === 'create') {
        setCreateForm(prev => ({ ...prev, selectedInspectionId: '' }));
      }
      return;
    }

    const validInspId = UUID_REGEX.test(selected.id) ? selected.id : '';
    const validDamId = selected.barragemId && UUID_REGEX.test(selected.barragemId) ? selected.barragemId : '';
    const validEmpId =
      selected.empreendedorId && UUID_REGEX.test(selected.empreendedorId) ? selected.empreendedorId : '';

    if (target === 'create') {
      setCreateForm(prev => ({
        ...prev,
        selectedInspectionId: inspId,
        tipo_referencia: validInspId ? 'vistoria' : prev.tipo_referencia,
        referencia_id: validInspId || prev.referencia_id,
        origem_ref_id: validInspId || prev.origem_ref_id,
        barragem_id: validDamId || prev.barragem_id,
        empreendedor_id: validEmpId || prev.empreendedor_id
      }));
    } else {
      setEditForm(prev => ({
        ...prev,
        tipo_referencia: validInspId ? 'vistoria' : prev.tipo_referencia,
        referencia_id: validInspId || prev.referencia_id,
        origem_ref_id: validInspId || prev.origem_ref_id,
        barragem_id: validDamId || prev.barragem_id,
        empreendedor_id: validEmpId || prev.empreendedor_id
      }));
    }
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setModalError(null);
    setIsSubmitting(true);
    try {
      const res = await createPendencia({
        titulo: createForm.titulo,
        tipo: createForm.tipo,
        descricao: createForm.descricao,
        responsavel_id: actor?.isAdmin ? createForm.responsavel_id || null : undefined,
        tipo_referencia: createForm.tipo_referencia || null,
        referencia_id: createForm.referencia_id || null,
        origem_ref_id: createForm.origem_ref_id || null,
        barragem_id: createForm.barragem_id || null,
        empreendedor_id: createForm.empreendedor_id || null,
        motivo: createForm.motivo || null
      });

      if (!res.success) {
        setModalError(res.error || 'Falha ao criar pendência.');
        return;
      }

      setShowCreateModal(false);
      setActionFeedback({ type: 'success', text: 'Pendência registrada com sucesso e adicionada ao histórico.' });
      await loadModuleData();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenEditModal = (item: PendenciaRecord) => {
    setModalError(null);
    setEditingItem(item);
    setEditForm({
      titulo: item.titulo,
      tipo: item.tipo,
      descricao: item.descricao || '',
      tipo_referencia: item.tipo_referencia || '',
      referencia_id: item.referencia_id || '',
      origem_ref_id: item.origem_ref_id || '',
      barragem_id: item.barragem_id || '',
      empreendedor_id: item.empreendedor_id || '',
      motivo: ''
    });
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem || isSubmitting) return;
    setModalError(null);
    setIsSubmitting(true);
    try {
      const res = await updatePendencia(
        editingItem.id,
        {
          titulo: editForm.titulo,
          tipo: editForm.tipo,
          descricao: editForm.descricao,
          tipo_referencia: editForm.tipo_referencia || null,
          referencia_id: editForm.referencia_id || null,
          origem_ref_id: editForm.origem_ref_id || null,
          barragem_id: editForm.barragem_id || null,
          empreendedor_id: editForm.empreendedor_id || null
        },
        editForm.motivo || null
      );

      if (!res.success) {
        setModalError(res.error || 'Falha ao salvar edição.');
        return;
      }

      const updatedId = editingItem.id;
      setEditingItem(null);
      setActionFeedback({ type: 'success', text: 'Pendência atualizada com registro no histórico.' });
      await loadModuleData();
      await refreshHistoryIfOpen(updatedId);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenDirecionarModal = (item: PendenciaRecord) => {
    setModalError(null);
    setDirecionarItem(item);
    setDirecionarResponsavelId(item.responsavel_id || '');
    setDirecionarMotivo('');
  };

  const handleDirecionarSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!direcionarItem || isSubmitting) return;
    setModalError(null);
    setIsSubmitting(true);
    try {
      const res = await direcionarPendencia(
        direcionarItem.id,
        direcionarResponsavelId,
        direcionarMotivo || null
      );
      if (!res.success) {
        setModalError(res.error || 'Falha ao direcionar pendência.');
        return;
      }

      const updatedId = direcionarItem.id;
      setDirecionarItem(null);
      setActionFeedback({ type: 'success', text: 'Pendência direcionada e registrada no histórico.' });
      await loadModuleData();
      await refreshHistoryIfOpen(updatedId);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenStatusModal = (item: PendenciaRecord, defaultSituacao: PendenciaSituacao) => {
    setModalError(null);
    setStatusItem(item);
    setTargetSituacao(defaultSituacao);
    setStatusMotivo('');
  };

  const handleStatusSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!statusItem || isSubmitting) return;
    setModalError(null);
    setIsSubmitting(true);
    try {
      const res = await updatePendenciaSituacao(
        statusItem.id,
        targetSituacao,
        statusMotivo || null
      );
      if (!res.success) {
        setModalError(res.error || 'Falha ao alterar situação.');
        return;
      }

      const updatedId = statusItem.id;
      setStatusItem(null);
      setActionFeedback({
        type: 'success',
        text:
          targetSituacao === 'resolvida'
            ? 'Pendência resolvida e registrada no histórico.'
            : 'Situação atualizada com registro no histórico.'
      });
      await loadModuleData();
      await refreshHistoryIfOpen(updatedId);
    } finally {
      setIsSubmitting(false);
    }
  };

  const getAllowedSituacaoChoices = (item: PendenciaRecord): PendenciaSituacao[] => {
    if (!actor || !actor.canMutate) return [];
    if (actor.isAdmin) {
      return PENDENCIA_SITUACOES.filter(s => s !== item.situacao);
    }
    const choices: PendenciaSituacao[] = [];
    if (canActorResolvePendencia(item, actor)) {
      if (item.situacao !== 'em_analise') choices.push('em_analise');
      if (item.situacao !== 'resolvida') choices.push('resolvida');
    }
    const isCreator = Boolean(item.criado_por && actor.matchingIds.includes(item.criado_por));
    const isAssigned = isPendenciaAssignedToActor(item, actor);
    if ((isCreator || isAssigned) && item.situacao !== 'cancelada' && item.situacao !== 'resolvida') {
      choices.push('cancelada');
    }
    return choices;
  };

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* Cabeçalho do Módulo */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-2xl bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 flex items-center justify-center shrink-0">
            <ClipboardList className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center flex-wrap gap-2">
              <h1 className="text-base sm:text-xl font-black text-slate-900 dark:text-white tracking-tight">
                Módulo de Pendências
              </h1>
              {actor && (
                <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                  {actor.role}
                </span>
              )}
            </div>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-0.5">
              Acompanhamento, direcionamento e histórico imutável de pendências técnicas e administrativas (CSB/SEMA-MT).
            </p>
          </div>
        </div>

        <div className="flex items-center flex-wrap gap-2">
          <button
            type="button"
            onClick={onGoToDashboard}
            className="px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Painel</span>
          </button>

          <button
            type="button"
            onClick={loadModuleData}
            disabled={isLoading}
            className="px-3 py-2 rounded-xl bg-white dark:bg-slate-950 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Atualizar</span>
          </button>

          {actor?.canMutate && (
            <button
              type="button"
              onClick={handleOpenCreateModal}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold flex items-center gap-1.5 shadow-xs cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Nova Pendência</span>
            </button>
          )}
        </div>
      </div>

      {/* Feedback de ação */}
      {actionFeedback && (
        <div
          className={`p-3.5 rounded-xl border text-xs font-semibold flex items-center justify-between gap-3 ${
            actionFeedback.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200'
              : 'bg-rose-50 dark:bg-rose-950/50 border-rose-300 dark:border-rose-800 text-rose-900 dark:text-rose-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {actionFeedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400" />
            )}
            <span>{actionFeedback.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setActionFeedback(null)}
            className="text-xs underline opacity-80 hover:opacity-100 cursor-pointer"
          >
            Fechar
          </button>
        </div>
      )}

      {/* Barra de Abas e Filtros */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs p-3 sm:p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
          <button
            type="button"
            onClick={() => setActiveTab('minhas')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer transition ${
              activeTab === 'minhas'
                ? 'bg-emerald-700 text-white shadow-xs'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            <UserCheck className="w-3.5 h-3.5" />
            <span>Minhas pendências</span>
            <span
              className={`px-1.5 py-0.5 rounded-full text-[10px] font-black ${
                activeTab === 'minhas' ? 'bg-white/20 text-white' : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300'
              }`}
            >
              {minhasCount}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('geral')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer transition ${
              activeTab === 'geral'
                ? 'bg-emerald-700 text-white shadow-xs'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            <ClipboardList className="w-3.5 h-3.5" />
            <span>Lista geral</span>
            <span
              className={`px-1.5 py-0.5 rounded-full text-[10px] font-black ${
                activeTab === 'geral' ? 'bg-white/20 text-white' : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300'
              }`}
            >
              {pendencias.length}
            </span>
          </button>

          {actor?.isAdmin && (
            <button
              type="button"
              onClick={() => setActiveTab('direcionado')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer transition ${
                activeTab === 'direcionado'
                  ? 'bg-indigo-700 text-white shadow-xs'
                  : 'bg-indigo-50 dark:bg-indigo-950/50 text-indigo-800 dark:text-indigo-200 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 border border-indigo-200 dark:border-indigo-800'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Direcionado</span>
              <span
                className={`px-1.5 py-0.5 rounded-full text-[10px] font-black ${
                  activeTab === 'direcionado'
                    ? 'bg-white/20 text-white'
                    : 'bg-white dark:bg-slate-900 text-indigo-800 dark:text-indigo-200'
                }`}
              >
                {direcionadoCount}
              </span>
            </button>
          )}
        </div>

        <div className="flex flex-col sm:flex-row gap-2.5">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Buscar por título, descrição, tipo ou referência..."
              className="w-full pl-9 pr-3 py-2 text-xs sm:text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white"
            />
          </div>

          <select
            value={situacaoFilter}
            onChange={e => setSituacaoFilter(e.target.value as 'todas' | PendenciaSituacao)}
            aria-label="Filtrar por situação"
            className="px-3 py-2 text-xs sm:text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white font-semibold"
          >
            <option value="todas">Todas as situações</option>
            {PENDENCIA_SITUACOES.map(sit => (
              <option key={sit} value={sit}>
                {SITUACAO_LABELS[sit]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Estado de Carregamento, Erro ou Lista */}
      {isLoading ? (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-10 flex flex-col items-center justify-center gap-3 text-center">
          <RefreshCw className="w-6 h-6 text-emerald-600 animate-spin" />
          <p className="text-xs sm:text-sm font-semibold text-slate-600 dark:text-slate-300">
            Carregando pendências e validando permissões da sessão...
          </p>
        </div>
      ) : loadError ? (
        <div className="bg-rose-50 dark:bg-rose-950/40 rounded-2xl border border-rose-300 dark:border-rose-800 p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h2 className="text-sm font-black text-rose-900 dark:text-rose-200">
                Não foi possível carregar o módulo de pendências
              </h2>
              <p className="text-xs text-rose-800 dark:text-rose-300">{loadError}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={loadModuleData}
            className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shrink-0 cursor-pointer"
          >
            Tentar novamente
          </button>
        </div>
      ) : filteredList.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 p-10 flex flex-col items-center justify-center gap-2 text-center">
          <Inbox className="w-8 h-8 text-slate-400" />
          <h2 className="text-sm font-bold text-slate-800 dark:text-slate-200">
            {activeTab === 'minhas'
              ? 'Nenhuma pendência atribuída a você'
              : activeTab === 'direcionado'
              ? 'Nenhuma pendência direcionada encontrada'
              : 'Nenhuma pendência registrada'}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md">
            {searchQuery || situacaoFilter !== 'todas'
              ? 'Ajuste os filtros de busca ou situação para visualizar outros registros.'
              : activeTab === 'minhas'
              ? 'Quando uma pendência for direcionada ao seu usuário, ela aparecerá aqui.'
              : 'Utilize o botão "Nova Pendência" para registrar um acompanhamento vinculado ao Fiscaliza.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredList.map(item => {
            const canEdit = actor ? canActorEditPendencia(item, actor) : false;
            const canResolve = actor ? canActorResolvePendencia(item, actor) : false;
            const allowedStatuses = getAllowedSituacaoChoices(item);

            return (
              <div
                key={item.id}
                className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs p-4 space-y-3"
              >
                <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-3">
                  <div className="space-y-1.5 min-w-0 flex-1">
                    <div className="flex items-center flex-wrap gap-2">
                      <span
                        className={`text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full border ${
                          SITUACAO_BADGE_CLASSES[item.situacao] || SITUACAO_BADGE_CLASSES.aberta
                        }`}
                      >
                        {SITUACAO_LABELS[item.situacao] || item.situacao}
                      </span>
                      <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                        {TIPO_OPTIONS.find(t => t.value === item.tipo)?.label || item.tipo}
                      </span>
                      <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                        Origem: {item.origem}
                      </span>
                      {!item.responsavel_id && item.situacao !== 'resolvida' && item.situacao !== 'cancelada' && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                          Sem responsável
                        </span>
                      )}
                    </div>

                    <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white break-words">
                      {item.titulo}
                    </h3>

                    {item.descricao && (
                      <p className="text-xs text-slate-600 dark:text-slate-300 whitespace-pre-wrap break-words">
                        {item.descricao}
                      </p>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-1 pt-1 text-[11px] text-slate-600 dark:text-slate-400">
                      <div>
                        <span className="font-semibold">Responsável:</span>{' '}
                        <strong className="text-slate-800 dark:text-slate-200">
                          {resolveUserLabel(item.responsavel_id)}
                        </strong>
                      </div>
                      <div>
                        <span className="font-semibold">Criado por:</span>{' '}
                        <span>{resolveUserLabel(item.criado_por)}</span>
                      </div>
                      <div>
                        <span className="font-semibold">Atualizado em:</span>{' '}
                        <span>{formatDateTime(item.updated_at)}</span>
                      </div>
                      {item.direcionado_por && (
                        <div>
                          <span className="font-semibold">Direcionado por:</span>{' '}
                          <span>{resolveUserLabel(item.direcionado_por)}</span>
                          {item.direcionado_em ? ` (${formatDateTime(item.direcionado_em)})` : ''}
                        </div>
                      )}
                      {item.resolvido_por && (
                        <div>
                          <span className="font-semibold">Resolvido por:</span>{' '}
                          <span>{resolveUserLabel(item.resolvido_por)}</span>
                          {item.resolvido_em ? ` (${formatDateTime(item.resolvido_em)})` : ''}
                        </div>
                      )}
                      {(item.tipo_referencia || item.referencia_id || item.barragem_id || item.empreendedor_id) && (
                        <div className="sm:col-span-2 lg:col-span-3 flex flex-wrap items-center gap-2 font-mono text-[10px] text-slate-500 dark:text-slate-400">
                          {item.tipo_referencia && <span>Ref.: {item.tipo_referencia}</span>}
                          {item.referencia_id && <span>ID Ref.: {shortUuid(item.referencia_id)}</span>}
                          {item.origem_ref_id && <span>Origem ID: {shortUuid(item.origem_ref_id)}</span>}
                          {item.barragem_id && <span>Barragem ID: {shortUuid(item.barragem_id)}</span>}
                          {item.empreendedor_id && <span>Empreendedor ID: {shortUuid(item.empreendedor_id)}</span>}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Ações */}
                  <div className="flex items-center flex-wrap gap-1.5 shrink-0">
                    {actor?.isAdmin && item.situacao !== 'resolvida' && item.situacao !== 'cancelada' && (
                      <button
                        type="button"
                        onClick={() => handleOpenDirecionarModal(item)}
                        className="px-2.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1 cursor-pointer"
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>{item.responsavel_id ? 'Alterar Responsável' : 'Direcionar'}</span>
                      </button>
                    )}

                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => handleOpenEditModal(item)}
                        className="px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700 text-xs font-bold flex items-center gap-1 cursor-pointer"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span>Editar</span>
                      </button>
                    )}

                    {canResolve && (
                      <button
                        type="button"
                        onClick={() => handleOpenStatusModal(item, 'resolvida')}
                        className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1 cursor-pointer"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Resolver</span>
                      </button>
                    )}

                    {allowedStatuses.length > 0 && (
                      <button
                        type="button"
                        onClick={() => handleOpenStatusModal(item, allowedStatuses[0])}
                        className="px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-950 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 text-xs font-bold flex items-center gap-1 cursor-pointer"
                      >
                        <Clock className="w-3.5 h-3.5" />
                        <span>Situação</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => openHistoryModal(item)}
                      className="px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-950 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700 text-xs font-bold flex items-center gap-1 cursor-pointer"
                    >
                      <History className="w-3.5 h-3.5" />
                      <span>Histórico</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* MODAL: NOVA PENDÊNCIA */}
      {showCreateModal && actor?.canMutate && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <form
            onSubmit={handleCreateSubmit}
            className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl w-full max-w-2xl max-h-[92dvh] overflow-y-auto p-4 sm:p-6 space-y-4 my-auto"
          >
            <div className="flex items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
              <h2 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                <Plus className="w-4 h-4 text-emerald-600" />
                <span>Nova Pendência</span>
              </h2>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 cursor-pointer"
                aria-label="Fechar"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {modalError && (
              <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-300 dark:border-rose-800 text-rose-800 dark:text-rose-200 text-xs font-semibold">
                {modalError}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs bg-slate-50 dark:bg-slate-950 p-3 rounded-xl border border-slate-200 dark:border-slate-800">
              <div>
                <span className="text-slate-500 block">Sistema de origem</span>
                <strong className="text-slate-900 dark:text-white uppercase">fiscaliza</strong>
              </div>
              <div>
                <span className="text-slate-500 block">Criado por (sessão autenticada)</span>
                <strong className="text-slate-900 dark:text-white">
                  {actor.fullName} ({actor.email})
                </strong>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Título <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={createForm.titulo}
                  onChange={e => setCreateForm(prev => ({ ...prev, titulo: e.target.value }))}
                  placeholder="Descreva resumidamente a pendência"
                  className="w-full px-3 py-2 text-xs sm:text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Tipo <span className="text-rose-500">*</span>
                </label>
                <select
                  value={createForm.tipo}
                  onChange={e => setCreateForm(prev => ({ ...prev, tipo: e.target.value }))}
                  className="w-full px-3 py-2 text-xs sm:text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white"
                >
                  {TIPO_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              {actor.isAdmin && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Direcionar responsável (opcional)
                  </label>
                  <select
                    value={createForm.responsavel_id}
                    onChange={e => setCreateForm(prev => ({ ...prev, responsavel_id: e.target.value }))}
                    className="w-full px-3 py-2 text-xs sm:text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white"
                  >
                    <option value="">Sem responsável (aberta)</option>
                    {activeAssignableUsers.map(u => (
                      <option key={u.id} value={u.id}>
                        {u.name} ({u.role})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Descrição
                </label>
                <textarea
                  rows={3}
                  value={createForm.descricao}
                  onChange={e => setCreateForm(prev => ({ ...prev, descricao: e.target.value }))}
                  placeholder="Detalhamento técnico ou administrativo da pendência (não informe CPF/CNPJ)"
                  className="w-full px-3 py-2 text-xs sm:text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white"
                />
              </div>

              {inspectionReferenceOptions.length > 0 && (
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Preencher referências por ID a partir de vistoria existente (opcional)
                  </label>
                  <select
                    value={createForm.selectedInspectionId}
                    onChange={e => handleSelectInspectionRef(e.target.value, 'create')}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white"
                  >
                    <option value="">Selecionar vistoria para vincular IDs...</option>
                    {inspectionReferenceOptions.map(insp => (
                      <option key={insp.id} value={insp.id}>
                        {insp.generalInfo?.numeroVistoria || shortUuid(insp.id)} ·{' '}
                        {insp.damIdentification?.damName || 'Barragem sem nome'}
                        {insp.damIdentification?.municipality ? ` (${insp.damIdentification.municipality})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Tipo de referência
                </label>
                <select
                  value={createForm.tipo_referencia}
                  onChange={e => setCreateForm(prev => ({ ...prev, tipo_referencia: e.target.value }))}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white"
                >
                  {REFERENCIA_TIPO_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  ID da referência (UUID)
                </label>
                <input
                  type="text"
                  value={createForm.referencia_id}
                  onChange={e => setCreateForm(prev => ({ ...prev, referencia_id: e.target.value }))}
                  placeholder="UUID opcional"
                  className="w-full px-3 py-2 text-xs font-mono rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  ID origem ref. (UUID)
                </label>
                <input
                  type="text"
                  value={createForm.origem_ref_id}
                  onChange={e => setCreateForm(prev => ({ ...prev, origem_ref_id: e.target.value }))}
                  placeholder="UUID opcional"
                  className="w-full px-3 py-2 text-xs font-mono rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  ID da barragem (UUID)
                </label>
                <input
                  type="text"
                  value={createForm.barragem_id}
                  onChange={e => setCreateForm(prev => ({ ...prev, barragem_id: e.target.value }))}
                  placeholder="UUID opcional"
                  className="w-full px-3 py-2 text-xs font-mono rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  ID do empreendedor (UUID)
                </label>
                <input
                  type="text"
                  value={createForm.empreendedor_id}
                  onChange={e => setCreateForm(prev => ({ ...prev, empreendedor_id: e.target.value }))}
                  placeholder="UUID opcional"
                  className="w-full px-3 py-2 text-xs font-mono rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Motivo / observação inicial (histórico)
                </label>
                <input
                  type="text"
                  value={createForm.motivo}
                  onChange={e => setCreateForm(prev => ({ ...prev, motivo: e.target.value }))}
                  placeholder="Opcional"
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-xs font-extrabold flex items-center gap-1.5 cursor-pointer"
              >
                {isSubmitting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                <span>Registrar Pendência</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: EDITAR PENDÊNCIA */}
      {editingItem && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <form
            onSubmit={handleEditSubmit}
            className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl w-full max-w-2xl max-h-[92dvh] overflow-y-auto p-4 sm:p-6 space-y-4 my-auto"
          >
            <div className="flex items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
              <h2 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                <Edit3 className="w-4 h-4 text-emerald-600" />
                <span>Editar Pendência</span>
              </h2>
              <button
                type="button"
                onClick={() => setEditingItem(null)}
                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {modalError && (
              <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-300 dark:border-rose-800 text-rose-800 dark:text-rose-200 text-xs font-semibold">
                {modalError}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Título <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={editForm.titulo}
                  onChange={e => setEditForm(prev => ({ ...prev, titulo: e.target.value }))}
                  className="w-full px-3 py-2 text-xs sm:text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Tipo <span className="text-rose-500">*</span>
                </label>
                <select
                  value={editForm.tipo}
                  onChange={e => setEditForm(prev => ({ ...prev, tipo: e.target.value }))}
                  className="w-full px-3 py-2 text-xs sm:text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white"
                >
                  {TIPO_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Tipo de referência
                </label>
                <select
                  value={editForm.tipo_referencia}
                  onChange={e => setEditForm(prev => ({ ...prev, tipo_referencia: e.target.value }))}
                  className="w-full px-3 py-2 text-xs sm:text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white"
                >
                  {REFERENCIA_TIPO_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Descrição
                </label>
                <textarea
                  rows={3}
                  value={editForm.descricao}
                  onChange={e => setEditForm(prev => ({ ...prev, descricao: e.target.value }))}
                  className="w-full px-3 py-2 text-xs sm:text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  ID da referência (UUID)
                </label>
                <input
                  type="text"
                  value={editForm.referencia_id}
                  onChange={e => setEditForm(prev => ({ ...prev, referencia_id: e.target.value }))}
                  className="w-full px-3 py-2 text-xs font-mono rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  ID origem ref. (UUID)
                </label>
                <input
                  type="text"
                  value={editForm.origem_ref_id}
                  onChange={e => setEditForm(prev => ({ ...prev, origem_ref_id: e.target.value }))}
                  className="w-full px-3 py-2 text-xs font-mono rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  ID da barragem (UUID)
                </label>
                <input
                  type="text"
                  value={editForm.barragem_id}
                  onChange={e => setEditForm(prev => ({ ...prev, barragem_id: e.target.value }))}
                  className="w-full px-3 py-2 text-xs font-mono rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  ID do empreendedor (UUID)
                </label>
                <input
                  type="text"
                  value={editForm.empreendedor_id}
                  onChange={e => setEditForm(prev => ({ ...prev, empreendedor_id: e.target.value }))}
                  className="w-full px-3 py-2 text-xs font-mono rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Motivo da edição (registrado no histórico)
                </label>
                <input
                  type="text"
                  value={editForm.motivo}
                  onChange={e => setEditForm(prev => ({ ...prev, motivo: e.target.value }))}
                  placeholder="Informe o motivo ou justificativa da alteração"
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setEditingItem(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-xs font-extrabold flex items-center gap-1.5 cursor-pointer"
              >
                {isSubmitting && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                <span>Salvar Alterações</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: DIRECIONAR RESPONSÁVEL (SOMENTE ADMINISTRADOR) */}
      {direcionarItem && actor?.isAdmin && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <form
            onSubmit={handleDirecionarSubmit}
            className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl w-full max-w-lg p-4 sm:p-6 space-y-4 my-auto"
          >
            <div className="flex items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
              <h2 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                <Send className="w-4 h-4 text-indigo-600" />
                <span>Direcionar Pendência</span>
              </h2>
              <button
                type="button"
                onClick={() => setDirecionarItem(null)}
                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {modalError && (
              <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-300 dark:border-rose-800 text-rose-800 dark:text-rose-200 text-xs font-semibold">
                {modalError}
              </div>
            )}

            <p className="text-xs text-slate-600 dark:text-slate-300">
              Pendência: <strong>{direcionarItem.titulo}</strong>
            </p>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Usuário responsável <span className="text-rose-500">*</span>
              </label>
              <select
                required
                value={direcionarResponsavelId}
                onChange={e => setDirecionarResponsavelId(e.target.value)}
                className="w-full px-3 py-2 text-xs sm:text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white"
              >
                <option value="">Selecione um usuário ativo...</option>
                {activeAssignableUsers.map(u => (
                  <option key={u.id} value={u.id}>
                    {u.name} — {u.email} ({u.role})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Motivo do direcionamento
              </label>
              <textarea
                rows={2}
                value={direcionarMotivo}
                onChange={e => setDirecionarMotivo(e.target.value)}
                placeholder="Informe orientações ou justificativa para o histórico"
                className="w-full px-3 py-2 text-xs sm:text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setDirecionarItem(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isSubmitting || !direcionarResponsavelId}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-xs font-extrabold flex items-center gap-1.5 cursor-pointer"
              >
                {isSubmitting && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                <span>Confirmar Direcionamento</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: ALTERAR SITUAÇÃO / RESOLVER */}
      {statusItem && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <form
            onSubmit={handleStatusSubmit}
            className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl w-full max-w-lg p-4 sm:p-6 space-y-4 my-auto"
          >
            <div className="flex items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
              <h2 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                {targetSituacao === 'resolvida' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                ) : targetSituacao === 'cancelada' ? (
                  <XCircle className="w-4 h-4 text-rose-600" />
                ) : (
                  <Clock className="w-4 h-4 text-cyan-600" />
                )}
                <span>{targetSituacao === 'resolvida' ? 'Resolver Pendência' : 'Alterar Situação'}</span>
              </h2>
              <button
                type="button"
                onClick={() => setStatusItem(null)}
                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {modalError && (
              <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-300 dark:border-rose-800 text-rose-800 dark:text-rose-200 text-xs font-semibold">
                {modalError}
              </div>
            )}

            <p className="text-xs text-slate-600 dark:text-slate-300">
              Pendência: <strong>{statusItem.titulo}</strong> (Atual: <strong>{SITUACAO_LABELS[statusItem.situacao]}</strong>)
            </p>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Nova situação <span className="text-rose-500">*</span>
              </label>
              <select
                value={targetSituacao}
                onChange={e => setTargetSituacao(e.target.value as PendenciaSituacao)}
                className="w-full px-3 py-2 text-xs sm:text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white"
              >
                {getAllowedSituacaoChoices(statusItem).map(sit => (
                  <option key={sit} value={sit}>
                    {SITUACAO_LABELS[sit]}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Motivo / providência adotada
              </label>
              <textarea
                rows={3}
                value={statusMotivo}
                onChange={e => setStatusMotivo(e.target.value)}
                placeholder="Descreva a resolução, análise ou motivo da mudança de situação"
                className="w-full px-3 py-2 text-xs sm:text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setStatusItem(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-xs font-extrabold flex items-center gap-1.5 cursor-pointer"
              >
                {isSubmitting && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                <span>Confirmar</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: HISTÓRICO IMUTÁVEL (SOMENTE LEITURA) */}
      {historyItem && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl w-full max-w-2xl max-h-[92dvh] flex flex-col my-auto">
            <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <h2 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                  <History className="w-4 h-4 text-emerald-600" />
                  <span>Histórico da Pendência</span>
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                  {historyItem.titulo}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setHistoryItem(null)}
                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3">
              {historyLoading ? (
                <div className="py-8 flex flex-col items-center gap-2 text-xs text-slate-500">
                  <RefreshCw className="w-5 h-5 text-emerald-600 animate-spin" />
                  <span>Carregando registros do histórico...</span>
                </div>
              ) : historyError ? (
                <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-300 dark:border-rose-800 text-xs text-rose-800 dark:text-rose-200">
                  {historyError}
                </div>
              ) : historyRows.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-500">
                  Nenhum evento registrado no histórico desta pendência.
                </div>
              ) : (
                historyRows.map(entry => (
                  <div
                    key={entry.id}
                    className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 space-y-1.5 text-xs"
                  >
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <span className="font-bold text-slate-900 dark:text-white">
                        {HISTORICO_ACAO_LABELS[entry.acao] || entry.acao}
                        {entry.campo ? ` · Campo: ${entry.campo}` : ''}
                      </span>
                      <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                        {formatDateTime(entry.created_at)}
                      </span>
                    </div>

                    {(entry.valor_anterior !== null || entry.valor_novo !== null) && (
                      <div className="flex items-center flex-wrap gap-1.5 text-[11px]">
                        <span className="px-2 py-0.5 rounded bg-slate-200/70 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                          {resolveHistoryValueLabel(entry.campo, entry.valor_anterior)}
                        </span>
                        <ArrowRight className="w-3 h-3 text-slate-400 shrink-0" />
                        <span className="px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 font-semibold">
                          {resolveHistoryValueLabel(entry.campo, entry.valor_novo)}
                        </span>
                      </div>
                    )}

                    <div className="text-[11px] text-slate-600 dark:text-slate-400">
                      <span className="font-semibold">Usuário:</span> {resolveUserLabel(entry.usuario_id)}
                    </div>

                    {entry.motivo && (
                      <div className="text-[11px] text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-900 p-2 rounded-lg border border-slate-200 dark:border-slate-800">
                        <span className="font-semibold">Motivo:</span> {entry.motivo}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
