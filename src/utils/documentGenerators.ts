import { DAM_COMPONENTS } from '../data/damComponents';
import { InspectionData } from '../types/inspection';
import { formatGmsString } from './geoCoordinates';

const DISCLAIMER_NOTICE = 
`[MINUTA PRELIMINAR DE DOCUMENTO DE CAMPO – COORDENADORIA DE SEGURANÇA DE BARRAGENS / SEMA-MT]
Este documento constitui minuta técnica gerada com base nos dados e registros coletados em campo. Não constitui decisão administrativa automática, ato sancionatório ou classificação definitiva de risco/dano potencial (CRI/DPA/PNSB), cabendo estritamente a conferência, revisão, complementação e assinatura do servidor público fiscalizador responsável no âmbito do respectivo processo administrativo da SEMA-MT.`;

export function generateAutoInspecaoText(data: InspectionData): string {
  const g = data.generalInfo;
  const d = data.damIdentification;
  const inspectorsStr = g.inspectors
    .filter(i => i.name.trim() !== '')
    .map(i => `${i.name} (${i.role || 'Fiscal'}, Matrícula: ${i.registrationNumber || 'N/I'})`)
    .join('; ') || 'Servidor(a) da SEMA-MT';

  const companionStr = g.accompaniedBy.hasAccompaniment
    ? `${g.accompaniedBy.name || 'Não identificado'} (Vínculo: ${g.accompaniedBy.relationship || 'Não informado'}, Doc: ${g.accompaniedBy.document || 'N/I'}, Tel: ${g.accompaniedBy.phone || 'N/I'})`
    : 'Vistoria realizada sem acompanhamento de preposto ou proprietário no local.';

  const coords = d.coordinates.latitude && d.coordinates.longitude
    ? `Lat: ${formatGmsString(d.coordinates.latitude, true, false)}, Long: ${formatGmsString(d.coordinates.longitude, false, false)} (${d.coordinates.datum || 'SIRGAS 2000'}${d.coordinates.accuracyMeters ? `, precisão GPS: ±${d.coordinates.accuracyMeters.toFixed(1)}m` : ''})`
    : 'Coordenadas não informadas.';

  // Resumo de anomalias por componente
  const anomaliesSummary: string[] = [];
  DAM_COMPONENTS.forEach(comp => {
    const compData = data.componentsData[comp.id];
    if (compData && (compData.condition === 'alerta' || compData.condition === 'critico')) {
      const statusLabel = compData.condition === 'critico' ? '[CRÍTICO]' : '[ALERTA]';
      const notes = compData.notes ? ` - ${compData.notes}` : '';
      anomaliesSummary.push(`• ${comp.name}: Situação ${statusLabel}${notes}`);
    }
  });

  return `${DISCLAIMER_NOTICE}

ESTADO DE MATO GROSSO
SECRETARIA DE ESTADO DE MEIO AMBIENTE – SEMA-MT
SUPERINTENDÊNCIA DE RECURSOS HÍDRICOS / COORDENADORIA DE SEGURANÇA DE BARRAGENS (CSB)

AUTO DE INSPEÇÃO TÉCNICA DE CAMPO Nº ${g.recordNumber || 'S/N - VISTORIA DE CAMPO'}

1. DADOS DA FISCALIZAÇÃO:
• Data da vistoria: ${g.inspectionDate ? new Date(g.inspectionDate + 'T00:00:00').toLocaleDateString('pt-BR') : 'Data não informada'}
• Horário: início às ${g.startTime || '--:--'} | término às ${g.endTime || '--:--'}
• Condições climáticas: ${formatWeather(g.weather)}
• Servidor(es) vistoriador(es): ${inspectorsStr}
• Unidade de lotação: Coordenadoria de Segurança de Barragens (CSB / SRH / SEMA-MT)

2. IDENTIFICAÇÃO DO BARRAMENTO E IMÓVEL:
• Denominação do Barramento: ${d.damName || 'Não informada'}
• Propriedade / Empreendimento: ${d.propertyOrBusinessName || 'Não informada'}
• Município / UF: ${d.municipality || 'Município de MT'} – MT
• Bacia Hidrográfica: ${d.hydrographicBasin || 'Não informada'}
• Curso Hídrico Barrado: ${d.waterCourse || 'Não informado'}
• Coordenadas Geográficas: ${coords}
• Uso principal da água: ${d.mainWaterUse || 'Acumulação de água para usos múltiplos'}
• Tipo de estrutura do barramento: ${formatDamType(d.damType)}

3. DIMENSÕES ESTIMADAS EM CAMPO:
• Altura máxima aproximada do maciço: ${d.estimatedDimensions.heightMeters ? d.estimatedDimensions.heightMeters + ' m' : 'Não informada'}
• Comprimento da crista: ${d.estimatedDimensions.crestLengthMeters ? d.estimatedDimensions.crestLengthMeters + ' m' : 'Não informado'}
• Largura média da crista: ${d.estimatedDimensions.crestWidthMeters ? d.estimatedDimensions.crestWidthMeters + ' m' : 'Não informada'}
• Borda livre estimada no momento: ${d.estimatedDimensions.freeboardMeters ? d.estimatedDimensions.freeboardMeters + ' m' : 'Não informada'}
• Volume acumulado estimado: ${d.estimatedDimensions.reservoirVolumeM3 ? d.estimatedDimensions.reservoirVolumeM3 + ' m³' : 'Não informado'}
• Tipo de extravasor (vertedouro): ${formatSpillwayType(d.spillwayType)}

4. ACOMPANHAMENTO DA INSPEÇÃO:
• Acompanhado por: ${companionStr}

5. PRINCIPAIS CONSTATAÇÕES VISUAIS:
${anomaliesSummary.length > 0 ? anomaliesSummary.join('\n') : 'Não foram detectadas anomalias visuais severas aparentes no momento da vistoria.'}

${data.conclusions.generalFindings ? `Anotações complementares de campo:\n${data.conclusions.generalFindings}` : ''}

6. MEDIDAS DE SEGURANÇA E ORIENTAÇÕES PRELIMINARES TRANSMITIDAS EM CAMPO:
${data.conclusions.immediateSafetyMeasures || 'Manter o monitoramento visual periódico e garantir o livre escoamento no descarregador de cheias.'}

7. ENCAMINHAMENTO ADMINISTRATIVO:
${data.conclusions.requiresNotification 
  ? `[X] Indicada emissão de Notificação Técnica formal para providências e apresentação de documentos pelo responsável.`
  : `[ ] Não indicada notificação imediata nesta data, sem prejuízo da tramitação e análise do processo regular junto à SEMA-MT.`}

Lavrado no local da vistoria para os devidos fins de registro e instrução processual.

___________________________________________________
Assinatura do Servidor Fiscal da CSB/SEMA-MT

___________________________________________________
Assinatura do Acompanhante / Notificado no Local`;
}

