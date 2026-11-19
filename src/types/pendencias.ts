export type PendenciaSituacao =
  | 'aberta'
  | 'direcionada'
  | 'em_analise'
  | 'resolvida'
  | 'cancelada';

export const PENDENCIA_SITUACOES: PendenciaSituacao[] = [
  'aberta',
  'direcionada',
  'em_analise',
  'resolvida',
  'cancelada'
];

export type PendenciaHistoricoAcao =
  | 'criacao'
  | 'direcionamento'
  | 'mudanca_situacao'
  | 'edicao'
  | 'resolucao';

export type PendenciasTab = 'minhas' | 'geral' | 'direcionado';

export interface PendenciaRecord {
  id: string;
  origem: 'fiscaliza' | string;
  origem_ref_id: string | null;
  tipo: string;
  titulo: string;
  descricao: string | null;
  situacao: PendenciaSituacao;
  responsavel_id: string | null;
  direcionado_por: string | null;
  direcionado_em: string | null;
  criado_por: string | null;
  tipo_referencia: string | null;
  referencia_id: string | null;
  empreendedor_id: string | null;
  barragem_id: string | null;
  resolvido_por: string | null;
  resolvido_em: string | null;
  created_at: string;
  updated_at: string;
}

export interface PendenciaHistoricoRecord {
  id: string;
  pendencia_id: string;
  acao: string;
  campo: string | null;
  valor_anterior: string | null;
  valor_novo: string | null;
  usuario_id: string | null;
  motivo: string | null;
  created_at: string;
}

export interface PendenciaUsuarioResumo {
  id: string;
  nome: string;
  perfil?: string;
  email?: string;
}

export interface PendenciasActorSummary {
  id: string;
  nome: string;
  perfil: 'administrador' | 'analista' | 'visualizador';
  isAdmin: boolean;
  canMutate: boolean;
  readOnlyMode: true;
  email?: string;
}

export interface PendenciasTabCounts {
  minhas: number;
  geral: number;
  direcionado?: number;
}

export interface PendenciasListPayload {
  pendencias: PendenciaRecord[];
  counts: PendenciasTabCounts;
  currentUser: PendenciasActorSummary;
  usuariosResumo: Record<string, PendenciaUsuarioResumo>;
  readOnlyMode: true;
  writeBlockReason: string;
}

export interface PendenciaDetailPayload {
  pendencia: PendenciaRecord;
  currentUser: PendenciasActorSummary;
  usuariosResumo: Record<string, PendenciaUsuarioResumo>;
  readOnlyMode: true;
  writeBlockReason: string;
}

export interface PendenciaHistoricoPayload {
  pendencia: PendenciaRecord;
  historico: PendenciaHistoricoRecord[];
  currentUser: PendenciasActorSummary;
  usuariosResumo: Record<string, PendenciaUsuarioResumo>;
  readOnlyMode: true;
  writeBlockReason: string;
}

export interface CreatePendenciaInput {
  origem_ref_id?: string | null;
  tipo: string;
  titulo: string;
  descricao?: string | null;
  responsavel_id?: string | null;
  tipo_referencia?: string | null;
  referencia_id?: string | null;
  empreendedor_id?: string | null;
  barragem_id?: string | null;
  motivo?: string | null;
}

export interface UpdatePendenciaInput {
  tipo?: string;
  titulo?: string;
  descricao?: string | null;
  tipo_referencia?: string | null;
  referencia_id?: string | null;
  empreendedor_id?: string | null;
  barragem_id?: string | null;
  origem_ref_id?: string | null;
}
