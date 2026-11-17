// ==============================================================================
// ARQUIVO: src/services/userService.ts
// Serviço de Gestão de Usuários e Controle de Perfis de Acesso (RBAC)
// Coordenadoria de Segurança de Barragens - CSB / SEMA-MT
// Segurança Reforçada:
// - Sem usuários ou e-mails pessoais hardcoded no código-fonte
// - Sem senhas padrão estáticas e sem gravação de senha em texto plano
// - Fluxo de Bootstrap Seguro do Primeiro Administrador + senhas temporárias
//   geradas aleatoriamente via crypto.getRandomValues e armazenadas em PBKDF2
// ==============================================================================

import { UserProfile, UserRole, UserStatus, InspectionData } from '../types/inspection';
import {
  supabase,
  storeSecureLocalPasswordHash,
  purgeLegacyPlaintextCredentials
} from './supabase';
import {
  generateSecureTemporaryPassword,
  validatePasswordStrength
} from '../utils/securityCrypto';

const USERS_STORAGE_KEY = 'fiscaliza_csb_users_catalog_v1';
const USERS_EVENT = 'csb:users_updated';

function generateUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    try {
      return crypto.randomUUID();
    } catch {}
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function emitUsersUpdated() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(USERS_EVENT));
  }
}

export function subscribeUsers(callback: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(USERS_EVENT, callback);
  return () => {
    window.removeEventListener(USERS_EVENT, callback);
  };
}

/**
 * Carrega a lista de usuários cadastrados sem nenhuma inserção automática de contas hardcoded
 */
export async function getUsers(): Promise<UserProfile[]> {
  purgeLegacyPlaintextCredentials();
  let localUsers: UserProfile[] = [];

  try {
    const raw = localStorage.getItem(USERS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        localUsers = parsed;
      }
    }
  } catch (e) {
    console.warn('[Users] Erro ao ler catálogo local de usuários:', e);
  }

  // Expurga eventuais contas de exemplo herdadas
  const LEGACY_EXAMPLE_EMAILS = [
    'marcos.engenheiro@sema.mt.gov.br',
    'auditoria.gestao@sema.mt.gov.br'
  ];
  localUsers = localUsers.filter(
    u =>
      u?.email &&
      !LEGACY_EXAMPLE_EMAILS.includes(u.email.toLowerCase()) &&
      !u.name?.toLowerCase().includes('marcos vinícius') &&
      !u.name?.toLowerCase().includes('camila nogueira')
  );

  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('perfis_usuarios')
        .select('*')
        .order('created_at', { ascending: false });

      if (!error && data && data.length > 0) {
        const remoteUsers: UserProfile[] = data.map((item: any) => ({
          id: item.id || item.user_id,
          email: item.email,
          name: item.nome || item.name || item.email.split('@')[0],
          role: (item.perfil || item.role || 'analista') as UserRole,
          status: (item.status || 'ativo') as UserStatus,
          cargo: item.cargo,
          matricula: item.matricula,
          setor: item.setor,
          createdAt: item.created_at || new Date().toISOString(),
          updatedAt: item.updated_at || new Date().toISOString()
        }));

        const mergedMap = new Map<string, UserProfile>();
        localUsers.forEach(u => mergedMap.set(u.email.toLowerCase(), u));
        remoteUsers.forEach(u => {
          const local = mergedMap.get(u.email.toLowerCase());
          if (!local) {
            mergedMap.set(u.email.toLowerCase(), u);
          } else {
            mergedMap.set(u.email.toLowerCase(), {
              ...local,
              ...u,
              cargo: u.cargo || local.cargo,
              matricula: u.matricula || local.matricula,
              status: u.status || local.status
            });
          }
        });

        const merged = Array.from(mergedMap.values());
        localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(merged));
        return merged;
      }
    } catch {
      // Falha silenciosa em modo offline
    }
  }

  return localUsers;
}

/**
 * Verifica se já existe ao menos um Administrador ativo no sistema
 */
export async function hasAnyAdminUser(): Promise<boolean> {
  const users = await getUsers();
  return users.some(u => u.role === 'administrador' && u.status === 'ativo');
}

/**
 * Configura o primeiro Administrador do sistema de forma segura (somente permitido quando não há nenhum admin ativo)
 */
