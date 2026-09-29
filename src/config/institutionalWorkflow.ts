// ==============================================================================
// CONFIGURAÇÃO INSTITUCIONAL & DIRETRIZES OPERACIONAIS CSB/SEMA-MT
// 1. Campos Obrigatórios da Ficha Física
// 2. Modelos Oficiais Vigentes (Auto, Relatório, Notificação 1/2/3)
// 3. Matriz de Perfis (RBAC) e Fluxo de Homologação
// 4. Política de Retenção Offline e Diretrizes LGPD
// ==============================================================================

export type PerfilUsuarioSEMA = 'fiscal_campo' | 'revisor_csb' | 'coordenador_csb' | 'administrador_ti';

export type StatusVistoriaOficial = 
  | 'rascunho_campo' 
  | 'em_revisao' 
  | 'concluida_campo' 
  | 'homologada_csb' 
  | 'arquivada';

export interface CampoObrigatorioDef {
  codigo: string;
  rotuloFichaFisica: string;
  secao: 'identificacao' | 'barragem' | 'componentes' | 'conclusoes' | 'equipe';
  bloqueiaConclusao: boolean;
  justificativaLegal: string;
}

export const CAMPOS_OBRIGATORIOS_FICHA_FISICA: CampoObrigatorioDef[] = [
  {
    codigo: 'dam_identification_name',
    rotuloFichaFisica: 'Nome da Barragem / Propriedade',
    secao: 'identificacao',
    bloqueiaConclusao: true,
    justificativaLegal: 'Art. 17 da Lei Federal nº 12.334/2010 (Identificação inequívoca do barramento)'
  },
  {
    codigo: 'dam_coordinates',
    rotuloFichaFisica: 'Coordenadas Geográficas (Latitude e Longitude)',
    secao: 'identificacao',
    bloqueiaConclusao: true,
    justificativaLegal: 'Resolução CEHIDRO/MT nº 163/2023 e Portarias SEMA (SIRGAS 2000 obrigatório)'
  },
  {
    codigo: 'municipality',
    rotuloFichaFisica: 'Município de Localização',
    secao: 'identificacao',
    bloqueiaConclusao: true,
    justificativaLegal: 'Competência territorial do órgão ambiental fiscalizador'
  },
  {
    codigo: 'inspection_date',
    rotuloFichaFisica: 'Data da Vistoria',
    secao: 'equipe',
    bloqueiaConclusao: true,
    justificativaLegal: 'Segurança jurídica e marco temporal da constatação fiscal'
  },
  {
    codigo: 'inspector_lead',
    rotuloFichaFisica: 'Nome e Matrícula/Cargo do Servidor Fiscal',
    secao: 'equipe',
    bloqueiaConclusao: true,
    justificativaLegal: 'Validade do ato administrativo emitido por servidor legalmente investido'
  },
  {
    codigo: 'main_water_use',
    rotuloFichaFisica: 'Uso Principal do Barramento',
    secao: 'barragem',
    bloqueiaConclusao: true,
    justificativaLegal: 'Enquadramento em outorga de recursos hídricos e DPA'
  },
  {
    codigo: 'dam_type_material',
    rotuloFichaFisica: 'Tipologia / Material do Maciço',
    secao: 'barragem',
    bloqueiaConclusao: true,
    justificativaLegal: 'Definição das diretrizes da Cartilha de Ações de Manutenção'
  },
  {
    codigo: 'spillway_type',
    rotuloFichaFisica: 'Tipo de Vertedouro / Extravasor',
    secao: 'componentes',
    bloqueiaConclusao: true,
    justificativaLegal: 'Avaliação da capacidade de descarga de cheias e risco de galgamento'
  },
  {
    codigo: 'immediate_safety_measures',
    rotuloFichaFisica: 'Síntese das Condições e Medidas de Segurança',
    secao: 'conclusoes',
    bloqueiaConclusao: true,
    justificativaLegal: 'Art. 7º, §3º da Lei Federal nº 14.066/2020 (reparações imediatas)'
  }
];

// Matriz de Controle de Acesso (RBAC) e Permissões
export interface PermissoesPerfil {
  podeCriarRascunho: boolean;
  podeEditarDadosCampo: boolean;
  podeConcluirCampo: boolean;
  podeReabrirVistoriaConcluida: boolean;
  podeHomologarCSB: boolean;
  podeExportarDocumentoOficial: boolean;
  podeVisualizarDadosPessoaisLGPD: boolean;
}

export const MATRIZ_PERMISSOES_RBAC: Record<PerfilUsuarioSEMA, PermissoesPerfil> = {
  fiscal_campo: {
    podeCriarRascunho: true,
    podeEditarDadosCampo: true,
    podeConcluirCampo: true,
    podeReabrirVistoriaConcluida: false, // Exige autorização da Coordenadoria
    podeHomologarCSB: false,
    podeExportarDocumentoOficial: true,
    podeVisualizarDadosPessoaisLGPD: true
  },
  revisor_csb: {
    podeCriarRascunho: false,
    podeEditarDadosCampo: true,
    podeConcluirCampo: true,
    podeReabrirVistoriaConcluida: true,
    podeHomologarCSB: true,
    podeExportarDocumentoOficial: true,
    podeVisualizarDadosPessoaisLGPD: true
  },
  coordenador_csb: {
    podeCriarRascunho: true,
    podeEditarDadosCampo: true,
    podeConcluirCampo: true,
    podeReabrirVistoriaConcluida: true,
    podeHomologarCSB: true,
    podeExportarDocumentoOficial: true,
    podeVisualizarDadosPessoaisLGPD: true
  },
  administrador_ti: {
    podeCriarRascunho: false,
    podeEditarDadosCampo: false, // TI não altera conteúdo técnico-fiscal
    podeConcluirCampo: false,
    podeReabrirVistoriaConcluida: true,
    podeHomologarCSB: false,
    podeExportarDocumentoOficial: true,
    podeVisualizarDadosPessoaisLGPD: false // Princípio do menor privilégio
  }
};

// Diretrizes de Retenção Offline no Dispositivo
export const POLITICA_RETENCAO_DISPOSITIVO = {
  duracaoMaximaCacheDias: 15, // Rascunhos locais expiram após 15 dias sem sincronização
  armazenarFotosAltaResolucaoLocal: true,
  limiteFotosPorVistoria: 50,
  criptografiaLocalRecomendada: true,
  avisoSincronizacaoPendenteHoras: 48
};

// Checklist do Ambiente Oficial de Produção (Supabase & Vercel)
export const CHECKLIST_AMBIENTE_OFICIAL = {
  supabase: {
    rlsAtivoTodasTabelas: true,
    acessoAnonimoBloqueado: true,
    bucketFotosPrivado: 'fotos_vistorias_csb',
    sslForcado: true,
    logAuditoriaAtivo: true
  },
  vercel: {
    headersSegurançaAtivos: {
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:;"
    }
  }
};
