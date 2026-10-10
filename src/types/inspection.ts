// ==============================================================================
// FISCALIZA – ETAPA DE CAMPO CSB/SEMA-MT
// Modelo de Dados com Identificadores Estáveis e Preservação Fiel de Respostas
// ==============================================================================

export type EvaluationResponseType =
  | 'sim'
  | 'nao'
  | 'nao_observado'
  | 'impossivel_observar'
  | 'nao_se_aplica'
  | 'sem_informacao';

export type SeverityCondition =
  | 'adequado'
  | 'alerta'
  | 'critico'
  | 'nao_se_aplica'
  | 'nao_inspecionado';

export type WeatherCondition =
  | 'seco'
  | 'chuva_fraca'
  | 'chuva_moderada'
  | 'chuva_forte_recente'
  | 'nublado';

export type DamType =
  | 'terra_homogenea'
  | 'terra_zoneada'
  | 'enrocamento'
  | 'concreto'
  | 'alvenaria_pedra'
  | 'mista'
  | 'outro';

export type SpillwayType =
  | 'soleira_livre_concreto'
  | 'canal_lateral_escavado'
  | 'tulipa_morning_glory'
  | 'tubulacao_manilha'
  | 'bueiro'
  | 'inexistente_vertimento_crista'
  | 'outro';

export type ConservationState =
  | 'bom'
  | 'regular'
  | 'ruim'
  | 'obstruido'
  | 'danificado';

export type DocumentType =
  | 'auto_inspecao'
  | 'relatorio_tecnico'
  | 'notificacao';

export type DocumentStatus =
  | 'minuta_revisavel'
  | 'revisado_pelo_fiscal'
  | 'finalizado';

export type PhotoSyncStatus =
  | 'pendente_sincronizacao'
  | 'sincronizado'
  | 'falha_envio';

// Registro de Localização Geográfica Rigorosa
export interface LocationRecord {
  latitude: number | null;
  longitude: number | null;
  horarioCaptura: string | null;
  acuraciaMetros: number | null;
  altitudeEstimadaDispositivo: number | null; // Identificado como estimativa do dispositivo
  editadoManualmente: boolean;
  datum: string; // SIRGAS 2000
}

// Registro Fotográfico Otimizado (sem base64 volumoso no JSON principal)
export interface PhotoRecord {
  id: string; // UUID v4
  vistoriaId: string;
  componenteId: string;
  componenteNome: string;
  itemId?: string | null; // Item correspondente (ex: 'erosoes', 'fuga_agua')
  itemRotulo?: string | null;
  descricao?: string; // Descrição opcional
  timestampInclusao: string;
  coordenadas?: {
    latitude: number;
    longitude: number;
    acuraciaMetros?: number | null;
    altitudeEstimadaDispositivo?: number | null;
  } | null;
  syncStatus: PhotoSyncStatus;
  syncError?: string | null;
  remoteStorageUrl?: string | null;
  thumbnailPreviewUrl?: string | null; // Em memória (URL.createObjectURL)
}

// ==============================================================================
// ENTIDADES RELACIONAIS COM IDENTIFICADORES ESTÁVEIS (UUID)
// ==============================================================================

