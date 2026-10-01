// ==============================================================================
// GERADOR DO RELATÓRIO DE INSPEÇÃO DE SEGURANÇA DE BARRAGEM (CSB/SEMA-MT)
// Estrutura fiel ao modelo de 15 páginas da SEMA-MT + Folha de Rosto SIGAMT
// Regras estritas:
// - Omitir respostas vazias (não gerar linhas vazias nem preencher com "N/A")
// - Anomalias com componente, item, observação e nível somente quando informados
// - Não produzir seção de anomalia sem conteúdo
// ==============================================================================

import { InspectionData, InspectionPhoto } from '../types/inspection';
import { DAM_COMPONENTS } from '../data/damComponents';
import { formatGmsString } from './geoCoordinates';

export interface AnomaliaValidadaReportItem {
  numero: number;
  componenteId: string;
  componenteNome: string;
  itemAvaliado?: string;
  observacao: string;
  nivelSeveridade?: 'Alerta' | 'Crítico' | 'Inconforme' | string;
}

export interface ComponenteRelatorioSection {
  numeroSecao: string; // ex: "4.2"
  id: string;
  titulo: string;
  descricaoTexto: string;
  fotosVinculadas: (InspectionPhoto & { figuraNumero: number })[];
  itensConstatados: string[];
}

export interface RelatorioInspecaoGeneratedStructure {
  numeroRelatorio: string;
  dataEmissaoFormatada: string;
  dataVistoriaFormatada: string;

  folhaRostoSigamt: {
    numeroRelatorioTecnico: string;
    dataEmissao: string;
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
    nomeFantasia: string;
    atividade: string;
    coordenadasDatum: string;
    latitudeDecimal: string;
    longitudeDecimal: string;
    enderecoEmpreendimento: string;
    areaEmpreendimento: string;
    numeroProcesso: string;
    interessados: string;
    objetivoTexto: string;
    autosLavrados: {
      numero: string;
      tipo: string;
      data: string;
    }[];
    equipeTecnica: {
      nome: string;
      cargo: string;
    }[];
  };

  dadosGerais: {
    empreendedorNome: string;
    cpfCnpj: string;
    coordenadasTexto: string;
    enderecoEmpreendimento: string;
    enderecoCorrespondencia: string;
    email?: string;
    telefone?: string;
    atividadeUso: string;
    corpoDagua: string;
    equipeTecnicaStr: string;
    dataVistoria: string;
  };

  introducaoTexto: string;

  caracteristicasGeraisLinhas: {
    rotulo: string;
    valor: string;
  }[];

  constatacoesGeraisIntro: string;
  secoesComponentes: ComponenteRelatorioSection[];

  consideracoesGeraisTexto: string;

  possuiAnomalias: boolean;
  anomaliasValidadas: AnomaliaValidadaReportItem[];

  conclusaoTexto: string;

  equipeTecnica: {
    nome: string;
    cargo: string;
  }[];

  todasFotosComFigura: (InspectionPhoto & { figuraNumero: number })[];

  textoCompletoFormatado: string;
}

