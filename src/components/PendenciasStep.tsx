import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  ClipboardList,
  History,
  Inbox,
  Lock,
  RefreshCw,
  Search,
  ShieldCheck,
  UserCheck,
  X
} from 'lucide-react';
import type { InspectionData } from '../types/inspection';
import {
  PENDENCIA_SITUACOES,
  type PendenciaHistoricoRecord,
  type PendenciaRecord,
  type PendenciaSituacao,
  type PendenciaUsuarioResumo,
  type PendenciasActorSummary,
  type PendenciasTab,
  type PendenciasTabCounts
} from '../types/pendencias';
import {
  fetchPendenciaHistorico,
  fetchPendenciasList
} from '../services/pendenciasService';

interface PendenciasStepProps {
  currentInspection?: InspectionData;
  allInspections?: InspectionData[];
  onGoToDashboard: () => void;
}

const SITUACAO_LABELS: Record<PendenciaSituacao, string> = {
  aberta: 'Aberta',
  direcionada: 'Direcionada',
  em_analise: 'Em análise',
  resolvida: 'Resolvida',
  cancelada: 'Cancelada'
};

const SITUACAO_BADGE_CLASSES: Record<PendenciaSituacao, string> = {
  aberta:
    'bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950/60 dark:text-amber-200 dark:border-amber-800',
  direcionada:
    'bg-indigo-100 text-indigo-900 border-indigo-300 dark:bg-indigo-950/60 dark:text-indigo-200 dark:border-indigo-800',
  em_analise:
    'bg-cyan-100 text-cyan-900 border-cyan-300 dark:bg-cyan-950/60 dark:text-cyan-200 dark:border-cyan-800',
  resolvida:
    'bg-emerald-100 text-emerald-900 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-200 dark:border-emerald-800',
  cancelada:
    'bg-slate-200 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'
};

const TIPO_LABELS: Record<string, string> = {
  vistoria_campo: 'Vistoria de Campo',
  anomalia_critica: 'Anomalia / Segurança',
  correcao_dados: 'Correção Cadastral',
  documentacao: 'Documentação / Minuta',
  notificacao: 'Notificação Técnica',
  outro: 'Outro'
};

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

function shortUserFallback(id: string): string {
  return id.length > 12 ? `${id.slice(0, 8)}…` : id;
}

