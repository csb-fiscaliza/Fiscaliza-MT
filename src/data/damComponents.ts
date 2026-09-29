export interface DamComponentDefinition {
  id: string;
  name: string;
  shortName: string;
  description: string;
  commonAnomalies: {
    id: string;
    label: string;
    severityHint: 'alerta' | 'critico';
  }[];
}

export const DAM_COMPONENTS: DamComponentDefinition[] = [
  {
    id: 'crista',
    name: 'Crista da Barragem (Coroamento)',
    shortName: 'Crista',
    description: 'Parte superior do maciço. Avaliar alinhamento, largura de passagem, tráfego e integridade da superfície.',
    commonAnomalies: [
      { id: 'crista_trincas_long', label: 'Trincas longitudinais ao longo do eixo', severityHint: 'critico' },
      { id: 'crista_trincas_trans', label: 'Trincas transversais (perpendiculares ao eixo)', severityHint: 'critico' },
      { id: 'crista_afundamento', label: 'Afundamento, recalque localizado ou depressões', severityHint: 'critico' },
      { id: 'crista_vegetacao', label: 'Vegetação arbustiva ou árvores com raízes profundas', severityHint: 'alerta' },
      { id: 'crista_sulcos_erosao', label: 'Erosão superficial ou sulcos provocados por enxurrada', severityHint: 'alerta' },
      { id: 'crista_pisoteio_gado', label: 'Trilhas de gado ou tráfego excessivo desprotegido', severityHint: 'alerta' },
      { id: 'crista_largura_insuficiente', label: 'Largura da crista insuficiente para o porte', severityHint: 'alerta' }
    ]
  },
  {
    id: 'talude_montante',
    name: 'Talude de Montante (Face voltada para a água)',
    shortName: 'Talude Montante',
    description: 'Face inclinada em contato com a água do reservatório. Avaliar proteção contra ondas e estabilidade.',
    commonAnomalies: [
      { id: 'montante_escorregamento', label: 'Indícios de escorregamento de massa ou degraus de abatimento', severityHint: 'critico' },
      { id: 'montante_solapamento', label: 'Erosão por ondas (solapamento na linha d\'água)', severityHint: 'alerta' },
      { id: 'montante_sem_protecao', label: 'Ausência ou degradação da proteção do talude (rip-rap / enrocamento / grama)', severityHint: 'alerta' },
      { id: 'montante_arvores', label: 'Presença de árvores de médio/grande porte no talude', severityHint: 'alerta' },
      { id: 'montante_trincas', label: 'Fissuras ou trincas na face montante', severityHint: 'critico' }
    ]
  },
  {
    id: 'talude_jusante',
    name: 'Talude de Jusante (Face externa)',
    shortName: 'Talude Jusante',
    description: 'Face inclinada voltada para jusante. Ponto crítico para detecção de percolação interna e estabilidade.',
    commonAnomalies: [
      { id: 'jusante_surgencia_finos', label: 'Surgência de água / minadouro com carreamento de finos (água turva / piping)', severityHint: 'critico' },
      { id: 'jusante_surgencia_limpa', label: 'Umidade excessiva, minadouro ou áreas encharcadas (água limpa)', severityHint: 'alerta' },
      { id: 'jusante_escorregamento', label: 'Escorregamento, trincas em meia encosta ou abaulamento do talude', severityHint: 'critico' },
      { id: 'jusante_ravinas', label: 'Erosões em sulcos profundos, ravinas ou boçorocas', severityHint: 'critico' },
      { id: 'jusante_vegetacao_densa', label: 'Mato alto, árvores de grande porte dificultando inspeção', severityHint: 'alerta' },
      { id: 'jusante_solo_exposto', label: 'Ausência total de cobertura vegetal (solo exposto)', severityHint: 'alerta' },
      { id: 'jusante_formigueiros', label: 'Presença de formigueiros, cupinzeiros ou tocas de animais', severityHint: 'alerta' }
    ]
  },
  {
    id: 'vertedouro',
    name: 'Vertedouro / Descarregador de Cheias (Extravasor)',
    shortName: 'Vertedouro',
    description: 'Estrutura hidráulica projetada para escoar vazões excedentes sem transbordamento pela crista.',
    commonAnomalies: [
      { id: 'vert_inexistente', label: 'Inexistência de vertedouro (risco iminente de galgamento/overtopping)', severityHint: 'critico' },
      { id: 'vert_obstrucao', label: 'Obstrução do canal por troncos, galhos, telas, sedimentos ou barreira', severityHint: 'critico' },
      { id: 'vert_capacidade_duvidosa', label: 'Seção de vazão nitidamente insuficiente para as cheias da bacia', severityHint: 'critico' },
      { id: 'vert_erosao_restituicao', label: 'Erosão regressiva severa a jusante / canal de restituição desprotegido', severityHint: 'critico' },
      { id: 'vert_danos_estruturais', label: 'Trincas estruturais, armadura exposta ou desagregação do concreto/alvenaria', severityHint: 'alerta' },
      { id: 'vert_manilha_assoreada', label: 'Tubulação/manilha extravasora assoreada ou com vazamento periférico', severityHint: 'alerta' }
    ]
  },
  {
    id: 'descarregador_fundo',
    name: 'Descarregador de Fundo / Tomada d\'Água',
    shortName: 'Tomada / Fundo',
    description: 'Estrutura para rebaixamento do reservatório ou derivação de água para múltiplos usos.',
    commonAnomalies: [
      { id: 'fundo_inoperante', label: 'Estrutura inoperante, travada ou sem mecanismo de abertura/fechamento', severityHint: 'alerta' },
      { id: 'fundo_vazamento_tubulacao', label: 'Vazamento ao longo da tubulação interna que atravessa o maciço', severityHint: 'critico' },
      { id: 'fundo_erosao_saida', label: 'Erosão no ponto de saída da água a jusante', severityHint: 'alerta' },
      { id: 'fundo_inexistente', label: 'Inexistência de descarregador de fundo (impossibilidade de esgotamento rápido)', severityHint: 'alerta' }
    ]
  },
  {
    id: 'drenagem_pe',
    name: 'Pé da Barragem e Sistema de Drenagem Interna',
    shortName: 'Drenagem e Pé',
    description: 'Região de transição no sopé da barragem e dispositivos de drenagem (tapete, dreno de pé, canaletas).',
    commonAnomalies: [
      { id: 'pe_alagadico', label: 'Acúmulo permanente de água empoçada no pé sem escoamento', severityHint: 'alerta' },
      { id: 'pe_dreno_obstruido', label: 'Dreno de pé assoreado, quebrado ou sem canalização de saída', severityHint: 'alerta' },
      { id: 'pe_ausencia_drenagem', label: 'Inexistência aparente de sistema de drenagem interna', severityHint: 'alerta' },
      { id: 'pe_recalque_transicao', label: 'Recalque diferencial no contato do maciço com a fundação natural', severityHint: 'critico' }
    ]
  },
  {
    id: 'reservatorio_borda',
    name: 'Reservatório, Borda Livre e Margens',
    shortName: 'Reservatório',
    description: 'Bacia de acumulação e margens circundantes. Distância vertical entre a água e o topo da crista.',
    commonAnomalies: [
      { id: 'res_borda_insuficiente', label: 'Borda livre crítica ou insuficiente (nível d\'água muito próximo da crista)', severityHint: 'critico' },
      { id: 'res_assoreamento', label: 'Assoreamento acentuado visível por bancos de areia e sedimentos', severityHint: 'alerta' },
      { id: 'res_instabilidade_margens', label: 'Instabilidade ou deslizamento de encostas nas margens do lago', severityHint: 'alerta' },
      { id: 'res_macrofitas', label: 'Infestação descontrolada por macrófitas aquáticas / vegetação flutuante', severityHint: 'alerta' }
    ]
  },
  {
    id: 'area_jusante',
    name: 'Área de Jusante / Zona de Impacto Imediato',
    shortName: 'Área Jusante',
    description: 'Vale a jusante da barragem. Vistoriar elementos vulneráveis em caso hipotético de rompimento.',
    commonAnomalies: [
      { id: 'jus_habitacoes', label: 'Presença de habitações permanentes ou temporárias no vale a jusante', severityHint: 'critico' },
      { id: 'jus_rodovia_ponte', label: 'Estradas vicinais, pontes, rodovias estaduais ou federais a jusante', severityHint: 'critico' },
      { id: 'jus_instalacoes_animais', label: 'Instalações agropecuárias, currais, granjas ou armazéns a jusante', severityHint: 'alerta' },
      { id: 'jus_sem_interferencias', label: 'Vale a jusante sem ocupações humanas permanentes visíveis', severityHint: 'alerta' }
    ]
  }
];

