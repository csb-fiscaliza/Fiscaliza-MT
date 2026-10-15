// ==============================================================================
// ARQUIVO: src/services/userService.ts
// Serviço de Gestão de Usuários e Controle de Perfis de Acesso (RBAC)
// Coordenadoria de Segurança de Barragens - CSB / SEMA-MT
// Suporta 3 Perfis: Administrador, Analista e Visualizador
// Sincronização Local Persistente + Banco Supabase
// ==============================================================================

import { UserProfile, UserRole, UserStatus, InspectionData } from '../types/inspection';
import { supabase } from './supabase';

const USERS_STORAGE_KEY = 'fiscaliza_csb_users_catalog_v1';
const USERS_EVENT = 'csb:users_updated';

// Usuários iniciais padrão do sistema CSB/SEMA-MT
const INITIAL_USERS: UserProfile[] = [
  {
    id: 'usr-admin-yara-001',
    email: 'yarageologa@gmail.com',
    name: 'Yara Dias',
    role: 'administrador',
    status: 'ativo',
    cargo: 'Coordenadora de Segurança de Barragens',
    matricula: 'CSB-001',
    setor: 'Coordenadoria de Segurança de Barragens - CSB/SURH/SEMA-MT',
    createdAt: '2026-01-10T08:00:00.000Z',
    updatedAt: '2026-10-14T12:00:00.000Z',
    lastLoginAt: '2026-10-14T14:30:00.000Z'
  },
  {
    id: 'usr-analista-marcos-002',
    email: 'marcos.engenheiro@sema.mt.gov.br',
    name: 'Marcos Vinícius Silva',
    role: 'analista',
    status: 'ativo',
    cargo: 'Engenheiro Civil - Fiscal de Campo',
    matricula: 'CSB-014',
    setor: 'Coordenadoria de Segurança de Barragens - CSB/SEMA-MT',
    createdAt: '2026-02-15T09:30:00.000Z',
    updatedAt: '2026-09-20T10:00:00.000Z'
  },
  {
    id: 'usr-vis-camila-003',
    email: 'auditoria.gestao@sema.mt.gov.br',
    name: 'Dra. Camila Nogueira',
    role: 'visualizador',
    status: 'ativo',
    cargo: 'Auditora Governamental / Analista de Meio Ambiente',
    matricula: 'SEMA-882',
    setor: 'Superintendência de Recursos Hídricos (SURH)',
    createdAt: '2026-03-01T14:00:00.000Z',
    updatedAt: '2026-08-10T11:20:00.000Z'
  }
];

function generateUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    try {
      return crypto.randomUUID();
    } catch {}
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * Carrega a lista de usuários com persistência resiliente
 */
