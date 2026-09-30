// ==============================================================================
// GERADOR DA MINUTA DE NOTIFICAÇÃO (CSB/SEMA-MT - SIGA AUTUAÇÃO)
// Rigorosamente condicional, com rastreamento de pendências e sem inferência de dados
// ==============================================================================

import { InspectionData, NotificationDetailsState, NotificationLegalReference } from '../types/inspection';
import { NOTIFICATION_TEMPLATES } from '../config/notificationTemplates';
import { formatGmsString } from './geoCoordinates';

export interface NotificacaoGeneratedStructure {
  numeroNotificacao: string;
  dataEmissaoFormatada: string;
  versaoSistema: string;
  sistemaEmissor: string;

  destinatario: {
    nomeRazaoSocial: string;
    cpfCnpj: string;
    endereco: string;
    numero: string;
    complemento: string;
    bairro: string;
    municipio: string;
    uf: string;
    cep: string;
    telefone: string;
  };

  localOcorrencia: {
    nomeFantasia: string;
    atividade: string;
    coordenadasDatum: string;
    latitudeDecimal: string;
    longitudeDecimal: string;
    coordenadasGms: string;
    enderecoEmpreendimento: string;
    areaEmpreendimento: string;
    municipio: string;
    uf: string;
    cep: string;
    telefone: string;
  };

  vinculosEProcesso: {
    numeroProcesso: string;
    prazoDias: string;
    vinculoAutoInspecao: string;
  };

  objetivo: string;
  solicitacoesTexto: string;
  observacoesGeraisTexto: string;
  advertenciaDesobedienciaTexto: string;
  canalAtendimentoTexto: string;

  equipeFiscalizacao: {
    nome: string;
    cargo: string;
  }[];

  confirmacaoRecebimento: {
    modo: 'presencial' | 'enviado_por_ar' | 'recusou_assinar';
    nomeResponsavel: string;
    cpfRg: string;
    cargo: string;
    localEData: string;
  };

  referenciasNormativasAtivas: NotificationLegalReference[];
  camposPendentes: string[];
  textoCompletoFormatado: string;
}

// Converte coordenadas em GMS no formato oficial: xxºxx'xx,xx"
export function decimalToGms(deg: number | string, isLat: boolean): string {
  return formatGmsString(deg, isLat, false);
}

