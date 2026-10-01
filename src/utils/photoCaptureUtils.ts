// ==============================================================================
// UTILITÁRIO DE CAPTURA DE FOTOS, GEOLOCALIZAÇÃO E TIMESTAMPS (CSB/SEMA-MT)
// ==============================================================================

export interface CapturedGpsData {
  latitude: number;
  longitude: number;
  accuracyMeters?: number;
  altitudeMeters?: number | null;
  captureTimestamp: string;
}

/**
 * Obtém as coordenadas GPS do dispositivo móvel/tablet com alta precisão
 */
export async function getDeviceGpsCoordinates(timeoutMs: number = 10000): Promise<CapturedGpsData | null> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    return null;
  }

  return new Promise(resolve => {
    navigator.geolocation.getCurrentPosition(
      pos => {
        resolve({
          latitude: parseFloat(pos.coords.latitude.toFixed(6)),
          longitude: parseFloat(pos.coords.longitude.toFixed(6)),
          accuracyMeters: pos.coords.accuracy ? Math.round(pos.coords.accuracy * 10) / 10 : undefined,
          altitudeMeters: pos.coords.altitude !== null ? Math.round(pos.coords.altitude * 10) / 10 : null,
          captureTimestamp: new Date(pos.timestamp || Date.now()).toISOString()
        });
      },
      () => {
        resolve(null);
      },
      {
        enableHighAccuracy: true,
        timeout: timeoutMs,
        maximumAge: 15000
      }
    );
  });
}

/**
 * Formata o timestamp de data e hora para exibição em português
 */
export function formatTimestampPtBr(dateInput?: Date | string | null): string {
  if (!dateInput) {
    return new Date().toLocaleString('pt-BR');
  }

  try {
    const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
    if (isNaN(d.getTime())) {
      // Se já for uma string formatada em pt-BR (ex: "01/10/2026, 14:30")
      return typeof dateInput === 'string' ? dateInput : new Date().toLocaleString('pt-BR');
    }
    return d.toLocaleString('pt-BR');
  } catch {
    return String(dateInput);
  }
}

/**
 * Comprime o arquivo de imagem no cliente (Canvas) para evitar travamento de memória
 * e gerar um arquivo JPEG leve mantendo alta nitidez para perícia técnica.
 */
export async function compressImageToDataUrlAndBlob(
  file: File,
  maxDimension: number = 1600,
  quality: number = 0.82
): Promise<{ dataUrl: string; blob: Blob }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = event => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          const fallbackDataUrl = event.target?.result as string;
          resolve({ dataUrl: fallbackDataUrl, blob: file });
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', quality);

        canvas.toBlob(
          blob => {
            if (blob) {
              resolve({ dataUrl, blob });
            } else {
              resolve({ dataUrl, blob: file });
            }
          },
          'image/jpeg',
          quality
        );
      };

      img.onerror = () => reject(new Error('Erro ao decodificar arquivo de imagem.'));
      img.src = event.target?.result as string;
    };

    reader.onerror = () => reject(new Error('Erro ao ler arquivo da câmera/galeria.'));
    reader.readAsDataURL(file);
  });
}

export const OFFICIAL_DAM_COMPONENTS_OPTIONS = [
  { id: 'crista', name: 'Crista da Barragem (Coroamento)', category: 'Estrutura Principal' },
  { id: 'talude_montante', name: 'Talude de Montante (Face da Água)', category: 'Maciço' },
  { id: 'talude_jusante', name: 'Talude de Jusante (Face Externa)', category: 'Maciço' },
  { id: 'vertedouro', name: 'Estruturas Vertedoras (Vertedouro, Extravasor, Monge)', category: 'Hidráulica' },
  { id: 'descarregador_fundo', name: 'Descarregador de Fundo / Tomada d\'Água', category: 'Hidráulica' },
  { id: 'drenagem_pe', name: 'Pé da Barragem e Sistema de Drenagem Interna', category: 'Drenagem' },
  { id: 'reservatorio_borda', name: 'Reservatório, Borda Livre e Margens', category: 'Reservatório' },
  { id: 'area_jusante', name: 'Região a Jusante da Barragem (Faixa de 10m e Vale)', category: 'Entorno' },
  { id: 'instrumentacao', name: 'Instrumentação de Monitoramento', category: 'Segurança' },
  { id: 'outros', name: 'Outros Problemas / Estruturas Complementares', category: 'Complementar' },
  { id: 'geral', name: 'Visão Geral / Não Vinculado a Componente', category: 'Geral' }
];

export function getComponentNameById(componentId: string): string {
  const found = OFFICIAL_DAM_COMPONENTS_OPTIONS.find(c => c.id === componentId);
  if (found) return found.name;

  // Fallbacks para sinônimos comuns
  const lower = (componentId || '').toLowerCase();
  if (lower.includes('crista') || lower.includes('coroamento')) return 'Crista da Barragem (Coroamento)';
  if (lower.includes('montante')) return 'Talude de Montante';
  if (lower.includes('talude_jusante') || lower === 'jusante') return 'Talude de Jusante';
  if (lower.includes('area_jusante') || lower.includes('regiao_jusante')) return 'Região a Jusante da Barragem';
  if (lower.includes('vertedouro') || lower.includes('extravasor')) return 'Estruturas Vertedoras (Vertedouro)';
  if (lower.includes('fundo') || lower.includes('tomada')) return 'Descarregador de Fundo / Tomada d\'Água';
  if (lower.includes('drenagem') || lower.includes('pe')) return 'Pé da Barragem e Drenagem Interna';
  if (lower.includes('reservatorio')) return 'Reservatório, Borda Livre e Margens';
  if (lower.includes('instrument')) return 'Instrumentação de Monitoramento';

  return 'Visão Geral / Não Vinculado';
}