export async function getUsers(): Promise<UserProfile[]> {
  let localUsers: UserProfile[] = [];

  try {
    const raw = localStorage.getItem(USERS_STORAGE_KEY);
    if (raw) {
      localUsers = JSON.parse(raw);
    }
  } catch (e) {
    console.warn('Erro ao ler usuários do armazenamento local:', e);
  }

  // Se estiver vazio, inicializa com os usuários sementes
  if (!localUsers || localUsers.length === 0) {
    localUsers = [...INITIAL_USERS];
    localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(localUsers));
  } else {
    // Garante que os usuários institucionais iniciais estejam presentes e Yara Dias seja sempre administradora
    INITIAL_USERS.forEach(initUser => {
      const exists = localUsers.some(u => u.email.toLowerCase() === initUser.email.toLowerCase());
      if (!exists) {
        localUsers.push(initUser);
      }
    });

    const yaraIdx = localUsers.findIndex(u => u.email.toLowerCase() === 'yarageologa@gmail.com');
    if (yaraIdx !== -1) {
      localUsers[yaraIdx].role = 'administrador';
      localUsers[yaraIdx].status = 'ativo';
    }
    localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(localUsers));
  }

  // Se Supabase estiver disponível, tenta buscar/sincronizar da tabela remota perfis_usuarios
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('perfis_usuarios')
        .select('*')
        .order('created_at', { ascending: false });

      if (!error && data && data.length > 0) {
        // Mapeia do esquema PostgreSQL para o frontend
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

        // Mescla com locais garantindo completude
        const mergedMap = new Map<string, UserProfile>();
        localUsers.forEach(u => mergedMap.set(u.email.toLowerCase(), u));
        remoteUsers.forEach(u => {
          const local = mergedMap.get(u.email.toLowerCase());
          if (!local) {
            mergedMap.set(u.email.toLowerCase(), u);
          } else {
            // Mescla preservando campos preenchidos
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
      // Falha silenciosa em caso de sem internet / offline
    }
  }

  return localUsers;
}

/**
 * Busca usuário específico por e-mail
 */
export async function getUserByEmail(email: string): Promise<UserProfile | null> {
  const users = await getUsers();
  const cleanEmail = email.trim().toLowerCase();
  return users.find(u => u.email.toLowerCase() === cleanEmail) || null;
}

/**
 * Cadastra um novo usuário no sistema
 */
export async function createUser(
  data: Omit<UserProfile, 'id' | 'createdAt' | 'updatedAt'>
): Promise<{ success: boolean; user?: UserProfile; error?: string }> {
  const cleanEmail = data.email.trim().toLowerCase();
  if (!cleanEmail) {
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

  const now = new Date().toISOString();
  const newUser: UserProfile = {
    ...data,
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

  // Garante a senha padrão institucional @12345 no banco local de credenciais
  try {
    const LOCAL_PWD_PREFIX = 'fiscaliza_csb_pwd_';
    localStorage.setItem(LOCAL_PWD_PREFIX + cleanEmail, '@12345');
  } catch {}

  // Tenta sincronizar com o Supabase se configurado
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
      console.warn('Falha ao persistir novo usuário no Supabase:', e);
    }
  }

  emitUsersUpdated();
  return { success: true, user: newUser };
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

  const now = new Date().toISOString();
  const current = users[idx];

  // Proteção: não permitir remover admin de Yara Dias
  if (current.email.toLowerCase() === 'yarageologa@gmail.com' && updates.role && updates.role !== 'administrador') {
    return { success: false, error: 'A usuária titular Yara Dias não pode ser desprovida do perfil de Administrador.' };
  }

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
      console.warn('Falha ao sincronizar atualização de usuário no Supabase:', e);
    }
  }

  emitUsersUpdated();
  return { success: true };
}

/**
 * Exclui um usuário do sistema
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

  // Proteção: não excluir Yara Dias
  if (userToDelete.email.toLowerCase() === 'yarageologa@gmail.com') {
    return { success: false, error: 'O usuário principal yarageologa@gmail.com não pode ser excluído.' };
  }

  // Proteção contra auto-exclusão do admin logado
  if (currentAdminEmail && userToDelete.email.toLowerCase() === currentAdminEmail.toLowerCase()) {
    return { success: false, error: 'Você não pode excluir sua própria conta de administrador em uso.' };
  }

  const updatedList = users.filter(u => u.id !== id);
  localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(updatedList));

  if (supabase) {
    try {
      await supabase.from('perfis_usuarios').delete().eq('id', id);
    } catch (e) {
      console.warn('Falha ao excluir usuário no Supabase:', e);
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

  if (user.email.toLowerCase() === 'yarageologa@gmail.com') {
    return { success: false, error: 'A usuária titular Yara Dias não pode ser inativada.' };
  }

  const newStatus: UserStatus = user.status === 'ativo' ? 'inativo' : 'ativo';
  return updateUser(id, { status: newStatus }).then(res => ({
    success: res.success,
    newStatus,
    error: res.error
  }));
}

/**
 * Redefine a senha do usuário para a senha institucional padrão
 */