export function generateNotificacaoData(data: InspectionData): NotificacaoGeneratedStructure {
  const g = data.generalInfo;
  const d = data.damIdentification;
  const n = data.conclusions.notificationDetails;
  const camposPendentes: string[] = [];

  // 1. Número da Notificação e Data
  const numeroNotificacao = n.numeroNotificacao?.trim() 
    ? n.numeroNotificacao.trim() 
    : (g.recordNumber ? `${g.recordNumber}-NOTIF` : 'PENDENTE DE NUMERAÇÃO');

  const dataEmissaoFormatada = n.dataEmissao 
    ? new Date(n.dataEmissao + 'T00:00:00').toLocaleDateString('pt-BR')
    : (g.inspectionDate ? new Date(g.inspectionDate + 'T00:00:00').toLocaleDateString('pt-BR') : new Date().toLocaleDateString('pt-BR'));

  // 2. Destinatário
  const destNome = n.destinatario?.nomeRazaoSocial?.trim() 
    || d.propertyOrBusinessName?.trim() 
    || g.accompaniedBy?.name?.trim();
  if (!destNome) camposPendentes.push('Nome / Razão Social do Notificado');

  const destCpfCnpj = n.destinatario?.cpfCnpj?.trim() 
    || g.accompaniedBy?.document?.trim();
  if (!destCpfCnpj) camposPendentes.push('CPF / CNPJ do Notificado');

  const destEndereco = n.destinatario?.enderecoCorrespondencia?.trim();
  if (!destEndereco) camposPendentes.push('Endereço para correspondências (Logradouro)');

  const destMunicipio = n.destinatario?.municipio?.trim() || d.municipality?.trim();
  if (!destMunicipio) camposPendentes.push('Município de correspondência');

  const destTelefone = n.destinatario?.telefone?.trim() || g.accompaniedBy?.phone?.trim();

  // 3. Local da Ocorrência
  const localNome = n.localOcorrencia?.nomeFantasia?.trim() 
    || d.damName?.trim() 
    || d.propertyOrBusinessName?.trim();
  if (!localNome) camposPendentes.push('Nome Fantasia / Denominação do Barramento');

  const localEndereco = n.localOcorrencia?.enderecoEmpreendimento?.trim() 
    || (d.waterCourse ? `Curso Hídrico: ${d.waterCourse}` : '');
  if (!localEndereco) camposPendentes.push('Endereço físico / Acesso ao empreendimento');

  const latGms = formatGmsString(d.coordinates.latitude, true, false);
  const lonGms = formatGmsString(d.coordinates.longitude, false, false);
  const hasCoords = !!(latGms && lonGms);

  const latitudeGmsFormatada = hasCoords ? latGms : (d.coordinates.latitude || 'Não informada');
  const longitudeGmsFormatada = hasCoords ? lonGms : (d.coordinates.longitude || 'Não informada');
  const coordenadasGms = hasCoords 
    ? `${latGms} e ${lonGms}` 
    : 'Coordenadas não informadas em campo';
  if (!hasCoords) camposPendentes.push('Coordenadas geográficas da barragem');

  // 4. Vínculo com Auto de Inspeção e Processo SEMA
  const vinculoAuto = n.vinculoAutoInspecaoNumero?.trim() 
    || g.recordNumber?.trim();
  if (!vinculoAuto) camposPendentes.push('Vínculo com Auto de Inspeção Nº');

  const numeroProcesso = n.processoNumero?.trim();
  if (!numeroProcesso) camposPendentes.push('Nº do Processo SEMA');

  // 5. Prazo
  const prazoDias = n.prazoDias?.trim();
  if (!prazoDias) {
    camposPendentes.push('Prazo de atendimento em dias (deve ser expressamente fixado pelo fiscal)');
  }

  // 6. Objetivo
  const objetivo = n.objetivo?.trim();
  if (!objetivo) {
    camposPendentes.push('Objetivo específico da Notificação');
  }

  // 7. Equipe
  const equipeFiscalizacao = g.inspectors
    .filter(i => i.name && i.name.trim() !== '')
    .map(i => ({
      nome: i.name.trim(),
      cargo: i.role?.trim() || 'ANALISTA DE MEIO AMBIENTE'
    }));

  if (equipeFiscalizacao.length === 0) {
    equipeFiscalizacao.push({
      nome: 'Servidor Fiscal Responsável',
      cargo: 'ANALISTA DE MEIO AMBIENTE'
    });
    camposPendentes.push('Composição da equipe de fiscalização notificante');
  }

  // 8. Solicitacoes e Observacoes interpolando variáveis reais
  const replaceVars = (templateText: string): string => {
    return templateText
      .replace(/{{NOME_RAZAO_SOCIAL}}/g, destNome || '[PENDENTE DE REVISÃO: NOME/RAZÃO SOCIAL]')
      .replace(/{{CPF_CNPJ}}/g, destCpfCnpj || '[PENDENTE DE REVISÃO: CPF/CNPJ]')
      .replace(/{{MUNICIPIO}}/g, destMunicipio || '[PENDENTE DE REVISÃO: MUNICÍPIO]')
      .replace(/{{COORDENADAS_GMS}}/g, coordenadasGms)
      .replace(/{{NUMERO_AUTO}}/g, vinculoAuto || '[PENDENTE DE REVISÃO: NÚMERO DO AUTO]')
      .replace(/{{PRAZO_DIAS}}/g, prazoDias || '[PENDENTE DE REVISÃO: PRAZO NÃO DEFINIDO]')
      .replace(/{{NUMERO_PROCESSO_ANTERIOR}}/g, numeroProcesso || '[PROCESSO ANTERIOR]');
  };

  const solicitacoesTexto = n.solicitacoesTexto 
    ? replaceVars(n.solicitacoesTexto)
    : replaceVars(NOTIFICATION_TEMPLATES[n.modelType]?.defaultSolicitacoes || '');

  const observacoesGeraisTexto = n.observacoesGeraisTexto
    ? replaceVars(n.observacoesGeraisTexto)
    : replaceVars(NOTIFICATION_TEMPLATES[n.modelType]?.defaultObservacoesGerais || '');

  const advertenciaDesobedienciaTexto = n.incluirAdvertenciaDesobediencia !== false
    ? 'O NÃO CUMPRIMENTO DESTA NOTIFICAÇÃO, CONSTITUI INFRAÇÃO ADMINISTRATIVA DE DESOBEDIÊNCIA, PREVISTO NO ARTIGO 330 DO CÓDIGO PENAL E NO ART. 80 DO DECRETO FEDERAL N. 6.514/2008.'
    : '';

  const canalAtendimentoTexto = 'PARA RESPOSTA/ATENDIMENTO DESTA NOTIFICAÇÃO, É NECESSÁRIO ACESSAR O SIGA-AUTUAÇÃO ATRAVÉS DO LINK: https://portal.sema.mt.gov.br/';

  const referenciasNormativasAtivas = (n.referenciasNormativas || [])
    .filter(r => r.ativo);

  // Gera a representação de texto puro revisável
  const textoCompletoFormatado = `[MINUTA DE NOTIFICAÇÃO CONDICIONAL – CSB/SEMA-MT]
[MODELO UTILIZADO: ${NOTIFICATION_TEMPLATES[n.modelType]?.title || n.modelTitle || 'Personalizado'}]
${camposPendentes.length > 0 ? `\n[ALERTA DE REVISÃO - CAMPOS PENDENTES]:\n${camposPendentes.map(c => ` - ${c}`).join('\n')}\n` : ''}

Governo do Estado de Mato Grosso
SEMA - Secretaria de Estado de Meio Ambiente
SUPERINTENDÊNCIA DE RECURSOS HÍDRICOS / COORDENADORIA DE SEGURANÇA DE BARRAGENS

NOTIFICAÇÃO Nº: ${numeroNotificacao} | DATA: ${dataEmissaoFormatada}
SIGA AUTUAÇÃO

--------------------------------------------------------------------------------
1. IDENTIFICAÇÃO DO NOTIFICADO (CORRESPONDÊNCIA)
--------------------------------------------------------------------------------
NOME / RAZÃO SOCIAL: ${destNome || '[PENDENTE DE REVISÃO]'}
CNPJ / CPF: ${destCpfCnpj || '[PENDENTE DE REVISÃO]'}
ENDEREÇO PARA CORRESPONDÊNCIAS: ${destEndereco || '[PENDENTE DE REVISÃO]'}
Número: ${n.destinatario?.numero || 'S/N'} | Complemento: ${n.destinatario?.complemento || '-'}
Bairro: ${n.destinatario?.bairro || '[PENDENTE]'} | CEP: ${n.destinatario?.cep || '[PENDENTE]'}
MUNICÍPIO / UF: ${destMunicipio || '[PENDENTE]'} / ${n.destinatario?.uf || 'MT'}
TELEFONE: ${destTelefone || 'Não informado'}

--------------------------------------------------------------------------------
2. LOCAL DA OCORRÊNCIA (EMPREENDIMENTO)
--------------------------------------------------------------------------------
NOME FANTASIA: ${localNome || '[PENDENTE DE REVISÃO]'}
ATIVIDADE: ${n.localOcorrencia?.atividade || 'Barragem de acumulação de água para usos múltiplos'}
COORDENADAS GEOGRÁFICAS (SIRGAS 2000):
LATITUDE: ${latitudeGmsFormatada} (S) | LONGITUDE: ${longitudeGmsFormatada} (W)
COORDENADAS GMS: ${coordenadasGms}
ENDEREÇO DO EMPREENDIMENTO: ${localEndereco || '[PENDENTE DE REVISÃO]'}
ÁREA DO EMPREENDIMENTO: ${n.localOcorrencia?.areaEmpreendimento || 'Não informada'}
MUNICÍPIO / UF: ${d.municipality || destMunicipio || 'MT'} / MT
CEP: ${n.localOcorrencia?.cep || 'Não informado'} | TELEFONE: ${n.localOcorrencia?.telefone || destTelefone || 'Não informado'}

--------------------------------------------------------------------------------
3. VÍNCULOS ADMINISTRATIVOS E PRAZO
--------------------------------------------------------------------------------
Nº DO PROCESSO: ${numeroProcesso || '[PENDENTE DE REVISÃO]'}
AUTO DE INSPEÇÃO VINCULADO: Nº ${vinculoAuto || '[PENDENTE DE REVISÃO]'}
PRAZO DE VENCIMENTO (DIAS): ${prazoDias || '[PENDENTE DE DEFINIÇÃO PELO FISCAL]'} dias

OBJETIVO:
${objetivo || '[PENDENTE DE REVISÃO: Definir objetivo específico]'}

--------------------------------------------------------------------------------
4. DETERMINAÇÕES E EXIGÊNCIAS DA NOTIFICAÇÃO
--------------------------------------------------------------------------------
${solicitacoesTexto}

--------------------------------------------------------------------------------
5. OBSERVAÇÕES GERAIS
--------------------------------------------------------------------------------
${observacoesGeraisTexto}

--------------------------------------------------------------------------------
6. ADVERTÊNCIAS LEGAIS E ATENDIMENTO
--------------------------------------------------------------------------------
${advertenciaDesobedienciaTexto}

${canalAtendimentoTexto}

--------------------------------------------------------------------------------
7. EQUIPE DE SERVIDORES NOTIFICANTES
--------------------------------------------------------------------------------
${equipeFiscalizacao.map(eq => `${eq.nome}\n${eq.cargo}`).join('\n\n')}

--------------------------------------------------------------------------------
8. CONFIRMAÇÃO DE RECEBIMENTO
--------------------------------------------------------------------------------
NOME DO RESPONSÁVEL: ${n.modoConfirmacaoRecebimento === 'enviado_por_ar' ? 'ENVIADO POR AR' : (n.responsavelRecebimentoNome || '[A preencher no ato da entrega]')}
CPF / RG: ${n.responsavelRecebimentoDocumento || '___________________________'}
CARGO: ${n.responsavelRecebimentoCargo || '___________________________'}
LOCAL E DATA: ${n.responsavelRecebimentoLocalData || '____/____/2026'}
ASSINATURA: _________________________________________________
[${n.modoConfirmacaoRecebimento === 'recusou_assinar' ? 'X' : ' '}] Recusou-se a assinar`;

  return {
    numeroNotificacao,
    dataEmissaoFormatada,
    versaoSistema: '1.3.13.10',
    sistemaEmissor: 'SIGA AUTUAÇÃO',
    destinatario: {
      nomeRazaoSocial: destNome || '',
      cpfCnpj: destCpfCnpj || '',
      endereco: destEndereco || '',
      numero: n.destinatario?.numero || '',
      complemento: n.destinatario?.complemento || '',
      bairro: n.destinatario?.bairro || '',
      municipio: destMunicipio || '',
      uf: n.destinatario?.uf || 'MT',
      cep: n.destinatario?.cep || '',
      telefone: destTelefone || ''
    },
    localOcorrencia: {
      nomeFantasia: localNome || '',
      atividade: n.localOcorrencia?.atividade || 'Barragem',
      coordenadasDatum: 'SIRGAS 2000',
      latitudeDecimal: latitudeGmsFormatada,
      longitudeDecimal: longitudeGmsFormatada,
      coordenadasGms,
      enderecoEmpreendimento: localEndereco || '',
      areaEmpreendimento: n.localOcorrencia?.areaEmpreendimento || '',
      municipio: d.municipality || destMunicipio || '',
      uf: 'MT',
      cep: n.localOcorrencia?.cep || '',
      telefone: n.localOcorrencia?.telefone || destTelefone || ''
    },
    vinculosEProcesso: {
      numeroProcesso: numeroProcesso || '',
      prazoDias: prazoDias || '',
      vinculoAutoInspecao: vinculoAuto || ''
    },
    objetivo: objetivo || '',
    solicitacoesTexto,
    observacoesGeraisTexto,
    advertenciaDesobedienciaTexto,
    canalAtendimentoTexto,
    equipeFiscalizacao,
    confirmacaoRecebimento: {
      modo: n.modoConfirmacaoRecebimento || 'presencial',
      nomeResponsavel: n.responsavelRecebimentoNome || '',
      cpfRg: n.responsavelRecebimentoDocumento || '',
      cargo: n.responsavelRecebimentoCargo || '',
      localEData: n.responsavelRecebimentoLocalData || ''
    },
    referenciasNormativasAtivas,
    camposPendentes,
    textoCompletoFormatado
  };
}
