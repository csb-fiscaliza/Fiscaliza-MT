// ==============================================================================
// GERADOR DO AUTO DE INSPEÇÃO (CSB/SEMA-MT - SIGA AUTUAÇÃO)
// Estrutura espelhada do modelo oficial do Governo do Estado de Mato Grosso
// ==============================================================================

import { InspectionData, EvaluationResponseType } from '../types/inspection';
import { formatGmsString } from './geoCoordinates';
import { DEFAULT_LEGAL_REFERENCES, LegalReferenceConfig } from '../config/legalReferences';

export interface AutoInspecaoGeneratedStructure {
  numeroAuto: string;
  dataEmissao: string;
  versaoSistema: string;
  empreendedor: {
    nomeRazaoSocial: string;
    cpfCnpj: string;
    endereco: string;
    numero: string;
    complemento: string;
    bairro: string;
    uf: string;
    municipio: string;
    cep: string;
    telefone: string;
  };
  localOcorrencia: {
    nomeFantasia: string;
    atividade: string;
    datum: string;
    latitudeGms: string;
    longitudeGms: string;
    latitudeDecimal: string;
    longitudeDecimal: string;
    enderecoEmpreendimento: string;
    areaEmpreendimento: string;
    uf: string;
    municipio: string;
    cep: string;
    telefone: string;
    numeroProcesso: string;
  };
  objetivoTexto: string;
  caracteristicasPrincipais: {
    alturaTalude: string;
    comprimento: string;
    larguraCoroamento: string;
    volumeTotal: string;
    areaInundacao: string;
    capacidadeVertedouro: string;
    materialUtilizado: string;
    usoAgua: string;
    codigoSnisb: string;
  };
  constatacoesPorComponente: {
    usosECaracteristicas: string;
    taludeMontante: string;
    coroamento: string;
    taludeJusante: string;
    regiaoJusante: string;
    instrumentacao: string;
    estruturasExtravasoras: string;
    reservatorio: string;
  };
  consideracoesGerais: string;
  anomaliasObservadas: string[];
  citacaoLegalAnomalias: string;
  conclusaoTexto: string;
  equipeFiscalizacao: {
    nome: string;
    cargo: string;
    matricula: string;
  }[];
  confirmacaoRecebimento: {
    nomeResponsavel: string;
    documento: string;
    cargo: string;
    localData: string;
    recusouAssinar: boolean;
  };
  textoCompletoFormatado: string;
}

function formatResponseLabel(resp: EvaluationResponseType | undefined): string {
  switch (resp) {
    case 'sim': return 'Constatado';
    case 'nao': return 'Não constatado';
    case 'nao_observado': return 'Não observado nesta vistoria';
    case 'impossivel_observar': return 'Impossível observar no momento da vistoria';
    case 'nao_se_aplica': return 'Não se aplica a esta estrutura';
    case 'sem_informacao': default: return 'Dado não informado';
  }
}

