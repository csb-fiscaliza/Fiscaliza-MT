// ==============================================================================
// ARQUIVO: src/components/UsersManagementStep.tsx
// Módulo de Usuários e Perfis de Acesso (RBAC)
// Exclusivo para Administrador Verificado no Servidor - CSB / SEMA-MT
// Consulta de perfis_usuarios desabilitada até existir mecanismo seguro no servidor
// ==============================================================================

import React, { useState, useEffect } from 'react';
import {
  Users,
  ShieldAlert,
  ArrowLeft,
  Info,
  Lock
} from 'lucide-react';
import { ensureAuthenticatedSession, type SupabaseAuthDeps } from '../services/supabase';
import { USERS_LISTING_DISABLED_REASON } from '../services/userService';

interface UsersManagementStepProps {
  currentUser?: { email?: string; fullName?: string; role?: string; id?: string } | null;
  onGoToDashboard: () => void;
  deps?: SupabaseAuthDeps;
}

export const UsersManagementStep: React.FC<UsersManagementStepProps> = ({
  onGoToDashboard,
  deps
}) => {
  const [authStatus, setAuthStatus] = useState<'checking' | 'authorized' | 'denied'>('checking');

  useEffect(() => {
    let active = true;

    const verifyAdminAccess = async () => {
      try {
        const sessionCheck = await ensureAuthenticatedSession(deps);
        if (!active) return;

        if (!sessionCheck.authenticated || sessionCheck.role !== 'administrador') {
          setAuthStatus('denied');
          return;
        }

        setAuthStatus('authorized');
      } catch {
        if (active) {
          setAuthStatus('denied');
        }
      }
    };

    verifyAdminAccess();

    return () => {
      active = false;
    };
  }, [deps]);

  if (authStatus === 'checking') {
    return (
      <div className="max-w-4xl mx-auto py-16 px-4 text-center">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-8 max-w-md mx-auto shadow-xl">
          <div className="w-16 h-16 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center mx-auto mb-4">
            <Lock className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
            Acesso Restrito ao Administrador
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-6">
            Validando sessão institucional e perfil ativo de Administrador no servidor antes de exibir o módulo de governança de acessos.
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

  if (authStatus === 'denied') {
    return (
      <div className="max-w-4xl mx-auto py-16 px-4 text-center">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-8 max-w-md mx-auto shadow-xl">
          <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center mx-auto mb-4">
            <ShieldAlert className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
            Acesso Restrito ao Administrador
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-6">
            O módulo de Gestão de Usuários é reservado exclusivamente para sessões ativas de Administrador verificadas no servidor pela CSB/SEMA-MT.
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
          <div className="flex flex-wrap items-center gap-2">
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
              <span>Governança de Usuários & Perfis (RBAC)</span>
            </h2>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30 uppercase tracking-wider">
              Consulta Desabilitada
            </span>
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-400 pl-8">
            Módulo protegido da CSB/SEMA-MT sem leitura direta de perfis pelo navegador.
          </p>
        </div>
      </div>

      {/* Aviso Principal: Consulta de Usuários Desabilitada até Mecanismo Seguro no Servidor */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border-2 border-amber-300 dark:border-amber-700/80 p-6 sm:p-8 shadow-xs space-y-4">
        <div className="flex items-start gap-3.5">
          <div className="w-11 h-11 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
            <Lock className="w-5 h-5" />
          </div>
          <div className="space-y-2">
            <h3 className="text-sm sm:text-base font-black text-slate-900 dark:text-white uppercase tracking-tight">
              Consulta de Usuários Desabilitada no Navegador
            </h3>
            <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
              {USERS_LISTING_DISABLED_REASON}
            </p>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              Contagens, solicitações pendentes, cadastro, aprovação, reprovação, edição de perfis, ativação/inativação, exclusão e redefinição de senha exigem mecanismo administrativo seguro no servidor e não utilizam cache ou armazenamento local do navegador como fonte alternativa.
            </p>
          </div>
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
              Administrador
            </span>
            <span>Acesso integral às vistorias, sincronização e auditoria. Listagem e gestão de usuários ocorrem exclusivamente via mecanismo seguro no servidor.</span>
          </div>
          <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-blue-200/80 dark:border-blue-900/40">
            <span className="font-bold text-blue-700 dark:text-blue-400 block mb-1">
              Analista
            </span>
            <span>Preenche e edita/exclui <strong>exclusivamente</strong> as fichas criadas por ele mesmo ou em que esteja elencado na equipe técnica.</span>
          </div>
          <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <span className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
              Visualizador
            </span>
            <span>Acesso estrito de consulta aos painéis, fichas, fotos, medições e minutas geradas. Não possui permissão de edição ou exclusão.</span>
          </div>
        </div>
      </div>
    </div>
  );
};