export interface EmpreendedorEntity {
  id: string;
  nomeRazaoSocial: string;
  cpfCnpj?: string | null;
  figuraJuridica: 'empresa_privada' | 'pessoa_fisica' | 'orgao_publico' | 'outra';
  processoNumero?: string | null;
  endereco: string;
  telefone?: string | null;
  email?: string | null;
  documentosPessoais?: string | null;
  carNumero?: string | null;
  declaracaoUsoOutorga?: string | null;
  quantidadeBarragens?: number | null;
  comentarios?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BarragemEntity {
  id: string;
  empreendedorId: string;
  nome: string;
  municipio: string;
  baciaHidrografica?: string | null;
  cursoDagua?: string | null;
  coordenadas: LocationRecord;
  cotaCoroamentoMetros?: number | null;
  anoInicioObra?: number | null;
  anoFinalObra?: number | null;
  idadeBarragemAnos?: number | null;
  tipoMaterial: DamType;
  usoPrincipal: string;
  usosSecundarios: string[];
  createdAt: string;
  updatedAt: string;
}

export interface FiscalEquipeEntity {
  id: string;
  vistoriaId: string;
  nome: string;
  cargo: string;
  matricula: string;
  setor: string;
}

export interface AcompanhanteEntity {
  id: string;
  vistoriaId: string;
  nome: string;
  cpf?: string | null;
  vinculo: string;
  telefone?: string | null;
}

export interface MedicoesVistoriaEntity {
  id: string;
  vistoriaId: string;
  alturaBarragemMetros?: number | null;
  distanciaCristaPeMetros?: number | null;
  declividadeTaludeJusanteGraus?: number | null;
  larguraCoroamentoMetros?: number | null;
  extensaoCoroamentoMetros?: number | null;
  bordaLivreMetros?: number | null;
  cotaAtualNivelAgua?: number | null;
  espelhoDaguaHectares?: number | null;
  volumeEstimadoM3?: number | null;
}

export type NivelPerigoType = 'normal' | 'atencao' | 'alerta' | 'emergencia';
export type MagnitudeType = 'insignificante' | 'pequena' | 'media' | 'grande';

export interface ItemAvaliadoEntity {
  id: string;
  vistoriaId: string;
  componenteCodigo: string;
  itemCodigo: string;
  itemRotuloOriginal: string;
  resposta: EvaluationResponseType;
  localizacaoDetalhe?: string | null;
  estadoConservacao?: ConservationState | null;
  observacaoComplementar?: string | null;
  nivelPerigo?: NivelPerigoType | null;
  magnitude?: MagnitudeType | null;
}

export interface ComponenteObservacaoEntity {
  id: string;
  vistoriaId: string;
  componenteCodigo: string;
  comentarios?: string | null;
  protecaoTaludeTipos?: string[];
  protecaoOutrosEspecificacao?: string | null;
  revestimentoPossui?: boolean | null;
  revestimentoTipo?: string | null;
  ombreiraEsquerdaConservacao?: string | null;
  ombreiraDireitaConservacao?: string | null;
  meioFioPossui?: boolean | null;
  meioFioConservacao?: string | null;
  ameacaTransbordamento?: boolean | null;
  instrumentacaoTipos?: string[];
  vertedouroDescricaoDetalhada?: string | null;
}

export interface DocumentoGeradoEntity {
  id: string;
  vistoriaId: string;
  tipoDocumento: DocumentType;
  versao: number;
  conteudoTexto: string;
  status: DocumentStatus;
  geradoEm: string;
  atualizadoEm: string;
}

export interface HistoricoAlteracaoEntity {
  id: string;
  vistoriaId: string;
  tabelaNome: string;
  registroId: string;
  operacao: 'INSERT' | 'UPDATE' | 'DELETE';
  dadosAnteriores?: any;
  dadosNovos?: any;
  alteradoEm: string;
}

// Compatibilidade visual
export interface InspectionPhoto {
  id: string;
  dataUrl: string;
  componentId: string;
  componentName: string;
  locationDescription: string;
  caption: string;
  timestamp: string;
  latitude?: number;
  longitude?: number;
  accuracyMeters?: number;
  isCustomLocation?: boolean;
  syncStatus?: 'local' | 'synced' | 'error';
  uploadedAt?: string;
}

export interface ComponentInspectionData {
  componentId: string;
  componentName: string;
  condition: SeverityCondition;
  selectedAnomalies: string[];
  notes: string;
}

export type NotificacaoModelType =
  | 'modelo_1_cadastro_classificacao'
  | 'modelo_2_anomalias_seguranca'
  | 'modelo_3_personalizado';

export interface NotificationLegalReference {
  id: string;
  titulo: string;
  dispositivo: string;
  ativo: boolean;
  editavelTexto?: string;
}

export interface NotificationRecipientDetails {
  nomeRazaoSocial: string;
  cpfCnpj: string;
  enderecoCorrespondencia: string;
  numero: string;
  complemento: string;
  bairro: string;
  municipio: string;
  uf: string;
  cep: string;
  telefone: string;
  email?: string;
}

export interface NotificationOccurrenceDetails {
  nomeFantasia: string;
  atividade: string;
  enderecoEmpreendimento: string;
  municipio: string;
  uf: string;
  cep: string;
  telefone: string;
  areaEmpreendimento?: string;
}

export interface NotificationDetailsState {
  modelType: NotificacaoModelType;
  modelTitle: string;
  numeroNotificacao: string;
  dataEmissao: string;
  processoNumero: string;
  vinculoAutoInspecaoNumero: string;
  prazoDias: string;
  objetivo: string;
  solicitacoesTexto: string;
  observacoesGeraisTexto: string;
  incluirAdvertenciaDesobediencia: boolean;
  destinatario: NotificationRecipientDetails;
  localOcorrencia: NotificationOccurrenceDetails;
  referenciasNormativas: NotificationLegalReference[];
  modoConfirmacaoRecebimento: 'presencial' | 'enviado_por_ar' | 'recusou_assinar';
  responsavelRecebimentoNome?: string;
  responsavelRecebimentoDocumento?: string;
  responsavelRecebimentoCargo?: string;
  responsavelRecebimentoLocalData?: string;
  revisadoPor?: string;
  dataRevisao?: string;
  deadlineDays?: string;
  notificationSubject?: string;
  demandedActions?: string;
}

export interface InspectionData {
  id: string;
  barragemId?: string;
  empreendedorId?: string;
  createdAt: string;
  updatedAt: string;
  isDraft: boolean;

