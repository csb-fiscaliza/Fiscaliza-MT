// ==============================================================================
// ARQUIVO: src/components/UsersManagementStep.tsx
// Módulo de Gestão de Usuários e Controle de Perfis de Acesso (RBAC)
// Exclusivo para Usuário Administrador - CSB / SEMA-MT
// Permite Gerenciar: Administrador, Analista e Visualizador
// ==============================================================================

import React, { useState, useEffect, useRef } from 'react';
import { 
  Users, 
  UserPlus, 
  ShieldCheck, 
  ShieldAlert, 
  CheckCircle2, 
  AlertCircle, 
  Search, 
  Edit3, 
  Trash2, 
  KeyRound, 
  Check, 
  Copy, 
  Power, 
  UserCheck, 
  UserX, 
  Eye, 
  ArrowLeft,
  X,
  Mail,
  BadgeAlert,
  Info,
  Clock,
  Send,
  ExternalLink
} from 'lucide-react';
import { UserProfile, UserRole, UserStatus } from '../types/inspection';
import { 
  getUsers, 
  createUser, 
  updateUser, 
  deleteUser, 
  toggleUserStatus, 
  resetUserPasswordToDefault,
  approveUserAccess,
  rejectUserAccess,
  ApprovalEmailPayload,
  subscribeUsers 
} from '../services/userService';

interface UsersManagementStepProps {
  currentUser?: { email?: string; fullName?: string; role?: string; id?: string } | null;
  onGoToDashboard: () => void;
}

