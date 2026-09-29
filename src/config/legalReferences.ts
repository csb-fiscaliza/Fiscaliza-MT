// ==============================================================================
// CONFIGURAÇÃO DE REFERÊNCIAS LEGAIS DO AUTO DE INSPEÇÃO (CSB/SEMA-MT)
// Deixadas configuráveis para validação e aprovação da CSB e da área jurídica.
// ==============================================================================

export interface LegalReferenceConfig {
  id: string;
  titulo: string;
  dispositivoLegal: string;
  conteudoTexto: string;
  editavelPorFiscal: boolean;
  aprovadoJuridicoSema: boolean;
}

export const DEFAULT_LEGAL_REFERENCES: Record<string, LegalReferenceConfig> = {
  pnsbObjetivo: {
    id: 'pnsbObjetivo',
    titulo: 'Enquadramento e Objetivo Geral (PNSB)',
    dispositivoLegal: 'Lei Federal nº 12.334/2010, art. 1º e alterações posteriores',
    conteudoTexto: 
`A partir da Lei Federal nº 12.334/2010, foi estabelecida a Política Nacional de Segurança de Barragens destinadas à acumulação de água para quaisquer usos, à disposição final ou temporária de rejeitos e à acumulação de resíduos industriais, que enquadra e regula barragens que apresentem pelo menos uma das características definidas no art. 1º da Lei ou que apresentem alguma característica de Categoria de Risco (CRI) ou Dano Potencial Associado (DPA), conforme competência fiscalizatória do órgão estadual gestor de recursos hídricos (SEMA-MT).`,
    editavelPorFiscal: true,
    aprovadoJuridicoSema: true
  },

  reparacaoAnomalias: {
    id: 'reparacaoAnomalias',
    titulo: 'Obrigatoriedade de Medidas e Reparação de Anomalias',
    dispositivoLegal: 'Lei Federal nº 14.066/2020, art. 7º, § 3º',
    conteudoTexto:
`Em atenção ao disposto no § 3º, do art. 7º, da Lei Federal nº 14.066, de 30 de setembro de 2020, o empreendedor deverá promover medidas e intervenções para reparações imediatas quanto às anomalias verificadas que levem à redução do risco associado à barragem, de forma a promover melhorias na sua segurança operacional e estrutural.`,
    editavelPorFiscal: true,
    aprovadoJuridicoSema: true
  },

  responsabilidadeEmpreendedor: {
    id: 'responsabilidadeEmpreendedor',
    titulo: 'Dever de Segurança e Responsabilidade do Empreendedor',
    dispositivoLegal: 'Lei Federal nº 12.334/2010 c/c Lei Federal nº 14.066/2020 e normas estaduais da SEMA-MT',
    conteudoTexto:
`Cabe ressaltar que o empreendedor é legalmente responsável pela segurança da barragem, esteja ela submetida ou não ao enquadramento pleno da referida Lei, devendo zelar pela sua conservação, manutenção e operação, de maneira a reduzir a possibilidade de incidentes ou acidentes e suas respectivas consequências socioambientais.`,
    editavelPorFiscal: true,
    aprovadoJuridicoSema: true
  }
};