export async function bootstrapFirstAdmin(data: {
  name: string;
  email: string;
  cargo: string;
  matricula: string;
  password: string;
}): Promise<{ success: boolean; user?: UserProfile; error?: string }> {
  const alreadyHasAdmin = await hasAnyAdminUser();
  if (alreadyHasAdmin) {
    return {
      success: false,
      error: 'Já existe um Administrador configurado neste ambiente. Entre com sua conta ou solicite acesso.'
    };
  }

  const cleanEmail = data.email.trim().toLowerCase();
  if (!cleanEmail || !cleanEmail.includes('@')) {
    return { success: false, error: 'Informe um e-mail institucional válido.' };
  }
  if (!data.name.trim()) {
    return { success: false, error: 'Informe o nome completo do Administrador.' };
  }

  const strength = validatePasswordStrength(data.password);
  if (!strength.valid) {
    return { success: false, error: strength.reason };
  }

  const now = new Date().toISOString();
  const adminUser: UserProfile = {
    id: generateUUID(),
    email: cleanEmail,
    name: data.name.trim(),
    role: 'administrador',
    status: 'ativo',
    cargo: data.cargo.trim() || 'Coordenador(a) de Segurança de Barragens',
    matricula: data.matricula.trim() || 'CSB-001',
    setor: 'Coordenadoria de Segurança de Barragens - CSB/SURH/SEMA-MT',
    createdAt: now,
    updatedAt: now
  };

  await storeSecureLocalPasswordHash(cleanEmail, data.password);

  const users = await getUsers();
  const updated = [adminUser, ...users.filter(u => u.email.toLowerCase() !== cleanEmail)];
  localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(updated));

  if (supabase) {
    try {
      await supabase.auth.signUp({
        email: cleanEmail,
        password: data.password,
        options: {
          data: {
            full_name: adminUser.name,
            perfil: 'administrador',
            cargo: adminUser.cargo,
            matricula: adminUser.matricula
          }
        }
      });
      await supabase.from('perfis_usuarios').upsert({
        id: adminUser.id,
        email: adminUser.email,
        nome: adminUser.name,
        perfil: 'administrador',
        status: 'ativo',
        cargo: adminUser.cargo,
        matricula: adminUser.matricula,
        setor: adminUser.setor,
        created_at: now,
        updated_at: now
      });
    } catch (e) {
      console.warn('[Users] Bootstrap salvo localmente; aguardando conexão remota:', e);
    }
  }

  emitUsersUpdated();
  return { success: true, user: adminUser };
}

export async function getUserByEmail(email: string): Promise<UserProfile | null> {
  const users = await getUsers();
  const cleanEmail = email.trim().toLowerCase();
  return users.find(u => u.email.toLowerCase() === cleanEmail) || null;
}

/**
 * Cadastra um novo usuário com geração de senha temporária criptograficamente aleatória
 * (exibida uma única vez para o administrador repassar com segurança)
 */
export async function createUser(
  data: Omit<UserProfile, 'id' | 'createdAt' | 'updatedAt'> & { initialPassword?: string }
): Promise<{ success: boolean; user?: UserProfile; temporaryPassword?: string; error?: string }> {
  const cleanEmail = data.email.trim().toLowerCase();
  if (!cleanEmail || !cleanEmail.includes('@')) {
    return { success: false, error: 'O e-mail é obrigatório.' };
  }
  if (!data.name.trim()) {
    return { success: false, error: 'O nome completo é obrigatório.' };
  }

  const users = await getUsers();
  const existing = users.find(u => u.email.toLowerCase() === cleanEmail);
  if (existing) {
    return { success: false, error: 'Já existe um usuário cadastrado com este e-mail institucional.' };
  }

  const tempPassword =
    data.initialPassword && validatePasswordStrength(data.initialPassword).valid
      ? data.initialPassword
      : generateSecureTemporaryPassword(12);

  await storeSecureLocalPasswordHash(cleanEmail, tempPassword);

  const now = new Date().toISOString();
  const newUser: UserProfile = {
    id: generateUUID(),
    email: cleanEmail,
    name: data.name.trim(),
    role: data.role || 'analista',
    status: data.status || 'ativo',
    cargo: data.cargo?.trim() || 'Fiscal Técnico CSB',
    matricula: data.matricula?.trim() || 'CSB-' + Math.floor(100 + Math.random() * 900),
    setor: data.setor?.trim() || 'Coordenadoria de Segurança de Barragens - CSB/SEMA-MT',
    createdAt: now,
    updatedAt: now
  };

  const updatedList = [newUser, ...users];
  localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(updatedList));

  if (supabase) {
    try {
      await supabase.from('perfis_usuarios').upsert({
        id: newUser.id,
        email: newUser.email,
        nome: newUser.name,
        perfil: newUser.role,
        status: newUser.status,
        cargo: newUser.cargo,
        matricula: newUser.matricula,
        setor: newUser.setor,
        created_at: newUser.createdAt,
        updated_at: newUser.updatedAt
      });
    } catch (e) {
      console.warn('[Users] Falha ao persistir novo usuário no Supabase:', e);
    }
  }

  emitUsersUpdated();
  return { success: true, user: newUser, temporaryPassword: tempPassword };
}

