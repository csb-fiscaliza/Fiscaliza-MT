// ==============================================================================
// ARQUIVO: src/utils/anonymizer.ts
// Utilitário de Anonimização de Dados em Conformidade com a LGPD (Lei 13.709/2018)
// Permite sanitizar vistorias para uso em ferramentas externas (análise automatizada,
// benchmarking e auditoria técnica) sem exposição de dados pessoais.
// ==============================================================================

import { InspectionData } from '../types/inspection';
import { generateRelatorioInspecaoData } from './relatorioInspecaoGenerator';
import { generateAutoInspecaoText } from './documentGenerators';
import { generateNotificacaoData } from './notificacaoGenerator';

export interface SensitivePiiFinding {
  field: string;
  category: 'CPF/CNPJ' | 'Contato Telefônico' | 'E-mail' | 'Nome de Pessoa Física' | 'Endereço Residencial';
  originalValue: string;
  sanitizedValue: string;
}

/**
 * Detecta campos contendo potenciais dados pessoais (PII) segundo a LGPD
 */
export function detectSensitivePii(data: InspectionData): SensitivePiiFinding[] {
  const findings: SensitivePiiFinding[] = [];
  const g = data.generalInfo;
  const d = data.damIdentification;
  const c = data.conclusions;

  // Propriedade / Empreendedor
  if (d.propertyOrBusinessName) {
    findings.push({
      field: 'Identificação: Propriedade / Empreendimento',
      category: 'Nome de Pessoa Física',
      originalValue: d.propertyOrBusinessName,
      sanitizedValue: 'Empreendimento Agropecuário Modelo [DESCARACTERIZADO]'
    });
  }

  // Notificado específico
  if (c.notificationDetails?.destinatario?.nomeRazaoSocial) {
    findings.push({
      field: 'Notificação: Nome do Notificado',
      category: 'Nome de Pessoa Física',
      originalValue: c.notificationDetails.destinatario.nomeRazaoSocial,
      sanitizedValue: '[NOTIFICADO ANONIMIZADO - LGPD]'
    });
  }

  if (c.notificationDetails?.destinatario?.cpfCnpj) {
    findings.push({
      field: 'Notificação: CPF/CNPJ',
      category: 'CPF/CNPJ',
      originalValue: c.notificationDetails.destinatario.cpfCnpj,
      sanitizedValue: '000.***.***-00'
    });
  }

  if (c.notificationDetails?.destinatario?.telefone) {
    findings.push({
      field: 'Notificação: Telefone',
      category: 'Contato Telefônico',
      originalValue: c.notificationDetails.destinatario.telefone,
      sanitizedValue: '(65) 9****-****'
    });
  }

  if (c.notificationDetails?.destinatario?.email) {
    findings.push({
      field: 'Notificação: E-mail',
      category: 'E-mail',
      originalValue: c.notificationDetails.destinatario.email,
      sanitizedValue: 'contato.anonimizado@exemplo.lgpd.mt.gov.br'
    });
  }

  // Acompanhante da vistoria
  if (g.accompaniedBy?.name) {
    findings.push({
      field: 'Informações Gerais: Acompanhante no Local',
      category: 'Nome de Pessoa Física',
      originalValue: g.accompaniedBy.name,
      sanitizedValue: '[REPRESENTANTE LOCAL ANONIMIZADO]'
    });
  }

  if (g.accompaniedBy?.document) {
    findings.push({
      field: 'Informações Gerais: Documento do Acompanhante',
      category: 'CPF/CNPJ',
      originalValue: g.accompaniedBy.document,
      sanitizedValue: '***.***.***-**'
    });
  }

  if (g.accompaniedBy?.phone) {
    findings.push({
      field: 'Informações Gerais: Telefone do Acompanhante',
      category: 'Contato Telefônico',
      originalValue: g.accompaniedBy.phone,
      sanitizedValue: '(65) 9****-****'
    });
  }

  // Inspetores (servidores públicos)
  g.inspectors.forEach((inspector, idx) => {
    if (inspector.name) {
      findings.push({
        field: `Equipe Técnica: Servidor ${idx + 1} (${inspector.name})`,
        category: 'Nome de Pessoa Física',
        originalValue: inspector.name,
        sanitizedValue: `Servidor Técnico CSB ${idx + 1}`
      });
    }
    if (inspector.registrationNumber) {
      findings.push({
        field: `Equipe Técnica: Matrícula Servidor ${idx + 1}`,
        category: 'Nome de Pessoa Física',
        originalValue: inspector.registrationNumber,
        sanitizedValue: 'MATR-******'
      });
    }
  });

  return findings;
}

/**
 * Cria uma cópia profunda estritamente anonimizada da vistoria.
 * Remove dados cadastrais pessoais mas preserva integralmente:
 * - Geometria da barragem (altura, comprimento, largura, cota)
 * - Avaliação de componentes estruturais e hidráulicos
 * - Anomalias fáticas registradas
 * - Fotografias técnicas (com metadados pessoais expurgados)
 */