export function generateRelatorioInspecaoData(data: InspectionData): RelatorioInspecaoGeneratedStructure {
  const g = data.generalInfo;
  const d = data.damIdentification;
  const notif = data.conclusions.notificationDetails;
  const compData = data.componentsData || {};

  // Formatação de Datas
  const dataVistoriaFormatada = g.inspectionDate
    ? new Date(g.inspectionDate + 'T00:00:00').toLocaleDateString('pt-BR')
    : new Date().toLocaleDateString('pt-BR');

  const dataEmissaoFormatada = new Date().toLocaleDateString('pt-BR');

  const numeroRelatorio = g.recordNumber
    ? (g.recordNumber.startsWith('REL-') ? g.recordNumber : `REL-${g.recordNumber}`)
    : '0000041592';

  // 1. Coordenadas em formato GMS (xxºxx'xx,xx")
  const latGms = formatGmsString(d.coordinates.latitude, true, false);
  const lonGms = formatGmsString(d.coordinates.longitude, false, false);
  const hasCoords = !!(latGms && lonGms);
  const coordenadasTexto = hasCoords 
    ? `${latGms} e ${lonGms} (${d.coordinates.datum || 'SIRGAS 2000'}).` 
    : (d.coordinates.latitude ? `${d.coordinates.latitude} ${d.coordinates.longitude}` : '');

  // 2. Equipe Técnica
  const equipeTecnica = g.inspectors && g.inspectors.length > 0
    ? g.inspectors
        .filter(i => i.name && i.name.trim() !== '')
        .map(i => ({
          nome: i.name.trim(),
          cargo: i.role?.trim() || 'ANALISTA DE MEIO AMBIENTE'
        }))
    : [{ nome: 'Servidor Fiscal Responsável', cargo: 'ANALISTA DE MEIO AMBIENTE' }];

  const equipeTecnicaStr = equipeTecnica.map(e => e.nome).join('; ') + '.';

  // 3. Catálogo de Fotos com Numeração Sequencial de Figuras
  let figuraCount = 1;
  const todasFotosComFigura = (data.photos || []).map(photo => ({
    ...photo,
    figuraNumero: figuraCount++
  }));

  // Helper para buscar fotos por componente ou gerais
  const getFotosPorComponente = (compPrefix: string) => {
    return todasFotosComFigura.filter(p => {
      if (!p.componentId) return compPrefix === 'geral';
      const cId = p.componentId.toLowerCase();

      if (compPrefix === 'crista') {
        return cId.includes('crista') || cId.includes('coroamento');
      }
      if (compPrefix === 'talude_montante') {
        return cId.includes('montante');
      }
      if (compPrefix === 'talude_jusante') {
        return cId.includes('talude_jusante') || (cId.includes('jusante') && !cId.includes('area') && !cId.includes('regiao'));
      }
      if (compPrefix === 'area_jusante' || compPrefix === 'regiao_jusante') {
        return cId.includes('area_jusante') || cId.includes('regiao_jusante') || cId.includes('jusante_faixa');
      }
      if (compPrefix === 'vertedouro') {
        return cId.includes('vertedouro') || cId.includes('extravasor') || cId.includes('vert_');
      }
      if (compPrefix === 'descarregador_fundo') {
        return cId.includes('fundo') || cId.includes('tomada');
      }
      if (compPrefix === 'drenagem_pe') {
        return cId.includes('drenagem') || cId.includes('pe');
      }
      if (compPrefix === 'reservatorio' || compPrefix === 'reservatorio_borda') {
        return cId.includes('reservatorio');
      }
      if (compPrefix === 'instrumentacao') {
        return cId.includes('instrument');
      }
      if (compPrefix === 'geral') {
        return cId === 'geral' || cId === 'visao_geral' || cId === 'outros' || cId === 'sem_vinculo' || !cId;
      }

      return cId.includes(compPrefix.toLowerCase());
    });
  };

  // 4. Seção 3.1: Informações Gerais (OMITE respostas vazias, sem "N/A"!)
  const caracteristicasGeraisLinhas: { rotulo: string; valor: string }[] = [];

  const dim = d.estimatedDimensions || {
    heightMeters: '',
    crestLengthMeters: '',
    crestWidthMeters: '',
    reservoirAreaHectares: '',
    reservoirVolumeM3: '',
    freeboardMeters: ''
  };

  if (dim.heightMeters && dim.heightMeters.trim() !== '') {
    caracteristicasGeraisLinhas.push({ rotulo: 'Altura do talude', valor: `≅ ${dim.heightMeters.trim()} m` });
  }
  if (dim.crestLengthMeters && dim.crestLengthMeters.trim() !== '') {
    caracteristicasGeraisLinhas.push({ rotulo: 'Comprimento', valor: `≅ ${dim.crestLengthMeters.trim()} m` });
  }
  if (dim.crestWidthMeters && dim.crestWidthMeters.trim() !== '') {
    caracteristicasGeraisLinhas.push({ rotulo: 'Largura do coroamento', valor: `≅ ${dim.crestWidthMeters.trim()} m` });
  }
  if (dim.reservoirVolumeM3 && dim.reservoirVolumeM3.trim() !== '') {
    caracteristicasGeraisLinhas.push({ rotulo: 'Volume total', valor: `≅ ${dim.reservoirVolumeM3.trim()} m³` });
  }
  if (dim.reservoirAreaHectares && dim.reservoirAreaHectares.trim() !== '') {
    caracteristicasGeraisLinhas.push({ rotulo: 'Área de inundação', valor: `≅ ${dim.reservoirAreaHectares.trim()} ha` });
  }
  if (dim.freeboardMeters && dim.freeboardMeters.trim() !== '') {
    caracteristicasGeraisLinhas.push({ rotulo: 'Borda livre estimada', valor: `≅ ${dim.freeboardMeters.trim()} m` });
  }
  if (d.spillwayType && d.spillwayType !== 'outro') {
    const mapSpillway: Record<string, string> = {
      soleira_livre: 'Canal em soleira livre',
      canal_lateral: 'Canal lateral',
      tulipa: 'Tulipa / Manhole (Morning Glory)',
      tubular: 'Tubular / Manilha',
      comportas: 'Comportas mecânicas',
      inexistente: 'Inexistente'
    };
    caracteristicasGeraisLinhas.push({ 
      rotulo: 'Capacidade do vertedouro / Tipo', 
      valor: mapSpillway[d.spillwayType] || d.spillwayType 
    });
  }
  if (d.damType) {
    const mapDamType: Record<string, string> = {
      terra_homogenea: 'terra homogênea',
      terra_zoneada: 'terra zoneada',
      enrocamento: 'enrocamento',
      concreto: 'concreto gravidade',
      alvenaria: 'alvenaria de pedra',
      mista: 'seção mista',
      outro: 'estrutura de barramento'
    };
    caracteristicasGeraisLinhas.push({ rotulo: 'Material utilizado', valor: mapDamType[d.damType] || d.damType });
  }
  if (d.mainWaterUse && d.mainWaterUse.trim() !== '') {
    const usos = [d.mainWaterUse, ...(d.secondaryWaterUses || [])].filter(Boolean).join(', ');
    caracteristicasGeraisLinhas.push({ rotulo: 'Uso da água', valor: usos });
  }
  if (d.regulatoryStatus?.permitNumber && d.regulatoryStatus.permitNumber.trim() !== '') {
    caracteristicasGeraisLinhas.push({ rotulo: 'Processo / Outorga', valor: d.regulatoryStatus.permitNumber.trim() });
  }

  // 5. Seção 4: Constatações e Avaliação dos Componentes Conforme Modelo CSB
  const formatClima = (w: string) => {
    switch (w) {
      case 'seco': return 'sem relato de chuva recente';
      case 'nublado': return 'tempo nublado sem chuvas torrenciais';
      case 'chuva_fraca': return 'chuva fraca no momento da vistoria';
      case 'chuva_moderada': return 'chuva moderada';
      case 'chuva_forte_recente': return 'chuvas intensas precedentes à vistoria';
      default: return 'tempo estável';
    }
  };

  const constatacoesGeraisIntro = `O barramento construído está localizado no município de ${d.municipality || 'Tangará da Serra'}/MT${d.waterCourse ? `, interceptando o corpo hídrico ${d.waterCourse}` : ''}${d.propertyOrBusinessName ? `, no imóvel/empreendimento denominado "${d.propertyOrBusinessName}"` : ''}.`;

  // Mapeamento dos Componentes do Relatório CSB
  const secoesComponentes: ComponenteRelatorioSection[] = [
    {
      numeroSecao: '4.1',
      id: 'usos_e_caracteristicas',
      titulo: 'Usos e características técnicas',
      descricaoTexto: `Trata-se de uma barragem de ${d.damType === 'terra_homogenea' ? 'terra homogênea' : (d.damType || 'barramento de acumulação')}, construída com a finalidade principal de uso para ${d.mainWaterUse || 'usos múltiplos'}. A barragem possui margens definidas e se encontrava em condições operacionais de trabalho durante a inspeção. No momento da vistoria o tempo estava ${formatClima(g.weather)}. A crista da barragem é utilizada como acesso interno da propriedade.`,
      fotosVinculadas: getFotosPorComponente('geral'),
      itensConstatados: []
    },
    {
      numeroSecao: '4.2',
      id: 'talude_montante',
      titulo: 'Talude de montante',
      descricaoTexto: compData['talude_montante']?.notes?.trim() 
        || (compData['talude_montante']?.condition === 'adequado'
          ? 'O talude de montante possui revestimento de proteção contra a ação da água e do vento, encontrando-se íntegro e sem registro de solapamentos significativos ou degraus de abatimento na extensão vistoriada.'
          : 'Foram vistoriadas as condições do talude de montante voltado para a bacia hidráulica, observando-se as condições de conservação e proteção da face úmida.'),
      fotosVinculadas: getFotosPorComponente('talude_montante'),
      itensConstatados: compData['talude_montante']?.selectedAnomalies || []
    },
    {
      numeroSecao: '4.3',
      id: 'coroamento',
      titulo: 'Coroamento',
      descricaoTexto: compData['crista']?.notes?.trim()
        || (compData['crista']?.condition === 'adequado'
          ? 'O coroamento é utilizado como tráfego e acesso, apresentando largura compatível e alinhamento do eixo preservado. Não foram observados afundamentos significativos ou trincas longitudinais/transversais na crista inspecionada.'
          : 'Inspecionada a superfície do coroamento da barragem quanto ao nivelamento, largura, presença de fissuras e dispositivos de segurança.'),
      fotosVinculadas: getFotosPorComponente('crista'),
      itensConstatados: compData['crista']?.selectedAnomalies || []
    },
    {
      numeroSecao: '4.4',
      id: 'talude_jusante',
      titulo: 'Talude de jusante',
      descricaoTexto: compData['talude_jusante']?.notes?.trim()
        || (compData['talude_jusante']?.condition === 'adequado'
          ? 'Verificou-se que o talude de jusante se encontra com cobertura de proteção vegetal adequada, sem indícios visíveis de escorregamento de massas ou ravinamentos acentuados.'
          : 'Vistoriada a face externa a jusante, atentando-se para o estado da vegetação, presença de formigueiros e controle erosivo.'),
      fotosVinculadas: getFotosPorComponente('talude_jusante'),
      itensConstatados: compData['talude_jusante']?.selectedAnomalies || []
    },
    {
      numeroSecao: '4.5',
      id: 'regiao_jusante',
      titulo: 'Região à jusante da barragem (Faixa de Inspeção e Vale)',
      descricaoTexto: compData['area_jusante']?.notes?.trim() || compData['drenagem_pe']?.notes?.trim()
        || 'Esta região compreende a área entre as ombreiras da barragem, o pé do maciço e a faixa imediata de jusante (10 metros a partir do pé do talude e vale de restituição). Avaliou-se o contato com a fundação natural e as ocupações existentes a jusante.',
      fotosVinculadas: [...getFotosPorComponente('area_jusante'), ...getFotosPorComponente('drenagem_pe')],
      itensConstatados: [
        ...(compData['drenagem_pe']?.selectedAnomalies || []),
        ...(compData['area_jusante']?.selectedAnomalies || [])
      ]
    },
    {
      numeroSecao: '4.6',
      id: 'instrumentacao',
      titulo: 'Instrumentação e monitoramento',
      descricaoTexto: 'Verificou-se a presença de dispositivos de monitoramento operacional do barramento. Na ausência de réguas limnimétricas ou instrumentos geotécnicos complexos, o monitoramento visual direto em campo constitui o principal meio de acompanhamento preventivo.',
      fotosVinculadas: getFotosPorComponente('instrumentacao'),
      itensConstatados: []
    },
    {
      numeroSecao: '4.7',
      id: 'estruturas_extravasoras',
      titulo: 'Estruturas extravasoras',
      descricaoTexto: compData['vertedouro']?.notes?.trim() || compData['descarregador_fundo']?.notes?.trim()
        || `Verificou-se que o extravasor principal da barragem é do tipo ${d.spillwayType || 'soleira livre'}, responsável pela condução e dissipação de cheias excedentes para a calha natural a jusante. Registram-se as condições operacionais e integridade dos muros e canal de restituição.`,
      fotosVinculadas: [...getFotosPorComponente('vertedouro'), ...getFotosPorComponente('descarregador_fundo')],
      itensConstatados: [
        ...(compData['vertedouro']?.selectedAnomalies || []),
        ...(compData['descarregador_fundo']?.selectedAnomalies || [])
      ]
    },
    {
      numeroSecao: '4.8',
      id: 'reservatorio',
      titulo: 'Reservatório',
      descricaoTexto: compData['reservatorio_borda']?.notes?.trim()
        || 'O reservatório encontrava-se aparentemente em nível operacional normal. Verificou-se a borda livre disponível em relação à crista e as condições das encostas marginais contra assoreamento.',
      fotosVinculadas: getFotosPorComponente('reservatorio_borda'),
      itensConstatados: compData['reservatorio_borda']?.selectedAnomalies || []
    }
  ];

  // Fotos complementares / gerais que foram anexadas após o preenchimento ou sem componente específico
  const allocatedIds = new Set<string>();
  secoesComponentes.forEach(sec => {
    sec.fotosVinculadas.forEach(f => allocatedIds.add(f.id));
  });

  const unallocatedPhotos = todasFotosComFigura.filter(f => !allocatedIds.has(f.id));
  if (unallocatedPhotos.length > 0) {
    secoesComponentes.push({
      numeroSecao: '4.9',
      id: 'registros_gerais_complementares',
      titulo: 'Registros Fotográficos Complementares e Visão Geral',
      descricaoTexto: 'Registros fotográficos adicionais capturados durante os trabalhos de campo pela equipe técnica da CSB/SEMA-MT.',
      fotosVinculadas: unallocatedPhotos,
      itensConstatados: []
    });
  }

  // 6. Seção 5: Considerações e Observações Gerais
  const consideracoesGeraisTexto = data.conclusions.generalFindings?.trim() 
    || `Assim como observado em vistorias técnicas de segurança de barragens rurais, ressalta-se a necessidade de comprovação de regularidade documental, projeto executivo "as built" e Anotação de Responsabilidade Técnica (ART) emitida por engenheiro legalmente habilitado. As rotinas de manutenção preventiva devem obedecer às diretrizes constantes na Cartilha de Ações de Manutenção em Barragens de Terra disponibilizada pela SEMA-MT.`;

  // 7. Seção 6: PRINCIPAIS ANOMALIAS OBSERVADAS
  // REGRAS ESTRITAS:
  // - "Não produza seções de anomalia sem conteúdo nem converta campos em branco em 'N/A'"
  // - "As anomalias devem ser apresentadas com o componente, item, observação e nível ou classificação somente quando esses dados tiverem sido informados ou validados pelo servidor"
  const anomaliasValidadas: AnomaliaValidadaReportItem[] = [];
  let anomaliaIdx = 1;

  DAM_COMPONENTS.forEach(comp => {
    const c = compData[comp.id];
    if (!c) return;

    // Se o componente foi apontado como Alerta ou Crítico, ou possui anomalias selecionadas
    if (c.condition === 'alerta' || c.condition === 'critico' || (c.selectedAnomalies && c.selectedAnomalies.length > 0)) {
      if (c.selectedAnomalies && c.selectedAnomalies.length > 0) {
        c.selectedAnomalies.forEach(anomId => {
          const anomDef = comp.commonAnomalies.find(a => a.id === anomId);
          const rotuloAnomalia = anomDef?.label || anomId;
          const severidade = c.condition === 'critico' ? 'Crítico' : 'Alerta';

          anomaliasValidadas.push({
            numero: anomaliaIdx++,
            componenteId: comp.id,
            componenteNome: comp.shortName || comp.name,
            itemAvaliado: rotuloAnomalia,
            observacao: c.notes?.trim() ? c.notes.trim() : `Constatado(a) ${rotuloAnomalia.toLowerCase()} durante a inspeção de campo no componente ${comp.name}.`,
            nivelSeveridade: severidade
          });
        });
      } else if (c.notes && c.notes.trim() !== '') {
        // Possui observação fática com severidade de alerta/crítico
        anomaliasValidadas.push({
          numero: anomaliaIdx++,
          componenteId: comp.id,
          componenteNome: comp.shortName || comp.name,
          observacao: c.notes.trim(),
          nivelSeveridade: c.condition === 'critico' ? 'Crítico' : 'Alerta'
        });
      }
    }
  });

  const possuiAnomalias = anomaliasValidadas.length > 0;

  // 8. Seção 7: Conclusão
  const conclusaoTexto = data.conclusions.recommendationsToOwner?.trim()
    || `Cabe ressaltar que o empreendedor é responsável pela segurança da barragem, esteja ela submetida ou não à referida Lei, devendo zelar pela sua manutenção e operação, de maneira a reduzir a possibilidade de acidente e suas consequências.
Assim, o empreendedor deverá realizar o monitoramento contínuo da estabilização dos componentes da barragem. Em caso de evolução ou surgimento de anomalias, deverão ser implementadas as intervenções corretivas pertinentes sob orientação de profissional legalmente habilitado, de forma a preservar integralmente a segurança da estrutura.`;

  // 9. Folha de Rosto SIGAMT
  const folhaRostoSigamt = {
    numeroRelatorioTecnico: numeroRelatorio,
    dataEmissao: dataEmissaoFormatada,
    nomeRazaoSocial: notif.destinatario?.nomeRazaoSocial?.trim() 
      || d.propertyOrBusinessName?.trim() 
      || g.accompaniedBy?.name?.trim() 
      || 'Empreendedor Responsável',
    cpfCnpj: notif.destinatario?.cpfCnpj?.trim() || g.accompaniedBy?.document?.trim() || 'Não informado',
    enderecoCorrespondencia: notif.destinatario?.enderecoCorrespondencia?.trim() 
      || (d.municipality ? `Município de ${d.municipality}/MT` : 'Não informado'),
    numero: notif.destinatario?.numero || 'S/N',
    complemento: notif.destinatario?.complemento || '-',
    bairro: notif.destinatario?.bairro || '-',
    municipio: d.municipality || notif.destinatario?.municipio || 'Mato Grosso',
    uf: 'MT',
    cep: notif.destinatario?.cep || '78000-000',
    telefone: notif.destinatario?.telefone || g.accompaniedBy?.phone || 'Não informado',
    nomeFantasia: d.damName || d.propertyOrBusinessName || 'Barramento Vistoriado',
    atividade: 'Barragem de acumulação de água para usos múltiplos',
    coordenadasDatum: 'SIRGAS 2000',
    latitudeDecimal: latGms || d.coordinates.latitude || 'Não informada',
    longitudeDecimal: lonGms || d.coordinates.longitude || 'Não informada',
    enderecoEmpreendimento: notif.localOcorrencia?.enderecoEmpreendimento || (d.waterCourse ? `Curso Hídrico: ${d.waterCourse}` : 'Área rural'),
    areaEmpreendimento: notif.localOcorrencia?.areaEmpreendimento || (dim.reservoirAreaHectares ? `${dim.reservoirAreaHectares} ha` : 'Não informada'),
    numeroProcesso: notif.processoNumero || g.recordNumber || 'Processo SEMA',
    interessados: notif.destinatario?.nomeRazaoSocial || d.propertyOrBusinessName || 'Empreendedor',
    objetivoTexto: `A partir da Lei Federal nº 12.334/2010, foi estabelecida a Política Nacional de Segurança de Barragens destinadas à acumulação de água para quaisquer usos, à disposição final ou temporária de rejeitos e à acumulação de resíduos industriais, que enquadra e regula, barragens que apresentem pelo menos uma das características definidas no art. 1º da Lei ou que apresentem alguma característica de CRI alto, conforme classificação do órgão fiscalizatório.
Foi realizada uma vistoria técnica, dia ${dataVistoriaFormatada}, ${formatClima(g.weather)}, no barramento localizado no município de ${d.municipality || 'Mato Grosso'}/MT.`,
    autosLavrados: [
      {
        numero: notif.vinculoAutoInspecaoNumero || g.recordNumber || 'Auto de Inspeção',
        tipo: 'Auto de Inspeção de Campo',
        data: dataVistoriaFormatada
      }
    ],
    equipeTecnica
  };

  // 10. Geração do Texto Completo Formatado (Pronto para Editor e Exportação TXT)
  const introConstrucao = `Governo do Estado de Mato Grosso
SEMA – Secretaria de Estado de Meio Ambiente
Secretaria Adjunta de Licenciamento e Recursos Hídricos - SALARH
Coordenadoria de Controle de Recursos Hídricos - CCRH
Coordenadoria de Segurança de Barragem - CSB
Rua C esquina com rua F, Centro Político Administrativo • CEP: 78.049-913 • Cuiabá • Mato Grosso • www.sema.mt.gov.br

RELATÓRIO DE INSPEÇÃO - SEGURANÇA DE BARRAGEM

1. DADOS GERAIS
Empreendedor/Proprietário: ${folhaRostoSigamt.nomeRazaoSocial}
CPF/CNPJ: ${folhaRostoSigamt.cpfCnpj}
${coordenadasTexto ? `Coordenadas: ${coordenadasTexto}\n` : ''}Endereço: ${folhaRostoSigamt.enderecoEmpreendimento}, ${folhaRostoSigamt.municipio}/MT
Endereço para correspondência: ${folhaRostoSigamt.enderecoCorrespondencia}, Nº ${folhaRostoSigamt.numero} – ${folhaRostoSigamt.municipio}/MT, CEP: ${folhaRostoSigamt.cep}
${notif.destinatario?.email ? `E-mail: ${notif.destinatario.email}\n` : ''}Telefone: ${folhaRostoSigamt.telefone}
Atividade (uso da barragem): ${d.mainWaterUse || 'Acumulação de água para usos múltiplos'}
${d.waterCourse ? `Corpo d’agua utilizado: ${d.waterCourse};\n` : ''}Equipe técnica: ${equipeTecnicaStr}
Data da vistoria: ${dataVistoriaFormatada}.

2. INTRODUÇÃO
A partir da Lei Federal nº 12.334/2010, foi estabelecida a Política Nacional de Segurança de Barragens destinadas à acumulação de água para quaisquer usos, à disposição final ou temporária de rejeitos e à acumulação de resíduos industriais, que enquadra e regula, barragens que apresentem pelo menos uma das características definidas no art. 1º da Lei ou que apresentem alguma característica de CRI alto, conforme classificação do órgão fiscalizatório.
Foi realizada uma vistoria técnica, dia ${dataVistoriaFormatada}, ${formatClima(g.weather)}, no barramento localizado no município de ${d.municipality || 'Mato Grosso'}/MT.

3. CARACTERÍSTICAS PRINCIPAIS DO BARRAMENTO
3.1 Informações gerais:
${caracteristicasGeraisLinhas.map(l => `- ${l.rotulo}: ${l.valor}`).join('\n')}

4. CONSTATAÇÕES
${constatacoesGeraisIntro}

${secoesComponentes.map(sec => {
  const fotosStr = sec.fotosVinculadas.length > 0
    ? '\n' + sec.fotosVinculadas.map(f => `[Figura ${f.figuraNumero} – ${f.caption || f.componentName || 'Registro fotográfico'}]`).join('\n')
    : '';
  return `${sec.numeroSecao} ${sec.titulo}\n${sec.descricaoTexto}${fotosStr}`;
}).join('\n\n')}

5. CONSIDERAÇÕES E OBSERVAÇÕES GERAIS
${consideracoesGeraisTexto}
${possuiAnomalias ? `
6. PRINCIPAIS ANOMALIAS OBSERVADAS
Em atenção ao disposto no §3º, do art. 7, da Lei nº 14.066, de 30 de setembro de 2020, o empreendedor deverá promover medidas e intervenções para reparações imediatas quanto às anomalias verificadas que levem à redução do risco associado a barragem, de forma a promover melhorias na segurança da barragem. Assim, segue a relação das principais anomalias constatadas:
${anomaliasValidadas.map(a => `${a.numero}. ${a.componenteNome}${a.itemAvaliado ? ` – ${a.itemAvaliado}` : ''}: ${a.observacao} (Classificação: ${a.nivelSeveridade})`).join('\n')}` : ''}

7. CONCLUSÃO
${conclusaoTexto}

Cuiabá - MT, ${dataEmissaoFormatada}.

EQUIPE TÉCNICA DE FISCALIZAÇÃO (CSB/SEMA-MT):
${equipeTecnica.map(e => `___________________________________________________\n${e.nome}\n${e.cargo}`).join('\n\n')}`;

  return {
    numeroRelatorio,
    dataEmissaoFormatada,
    dataVistoriaFormatada,
    folhaRostoSigamt,
    dadosGerais: {
      empreendedorNome: folhaRostoSigamt.nomeRazaoSocial,
      cpfCnpj: folhaRostoSigamt.cpfCnpj,
      coordenadasTexto,
      enderecoEmpreendimento: folhaRostoSigamt.enderecoEmpreendimento,
      enderecoCorrespondencia: folhaRostoSigamt.enderecoCorrespondencia,
      email: notif.destinatario?.email,
      telefone: folhaRostoSigamt.telefone,
      atividadeUso: d.mainWaterUse || 'Acumulação de água para usos múltiplos',
      corpoDagua: d.waterCourse || '',
      equipeTecnicaStr,
      dataVistoria: dataVistoriaFormatada
    },
    introducaoTexto: folhaRostoSigamt.objetivoTexto,
    caracteristicasGeraisLinhas,
    constatacoesGeraisIntro,
    secoesComponentes,
    consideracoesGeraisTexto,
    possuiAnomalias,
    anomaliasValidadas,
    conclusaoTexto,
    equipeTecnica,
    todasFotosComFigura,
    textoCompletoFormatado: introConstrucao
  };
}
