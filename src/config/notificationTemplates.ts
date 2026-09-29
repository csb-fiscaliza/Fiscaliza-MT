// ==============================================================================
// CONFIGURAÇÃO DOS MODELOS DE NOTIFICAÇÃO TÉCNICA (CSB/SEMA-MT)
// Modelos identificados a partir de casos concretos da fiscalização da SEMA-MT
// NUNCA aplicar prazos, sanções ou artigos de lei de forma automática:
// o servidor deve revisar, escolher o modelo e validar as referências normativas.
// ==============================================================================

import { NotificacaoModelType, NotificationLegalReference } from '../types/inspection';

export interface NotificationTemplateDefinition {
  type: NotificacaoModelType;
  title: string;
  shortDescription: string;
  finalidade: string;
  defaultObjetivo: string;
  sugestaoPrazoDias: string; // apenas sugestão para preenchimento, sujeita a confirmação do fiscal
  defaultSolicitacoes: string;
  defaultObservacoesGerais: string;
  referenciasNormativas: NotificationLegalReference[];
}

export const NOTIFICATION_TEMPLATES: Record<NotificacaoModelType, NotificationTemplateDefinition> = {
  modelo_1_cadastro_classificacao: {
    type: 'modelo_1_cadastro_classificacao',
    title: 'Modelo 1: Novo Cadastro e Classificação de Barragem (DPA e CRI)',
    shortDescription: 'Aplicável quando há necessidade de regularização cadastral, enquadramento ou alterações significativas no barramento.',
    finalidade: 'Regularização cadastral e classificação de Dano Potencial Associado e Categoria de Risco em razão de modificações na estrutura ou ausência de cadastro perante a SEMA-MT.',
    defaultObjetivo: 'Notificação para novo cadastro e classificação do Dano Potencial Associado e Categoria de Risco para barragem.',
    sugestaoPrazoDias: '90',
    defaultSolicitacoes: 
`I. Notificamos {{NOME_RAZAO_SOCIAL}} CPF/CNPJ: {{CPF_CNPJ}} a providenciar novo processo para cadastro e classificação da barragem, localizada no município de {{MUNICIPIO}}, sob coordenadas geográficas {{COORDENADAS_GMS}}, considerando as significativas alterações realizadas no barramento, que foram relatadas no Auto de Inspeção Nº {{NUMERO_AUTO}}.

II. O novo requerimento deve atender ao estabelecido em normas vigentes, considerando o que dispõem na Lei 12.334/2010, Resolução CEHIDRO Nº 163/2023, Instrução Normativa Nº 08 de 18 de dezembro de 2023 e Termo de Referência – SURH Nº 17, disponíveis no sítio eletrônico oficial da SEMA-MT (http://www.sema.mt.gov.br/site/index.php/unidades-administrativas/recursos-hidricos/category/394-seguran%C3%A7a-de-barragens);
Prazo atendimento das solicitações: {{PRAZO_DIAS}} dias.

III. O não atendimento destas solicitações no prazo estabelecido, acarretará nas sanções administrativas cabíveis como prevê a Lei nº 12.334, de 20 de setembro de 2010 e suas alterações, e a Resolução CNRH n° 230 de 22 de março de 2022.`,
    defaultObservacoesGerais:
`I. O empreendedor deverá realizar o monitoramento da estabilização dos componentes da barragem e em caso de piora da anomalia apontada no Auto de Inspeção Nº {{NUMERO_AUTO}}, deverá ser realizado as correções necessárias, sob orientação de um profissional legalmente habilitado, de forma a não comprometer a segurança da barragem.

II. A manutenção da barragem deve ser realizada conforme orientações apresentadas na Cartilha de Ações de Manutenção em Barragens de Terra, disponível no portal da SEMA-MT.

III. Caso exista processo de regularização anterior que tenha sido substituído pelas novas características da estrutura, providenciar requerimento para arquivamento definitivo do processo nº {{NUMERO_PROCESSO_ANTERIOR}}.`,
    referenciasNormativas: [
      {
        id: 'lei_12334',
        titulo: 'Lei Federal nº 12.334/2010 (PNSB)',
        dispositivo: 'Estabelece a Política Nacional de Segurança de Barragens e o dever de cadastramento e classificação.',
        ativo: true
      },
      {
        id: 'res_cehidro_163',
        titulo: 'Resolução CEHIDRO/MT nº 163/2023',
        dispositivo: 'Regulamenta os procedimentos de segurança de barragens de acumulação de água de competência do Estado de Mato Grosso.',
        ativo: true
      },
      {
        id: 'in_sema_08_2023',
        titulo: 'Instrução Normativa SEMA-MT nº 08/2023',
        dispositivo: 'Fixa prazos, formulários e fluxos para instrução processual de barragens perante a Coordenadoria de Segurança de Barragens.',
        ativo: true
      },
      {
        id: 'tr_surh_17',
        titulo: 'Termo de Referência SURH nº 17',
        dispositivo: 'Diretrizes técnicas para elaboração de projeto, cadastro e classificação de DPA e CRI de barragens.',
        ativo: true
      },
      {
        id: 'res_cnrh_230',
        titulo: 'Resolução CNRH nº 230/2022',
        dispositivo: 'Classificação de barragens e sanções administrativas cabíveis aos infratores.',
        ativo: true
      }
    ]
  },

  modelo_2_anomalias_seguranca: {
    type: 'modelo_2_anomalias_seguranca',
    title: 'Modelo 2: Medidas Corretivas de Segurança, Reparo de Anomalias e Laudo com ART',
    shortDescription: 'Aplicável quando há risco iminente, anomalias em componentes (taludes, vertedouro) ou exigência de laudo de estabilidade.',
    finalidade: 'Determinar a execução tempestiva de obras ou reparos de manutenção corretiva nas anomalias registradas em campo e a comprovação técnica por profissional habilitado com ART.',
    defaultObjetivo: 'Notificação para execução de medidas corretivas de segurança, mitigação de anomalias no barramento e apresentação de laudo técnico com ART.',
    sugestaoPrazoDias: '30',
    defaultSolicitacoes:
`I. Notificamos {{NOME_RAZAO_SOCIAL}} CPF/CNPJ: {{CPF_CNPJ}} a providenciar, em caráter prioritário, as intervenções de manutenção corretiva e reparos nas anomalias identificadas na inspeção de campo e discriminadas no Auto de Inspeção Nº {{NUMERO_AUTO}}, em especial:
- Promover a imediata desobstrução, limpeza e recomposição da capacidade hidráulica do vertedouro/extravasor;
- Realizar a recomposição do solo e contenção de processos erosivos/trincas verificados no maciço e taludes;
- Executar a erradicação de vegetação arbórea/arbustiva inadequada e combate a formigueiros na estrutura.

II. Apresentar perante a Coordenadoria de Segurança de Barragens (CSB/SEMA-MT) Laudo Técnico de Estabilidade Estrutural e Segurança de Barragem, elaborado e assinado por profissional legalmente habilitado pelo sistema CONFEA/CREA, acompanhado da respectiva Anotação de Responsabilidade Técnica (ART) com atividade técnica específica.
Prazo atendimento das solicitações: {{PRAZO_DIAS}} dias.

III. O descumprimento das obrigações assinaladas sujeitará o responsável às sanções administrativas previstas no art. 17-B da Lei Federal nº 12.334/2010 (acrescido pela Lei nº 14.066/2020), sem prejuízo de embargo cautelar da atividade ou despressurização do reservatório em caso de risco iminente.`,
    defaultObservacoesGerais:
`I. O empreendedor deverá manter vigilância contínua e monitoramento da estabilização dos componentes da barragem durante o período de execução dos reparos recomendados no Auto de Inspeção Nº {{NUMERO_AUTO}}.

II. Todas as intervenções físicas no maciço devem ser executadas sob responsabilidade de engenheiro habilitado, evitando escavações que comprometam a linha freática ou a estabilidade dos taludes de montante e jusante.

III. A manutenção deve ser pautada nos preceitos da Cartilha de Ações de Manutenção em Barragens de Terra disponibilizada pela SEMA-MT.`,
    referenciasNormativas: [
      {
        id: 'lei_12334_14066',
        titulo: 'Lei Federal nº 12.334/2010 c/c Lei Federal nº 14.066/2020 (art. 7º, § 3º e art. 17-B)',
        dispositivo: 'Obrigatoriedade de medidas imediatas para redução do risco de rompimento e sanções por descumprimento de ordens de fiscalização.',
        ativo: true
      },
      {
        id: 'cartilha_manutencao_sema',
        titulo: 'Cartilha de Ações de Manutenção em Barragens de Terra da SEMA-MT',
        dispositivo: 'Normas e boas práticas técnicas para intervenções em barramentos de terra.',
        ativo: true
      },
      {
        id: 'res_cnrh_230',
        titulo: 'Resolução CNRH nº 230/2022',
        dispositivo: 'Critérios de fiscalização de segurança e enquadramento de penalidades.',
        ativo: true
      }
    ]
  },

  modelo_3_personalizado: {
    type: 'modelo_3_personalizado',
    title: 'Modelo 3: Personalizado / Outra Finalidade Técnica',
    shortDescription: 'Redação livre pelo fiscal para situações específicas que não se enquadram nos modelos padronizados.',
    finalidade: 'Permitir que o fiscalizador estruture livremente o objetivo, obrigações, prazos e fundamentos legais necessários.',
    defaultObjetivo: 'Notificação técnica para atendimento de exigências relativas à segurança de barragem.',
    sugestaoPrazoDias: '30',
    defaultSolicitacoes:
`I. Notificamos {{NOME_RAZAO_SOCIAL}} CPF/CNPJ: {{CPF_CNPJ}} a adotar as seguintes providências técnicas e administrativas relativas ao barramento localizado em {{MUNICIPIO}} (Auto de Inspeção Nº {{NUMERO_AUTO}}):
- [Descrever as exigências técnicas determinadas pelo fiscal]

II. Prazo atendimento das solicitações: {{PRAZO_DIAS}} dias corridos.

III. O não atendimento no prazo assinalado acarretará as sanções administrativas cabíveis nos termos da legislação ambiental e de segurança de barragens.`,
    defaultObservacoesGerais:
`I. As informações e documentos deverão ser encaminhados via protocolo eletrônico no SIGA-AUTUAÇÃO.

II. O empreendedor permanece responsável pela integridade física e operacional do barramento.`,
    referenciasNormativas: [
      {
        id: 'lei_12334_geral',
        titulo: 'Lei Federal nº 12.334/2010',
        dispositivo: 'Segurança de barragens para acumulação de água para usos múltiplos.',
        ativo: true
      }
    ]
  }
};