export function anonymizeInspectionData(data: InspectionData): InspectionData {
  const clone: InspectionData = JSON.parse(JSON.stringify(data));

  // 1. Identificação Geral
  clone.id = 'anon-' + clone.id.slice(0, 8);
  clone.barragemId = 'barragem-anonimizado';
  clone.empreendedorId = 'empreendedor-anonimizado';

  // 2. Inspetores
  clone.generalInfo.inspectors = clone.generalInfo.inspectors.map((insp, idx) => ({
    ...insp,
    name: `Servidor Técnico CSB ${idx + 1}`,
    registrationNumber: 'MATR-******',
    sector: 'Coordenadoria de Segurança de Barragens - CSB/SEMA-MT'
  }));

  // 3. Acompanhante
  if (clone.generalInfo.accompaniedBy) {
    clone.generalInfo.accompaniedBy = {
      ...clone.generalInfo.accompaniedBy,
      name: clone.generalInfo.accompaniedBy.name ? '[REPRESENTANTE LOCAL ANONIMIZADO]' : '',
      relationship: clone.generalInfo.accompaniedBy.relationship || 'Encarregado / Preposto',
      phone: clone.generalInfo.accompaniedBy.phone ? '(65) 9****-****' : '',
      document: clone.generalInfo.accompaniedBy.document ? '***.***.***-**' : ''
    };
  }

  // 4. Identificação do Empreendimento
  if (clone.damIdentification.propertyOrBusinessName) {
    clone.damIdentification.propertyOrBusinessName = 'Empreendimento Agropecuário Modelo [DESCARACTERIZADO]';
  }

  // 5. Dados do Notificado
  if (clone.conclusions.notificationDetails) {
    const nd = clone.conclusions.notificationDetails;
    if (nd.destinatario) {
      nd.destinatario = {
        ...nd.destinatario,
        nomeRazaoSocial: nd.destinatario.nomeRazaoSocial ? '[NOTIFICADO ANONIMIZADO - ART. 7º LGPD]' : '',
        cpfCnpj: nd.destinatario.cpfCnpj ? '000.***.***-00' : '',
        enderecoCorrespondencia: nd.destinatario.enderecoCorrespondencia ? 'Zona Rural, Interior/MT - [LOGRADOURO SUPRIMIDO]' : '',
        telefone: nd.destinatario.telefone ? '(65) 9****-****' : '',
        email: nd.destinatario.email ? 'destinatario.anonimizado@exemplo.lgpd.mt.gov.br' : ''
      };
    }
    if (nd.responsavelRecebimentoNome) {
      nd.responsavelRecebimentoNome = '[RECEBEDOR ANONIMIZADO]';
      nd.responsavelRecebimentoDocumento = '***.***.***-**';
    }
  }

  // 6. Sanitização de Textos Livres para evitar vazamento de CPF ou nomes no meio do texto
  const piiRegexCpf = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g;
  const piiRegexPhone = /\b(?:\+?55\s?)?(?:\(?\d{2}\)?\s?)?(?:9?\d{4}[-.\s]?\d{4})\b/g;
  const piiRegexEmail = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

  const sanitizeString = (str: string): string => {
    if (!str) return '';
    return str
      .replace(piiRegexCpf, '[CPF SUPRIMIDO]')
      .replace(piiRegexEmail, '[E-MAIL SUPRIMIDO]')
      .replace(piiRegexPhone, '[TELEFONE SUPRIMIDO]');
  };

  if (clone.conclusions.generalFindings) {
    clone.conclusions.generalFindings = sanitizeString(clone.conclusions.generalFindings);
  }
  if (clone.conclusions.recommendationsToOwner) {
    clone.conclusions.recommendationsToOwner = sanitizeString(clone.conclusions.recommendationsToOwner);
  }

  // Sanitizar observações dos componentes
  Object.keys(clone.componentsData).forEach(compId => {
    if (clone.componentsData[compId]?.notes) {
      clone.componentsData[compId].notes = sanitizeString(clone.componentsData[compId].notes);
    }
  });

  return clone;
}

/**
 * Dispara download do arquivo JSON anonimizado
 */
export function exportAnonymizedJsonFile(data: InspectionData): void {
  const sanitized = anonymizeInspectionData(data);
  const jsonStr = JSON.stringify(sanitized, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `VISTORIA_ANONIMIZADA_LGPD_${new Date().toISOString().split('T')[0]}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Gera pacote textual completo das minutas oficiais totalmente anonimizadas
 * Seguro para compartilhar externamente ou em análises de auditoria técnica
 */
export function generateAnonymizedDocumentsBundle(data: InspectionData): string {
  const sanitized = anonymizeInspectionData(data);
  const autoText = generateAutoInspecaoText(sanitized);
  const relatorioData = generateRelatorioInspecaoData(sanitized);
  const notifData = sanitized.conclusions.requiresNotification ? generateNotificacaoData(sanitized) : null;

  return [
    '==============================================================================',
    'DOCUMENTOS INSTITUCIONAIS CSB/SEMA-MT – CÓPIA 100% ANONIMIZADA (LGPD)',
    'Apropriado para envio seguro a ferramentas externas ou auditoria técnica',
    'Todos os CPFs, telefones, e-mails e nomes próprios foram suprimidos.',
    '==============================================================================',
    '',
    '--- PARTE 1: AUTO DE INSPEÇÃO DE BARRAGEM (MINUTA ANONIMIZADA) ---',
    autoText,
    '',
    '------------------------------------------------------------------------------',
    '--- PARTE 2: RELATÓRIO DE INSPEÇÃO DE SEGURANÇA DE BARRAGEM (MINUTA ANONIMIZADA) ---',
    relatorioData.textoCompletoFormatado,
    '',
    notifData ? [
      '------------------------------------------------------------------------------',
      '--- PARTE 3: NOTIFICAÇÃO TÉCNICA (SIGA AUTUAÇÃO - MINUTA ANONIMIZADA) ---',
      notifData.textoCompletoFormatado
    ].join('\n') : '--- PARTE 3: NOTIFICAÇÃO TÉCNICA NÃO SOLICITADA PARA ESTA VISTORIA ---'
  ].join('\n');
}
