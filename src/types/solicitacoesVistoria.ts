import type { SistemaOrigem } from './inspection';

export const SOLICITACAO_VISTORIA_STATUS_LIST = [
  'pendente',
  'em_planejamento',
  'concluida',
  'cancelada'
] as const;

export type SolicitacaoVistoriaStatus = (typeof SOLICITACAO_VISTORIA_STATUS_LIST)[number];

export const SOLICITACAO_VISTORIA_ORIGENS = [
  'classifica',
  'notifica',
  'administra',
  'fiscaliza'
] as const;

export type SolicitacaoVistoriaOrigem = (typeof SOLICITACAO_VISTORIA_ORIGENS)[number];

export interface SolicitacaoVistoriaEquipeMembro {
  usuario_id: string;
  nome?: string | null;
}

export interface SolicitacaoVistoriaActorSummary {
  userId: string;
  nome: string;
  perfil: 'administrador' | 'analista' | 'visualizador';
  isAdmin: boolean;
  canMutate: boolean;
}

export interface SolicitacaoVistoriaRecord {
  id: string;
  sistema_origem: SistemaOrigem;
  status: SolicitacaoVistoriaStatus;
  protocolo?: string | null;
  solicitante_nome: string;
  solicitado_em: string;
  relato_resumido: string;
  processo_numero?: string | null;
  classificacao_resumo?: string | null;
  empreendedor_id?: string | null;
  empreendedor_nome?: string | null;
  barragem_id?: string | null;
  barragem_nome?: string | null;
  municipio?: string | null;
  curso_dagua?: string | null;
  latitude?: string | null;
  longitude?: string | null;
  vistoria_id?: string | null;
  data_realizacao?: string | null;
  equipe: SolicitacaoVistoriaEquipeMembro[];
  observacao_campo?: string | null;
  updated_at?: string | null;
}

export interface ConcluirSolicitacaoVistoriaPayload {
  vistoria_id: string;
  data_realizacao: string;
  equipe: SolicitacaoVistoriaEquipeMembro[];
  observacao_campo?: string;
}

export interface AtualizarObservacaoSolicitacaoPayload {
  observacao_campo: string;
}

export interface SolicitacoesVistoriaListResponse {
  solicitacoes: SolicitacaoVistoriaRecord[];
  actor: SolicitacaoVistoriaActorSummary;
}

export interface SolicitacaoVistoriaMutationResponse {
  solicitacao: SolicitacaoVistoriaRecord;
}
