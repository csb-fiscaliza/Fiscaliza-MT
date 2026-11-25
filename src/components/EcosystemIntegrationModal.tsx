// ==============================================================================
// ARQUIVO: src/components/EcosystemIntegrationModal.tsx
// Central de Integração do Ecossistema CSB/SEMA-MT:
// 1. Status dos 4 Sistemas (Administra, Fiscaliza, Classifica, Notifica)
// 2. Cadastro Central Padronizado (Empreendedores, Barragens e RTs do Administra)
//    + Descoberta Cross-System de Produtos já gerados
// 3. Fluxo de Solicitações de Alteração (Aprovar / Reprovar pelo detentor)
// ==============================================================================

import React, { useEffect, useMemo, useState } from 'react';
import {
  X,
  Network,
  Database,
  FileSearch,
  Send,
  CheckCircle2,
  XCircle,
  Lock,
  Building2,
  Landmark,
  HardHat,
  Search,
  RefreshCw,
  ShieldCheck,
  AlertTriangle,
  Link2,
  Clock,
  BellRing,
  Check
} from 'lucide-react';
import {
  BarragemEntity,
  EmpreendedorEntity,
  EntidadeMestreTipo,
  InspectionData,
  NotificacaoAnalistaEcossistema,
  ProdutoEcossistema,
  ResponsavelTecnicoEntity,
  SistemaOrigem,
  SolicitacaoAlteracaoEcossistema
} from '../types/inspection';
import {
  AdministraMasterCatalog,
  canFiscalizaEditMasterEntity,
  fetchAdministraMasterCatalog,
  findProductsByDamOrOwner,
  listAlterationRequests,
  listAnalystInboxNotifications,
  markAnalystNotificationRead,
  resolveAlterationRequest,
  submitAlterationRequest,
  subscribeEcosystemUpdates
} from '../services/administraEcosystemService';
import {
  checkEcosystemServerConnections,
  getEcosystemStatus,
  getSistemaLabel,
  ServerConnectivityResult
} from '../services/ecosystemConfig';

export interface MasterSelectionPayload {
  empreendedor?: EmpreendedorEntity | null;
  barragem?: BarragemEntity | null;
  responsavelTecnico?: ResponsavelTecnicoEntity | null;
}

interface EcosystemIntegrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentInspection: InspectionData;
  currentUser?: { email?: string; fullName?: string; role?: string } | null;
  onApplyMasterSelection: (payload: MasterSelectionPayload) => void;
  initialTab?: 'status' | 'catalogo' | 'solicitacoes' | 'notificacoes';
  initialRequestTarget?: {
    entidadeTipo: EntidadeMestreTipo;
    entidadeId: string;
    entidadeNome: string;
    sistemaDetentor: SistemaOrigem;
    campoSugerido?: string;
    valorAtualSugerido?: string;
  } | null;
}

const ORIGIN_BADGE_STYLES: Record<SistemaOrigem, string> = {
  administra: 'bg-indigo-100 text-indigo-800 border-indigo-300 dark:bg-indigo-950/60 dark:text-indigo-200 dark:border-indigo-800',
  fiscaliza: 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-200 dark:border-emerald-800',
  classifica: 'bg-cyan-100 text-cyan-800 border-cyan-300 dark:bg-cyan-950/60 dark:text-cyan-200 dark:border-cyan-800',
  notifica: 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/60 dark:text-amber-200 dark:border-amber-800'
};

function maskCpfCnpj(value?: string | null): string {
  if (!value) return 'Não informado';
  const digits = value.replace(/\D/g, '');
  if (digits.length === 11) {
    return `***.${digits.slice(3, 6)}.${digits.slice(6, 9)}-**`;
  }
  if (digits.length === 14) {
    return `**.${digits.slice(2, 5)}.${digits.slice(5, 8)}/****-**`;
  }
  if (value.length <= 4) return '***';
  return `***${value.slice(2, -2)}**`;
}

