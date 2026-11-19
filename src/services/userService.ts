// ==============================================================================
// ARQUIVO: src/services/userService.ts
// Serviço de Gestão de Usuários e Controle de Perfis de Acesso (RBAC)
// Coordenadoria de Segurança de Barragens - CSB / SEMA-MT
// Segurança Reforçada:
// - Sem usuários ou e-mails pessoais hardcoded no código-fonte
// - Sem senhas padrão estáticas, sem geração local de senha temporária e sem hash local
// - Sem cadastro, solicitação de acesso ou alteração em perfis_usuarios pelo navegador
// - Provisionamento, aprovação, redefinição de senha e gestão de perfis exigem
//   processo institucional seguro no servidor
// ==============================================================================

import { UserProfile, UserRole, UserStatus, InspectionData } from '../types/inspection';
import {
  ensureAuthenticatedSession,
  type SupabaseAuthDeps,
  purgeLegacyPlaintextCredentials
} from './supabase';

const USERS_EVENT = 'csb:users_updated';

export const USERS_LISTING_DISABLED_REASON =
  'Consulta e listagem de usuários (perfis_usuarios) pelo navegador estão desabilitadas por segurança até existir mecanismo seguro de autorização no servidor. Nenhum cache local é utilizado como alternativa.';

const BLOCKED_BROWSER_PROFILE_WRITE_ERROR =
  'Operação bloqueada por segurança: criação, alteração de perfil, aprovação, reprovação, inativação ou exclusão em perfis_usuarios pelo navegador exige endpoint administrativo seguro no servidor e políticas RLS verificáveis, ausentes neste ambiente. Realize a gestão por processo institucional seguro no servidor.';

const BLOCKED_ACCESS_REQUEST_ERROR =
  'Solicitação de acesso pelo navegador bloqueada por segurança: não há endpoint administrativo no servidor nem política RLS verificada para gravação em perfis_usuarios. Solicite o provisionamento da conta por processo institucional seguro da CSB/SEMA-MT, fora do navegador.';

const BLOCKED_PASSWORD_RESET_ERROR =
  'Operação bloqueada por segurança: a redefinição de senha exige mecanismo administrativo seguro no servidor vinculado ao Supabase Auth e não pode ser executada pelo navegador.';

async function guardUnsafeBrowserProfileMutation(
  deps?: SupabaseAuthDeps
): Promise<{ allowed: false; error: string }> {
  const sessionCheck = await ensureAuthenticatedSession(deps);
  if (!sessionCheck.authenticated || sessionCheck.role !== 'administrador') {
    return {
      allowed: false,
      error:
        'Acesso negado: esta operação exige sessão institucional ativa de Administrador validada no servidor e autorização administrativa server-side. Gravação direta pelo navegador bloqueada.'
    };
  }

  return {
    allowed: false,
    error: BLOCKED_BROWSER_PROFILE_WRITE_ERROR
  };
}

export function subscribeUsers(callback: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(USERS_EVENT, callback);
  return () => {
    window.removeEventListener(USERS_EVENT, callback);
  };
}

/**
 * Listagem direta de perfis_usuarios pelo navegador bloqueada por segurança:
 * não há mecanismo seguro de servidor comprovável para autorizar a consulta.
 * Não consulta perfis_usuarios pelo cliente Supabase nem utiliza cache local (localStorage).
 */
export async function getUsers(_deps?: SupabaseAuthDeps): Promise<UserProfile[]> {
  purgeLegacyPlaintextCredentials();
  return [];
}

/**
 * Consulta direta por e-mail em perfis_usuarios pelo navegador bloqueada por segurança.
 */
export async function getUserByEmail(
  _email: string,
  _deps?: SupabaseAuthDeps
): Promise<UserProfile | null> {
  purgeLegacyPlaintextCredentials();
  return null;
}

/**
 * Bloqueado no navegador: criação direta de usuário/perfil exige autorização e provisionamento seguro no servidor.
 */
export async function createUser(
  _data: Omit<UserProfile, 'id' | 'createdAt' | 'updatedAt'> & { initialPassword?: string },
  deps?: SupabaseAuthDeps
): Promise<{ success: boolean; user?: UserProfile; error?: string }> {
  const guard = await guardUnsafeBrowserProfileMutation(deps);
  return { success: false, error: guard.error };
}

/**
 * Bloqueado no navegador: alteração de perfil/privilégios exige endpoint de servidor e RLS verificável.
 */
export async function updateUser(
  _id: string,
  _updates: Partial<UserProfile>,
  deps?: SupabaseAuthDeps
): Promise<{ success: boolean; error?: string }> {
  const guard = await guardUnsafeBrowserProfileMutation(deps);
  return { success: false, error: guard.error };
}

/**
 * Bloqueado no navegador: exclusão de usuário/perfil exige endpoint de servidor e RLS verificável.
 */
export async function deleteUser(
  _id: string,
  _currentAdminEmail?: string,
  deps?: SupabaseAuthDeps
): Promise<{ success: boolean; error?: string }> {
  const guard = await guardUnsafeBrowserProfileMutation(deps);
  return { success: false, error: guard.error };
}

/**
 * Bloqueado no navegador: ativação/inativação de conta exige endpoint de servidor e RLS verificável.
 */