export function generateAutoInspecaoData(
  data: InspectionData,
  customLegalReferences?: Record<string, LegalReferenceConfig>
): AutoInspecaoGeneratedStructure {
  const legal = { ...DEFAULT_LEGAL_REFERENCES, ...(customLegalReferences || {}) };
  const d = data.damIdentification;
  const g = data.generalInfo;
  const c = data.conclusions;
  const m = d.estimatedDimensions;

  const latGms = formatGmsString(d.coordinates.latitude, true, false);
  const lonGms = formatGmsString(d.coordinates.longitude, false, false);

  const dataFormatada = g.inspectionDate
    ? new Date(g.inspectionDate + 'T00:00:00').toLocaleDateString('pt-BR')
    : 'Data não informada';

  // 1. Objetivo
  const relatoTempo = g.weather === 'seco' ? 'sem relato de chuva recente' : `tempo com ${g.weather.replace('_', ' ')}`;
  const objetivoTexto = `${legal.pnsbObjetivo.conteudoTexto}

Foi realizada uma vistoria técnica de fiscalização no dia ${dataFormatada}, ${relatoTempo} no barramento, localizado no município de ${d.municipality || 'Município de MT'} – MT.`;

  // 3. Características Principais
  const caracteristicasPrincipais = {
    alturaTalude: m.heightMeters ? `${m.heightMeters} m` : 'Dado não informado',
    comprimento: m.crestLengthMeters ? `${m.crestLengthMeters} m` : 'Dado não informado',
    larguraCoroamento: m.crestWidthMeters ? `${m.crestWidthMeters} m` : 'Dado não informado',
    volumeTotal: m.reservoirVolumeM3 ? `${m.reservoirVolumeM3} m³` : 'Dado não informado',
    areaInundacao: m.reservoirAreaHectares ? `${m.reservoirAreaHectares} ha` : 'Dado não informado',
    capacidadeVertedouro: d.spillwayType ? d.spillwayType.replace(/_/g, ' ') : 'Desconhecido / Não informado',
    materialUtilizado: d.damType ? d.damType.replace(/_/g, ' ') : 'terra homogênea',
    usoAgua: d.mainWaterUse || 'Uso múltiplo rural',
    codigoSnisb: 'Não informado no local'
  };

  // 4. Constatações por componente
  const getCompItemResp = (comp: string, item: string) => {
    const it = data.itensAvaliadosDetalhados?.[`${comp}_${item}`];
    return it;
  };

  // 4.1 Usos
  const usosECaracteristicas = `Trata-se de uma barragem com tipologia em ${caracteristicasPrincipais.materialUtilizado}, com finalidade principal de uso voltada para ${caracteristicasPrincipais.usoAgua}.
O barramento se encontrava em condições visuais registradas na data de ${dataFormatada}. Crista com borda livre estimada em ${m.freeboardMeters ? m.freeboardMeters + ' m' : 'não informada'}.`;

  // 4.2 Talude de Montante
  const itMontEros = getCompItemResp('montante', 'erosoes');
  const itMontEscorr = getCompItemResp('montante', 'escorregamento');
  const itMontVeg = getCompItemResp('montante', 'arvores_arbustos');
  const taludeMontante = `O talude de montante foi vistoriado quanto à sua estabilidade e proteção superficial.
- Erosões: ${itMontEros ? formatResponseLabel(itMontEros.resposta) + (itMontEros.localizacaoDetalhe ? ` (${itMontEros.localizacaoDetalhe})` : '') : 'Não avaliado individualmente'}.
- Escorregamentos: ${itMontEscorr ? formatResponseLabel(itMontEscorr.resposta) + (itMontEscorr.localizacaoDetalhe ? ` (${itMontEscorr.localizacaoDetalhe})` : '') : 'Não observado'}.
- Presença de árvores/arbustos: ${itMontVeg ? formatResponseLabel(itMontVeg.resposta) : 'Não observado'}.
${data.componentsData['talude_montante']?.notes ? `Observações específicas do fiscal: ${data.componentsData['talude_montante'].notes}` : ''}`.trim();

  // 4.3 Coroamento
  const itCoroEros = getCompItemResp('coroamento', 'erosoes');
  const itCoroRach = getCompItemResp('coroamento', 'rachaduras');
  const itCoroAfund = getCompItemResp('coroamento', 'afundamento');
  const itCoroMeioFio = getCompItemResp('coroamento', 'meio_fio');
  const itCoroTransb = getCompItemResp('coroamento', 'ameaca_transbordamento');
  const coroamento = `O coroamento da barragem foi inspecionado ao longo de sua extensão de ${caracteristicasPrincipais.comprimento}.
- Erosões superficiais: ${itCoroEros ? formatResponseLabel(itCoroEros.resposta) : 'Não observado'}.
- Rachaduras ou trincas: ${itCoroRach ? formatResponseLabel(itCoroRach.resposta) + (itCoroRach.localizacaoDetalhe ? ` (${itCoroRach.localizacaoDetalhe})` : '') : 'Não observado'}.
- Afundamentos ou depressões: ${itCoroAfund ? formatResponseLabel(itCoroAfund.resposta) : 'Não observado'}.
- Meio-fio de drenagem: ${itCoroMeioFio ? formatResponseLabel(itCoroMeioFio.resposta) : 'Não informado'}.
- Ameaça de transbordamento (borda livre): ${itCoroTransb ? formatResponseLabel(itCoroTransb.resposta) : 'Adequada'}.
${data.componentsData['crista']?.notes ? `Observações específicas do fiscal: ${data.componentsData['crista'].notes}` : ''}`.trim();

  // 4.4 Talude de Jusante
  const itJusEros = getCompItemResp('jusante', 'erosoes');
  const itJusEscorr = getCompItemResp('jusante', 'escorregamento');
  const itJusFuga = getCompItemResp('jusante', 'fuga_agua');
  const itJusPiping = getCompItemResp('jusante', 'carregamento_material');
  const taludeJusante = `Verificação visual das condições do talude de jusante:
- Erosões e ravinamentos: ${itJusEros ? formatResponseLabel(itJusEros.resposta) : 'Não observado'}.
- Escorregamentos ou abatimentos: ${itJusEscorr ? formatResponseLabel(itJusEscorr.resposta) : 'Não observado'}.
- Fuga d'água, surgências ou áreas úmidas: ${itJusFuga ? formatResponseLabel(itJusFuga.resposta) + (itJusFuga.localizacaoDetalhe ? ` (${itJusFuga.localizacaoDetalhe})` : '') : 'Não observado'}.
- Carregamento de sólidos / piping: ${itJusPiping ? formatResponseLabel(itJusPiping.resposta) : 'Não observado'}.
${data.componentsData['talude_jusante']?.notes ? `Observações específicas do fiscal: ${data.componentsData['talude_jusante'].notes}` : ''}`.trim();

  // 4.5 Região à jusante
  const itRegConstrucao = getCompItemResp('regiao_jusante', 'construcoes_leito');
  const itRegFuga = getCompItemResp('regiao_jusante', 'fuga_agua');
  const itRegFaixa10 = getCompItemResp('regiao_jusante', 'arvores_faixa_10m');
  const regiaoJusante = `Esta região compreende o vale a jusante e a faixa de amortecimento de 10 metros medida a partir do pé do talude de jusante.
- Construções próximas ao leito do curso hídrico: ${itRegConstrucao ? formatResponseLabel(itRegConstrucao.resposta) : 'Não observado'}.
- Fuga d'água / percolação anormal além do pé: ${itRegFuga ? formatResponseLabel(itRegFuga.resposta) : 'Não observado'}.
- Árvores e arbustos na faixa de 10 m do pé: ${itRegFaixa10 ? formatResponseLabel(itRegFaixa10.resposta) : 'Não informado'}.
${data.componentsData['area_jusante']?.notes ? `Observações complementares: ${data.componentsData['area_jusante'].notes}` : ''}`.trim();

  // 4.6 Instrumentação
  const instrumentacao = `A barragem foi inspecionada quanto à presença de dispositivos de monitoramento geotécnico e hidráulico (piezômetros, marcos de recalque, medidores de vazão e réguas limnimétricas).
Constatação: Não foram observados instrumentos formais instalados na estrutura no momento da vistoria, salvo se declarado em projeto técnico.`;

  // 4.7 Estruturas extravasoras
  const estruturasExtravasoras = `Verificação do sistema extravasor de cheias (vertedouro e descarregadores):
Tipologia: ${d.spillwayType.replace(/_/g, ' ')}.
${data.componentsData['vertedouro']?.notes ? `Descrição em campo: ${data.componentsData['vertedouro'].notes}` : 'Estrutura inspecionada quanto à desobstrução e integridade da calha de descarga.'}`.trim();

  // 4.8 Reservatório
  const reservatorio = `O reservatório encontrava-se com acumulação compatível com o período.
${data.componentsData['reservatorio_borda']?.notes ? `Observações: ${data.componentsData['reservatorio_borda'].notes}` : 'Margens sem indícios de desmoronamentos generalizados ou assoreamento impeditivo no momento da inspeção.'}`.trim();

  // 5. Considerações Gerais
  const consideracoesGerais = c.generalFindings ||
`Assim como em propriedades rurais no Estado, recomenda-se a formalização contínua de acompanhamento técnico por profissional legalmente habilitado com a devida Anotação de Responsabilidade Técnica (ART).`;

  // 6. Anomalias Observadas
  const anomalias: string[] = [];
  if (data.itensAvaliadosDetalhados) {
    Object.values(data.itensAvaliadosDetalhados).forEach(it => {
      if (it.resposta === 'sim') {
        const det = it.localizacaoDetalhe ? ` (${it.localizacaoDetalhe})` : '';
        const obs = it.observacaoComplementar ? ` - ${it.observacaoComplementar}` : '';
        anomalias.push(`${it.itemRotuloOriginal}${det}${obs}`);
      }
    });
  }

  // Se não houver anomalias pelos itens detalhados, pega dos componentes
  if (anomalias.length === 0) {
    Object.values(data.componentsData).forEach(comp => {
      if (comp.condition === 'alerta' || comp.condition === 'critico') {
        if (comp.notes) {
          anomalias.push(`${comp.componentName}: ${comp.notes}`);
        }
      }
    });
  }

  // 7. Conclusão
  const conclusaoTexto = `${legal.responsabilidadeEmpreendedor.conteudoTexto}

${c.immediateSafetyMeasures ? `Medidas de segurança imediatas orientadas em campo:\n${c.immediateSafetyMeasures}\n\n` : ''}Em razão das constatações apontadas neste Auto de Inspeção, o empreendedor deverá providenciar o monitoramento contínuo das condições da barragem e realizar as correções necessárias sob a responsabilidade de profissional legalmente habilitado, de forma a garantir a segurança da estrutura e a preservação de vidas e recursos hídricos.`;

  // Texto consolidado oficial
  const textoCompletoFormatado = `================================================================================
Governo do Estado de Mato Grosso
SEMA - Secretaria de Estado de Meio Ambiente
AUTO DE INSPEÇÃO                                Nº: ${g.recordNumber || '13503000126'}
                                                DATA: ${dataFormatada}
================================================================================

NOME / RAZÃO SOCIAL: ${d.propertyOrBusinessName || 'Não informada'}
CNPJ / CPF: ${g.accompaniedBy.document || 'Não informado'}
ENDEREÇO PARA CORRESPONDÊNCIAS: ${d.municipality || 'Município de MT'} – MT
UF: MT    MUNICÍPIO: ${d.municipality || 'MT'}    TELEFONE: ${g.accompaniedBy.phone || 'Não informado'}

--------------------------------------------------------------------------------
LOCAL DA OCORRÊNCIA
--------------------------------------------------------------------------------
NOME FANTASIA: ${d.damName || d.propertyOrBusinessName || 'Barramento Vistoriado'}
ATIVIDADE: Barragem de acumulação de água para usos múltiplos
COORDENADAS GEOGRÁFICAS (SIRGAS 2000):
  LATITUDE ( S ): ${latGms || 'N/I'}
  LONGITUDE ( W ): ${lonGms || 'N/I'}
CURSO D'ÁGUA BARRADO: ${d.waterCourse || 'Não informado'}
MUNICÍPIO: ${d.municipality || 'MT'} – MT
Nº DO PROCESSO: ${g.recordNumber || 'Não informado'}

--------------------------------------------------------------------------------
1. OBJETIVO:
--------------------------------------------------------------------------------
${objetivoTexto}

--------------------------------------------------------------------------------
3. CARACTERÍSTICAS PRINCIPAIS DO BARRAMENTO
--------------------------------------------------------------------------------
3.1 Informações obtidas em vistoria:
- Altura do talude: ${caracteristicasPrincipais.alturaTalude}
- Comprimento: ${caracteristicasPrincipais.comprimento}
- Largura do coroamento: ${caracteristicasPrincipais.larguraCoroamento}
- Volume total aproximado: ${caracteristicasPrincipais.volumeTotal}
- Área de inundação estimada: ${caracteristicasPrincipais.areaInundacao}
- Capacidade / Tipo do vertedouro: ${caracteristicasPrincipais.capacidadeVertedouro}
- Material utilizado: ${caracteristicasPrincipais.materialUtilizado}
- Uso da água: ${caracteristicasPrincipais.usoAgua}
- Código SNISB: ${caracteristicasPrincipais.codigoSnisb}

--------------------------------------------------------------------------------
4. CONSTATAÇÕES
--------------------------------------------------------------------------------
4.1 Usos e características técnicas
${usosECaracteristicas}

4.2 Talude de montante
${taludeMontante}

4.3 Coroamento
${coroamento}

4.4 Talude de jusante
${taludeJusante}

4.5 Região à jusante da barragem
${regiaoJusante}

4.6 Instrumentação e monitoramento
${instrumentacao}

4.7 Estruturas extravasoras
${estruturasExtravasoras}

4.8 Reservatório
${reservatorio}

--------------------------------------------------------------------------------
5. CONSIDERAÇÕES E OBSERVAÇÕES GERAIS
--------------------------------------------------------------------------------
${consideracoesGerais}

--------------------------------------------------------------------------------
6. PRINCIPAIS ANOMALIAS OBSERVADAS
--------------------------------------------------------------------------------
${legal.reparacaoAnomalias.conteudoTexto}

${anomalias.length > 0 
  ? anomalias.map((a, i) => `${i + 1}. ${a}`).join('\n')
  : 'Não foram constatadas anomalias visuais severas aparentes no momento da vistoria.'}

--------------------------------------------------------------------------------
7. CONCLUSÃO
--------------------------------------------------------------------------------
${conclusaoTexto}

================================================================================
EQUIPE DE VISTORIA:
${g.inspectors.map(insp => `____________________________________________________\n${insp.name || 'Servidor Fiscal'}\n${insp.role || 'Analista de Meio Ambiente'} - Matrícula: ${insp.registrationNumber || 'N/I'}\nCSB / SRH / SEMA-MT`).join('\n\n')}

================================================================================
CONFIRMAÇÃO DE RECEBIMENTO:
NOME DO RESPONSÁVEL: ${g.accompaniedBy.hasAccompaniment ? g.accompaniedBy.name : '(Sem acompanhamento presencial)'}
CPF/RG: ${g.accompaniedBy.document || 'Não informado'}
VÍNCULO/CARGO: ${g.accompaniedBy.relationship || 'Não informado'}
LOCAL E DATA: ${d.municipality || 'Cuiabá'} - MT, ${dataFormatada}
ASSINATURA: __________________________________________________
[ ] Recusou-se a assinar
================================================================================
Página 1 de 1 • SIGA AUTUAÇÃO • SEMA-MT`;

  return {
    numeroAuto: g.recordNumber || 'S/N',
    dataEmissao: dataFormatada,
    versaoSistema: '1.3.13.10',
    empreendedor: {
      nomeRazaoSocial: d.propertyOrBusinessName || 'Não informada',
      cpfCnpj: g.accompaniedBy.document || 'Não informado',
      endereco: 'Não informado',
      numero: 'S/N',
      complemento: '',
      bairro: 'Zona Rural',
      uf: 'MT',
      municipio: d.municipality || 'Mato Grosso',
      cep: '78000-000',
      telefone: g.accompaniedBy.phone || 'Não informado'
    },
    localOcorrencia: {
      nomeFantasia: d.damName || 'Barramento Vistoriado',
      atividade: 'Barragem de acumulação de água para usos múltiplos',
      datum: d.coordinates.datum || 'SIRGAS 2000',
      latitudeGms: latGms,
      longitudeGms: lonGms,
      latitudeDecimal: latGms || d.coordinates.latitude || 'N/I',
      longitudeDecimal: lonGms || d.coordinates.longitude || 'N/I',
      enderecoEmpreendimento: 'Zona Rural',
      areaEmpreendimento: m.reservoirAreaHectares ? `${m.reservoirAreaHectares} ha` : 'Não informada',
      uf: 'MT',
      municipio: d.municipality || 'Mato Grosso',
      cep: '78000-000',
      telefone: g.accompaniedBy.phone || 'Não informado',
      numeroProcesso: g.recordNumber || 'Não informado'
    },
    objetivoTexto,
    caracteristicasPrincipais,
    constatacoesPorComponente: {
      usosECaracteristicas,
      taludeMontante,
      coroamento,
      taludeJusante,
      regiaoJusante,
      instrumentacao,
      estruturasExtravasoras,
      reservatorio
    },
    consideracoesGerais,
    anomaliasObservadas: anomalias,
    citacaoLegalAnomalias: legal.reparacaoAnomalias.conteudoTexto,
    conclusaoTexto,
    equipeFiscalizacao: g.inspectors.map(i => ({
      nome: i.name || 'Servidor Fiscalizador',
      cargo: i.role || 'Analista de Meio Ambiente',
      matricula: i.registrationNumber || 'N/I'
    })),
    confirmacaoRecebimento: {
      nomeResponsavel: g.accompaniedBy.name || 'Não identificado',
      documento: g.accompaniedBy.document || 'N/I',
      cargo: g.accompaniedBy.relationship || 'Representante',
      localData: `${d.municipality || 'Cuiabá'} - MT, ${dataFormatada}`,
      recusouAssinar: false
    },
    textoCompletoFormatado
  };
}
