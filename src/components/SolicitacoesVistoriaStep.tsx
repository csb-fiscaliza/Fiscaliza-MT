import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Calendar,
  CalendarPlus,
  CheckCircle2,
  ClipboardCheck,
  Edit3,
  Inbox,
  Lock,
  MapPin,
  Play,
  RefreshCw,
  Save,
  Search,
  UserCheck,
  Users,
  X
} from 'lucide-react';
import {
  SOLICITACAO_VISTORIA_ORIGENS,
  SOLICITACAO_VISTORIA_STATUS_LIST,
  type SolicitacaoVistoriaActorSummary,
  type SolicitacaoVistoriaRecord,
  type SolicitacaoVistoriaStatus
} from '../types/solicitacoesVistoria';
import {
  atualizarObservacaoSolicitacaoVistoria,
  fetchSolicitacoesVistoria,
  iniciarSolicitacaoVistoria
} from '../services/solicitacoesVistoriaService';
import {
  createMultiEntitySolicitacaoPlan,
  decideSolicitacaoAdministrativeReview,
  getEffectiveSolicitacaoDestino,
  loadSolicitacoesWorkflowState,
  redistributeGeralSolicitacao,
  requestSolicitacaoAdministrativeReview,
  SolicitacoesWorkflowState
} from '../services/mesaVirtualService';
import type { SistemaOrigem, SolicitacaoMultiEntidadeItem } from '../types/inspection';

const MAX_OBSERVACAO_LENGTH = 1000;

interface SolicitacoesVistoriaStepProps {
  currentUser?: { email?: string; fullName?: string; role?: string; id?: string } | null;
  onGoToDashboard: () => void;
  onCreateFutureInspection: (
    solicitacao: SolicitacaoVistoriaRecord,
    actor: SolicitacaoVistoriaActorSummary | null
  ) => void;
}

const STATUS_LABELS: Record<SolicitacaoVistoriaStatus, string> = {
  pendente: 'Pendente',
  em_planejamento: 'Em planejamento',
  concluida: 'Concluída',
  cancelada: 'Cancelada'
};

const STATUS_BADGE_CLASSES: Record<SolicitacaoVistoriaStatus, string> = {
  pendente:
    'bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800',
  em_planejamento:
    'bg-sky-100 text-sky-900 border-sky-300 dark:bg-sky-950/60 dark:text-sky-300 dark:border-sky-800',
  concluida:
    'bg-emerald-100 text-emerald-900 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800',
  cancelada:
    'bg-slate-200 text-slate-800 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'
};

const ORIGEM_LABELS: Record<string, string> = {
  classifica: 'Classifica',
  notifica: 'Notifica',
  administra: 'Administra',
  fiscaliza: 'Fiscaliza'
};

function formatDatePtBr(raw?: string | null): string {
  if (!raw) return '—';
  const trimmed = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const [y, m, d] = trimmed.split('-');
    return `${d}/${m}/${y}`;
  }
  const dt = new Date(trimmed);
  if (Number.isNaN(dt.getTime())) return trimmed;
  return dt.toLocaleDateString('pt-BR', { timeZone: 'America/Cuiaba' });
}

export function canActorEditSolicitacaoObservacao(
  item: SolicitacaoVistoriaRecord,
  actor: SolicitacaoVistoriaActorSummary | null,
  fallbackRole?: string
): boolean {
  if (item.status !== 'concluida') return false;
  const role = (actor?.perfil || fallbackRole || '').toLowerCase();
  if (role === 'visualizador') return false;
  if (actor?.isAdmin) return true;
  if (!actor?.userId) return false;
  const actorUuid = actor.userId.trim().toLowerCase();
  return (item.equipe || []).some(
    m => String(m.usuario_id || '').trim().toLowerCase() === actorUuid
  );
}