export async function toggleUserStatus(
  _id: string,
  deps?: SupabaseAuthDeps
): Promise<{ success: boolean; newStatus?: UserStatus; error?: string }> {
  const guard = await guardUnsafeBrowserProfileMutation(deps);
  return { success: false, error: guard.error };
}

/**
 * Bloqueado no navegador: a redefinição de senha exige mecanismo seguro no servidor vinculado ao Supabase Auth.
 * Não gera nem armazena hashes ou senhas temporárias locais.
 */
export async function resetUserPasswordToDefault(
  _email: string,
  deps?: SupabaseAuthDeps
): Promise<{ success: boolean; error?: string }> {
  const sessionCheck = await ensureAuthenticatedSession(deps);
  if (!sessionCheck.authenticated || sessionCheck.role !== 'administrador') {
    return {
      success: false,
      error:
        'Acesso negado: a redefinição de senha exige sessão institucional ativa de Administrador validada no servidor e mecanismo seguro no servidor.'
    };
  }

  return {
    success: false,
    error: BLOCKED_PASSWORD_RESET_ERROR
  };
}

export interface ApprovalEmailPayload {
  to: string;
  subject: string;
  body: string;
  mailtoUrl: string;
}

/**
 * Bloqueado no navegador: solicitação prévia de acesso pelo navegador não possui endpoint/RLS seguro verificado.
 * Não executa auth.signUp nem grava em perfis_usuarios ou localStorage.
 */
export async function requestUserAccess(
  _data: {
    name: string;
    email: string;
    cargo: string;
    matricula: string;
    password: string;
  },
  _deps?: SupabaseAuthDeps
): Promise<{ success: boolean; user?: UserProfile; error?: string; message?: string }> {
  return {
    success: false,
    error: BLOCKED_ACCESS_REQUEST_ERROR
  };
}

export async function approveUserAccess(
  _id: string,
  _role: UserRole = 'analista',
  _approvedByEmail?: string,
  deps?: SupabaseAuthDeps
): Promise<{ success: boolean; user?: UserProfile; emailPayload?: ApprovalEmailPayload; error?: string }> {
  const guard = await guardUnsafeBrowserProfileMutation(deps);
  return { success: false, error: guard.error };
}

export async function rejectUserAccess(
  _id: string,
  _reason?: string,
  deps?: SupabaseAuthDeps
): Promise<{ success: boolean; error?: string }> {
  const guard = await guardUnsafeBrowserProfileMutation(deps);
  return { success: false, error: guard.error };
}

// ==============================================================================
// HELPERS DE REGRAS DE ACESSO (RBAC) E PERMISSÕES
// ==============================================================================

export function canUserManageUsers(role?: string): boolean {
  if (!role) return false;
  const r = role.toLowerCase();
  return r === 'administrador' || r === 'admin';
}

export function canUserCreateInspection(role?: string): boolean {
  if (!role) return false;
  const r = role.toLowerCase();
  return r !== 'visualizador';
}

export function canUserEditInspection(
  currentUser: { email?: string; fullName?: string; role?: string; id?: string } | null,
  inspection: InspectionData
): { allowed: boolean; reason?: string } {
  if (!currentUser || !currentUser.email) {
    return { allowed: false, reason: 'Usuário não autenticado.' };
  }

  const role = (currentUser.role || 'analista').toLowerCase();

  if (role === 'administrador' || role === 'admin') {
    return { allowed: true };
  }

  if (role === 'visualizador') {
    return {
      allowed: false,
      reason: 'Perfil Visualizador: Acesso somente leitura. Modificações em fichas e fotos não são permitidas.'
    };
  }

  const userEmail = currentUser.email.trim().toLowerCase();
  const userName = (currentUser.fullName || '').trim().toLowerCase();

  if (inspection.createdByEmail && inspection.createdByEmail.trim().toLowerCase() === userEmail) {
    return { allowed: true };
  }
  if (inspection.createdByUserId && currentUser.id && inspection.createdByUserId === currentUser.id) {
    return { allowed: true };
  }

  if (
    !inspection.createdByEmail &&
    !inspection.generalInfo?.recordNumber &&
    !inspection.damIdentification?.damName
  ) {
    return { allowed: true };
  }

  const inspectors = inspection.generalInfo?.inspectors || [];
  const isInTeam = inspectors.some(insp => {
    const inspName = (insp.name || '').trim().toLowerCase();
    if (inspName && userName && (inspName.includes(userName) || userName.includes(inspName))) {
      return true;
    }
    return false;
  });

  if (isInTeam) {
    return { allowed: true };
  }

  const ownerLabel =
    inspection.createdByName || inspection.createdByEmail || inspectors[0]?.name || 'outro analista';
  return {
    allowed: false,
    reason: `Ficha criada por ${ownerLabel}. Como Analista, você só possui permissão de edição em vistorias próprias ou das quais participe na equipe técnica.`
  };
}

export function canUserDeleteInspection(
  currentUser: { email?: string; fullName?: string; role?: string; id?: string } | null,
  inspection: InspectionData
): { allowed: boolean; reason?: string } {
  return canUserEditInspection(currentUser, inspection);
}
