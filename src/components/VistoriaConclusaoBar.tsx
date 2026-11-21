import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  Save,
  Lock,
  ShieldCheck,
  Database,
  ArrowUpRight,
  RotateCcw,
  Calendar,
  Edit3,
  MessageSquareText
} from 'lucide-react';
import { EntidadeMestreTipo, InspectionData } from '../types/inspection';
import { getAdministraConclusionValidation } from '../services/administraEcosystemService';
import {
  atualizarObservacaoSolicitacaoVistoria,
  concluirSolicitacaoVistoria
} from '../services/solicitacoesVistoriaService';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const MAX_OBSERVACAO_LENGTH = 1000;

interface VistoriaConclusaoBarProps {
  data: InspectionData;
  onChange: (updater: (prev: InspectionData) => InspectionData) => void;
  onSaveDraft?: (updated?: InspectionData) => void;
  onNavigateToEntityBlock?: (tipo: EntidadeMestreTipo) => void;
  currentUser?: { id?: string; email?: string; fullName?: string; role?: string } | null;
}

export const VistoriaConclusaoBar: React.FC<VistoriaConclusaoBarProps> = ({
  data,
  onChange,
  onSaveDraft,
  onNavigateToEntityBlock,
  currentUser
}) => {
  const [statusFeedback, setStatusFeedback] = useState<{
    type: 'success' | 'error' | 'info';
    message: string;
  } | null>(null);
  const [obsCampo, setObsCampo] = useState<string>(
    data.solicitacaoConclusao?.observacaoCampo || ''
  );
  const [isSubmittingSolicitacao, setIsSubmittingSolicitacao] = useState<boolean>(false);
  const [isEditingPostConclusionObs, setIsEditingPostConclusionObs] = useState<boolean>(false);

  useEffect(() => {
    setObsCampo(data.solicitacaoConclusao?.observacaoCampo || '');
    setIsEditingPostConclusionObs(false);
  }, [data.id, data.solicitacaoVistoriaId, data.solicitacaoConclusao?.observacaoCampo]);

  const validation = getAdministraConclusionValidation(data);
  const isFutura = data.tipoPlanejamento === 'futura' || data.generalInfo?.tipoPlanejamento === 'futura';
  const isConcluded = !data.isDraft && !isFutura && validation.canConclude;
  const hasLinkedSolicitacao = Boolean(data.solicitacaoVistoriaId);

  const userRole = (currentUser?.role || '').toLowerCase();
  const isVisualizador = userRole === 'visualizador';
  const isAdmin = userRole === 'administrador' || userRole === 'admin';
  const knownEquipeIds = data.solicitacaoConclusao?.equipeIds || [];
  const currentActorId = currentUser?.id || data.createdByUserId;
  const canAttemptEditPostObs =
    !isVisualizador &&
    (isAdmin ||
      !currentActorId ||
      knownEquipeIds.length === 0 ||
      knownEquipeIds.some(id => id.toLowerCase() === currentActorId.toLowerCase()));

  const handleSaveTemporaryDraft = () => {
    const draftInspection: InspectionData = {
      ...data,
      isDraft: true,
      ...(hasLinkedSolicitacao
        ? {
            solicitacaoConclusao: {
              ...data.solicitacaoConclusao,
              observacaoCampo: obsCampo
            }
          }
        : {})
    };
    onChange(() => draftInspection);
    onSaveDraft?.(draftInspection);
    setStatusFeedback({
      type: 'info',
      message: validation.canConclude
        ? 'Rascunho salvo localmente com segurança. Você pode concluir a vistoria quando finalizar a revisão.'
        : 'Rascunho temporário salvo localmente. Os dados ainda não vinculados ao Administra permaneceram apenas nesta ficha.'
    });
  };

  const handleConcludeInspection = async () => {
    if (isFutura) {
      setStatusFeedback({
        type: 'error',
        message: 'Esta ficha está marcada como "Vistoria Futura". Converta para "Vistoria Atual" na aba 1 antes de concluir.'
      });
      return;
    }

    if (!validation.canConclude) {
      setStatusFeedback({
        type: 'error',
        message: validation.summaryMessage
      });
      return;
    }

    if (!hasLinkedSolicitacao || !data.solicitacaoVistoriaId) {
      const concludedInspection: InspectionData = {
        ...data,
        isDraft: false,
        tipoPlanejamento: 'atual',
        generalInfo: {
          ...data.generalInfo,
          tipoPlanejamento: 'atual'
        }
      };
      onChange(() => concludedInspection);
      onSaveDraft?.(concludedInspection);
      setStatusFeedback({
        type: 'success',
        message: 'Vistoria concluída! Todos os cadastros estão efetivamente registrados na base do Administra.'
      });
      return;
    }

    const trimmedObs = obsCampo.trim();
    if (trimmedObs.length > MAX_OBSERVACAO_LENGTH) {
      setStatusFeedback({
        type: 'error',
        message: `As informações e observações de campo não podem ultrapassar ${MAX_OBSERVACAO_LENGTH} caracteres.`
      });
      return;
    }

    const rawDate = (data.generalInfo?.inspectionDate || '').trim();
    const dataRealizacao = ISO_DATE_REGEX.test(rawDate)
      ? rawDate
      : new Date().toISOString().split('T')[0];

    const equipeMap = new Map<string, { usuario_id: string; nome?: string }>();
    for (const insp of data.generalInfo?.inspectors || []) {
      const uid = typeof insp.id === 'string' ? insp.id.trim() : '';
      if (UUID_REGEX.test(uid) && !equipeMap.has(uid.toLowerCase())) {
        equipeMap.set(uid.toLowerCase(), {
          usuario_id: uid,
          nome: insp.name?.trim() || undefined
        });
      }
    }
    if (currentActorId && UUID_REGEX.test(currentActorId) && !equipeMap.has(currentActorId.toLowerCase())) {
      equipeMap.set(currentActorId.toLowerCase(), {
        usuario_id: currentActorId,
        nome: currentUser?.fullName?.trim() || undefined
      });
    }

    setIsSubmittingSolicitacao(true);
    setStatusFeedback(null);
    const res = await concluirSolicitacaoVistoria(data.solicitacaoVistoriaId, {
      vistoria_id: data.id,
      data_realizacao: dataRealizacao,
      equipe: Array.from(equipeMap.values()),
      observacao_campo: trimmedObs
    });
    setIsSubmittingSolicitacao(false);

    if (!res.success || !res.data?.solicitacao) {
      setStatusFeedback({
        type: 'error',
        message:
          res.error ||
          'Não foi possível concluir a solicitação vinculada na API central do Administra. A vistoria permanece como rascunho.'
      });
      return;
    }

    const solAtualizada = res.data.solicitacao;
    const savedObs = solAtualizada.observacao_campo ?? trimmedObs;
    const savedDate = solAtualizada.data_realizacao || dataRealizacao;
    const savedEquipeIds = (solAtualizada.equipe || []).map(m => m.usuario_id);

    const concludedInspection: InspectionData = {
      ...data,
      isDraft: false,
      tipoPlanejamento: 'atual',
      generalInfo: {
        ...data.generalInfo,
        tipoPlanejamento: 'atual'
      },
      solicitacaoConclusao: {
        concluida: true,
        dataRealizacao: savedDate,
        observacaoCampo: savedObs,
        observacaoAtualizadaEm: solAtualizada.updated_at || new Date().toISOString(),
        equipeIds: savedEquipeIds
      }
    };
    onChange(() => concludedInspection);
    onSaveDraft?.(concludedInspection);
    setObsCampo(savedObs);
    setStatusFeedback({
      type: 'success',
      message: 'Vistoria concluída e retorno registrado na Solicitação de Vistoria do Administra!'
    });
  };

  const handleSavePostConclusionObs = async () => {
    if (!data.solicitacaoVistoriaId || isSubmittingSolicitacao) return;
    const trimmedObs = obsCampo.trim();
    if (trimmedObs.length > MAX_OBSERVACAO_LENGTH) {
      setStatusFeedback({
        type: 'error',
        message: `As observações de campo não podem ultrapassar ${MAX_OBSERVACAO_LENGTH} caracteres.`
      });
      return;
    }

    setIsSubmittingSolicitacao(true);
    setStatusFeedback(null);
    const res = await atualizarObservacaoSolicitacaoVistoria(data.solicitacaoVistoriaId, trimmedObs);
    setIsSubmittingSolicitacao(false);

    if (!res.success || !res.data?.solicitacao) {
      setStatusFeedback({
        type: 'error',
        message: res.error || 'Falha ao atualizar observação de campo da solicitação.'
      });
      return;
    }

    const updatedObs = res.data.solicitacao.observacao_campo ?? trimmedObs;
    const updatedInspection: InspectionData = {
      ...data,
      solicitacaoConclusao: {
        ...data.solicitacaoConclusao,
        concluida: true,
        observacaoCampo: updatedObs,
        observacaoAtualizadaEm: res.data.solicitacao.updated_at || new Date().toISOString()
      }
    };
    onChange(() => updatedInspection);
    onSaveDraft?.(updatedInspection);
    setObsCampo(updatedObs);
    setIsEditingPostConclusionObs(false);
    setStatusFeedback({
      type: 'success',
      message: 'Observação de campo atualizada com sucesso na solicitação.'
    });
  };

  const handleReopenDraft = () => {
    const reopened: InspectionData = {
      ...data,
      isDraft: true
    };
    onChange(() => reopened);
    onSaveDraft?.(reopened);
    setStatusFeedback({
      type: 'info',
      message: 'Vistoria reaberta como Rascunho para novas edições.'
    });
  };

  return (
    <div
      className={`rounded-2xl border-2 p-4 sm:p-5 shadow-xs transition-colors print:hidden ${
        isConcluded
          ? 'border-emerald-300 dark:border-emerald-800 bg-emerald-50/80 dark:bg-emerald-950/30'
          : validation.canConclude
          ? 'border-sky-300 dark:border-sky-800 bg-sky-50/70 dark:bg-sky-950/25'
          : 'border-amber-300 dark:border-amber-700 bg-amber-50/80 dark:bg-amber-950/30'
      }`}
    >
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          {isConcluded ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
          ) : validation.canConclude ? (
            <ShieldCheck className="w-5 h-5 text-sky-600 dark:text-sky-400 shrink-0 mt-0.5" />
          ) : (
            <Lock className="w-5 h-5 text-amber-700 dark:text-amber-400 shrink-0 mt-0.5" />
          )}

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-xs sm:text-sm font-black uppercase tracking-wide text-slate-900 dark:text-slate-100">
                {isConcluded
                  ? 'Status: Vistoria Concluída'
                  : isFutura
                  ? 'Status: Planejamento / Vistoria Futura (Rascunho)'
                  : 'Status: Rascunho em Andamento'}
              </h3>
              <span
                className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full uppercase border ${
                  isConcluded
                    ? 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-900/50 dark:text-emerald-200 dark:border-emerald-700'
                    : validation.canConclude
                    ? 'bg-sky-100 text-sky-800 border-sky-300 dark:bg-sky-900/50 dark:text-sky-200 dark:border-sky-700'
                    : 'bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-900/50 dark:text-amber-200 dark:border-amber-700'
                }`}
              >
                {isConcluded
                  ? 'Pronta p/ Sincronização Final'
                  : validation.canConclude
                  ? 'Base Administra Validada'
                  : `${validation.missingEntities.length} Cadastro(s) Pendente(s) no Administra`}
              </span>
              {hasLinkedSolicitacao && (
                <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full uppercase border bg-indigo-100 text-indigo-800 border-indigo-300 dark:bg-indigo-900/50 dark:text-indigo-200 dark:border-indigo-700">
                  Solicitação Vinculada ({(data.solicitacaoOrigem || 'administra').toUpperCase()})
                </span>
              )}
            </div>

            <p className="text-xs text-slate-700 dark:text-slate-300 mt-1 leading-relaxed">
              {isConcluded
                ? 'Empreendedor, Barragem e Responsável Técnico (quando informado) estão efetivamente cadastrados ou vinculados na base central do Administra.'
                : validation.canConclude
                ? 'Todos os dados vinculados/cadastrados atendem às regras do Administra. Salve o rascunho ou clique em "Concluir Vistoria" para finalizar.'
                : 'Enquanto houver dados manuais sem registro na base do Administra, você pode salvar rascunho temporário, porém a conclusão da vistoria permanece bloqueada.'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {!isConcluded ? (
            <>
              <button
                type="button"
                onClick={handleSaveTemporaryDraft}
                className="min-h-[42px] px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-2xs transition"
              >
                <Save className="w-4 h-4 text-slate-600 dark:text-slate-300" />
                <span>Salvar Rascunho Temporário</span>
              </button>

              <button
                type="button"
                disabled={isSubmittingSolicitacao}
                onClick={() => void handleConcludeInspection()}
                aria-disabled={!validation.canConclude || isFutura || isSubmittingSolicitacao}
                className={`min-h-[42px] px-4 py-2 rounded-xl font-bold text-xs flex items-center gap-1.5 shadow-xs transition ${
                  validation.canConclude && !isFutura && !isSubmittingSolicitacao
                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer active:scale-[0.99]'
                    : 'bg-amber-200/80 dark:bg-amber-900/40 text-amber-950 dark:text-amber-200 border border-amber-400 dark:border-amber-700 cursor-not-allowed'
                }`}
                title={
                  validation.canConclude && !isFutura
                    ? 'Concluir vistoria oficial'
                    : 'Cadastre na base do Administra todos os itens pendentes antes de concluir'
                }
              >
                {validation.canConclude && !isFutura ? (
                  <CheckCircle2 className="w-4 h-4" />
                ) : (
                  <Lock className="w-4 h-4" />
                )}
                <span>{isSubmittingSolicitacao ? 'Concluindo...' : 'Concluir Vistoria'}</span>
              </button>
            </>
          ) : (
            !hasLinkedSolicitacao && (
              <button
                type="button"
                onClick={handleReopenDraft}
                className="min-h-[40px] px-3.5 py-2 rounded-xl border border-emerald-400 dark:border-emerald-700 bg-white dark:bg-slate-900 text-emerald-800 dark:text-emerald-200 hover:bg-emerald-100/70 font-bold text-xs flex items-center gap-1.5 cursor-pointer transition"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reabrir como Rascunho</span>
              </button>
            )
          )}
        </div>
      </div>

      {/* Campo opcional de Informações e observações de campo SOMENTE para vistorias vinculadas a Solicitação */}
      {hasLinkedSolicitacao && (
        <div className="mt-3 pt-3 border-t border-slate-300/60 dark:border-slate-700/70 space-y-2.5">
          {!isConcluded || !data.solicitacaoConclusao?.concluida ? (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <label
                  htmlFor={`solicitacao-obs-${data.id}`}
                  className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5"
                >
                  <MessageSquareText className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                  <span>Informações e observações de campo (opcional)</span>
                </label>
                <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                  {obsCampo.length}/{MAX_OBSERVACAO_LENGTH}
                </span>
              </div>
              <textarea
                id={`solicitacao-obs-${data.id}`}
                rows={3}
                maxLength={MAX_OBSERVACAO_LENGTH}
                value={obsCampo}
                onChange={e => setObsCampo(e.target.value)}
                placeholder="Campo opcional: informe dados relevantes de campo para retorno ao solicitante (até 1000 caracteres)."
                className="w-full p-2.5 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
              />
            </div>
          ) : (
            <div className="p-3 rounded-xl bg-white/90 dark:bg-slate-900/90 border border-emerald-200 dark:border-emerald-800 space-y-2 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-900 dark:text-emerald-200">
                  <Calendar className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span>Data de realização (somente leitura):</span>
                  <strong>{data.solicitacaoConclusao.dataRealizacao || '—'}</strong>
                </span>

                {canAttemptEditPostObs && !isEditingPostConclusionObs && (
                  <button
                    type="button"
                    onClick={() => setIsEditingPostConclusionObs(true)}
                    className="px-2.5 py-1 rounded-lg border border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/60 hover:bg-emerald-100 text-emerald-800 dark:text-emerald-200 font-bold text-[11px] flex items-center gap-1 cursor-pointer"
                  >
                    <Edit3 className="w-3 h-3" />
                    <span>Editar observação</span>
                  </button>
                )}
              </div>

              {isEditingPostConclusionObs ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <label
                      htmlFor={`solicitacao-obs-edit-${data.id}`}
                      className="text-[11px] font-bold text-slate-800 dark:text-slate-200"
                    >
                      Editar apenas observações de campo
                    </label>
                    <span className="text-[10px] font-mono text-slate-500">
                      {obsCampo.length}/{MAX_OBSERVACAO_LENGTH}
                    </span>
                  </div>
                  <textarea
                    id={`solicitacao-obs-edit-${data.id}`}
                    rows={3}
                    maxLength={MAX_OBSERVACAO_LENGTH}
                    value={obsCampo}
                    onChange={e => setObsCampo(e.target.value)}
                    className="w-full p-2.5 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                  />
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setObsCampo(data.solicitacaoConclusao?.observacaoCampo || '');
                        setIsEditingPostConclusionObs(false);
                      }}
                      className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      disabled={isSubmittingSolicitacao}
                      onClick={() => void handleSavePostConclusionObs()}
                      className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1 cursor-pointer disabled:opacity-50"
                    >
                      <Save className="w-3.5 h-3.5" />
                      <span>{isSubmittingSolicitacao ? 'Salvando...' : 'Salvar observação'}</span>
                    </button>
                  </div>
                </div>
              ) : (
                <p className="text-slate-700 dark:text-slate-300 whitespace-pre-wrap">
                  <span className="font-semibold">Informações e observações de campo: </span>
                  {data.solicitacaoConclusao.observacaoCampo?.trim()
                    ? data.solicitacaoConclusao.observacaoCampo
                    : 'Sem observações de campo registradas.'}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Lista de Pendências do Administra */}
      {!validation.canConclude && (
        <div className="mt-3 pt-3 border-t border-amber-300/70 dark:border-amber-800/70 space-y-2">
          <div className="flex items-center gap-1.5 text-[11px] font-bold text-amber-950 dark:text-amber-200 uppercase tracking-wide">
            <Database className="w-3.5 h-3.5" />
            <span>Itens pendentes de cadastro na base do Administra para concluir:</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            {validation.missingEntities.map(item => (
              <div
                key={item.tipo}
                className="p-2.5 rounded-xl bg-white/90 dark:bg-slate-900/90 border border-amber-200 dark:border-amber-800 flex flex-col justify-between gap-2 text-xs"
              >
                <div>
                  <div className="flex items-center gap-1.5 font-bold text-amber-950 dark:text-amber-100">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                    <span>{item.label}</span>
                  </div>
                  <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-1 leading-snug">
                    {item.reason}
                  </p>
                </div>
                {onNavigateToEntityBlock && (
                  <button
                    type="button"
                    onClick={() => onNavigateToEntityBlock(item.tipo)}
                    className="text-[11px] font-bold text-amber-800 dark:text-amber-300 hover:underline flex items-center gap-1 self-start cursor-pointer"
                  >
                    <span>Ir para {item.label}</span>
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {statusFeedback && (
        <div
          className={`mt-3 p-2.5 rounded-xl text-xs font-semibold border ${
            statusFeedback.type === 'success'
              ? 'bg-emerald-100/90 border-emerald-300 text-emerald-900 dark:bg-emerald-900/40 dark:border-emerald-700 dark:text-emerald-200'
              : statusFeedback.type === 'error'
              ? 'bg-rose-100 border-rose-300 text-rose-900 dark:bg-rose-950/60 dark:border-rose-800 dark:text-rose-200'
              : 'bg-white border-slate-200 text-slate-700 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-300'
          }`}
        >
          {statusFeedback.message}
        </div>
      )}
    </div>
  );
};