/**
 * Edita dados de um usuário existente
 */
export async function updateUser(
  id: string,
  updates: Partial<UserProfile>
): Promise<{ success: boolean; error?: string }> {
  const users = await getUsers();
  const idx = users.findIndex(u => u.id === id);
  if (idx === -1) {
    return { success: false, error: 'Usuário não localizado no sistema.' };
  }

  const current = users[idx];
  const activeAdmins = users.filter(u => u.role === 'administrador' && u.status === 'ativo');

  if (
    current.role === 'administrador' &&
    activeAdmins.length <= 1 &&
    ((updates.role && updates.role !== 'administrador') || updates.status === 'inativo')
  ) {
    return {
      success: false,
      error: 'Não é possível remover ou inativar o único Administrador ativo do sistema.'
    };
  }

  const now = new Date().toISOString();
  const updatedUser: UserProfile = {
    ...current,
    ...updates,
    updatedAt: now
  };

  users[idx] = updatedUser;
  localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(users));

  if (supabase) {
    try {
      await supabase.from('perfis_usuarios').upsert({
        id: updatedUser.id,
        email: updatedUser.email,
        nome: updatedUser.name,
        perfil: updatedUser.role,
        status: updatedUser.status,
        cargo: updatedUser.cargo,
        matricula: updatedUser.matricula,
        setor: updatedUser.setor,
        updated_at: updatedUser.updatedAt
      });
    } catch (e) {
      console.warn('[Users] Falha ao sincronizar atualização no Supabase:', e);
    }
  }

  emitUsersUpdated();
  return { success: true };
}

/**
 * Exclui um usuário do sistema (protegendo último admin e auto-exclusão)
 */
export async function deleteUser(
  id: string,
  currentAdminEmail?: string
): Promise<{ success: boolean; error?: string }> {
  const users = await getUsers();
  const userToDelete = users.find(u => u.id === id);
  if (!userToDelete) {
    return { success: false, error: 'Usuário não encontrado.' };
  }

  if (currentAdminEmail && userToDelete.email.toLowerCase() === currentAdminEmail.toLowerCase()) {
    return {
      success: false,
      error: 'Você não pode excluir sua própria conta de administrador em uso.'
    };
  }

  const activeAdmins = users.filter(u => u.role === 'administrador' && u.status === 'ativo');
  if (userToDelete.role === 'administrador' && activeAdmins.length <= 1) {
    return {
      success: false,
      error: 'Não é possível excluir o único Administrador ativo do sistema.'
    };
  }

  const updatedList = users.filter(u => u.id !== id);
  localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(updatedList));

  if (supabase) {
    try {
      await supabase.from('perfis_usuarios').delete().eq('id', id);
    } catch (e) {
      console.warn('[Users] Falha ao excluir usuário no Supabase:', e);
    }
  }

  emitUsersUpdated();
  return { success: true };
}

/**
 * Alterna status do usuário (ativo / inativo)
 */
export async function toggleUserStatus(
  id: string
): Promise<{ success: boolean; newStatus?: UserStatus; error?: string }> {
  const users = await getUsers();
  const user = users.find(u => u.id === id);
  if (!user) {
    return { success: false, error: 'Usuário não encontrado.' };
  }

  const activeAdmins = users.filter(u => u.role === 'administrador' && u.status === 'ativo');
  if (user.role === 'administrador' && user.status === 'ativo' && activeAdmins.length <= 1) {
    return {
      success: false,
      error: 'Não é possível inativar o único Administrador ativo do sistema.'
    };
  }

  const newStatus: UserStatus = user.status === 'ativo' ? 'inativo' : 'ativo';
  const res = await updateUser(id, { status: newStatus });
  return {
    success: res.success,
    newStatus,
    error: res.error
  };
}

/**
 * Redefine a senha do usuário para uma nova senha temporária gerada aleatoriamente (nunca fixa)
 */
export async function resetUserPasswordToDefault(
  email: string
): Promise<{ success: boolean; temporaryPassword?: string; error?: string }> {
  const cleanEmail = email.trim().toLowerCase();
  try {
    const tempPassword = generateSecureTemporaryPassword(12);
    await storeSecureLocalPasswordHash(cleanEmail, tempPassword);
    return { success: true, temporaryPassword: tempPassword };
  } catch (err: any) {
    return { success: false, error: err.message || 'Falha ao redefinir senha do usuário.' };
  }
}

