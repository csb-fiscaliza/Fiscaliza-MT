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

// ==============================================================================
// 3. CRIPTOGRAFIA AES-GCM 256-BIT (SEM CHAVES ESTÁTICAS NO CÓDIGO-FONTE)
// ==============================================================================

const LEGACY_SYS_SALT = new Uint8Array([
  0x53, 0x45, 0x4d, 0x41, 0x2d, 0x4d, 0x54, 0x2d,
  0x43, 0x53, 0x42, 0x2d, 0x32, 0x30, 0x32, 0x36
]);

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.trim();
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

/**
 * Comparação em tempo constante para mitigar ataques de timing
 */
export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Deriva uma CryptoKey para AES-GCM 256-bit via PBKDF2-SHA256 com salt aleatório
 */
async function deriveAesKey(passphrase: string, salt: Uint8Array, iterations: number = 150000): Promise<CryptoKey> {
  if (!passphrase || passphrase.trim().length < 6) {
    throw new Error('Chave criptográfica inválida ou insuficiente.');
  }
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
      salt: salt.buffer as ArrayBuffer,
      iterations,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Criptografa string com AES-GCM 256-bit e Salt aleatório de 128 bits (formato aesgcm2)
 * Exige explicitamente uma chave/frase-secreta fornecida em tempo de execução.
 */
export async function encryptTextAesGcm(plaintext: string, secretKey: string): Promise<string> {
  if (!secretKey || secretKey.trim().length < 6) {
    throw new Error('É obrigatório informar uma frase-chave segura (mínimo 6 caracteres) para criptografia.');
  }
  if (typeof crypto === 'undefined' || !crypto.subtle) {
    throw new Error('WebCrypto API indisponível neste navegador/contexto inseguro para criptografia AES-GCM.');
  }

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveAesKey(secretKey, salt, 150000);
  const encoded = new TextEncoder().encode(plaintext);

  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoded
  );

  return `aesgcm2:${bytesToBase64(salt)}:${bytesToBase64(iv)}:${bytesToBase64(new Uint8Array(ciphertext))}`;
}

/**
 * Descriptografa payload gerado por encryptTextAesGcm (suporta aesgcm2 e formato legado aesgcm)
 */
export async function decryptTextAesGcm(payload: string, secretKey: string): Promise<string> {
  if (!payload) return '';
  if (!secretKey || secretKey.trim().length < 1) {
    throw new Error('Informe a senha de descriptografia do arquivo.');
  }

  if (payload.startsWith('aesgcm2:')) {
    if (typeof crypto === 'undefined' || !crypto.subtle) {
      throw new Error('WebCrypto API indisponível para decriptação AES-GCM.');
    }
    const parts = payload.split(':');
    if (parts.length !== 4) {
      throw new Error('Estrutura de envelope criptografado inválida.');
    }
    const salt = base64ToBytes(parts[1]);
    const iv = base64ToBytes(parts[2]);
    const ciphertext = base64ToBytes(parts[3]);
    const key = await deriveAesKey(secretKey, salt, 150000);

    const decryptedBuffer = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv.buffer as ArrayBuffer },
      key,
      ciphertext.buffer as ArrayBuffer
    );
    return new TextDecoder().decode(decryptedBuffer);
  }

  if (payload.startsWith('aesgcm:')) {
    if (typeof crypto === 'undefined' || !crypto.subtle) {
      throw new Error('WebCrypto API indisponível para decriptação');
    }

    const combined = base64ToBytes(payload.slice(7));
    const iv = combined.slice(0, 12);
    const ciphertext = combined.slice(12);
    const key = await deriveAesKey(secretKey, LEGACY_SYS_SALT, 100000);

    const decryptedBuffer = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv.buffer as ArrayBuffer },
      key,
      ciphertext.buffer as ArrayBuffer
    );

    return new TextDecoder().decode(decryptedBuffer);
  }

  if (payload.startsWith('b64enc:')) {
    const raw = payload.slice(7);
    return decodeURIComponent(atob(raw));
  }

  return payload;
}