export const SolicitacoesVistoriaStep: React.FC<SolicitacoesVistoriaStepProps> = ({
  currentUser,
  onGoToDashboard,
  onCreateFutureInspection
}) => {
  const [solicitacoes, setSolicitacoes] = useState<SolicitacaoVistoriaRecord[]>([]);
  const [actor, setActor] = useState<SolicitacaoVistoriaActorSummary | null>(null);
  const [statusFilter, setStatusFilter] = useState<'todos' | SolicitacaoVistoriaStatus>('todos');
  const [origemFilter, setOrigemFilter] = useState<string>('todos');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<{ message: string; status?: number; code?: string } | null>(null);
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);
  const [actionFeedback, setActionFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const [editingObsId, setEditingObsId] = useState<string | null>(null);
  const [editingObsText, setEditingObsText] = useState<string>('');
  const [isSavingObs, setIsSavingObs] = useState<boolean>(false);

  // Governança de Caixa GERAL, Redistribuição, Revisão Administrativa e Despacho Multi-Entidade
  const [workflowState, setWorkflowState] = useState<SolicitacoesWorkflowState>(() =>
    loadSolicitacoesWorkflowState()
  );
  const [destinoFilter, setDestinoFilter] = useState<'todos' | 'geral' | 'atribuidas'>('todos');
  const [showMultiPlanForm, setShowMultiPlanForm] = useState<boolean>(false);
  const [planProcesso, setPlanProcesso] = useState<string>('');
  const [planJustificativa, setPlanJustificativa] = useState<string>('');
  const [planEntidadeNome, setPlanEntidadeNome] = useState<string>('');
  const [planSistemas, setPlanSistemas] = useState<SistemaOrigem[]>(['fiscaliza']);
  const [planDestinoCaixa, setPlanDestinoCaixa] = useState<string>('GERAL');
  const [planJustBySys, setPlanJustBySys] = useState<Record<string, string>>({});

  const [redistributeTargetId, setRedistributeTargetId] = useState<string | null>(null);
  const [redistributeDestino, setRedistributeDestino] = useState<string>('');
  const [redistributeMotivo, setRedistributeMotivo] = useState<string>('');

  const [reviewRequestTargetId, setReviewRequestTargetId] = useState<string | null>(null);
  const [reviewJustificativa, setReviewJustificativa] = useState<string>('');
  const [reviewDestinoDesejado, setReviewDestinoDesejado] = useState<string>('GERAL');
  const [decisionNoteByReviewId, setDecisionNoteByReviewId] = useState<Record<string, string>>({});

  const solicitacoesCountRef = useRef<number>(0);
  solicitacoesCountRef.current = solicitacoes.length;

  const loadList = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    const res = await fetchSolicitacoesVistoria({
      status: statusFilter,
      sistema_origem: origemFilter
    });

    if (!res.success || !res.data) {
      const errMsg = res.error || 'Não foi possível consultar solicitações de vistoria.';
      if (solicitacoesCountRef.current > 0) {
        setActionFeedback({
          type: 'error',
          message: errMsg
        });
      } else {
        setSolicitacoes([]);
        setLoadError({
          message: errMsg,
          status: res.status,
          code: res.code
        });
      }
      setIsLoading(false);
      return;
    }

    setSolicitacoes(res.data.solicitacoes || []);
    setActor(res.data.actor || null);
    setIsLoading(false);
  }, [statusFilter, origemFilter]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  const effectiveRole = (actor?.perfil || currentUser?.role || '').toLowerCase();
  const isVisualizador = effectiveRole === 'visualizador';
  const isAdminActor = Boolean(actor?.isAdmin || effectiveRole === 'administrador' || effectiveRole === 'admin');
  const canMutate = actor ? actor.canMutate : !isVisualizador && (effectiveRole === 'administrador' || effectiveRole === 'analista');

  const filteredSolicitacoes = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return solicitacoes.filter(item => {
      if (statusFilter !== 'todos' && item.status !== statusFilter) return false;
      if (origemFilter !== 'todos' && item.sistema_origem !== origemFilter) return false;
      const effDestino = getEffectiveSolicitacaoDestino(item, workflowState);
      if (destinoFilter === 'geral' && effDestino !== 'GERAL') return false;
      if (destinoFilter === 'atribuidas' && effDestino === 'GERAL') return false;
      if (!q) return true;
      const haystack = [
        item.barragem_nome,
        item.municipio,
        item.empreendedor_nome,
        item.solicitante_nome,
        item.relato_resumido,
        item.processo_numero,
        item.protocolo,
        item.classificacao_resumo,
        effDestino
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [solicitacoes, statusFilter, origemFilter, destinoFilter, workflowState, searchQuery]);

  const handleTogglePlanSistema = (sis: SistemaOrigem) => {
    setPlanSistemas(prev =>
      prev.includes(sis) ? prev.filter(s => s !== sis) : [...prev, sis]
    );
  };

  const handleSubmitMultiPlan = (e: React.FormEvent) => {
    e.preventDefault();
    const itens: SolicitacaoMultiEntidadeItem[] = planSistemas.map(sis => ({
      entidadeTipo: 'barragem',
      entidadeNome: planEntidadeNome.trim() || `Demanda ${sis.toUpperCase()}`,
      sistemaDestino: sis,
      destinatarioEmail: planDestinoCaixa.trim() || 'GERAL',
      justificativaEspecifica: planJustBySys[sis] || undefined
    }));

    const res = createMultiEntitySolicitacaoPlan(workflowState, {
      processoNumero: planProcesso,
      justificativaGeral: planJustificativa,
      itens,
      actorEmail: currentUser?.email || 'fiscal@sema.mt.gov.br',
      actorName: currentUser?.fullName || actor?.nome || 'Fiscal CSB'
    });
    if (!res.success) {
      setActionFeedback({ type: 'error', message: res.error || 'Falha ao criar despacho.' });
      return;
    }
    setWorkflowState(res.state);
    setShowMultiPlanForm(false);
    setPlanProcesso('');
    setPlanJustificativa('');
    setPlanEntidadeNome('');
    setPlanJustBySys({});
    setActionFeedback({
      type: 'success',
      message:
        'Plano de despacho multi-entidade registrado localmente com justificativa (pendente de endpoint central no Administra para envio remoto).'
    });
  };

  const handleConfirmRedistribute = (item: SolicitacaoVistoriaRecord) => {
    const res = redistributeGeralSolicitacao(workflowState, {
      solicitacao: item,
      novoDestino: redistributeDestino,
      motivo: redistributeMotivo,
      actor: {
        email: currentUser?.email || 'admin@sema.mt.gov.br',
        fullName: currentUser?.fullName || actor?.nome || 'Administrador',
        role: isAdminActor ? 'administrador' : effectiveRole
      }
    });
    if (!res.success) {
      setActionFeedback({ type: 'error', message: res.error || 'Falha ao redistribuir.' });
      return;
    }
    setWorkflowState(res.state);
    setRedistributeTargetId(null);
    setRedistributeDestino('');
    setRedistributeMotivo('');
    setActionFeedback({
      type: 'success',
      message: `Solicitação redistribuída para "${redistributeDestino}" com trilha auditável registrada.`
    });
  };

  const handleConfirmReviewRequest = (solicitacaoId: string) => {
    const res = requestSolicitacaoAdministrativeReview(workflowState, {
      solicitacaoId,
      justificativa: reviewJustificativa,
      destinoSolicitado: reviewDestinoDesejado,
      actor: {
        email: currentUser?.email || 'analista@sema.mt.gov.br',
        fullName: currentUser?.fullName || actor?.nome || 'Analista',
        role: effectiveRole || 'analista'
      }
    });
    if (!res.success) {
      setActionFeedback({ type: 'error', message: res.error || 'Falha ao enviar revisão.' });
      return;
    }
    setWorkflowState(res.state);
    setReviewRequestTargetId(null);
    setReviewJustificativa('');
    setActionFeedback({
      type: 'success',
      message: 'Pedido de revisão administrativa registrado para avaliação exclusiva do Administrador.'
    });
  };

  const handleAdminReviewDecision = (revisaoId: string, decision: 'aceita' | 'rejeitada') => {
    const res = decideSolicitacaoAdministrativeReview(workflowState, {
      revisaoId,
      decision,
      parecerDecisao: decisionNoteByReviewId[revisaoId] || '',
      actor: {
        email: currentUser?.email || 'admin@sema.mt.gov.br',
        fullName: currentUser?.fullName || actor?.nome || 'Administrador',
        role: isAdminActor ? 'administrador' : effectiveRole
      }
    });
    if (!res.success) {
      setActionFeedback({ type: 'error', message: res.error || 'Sem permissão para decidir.' });
      return;
    }
    setWorkflowState(res.state);
    setActionFeedback({
      type: 'success',
      message:
        decision === 'aceita'
          ? 'Revisão administrativa aceita e destino atualizado com registro de auditoria.'
          : 'Revisão administrativa rejeitada com parecer auditável.'
    });
  };

  const handleIniciarPlanejamento = async (item: SolicitacaoVistoriaRecord) => {
    if (!canMutate) return;
    setActionBusyId(item.id);
    setActionFeedback(null);
    const res = await iniciarSolicitacaoVistoria(item.id);
    setActionBusyId(null);

    if (!res.success || !res.data?.solicitacao) {
      setActionFeedback({
        type: 'error',
        message: res.error || 'Falha ao iniciar planejamento da solicitação.'
      });
      return;
    }

    const updated = res.data.solicitacao;
    setSolicitacoes(prev => prev.map(s => (s.id === updated.id ? updated : s)));
    setActionFeedback({
      type: 'success',
      message: 'Solicitação colocada em planejamento.'
    });
  };

  const handleCriarVistoriaFutura = async (item: SolicitacaoVistoriaRecord) => {
    if (!canMutate) return;
    setActionFeedback(null);

    let preparedItem = item;
    if (item.status === 'pendente') {
      setActionBusyId(item.id);
      const res = await iniciarSolicitacaoVistoria(item.id);
      setActionBusyId(null);

      if (!res.success || !res.data?.solicitacao) {
        setActionFeedback({
          type: 'error',
          message:
            res.error ||
            'Não foi possível marcar a solicitação como em planejamento antes de abrir a vistoria futura.'
        });
        return;
      }
      preparedItem = res.data.solicitacao;
      setSolicitacoes(prev => prev.map(s => (s.id === preparedItem.id ? preparedItem : s)));
    }

    onCreateFutureInspection(preparedItem, actor);
  };

  const handleStartEditObs = (item: SolicitacaoVistoriaRecord) => {
    setEditingObsId(item.id);
    setEditingObsText(item.observacao_campo || '');
    setActionFeedback(null);
  };

  const handleSaveObs = async (item: SolicitacaoVistoriaRecord) => {
    if (!canMutate || isSavingObs) return;
    const trimmed = editingObsText.trim();
    if (trimmed.length > MAX_OBSERVACAO_LENGTH) {
      setActionFeedback({
        type: 'error',
        message: `As observações de campo não podem ultrapassar ${MAX_OBSERVACAO_LENGTH} caracteres.`
      });
      return;
    }

    setIsSavingObs(true);
    setActionFeedback(null);
    const res = await atualizarObservacaoSolicitacaoVistoria(item.id, trimmed);
    setIsSavingObs(false);

    if (!res.success || !res.data?.solicitacao) {
      setActionFeedback({
        type: 'error',
        message: res.error || 'Falha ao atualizar observação de campo.'
      });
      return;
    }

    const updated = res.data.solicitacao;
    setSolicitacoes(prev => prev.map(s => (s.id === updated.id ? updated : s)));
    setEditingObsId(null);
    setEditingObsText('');
    setActionFeedback({
      type: 'success',
      message: 'Observação de campo atualizada com sucesso.'
    });
  };

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* Cabeçalho */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 flex items-center justify-center shrink-0 border border-emerald-200 dark:border-emerald-800">
            <ClipboardCheck className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center flex-wrap gap-2">
              <h1 className="text-base sm:text-xl font-black text-slate-900 dark:text-white tracking-tight">
                Solicitações de Vistoria
              </h1>
              {isVisualizador && (
                <span className="inline-flex items-center gap-1 text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700">
                  <Lock className="w-3 h-3" />
                  <span>Somente leitura</span>
                </span>
              )}
            </div>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-0.5">
              Demandas de vistoria originadas de Classifica, Notifica e Administra integradas via API central.
            </p>
          </div>
        </div>

        <div className="flex items-center flex-wrap gap-2">
          {canMutate && (
            <button
              type="button"
              onClick={() => setShowMultiPlanForm(v => !v)}
              className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <CalendarPlus className="w-3.5 h-3.5" />
              <span>Despacho Multi-Entidade</span>
            </button>
          )}

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
            onClick={() => void loadList()}
            disabled={isLoading}
            className="px-3 py-2 rounded-xl bg-white dark:bg-slate-950 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Atualizar</span>
          </button>
        </div>
      </div>

      {/* Formulário de Despacho Multi-Entidade / Multi-Sistema com Justificativa */}
      {showMultiPlanForm && canMutate && (
        <form
          onSubmit={handleSubmitMultiPlan}
          className="bg-white dark:bg-slate-900 rounded-2xl border border-emerald-300 dark:border-emerald-800 p-4 space-y-3 text-xs"
        >
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-black text-slate-900 dark:text-white">
                Planejamento de Solicitação Multi-Entidade / Multi-Sistema
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Selecione múltiplos sistemas/entidades no mesmo processo com justificativa geral ou específica.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowMultiPlanForm(false)}
              className="p-1 text-slate-500 hover:text-slate-900 dark:hover:text-white cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <input
              type="text"
              required
              value={planProcesso}
              onChange={e => setPlanProcesso(e.target.value)}
              placeholder="Número do Processo SEMA *"
              className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white"
            />
            <input
              type="text"
              value={planEntidadeNome}
              onChange={e => setPlanEntidadeNome(e.target.value)}
              placeholder="Barragem / Entidade alvo"
              className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white"
            />
            <input
              type="text"
              value={planDestinoCaixa}
              onChange={e => setPlanDestinoCaixa(e.target.value)}
              placeholder="Caixa / Destino inicial (padrão: GERAL)"
              className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white"
            />
          </div>

          <div className="space-y-2">
            <span className="font-bold text-slate-700 dark:text-slate-300 block">
              Sistemas de destino incluídos:
            </span>
            <div className="flex flex-wrap gap-3">
              {(['fiscaliza', 'classifica', 'notifica'] as SistemaOrigem[]).map(sis => (
                <label
                  key={sis}
                  className="inline-flex items-center gap-2 font-semibold text-slate-800 dark:text-slate-200 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={planSistemas.includes(sis)}
                    onChange={() => handleTogglePlanSistema(sis)}
                    className="w-4 h-4 rounded text-emerald-600"
                  />
                  <span>{ORIGEM_LABELS[sis] || sis}</span>
                </label>
              ))}
            </div>

            {planSistemas.map(sis => (
              <input
                key={sis}
                type="text"
                value={planJustBySys[sis] || ''}
                onChange={e => setPlanJustBySys(prev => ({ ...prev, [sis]: e.target.value }))}
                placeholder={`Justificativa específica para ${ORIGEM_LABELS[sis] || sis} (opcional se houver justificativa geral)`}
                className="w-full px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
              />
            ))}
          </div>

          <textarea
            rows={2}
            value={planJustificativa}
            onChange={e => setPlanJustificativa(e.target.value)}
            placeholder="Justificativa técnica geral da solicitação conjunta..."
            className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white"
          />

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowMultiPlanForm(false)}
              className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 font-bold cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold cursor-pointer"
            >
              Registrar Despacho
            </button>
          </div>
        </form>
      )}

      {workflowState.multiEntityPlans.length > 0 && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-3.5 space-y-2 text-xs">
          <div className="font-bold text-slate-900 dark:text-white">
            Planos Multi-Entidade Registrados ({workflowState.multiEntityPlans.length})
          </div>
          <div className="space-y-1.5 max-h-40 overflow-y-auto">
            {workflowState.multiEntityPlans.map(plan => (
              <div
                key={plan.id}
                className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2"
              >
                <div>
                  <span className="font-bold text-slate-900 dark:text-white">
                    Proc. {plan.processoNumero}
                  </span>
                  <span className="text-slate-500">
                    {' '}
                    · Destinos: {plan.itens.map(i => `${i.sistemaDestino.toUpperCase()} (${i.destinatarioEmail || 'GERAL'})`).join(', ')}
                  </span>
                  {plan.justificativaGeral && (
                    <p className="text-[11px] text-slate-600 dark:text-slate-400">
                      Justificativa: {plan.justificativaGeral}
                    </p>
                  )}
                </div>
                <span className="text-[10px] font-semibold text-amber-700 dark:text-amber-300">
                  Aguardando contrato Administra
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Feedback de ação */}
      {actionFeedback && (
        <div
          className={`p-3.5 rounded-xl border text-xs font-semibold flex items-start justify-between gap-3 ${
            actionFeedback.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200'
              : 'bg-rose-50 dark:bg-rose-950/50 border-rose-300 dark:border-rose-800 text-rose-900 dark:text-rose-200'
          }`}
        >
          <div className="flex items-start gap-2">
            {actionFeedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            )}
            <span>{actionFeedback.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setActionFeedback(null)}
            className="opacity-70 hover:opacity-100 cursor-pointer"
            aria-label="Fechar aviso"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Filtros */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs p-3 sm:p-4">
        <div className="flex flex-col md:flex-row gap-2.5">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Buscar por barragem, município, solicitante, processo ou relato..."
              className="w-full pl-9 pr-3 py-2 text-xs sm:text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white"
            />
          </div>

          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as 'todos' | SolicitacaoVistoriaStatus)}
            aria-label="Filtrar por status da solicitação"
            className="px-3 py-2 text-xs sm:text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white font-semibold"
          >
            <option value="todos">Todos os status</option>
            {SOLICITACAO_VISTORIA_STATUS_LIST.map(st => (
              <option key={st} value={st}>
                {STATUS_LABELS[st]}
              </option>
            ))}
          </select>

          <select
            value={origemFilter}
            onChange={e => setOrigemFilter(e.target.value)}
            aria-label="Filtrar por sistema de origem"
            className="px-3 py-2 text-xs sm:text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white font-semibold"
          >
            <option value="todos">Todas as origens</option>
            {SOLICITACAO_VISTORIA_ORIGENS.map(orig => (
              <option key={orig} value={orig}>
                Origem: {ORIGEM_LABELS[orig] || orig}
              </option>
            ))}
          </select>

          <select
            value={destinoFilter}
            onChange={e => setDestinoFilter(e.target.value as 'todos' | 'geral' | 'atribuidas')}
            aria-label="Filtrar por caixa ou destino"
            className="px-3 py-2 text-xs sm:text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white font-semibold"
          >
            <option value="todos">Caixa: Todas</option>
            <option value="geral">Caixa GERAL (sem atribuição)</option>
            <option value="atribuidas">Atribuídas a analista/equipe</option>
          </select>
        </div>
      </div>

      {/* Conteúdo */}
      {isLoading ? (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-10 flex flex-col items-center justify-center gap-3 text-center">
          <RefreshCw className="w-6 h-6 text-emerald-600 animate-spin" />
          <p className="text-xs sm:text-sm font-semibold text-slate-600 dark:text-slate-300">
            Consultando solicitações de vistoria na API central do Administra...
          </p>
        </div>
      ) : loadError ? (
        <div className="bg-rose-50 dark:bg-rose-950/40 rounded-2xl border border-rose-300 dark:border-rose-800 p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h2 className="text-sm font-black text-rose-900 dark:text-rose-200">
                {loadError.status === 503
                  ? 'Integração central indisponível no servidor (HTTP 503)'
                  : loadError.status === 409
                  ? 'Funções centrais no Administra pendentes de implantação (HTTP 409)'
                  : 'Não foi possível carregar Solicitações de Vistoria'}
              </h2>
              <p className="text-xs text-rose-800 dark:text-rose-300">{loadError.message}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void loadList()}
            className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shrink-0 cursor-pointer"
          >
            Tentar novamente
          </button>
        </div>
      ) : filteredSolicitacoes.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 p-10 flex flex-col items-center justify-center gap-2 text-center">
          <Inbox className="w-8 h-8 text-slate-400" />
          <h2 className="text-sm font-bold text-slate-800 dark:text-slate-200">
            Nenhuma solicitação de vistoria encontrada
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md">
            {searchQuery || statusFilter !== 'todos' || origemFilter !== 'todos'
              ? 'Ajuste os filtros selecionados para visualizar outros pedidos.'
              : 'Não há solicitações pendentes, em planejamento ou concluídas registradas no momento.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredSolicitacoes.map(item => {
            const isBusy = actionBusyId === item.id;
            const canEditObs = canActorEditSolicitacaoObservacao(item, actor, currentUser?.role);
            const isEditingThis = editingObsId === item.id;
            const effectiveDestino = getEffectiveSolicitacaoDestino(item, workflowState);
            const itemReviews = workflowState.revisoes.filter(r => r.solicitacaoId === item.id);
            const itemRedistributions = workflowState.redistribuicoes.filter(
              r => r.solicitacaoId === item.id
            );

            return (
              <div
                key={item.id}
                className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs p-4 space-y-3"
              >
                <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-3">
                  <div className="space-y-2 min-w-0 flex-1">
                    {/* Badges de Status, Caixa/Destino e Origem */}
                    <div className="flex items-center flex-wrap gap-2">
                      <span
                        className={`text-[10px] font-black uppercase px-2.5 py-0.5 rounded-md border ${
                          STATUS_BADGE_CLASSES[item.status] || STATUS_BADGE_CLASSES.pendente
                        }`}
                      >
                        {STATUS_LABELS[item.status] || item.status}
                      </span>

                      <span className="text-[10px] font-extrabold uppercase px-2.5 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/60 text-indigo-800 dark:text-indigo-200 border border-indigo-200 dark:border-indigo-800">
                        Origem: {ORIGEM_LABELS[item.sistema_origem] || item.sistema_origem}
                      </span>

                      <span
                        className={`text-[10px] font-extrabold uppercase px-2.5 py-0.5 rounded-md border ${
                          effectiveDestino === 'GERAL'
                            ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-300 border-amber-300 dark:border-amber-800'
                            : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                        }`}
                      >
                        Caixa: {effectiveDestino}
                      </span>

                      {item.protocolo && (
                        <span className="text-[10px] font-mono text-slate-600 dark:text-slate-300">
                          · {item.protocolo}
                        </span>
                      )}

                      {item.classificacao_resumo && (
                        <span className="text-[10px] font-bold text-slate-700 dark:text-slate-300">
                          · {item.classificacao_resumo}
                        </span>
                      )}
                    </div>

                    {/* Título / Barragem */}
                    <div>
                      <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white break-words">
                        {item.barragem_nome || 'Barragem sem identificação nominal'}
                      </h3>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-0.5 text-[11px] text-slate-600 dark:text-slate-400">
                        {item.municipio && (
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                            <span>
                              {item.municipio}
                              {item.curso_dagua ? ` · ${item.curso_dagua}` : ''}
                            </span>
                          </span>
                        )}
                        {item.empreendedor_nome && (
                          <span>
                            Empreendedor: <strong className="text-slate-800 dark:text-slate-200">{item.empreendedor_nome}</strong>
                          </span>
                        )}
                        {item.processo_numero && (
                          <span>
                            Processo: <strong>{item.processo_numero}</strong>
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Solicitante & Data */}
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-600 dark:text-slate-400">
                      <span className="inline-flex items-center gap-1">
                        <UserCheck className="w-3.5 h-3.5 text-slate-400" />
                        <span>Solicitante:</span>
                        <strong className="text-slate-800 dark:text-slate-200">{item.solicitante_nome}</strong>
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                        <span>Pedido em:</span>
                        <strong className="text-slate-800 dark:text-slate-200">
                          {formatDatePtBr(item.solicitado_em)}
                        </strong>
                      </span>
                    </div>

                    {/* Relato Resumido */}
                    {item.relato_resumido && (
                      <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-300 whitespace-pre-wrap break-words">
                        <span className="font-bold text-slate-800 dark:text-slate-200">Relato resumido: </span>
                        {item.relato_resumido}
                      </div>
                    )}

                    {/* Bloco de Conclusão (Somente quando concluída) */}
                    {item.status === 'concluida' && (
                      <div className="p-3 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/70 space-y-2 text-xs">
                        <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
                          <span className="inline-flex items-center gap-1 text-emerald-950 dark:text-emerald-200">
                            <Calendar className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                            <span>Data de realização (somente leitura):</span>
                            <strong>{formatDatePtBr(item.data_realizacao)}</strong>
                          </span>

                          {item.equipe && item.equipe.length > 0 && (
                            <span className="inline-flex items-center gap-1 text-emerald-950 dark:text-emerald-200">
                              <Users className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                              <span>Equipe:</span>
                              <strong>
                                {item.equipe
                                  .map(m => m.nome || `ID ${m.usuario_id.slice(0, 8)}`)
                                  .join(', ')}
                              </strong>
                            </span>
                          )}
                        </div>

                        {isEditingThis ? (
                          <div className="space-y-2 pt-1">
                            <div className="flex items-center justify-between gap-2">
                              <label
                                htmlFor={`obs-campo-${item.id}`}
                                className="text-[11px] font-bold text-slate-800 dark:text-slate-200"
                              >
                                Informações e observações de campo
                              </label>
                              <span className="text-[10px] font-mono text-slate-500">
                                {editingObsText.length}/{MAX_OBSERVACAO_LENGTH}
                              </span>
                            </div>
                            <textarea
                              id={`obs-campo-${item.id}`}
                              rows={3}
                              maxLength={MAX_OBSERVACAO_LENGTH}
                              value={editingObsText}
                              onChange={e => setEditingObsText(e.target.value)}
                              placeholder="Registre observações complementares da vistoria executada (opcional, até 1000 caracteres)..."
                              className="w-full p-2.5 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                            />
                            <div className="flex items-center gap-2 justify-end">
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingObsId(null);
                                  setEditingObsText('');
                                }}
                                className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 text-xs font-bold cursor-pointer"
                              >
                                Cancelar
                              </button>
                              <button
                                type="button"
                                disabled={isSavingObs}
                                onClick={() => void handleSaveObs(item)}
                                className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                              >
                                <Save className="w-3.5 h-3.5" />
                                <span>{isSavingObs ? 'Salvando...' : 'Salvar observação'}</span>
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="text-slate-700 dark:text-slate-200">
                            <span className="font-semibold">Observação de campo: </span>
                            <span>
                              {item.observacao_campo && item.observacao_campo.trim()
                                ? item.observacao_campo
                                : 'Sem observações de campo registradas.'}
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Ações por papel e status */}
                  {canMutate && (
                    <div className="flex flex-wrap lg:flex-col items-stretch gap-2 shrink-0">
                      {item.status === 'pendente' && (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => void handleIniciarPlanejamento(item)}
                          className="px-3 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 shadow-2xs"
                        >
                          <Play className="w-3.5 h-3.5" />
                          <span>{isBusy ? 'Processando...' : 'Iniciar planejamento'}</span>
                        </button>
                      )}

                      {(item.status === 'pendente' || item.status === 'em_planejamento') && (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => void handleCriarVistoriaFutura(item)}
                          className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 shadow-2xs"
                        >
                          <CalendarPlus className="w-3.5 h-3.5" />
                          <span>Criar vistoria futura</span>
                        </button>
                      )}

                      {item.status === 'concluida' && canEditObs && !isEditingThis && (
                        <button
                          type="button"
                          onClick={() => handleStartEditObs(item)}
                          className="px-3 py-2 rounded-xl border border-emerald-300 dark:border-emerald-700 bg-white dark:bg-slate-950 hover:bg-emerald-50 dark:hover:bg-slate-800 text-emerald-800 dark:text-emerald-200 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          <span>Editar observação</span>
                        </button>
                      )}

                      {isAdminActor && effectiveDestino === 'GERAL' && (
                        <button
                          type="button"
                          onClick={() => {
                            setRedistributeTargetId(item.id);
                            setRedistributeDestino('');
                            setRedistributeMotivo('');
                          }}
                          className="px-3 py-2 rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 text-amber-900 dark:text-amber-200 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <Users className="w-3.5 h-3.5" />
                          <span>Redistribuir (Admin)</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => {
                          setReviewRequestTargetId(item.id);
                          setReviewJustificativa('');
                          setReviewDestinoDesejado(effectiveDestino);
                        }}
                        className="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <AlertCircle className="w-3.5 h-3.5" />
                        <span>Solicitar revisão adm.</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* Painel Inline de Redistribuição Admin (Caixa GERAL) */}
                {redistributeTargetId === item.id && isAdminActor && (
                  <div className="p-3 rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50/70 dark:bg-amber-950/30 space-y-2 text-xs">
                    <div className="font-bold text-slate-900 dark:text-white">
                      Redistribuir solicitação da Caixa GERAL (Administrador)
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <input
                        type="text"
                        value={redistributeDestino}
                        onChange={e => setRedistributeDestino(e.target.value)}
                        placeholder="Novo destinatário / analista / equipe *"
                        className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
                      />
                      <input
                        type="text"
                        value={redistributeMotivo}
                        onChange={e => setRedistributeMotivo(e.target.value)}
                        placeholder="Motivo da redistribuição *"
                        className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
                      />
                    </div>
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setRedistributeTargetId(null)}
                        className="px-2.5 py-1 rounded-lg border border-slate-300 dark:border-slate-700 font-bold cursor-pointer"
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        onClick={() => handleConfirmRedistribute(item)}
                        className="px-3 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold cursor-pointer"
                      >
                        Confirmar Redistribuição
                      </button>
                    </div>
                  </div>
                )}

                {/* Painel Inline de Pedido de Revisão Administrativa (Analista) */}
                {reviewRequestTargetId === item.id && (
                  <div className="p-3 rounded-xl border border-indigo-300 dark:border-indigo-800 bg-indigo-50/70 dark:bg-indigo-950/30 space-y-2 text-xs">
                    <div className="font-bold text-slate-900 dark:text-white">
                      Solicitar Revisão Administrativa (decisão exclusiva do Administrador)
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <input
                        type="text"
                        value={reviewDestinoDesejado}
                        onChange={e => setReviewDestinoDesejado(e.target.value)}
                        placeholder="Destino / reatribuição sugerida"
                        className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
                      />
                      <input
                        type="text"
                        value={reviewJustificativa}
                        onChange={e => setReviewJustificativa(e.target.value)}
                        placeholder="Justificativa do pedido (mín. 6 caracteres) *"
                        className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
                      />
                    </div>
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setReviewRequestTargetId(null)}
                        className="px-2.5 py-1 rounded-lg border border-slate-300 dark:border-slate-700 font-bold cursor-pointer"
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        onClick={() => handleConfirmReviewRequest(item.id)}
                        className="px-3 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold cursor-pointer"
                      >
                        Enviar para Administrador
                      </button>
                    </div>
                  </div>
                )}

                {/* Histórico Auditável de Revisões Administrativas e Redistribuições */}
                {(itemReviews.length > 0 || itemRedistributions.length > 0) && (
                  <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-2 text-xs">
                    {itemReviews.map(rev => (
                      <div
                        key={rev.id}
                        className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 space-y-1.5"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-bold text-slate-900 dark:text-white">
                            Revisão Adm. · {rev.solicitanteNome} → Sugestão: {rev.destinoSolicitado}
                          </span>
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded border uppercase ${
                              rev.status === 'aceita'
                                ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                : rev.status === 'rejeitada'
                                ? 'bg-rose-100 text-rose-800 border-rose-300'
                                : 'bg-amber-100 text-amber-900 border-amber-300'
                            }`}
                          >
                            {rev.status}
                          </span>
                        </div>
                        <p className="text-slate-600 dark:text-slate-300">
                          Justificativa: {rev.justificativa}
                        </p>
                        {rev.status === 'pendente' && isAdminActor && (
                          <div className="flex flex-wrap items-center gap-2 pt-1">
                            <input
                              type="text"
                              value={decisionNoteByReviewId[rev.id] || ''}
                              onChange={e =>
                                setDecisionNoteByReviewId(prev => ({ ...prev, [rev.id]: e.target.value }))
                              }
                              placeholder="Parecer da decisão administrativa..."
                              className="flex-1 min-w-[160px] px-2.5 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                            />
                            <button
                              type="button"
                              onClick={() => handleAdminReviewDecision(rev.id, 'aceita')}
                              className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-bold cursor-pointer"
                            >
                              Aceitar (Admin)
                            </button>
                            <button
                              type="button"
                              onClick={() => handleAdminReviewDecision(rev.id, 'rejeitada')}
                              className="px-2.5 py-1 rounded bg-rose-600 hover:bg-rose-700 text-white font-bold cursor-pointer"
                            >
                              Rejeitar (Admin)
                            </button>
                          </div>
                        )}
                        {rev.status !== 'pendente' && (
                          <p className="text-[11px] text-slate-500 dark:text-slate-400">
                            Decidido por {rev.decididoPorNome} · Parecer: {rev.parecerDecisao}
                          </p>
                        )}
                      </div>
                    ))}
                    {itemRedistributions.map(red => (
                      <div
                        key={red.id}
                        className="text-[11px] text-slate-500 dark:text-slate-400"
                      >
                        Redistribuído de <strong>{red.destinoAnterior}</strong> para{' '}
                        <strong>{red.novoDestino}</strong> por {red.autorNome} · {red.motivo}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