export interface ApprovalEmailPayload {
  to: string;
  subject: string;
  body: string;
  mailtoUrl: string;
}

/**
 * Gera os dados e o corpo do e-mail oficial de notificação de acesso liberado (sem expor senhas hardcoded)
 */
export function generateApprovalEmail(
  user: UserProfile,
  customAppUrl?: string,
  temporaryPassword?: string
): ApprovalEmailPayload {
  const appUrl =
    customAppUrl ||
    (typeof window !== 'undefined' ? window.location.origin : 'https://fiscaliza-csb-sema.web.app');
  const roleName =
    user.role === 'administrador'
      ? 'Administrador'
      : user.role === 'analista'
      ? 'Analista de Vistorias'
      : 'Visualizador Institucional';

  const subject = `[CSB/SEMA-MT] Acesso Liberado ao Sistema Fiscaliza MT - ${user.name}`;

  const pwdInstruction = temporaryPassword
    ? `2. Sua senha temporária de primeiro acesso é: ${temporaryPassword} (altere-a imediatamente após entrar no menu "Alterar Senha").`
    : '2. Utilize a senha forte cadastrada por você no momento da solicitação de acesso.';

  const body = `Olá, ${user.name}!

Sua solicitação de acesso ao FISCALIZA - Etapa de Campo (Sistema Oficial de Fiscalização de Segurança de Barragens - CSB/SEMA-MT) foi APROVADA pela Administração.

Dados do seu cadastro institucional:
• Nome Completo: ${user.name}
• E-mail: ${user.email}
• Cargo: ${user.cargo || 'Fiscal Técnico CSB'}
• Matrícula Funcional: ${user.matricula || 'N/A'}
• Perfil de Acesso: ${roleName}
• Status: Acesso Liberado / Ativo

Link de Acesso ao Sistema:
${appUrl}

Instruções de Acesso:
1. Acesse o link acima com o seu e-mail institucional (${user.email}).
${pwdInstruction}
3. Caso esqueça sua senha, solicite a um administrador a geração de uma nova senha temporária de uso único.

Atenciosamente,
Coordenadoria de Segurança de Barragens – CSB
Superintendência de Recursos Hídricos (SURH)
Secretaria de Estado de Meio Ambiente – SEMA-MT
Governo do Estado de Mato Grosso`;

  const mailtoUrl = `mailto:${encodeURIComponent(user.email)}?subject=${encodeURIComponent(
    subject
  )}&body=${encodeURIComponent(body)}`;

  return {
    to: user.email,
    subject,
    body,
    mailtoUrl
  };
}

/**
 * Solicitação Prévia de Acesso (Novo Fiscal) — exige senha própria forte definida pelo solicitante
 */
