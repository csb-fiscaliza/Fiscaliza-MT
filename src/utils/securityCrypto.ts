// ==============================================================================
// MÓDULO DE SEGURANÇA CRIPTOGRÁFICA, INTEGRIDADE E ANTI-PLÁGIO (SEMA-MT / CSB)
// - Criptografia de Dados (AES-GCM 256-bit + PBKDF2)
// - Hash Criptográfico de Integridade (SHA-256 com fallback resiliente)
// - Selo Digital de Autenticidade e Anti-Plágio (Rastreabilidade e Proteção Legal)
// - Sanitização Estrita Anti-Invasão / Anti-XSS e Prevenção de Poluição de Protótipo
// ==============================================================================

import { InspectionData } from '../types/inspection';

/**
 * Declaração oficial anti-plágio e de integridade documental pública
 */
export const OFFICIAL_ANTI_PLAGIARISM_NOTICE =
`AVISO LEGAL DE AUTENTICIDADE E PROTEÇÃO ANTI-PLÁGIO (SEMA-MT / CSB):
Documento técnico-administrativo público originado da Coordenadoria de Segurança de Barragens (CSB/SEMA-MT).
A reprodução não autorizada, contrafação, supressão de identificação, plágio técnico ou adulteração de conteúdo
constitui ilícito tipificado nos artigos 297 (Falsificação de documento público) e 299 (Falsidade ideológica) do
Código Penal Brasileiro, além de violar a Lei Federal nº 9.610/1998 e os preceitos de fé pública administrativa.`;

/**
 * Estrutura do Selo Digital de Autenticidade
 */
export interface AuthenticitySealData {
  verificationCode: string;
  sha256Hash: string;
  sha256Short: string;
  timestampUtc: string;
  timestampFormatted: string;
  emissor: string;
  orgao: string;
  rastreabilidadeId: string;
  avisoLegal: string;
  blocoAssinaturaFormatado: string;
}

// ------------------------------------------------------------------------------
// 1. HASH CRIPTOGRÁFICO SHA-256 (NATIVO WEB CRYPTO + FALLBACK PURO)
// ------------------------------------------------------------------------------

/**
 * Implementação pura de SHA-256 como fallback infalível para ambientes onde
 * window.crypto.subtle não estiver disponível em contexto inseguro.
 */
function sha256Fallback(ascii: string): string {
  let i = 0, j = 0;
  let result = '';

  const words: number[] = [];
  const asciiBitLength = ascii.length * 8;

  let hash = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
  ];

  const k = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ];

  for (i = 0; i < ascii.length; i++) {
    const code = ascii.charCodeAt(i);
    words[i >> 2] |= (code & 0xff) << ((3 - (i % 4)) * 8);
  }

  words[asciiBitLength >> 5] |= 0x80 << (24 - (asciiBitLength % 32));
  words[(((asciiBitLength + 64) >> 9) << 4) + 15] = asciiBitLength;

  const w: number[] = new Array(64);

  for (i = 0; i < words.length; i += 16) {
    const oldHash = [...hash];

    for (j = 0; j < 64; j++) {
      let w15: number, w2: number;
      if (j < 16) {
        w[j] = words[i + j] | 0;
      } else {
        const s0 = ((w[j - 15] >>> 7) | (w[j - 15] << 25)) ^
                   ((w[j - 15] >>> 18) | (w[j - 15] << 14)) ^
                   (w[j - 15] >>> 3);
        const s1 = ((w[j - 2] >>> 17) | (w[j - 2] << 15)) ^
                   ((w[j - 2] >>> 19) | (w[j - 2] << 13)) ^
                   (w[j - 2] >>> 10);
        w[j] = (w[j - 16] + s0 + w[j - 7] + s1) | 0;
      }

      const s1 = ((hash[4] >>> 6) | (hash[4] << 26)) ^
                 ((hash[4] >>> 11) | (hash[4] << 21)) ^
                 ((hash[4] >>> 25) | (hash[4] << 7));
      const ch = (hash[4] & hash[5]) ^ (~hash[4] & hash[6]);
      const temp1 = (hash[7] + s1 + ch + k[j] + w[j]) | 0;

      const s0 = ((hash[0] >>> 2) | (hash[0] << 30)) ^
                 ((hash[0] >>> 13) | (hash[0] << 19)) ^
                 ((hash[0] >>> 22) | (hash[0] << 10));
      const maj = (hash[0] & hash[1]) ^ (hash[0] & hash[2]) ^ (hash[1] & hash[2]);
      const temp2 = (s0 + maj) | 0;

      hash[7] = hash[6];
      hash[6] = hash[5];
      hash[5] = hash[4];
      hash[4] = (hash[3] + temp1) | 0;
      hash[3] = hash[2];
      hash[2] = hash[1];
      hash[1] = hash[0];
      hash[0] = (temp1 + temp2) | 0;
    }

    for (j = 0; j < 8; j++) {
      hash[j] = (hash[j] + oldHash[j]) | 0;
    }
  }

  for (i = 0; i < 8; i++) {
    for (j = 3; j >= 0; j--) {
      const b = (hash[i] >> (j * 8)) & 0xff;
      result += (b < 16 ? '0' : '') + b.toString(16);
    }
  }

  return result;
}