import { generateRelatorioInspecaoData } from './relatorioInspecaoGenerator';

export function generateRelatorioTecnicoText(data: InspectionData): string {
  const result = generateRelatorioInspecaoData(data);
  return result.textoCompletoFormatado;
}

import { generateNotificacaoData } from './notificacaoGenerator';

export function generateNotificacaoText(data: InspectionData): string {
  const result = generateNotificacaoData(data);
  return result.textoCompletoFormatado;
}

function formatWeather(w: string): string {
  switch (w) {
    case 'seco': return 'Tempo seco / ensolarado';
    case 'chuva_fraca': return 'Chuva fraca / garoa';
    case 'chuva_moderada': return 'Chuva moderada';
    case 'chuva_forte_recente': return 'Chuva forte recente na bacia';
    case 'nublado': return 'Céu encoberto / nublado';
    default: return w;
  }
}

function formatDamType(t: string): string {
  switch (t) {
    case 'terra_homogenea': return 'Barragem de terra homogênea';
    case 'terra_zoneada': return 'Barragem de terra zoneada';
    case 'enrocamento': return 'Enrocamento com núcleo ou face estanque';
    case 'concreto': return 'Barragem de concreto (gravidade/arco/rolado)';
    case 'alvenaria_pedra': return 'Alvenaria de pedra';
    case 'mista': return 'Estrutura mista';
    case 'outro': return 'Outra tipologia construtiva';
    default: return t;
  }
}

function formatSpillwayType(s: string): string {
  switch (s) {
    case 'soleira_livre_concreto': return 'Soleira livre em concreto com canal';
    case 'canal_lateral_escavado': return 'Canal lateral escavado no terreno natural';
    case 'tulipa_morning_glory': return 'Tulipa / Morning Glory';
    case 'tubulacao_manilha': return 'Tubulação / Manilha extravasora';
    case 'bueiro': return 'Bueiro / Galeria celular';
    case 'inexistente_vertimento_crista': return 'INEXISTENTE (vertimento se dá pela crista do maciço - risco de galgamento)';
    case 'outro': return 'Outro tipo de vertedouro';
    default: return s;
  }
}

function formatCondition(c: string): string {
  switch (c) {
    case 'adequado': return 'Adequado (Sem anomalias visuais significativas)';
    case 'alerta': return 'Atenção / Alerta (Anomalias que exigem monitoramento ou reparo simples)';
    case 'critico': return 'Crítico (Anomalias com risco à estabilidade ou capacidade hidráulica)';
    case 'nao_se_aplica': return 'Não se aplica a esta estrutura';
    case 'nao_inspecionado': return 'Não inspecionado nesta ocasião';
    default: return c;
  }
}

function formatRegStatus(status: string): string {
  switch (status) {
    case 'sim': return 'Sim, regularizado';
    case 'nao': return 'Não possui / Não regularizado';
    case 'em_tramitacao': return 'Em tramitação na SEMA-MT';
    case 'nao_informado': return 'Não informado no momento da vistoria';
    default: return status;
  }
}