export async function requestUserAccess(data: {
  name: string;
  email: string;
  cargo: string;
  matricula: string;
  password: string;
}): Promise<{ success: boolean; user?: UserProfile; error?: string; message?: string }> {
  const cleanEmail = data.email.trim().toLowerCase();
  if (!cleanEmail || !cleanEmail.includes('@')) {
    return { success: false, error: 'O e-mail institucional válido é obrigatório.' };
  }
  if (!data.name.trim()) {
    return { success: false, error: 'O nome completo é obrigatório.' };
  }
  if (!data.cargo.trim()) {
    return { success: false, error: 'O cargo é obrigatório.' };
  }
  if (!data.matricula.trim()) {
    return { success: false, error: 'A matrícula funcional é obrigatória.' };
  }

  const strength = validatePasswordStrength(data.password);
  if (!strength.valid) {
    return { success: false, error: strength.reason };
  }

  const users = await getUsers();
  const existing = users.find(u => u.email.toLowerCase() === cleanEmail);
  if (existing) {
    if (existing.status === 'pendente') {
      return {
        success: false,
        error: 'Já existe uma solicitação de acesso em análise para este e-mail. Aguarde a avaliação de um Administrador.'
      };
    }
    if (existing.status === 'ativo') {
      return {
        success: false,
        error: 'Este e-mail já possui cadastro ativo no sistema. Por favor, acesse utilizando sua senha.'
      };
    }
  }

  await storeSecureLocalPasswordHash(cleanEmail, data.password);

  const now = new Date().toISOString();
  const newRequest: UserProfile = {
    id: generateUUID(),
    email: cleanEmail,
    name: data.name.trim(),
    role: 'analista',
    status: 'pendente',
    cargo: data.cargo.trim(),
    matricula: data.matricula.trim(),
    setor: 'Coordenadoria de Segurança de Barragens - CSB/SEMA-MT',
    createdAt: now,
    updatedAt: now,
    requestedAt: now
  };

  const updatedList = [newRequest, ...users.filter(u => u.email.toLowerCase() !== cleanEmail)];
  localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(updatedList));

  if (supabase) {
    try {
      await supabase.auth.signUp({
        email: cleanEmail,
        password: data.password,
        options: {
          data: {
            full_name: newRequest.name,
            cargo: newRequest.cargo,
            matricula: newRequest.matricula,
            perfil: 'analista'
          }
        }
      });

      const { error: insErr } = await supabase.from('perfis_usuarios').insert({
        id: newRequest.id,
        email: newRequest.email,
        nome: newRequest.name,
        perfil: newRequest.role,
        status: newRequest.status,
        cargo: newRequest.cargo,
        matricula: newRequest.matricula,
        setor: newRequest.setor,
        created_at: newRequest.createdAt,
        updated_at: newRequest.updatedAt
      });

      if (insErr && (insErr.code === '23505' || insErr.message?.includes('duplicate'))) {
        await supabase
          .from('perfis_usuarios')
          .update({
            nome: newRequest.name,
            status: 'pendente',
            cargo: newRequest.cargo,
            matricula: newRequest.matricula,
            updated_at: newRequest.updatedAt
          })
          .eq('email', newRequest.email);
      }
    } catch (e) {
      console.warn('[Users] Falha ao persistir solicitação no Supabase:', e);
    }
  }

  emitUsersUpdated();
  return {
    success: true,
    user: newRequest,
    message:
      'Solicitação de acesso enviada com sucesso! O cadastro foi encaminhado para análise de um Administrador da CSB/SEMA-MT.'
  };
}

export async function approveUserAccess(
  id: string,
  role: UserRole = 'analista',
  approvedByEmail?: string
): Promise<{ success: boolean; user?: UserProfile; emailPayload?: ApprovalEmailPayload; error?: string }> {
  const users = await getUsers();
  const idx = users.findIndex(u => u.id === id);
  if (idx === -1) {
    return { success: false, error: 'Solicitação de usuário não localizada.' };
  }

  const target = users[idx];
  const now = new Date().toISOString();

  const updatedUser: UserProfile = {
    ...target,
    role,
    status: 'ativo',
    approvedAt: now,
    approvedBy: approvedByEmail || 'Administrador CSB',
    updatedAt: now
  };

  users[idx] = updatedUser;
  localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(users));

  if (supabase) {
    try {
      const { error: updErr } = await supabase
        .from('perfis_usuarios')
        .update({
          perfil: updatedUser.role,
          status: 'ativo',
          cargo: updatedUser.cargo,
          matricula: updatedUser.matricula,
          setor: updatedUser.setor,
          updated_at: updatedUser.updatedAt
        })
        .eq('email', updatedUser.email);

      if (updErr) {
        await supabase.from('perfis_usuarios').upsert({
          id: updatedUser.id,
          email: updatedUser.email,
          nome: updatedUser.name,
          perfil: updatedUser.role,
          status: 'ativo',
          cargo: updatedUser.cargo,
          matricula: updatedUser.matricula,
          setor: updatedUser.setor,
          updated_at: updatedUser.updatedAt
        });
      }
    } catch (e) {
      console.warn('[Users] Falha ao sincronizar aprovação no Supabase:', e);
    }
  }

  const emailPayload = generateApprovalEmail(updatedUser);

  emitUsersUpdated();
  return { success: true, user: updatedUser, emailPayload };
}

export async function rejectUserAccess(
  id: string,
  reason?: string
): Promise<{ success: boolean; error?: string }> {
  const users = await getUsers();
  const idx = users.findIndex(u => u.id === id);
  if (idx === -1) {
    return { success: false, error: 'Solicitação não localizada.' };
  }

  const now = new Date().toISOString();
  users[idx] = {
    ...users[idx],
    status: 'reprovado',
    rejectionReason: reason || 'Indeferido pela Administração',
    updatedAt: now
  };

  localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(users));

  if (supabase) {
    try {
      await supabase
        .from('perfis_usuarios')
        .update({
          status: 'reprovado',
          updated_at: now
        })
        .eq('id', users[idx].id);
    } catch (e) {
      console.warn('[Users] Falha ao atualizar reprovação remota:', e);
    }
  }

  emitUsersUpdated();
  return { success: true };
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