export async function resetUserPasswordToDefault(
  email: string
): Promise<{ success: boolean; error?: string }> {
  const cleanEmail = email.trim().toLowerCase();
  try {
    const LOCAL_PWD_PREFIX = 'fiscaliza_csb_pwd_';
    localStorage.setItem(LOCAL_PWD_PREFIX + cleanEmail, '@12345');
    return { success: true };
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
 * Gera os dados e o corpo do e-mail oficial de notificação de acesso liberado
 */
export function generateApprovalEmail(user: UserProfile, customAppUrl?: string): ApprovalEmailPayload {
  const appUrl = customAppUrl || (typeof window !== 'undefined' ? window.location.origin : 'https://fiscaliza-csb-sema.web.app');
  const roleName = user.role === 'administrador' 
    ? 'Administrador' 
    : user.role === 'analista' 
    ? 'Analista de Vistorias' 
    : 'Visualizador Institucional';

  const subject = `[CSB/SEMA-MT] Acesso Liberado ao Sistema Fiscaliza MT - ${user.name}`;
  
  const body = `Olá, ${user.name}!

Sua solicitação de acesso prévio ao Fiscaliza MT (Sistema Oficial de Fiscalização de Segurança de Barragens - CSB/SEMA-MT) foi APROVADA pela Administração.

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
2. Utilize a sua senha cadastrada no momento da solicitação de acesso.
3. Caso esqueça a senha, solicite para algum administrador resetar, e informe a senha padrão @12345.

Atenciosamente,
Coordenadoria de Segurança de Barragens – CSB
Superintendência de Recursos Hídricos (SURH)
Secretaria de Estado de Meio Ambiente – SEMA-MT
Governo do Estado de Mato Grosso`;

  const mailtoUrl = `mailto:${encodeURIComponent(user.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

  return {
    to: user.email,
    subject,
    body,
    mailtoUrl
  };
}

/**
 * Solicitação Prévia de Acesso (Novo Fiscal)
 * Cadastra o fiscal com status 'pendente' para análise prévia do administrador
 */
export async function requestUserAccess(data: {
  name: string;
  email: string;
  cargo: string;
  matricula: string;
  password?: string;
}): Promise<{ success: boolean; user?: UserProfile; error?: string; message?: string }> {
  const cleanEmail = data.email.trim().toLowerCase();
  if (!cleanEmail) {
    return { success: false, error: 'O e-mail institucional é obrigatório.' };
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

  const now = new Date().toISOString();
  const initialPassword = (data.password && data.password.trim()) ? data.password.trim() : '@12345';

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

  // Salva credencial no storage local para quando o acesso for liberado
  try {
    const LOCAL_PWD_PREFIX = 'fiscaliza_csb_pwd_';
    localStorage.setItem(LOCAL_PWD_PREFIX + cleanEmail, initialPassword);
  } catch {}

  const updatedList = [newRequest, ...users.filter(u => u.email.toLowerCase() !== cleanEmail)];
  localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(updatedList));

  // Tenta sincronizar com o Supabase se disponível usando INSERT em conformidade com RLS
  if (supabase) {
    try {
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
      if (insErr) {
        if (insErr.code === '23505' || insErr.message?.includes('duplicate key') || insErr.message?.includes('unique')) {
          await supabase.from('perfis_usuarios').update({
            nome: newRequest.name,
            status: 'pendente',
            cargo: newRequest.cargo,
            matricula: newRequest.matricula,
            updated_at: newRequest.updatedAt
          }).eq('email', newRequest.email);
        } else {
          console.warn('Falha ao inserir solicitação no Supabase:', insErr);
        }
      }
    } catch (e) {
      console.warn('Falha ao persistir solicitação no Supabase:', e);
    }
  }

  emitUsersUpdated();
  return { 
    success: true, 
    user: newRequest,
    message: 'Solicitação de acesso enviada com sucesso! O cadastro foi encaminhado para análise da Administração da CSB/SEMA-MT. Aguarde a liberação do seu acesso.'
  };
}

/**
 * Aprova a solicitação prévia de acesso do usuário e gera o e-mail de notificação
 */
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
      console.warn('Falha ao sincronizar aprovação no Supabase:', e);
    }
  }

  const emailPayload = generateApprovalEmail(updatedUser);

  emitUsersUpdated();
  return { success: true, user: updatedUser, emailPayload };
}

/**
 * Reprova a solicitação de acesso do usuário
 */
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
      await supabase.from('perfis_usuarios').upsert({
        id: users[idx].id,
        status: 'reprovado',
        updated_at: now
      });
    } catch (e) {
      console.warn('Falha ao atualizar reprovação no Supabase:', e);
    }
  }

  emitUsersUpdated();
  return { success: true };
}

/**
 * Emite evento para que componentes reajam instantaneamente
 */
function emitUsersUpdated() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(USERS_EVENT));
  }
}

/**
 * Assina atualizações da lista de usuários
 */
export function subscribeUsers(callback: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(USERS_EVENT, callback);
  return () => {
    window.removeEventListener(USERS_EVENT, callback);
  };
}

// ==============================================================================
// HELPERS DE REGRAS DE ACESSO (RBAC) E PERMISSÕES
// ==============================================================================

/**
 * Verifica se o usuário tem privilégio de Administrador
 */
export function canUserManageUsers(role?: string): boolean {
  if (!role) return false;
  const r = role.toLowerCase();
  return r === 'administrador' || r === 'admin';
}

/**
 * Verifica se o usuário pode criar uma nova ficha de vistoria
 * Administrador: Sim
 * Analista: Sim
 * Visualizador: Não (somente leitura)
 */
export function canUserCreateInspection(role?: string): boolean {
  if (!role) return false;
  const r = role.toLowerCase();
  return r !== 'visualizador';
}

/**
 * Verifica se o usuário pode editar/preencher os dados de uma vistoria
 * - Administrador: Todos os acessos
 * - Analista: Apenas fichas criadas por ele mesmo OU que ele esteja na equipe
 * - Visualizador: Apenas visualização (somente leitura)
 */
export function canUserEditInspection(
  currentUser: { email?: string; fullName?: string; role?: string; id?: string } | null,
  inspection: InspectionData
): { allowed: boolean; reason?: string } {
  if (!currentUser || !currentUser.email) {
    return { allowed: false, reason: 'Usuário não autenticado.' };
  }

  const role = (currentUser.role || 'analista').toLowerCase();

  // 1. Administrador tem acesso total irrestrito
  if (role === 'administrador' || role === 'admin') {
    return { allowed: true };
  }

  // 2. Visualizador: somente leitura
  if (role === 'visualizador') {
    return {
      allowed: false,
      reason: 'Perfil Visualizador: Acesso somente leitura. Modificações em fichas e fotos não são permitidas.'
    };
  }

  // 3. Analista:
  // Podera preencher e editar/excluir as fichas criadas apenas por ele mesmo ou que ele esteja elencado na equipe que participou
  const userEmail = currentUser.email.trim().toLowerCase();
  const userName = (currentUser.fullName || '').trim().toLowerCase();

  // Caso A: Criador explícito da ficha
  if (inspection.createdByEmail && inspection.createdByEmail.trim().toLowerCase() === userEmail) {
    return { allowed: true };
  }
  if (inspection.createdByUserId && currentUser.id && inspection.createdByUserId === currentUser.id) {
    return { allowed: true };
  }

  // Caso B: Rascunho inicial novo sem autor registrado ainda
  if (!inspection.createdByEmail && !inspection.generalInfo?.recordNumber && !inspection.damIdentification?.damName) {
    return { allowed: true };
  }

  // Caso C: Elencado na equipe de fiscais técnicos da vistoria
  const inspectors = inspection.generalInfo?.inspectors || [];
  const isInTeam = inspectors.some(insp => {
    const inspName = (insp.name || '').trim().toLowerCase();
    const inspReg = (insp.registrationNumber || '').trim().toLowerCase();
    if (inspName && userName && (inspName.includes(userName) || userName.includes(inspName))) {
      return true;
    }
    return false;
  });

  if (isInTeam) {
    return { allowed: true };
  }

  // Bloqueio de segurança para evitar edição acidental de trabalho de colega
  const ownerLabel = inspection.createdByName || inspection.createdByEmail || inspectors[0]?.name || 'outro analista';
  return {
    allowed: false,
    reason: `Ficha criada por ${ownerLabel}. Como Analista, você só possui permissão de edição em vistorias próprias ou das quais participe na equipe técnica.`
  };
}

/**
 * Verifica se o usuário pode excluir uma vistoria
 */
export function canUserDeleteInspection(
  currentUser: { email?: string; fullName?: string; role?: string; id?: string } | null,
  inspection: InspectionData
): { allowed: boolean; reason?: string } {
  return canUserEditInspection(currentUser, inspection);
}
