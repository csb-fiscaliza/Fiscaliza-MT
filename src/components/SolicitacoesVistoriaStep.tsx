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
  const canMutate = actor ? actor.canMutate : !isVisualizador && (effectiveRole === 'administrador' || effectiveRole === 'analista');

  const filteredSolicitacoes = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return solicitacoes.filter(item => {
      if (statusFilter !== 'todos' && item.status !== statusFilter) return false;
      if (origemFilter !== 'todos' && item.sistema_origem !== origemFilter) return false;
      if (!q) return true;
      const haystack = [
        item.barragem_nome,
        item.municipio,
        item.empreendedor_nome,
        item.solicitante_nome,
        item.relato_resumido,
        item.processo_numero,
        item.protocolo,
        item.classificacao_resumo
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [solicitacoes, statusFilter, origemFilter, searchQuery]);

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

            return (
              <div
                key={item.id}
                className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs p-4 space-y-3"
              >
                <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-3">
                  <div className="space-y-2 min-w-0 flex-1">
                    {/* Badges de Status e Origem */}
                    <div className="flex items-center flex-wrap gap-2">
                      <span
                        className={`text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full border ${
                          STATUS_BADGE_CLASSES[item.status] || STATUS_BADGE_CLASSES.pendente
                        }`}
                      >
                        {STATUS_LABELS[item.status] || item.status}
                      </span>

                      <span className="text-[10px] font-extrabold uppercase px-2.5 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/60 text-indigo-800 dark:text-indigo-200 border border-indigo-200 dark:border-indigo-800">
                        Origem: {ORIGEM_LABELS[item.sistema_origem] || item.sistema_origem}
                      </span>

                      {item.protocolo && (
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                          {item.protocolo}
                        </span>
                      )}

                      {item.classificacao_resumo && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                          {item.classificacao_resumo}
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
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