// ==============================================================================
// 4. HASHING CRIPTOGRÁFICO DE SENHAS (PBKDF2-SHA256) & POLÍTICA DE FORÇA
// ==============================================================================

/**
 * Valida força mínima da senha institucional
 */
export function validatePasswordStrength(password: string): { valid: boolean; reason?: string } {
  if (!password || password.length < 8) {
    return { valid: false, reason: 'A senha deve possuir no mínimo 8 caracteres.' };
  }
  const hasLower = /[a-z]/.test(password);
  const hasUpper = /[A-Z]/.test(password);
  const hasDigitOrSymbol = /[0-9!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password);

  if (!hasLower || !hasUpper || !hasDigitOrSymbol) {
    return {
      valid: false,
      reason: 'A senha deve combinar letras maiúsculas, minúsculas e ao menos um número ou símbolo.'
    };
  }
  return { valid: true };
}

/**
 * Gera senha temporária criptograficamente aleatória em tempo de execução (nunca hardcoded)
 */
export function generateSecureTemporaryPassword(length: number = 12): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnopqrstuvwxyz';
  const digits = '23456789';
  const symbols = '@#$%&*!';
  const all = upper + lower + digits + symbols;

  const buf = new Uint32Array(length);
  crypto.getRandomValues(buf);

  const chars: string[] = [
    upper[buf[0] % upper.length],
    lower[buf[1] % lower.length],
    digits[buf[2] % digits.length],
    symbols[buf[3] % symbols.length]
  ];

  for (let i = 4; i < length; i++) {
    chars.push(all[buf[i] % all.length]);
  }

  // Shuffle Fisher-Yates seguro
  const shuf = new Uint32Array(chars.length);
  crypto.getRandomValues(shuf);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = shuf[i] % (i + 1);
    const tmp = chars[i];
    chars[i] = chars[j];
    chars[j] = tmp;
  }

  return chars.join('');
}

/**
 * Gera hash criptográfico irreversível da senha com salt aleatório (PBKDF2-SHA256)
 */
export async function hashPasswordSecure(password: string): Promise<string> {
  const salt = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(salt);
  } else {
    throw new Error('Gerador criptográfico aleatório indisponível no dispositivo.');
  }

  const iterations = 120000;
  const saltHex = bytesToHex(salt);

  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      enc.encode(password),
      { name: 'PBKDF2' },
      false,
      ['deriveBits']
    );
    const derivedBits = await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt: salt.buffer as ArrayBuffer,
        iterations,
        hash: 'SHA-256'
      },
      keyMaterial,
      256
    );
    const hashHex = bytesToHex(new Uint8Array(derivedBits));
    return `pbkdf2_sha256$${iterations}$${saltHex}$${hashHex}`;
  }

  // Fallback com SHA-256 encadeado (key stretching) caso subtle não esteja disponível
  let acc = `${saltHex}:${password}`;
  for (let i = 0; i < 2000; i++) {
    acc = computeSha256Sync(acc + ':' + saltHex);
  }
  return `sha256_iter$2000$${saltHex}$${acc}`;
}

/**
 * Verifica uma senha informada contra o hash PBKDF2 armazenado
 */
export async function verifyPasswordSecure(password: string, storedHash: string): Promise<boolean> {
  if (!password || !storedHash) return false;
  const parts = storedHash.split('$');
  if (parts.length !== 4) return false;

  const [scheme, iterStr, saltHex, expectedHex] = parts;
  const iterations = parseInt(iterStr, 10);
  if (!iterations || !saltHex || !expectedHex) return false;

  if (scheme === 'pbkdf2_sha256') {
    if (typeof crypto === 'undefined' || !crypto.subtle) return false;
    const salt = hexToBytes(saltHex);
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      enc.encode(password),
      { name: 'PBKDF2' },
      false,
      ['deriveBits']
    );
    const derivedBits = await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt: salt.buffer as ArrayBuffer,
        iterations,
        hash: 'SHA-256'
      },
      keyMaterial,
      256
    );
    const computedHex = bytesToHex(new Uint8Array(derivedBits));
    return constantTimeEqual(computedHex, expectedHex);
  }

  if (scheme === 'sha256_iter') {
    let acc = `${saltHex}:${password}`;
    for (let i = 0; i < iterations; i++) {
      acc = computeSha256Sync(acc + ':' + saltHex);
    }
    return constantTimeEqual(acc, expectedHex);
  }

  return false;
}