export const MUNICIPALITIES_MT = [
  'Alta Floresta', 'Alto Araguaia', 'Alto Boa Vista', 'Alto Garças', 'Alto Paraguai',
  'Alto Taquari', 'Apiacás', 'Araguaiana', 'Araguainha', 'Araputanga', 'Arenápolis',
  'Aripuanã', 'Barão de Melgaço', 'Barra do Bugres', 'Barra do Garças', 'Bom Jesus do Araguaia',
  'Brasnorte', 'Cáceres', 'Campinápolis', 'Campo Novo do Parecis', 'Campo Verde',
  'Campos de Júlio', 'Canabrava do Norte', 'Canarana', 'Castanheira', 'Chapada dos Guimarães',
  'Cláudia', 'Cocalinho', 'Colíder', 'Colniza', 'Comodoro', 'Confresa', 'Conquista D\'Oeste',
  'Cotriguaçu', 'Cuiabá', 'Curvelândia', 'Denise', 'Diamantino', 'Dom Aquino', 'Feliz Natal',
  'Figueirópolis D\'Oeste', 'Gaúcha do Norte', 'General Carneiro', 'Glória D\'Oeste',
  'Guarantã do Norte', 'Guiratinga', 'Indiavaí', 'Ipiranga do Norte', 'Itanhangá',
  'Itaúba', 'Itiquira', 'Jaciara', 'Jangada', 'Jauru', 'Juara', 'Juína', 'Juruena',
  'Juscimeira', 'Lambari D\'Oeste', 'Lucas do Rio Verde', 'Luciara', 'Marcelândia',
  'Matupá', 'Mirassol d\'Oeste', 'Nobres', 'Nortelândia', 'Nossa Senhora do Livramento',
  'Nova Bandeirantes', 'Nova Brasilândia', 'Nova Canaã do Norte', 'Nova Guarita',
  'Nova Lacerda', 'Nova Marilândia', 'Nova Maringá', 'Nova Monte Verde', 'Nova Mutum',
  'Nova Nazaré', 'Nova Olímpia', 'Nova Santa Helena', 'Nova Ubiratã', 'Nova Xavantina',
  'Novo Horizonte do Norte', 'Novo Mundo', 'Novo Santo Antônio', 'Novo São Joaquim',
  'Paranaita', 'Paranatinga', 'Pedra Preta', 'Peixoto de Azevedo', 'Planalto da Serra',
  'Poconé', 'Pontal do Araguaia', 'Ponte Branca', 'Pontes e Lacerda', 'Porto Alegre do Norte',
  'Porto dos Gaúchos', 'Porto Esperidião', 'Porto Estrela', 'Poxoréo', 'Primavera do Leste',
  'Querência', 'Reserva do Cabaçal', 'Ribeirão Cascalheira', 'Ribeirãozinho', 'Rio Branco',
  'Rondonópolis', 'Rosário Oeste', 'Salto do Céu', 'Santa Carmem', 'Santa Cruz do Xingu',
  'Santa Rita do Trivelato', 'Santa Terezinha', 'Santo Afonso', 'Santo Antônio do Leste',
  'Santo Antônio do Leverger', 'São Félix do Araguaia', 'São José do Povo', 'São José do Rio Claro',
  'São José do Xingu', 'São José dos Quatro Marcos', 'São Pedro da Cipa', 'Sapezal',
  'Sinop', 'Sorriso', 'Tabaporã', 'Tangará da Serra', 'Tapurah', 'Terra Nova do Norte',
  'Tesouro', 'Torixoréu', 'União do Sul', 'Vale de São Domingos', 'Várzea Grande',
  'Vera', 'Vila Bela da Santíssima Trindade', 'Vila Rica'
];

export const BASINS_MT = [
  'Bacia Hidrográfica do Paraguai (Alto Paraguai / Pantanal)',
  'Bacia Hidrográfica do Teles Pires / Tapajós (Amazônica)',
  'Bacia Hidrográfica do Juruena / Tapajós (Amazônica)',
  'Bacia Hidrográfica do Araguaia / Tocantins',
  'Bacia Hidrográfica do Rio Xingu (Amazônica)',
  'Bacia Hidrográfica do Rio Guaporé / Madeira (Amazônica)',
  'Bacia Hidrográfica do Rio Cuiabá',
  'Bacia Hidrográfica do Rio São Lourenço',
  'Outra Bacia / Sub-bacia Local'
];