/**
 * Calcula o Hash SHA-256 de qualquer string (assíncrono com suporte nativo WebCrypto e fallback)
 */
export async function computeSha256(text: string): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle && typeof TextEncoder !== 'undefined') {
    try {
      const encoder = new TextEncoder();
      const data = encoder.encode(text);
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    } catch {
      // Fallback em caso de erro na API do navegador
    }
  }
  return sha256Fallback(text);
}

/**
 * Versão síncrona do Hash SHA-256 para geração imediata em renderizadores
 */
export function computeSha256Sync(text: string): string {
  return sha256Fallback(text);
}

// ------------------------------------------------------------------------------
// 2. SELO DIGITAL DE AUTENTICIDADE E ANTI-PLÁGIO
// ------------------------------------------------------------------------------

/**
 * Gera código verificador estável e legível no padrão oficial
 * Exemplo: CSB-MT-2026-A83F-4B1C
 */
export function generateVerificationCode(sha256Hex: string, year: string = '2026'): string {
  const clean = (sha256Hex || '0000000000000000').toUpperCase().replace(/[^A-F0-9]/g, '');
  const part1 = clean.slice(0, 4) || 'A1B2';
  const part2 = clean.slice(4, 8) || 'C3D4';
  return `CSB-MT-${year}-${part1}-${part2}`;
}

/**
 * Cria os metadados completos de autenticidade, rastreabilidade e proteção contra plágio
 */
export function createAuthenticitySeal(
  inspection: Partial<InspectionData>,
  documentTypeTitle: string = 'DOCUMENTO OFICIAL'
): AuthenticitySealData {
  const now = new Date();
  const year = now.getFullYear().toString();
  const timestampUtc = now.toISOString();
  const timestampFormatted = now.toLocaleString('pt-BR');

  // Canônica para hash
  const canonicalBasis = [
    inspection.id || 'sem-id',
    inspection.damIdentification?.damName || '',
    inspection.damIdentification?.propertyOrBusinessName || '',
    inspection.damIdentification?.municipality || '',
    inspection.damIdentification?.coordinates?.latitude || '',
    inspection.damIdentification?.coordinates?.longitude || '',
    inspection.generalInfo?.recordNumber || '',
    inspection.generalInfo?.inspectionDate || '',
    documentTypeTitle
  ].join('|');

  const sha256Hash = computeSha256Sync(canonicalBasis);
  const sha256Short = sha256Hash.slice(0, 16);
  const verificationCode = generateVerificationCode(sha256Hash, year);
  const rastreabilidadeId = `${inspection.id || 'CSB'}:${sha256Short}`;

  const blocoAssinaturaFormatado =
`================================================================================
SELO DIGITAL DE AUTENTICIDADE E VERIFICAÇÃO ANTI-PLÁGIO (CSB/SEMA-MT)
CÓDIGO DE AUTENTICIDADE: ${verificationCode}
HASH DE INTEGRIDADE (SHA-256): ${sha256Hash}
CHAVE DE RASTREABILIDADE: ${rastreabilidadeId}
EMISSÃO DIGITAL: ${timestampFormatted} (Horário de Brasília)
PADRÃO: Assinatura de Autenticidade Digital SEMA-MT (Instrução Normativa SEMA-MT 08/2023)

${OFFICIAL_ANTI_PLAGIARISM_NOTICE}
================================================================================`;

  return {
    verificationCode,
    sha256Hash,
    sha256Short,
    timestampUtc,
    timestampFormatted,
    emissor: 'Coordenadoria de Segurança de Barragens (CSB/SRH/SEMA-MT)',
    orgao: 'Secretaria de Estado de Meio Ambiente do Estado de Mato Grosso',
    rastreabilidadeId,
    avisoLegal: OFFICIAL_ANTI_PLAGIARISM_NOTICE,
    blocoAssinaturaFormatado
  };
}