export const EcosystemIntegrationModal: React.FC<EcosystemIntegrationModalProps> = ({
  isOpen,
  onClose,
  currentInspection,
  currentUser,
  onApplyMasterSelection,
  initialTab = 'catalogo',
  initialRequestTarget = null
}) => {
  const normalizedRole = (currentUser?.role || '').trim().toLowerCase();
  const canViewFullCpfCnpj = normalizedRole === 'administrador' || normalizedRole === 'analista';
  const [activeTab, setActiveTab] = useState<'status' | 'catalogo' | 'solicitacoes' | 'notificacoes'>(initialTab);
  const [catalog, setCatalog] = useState<AdministraMasterCatalog>({
    empreendedores: [],
    barragens: [],
    responsaveisTecnicos: [],
    updatedAt: ''
  });
  const [requests, setRequests] = useState<SolicitacaoAlteracaoEcossistema[]>([]);
  const [analystInbox, setAnalystInbox] = useState<NotificacaoAnalistaEcossistema[]>([]);
  const [serverConnections, setServerConnections] = useState<ServerConnectivityResult[]>([]);
  const [activeProducts, setActiveProducts] = useState<ProdutoEcossistema[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [catalogFilter, setCatalogFilter] = useState<'barragens' | 'empreendedores' | 'rts'>('barragens');
  const [isLoading, setIsLoading] = useState(false);

  // Formulário de Solicitação de Alteração
  const [requestForm, setRequestForm] = useState<{
    entidadeTipo: EntidadeMestreTipo;
    entidadeId: string;
    entidadeNome: string;
    sistemaDetentor: SistemaOrigem;
    campoKey: string;
    campoRotulo: string;
    valorAtual: string;
    valorProposto: string;
    justificativa: string;
  } | null>(null);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [decisionNoteByReqId, setDecisionNoteByReqId] = useState<Record<string, string>>({});

  const ecosystemNodes = useMemo(() => getEcosystemStatus(), [isOpen]);

  const loadAll = async () => {
    setIsLoading(true);
    try {
      const [cat, reqs, prods, inbox, conn] = await Promise.all([
        fetchAdministraMasterCatalog(),
        listAlterationRequests(),
        findProductsByDamOrOwner({
          barragemId: currentInspection.barragemId,
          empreendedorId: currentInspection.empreendedorId,
          barragemNome: currentInspection.damIdentification?.damName,
          empreendedorNome: currentInspection.damIdentification?.propertyOrBusinessName
        }),
        listAnalystInboxNotifications(),
        checkEcosystemServerConnections()
      ]);
      setCatalog(cat);
      setRequests(reqs);
      setActiveProducts(prods);
      setAnalystInbox(inbox);
      setServerConnections(conn);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    setActiveTab(initialTab);
    if (initialRequestTarget) {
      setRequestForm({
        entidadeTipo: initialRequestTarget.entidadeTipo,
        entidadeId: initialRequestTarget.entidadeId,
        entidadeNome: initialRequestTarget.entidadeNome,
        sistemaDetentor: initialRequestTarget.sistemaDetentor,
        campoKey: initialRequestTarget.campoSugerido || 'nome',
        campoRotulo: initialRequestTarget.campoSugerido || 'Dados Cadastrais',
        valorAtual: initialRequestTarget.valorAtualSugerido || '',
        valorProposto: '',
        justificativa: ''
      });
    } else {
      setRequestForm(null);
    }
    setFeedbackMsg(null);
    loadAll();
    const unsub = subscribeEcosystemUpdates(() => {
      loadAll();
    });
    return unsub;
  }, [isOpen, initialTab, initialRequestTarget]);

  const filteredBarragens = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return catalog.barragens;
    return catalog.barragens.filter(
      b =>
        b.nome.toLowerCase().includes(q) ||
        b.municipio.toLowerCase().includes(q) ||
        (b.cursoDagua || '').toLowerCase().includes(q)
    );
  }, [catalog.barragens, searchTerm]);

  const filteredEmpreendedores = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return catalog.empreendedores;
    return catalog.empreendedores.filter(
      e =>
        e.nomeRazaoSocial.toLowerCase().includes(q) ||
        (e.cpfCnpj || '').toLowerCase().includes(q) ||
        (e.municipio || '').toLowerCase().includes(q)
    );
  }, [catalog.empreendedores, searchTerm]);

  const filteredRts = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return catalog.responsaveisTecnicos;
    return catalog.responsaveisTecnicos.filter(
      r =>
        r.nome.toLowerCase().includes(q) ||
        (r.registroProfissional || '').toLowerCase().includes(q) ||
        (r.artNumero || '').toLowerCase().includes(q)
    );
  }, [catalog.responsaveisTecnicos, searchTerm]);

  const pendingRequestsCount = requests.filter(r => r.status === 'pendente').length;

  const handleLinkBarragem = async (bar: BarragemEntity) => {
    const linkedEmp = catalog.empreendedores.find(e => e.id === bar.empreendedorId) || null;
    const linkedRt =
      catalog.responsaveisTecnicos.find(
        r => r.barragemId === bar.id || (linkedEmp && r.empreendedorId === linkedEmp.id)
      ) || null;

    onApplyMasterSelection({
      barragem: bar,
      empreendedor: linkedEmp,
      responsavelTecnico: linkedRt
    });

    const prods = await findProductsByDamOrOwner({
      barragemId: bar.id,
      empreendedorId: linkedEmp?.id,
      barragemNome: bar.nome,
      empreendedorNome: linkedEmp?.nomeRazaoSocial
    });
    setActiveProducts(prods);
    setFeedbackMsg({
      type: 'success',
      text: `Barragem "${bar.nome}" vinculada à ficha atual. Origem detentora: ${getSistemaLabel(bar.sistemaOrigem)}.`
    });
  };

  const handleLinkEmpreendedor = (emp: EmpreendedorEntity) => {
    onApplyMasterSelection({ empreendedor: emp });
    setFeedbackMsg({
      type: 'success',
      text: `Empreendedor "${emp.nomeRazaoSocial}" vinculado à ficha atual.`
    });
  };

  const handleLinkRt = (rt: ResponsavelTecnicoEntity) => {
    onApplyMasterSelection({ responsavelTecnico: rt });
    setFeedbackMsg({
      type: 'success',
      text: `Responsável Técnico "${rt.nome}" vinculado à ficha atual.`
    });
  };

  const handleSubmitRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!requestForm) return;
    setFeedbackMsg(null);
    const res = await submitAlterationRequest({
      entidadeTipo: requestForm.entidadeTipo,
      entidadeId: requestForm.entidadeId,
      entidadeNome: requestForm.entidadeNome,
      sistemaDetentor: requestForm.sistemaDetentor,
      solicitanteEmail: currentUser?.email || currentInspection.createdByEmail || 'nao-informado@sistema.local',
      solicitanteNome: currentUser?.fullName || currentUser?.email || 'Fiscal CSB',
      camposAlterados: {
        [requestForm.campoKey]: {
          rotulo: requestForm.campoRotulo,
          valorAtual: requestForm.valorAtual,
          valorProposto: requestForm.valorProposto
        }
      },
      justificativa: requestForm.justificativa
    });

    if (res.success) {
      setFeedbackMsg({
        type: 'success',
        text: `Solicitação de alteração enviada para o analista/administrador detentor (${getSistemaLabel(requestForm.sistemaDetentor)}).`
      });
      setRequestForm(null);
      setActiveTab('solicitacoes');
      loadAll();
    } else {
      setFeedbackMsg({
        type: 'error',
        text: res.error || 'Falha ao enviar solicitação de alteração.'
      });
    }
  };

  const handleResolveRequest = async (reqId: string, decision: 'aprovada' | 'reprovada') => {
    const res = await resolveAlterationRequest({
      requestId: reqId,
      decision,
      reviewerEmail: currentUser?.email || '',
      reviewerName: currentUser?.fullName || currentUser?.email || 'Administrador',
      reviewerRole: currentUser?.role,
      respostaMotivo: decisionNoteByReqId[reqId] || ''
    });

    if (res.success) {
      setFeedbackMsg({
        type: 'success',
        text:
          decision === 'aprovada'
            ? 'Solicitação aprovada e catálogo padronizado atualizado.'
            : 'Solicitação reprovada com registro de justificativa.'
      });
      loadAll();
    } else {
      setFeedbackMsg({
        type: 'error',
        text: res.error || 'Sem permissão para decidir esta solicitação.'
      });
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-2 xs:p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl w-full max-w-5xl max-h-[92dvh] my-auto flex flex-col overflow-hidden">
        {/* Cabeçalho */}
        <div className="px-4 sm:px-6 py-4 bg-slate-900 text-white flex items-center justify-between gap-3 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-600/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shrink-0">
              <Network className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-black tracking-tight">
                Ecossistema Integrado CSB / SEMA-MT
              </h2>
              <p className="text-[11px] text-slate-300">
                Administra Barragens (Base Mestre) · Fiscaliza · Classifica · Notifica
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={loadAll}
              disabled={isLoading}
              className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 flex items-center gap-1.5 cursor-pointer"
              title="Atualizar dados do ecossistema"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Atualizar</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white cursor-pointer"
              aria-label="Fechar"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Abas */}
        <div className="px-4 sm:px-6 pt-3 bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2 overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab('catalogo')}
            className={`px-3.5 py-2 rounded-t-xl text-xs sm:text-sm font-bold border-b-2 transition flex items-center gap-2 shrink-0 cursor-pointer ${
              activeTab === 'catalogo'
                ? 'border-emerald-600 text-emerald-700 dark:text-emerald-400 bg-white dark:bg-slate-900'
                : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            <Database className="w-4 h-4" />
            <span>Cadastro Central (Administra)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('solicitacoes')}
            className={`px-3.5 py-2 rounded-t-xl text-xs sm:text-sm font-bold border-b-2 transition flex items-center gap-2 shrink-0 cursor-pointer ${
              activeTab === 'solicitacoes'
                ? 'border-emerald-600 text-emerald-700 dark:text-emerald-400 bg-white dark:bg-slate-900'
                : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            <Send className="w-4 h-4" />
            <span>Solicitações de Alteração</span>
            {pendingRequestsCount > 0 && (
              <span className="px-1.5 py-0.5 rounded-full bg-amber-500 text-slate-950 text-[10px] font-black">
                {pendingRequestsCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('notificacoes')}
            className={`px-3.5 py-2 rounded-t-xl text-xs sm:text-sm font-bold border-b-2 transition flex items-center gap-2 shrink-0 cursor-pointer ${
              activeTab === 'notificacoes'
                ? 'border-emerald-600 text-emerald-700 dark:text-emerald-400 bg-white dark:bg-slate-900'
                : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            <BellRing className="w-4 h-4" />
            <span>Caixa dos Analistas</span>
            {analystInbox.filter(n => !n.lida).length > 0 && (
              <span className="px-1.5 py-0.5 rounded-full bg-orange-500 text-white text-[10px] font-black">
                {analystInbox.filter(n => !n.lida).length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('status')}
            className={`px-3.5 py-2 rounded-t-xl text-xs sm:text-sm font-bold border-b-2 transition flex items-center gap-2 shrink-0 cursor-pointer ${
              activeTab === 'status'
                ? 'border-emerald-600 text-emerald-700 dark:text-emerald-400 bg-white dark:bg-slate-900'
                : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            <span>Servidores & Arquitetura (4 Sistemas)</span>
          </button>
        </div>

        {/* Feedback */}
        {feedbackMsg && (
          <div
            className={`mx-4 sm:mx-6 mt-3 px-4 py-2.5 rounded-xl text-xs font-semibold flex items-center justify-between gap-2 border ${
              feedbackMsg.type === 'success'
                ? 'bg-emerald-50 text-emerald-900 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-200 dark:border-emerald-800'
                : 'bg-rose-50 text-rose-900 border-rose-200 dark:bg-rose-950/50 dark:text-rose-200 dark:border-rose-800'
            }`}
          >
            <span>{feedbackMsg.text}</span>
            <button type="button" onClick={() => setFeedbackMsg(null)} className="underline text-[11px] cursor-pointer">
              Fechar
            </button>
          </div>
        )}

        {/* Conteúdo Scrollável */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-5 flex-1">
          {/* Formulário Inline de Solicitação de Alteração Cross-System */}
          {requestForm && (
            <form
              onSubmit={handleSubmitRequest}
              className="p-4 rounded-2xl bg-amber-50/90 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-800 space-y-3"
            >
              <div className="flex items-center justify-between gap-2">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-amber-800 dark:text-amber-300">
                    Solicitação Formal de Alteração para {getSistemaLabel(requestForm.sistemaDetentor)}
                  </span>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    {requestForm.entidadeNome} ({requestForm.entidadeTipo})
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setRequestForm(null)}
                  className="text-xs text-slate-500 hover:text-slate-800 underline cursor-pointer"
                >
                  Cancelar
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Campo a Alterar
                  </label>
                  <input
                    type="text"
                    required
                    value={requestForm.campoRotulo}
                    onChange={e =>
                      setRequestForm(prev =>
                        prev ? { ...prev, campoRotulo: e.target.value, campoKey: e.target.value } : null
                      )
                    }
                    placeholder="Ex: Nome da Barragem / CPF-CNPJ / Telefone"
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Valor Atual no Sistema Detentor
                  </label>
                  <input
                    type="text"
                    value={requestForm.valorAtual}
                    onChange={e => setRequestForm(prev => (prev ? { ...prev, valorAtual: e.target.value } : null))}
                    placeholder="Valor atual registrado"
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Novo Valor Proposto <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={requestForm.valorProposto}
                    onChange={e => setRequestForm(prev => (prev ? { ...prev, valorProposto: e.target.value } : null))}
                    placeholder="Informe a correção proposta"
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Justificativa Técnica / Evidência de Campo <span className="text-rose-500">*</span>
                </label>
                <textarea
                  required
                  rows={2}
                  value={requestForm.justificativa}
                  onChange={e => setRequestForm(prev => (prev ? { ...prev, justificativa: e.target.value } : null))}
                  placeholder="Descreva o motivo da correção (ex.: atualização constatada em vistoria de campo, alteração de titularidade, documento oficial)."
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                />
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Enviar Solicitação ao Sistema Detentor</span>
                </button>
              </div>
            </form>
          )}

          {/* TAB 1: CATÁLOGO CENTRAL ADMINISTRA + DESCOBERTA DE PRODUTOS */}
          {activeTab === 'catalogo' && (
            <div className="space-y-5">
              {/* Barra de busca e filtro */}
              <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    placeholder="Buscar barragem, empreendedor, CPF/CNPJ, município ou CREA..."
                    className="w-full pl-9 pr-3 py-2.5 text-xs sm:text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
                  />
                </div>
                <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
                  <button
                    type="button"
                    onClick={() => setCatalogFilter('barragens')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer ${
                      catalogFilter === 'barragens'
                        ? 'bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-400 shadow-xs'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    <Landmark className="w-3.5 h-3.5" />
                    <span>Barragens ({filteredBarragens.length})</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setCatalogFilter('empreendedores')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer ${
                      catalogFilter === 'empreendedores'
                        ? 'bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-400 shadow-xs'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    <Building2 className="w-3.5 h-3.5" />
                    <span>Empreendedores ({filteredEmpreendedores.length})</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setCatalogFilter('rts')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer ${
                      catalogFilter === 'rts'
                        ? 'bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-400 shadow-xs'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    <HardHat className="w-3.5 h-3.5" />
                    <span>Resp. Técnicos ({filteredRts.length})</span>
                  </button>
                </div>
              </div>

              {/* Lista de Registros Mestres */}
              <div className="space-y-2.5">
                {catalogFilter === 'barragens' && (
                  <>
                    {filteredBarragens.length === 0 ? (
                      <div className="p-6 text-center rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 text-xs text-slate-500">
                        Nenhuma barragem localizada no catálogo central ainda. Ao salvar uma vistoria no Fiscaliza ou sincronizar o servidor do Administra Barragens, os registros padronizados aparecerão aqui.
                      </div>
                    ) : (
                      filteredBarragens.map(bar => {
                        const perm = canFiscalizaEditMasterEntity(bar.sistemaOrigem);
                        const owner = catalog.empreendedores.find(e => e.id === bar.empreendedorId);
                        return (
                          <div
                            key={bar.id}
                            className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                          >
                            <div className="space-y-1">
                              <div className="flex items-center flex-wrap gap-2">
                                <span className="font-bold text-sm text-slate-900 dark:text-white">{bar.nome}</span>
                                <span
                                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                                    ORIGIN_BADGE_STYLES[bar.sistemaOrigem]
                                  }`}
                                >
                                  Origem: {getSistemaLabel(bar.sistemaOrigem)}
                                </span>
                                {!perm.allowed && (
                                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 flex items-center gap-1">
                                    <Lock className="w-3 h-3" />
                                    <span>Somente Leitura no Fiscaliza</span>
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-slate-600 dark:text-slate-400">
                                Município: <strong>{bar.municipio || 'Não informado'}</strong>
                                {owner ? ` · Empreendedor: ${owner.nomeRazaoSocial}` : ''}
                                {bar.cursoDagua ? ` · Curso d'água: ${bar.cursoDagua}` : ''}
                              </p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <button
                                type="button"
                                onClick={() => handleLinkBarragem(bar)}
                                className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                              >
                                <Link2 className="w-3.5 h-3.5" />
                                <span>Vincular à Ficha</span>
                              </button>
                              {!perm.allowed && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setRequestForm({
                                      entidadeTipo: 'barragem',
                                      entidadeId: bar.id,
                                      entidadeNome: bar.nome,
                                      sistemaDetentor: bar.sistemaOrigem,
                                      campoKey: 'nome',
                                      campoRotulo: 'Nome / Dados da Barragem',
                                      valorAtual: bar.nome,
                                      valorProposto: '',
                                      justificativa: ''
                                    })
                                  }
                                  className="px-3 py-1.5 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 text-xs font-bold cursor-pointer"
                                >
                                  Solicitar Alteração
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </>
                )}

                {catalogFilter === 'empreendedores' && (
                  <>
                    {filteredEmpreendedores.length === 0 ? (
                      <div className="p-6 text-center rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 text-xs text-slate-500">
                        Nenhum empreendedor padronizado encontrado.
                      </div>
                    ) : (
                      filteredEmpreendedores.map(emp => {
                        const perm = canFiscalizaEditMasterEntity(emp.sistemaOrigem);
                        return (
                          <div
                            key={emp.id}
                            className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                          >
                            <div className="space-y-1">
                              <div className="flex items-center flex-wrap gap-2">
                                <span className="font-bold text-sm text-slate-900 dark:text-white">
                                  {emp.nomeRazaoSocial}
                                </span>
                                <span
                                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                                    ORIGIN_BADGE_STYLES[emp.sistemaOrigem]
                                  }`}
                                >
                                  Origem: {getSistemaLabel(emp.sistemaOrigem)}
                                </span>
                              </div>
                              <p className="text-xs text-slate-600 dark:text-slate-400">
                                CPF/CNPJ: <strong>{canViewFullCpfCnpj ? (emp.cpfCnpj || 'Não informado') : maskCpfCnpj(emp.cpfCnpj)}</strong>
                                {emp.telefone ? ` · Tel: ${emp.telefone}` : ''}
                                {emp.carNumero ? ` · CAR: ${emp.carNumero}` : ''}
                              </p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <button
                                type="button"
                                onClick={() => handleLinkEmpreendedor(emp)}
                                className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                              >
                                <Link2 className="w-3.5 h-3.5" />
                                <span>Vincular à Ficha</span>
                              </button>
                              {!perm.allowed && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setRequestForm({
                                      entidadeTipo: 'empreendedor',
                                      entidadeId: emp.id,
                                      entidadeNome: emp.nomeRazaoSocial,
                                      sistemaDetentor: emp.sistemaOrigem,
                                      campoKey: 'nomeRazaoSocial',
                                      campoRotulo: 'Razão Social / CPF-CNPJ / Contato',
                                      valorAtual: emp.nomeRazaoSocial,
                                      valorProposto: '',
                                      justificativa: ''
                                    })
                                  }
                                  className="px-3 py-1.5 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 text-xs font-bold cursor-pointer"
                                >
                                  Solicitar Alteração
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </>
                )}

                {catalogFilter === 'rts' && (
                  <>
                    {filteredRts.length === 0 ? (
                      <div className="p-6 text-center rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 text-xs text-slate-500">
                        Nenhum Responsável Técnico cadastrado no catálogo central ainda.
                      </div>
                    ) : (
                      filteredRts.map(rt => {
                        const perm = canFiscalizaEditMasterEntity(rt.sistemaOrigem);
                        return (
                          <div
                            key={rt.id}
                            className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                          >
                            <div className="space-y-1">
                              <div className="flex items-center flex-wrap gap-2">
                                <span className="font-bold text-sm text-slate-900 dark:text-white">{rt.nome}</span>
                                <span
                                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                                    ORIGIN_BADGE_STYLES[rt.sistemaOrigem]
                                  }`}
                                >
                                  Origem: {getSistemaLabel(rt.sistemaOrigem)}
                                </span>
                              </div>
                              <p className="text-xs text-slate-600 dark:text-slate-400">
                                Registro: <strong>{rt.registroProfissional || 'Não informado'}</strong>
                                {rt.artNumero ? ` · ART: ${rt.artNumero}` : ''}
                                {rt.especialidade ? ` · ${rt.especialidade}` : ''}
                              </p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <button
                                type="button"
                                onClick={() => handleLinkRt(rt)}
                                className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                              >
                                <Link2 className="w-3.5 h-3.5" />
                                <span>Vincular à Ficha</span>
                              </button>
                              {!perm.allowed && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setRequestForm({
                                      entidadeTipo: 'responsavel_tecnico',
                                      entidadeId: rt.id,
                                      entidadeNome: rt.nome,
                                      sistemaDetentor: rt.sistemaOrigem,
                                      campoKey: 'registroProfissional',
                                      campoRotulo: 'Registro Profissional / ART / Contato',
                                      valorAtual: rt.registroProfissional || rt.nome,
                                      valorProposto: '',
                                      justificativa: ''
                                    })
                                  }
                                  className="px-3 py-1.5 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 text-xs font-bold cursor-pointer"
                                >
                                  Solicitar Alteração
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </>
                )}
              </div>

              {/* Painel de Produtos Já Gerados nos 4 Sistemas para a Ficha Atual */}
              <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-2.5">
                <div className="flex items-center gap-2">
                  <FileSearch className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <h3 className="text-xs sm:text-sm font-black text-slate-900 dark:text-white uppercase tracking-wide">
                    Produtos Já Gerados no Ecossistema (para a Barragem/Empreendedor da Ficha Atual)
                  </h3>
                </div>
                {activeProducts.length === 0 ? (
                  <p className="text-xs text-slate-500">
                    Nenhum produto prévio localizado para a barragem ou empreendedor atual nos 4 sistemas.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {activeProducts.map(prod => (
                      <div
                        key={prod.id}
                        className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 flex flex-col gap-1"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                              ORIGIN_BADGE_STYLES[prod.sistemaOrigem]
                            }`}
                          >
                            {getSistemaLabel(prod.sistemaOrigem)}
                          </span>
                          <span className="text-[10px] font-mono text-slate-500">{prod.dataEmissao}</span>
                        </div>
                        <p className="text-xs font-bold text-slate-900 dark:text-white">{prod.titulo}</p>
                        <p className="text-[11px] text-slate-600 dark:text-slate-400">
                          Barragem: {prod.barragemNome} · Status: <strong>{prod.statusProduto}</strong>
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: SOLICITAÇÕES DE ALTERAÇÃO CROSS-SYSTEM */}
          {activeTab === 'solicitacoes' && (
            <div className="space-y-3">
              <div className="p-3.5 rounded-xl bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-300">
                <strong>Regra de Governança Cross-System:</strong> O Fiscaliza não edita diretamente dados mestres inseridos por{' '}
                <em>Administra, Classifica ou Notifica</em>. Alterações solicitadas aguardam aprovação/reprovação pelo analista ou administrador detentor da informação original.
              </div>

              {requests.length === 0 ? (
                <div className="p-8 text-center rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 text-xs text-slate-500">
                  Nenhuma solicitação de alteração registrada entre os sistemas até o momento.
                </div>
              ) : (
                requests.map(req => {
                  const isAdmin = (currentUser?.role || '').toLowerCase() === 'administrador';
                  const canDecide = req.status === 'pendente' && (req.sistemaDetentor === 'fiscaliza' || isAdmin);
                  return (
                    <div
                      key={req.id}
                      className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 space-y-2.5"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center flex-wrap gap-2">
                          <span className="text-xs font-black text-slate-900 dark:text-white">{req.entidadeNome}</span>
                          <span className="text-[10px] px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-semibold uppercase">
                            {req.entidadeTipo}
                          </span>
                          <span className="text-[10px] text-slate-500">
                            {getSistemaLabel(req.sistemaSolicitante)} → {getSistemaLabel(req.sistemaDetentor)}
                          </span>
                        </div>
                        <span
                          className={`text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase ${
                            req.status === 'aprovada'
                              ? 'bg-emerald-100 text-emerald-800'
                              : req.status === 'reprovada'
                              ? 'bg-rose-100 text-rose-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {req.status}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs bg-slate-50 dark:bg-slate-900 p-2.5 rounded-lg">
                        {Object.entries(req.camposAlterados || {}).map(([k, diff]) => (
                          <div key={k} className="space-y-0.5">
                            <span className="font-bold text-slate-700 dark:text-slate-300">{diff.rotulo || k}:</span>
                            <div className="flex items-center gap-1.5 text-[11px]">
                              <span className="line-through text-rose-600">{diff.valorAtual || '(vazio)'}</span>
                              <span>→</span>
                              <span className="font-bold text-emerald-700 dark:text-emerald-400">
                                {diff.valorProposto}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>

                      <p className="text-xs text-slate-600 dark:text-slate-400">
                        <strong>Justificativa ({req.solicitanteNome}):</strong> {req.justificativa}
                      </p>

                      {req.status !== 'pendente' && req.respostaMotivo && (
                        <p className="text-[11px] text-slate-500">
                          <strong>Parecer ({req.analisadoPorNome || 'Detentor'}):</strong> {req.respostaMotivo}
                        </p>
                      )}

                      {canDecide && (
                        <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
                          <input
                            type="text"
                            placeholder="Parecer / motivo da decisão (opcional)"
                            value={decisionNoteByReqId[req.id] || ''}
                            onChange={e =>
                              setDecisionNoteByReqId(prev => ({ ...prev, [req.id]: e.target.value }))
                            }
                            className="flex-1 px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
                          />
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleResolveRequest(req.id, 'aprovada')}
                              className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1 cursor-pointer"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Aprovar</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleResolveRequest(req.id, 'reprovada')}
                              className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold flex items-center gap-1 cursor-pointer"
                            >
                              <XCircle className="w-3.5 h-3.5" />
                              <span>Reprovar</span>
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* TAB 3: CAIXA DOS ANALISTAS (ALTERAÇÕES POR SUPERIORIDADE DA VISTORIA) */}
          {activeTab === 'notificacoes' && (
            <div className="space-y-3">
              <div className="p-3.5 rounded-xl bg-orange-50 dark:bg-orange-950/30 border border-orange-300 dark:border-orange-800 text-xs text-orange-950 dark:text-orange-100">
                <strong>Registro de Campo (Vistoria Presencial):</strong> Alterações autorizadas feitas pelo fiscal em dados importados são registradas apenas na base do Fiscaliza e geram alerta para conferência pelo analista de referência (sem gravação automática no sistema de origem externo).
              </div>
              {analystInbox.length === 0 ? (
                <div className="p-8 text-center rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 text-xs text-slate-500">
                  Nenhuma notificação de alteração por superioridade de vistoria registrada até o momento.
                </div>
              ) : (
                analystInbox.map(notif => (
                  <div
                    key={notif.id}
                    className={`p-4 rounded-xl border space-y-2 ${
                      notif.lida
                        ? 'border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60'
                        : 'border-orange-400 bg-orange-50/60 dark:bg-orange-950/20'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center flex-wrap gap-2">
                        <span className="text-xs font-black text-slate-900 dark:text-white">{notif.entidadeNome}</span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${ORIGIN_BADGE_STYLES[notif.sistemaDestino]}`}>
                          Caixa: {getSistemaLabel(notif.sistemaDestino)}
                        </span>
                        <span className="text-[11px] font-mono text-slate-600 dark:text-slate-300">
                          Analista: {notif.destinatarioAnalistaEmail}
                        </span>
                      </div>
                      {!notif.lida && (
                        <button
                          type="button"
                          onClick={async () => {
                            await markAnalystNotificationRead(notif.id);
                            loadAll();
                          }}
                          className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                        >
                          <Check className="w-3 h-3" />
                          <span>Marcar como lida</span>
                        </button>
                      )}
                    </div>
                    <div className="text-xs bg-white dark:bg-slate-900 p-2.5 rounded-lg border border-slate-200 dark:border-slate-800">
                      <span className="font-bold">{notif.campoRotulo}:</span>{' '}
                      <span className="line-through text-rose-600">{notif.valorAnterior || '(vazio)'}</span>{' '}
                      <span>→</span>{' '}
                      <span className="font-bold text-emerald-700 dark:text-emerald-400">{notif.valorAtualizadoVistoria}</span>
                    </div>
                    <p className="text-[11px] text-slate-600 dark:text-slate-400">
                      Alterado na Vistoria {notif.numeroVistoria || notif.vistoriaId} por <strong>{notif.alteradoPorNome}</strong> ({notif.alteradoPorEmail}). {notif.motivoSuperioridade}
                    </p>
                  </div>
                ))
              )}
            </div>
          )}

          {/* TAB 4: STATUS DOS 4 NÓS E CONFIRMAÇÃO DE SERVIDORES */}
          {activeTab === 'status' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {ecosystemNodes.map(node => {
                  const live = serverConnections.find(c => c.sistema === node.sistema);
                  return (
                    <div
                      key={node.sistema}
                      className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950 space-y-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-black text-slate-900 dark:text-white">{node.nomeExibicao}</span>
                        {live?.reachable ? (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                            Servidor OK {live.latencyMs ? `(${live.latencyMs}ms)` : ''}
                          </span>
                        ) : node.modoOperacao === 'bloqueado_seguranca' ? (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" />
                            Acesso Restrito
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {live?.statusText || 'Operando Localmente'}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-600 dark:text-slate-400">{node.papel}</p>
                      {live && <p className="text-[11px] text-slate-600 dark:text-slate-300">Teste ao vivo: {live.statusText}</p>}
                      {node.securityError && (
                        <p className="text-[11px] text-rose-600 font-semibold">{node.securityError}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