// ==============================================================================
// 5. GUARDA DE CHAVES FRONTEND E MASCARAMENTO DE PII EM LOGS
// ==============================================================================

/**
 * Valida estruturalmente se uma chave Supabase informada via VITE_* é segura para frontend.
 * BLOQUEIA estritamente chaves 'service_role' ou 'supabase_admin' para impedir vazamento de privilégios!
 */
export function assertFrontendSafeSupabaseKey(key: string): { safe: boolean; reason?: string } {
  if (!key || typeof key !== 'string') {
    return { safe: false, reason: 'Chave ausente.' };
  }
  const trimmed = key.trim();
  if (trimmed.length < 20 || trimmed.includes('your-project') || trimmed.includes('sua_chave')) {
    return { safe: false, reason: 'Chave placeholder não configurada.' };
  }

  // Verifica tokens JWT padrão do Supabase (header.payload.signature)
  const segments = trimmed.split('.');
  if (segments.length === 3) {
    try {
      const base64 = segments[1].replace(/-/g, '+').replace(/_/g, '/');
      const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
      const payloadJson = atob(padded);
      const payload = JSON.parse(payloadJson);
      const role = String(payload?.role || '').toLowerCase();
      if (role === 'service_role' || role === 'supabase_admin' || role === 'postgres') {
        console.error('[CSB-Segurança CRÍTICO] Chave privilegiada (service_role) detectada em variável de frontend e BLOQUEADA automaticamente!');
        return {
          safe: false,
          reason: 'BLOQUEIO DE SEGURANÇA: Chaves service_role nunca devem ser expostas no frontend. Utilize apenas a chave pública ANON com RLS ativo.'
        };
      }
    } catch {
      // Caso seja chave opaca / formato publishable sb_publishable_...
      if (trimmed.startsWith('sb_secret_')) {
        console.error('[CSB-Segurança CRÍTICO] Chave secreta sb_secret_ detectada no frontend e BLOQUEADA!');
        return {
          safe: false,
          reason: 'BLOQUEIO DE SEGURANÇA: Chaves sb_secret_ não podem ser usadas no navegador.'
        };
      }
    }
  }

  if (trimmed.startsWith('sb_secret_')) {
    return {
      safe: false,
      reason: 'BLOQUEIO DE SEGURANÇA: Chaves sb_secret_ não podem ser usadas no frontend.'
    };
  }

  return { safe: true };
}

/**
 * Mascara identificadores sensíveis (CPF/CNPJ) para logs e auditoria
 */
export function maskSensitiveIdentifier(val?: string | null): string {
  if (!val) return '***';
  const digits = val.replace(/\D/g, '');
  if (digits.length === 11) {
    return `${digits.slice(0, 3)}.***.***-${digits.slice(9)}`;
  }
  if (digits.length === 14) {
    return `${digits.slice(0, 2)}.***.***/****-${digits.slice(12)}`;
  }
  return val.length > 4 ? `${val.slice(0, 2)}***${val.slice(-2)}` : '***';
}

/**
 * Mascara e-mail para logs sem expor PII completa
 */
export function maskEmail(email?: string | null): string {
  if (!email || !email.includes('@')) return '***';
  const [local, domain] = email.split('@');
  const visible = local.slice(0, 2);
  return `${visible}***@${domain}`;
}

// ==============================================================================
// 6. SANITIZAÇÃO RIGOROSA ANTI-INVASÃO E PREVENÇÃO DE XSS
// ==============================================================================

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
    .replace(/data:text\/html/gi, '')
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
    typeof sanitized.id !== 'string' ||
    !sanitized.generalInfo ||
    !sanitized.damIdentification ||
    typeof sanitized.damIdentification !== 'object'
  ) {
    return null;
  }

  return sanitized as InspectionData;
}