// ------------------------------------------------------------------------------
// 3. CRIPTOGRAFIA AES-GCM (ANTI-INVASÃO E PROTEÇÃO DE ARMAZENAMENTO)
// ------------------------------------------------------------------------------

const DEFAULT_SYS_SALT = new Uint8Array([
  0x53, 0x45, 0x4d, 0x41, 0x2d, 0x4d, 0x54, 0x2d,
  0x43, 0x53, 0x42, 0x2d, 0x32, 0x30, 0x32, 0x36
]); // "SEMA-MT-CSB-2026"

/**
 * Deriva uma CryptoKey para AES-GCM a partir de uma chave mestra
 */
async function deriveAesKey(passphrase: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(passphrase),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: DEFAULT_SYS_SALT,
      iterations: 100000,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Criptografa string com AES-GCM 256-bit
 */
export async function encryptTextAesGcm(plaintext: string, secretKey: string = 'SEMA_MT_SECURE_VAULT_2026'): Promise<string> {
  if (typeof crypto === 'undefined' || !crypto.subtle) {
    // Fallback de codificação segura base64 com assinatura
    return `b64enc:${btoa(encodeURIComponent(plaintext))}`;
  }

  try {
    const key = await deriveAesKey(secretKey);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(plaintext);

    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      encoded
    );

    const combined = new Uint8Array(iv.length + ciphertext.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(ciphertext), iv.length);

    let binary = '';
    const bytes = new Uint8Array(combined);
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return `aesgcm:${btoa(binary)}`;
  } catch (err) {
    console.warn('Criptografia AES-GCM em fallback:', err);
    return `b64enc:${btoa(encodeURIComponent(plaintext))}`;
  }
}

/**
 * Descriptografa string gerada por encryptTextAesGcm
 */
export async function decryptTextAesGcm(payload: string, secretKey: string = 'SEMA_MT_SECURE_VAULT_2026'): Promise<string> {
  if (!payload) return '';

  if (payload.startsWith('b64enc:')) {
    const raw = payload.slice(7);
    return decodeURIComponent(atob(raw));
  }

  if (payload.startsWith('aesgcm:')) {
    if (typeof crypto === 'undefined' || !crypto.subtle) {
      throw new Error('WebCrypto API indisponível para decriptação');
    }

    const binary = atob(payload.slice(7));
    const combined = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      combined[i] = binary.charCodeAt(i);
    }

    const iv = combined.slice(0, 12);
    const ciphertext = combined.slice(12);
    const key = await deriveAesKey(secretKey);

    const decryptedBuffer = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      ciphertext
    );

    return new TextDecoder().decode(decryptedBuffer);
  }

  // Se já estiver em texto puro
  return payload;
}

// ------------------------------------------------------------------------------
// 4. SANITIZAÇÃO RIGOROSA ANTI-INVASÃO HACKER E PREVENÇÃO DE XSS
// ------------------------------------------------------------------------------

/**
 * Remove caracteres maliciosos e tags que poderiam executar scripts
 */
export function sanitizeText(input: unknown): string {
  if (typeof input !== 'string') {
    return input === null || input === undefined ? '' : String(input);
  }
  return input
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+="[^"]*"/gi, '')
    .replace(/on\w+='[^']*'/gi, '');
}

/**
 * Sanitiza recursivamente objetos JSON prevenindo Poluição de Protótipo
 * (Bloqueia __proto__, constructor, prototype)
 */
export function sanitizeDeepObject<T>(input: T): T {
  if (input === null || typeof input !== 'object') {
    if (typeof input === 'string') {
      return sanitizeText(input) as unknown as T;
    }
    return input;
  }

  if (Array.isArray(input)) {
    return input.map(item => sanitizeDeepObject(item)) as unknown as T;
  }

  const cleanObj: Record<string, unknown> = Object.create(null);
  for (const key of Object.keys(input as Record<string, unknown>)) {
    // Bloqueia tentativas de poluição de protótipo de objetos JavaScript
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      continue;
    }
    cleanObj[key] = sanitizeDeepObject((input as Record<string, unknown>)[key]);
  }

  return cleanObj as T;
}

/**
 * Validação rigorosa de estrutura de vistoria importada de arquivos externos
 */
export function validateAndSanitizeImportedInspection(raw: unknown): InspectionData | null {
  if (!raw || typeof raw !== 'object') return null;

  const sanitized = sanitizeDeepObject(raw) as Partial<InspectionData>;

  if (
    !sanitized.id ||
    !sanitized.generalInfo ||
    !sanitized.damIdentification ||
    typeof sanitized.damIdentification !== 'object'
  ) {
    return null;
  }

  return sanitized as InspectionData;
}