  generalInfo: {
    recordNumber: string;
    inspectionDate: string;
    startTime: string;
    endTime: string;
    weather: WeatherCondition;
    inspectors: {
      id?: string;
      name: string;
      role: string;
      registrationNumber: string;
      sector: string;
    }[];
    accompaniedBy: {
      id?: string;
      hasAccompaniment: boolean;
      name: string;
      document: string;
      relationship: string;
      phone: string;
    };
  };

  damIdentification: {
    damName: string;
    propertyOrBusinessName: string;
    municipality: string;
    hydrographicBasin: string;
    waterCourse: string;
    coordinates: {
      latitude: string;
      longitude: string;
      datum: string;
      accuracyMeters?: number;
      altitudeMeters?: number | null;
      captureTimestamp?: string | null;
      isManualEdit?: boolean;
    };
    mainWaterUse: string;
    secondaryWaterUses: string[];
    damType: DamType;
    estimatedDimensions: {
      heightMeters: string;
      crestLengthMeters: string;
      crestWidthMeters: string;
      reservoirAreaHectares: string;
      reservoirVolumeM3: string;
      freeboardMeters: string;
    };
    spillwayType: SpillwayType;
    regulatoryStatus: {
      hasWaterPermit: 'sim' | 'nao' | 'em_tramitacao' | 'nao_informado';
      permitNumber: string;
      hasEnvironmentalLicense: 'sim' | 'nao' | 'em_tramitacao' | 'nao_informado';
      licenseNumber: string;
      hasCar: 'sim' | 'nao' | 'nao_informado';
      carNumber: string;
      notes: string;
    };
  };

  componentsData: Record<string, ComponentInspectionData>;
  itensAvaliadosDetalhados?: Record<string, ItemAvaliadoEntity>;

  photos: InspectionPhoto[];
  photoRecords?: PhotoRecord[];

  conclusions: {
    generalFindings: string;
    immediateSafetyMeasures: string;
    recommendationsToOwner: string;
    requiresNotification: boolean;
    notificationDetails: NotificationDetailsState;
  };

  drafts: {
    inspectionNotice: string;
    technicalReport: string;
    notificationLetter: string;
  };

  historicoAlteracoes?: HistoricoAlteracaoEntity[];
  digitalSecurity?: {
    verificationCode: string;
    sha256Hash: string;
    sha256Short: string;
    timestampUtc: string;
    timestampFormatted: string;
    emissor: string;
    orgao: string;
    rastreabilidadeId: string;
    avisoLegal: string;
  };
}

export interface FotoVistoriaEntity {
  id: string;
  vistoriaId: string;
  componenteCodigo: string;
  componenteNome: string;
  dataUrl: string;
  storagePath?: string | null;
  localizacaoPonto?: string | null;
  legenda?: string | null;
  timestampFoto: string;
}

export interface VistoriaAggregate {
  id: string;
  numeroVistoria: string;
  campanhaAno: number;
  campanhaNumero: string;
  processoNumero?: string | null;
  dataVistoria: string;
  horaInicio?: string | null;
  horaTermino?: string | null;
  condicoesClimaticas: WeatherCondition;
  statusVistoria: 'rascunho_campo' | 'em_revisao' | 'concluida_campo';
  empreendedor: EmpreendedorEntity;
  barragem: BarragemEntity;
  equipe: FiscalEquipeEntity[];
  acompanhantes: AcompanhanteEntity[];
  medicoes: MedicoesVistoriaEntity;
  itensAvaliados: Record<string, ItemAvaliadoEntity>;
  componentesObservacoes: Record<string, ComponenteObservacaoEntity>;
  fotos: FotoVistoriaEntity[];
  documentos: Record<DocumentType, DocumentoGeradoEntity>;
  conclusoes: {
    sinteseFatica?: string | null;
    medidasImediatasSeguranca?: string | null;
    recomendacoesEmpreendedor?: string | null;
    outrosProblemasDescricao?: string | null;
    requerNotificacao: boolean;
    notificacaoPrazoDias?: number | null;
    notificacaoAssunto?: string | null;
    notificacaoExigencias?: string | null;
  };
  historicoAlteracoes: HistoricoAlteracaoEntity[];
  createdAt: string;
  updatedAt: string;
}