export const PendenciasStep: React.FC<PendenciasStepProps> = ({ onGoToDashboard }) => {
  const [actor, setActor] = useState<PendenciasActorSummary | null>(null);
  const [usuariosResumo, setUsuariosResumo] = useState<Record<string, PendenciaUsuarioResumo>>({});
  const [pendencias, setPendencias] = useState<PendenciaRecord[]>([]);
  const [counts, setCounts] = useState<PendenciasTabCounts>({ minhas: 0, geral: 0 });
  const [writeBlockReason, setWriteBlockReason] = useState<string>(
    'Modo somente leitura ativo: operações de escrita estão bloqueadas no servidor (HTTP 409) até confirmação de mecanismo transacional para pendências e histórico.'
  );
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<PendenciasTab>('minhas');
  const [searchQuery, setSearchQuery] = useState('');
  const [situacaoFilter, setSituacaoFilter] = useState<'todas' | PendenciaSituacao>('todas');

  // Modal de histórico (somente leitura)
  const [historyItem, setHistoryItem] = useState<PendenciaRecord | null>(null);
  const [historyRows, setHistoryRows] = useState<PendenciaHistoricoRecord[]>([]);
  const [historyUsuarios, setHistoryUsuarios] = useState<Record<string, PendenciaUsuarioResumo>>({});
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const loadModuleData = useCallback(async (tabToLoad: PendenciasTab) => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const res = await fetchPendenciasList(tabToLoad);
      if (!res.success || !res.data) {
        if (res.status === 403 && tabToLoad === 'direcionado') {
          setActiveTab('minhas');
          return;
        }
        setActor(null);
        setPendencias([]);
        setUsuariosResumo({});
        setLoadError(res.error || 'Não foi possível carregar o módulo de pendências.');
        return;
      }

      const payload = res.data;
      setActor(payload.currentUser);
      setUsuariosResumo(payload.usuariosResumo || {});
      setPendencias(payload.pendencias || []);
      setCounts(payload.counts || { minhas: 0, geral: 0 });
      if (payload.writeBlockReason) {
        setWriteBlockReason(payload.writeBlockReason);
      }

      if (!payload.currentUser.isAdmin && tabToLoad === 'direcionado') {
        setActiveTab('minhas');
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadModuleData(activeTab);
  }, [activeTab, loadModuleData]);

  const resolveUserLabel = (
    userId?: string | null,
    overrideMap?: Record<string, PendenciaUsuarioResumo>
  ): string => {
    if (!userId) return 'Sem responsável';
    if (userId.startsWith('[') && userId.endsWith(']')) {
      return userId;
    }
    if (actor && actor.id === userId) {
      return `${actor.nome} (Você)`;
    }
    const found = overrideMap?.[userId] || usuariosResumo[userId];
    if (found) {
      if (actor?.isAdmin && found.email) {
        return `${found.nome} (${found.email})`;
      }
      return found.nome;
    }
    return `Usuário ${shortUserFallback(userId)}`;
  };

  const resolveHistoryValueLabel = (campo: string | null, val: string | null): string => {
    if (!val) return '—';
    if (
      campo === 'responsavel_id' ||
      campo === 'criado_por' ||
      campo === 'direcionado_por' ||
      campo === 'resolvido_por' ||
      campo === 'usuario_id'
    ) {
      return resolveUserLabel(val, historyUsuarios);
    }
    if (campo === 'situacao' && val in SITUACAO_LABELS) {
      return SITUACAO_LABELS[val as PendenciaSituacao];
    }
    return val;
  };

  const filteredList = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return pendencias.filter(p => {
      if (situacaoFilter !== 'todas' && p.situacao !== situacaoFilter) {
        return false;
      }
      if (!q) return true;
      return (
        p.titulo.toLowerCase().includes(q) ||
        (p.descricao || '').toLowerCase().includes(q) ||
        p.tipo.toLowerCase().includes(q) ||
        p.id.toLowerCase().includes(q) ||
        (p.tipo_referencia || '').toLowerCase().includes(q) ||
        (p.referencia_id || '').toLowerCase().includes(q) ||
        (p.origem_ref_id || '').toLowerCase().includes(q) ||
        (p.barragem_id || '').toLowerCase().includes(q) ||
        (p.empreendedor_id || '').toLowerCase().includes(q)
      );
    });
  }, [pendencias, situacaoFilter, searchQuery]);

  const openHistoryModal = async (item: PendenciaRecord) => {
    setHistoryItem(item);
    setHistoryRows([]);
    setHistoryUsuarios({});
    setHistoryError(null);
    setHistoryLoading(true);
    try {
      const res = await fetchPendenciaHistorico(item.id);
      if (!res.success || !res.data) {
        setHistoryError(res.error || 'Erro ao carregar histórico.');
      } else {
        setHistoryRows(res.data.historico || []);
        setHistoryUsuarios(res.data.usuariosResumo || {});
      }
    } finally {
      setHistoryLoading(false);
    }
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
                  {actor.perfil}
                </span>
              )}
              <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/70 text-amber-900 dark:text-amber-200 border border-amber-300 dark:border-amber-800 flex items-center gap-1">
                <Lock className="w-3 h-3" />
                <span>Somente leitura</span>
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-0.5">
              Consulta segura via servidor e histórico imutável de pendências do Fiscaliza (CSB/SEMA-MT).
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
            onClick={() => loadModuleData(activeTab)}
            disabled={isLoading}
            className="px-3 py-2 rounded-xl bg-white dark:bg-slate-950 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Atualizar</span>
          </button>
        </div>
      </div>

      {/* Aviso explícito do modo somente leitura */}
      <div className="p-3.5 rounded-xl border bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200 text-xs flex items-start gap-2.5">
        <Lock className="w-4 h-4 shrink-0 mt-0.5 text-amber-700 dark:text-amber-300" />
        <div className="space-y-0.5">
          <p className="font-bold">Módulo em modo somente leitura</p>
          <p className="opacity-90">{writeBlockReason}</p>
        </div>
      </div>

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
                activeTab === 'minhas'
                  ? 'bg-white/20 text-white'
                  : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300'
              }`}
            >
              {counts.minhas}
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
                activeTab === 'geral'
                  ? 'bg-white/20 text-white'
                  : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300'
              }`}
            >
              {counts.geral}
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
                {counts.direcionado ?? 0}
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
              placeholder="Buscar por título, descrição, tipo ou ID de referência..."
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
            Consultando pendências via servidor autenticado...
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
            onClick={() => loadModuleData(activeTab)}
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
              ? 'Nenhuma pendência atribuída à sua sessão'
              : activeTab === 'direcionado'
              ? 'Nenhuma pendência direcionada encontrada'
              : 'Nenhuma pendência registrada'}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md">
            {searchQuery || situacaoFilter !== 'todas'
              ? 'Ajuste os filtros de busca ou situação para visualizar outros registros.'
              : activeTab === 'minhas'
              ? 'Somente pendências cujo responsável corresponda ao ID da sua sessão autenticada são exibidas nesta aba.'
              : 'Nenhuma pendência disponível para visualização nesta aba.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredList.map(item => (
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
                      {TIPO_LABELS[item.tipo] || item.tipo}
                    </span>
                    <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                      Origem: {item.origem}
                    </span>
                    {!item.responsavel_id &&
                      item.situacao !== 'resolvida' &&
                      item.situacao !== 'cancelada' && (
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
                    {(item.tipo_referencia ||
                      item.referencia_id ||
                      item.origem_ref_id ||
                      item.barragem_id ||
                      item.empreendedor_id) && (
                      <div className="sm:col-span-2 lg:col-span-3 flex flex-wrap items-center gap-2 font-mono text-[10px] text-slate-500 dark:text-slate-400">
                        {item.tipo_referencia && <span>Ref.: {item.tipo_referencia}</span>}
                        {item.referencia_id && <span>ID Ref.: {item.referencia_id}</span>}
                        {item.origem_ref_id && <span>Origem ID: {item.origem_ref_id}</span>}
                        {item.barragem_id && <span>Barragem ID: {item.barragem_id}</span>}
                        {item.empreendedor_id && <span>Empreendedor ID: {item.empreendedor_id}</span>}
                      </div>
                    )}
                  </div>
                </div>

                {/* Ação somente leitura permitida */}
                <div className="flex items-center flex-wrap gap-1.5 shrink-0">
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
          ))}
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
                aria-label="Fechar histórico"
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
                      <span className="font-semibold">Usuário:</span>{' '}
                      {resolveUserLabel(entry.usuario_id, historyUsuarios)}
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