export const UsersManagementStep: React.FC<UsersManagementStepProps> = ({
  currentUser,
  onGoToDashboard
}) => {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<'todos' | UserRole>('todos');
  const [statusFilter, setStatusFilter] = useState<'todos' | UserStatus>('todos');
  
  // Modais de Criação e Edição
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState<{
    title: string;
    message: string;
    confirmLabel: string;
    danger?: boolean;
    onConfirm: () => Promise<void>;
  } | null>(null);
  const [isConfirmingAction, setIsConfirmingAction] = useState(false);

  // Modais de Aprovação e Notificação por E-mail
  const [approvalModalUser, setApprovalModalUser] = useState<UserProfile | null>(null);
  const [approvalRole, setApprovalRole] = useState<UserRole>('analista');
  const [emailModalData, setEmailModalData] = useState<{ user: UserProfile; payload: ApprovalEmailPayload } | null>(null);
  const [copiedEmailText, setCopiedEmailText] = useState(false);
  
  // Modal de Senha Temporária de Uso Único (gerada aleatoriamente)
  const [oneTimePwdModal, setOneTimePwdModal] = useState<{ userEmail: string; userName: string; tempPwd: string } | null>(null);
  const [copiedTempPwd, setCopiedTempPwd] = useState(false);

  // Feedback
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleFeedbackClear = (ms: number) => {
    if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
    feedbackTimerRef.current = setTimeout(() => setFeedback(null), ms);
  };

  // Formulário de Criação/Edição
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    role: 'analista' as UserRole,
    status: 'ativo' as UserStatus,
    cargo: '',
    matricula: '',
    setor: 'Coordenadoria de Segurança de Barragens - CSB/SEMA-MT'
  });

  const loadData = async () => {
    try {
      const list = await getUsers();
      setUsers(list);
    } catch (err) {
      console.error('Erro ao carregar usuários:', err);
    }
  };

  useEffect(() => {
    loadData();
    const unsub = subscribeUsers(() => {
      loadData();
    });
    return () => {
      unsub();
      if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, []);

  const handleOpenCreate = () => {
    setFormData({
      name: '',
      email: '',
      role: 'analista',
      status: 'ativo',
      cargo: 'Fiscal Técnico de Barragens',
      matricula: 'CSB-' + Math.floor(100 + Math.random() * 900),
      setor: 'Coordenadoria de Segurança de Barragens - CSB/SEMA-MT'
    });
    setShowCreateModal(true);
  };

  const handleOpenEdit = (user: UserProfile) => {
    setEditingUser(user);
    setFormData({
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.status,
      cargo: user.cargo || '',
      matricula: user.matricula || '',
      setor: user.setor || 'Coordenadoria de Segurança de Barragens - CSB/SEMA-MT'
    });
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.email.trim()) {
      setFeedback({ type: 'error', message: 'Preencha o nome e o e-mail do usuário.' });
      return;
    }

    const res = await createUser({
      name: formData.name,
      email: formData.email,
      role: formData.role,
      status: formData.status,
      cargo: formData.cargo,
      matricula: formData.matricula,
      setor: formData.setor
    });

    if (res.success) {
      setShowCreateModal(false);
      if (res.temporaryPassword) {
        setOneTimePwdModal({
          userEmail: formData.email,
          userName: formData.name,
          tempPwd: res.temporaryPassword
        });
      }
      setFeedback({ 
        type: 'success', 
        message: `Usuário ${formData.name} cadastrado com senha temporária segura gerada em tempo de execução.` 
      });
      scheduleFeedbackClear(6000);
    } else {
      setFeedback({ type: 'error', message: res.error || 'Erro ao criar usuário.' });
    }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;

    const res = await updateUser(editingUser.id, {
      name: formData.name,
      role: formData.role,
      status: formData.status,
      cargo: formData.cargo,
      matricula: formData.matricula,
      setor: formData.setor
    });

    if (res.success) {
      setFeedback({ type: 'success', message: 'Dados do usuário atualizados com sucesso.' });
      setEditingUser(null);
      scheduleFeedbackClear(5000);
    } else {
      setFeedback({ type: 'error', message: res.error || 'Erro ao atualizar usuário.' });
    }
  };

  const handleToggleStatus = (user: UserProfile) => {
    const action = user.status === 'ativo' ? 'inativar' : 'reativar';
    setPendingConfirm({
      title: `${user.status === 'ativo' ? 'Inativar' : 'Reativar'} Acesso`,
      message: `Tem certeza de que deseja ${action} o acesso de ${user.name}?`,
      confirmLabel: user.status === 'ativo' ? 'Inativar' : 'Reativar',
      danger: user.status === 'ativo',
      onConfirm: async () => {
        const res = await toggleUserStatus(user.id);
        if (res.success) {
          setFeedback({
            type: 'info',
            message: `Status do usuário ${user.name} alterado para ${res.newStatus?.toUpperCase()}.`
          });
          scheduleFeedbackClear(4000);
        } else {
          setFeedback({ type: 'error', message: res.error || 'Falha ao alterar status.' });
        }
      }
    });
  };

  const handleDelete = (user: UserProfile) => {
    setPendingConfirm({
      title: 'Excluir Usuário',
      message: `Deseja realmente excluir o usuário "${user.name}" (${user.email})? Esta ação não pode ser desfeita.`,
      confirmLabel: 'Excluir Usuário',
      danger: true,
      onConfirm: async () => {
        const res = await deleteUser(user.id, currentUser?.email);
        if (res.success) {
          setFeedback({ type: 'success', message: `Usuário ${user.name} excluído do sistema.` });
          scheduleFeedbackClear(5000);
        } else {
          setFeedback({ type: 'error', message: res.error || 'Falha ao excluir usuário.' });
        }
      }
    });
  };

  const handleResetPassword = (user: UserProfile) => {
    setPendingConfirm({
      title: 'Gerar Nova Senha Temporária',
      message: `Deseja gerar uma nova senha temporária criptográfica para "${user.name}"?`,
      confirmLabel: 'Gerar Senha',
      onConfirm: async () => {
        const res = await resetUserPasswordToDefault(user.email);
        if (res.success && res.temporaryPassword) {
          setOneTimePwdModal({
            userEmail: user.email,
            userName: user.name,
            tempPwd: res.temporaryPassword
          });
          setFeedback({
            type: 'success',
            message: `Nova senha temporária gerada com segurança para ${user.name}.`
          });
          scheduleFeedbackClear(6000);
        } else {
          setFeedback({ type: 'error', message: res.error || 'Falha ao redefinir senha.' });
        }
      }
    });
  };

  const handleOpenApproveModal = (user: UserProfile) => {
    setApprovalModalUser(user);
    setApprovalRole('analista');
  };

  const handleConfirmApproval = async () => {
    if (!approvalModalUser) return;
    const userToApprove = approvalModalUser;
    const res = await approveUserAccess(userToApprove.id, approvalRole, currentUser?.email);

    if (res.success && res.emailPayload) {
      setApprovalModalUser(null);
      setEmailModalData({
        user: res.user || userToApprove,
        payload: res.emailPayload
      });

      // Tenta acionar o envio via cliente padrão de e-mail do sistema (mailto)
      try {
        const mailAnchor = document.createElement('a');
        mailAnchor.href = res.emailPayload.mailtoUrl;
        mailAnchor.target = '_blank';
        mailAnchor.rel = 'noopener noreferrer';
        mailAnchor.click();
      } catch {
        window.location.href = res.emailPayload.mailtoUrl;
      }

      setFeedback({
        type: 'success',
        message: `Acesso liberado com sucesso para ${userToApprove.name}! O e-mail com as informações de login e orientações foi preparado.`
      });
      scheduleFeedbackClear(8000);
    } else {
      setFeedback({ type: 'error', message: res.error || 'Erro ao aprovar solicitação de acesso.' });
    }
  };

  const handleReject = (user: UserProfile) => {
    setPendingConfirm({
      title: 'Reprovar Solicitação de Acesso',
      message: `Tem certeza de que deseja reprovar a solicitação de acesso do fiscal "${user.name}" (${user.email})?`,
      confirmLabel: 'Reprovar Solicitação',
      danger: true,
      onConfirm: async () => {
        const res = await rejectUserAccess(user.id, 'Indeferido pela Administração CSB/SEMA-MT');
        if (res.success) {
          setFeedback({
            type: 'info',
            message: `Solicitação de acesso de ${user.name} foi indeferida.`
          });
          scheduleFeedbackClear(5000);
        } else {
          setFeedback({ type: 'error', message: res.error || 'Erro ao reprovar solicitação.' });
        }
      }
    });
  };

  // Usuários cadastrados no sistema (ativos, inativos, etc. - exclui pendentes de aprovação)
  const registeredUsers = users.filter(u => u.status !== 'pendente');

  // Filtragem da lista de usuários cadastrados
  const filteredUsers = registeredUsers.filter(user => {
    const q = searchQuery.toLowerCase().trim();
    const matchesSearch = 
      !q ||
      user.name.toLowerCase().includes(q) ||
      user.email.toLowerCase().includes(q) ||
      (user.cargo && user.cargo.toLowerCase().includes(q)) ||
      (user.matricula && user.matricula.toLowerCase().includes(q));

    const matchesRole = roleFilter === 'todos' || user.role === roleFilter;
    const matchesStatus = statusFilter === 'todos' || user.status === statusFilter;

    return matchesSearch && matchesRole && matchesStatus;
  });

  // Solicitações pendentes de acesso (fiscais que solicitaram na tela de login)
  const pendingUsers = users.filter(u => u.status === 'pendente');
  const pendingCount = pendingUsers.length;

  // Métricas
  const totalCount = users.length;
  const adminCount = users.filter(u => u.role === 'administrador').length;
  const analistaCount = users.filter(u => u.role === 'analista').length;
  const visualizadorCount = users.filter(u => u.role === 'visualizador').length;
  const activeCount = users.filter(u => u.status === 'ativo').length;

  const userRole = (currentUser?.role || '').toLowerCase();
  const isAdmin = userRole === 'administrador' || userRole === 'admin';

  if (!isAdmin) {
    return (
      <div className="max-w-4xl mx-auto py-16 px-4 text-center">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-8 max-w-md mx-auto shadow-xl">
          <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center mx-auto mb-4">
            <ShieldAlert className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Acesso Restrito ao Administrador</h2>
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-6">
            O módulo de Gestão de Usuários é reservado exclusivamente para o perfil Administrador da CSB/SEMA-MT.
          </p>
          <button
            type="button"
            onClick={onGoToDashboard}
            className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm transition-all cursor-pointer shadow-md"
          >
            Voltar ao Painel Principal
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-20 sm:pb-12">
      {/* Topo com Navegação e Título Institucional */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 sm:p-6 shadow-xs flex flex-wrap items-center justify-between gap-4 transition-colors">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onGoToDashboard}
              className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition mr-1"
              title="Voltar ao Painel Principal"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white uppercase tracking-tight flex items-center gap-2">
              <Users className="w-5 h-5 text-purple-600 dark:text-purple-400" />
              <span>Gestão Institucional de Usuários & Perfis (RBAC)</span>
            </h2>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-700 dark:text-purple-300 border border-purple-500/20 uppercase tracking-wider">
              Área do Administrador
            </span>
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-400 pl-8">
            Controle centralizado de acessos, atribuição de perfis técnicos e proteção de integridade das vistorias da CSB/SEMA-MT.
          </p>
        </div>

        {/* Botões de Ação do Topo */}
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={handleOpenCreate}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-purple-600 hover:bg-purple-700 text-white shadow-xs hover:shadow-purple-600/20 transition cursor-pointer"
          >
            <UserPlus className="w-4 h-4" />
            <span>Novo Usuário</span>
          </button>
        </div>
      </div>

      {/* Banner de Feedback */}
      {feedback && (
        <div className={`p-3.5 rounded-xl text-xs font-semibold flex items-center justify-between border shadow-xs animate-in fade-in duration-200 ${
          feedback.type === 'success'
            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-800 dark:text-emerald-300'
            : feedback.type === 'error'
            ? 'bg-rose-500/10 border-rose-500/30 text-rose-700 dark:text-rose-300'
            : 'bg-purple-500/10 border-purple-500/30 text-purple-800 dark:text-purple-300'
        }`}>
          <div className="flex items-center gap-2">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0" />
            )}
            <span>{feedback.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-xs underline opacity-80 hover:opacity-100"
          >
            Fechar
          </button>
        </div>
      )}

      {/* Cards de Métricas e Perfis */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        {/* Card Administradores */}
        <div className="bg-white dark:bg-slate-900 border border-purple-200 dark:border-purple-900/50 rounded-2xl p-4 shadow-2xs relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-purple-700 dark:text-purple-400 uppercase tracking-wider">
              Administradores
            </span>
            <div className="w-7 h-7 rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center">
              <ShieldCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-white mt-2">
            {adminCount}
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
            Acesso irrestrito total
          </p>
        </div>

        {/* Card Analistas */}
        <div className="bg-white dark:bg-slate-900 border border-blue-200 dark:border-blue-900/50 rounded-2xl p-4 shadow-2xs relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-blue-700 dark:text-blue-400 uppercase tracking-wider">
              Analistas
            </span>
            <div className="w-7 h-7 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <UserCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-white mt-2">
            {analistaCount}
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
            Edição de fichas próprias/equipe
          </p>
        </div>

        {/* Card Visualizadores */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-2xs relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
              Visualizadores
            </span>
            <div className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 flex items-center justify-center">
              <Eye className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-white mt-2">
            {visualizadorCount}
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
            Consulta e relatórios (leitura)
          </p>
        </div>

        {/* Card Ativos */}
        <div className="bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-900/50 rounded-2xl p-4 shadow-2xs relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">
              Ativos / Total
            </span>
            <div className="w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-white mt-2">
            {activeCount} <span className="text-sm font-semibold text-slate-400">/ {totalCount}</span>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
            Fiscais cadastrados no sistema
          </p>
        </div>
      </div>

      {/* Guia Visual das Regras de Perfis */}
      <div className="bg-slate-50 dark:bg-slate-950/60 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 text-xs text-slate-600 dark:text-slate-300 space-y-2">
        <div className="flex items-center gap-1.5 font-bold text-slate-900 dark:text-white">
          <Info className="w-4 h-4 text-purple-600 dark:text-purple-400" />
          <span>Diretrizes de Permissões e Perfis de Acesso:</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
          <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-purple-200/80 dark:border-purple-900/40">
            <span className="font-bold text-purple-700 dark:text-purple-400 block mb-1">
              👑 Administrador
            </span>
            <span>Acesso integral e irrestrito. Cria, edita e exclui qualquer vistoria, gerencia usuários, executa sincronização e auditoria.</span>
          </div>
          <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-blue-200/80 dark:border-blue-900/40">
            <span className="font-bold text-blue-700 dark:text-blue-400 block mb-1">
              🔍 Analista
            </span>
            <span>Preenche e edita/exclui <strong>exclusivamente</strong> as fichas criadas por ele mesmo ou em que esteja elencado na equipe técnica, protegendo arquivos de outros fiscais.</span>
          </div>
          <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <span className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
              👁️ Visualizador
            </span>
            <span>Acesso estrito de consulta aos painéis, fichas, fotos, medições e minutas geradas. Não possui permissão de edição ou exclusão.</span>
          </div>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* SEÇÃO 1: USUÁRIOS CADASTRADOS NO SISTEMA                              */}
      {/* ===================================================================== */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-purple-500/15 text-purple-700 dark:text-purple-300 flex items-center justify-center font-bold">
            <Users className="w-4 h-4 text-purple-600 dark:text-purple-400" />
          </div>
          <div>
            <h3 className="text-base font-black text-slate-900 dark:text-white uppercase tracking-tight flex items-center gap-2">
              <span>Usuários Cadastrados no Sistema</span>
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                {registeredUsers.length}
              </span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Fiscais, analistas e administradores com acesso ao sistema.
            </p>
          </div>
        </div>
      </div>

      {/* Barra de Filtros e Busca */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-3.5 sm:p-4 shadow-2xs flex flex-wrap items-center justify-between gap-3">
        {/* Campo de Busca */}
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Buscar por nome, e-mail, matrícula ou cargo..."
            className="w-full pl-9 pr-3 py-2 text-xs sm:text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950/60 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-purple-500 transition-all"
          />
        </div>

        {/* Filtro por Perfil */}
        <div className="flex items-center gap-1.5 text-xs">
          <span className="text-slate-500 font-semibold hidden sm:inline">Perfil:</span>
          {(['todos', 'administrador', 'analista', 'visualizador'] as const).map(role => (
            <button
              key={role}
              type="button"
              onClick={() => setRoleFilter(role)}
              className={`px-2.5 py-1.5 rounded-lg font-bold capitalize transition-all cursor-pointer ${
                roleFilter === role
                  ? 'bg-purple-600 text-white shadow-2xs'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {role === 'todos' ? 'Todos' : role}
            </button>
          ))}
        </div>

        {/* Filtro por Status */}
        <div className="flex items-center gap-1.5 text-xs">
          <span className="text-slate-500 font-semibold hidden sm:inline">Status:</span>
          {(['todos', 'ativo', 'pendente', 'inativo', 'reprovado'] as const).map(status => (
            <button
              key={status}
              type="button"
              onClick={() => setStatusFilter(status)}
              className={`px-2.5 py-1.5 rounded-lg font-bold capitalize transition-all cursor-pointer ${
                statusFilter === status
                  ? 'bg-slate-800 dark:bg-slate-200 text-white dark:text-slate-900 shadow-2xs'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {status === 'todos' ? 'Todos' : status}
            </button>
          ))}
        </div>
      </div>

      {/* Lista de Usuários */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
        {filteredUsers.length === 0 ? (
          <div className="p-12 text-center text-slate-500 dark:text-slate-400 space-y-2">
            <Users className="w-10 h-10 mx-auto text-slate-400 opacity-60" />
            <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300">Nenhum usuário encontrado</h4>
            <p className="text-xs">Tente ajustar os filtros ou os termos de busca digitados.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {filteredUsers.map(user => {
              const isAdmin = user.role === 'administrador';
              const isAnalista = user.role === 'analista';
              const isActive = user.status === 'ativo';
              const isPending = user.status === 'pendente';
              const isReproved = user.status === 'reprovado';
              const isCurrentUser = currentUser?.email?.toLowerCase() === user.email.toLowerCase();

              return (
                <div 
                  key={user.id}
                  className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition-colors"
                >
                  {/* Identidade do Usuário */}
                  <div className="flex items-start sm:items-center gap-3.5 min-w-0">
                    {/* Avatar com Iniciais */}
                    <div className={`w-11 h-11 rounded-2xl flex items-center justify-center font-black text-sm shrink-0 border ${
                      isAdmin
                        ? 'bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800'
                        : isAnalista
                        ? 'bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                    }`}>
                      {user.name.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase() || 'U'}
                    </div>

                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-black text-slate-900 dark:text-white truncate">
                          {user.name}
                        </span>
                        {isCurrentUser && (
                          <span className="text-[10px] font-bold px-2 py-0.2 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
                            Você
                          </span>
                        )}
                        {/* Perfil Badge */}
                        <span className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-full uppercase tracking-wider border ${
                          isAdmin
                            ? 'bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-400/40'
                            : isAnalista
                            ? 'bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-400/40'
                            : 'bg-slate-500/15 text-slate-700 dark:text-slate-300 border-slate-400/40'
                        }`}>
                          {user.role}
                        </span>
                        {/* Status Badge */}
                        <span className={`text-[10px] font-bold px-2 py-0.2 rounded-full border ${
                          isActive
                            ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20'
                            : isPending
                            ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20'
                            : isReproved
                            ? 'bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/20'
                            : 'bg-slate-500/10 text-slate-700 dark:text-slate-400 border-slate-500/20'
                        }`}>
                          {isPending ? 'Aguardando Aprovação' : user.status}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-500 dark:text-slate-400">
                        <span className="flex items-center gap-1">
                          <Mail className="w-3.5 h-3.5 text-slate-400" />
                          <span>{user.email}</span>
                        </span>
                        {user.cargo && (
                          <span>· {user.cargo}</span>
                        )}
                        {user.matricula && (
                          <span className="font-mono text-[11px]">Mat: {user.matricula}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Ações do Administrador */}
                  <div className="flex items-center gap-1.5 shrink-0 pl-14 sm:pl-0">
                    {isPending ? (
                      <>
                        <button
                          type="button"
                          onClick={() => handleOpenApproveModal(user)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs transition cursor-pointer"
                          title="Aprovar cadastro e liberar acesso ao sistema"
                        >
                          <UserCheck className="w-3.5 h-3.5" />
                          <span>Aprovar</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleReject(user)}
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 text-rose-600 dark:text-rose-400 text-xs font-semibold border border-rose-200 dark:border-rose-900/60 transition cursor-pointer"
                          title="Reprovar solicitação de acesso"
                        >
                          <UserX className="w-3.5 h-3.5" />
                          <span>Reprovar</span>
                        </button>
                      </>
                    ) : (
                      <>
                        {/* Botão Redefinir Senha */}
                        <button
                          type="button"
                          onClick={() => handleResetPassword(user)}
                          className="p-2 rounded-xl text-slate-600 dark:text-slate-400 hover:text-purple-600 dark:hover:text-purple-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                          title="Gerar nova senha temporária criptográfica"
                        >
                          <KeyRound className="w-4 h-4" />
                        </button>

                        {/* Botão Alternar Status (Ativo / Inativo) */}
                        <button
                          type="button"
                          onClick={() => handleToggleStatus(user)}
                          disabled={isCurrentUser}
                          className={`p-2 rounded-xl transition cursor-pointer ${
                            isActive
                              ? 'text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40'
                              : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800'
                          } disabled:opacity-40 disabled:cursor-not-allowed`}
                          title={isCurrentUser ? 'Não é possível inativar sua conta em uso' : isActive ? 'Inativar usuário (suspender acesso)' : 'Reativar usuário'}
                        >
                          <Power className="w-4 h-4" />
                        </button>

                        {/* Botão Editar */}
                        <button
                          type="button"
                          onClick={() => handleOpenEdit(user)}
                          className="p-2 rounded-xl text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                          title="Editar dados e perfil do usuário"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>

                        {/* Botão Excluir */}
                        <button
                          type="button"
                          onClick={() => handleDelete(user)}
                          disabled={isCurrentUser}
                          className="p-2 rounded-xl text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                          title={isCurrentUser ? 'Não é possível auto-excluir' : 'Excluir usuário'}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ===================================================================== */}
      {/* SEÇÃO 2 (LOGO ABAIXO): SOLICITAÇÕES DE CADASTRO PENDENTES             */}
      {/* Conforme requisito: Listar informações dos usuários cadastrados e     */}
      {/* logo abaixo mostrar a lista dos usuários que solicitaram cadastro     */}
      {/* com opção de aprovar ou reprovar                                      */}
      {/* ===================================================================== */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border-2 border-amber-300 dark:border-amber-700/80 p-4 sm:p-6 shadow-xs space-y-4 transition-colors">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-200/80 dark:border-amber-800/60 pb-3.5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/20 text-amber-700 dark:text-amber-300 flex items-center justify-center font-bold shrink-0">
              <BadgeAlert className="w-5 h-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h3 className="text-sm sm:text-base font-black text-slate-900 dark:text-white uppercase tracking-tight">
                  Solicitações de Cadastro Pendentes (Novos Fiscais)
                </h3>
                <span className={`text-xs font-black px-2.5 py-0.5 rounded-full ${
                  pendingCount > 0 
                    ? 'bg-amber-500 text-white animate-pulse' 
                    : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                }`}>
                  {pendingCount} {pendingCount === 1 ? 'pendência' : 'pendências'}
                </span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                Cadastros solicitados diretamente na tela de login pelo formulário de "Novo Fiscal". Analise e aprove ou reprove para liberar o acesso ao sistema.
              </p>
            </div>
          </div>
        </div>

        {pendingUsers.length === 0 ? (
          <div className="p-8 text-center bg-slate-50 dark:bg-slate-950/40 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 space-y-2">
            <CheckCircle2 className="w-8 h-8 mx-auto text-emerald-500 opacity-90" />
            <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200">
              Nenhuma solicitação de acesso pendente no momento
            </h4>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
              Todas as solicitações de novos fiscais foram analisadas. Quando um novo fiscal preencher o formulário na tela de login, o pedido aparecerá imediatamente aqui para análise do administrador.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 pt-1">
            {pendingUsers.map(req => (
              <div 
                key={req.id} 
                className="bg-slate-50/80 dark:bg-slate-950/70 border border-amber-300 dark:border-amber-800/80 rounded-2xl p-4 sm:p-5 shadow-xs flex flex-col justify-between gap-3.5 hover:border-amber-400 transition-colors"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm sm:text-base font-black text-slate-900 dark:text-white">
                      {req.name}
                    </span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      <span>Aguardando Análise</span>
                    </span>
                  </div>

                  <div className="space-y-1.5 text-xs text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xs">
                    <div className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300 font-medium">
                      <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="font-semibold text-slate-900 dark:text-white truncate">{req.email}</span>
                    </div>
                    {req.cargo && (
                      <div className="text-slate-600 dark:text-slate-400">
                        Cargo / Função: <strong className="text-slate-800 dark:text-slate-200">{req.cargo}</strong>
                      </div>
                    )}
                    {req.matricula && (
                      <div className="font-mono text-[11px] text-slate-500">
                        Matrícula Funcional: <strong className="text-slate-700 dark:text-slate-300">{req.matricula}</strong>
                      </div>
                    )}
                    {req.setor && (
                      <div className="text-[11px] text-slate-500 truncate">
                        Setor: {req.setor}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => handleReject(req)}
                    className="px-3.5 py-2 rounded-xl text-xs font-bold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 transition cursor-pointer flex items-center gap-1.5"
                    title="Reprovar solicitação de acesso"
                  >
                    <UserX className="w-3.5 h-3.5" />
                    <span>Reprovar</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleOpenApproveModal(req)}
                    className="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition cursor-pointer flex items-center gap-1.5"
                    title="Aprovar solicitação, liberar acesso e disparar e-mail com instruções"
                  >
                    <UserCheck className="w-4 h-4" />
                    <span>Aprovar e Liberar Acesso</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ===================================================================== */}
      {/* MODAL: CRIAR NOVO USUÁRIO */}
      {/* ===================================================================== */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden my-auto animate-in fade-in zoom-in duration-200">
            <div className="bg-purple-950/30 text-white p-5 sm:p-6 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-purple-600 text-white flex items-center justify-center font-bold">
                  <UserPlus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    Novo Usuário do Sistema
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    CSB / SEMA-MT · Atribuição de Perfil e Senha Temporária Segura
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="p-5 sm:p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Nome Completo *
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  placeholder="ex: Dr. João da Silva"
                  className="w-full text-xs sm:text-sm px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950/60 text-slate-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  E-mail Institucional *
                </label>
                <input
                  type="email"
                  required
                  value={formData.email}
                  onChange={e => setFormData({ ...formData, email: e.target.value })}
                  placeholder="fiscal@sema.mt.gov.br"
                  className="w-full text-xs sm:text-sm px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950/60 text-slate-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:outline-hidden"
                />
              </div>

              {/* Seleção do Perfil (Três Perfis Requisitados) */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                  Perfil de Acesso do Usuário *
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {/* Administrador */}
                  <label className={`p-3 rounded-xl border cursor-pointer flex flex-col justify-between transition-all ${
                    formData.role === 'administrador'
                      ? 'bg-purple-50 dark:bg-purple-950/40 border-purple-500 text-purple-900 dark:text-purple-200 ring-2 ring-purple-500/30'
                      : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40 text-slate-700 dark:text-slate-300'
                  }`}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-xs">Administrador</span>
                      <input
                        type="radio"
                        name="createRole"
                        checked={formData.role === 'administrador'}
                        onChange={() => setFormData({ ...formData, role: 'administrador' })}
                        className="text-purple-600 focus:ring-purple-500"
                      />
                    </div>
                    <span className="text-[10px] text-slate-500 dark:text-slate-400">
                      Acesso irrestrito a todas as fichas e aos usuários.
                    </span>
                  </label>

                  {/* Analista */}
                  <label className={`p-3 rounded-xl border cursor-pointer flex flex-col justify-between transition-all ${
                    formData.role === 'analista'
                      ? 'bg-blue-50 dark:bg-blue-950/40 border-blue-500 text-blue-900 dark:text-blue-200 ring-2 ring-blue-500/30'
                      : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40 text-slate-700 dark:text-slate-300'
                  }`}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-xs">Analista</span>
                      <input
                        type="radio"
                        name="createRole"
                        checked={formData.role === 'analista'}
                        onChange={() => setFormData({ ...formData, role: 'analista' })}
                        className="text-blue-600 focus:ring-blue-500"
                      />
                    </div>
                    <span className="text-[10px] text-slate-500 dark:text-slate-400">
                      Edita/exclui apenas fichas próprias ou da sua equipe.
                    </span>
                  </label>

                  {/* Visualizador */}
                  <label className={`p-3 rounded-xl border cursor-pointer flex flex-col justify-between transition-all ${
                    formData.role === 'visualizador'
                      ? 'bg-slate-100 dark:bg-slate-800 border-slate-500 text-slate-900 dark:text-white ring-2 ring-slate-500/30'
                      : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40 text-slate-700 dark:text-slate-300'
                  }`}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-xs">Visualizador</span>
                      <input
                        type="radio"
                        name="createRole"
                        checked={formData.role === 'visualizador'}
                        onChange={() => setFormData({ ...formData, role: 'visualizador' })}
                        className="text-slate-600 focus:ring-slate-500"
                      />
                    </div>
                    <span className="text-[10px] text-slate-500 dark:text-slate-400">
                      Apenas consulta informações (somente leitura).
                    </span>
                  </label>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Cargo / Função Técnica
                  </label>
                  <input
                    type="text"
                    value={formData.cargo}
                    onChange={e => setFormData({ ...formData, cargo: e.target.value })}
                    placeholder="ex: Engenheiro Civil / Fiscal"
                    className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950/60 text-slate-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Matrícula Funcional
                  </label>
                  <input
                    type="text"
                    value={formData.matricula}
                    onChange={e => setFormData({ ...formData, matricula: e.target.value })}
                    placeholder="ex: CSB-015"
                    className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950/60 text-slate-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:outline-hidden"
                  />
                </div>
              </div>

              <div className="p-3 rounded-xl bg-purple-50/60 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-900/50 text-[11px] text-purple-900 dark:text-purple-300 space-y-1">
                <div className="font-bold flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Geração de Senha Temporária Criptográfica</span>
                </div>
                <p className="text-purple-700 dark:text-purple-400">
                  Uma senha aleatória única (12 caracteres) será gerada via WebCrypto e exibida apenas uma vez para entrega segura ao fiscal, que deverá alterá-la no primeiro acesso.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl text-xs font-bold bg-purple-600 hover:bg-purple-700 text-white shadow-xs transition"
                >
                  Cadastrar Usuário
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL: EDITAR USUÁRIO */}
      {/* ===================================================================== */}
      {editingUser && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden my-auto animate-in fade-in zoom-in duration-200">
            <div className="bg-slate-100 dark:bg-slate-800/80 p-5 sm:p-6 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-blue-600 text-white flex items-center justify-center font-bold">
                  <Edit3 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    Editar Usuário
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {editingUser.email}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingUser(null)}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="p-5 sm:p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Nome Completo *
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  className="w-full text-xs sm:text-sm px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950/60 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                />
              </div>

              {/* Seleção de Perfil */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                  Perfil de Acesso *
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <label className={`p-3 rounded-xl border cursor-pointer flex flex-col justify-between transition-all ${
                    formData.role === 'administrador'
                      ? 'bg-purple-50 dark:bg-purple-950/40 border-purple-500 text-purple-900 dark:text-purple-200 ring-2 ring-purple-500/30'
                      : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40 text-slate-700 dark:text-slate-300'
                  }`}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-xs">Administrador</span>
                      <input
                        type="radio"
                        name="editRole"
                        checked={formData.role === 'administrador'}
                        onChange={() => setFormData({ ...formData, role: 'administrador' })}
                      />
                    </div>
                    <span className="text-[10px] text-slate-500">Acesso irrestrito</span>
                  </label>

                  <label className={`p-3 rounded-xl border cursor-pointer flex flex-col justify-between transition-all ${
                    formData.role === 'analista'
                      ? 'bg-blue-50 dark:bg-blue-950/40 border-blue-500 text-blue-900 dark:text-blue-200 ring-2 ring-blue-500/30'
                      : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40 text-slate-700 dark:text-slate-300'
                  }`}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-xs">Analista</span>
                      <input
                        type="radio"
                        name="editRole"
                        checked={formData.role === 'analista'}
                        onChange={() => setFormData({ ...formData, role: 'analista' })}
                      />
                    </div>
                    <span className="text-[10px] text-slate-500">Próprias/Equipe</span>
                  </label>

                  <label className={`p-3 rounded-xl border cursor-pointer flex flex-col justify-between transition-all ${
                    formData.role === 'visualizador'
                      ? 'bg-slate-100 dark:bg-slate-800 border-slate-500 text-slate-900 dark:text-white ring-2 ring-slate-500/30'
                      : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40 text-slate-700 dark:text-slate-300'
                  }`}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-xs">Visualizador</span>
                      <input
                        type="radio"
                        name="editRole"
                        checked={formData.role === 'visualizador'}
                        onChange={() => setFormData({ ...formData, role: 'visualizador' })}
                      />
                    </div>
                    <span className="text-[10px] text-slate-500">Somente leitura</span>
                  </label>
                </div>
              </div>

              {/* Status */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Status da Conta
                </label>
                <select
                  value={formData.status}
                  onChange={e => setFormData({ ...formData, status: e.target.value as UserStatus })}
                  className="w-full text-xs sm:text-sm px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950/60 text-slate-900 dark:text-white"
                >
                  <option value="ativo">Ativo (Acesso Liberado)</option>
                  <option value="inativo">Inativo (Acesso Suspenso)</option>
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Cargo / Função Técnica
                  </label>
                  <input
                    type="text"
                    value={formData.cargo}
                    onChange={e => setFormData({ ...formData, cargo: e.target.value })}
                    className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950/60 text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Matrícula Funcional
                  </label>
                  <input
                    type="text"
                    value={formData.matricula}
                    onChange={e => setFormData({ ...formData, matricula: e.target.value })}
                    className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950/60 text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-xs transition"
                >
                  Salvar Alterações
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL DE CONFIRMAÇÃO DE AÇÃO ADMINISTRATIVA                           */}
      {/* ===================================================================== */}
      {pendingConfirm && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-md shadow-2xl p-5 sm:p-6 space-y-4">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              {pendingConfirm.title}
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              {pendingConfirm.message}
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={isConfirmingAction}
                onClick={() => setPendingConfirm(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isConfirmingAction}
                onClick={async () => {
                  setIsConfirmingAction(true);
                  try {
                    await pendingConfirm.onConfirm();
                  } finally {
                    setIsConfirmingAction(false);
                    setPendingConfirm(null);
                  }
                }}
                className={`px-4 py-2 rounded-xl text-xs font-bold text-white shadow-xs cursor-pointer disabled:opacity-50 ${
                  pendingConfirm.danger
                    ? 'bg-rose-600 hover:bg-rose-700'
                    : 'bg-purple-600 hover:bg-purple-700'
                }`}
              >
                {isConfirmingAction ? 'Processando...' : pendingConfirm.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL: APROVAÇÃO DE SOLICITAÇÃO DE ACESSO */}
      {/* ===================================================================== */}
      {approvalModalUser && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden my-auto animate-in fade-in zoom-in duration-200">
            <div className="bg-emerald-950/40 text-white p-5 sm:p-6 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-600 text-white flex items-center justify-center font-bold">
                  <UserCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    Aprovar Solicitação de Acesso
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Defina o perfil de acesso e homologue a conta do fiscal
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setApprovalModalUser(null)}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 sm:p-6 space-y-4">
              {/* Resumo do Usuário Solicitante */}
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 space-y-1.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-900 dark:text-white text-sm">
                    {approvalModalUser.name}
                  </span>
                  {approvalModalUser.matricula && (
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                      Matrícula: {approvalModalUser.matricula}
                    </span>
                  )}
                </div>
                <div className="text-slate-600 dark:text-slate-400 space-y-0.5">
                  <div>E-mail: <strong className="text-slate-900 dark:text-white">{approvalModalUser.email}</strong></div>
                  <div>Cargo: <strong className="text-slate-900 dark:text-white">{approvalModalUser.cargo || 'Fiscal Técnico CSB'}</strong></div>
                </div>
              </div>

              {/* Escolha do Perfil de Acesso */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  Atribuir Perfil de Acesso ao Fiscal *
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(['analista', 'administrador', 'visualizador'] as const).map(role => (
                    <button
                      key={role}
                      type="button"
                      onClick={() => setApprovalRole(role)}
                      className={`p-2.5 rounded-xl text-xs font-bold capitalize border transition-all cursor-pointer text-center ${
                        approvalRole === role
                          ? 'bg-purple-600 text-white border-purple-600 shadow-xs'
                          : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      {role}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5">
                  {approvalRole === 'analista' && 'Analista: preenche e edita vistorias próprias ou nas quais participe na equipe.'}
                  {approvalRole === 'administrador' && 'Administrador: acesso total irrestrito a todas as vistorias e à gestão de usuários.'}
                  {approvalRole === 'visualizador' && 'Visualizador: somente visualização e relatórios, sem permissão de edição.'}
                </p>
              </div>

              {/* Informação do Disparo do E-mail */}
              <div className="p-3.5 rounded-2xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/60 text-xs text-blue-900 dark:text-blue-300 space-y-1">
                <div className="font-bold flex items-center gap-1.5">
                  <Send className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                  <span>Disparo de E-mail de Acesso Liberado</span>
                </div>
                <p className="text-[11px] text-blue-800 dark:text-blue-300/90 leading-relaxed">
                  Ao confirmar, o acesso será homologado e uma notificação oficial será disparada com os dados do usuário, link de login e orientações institucionais.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setApprovalModalUser(null)}
                  className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleConfirmApproval}
                  className="px-5 py-2.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition cursor-pointer flex items-center gap-2"
                >
                  <UserCheck className="w-4 h-4" />
                  <span>Aprovar e Disparar E-mail</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL: PREVIEW E DISPARO DO E-MAIL OFICIAL DE LIBERAÇÃO */}
      {/* ===================================================================== */}
      {emailModalData && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-xl shadow-2xl overflow-hidden my-auto animate-in fade-in zoom-in duration-200">
            <div className="bg-emerald-600 text-white p-5 sm:p-6 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-white/20 text-white flex items-center justify-center font-bold">
                  <Mail className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">
                    E-mail de Notificação de Acesso Liberado
                  </h3>
                  <p className="text-xs text-emerald-100">
                    Notificação gerada para {emailModalData.payload.to}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEmailModalData(null)}
                className="p-2 rounded-xl text-white/80 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 sm:p-6 space-y-4 text-xs">
              <div className="space-y-1.5 p-3 rounded-xl bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800">
                <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
                  <span><strong>Destinatário:</strong> {emailModalData.payload.to}</span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
                    Acesso Ativo
                  </span>
                </div>
                <div className="text-slate-700 dark:text-slate-300">
                  <strong>Assunto:</strong> {emailModalData.payload.subject}
                </div>
              </div>

              {/* Corpo Formatado do E-mail */}
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 font-mono text-xs whitespace-pre-line leading-relaxed max-h-60 overflow-y-auto">
                {emailModalData.payload.body}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(emailModalData.payload.body);
                    setCopiedEmailText(true);
                    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
                    copyTimerRef.current = setTimeout(() => setCopiedEmailText(false), 2500);
                  }}
                  className="px-3.5 py-2 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 transition cursor-pointer flex items-center gap-1.5"
                >
                  {copiedEmailText ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                  <span>{copiedEmailText ? 'Texto Copiado!' : 'Copiar Texto do E-mail'}</span>
                </button>

                <div className="flex items-center gap-2">
                  <a
                    href={emailModalData.payload.mailtoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3.5 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white transition cursor-pointer flex items-center gap-1.5"
                  >
                    <ExternalLink className="w-4 h-4" />
                    <span>Abrir no Cliente de E-mail</span>
                  </a>

                  <button
                    type="button"
                    onClick={() => setEmailModalData(null)}
                    className="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition cursor-pointer"
                  >
                    Concluir
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* MODAL: EXIBIÇÃO ÚNICA DE SENHA TEMPORÁRIA GERADA */}
      {oneTimePwdModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-purple-300 dark:border-purple-800 rounded-3xl w-full max-w-md shadow-2xl p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-purple-600 text-white flex items-center justify-center shrink-0">
                <KeyRound className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">Senha Temporária de Uso Único</h3>
                <p className="text-xs text-slate-500">{oneTimePwdModal.userName} ({oneTimePwdModal.userEmail})</p>
              </div>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              Esta senha aleatória é exibida apenas agora e não fica armazenada em texto plano. Copie-a para enviar ao usuário e oriente a alteração imediata no primeiro acesso.
            </p>
            <div className="flex items-center justify-between gap-2 p-3 rounded-xl bg-slate-950 text-emerald-400 font-mono text-sm border border-slate-800">
              <span className="select-all">{oneTimePwdModal.tempPwd}</span>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(oneTimePwdModal.tempPwd);
                  setCopiedTempPwd(true);
                  if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
                  copyTimerRef.current = setTimeout(() => setCopiedTempPwd(false), 2500);
                }}
                className="px-2.5 py-1 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-sans font-bold flex items-center gap-1 cursor-pointer"
              >
                {copiedTempPwd ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedTempPwd ? 'Copiada!' : 'Copiar'}</span>
              </button>
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setOneTimePwdModal(null);
                  setCopiedTempPwd(false);
                }}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-800 text-white hover:bg-slate-700 cursor-pointer"
              >
                Entendido / Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
