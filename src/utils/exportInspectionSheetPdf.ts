// ==============================================================================
// ARQUIVO: src/utils/exportInspectionSheetPdf.ts
// GERADOR E EXPORTADOR DE FICHA DE VISTORIA OFICIAL EM PDF (CSB / SEMA-MT)
// Converte a ficha de vistoria preenchida para formato PDF estilizado
// seguindo rigorosamente o padrão oficial da SEMA-MT, incluindo:
// - Selo Digital de Autenticidade e Anti-Plágio (SHA-256)
// - Registro Fotográfico Organizado por Componente com Geotag e Timestamp
// - Destaque para Anomalias marcadas como "Sim" com Nível de Perigo e Magnitude
// - Layout otimizado para impressão/PDF A4 (sem corte de páginas)
// ==============================================================================

import { InspectionData, ItemAvaliadoEntity, InspectionPhoto } from '../types/inspection';
import { createAuthenticitySeal, AuthenticitySealData } from './securityCrypto';
import { formatGmsString } from './geoCoordinates';

/**
 * Traduz valores de resposta para exibição legível
 */
function formatRespostaTexto(resp?: string): { texto: string; classe: string; isSim: boolean } {
  switch (resp) {
    case 'sim':
      return { texto: 'SIM (ANOMALIA DETECTADA)', classe: 'badge-sim', isSim: true };
    case 'nao':
      return { texto: 'Não', classe: 'badge-nao', isSim: false };
    case 'nao_observado':
      return { texto: 'Não observado', classe: 'badge-neutral', isSim: false };
    case 'impossivel_observar':
      return { texto: 'Impossível observar', classe: 'badge-neutral', isSim: false };
    case 'nao_se_aplica':
      return { texto: 'Não se aplica', classe: 'badge-neutral', isSim: false };
    case 'sem_informacao':
    default:
      return { texto: 'Não preenchido', classe: 'badge-muted', isSim: false };
  }
}

/**
 * Traduz o Nível de Perigo para texto e estilo
 */
function formatNivelPerigo(nivel?: string | null): { texto: string; cor: string; bg: string } {
  switch (nivel) {
    case 'normal':
      return { texto: 'Normal', cor: '#047857', bg: '#d1fae5' };
    case 'atencao':
      return { texto: 'Atenção', cor: '#b45309', bg: '#fef3c7' };
    case 'alerta':
      return { texto: 'Alerta', cor: '#c2410c', bg: '#ffedd5' };
    case 'emergencia':
      return { texto: 'Emergência', cor: '#b91c1c', bg: '#fee2e2' };
    default:
      return { texto: 'Não especificado', cor: '#64748b', bg: '#f1f5f9' };
  }
}

/**
 * Traduz a Magnitude para texto e estilo
 */
function formatMagnitude(mag?: string | null): { texto: string; cor: string; bg: string } {
  switch (mag) {
    case 'insignificante':
      return { texto: 'Insignificante', cor: '#0f766e', bg: '#ccfbf1' };
    case 'pequena':
      return { texto: 'Pequena', cor: '#1d4ed8', bg: '#dbeafe' };
    case 'media':
      return { texto: 'Média', cor: '#d97706', bg: '#fef3c7' };
    case 'grande':
      return { texto: 'Grande', cor: '#dc2626', bg: '#fee2e2' };
    default:
      return { texto: 'Não especificada', cor: '#64748b', bg: '#f1f5f9' };
  }
}

/**
 * Mapeamento descritivo de componentes da barragem
 */
const COMPONENT_LABELS: Record<string, string> = {
  montante: '5.1. Talude de Montante',
  coroamento: '5.2. Coroamento (Crista)',
  crista: '5.2. Coroamento (Crista)',
  jusante: '5.3. Talude de Jusante',
  talude_jusante: '5.3. Talude de Jusante',
  regiao_jusante: '5.4. Região a Jusante da Barragem',
  area_jusante: '5.4. Região a Jusante da Barragem',
  instrumentacao: '5.5. Instrumentação de Monitoramento',
  vertedouro: '5.6. Estruturas Vertedoras',
  reservatorio: '5.7. Reservatório',
  outros: '6. Outros Problemas e Anomalias Gerais',
  geral: 'Visão Geral / Outros'
};

/**
 * Gera o documento HTML completo estilizado no padrão oficial da SEMA-MT
 */
export function generateInspectionSheetHtml(data: InspectionData): string {
  const g = data.generalInfo;
  const d = data.damIdentification;
  const seal = createAuthenticitySeal(data, 'FICHA DE VISTORIA TÉCNICA DE CAMPO');

  const dataVistoria = g.inspectionDate
    ? new Date(g.inspectionDate + 'T00:00:00').toLocaleDateString('pt-BR')
    : 'Não informada';

  const dataEmissao = new Date().toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  const latGms = formatGmsString(d.coordinates.latitude, true, false);
  const lonGms = formatGmsString(d.coordinates.longitude, false, false);
  const coordsStr = latGms && lonGms 
    ? `${latGms} / ${lonGms} (${d.coordinates.datum || 'SIRGAS 2000'})`
    : (d.coordinates.latitude ? `${d.coordinates.latitude}, ${d.coordinates.longitude}` : 'Não informadas');

  const dim = d.estimatedDimensions || {
    heightMeters: '',
    crestLengthMeters: '',
    crestWidthMeters: '',
    reservoirAreaHectares: '',
    reservoirVolumeM3: '',
    freeboardMeters: ''
  };

  // Coleta os itens avaliados
  const itens = data.itensAvaliadosDetalhados || {};
  const itensList = Object.values(itens);

  // Agrupamento de itens por componente
  const componentOrder = [
    { code: 'montante', title: '5.1. Talude de Montante' },
    { code: 'coroamento', title: '5.2. Coroamento (Crista)' },
    { code: 'jusante', title: '5.3. Talude de Jusante' },
    { code: 'regiao_jusante', title: '5.4. Região a Jusante da Barragem' },
    { code: 'instrumentacao', title: '5.5. Instrumentação de Monitoramento' },
    { code: 'vertedouro', title: '5.6. Estruturas Vertedoras' },
    { code: 'reservatorio', title: '5.7. Reservatório' }
  ];

  // Itens padrão caso o fiscal ainda não tenha alterado no formulário
  const defaultItemsByComponent: Record<string, { code: string; label: string }[]> = {
    montante: [
      { code: 'erosoes', label: 'Erosões' },
      { code: 'escorregamento', label: 'Escorregamento' },
      { code: 'afundamento', label: 'Afundamento e/ou Buracos' },
      { code: 'arvores_arbustos', label: 'Árvores e Arbustos' },
      { code: 'drenos_canaletas', label: 'Drenos / Canaletas' },
      { code: 'biologicos', label: 'Formigueiros / Cupinzeiros / Tocas de Animais' },
      { code: 'sinais_movimentacao', label: 'Sinais de Movimentação' }
    ],
    coroamento: [
      { code: 'largura_insuficiente', label: 'Largura Insuficiente da Crista' },
      { code: 'depressoes', label: 'Depressões / Afundamentos' },
      { code: 'trincas_longitudinais', label: 'Trincas Longitudinais' },
      { code: 'trincas_transversais', label: 'Trincas Transversais' },
      { code: 'erosoes_crista', label: 'Erosões / Voçorocas' },
      { code: 'tráfego_indevido', label: 'Tráfego Indevido de Veículos Pesados' },
      { code: 'vegetacao_excessiva', label: 'Vegetação Arbustiva Inadequada' },
      { code: 'sinais_galgamento', label: 'Sinais de Galgamento Recente (Overtopping)' }
    ],
    jusante: [
      { code: 'surgencias', label: 'Surgências / Fuga de Água (Piping)' },
      { code: 'umidade_excessiva', label: 'Área com Umidade Excessiva / Mancha de Infiltração' },
      { code: 'trincas_talude_jusante', label: 'Trincas no Talude de Jusante' },
      { code: 'escorregamento_jusante', label: 'Escorregamentos / Deslizamentos' },
      { code: 'erosoes_jusante', label: 'Erosões / Sulcos de Erosão' },
      { code: 'vegetacao_arborea_jusante', label: 'Vegetação Arbórea / Arbustiva Densas' },
      { code: 'biologicos_jusante', label: 'Formigueiros / Tocas de Animais' },
      { code: 'drenagem_pe_entupida', label: 'Sistema de Drenagem de Pé Inoperante / Obstruído' },
      { code: 'agua_turva', label: 'Saída de Água com Transporte de Sólidos (Água Turva)' }
    ],
    regiao_jusante: [
      { code: 'populacao_jusante', label: 'Existência de Moradias ou Vidas Humanas a Jusante' },
      { code: 'rodovias_pontes', label: 'Rodovias, Estradas Vicinais ou Pontes Susceptíveis' },
      { code: 'instalacoes_produtivas', label: 'Instalações Comerciais, Industriais ou Agrícolas' },
      { code: 'impacto_ambiental', label: 'Áreas de Preservação Permanente (APP) / Recursos Naturais Vulneráveis' }
    ],
    instrumentacao: [],
    vertedouro: [],
    reservatorio: [
      { code: 'assoreamento', label: 'Indícios Acentuados de Assoreamento' },
      { code: 'ocupacao_margens', label: 'Ocupação Irregular das Margens / APP' },
      { code: 'macrófitas', label: 'Proliferação Excessiva de Macrófitas Aquáticas' },
      { code: 'estabilidade_encostas', label: 'Instabilidade das Encostas do Reservatório' },
      { code: 'borda_livre_critica', label: 'Borda Livre Crítica ou Risco Iminente de Transbordamento' }
    ]
  };

  // Organização das fotos por componente
  const photos = data.photos || [];
  let figIndex = 1;
  const photosWithFigures = photos.map(p => ({
    ...p,
    figuraNum: figIndex++
  }));

  // HTML da Seção de Componentes e Anomalias
  const componentesHtml = componentOrder.map(comp => {
    // Busca itens registrados para este componente
    const recordedItems = itensList.filter(i => 
      i.componenteCodigo === comp.code || 
      (comp.code === 'coroamento' && i.componenteCodigo === 'crista') ||
      (comp.code === 'jusante' && i.componenteCodigo === 'talude_jusante') ||
      (comp.code === 'regiao_jusante' && i.componenteCodigo === 'area_jusante')
    );

    // Complementa com itens padrão não registrados se houver
    const defaults = defaultItemsByComponent[comp.code] || [];
    const allCompItems: {
      label: string;
      item: ItemAvaliadoEntity | null;
    }[] = [];

    defaults.forEach(def => {
      const found = recordedItems.find(r => r.itemCodigo === def.code);
      allCompItems.push({
        label: found?.itemRotuloOriginal || def.label,
        item: found || null
      });
    });

    // Adiciona outros itens que possam ter sido registrados com outro código
    recordedItems.forEach(r => {
      if (!defaults.some(d => d.code === r.itemCodigo)) {
        allCompItems.push({
          label: r.itemRotuloOriginal || r.itemCodigo,
          item: r
        });
      }
    });

    // Se não tiver itens específicos (ex: instrumentação/vertedouro), exibe texto descritivo
    let itemsBlockHtml = '';

    if (allCompItems.length > 0) {
      itemsBlockHtml = `
        <table class="tabela-itens">
          <thead>
            <tr>
              <th style="width: 38%;">Item / Aspecto Avaliado</th>
              <th style="width: 20%;">Constatação</th>
              <th style="width: 21%;">Nível de Perigo</th>
              <th style="width: 21%;">Magnitude</th>
            </tr>
          </thead>
          <tbody>
            ${allCompItems.map(({ label, item }) => {
              const resp = formatRespostaTexto(item?.resposta);
              const perigo = item?.resposta === 'sim' ? formatNivelPerigo(item.nivelPerigo) : null;
              const mag = item?.resposta === 'sim' ? formatMagnitude(item.magnitude) : null;
              const hasObs = item?.resposta === 'sim' && (item?.observacaoComplementar || item?.localizacaoDetalhe);

              return `
                <tr class="${resp.isSim ? 'tr-anomalia' : ''}">
                  <td class="td-label">
                    <strong>${label}</strong>
                    ${hasObs ? `
                      <div class="item-detalhe-obs">
                        ${item?.localizacaoDetalhe ? `<span><strong>Localização:</strong> ${item.localizacaoDetalhe}</span><br/>` : ''}
                        ${item?.observacaoComplementar ? `<span><strong>Obs:</strong> ${item.observacaoComplementar}</span>` : ''}
                      </div>
                    ` : ''}
                  </td>
                  <td>
                    <span class="badge ${resp.classe}">${resp.texto}</span>
                  </td>
                  <td>
                    ${perigo ? `
                      <span class="badge" style="background-color: ${perigo.bg}; color: ${perigo.cor}; border: 1px solid ${perigo.cor}40;">
                        ${perigo.texto}
                      </span>
                    ` : '<span class="text-muted">—</span>'}
                  </td>
                  <td>
                    ${mag ? `
                      <span class="badge" style="background-color: ${mag.bg}; color: ${mag.cor}; border: 1px solid ${mag.cor}40;">
                        ${mag.texto}
                      </span>
                    ` : '<span class="text-muted">—</span>'}
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      `;
    } else if (comp.code === 'instrumentacao') {
      itemsBlockHtml = `
        <div class="bloco-info-livre">
          <p><strong>Instrumentos Existentes:</strong> Registrado conforme vistoria em campo (Piezômetros, réguas limnimétricas, medidores de vazão ou ausente).</p>
        </div>
      `;
    } else if (comp.code === 'vertedouro') {
      itemsBlockHtml = `
        <div class="bloco-info-livre">
          <p><strong>Tipologia e Descrição Hidráulica:</strong> ${d.spillwayType ? d.spillwayType.replace(/_/g, ' ').toUpperCase() : 'Não informado'}. Vertedouro operacional avaliado visualmente.</p>
        </div>
      `;
    }

    // Fotos associadas a este componente
    const compPhotos = photosWithFigures.filter(p => {
      const cId = (p.componentId || '').toLowerCase();
      if (comp.code === 'montante') return cId.includes('montante');
      if (comp.code === 'coroamento') return cId.includes('coroamento') || cId.includes('crista');
      if (comp.code === 'jusante') return cId.includes('jusante') && !cId.includes('area') && !cId.includes('regiao');
      if (comp.code === 'regiao_jusante') return cId.includes('regiao_jusante') || cId.includes('area_jusante');
      if (comp.code === 'instrumentacao') return cId.includes('instrument');
      if (comp.code === 'vertedouro') return cId.includes('vertedouro') || cId.includes('extravasor');
      if (comp.code === 'reservatorio') return cId.includes('reservatorio');
      return false;
    });

    const compPhotosHtml = compPhotos.length > 0 ? `
      <div class="sub-fotos-componente">
        <h5 class="sub-fotos-titulo">Registros Fotográficos do Componente (${compPhotos.length}):</h5>
        <div class="grid-fotos-mini">
          ${compPhotos.map(p => `
            <div class="foto-mini-card">
              <div class="foto-mini-img-wrapper">
                <img src="${p.dataUrl}" alt="${p.caption || 'Foto do componente'}" />
              </div>
              <div class="foto-mini-info">
                <strong>Fig. ${p.figuraNum}:</strong> ${p.caption || 'Sem legenda'}
                ${p.timestamp ? `<div class="foto-mini-meta">🕒 ${p.timestamp}</div>` : ''}
                ${(p.latitude !== undefined && p.longitude !== undefined) ? `<div class="foto-mini-meta">📍 Lat: ${p.latitude.toFixed(5)} / Lon: ${p.longitude.toFixed(5)}</div>` : ''}
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    ` : '';

    return `
      <div class="subtopico-bloco">
        <h4 class="subtopico-header">${comp.title}</h4>
        ${itemsBlockHtml}
        ${compPhotosHtml}
      </div>
    `;
  }).join('');

  // HTML do Registro Fotográfico Geral Completo
  const registroFotograficoHtml = photosWithFigures.length > 0 ? `
    <div class="secao-bloco pagina-quebra">
      <h3 class="secao-titulo">7. REGISTRO FOTOGRÁFICO OFICIAL DE CAMPO</h3>
      <p class="secao-descricao">
        Documentação fotográfica registrada durante a inspeção técnica, com numeração oficial de figuras, identificação estrutural, georreferenciamento e registro temporal de autenticidade.
      </p>

      <div class="grid-fotos-oficial">
        ${photosWithFigures.map(photo => {
          const compNome = photo.componentName || COMPONENT_LABELS[photo.componentId] || 'Componente da Barragem';
          return `
            <div class="foto-card-oficial">
              <div class="foto-img-container">
                <img src="${photo.dataUrl}" alt="${photo.caption || compNome}" />
              </div>
              <div class="foto-legenda-box">
                <div class="foto-titulo">
                  <strong>Figura ${photo.figuraNum}:</strong> ${compNome}
                </div>
                ${photo.caption ? `
                  <div class="foto-descricao-texto">
                    ${photo.caption}
                  </div>
                ` : '<div class="foto-descricao-texto italic">Registro fotográfico da estrutura</div>'}
                
                <div class="foto-metadados-grid">
                  ${photo.timestamp ? `
                    <div class="foto-meta-item">
                      <strong>Registro:</strong> ${photo.timestamp}
                    </div>
                  ` : ''}
                  ${(photo.latitude !== undefined && photo.longitude !== undefined) ? `
                    <div class="foto-meta-item">
                      <strong>Coordenadas:</strong> Lat: ${photo.latitude.toFixed(6)}°, Lon: ${photo.longitude.toFixed(6)}°
                      ${photo.accuracyMeters ? ` (±${photo.accuracyMeters.toFixed(1)}m)` : ''}
                    </div>
                  ` : ''}
                  ${photo.locationDescription ? `
                    <div class="foto-meta-item">
                      <strong>Local:</strong> ${photo.locationDescription}
                    </div>
                  ` : ''}
                </div>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  ` : `
    <div class="secao-bloco">
      <h3 class="secao-titulo">7. REGISTRO FOTOGRÁFICO OFICIAL DE CAMPO</h3>
      <p class="text-muted italic">Nenhum registro fotográfico anexado no ato da geração da ficha.</p>
    </div>
  `;

  // HTML da Equipe Técnica Fiscalizadora
  const equipeFiscal = (g.inspectors && g.inspectors.length > 0)
    ? g.inspectors.filter(i => i.name && i.name.trim() !== '')
    : [{ name: 'Servidor Fiscal Designado', role: 'ANALISTA DE MEIO AMBIENTE', registrationNumber: 'N/I', sector: 'CSB/SRH' }];

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>FICHA DE VISTORIA SEMA-MT - ${d.damName || 'BARRAGEM'} - ${g.recordNumber || 'S-N'}</title>
  <style>
    /* Configurações Globais de Página e Impressão A4 */
    @page {
      size: A4 portrait;
      margin: 12mm 12mm 14mm 12mm;
    }

    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }

    body {
      font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, Helvetica, Arial, sans-serif;
      font-size: 11px;
      line-height: 1.4;
      color: #1e293b;
      background-color: #ffffff;
      margin: 0;
      padding: 0;
    }

    /* Cabeçalho Oficial SEMA-MT */
    .header-oficial {
      border-bottom: 2.5px solid #064e3b;
      padding-bottom: 10px;
      margin-bottom: 14px;
      display: flex;
      align-items: center;
      gap: 14px;
    }

    .brasao-box {
      width: 58px;
      height: 58px;
      border: 2px solid #064e3b;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 900;
      font-size: 14px;
      color: #064e3b;
      background: #f0fdf4;
      flex-shrink: 0;
      text-align: center;
    }

    .header-titulos {
      flex: 1;
    }

    .header-titulos h1 {
      font-size: 13px;
      font-weight: 900;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin: 0;
      color: #0f172a;
    }

    .header-titulos h2 {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      margin: 2px 0 0 0;
      color: #064e3b;
    }

    .header-titulos h3 {
      font-size: 9.5px;
      font-weight: 600;
      margin: 1px 0 0 0;
      color: #475569;
    }

    .titulo-documento-box {
      background: #064e3b;
      color: #ffffff;
      padding: 6px 10px;
      border-radius: 4px;
      margin-bottom: 12px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .titulo-documento-box h2 {
      font-size: 12px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin: 0;
    }

    .titulo-documento-box .num-ficha {
      font-size: 11px;
      font-family: monospace;
      font-weight: 700;
      background: #047857;
      padding: 2px 8px;
      border-radius: 3px;
    }

    /* Seções e Blocos */
    .secao-bloco {
      margin-bottom: 12px;
      page-break-inside: avoid;
    }

    .secao-titulo {
      font-size: 11px;
      font-weight: 800;
      color: #064e3b;
      text-transform: uppercase;
      border-bottom: 1.5px solid #cbd5e1;
      padding-bottom: 3px;
      margin: 0 0 6px 0;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .secao-descricao {
      font-size: 10px;
      color: #64748b;
      margin: 0 0 8px 0;
    }

    /* Tabelas de Dados Gerais e Técnicos */
    .tabela-dados {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 8px;
      font-size: 10.5px;
    }

    .tabela-dados td {
      padding: 4px 6px;
      border: 1px solid #e2e8f0;
      vertical-align: top;
    }

    .tabela-dados td.label {
      background: #f8fafc;
      font-weight: 700;
      color: #334155;
      width: 25%;
    }

    .tabela-dados td.val {
      color: #0f172a;
    }

    /* Tópico: Componentes da Barragem */
    .topico-componentes-header {
      background: #ecfdf5;
      border-left: 4px solid #059669;
      border-right: 1px solid #a7f3d0;
      border-top: 1px solid #a7f3d0;
      border-bottom: 1px solid #a7f3d0;
      padding: 6px 10px;
      margin: 10px 0 8px 0;
      font-weight: 800;
      font-size: 11.5px;
      color: #064e3b;
      text-transform: uppercase;
    }

    .subtopico-bloco {
      margin-bottom: 10px;
      border: 1px solid #e2e8f0;
      border-radius: 4px;
      overflow: hidden;
      page-break-inside: avoid;
    }

    .subtopico-header {
      background: #f1f5f9;
      padding: 5px 8px;
      margin: 0;
      font-size: 10.5px;
      font-weight: 800;
      color: #1e293b;
      border-bottom: 1px solid #e2e8f0;
    }

    .tabela-itens {
      width: 100%;
      border-collapse: collapse;
      font-size: 10px;
    }

    .tabela-itens th {
      background: #f8fafc;
      color: #475569;
      font-weight: 700;
      text-align: left;
      padding: 4px 6px;
      border-bottom: 1.5px solid #cbd5e1;
      border-right: 1px solid #e2e8f0;
      font-size: 9.5px;
      text-transform: uppercase;
    }

    .tabela-itens td {
      padding: 4px 6px;
      border-bottom: 1px solid #e2e8f0;
      border-right: 1px solid #e2e8f0;
      vertical-align: middle;
    }

    .tabela-itens tr.tr-anomalia {
      background: #fff1f2;
    }

    .td-label {
      color: #0f172a;
    }

    .item-detalhe-obs {
      margin-top: 2px;
      font-size: 9px;
      color: #b91c1c;
      background: #ffffff;
      padding: 2px 4px;
      border-left: 2px solid #ef4444;
      border-radius: 2px;
    }

    /* Badges e Status */
    .badge {
      display: inline-block;
      padding: 2px 6px;
      border-radius: 3px;
      font-size: 9px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }

    .badge-sim {
      background: #fee2e2;
      color: #b91c1c;
      border: 1px solid #f87171;
    }

    .badge-nao {
      background: #dcfce7;
      color: #15803d;
      border: 1px solid #86efac;
    }

    .badge-neutral {
      background: #f1f5f9;
      color: #475569;
      border: 1px solid #cbd5e1;
    }

    .badge-muted {
      background: #f8fafc;
      color: #94a3b8;
    }

    .text-muted {
      color: #94a3b8;
      font-size: 9px;
    }

    /* Fotos nos subtópicos */
    .sub-fotos-componente {
      padding: 6px 8px;
      background: #fafaf9;
      border-top: 1px solid #e2e8f0;
    }

    .sub-fotos-titulo {
      margin: 0 0 5px 0;
      font-size: 9.5px;
      font-weight: 700;
      color: #064e3b;
    }

    .grid-fotos-mini {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 6px;
    }

    .foto-mini-card {
      display: flex;
      gap: 6px;
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 3px;
      padding: 4px;
      align-items: center;
    }

    .foto-mini-img-wrapper {
      width: 60px;
      height: 48px;
      flex-shrink: 0;
      overflow: hidden;
      border-radius: 2px;
      background: #e2e8f0;
    }

    .foto-mini-img-wrapper img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .foto-mini-info {
      font-size: 9px;
      color: #334155;
      line-height: 1.25;
      overflow: hidden;
    }

    .foto-mini-meta {
      font-size: 8px;
      color: #64748b;
      margin-top: 2px;
    }

    /* Galeria Completa de Registro Fotográfico */
    .grid-fotos-oficial {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 10px;
      margin-top: 8px;
    }

    .foto-card-oficial {
      border: 1px solid #cbd5e1;
      border-radius: 4px;
      overflow: hidden;
      background: #ffffff;
      page-break-inside: avoid;
    }

    .foto-img-container {
      width: 100%;
      height: 180px;
      background: #f1f5f9;
      overflow: hidden;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .foto-img-container img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .foto-legenda-box {
      padding: 6px 8px;
      border-top: 1px solid #e2e8f0;
      background: #fafaf9;
    }

    .foto-titulo {
      font-size: 10px;
      font-weight: 700;
      color: #0f172a;
    }

    .foto-descricao-texto {
      font-size: 9.5px;
      color: #334155;
      margin: 2px 0 4px 0;
    }

    .foto-metadados-grid {
      border-top: 1px dashed #cbd5e1;
      padding-top: 3px;
      font-size: 8.5px;
      color: #64748b;
      line-height: 1.3;
    }

    /* Selo Digital de Autenticidade */
    .selo-autenticidade-bloco {
      margin-top: 14px;
      padding: 8px 10px;
      background: #f8fafc;
      border: 1.5px solid #064e3b;
      border-radius: 4px;
      font-size: 9px;
      page-break-inside: avoid;
    }

    .selo-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid #cbd5e1;
      padding-bottom: 4px;
      margin-bottom: 5px;
    }

    .selo-header strong {
      color: #064e3b;
      font-size: 9.5px;
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }

    .selo-codigo {
      font-family: monospace;
      font-weight: 800;
      color: #064e3b;
      background: #ecfdf5;
      border: 1px solid #a7f3d0;
      padding: 2px 6px;
      border-radius: 3px;
    }

    .selo-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 6px;
      font-family: monospace;
      color: #475569;
      font-size: 8.5px;
    }

    .selo-aviso {
      margin-top: 6px;
      font-size: 8px;
      color: #64748b;
      line-height: 1.25;
      border-top: 1px dashed #e2e8f0;
      padding-top: 4px;
    }

    /* Termo de Assinatura */
    .bloco-assinaturas {
      margin-top: 20px;
      padding-top: 10px;
      page-break-inside: avoid;
    }

    .assinaturas-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
      margin-top: 25px;
    }

    .assinatura-coluna {
      text-align: center;
    }

    .linha-assinatura {
      border-top: 1px solid #1e293b;
      margin-bottom: 4px;
    }

    .assinatura-nome {
      font-weight: 700;
      font-size: 10px;
      color: #0f172a;
    }

    .assinatura-cargo {
      font-size: 9px;
      color: #64748b;
    }

    .pagina-quebra {
      page-break-before: always;
    }

    .bloco-info-livre {
      padding: 6px 8px;
      font-size: 9.5px;
      color: #334155;
    }
  </style>
</head>
<body>

  <!-- ======================================================================= -->
  <!-- CABEÇALHO OFICIAL SEMA-MT -->
  <!-- ======================================================================= -->
  <div class="header-oficial">
    <div class="brasao-box">
      MT
    </div>
    <div class="header-titulos">
      <h1>Governo do Estado de Mato Grosso</h1>
      <h2>Secretaria de Estado de Meio Ambiente – SEMA-MT</h2>
      <h3>Superintendência de Recursos Hídricos • Coordenadoria de Segurança de Barragens (CSB)</h3>
    </div>
  </div>

  <!-- TÍTULO DA FICHA -->
  <div class="titulo-documento-box">
    <h2>Ficha Oficial de Vistoria de Segurança de Barragem</h2>
    <div class="num-ficha">${g.numeroVistoria ? `Vistoria Nº ${g.numeroVistoria}` : ''}${g.recordNumber ? ` • Processo: ${g.recordNumber}` : (!g.numeroVistoria ? 'Nº S/N - REGISTRO DE CAMPO' : '')}</div>
  </div>

  <!-- ======================================================================= -->
  <!-- SEÇÃO 1: DADOS GERAIS DA VISTORIA -->
  <!-- ======================================================================= -->
  <div class="secao-bloco">
    <h3 class="secao-titulo">1. DADOS GERAIS DA VISTORIA</h3>
    <table class="tabela-dados">
      <tr>
        <td class="label">Nº da Vistoria:</td>
        <td class="val"><strong>${g.numeroVistoria || 'S/N'}</strong></td>
        <td class="label">Nº do Processo SEMA:</td>
        <td class="val"><strong>${g.recordNumber || 'Não informado'}</strong></td>
      </tr>
      <tr>
        <td class="label">Data da Vistoria:</td>
        <td class="val"><strong>${dataVistoria}</strong></td>
        <td class="label">Horário de Início / Fim:</td>
        <td class="val">${g.startTime || '--:--'} às ${g.endTime || '--:--'}</td>
      </tr>
      <tr>
        <td class="label">Condições Climáticas:</td>
        <td class="val">${g.weather ? g.weather.replace(/_/g, ' ').toUpperCase() : 'Tempo Seco / Ensolarado'}</td>
        <td class="label">Emissão do Relatório:</td>
        <td class="val">${dataEmissao} (Horário de Brasília)</td>
      </tr>
      <tr>
        <td class="label">Equipe Fiscalizadora:</td>
        <td class="val" colspan="3">
          ${equipeFiscal.map(e => `<strong>${e.name}</strong> (${e.role || 'ANALISTA DE MEIO AMBIENTE'} - Matrícula: ${e.registrationNumber || 'N/I'})`).join('; ')}
        </td>
      </tr>
    </table>
  </div>

  <!-- ======================================================================= -->
  <!-- SEÇÃO 2: IDENTIFICAÇÃO DO BARRAMENTO E EMPREENDEDOR -->
  <!-- ======================================================================= -->
  <div class="secao-bloco">
    <h3 class="secao-titulo">2. IDENTIFICAÇÃO DO BARRAMENTO E EMPREENDIMENTO</h3>
    <table class="tabela-dados">
      <tr>
        <td class="label">Nome da Barragem:</td>
        <td class="val"><strong>${d.damName || 'Não informada'}</strong></td>
        <td class="label">Propriedade / Fazenda:</td>
        <td class="val">${d.propertyOrBusinessName || 'Não informada'}</td>
      </tr>
      <tr>
        <td class="label">Município / UF:</td>
        <td class="val"><strong>${d.municipality || 'Município de MT'} – MT</strong></td>
        <td class="label">Bacia Hidrográfica:</td>
        <td class="val">${d.hydrographicBasin || 'Não informada'}</td>
      </tr>
      <tr>
        <td class="label">Curso Hídrico Barrado:</td>
        <td class="val">${d.waterCourse || 'Não informado'}</td>
        <td class="label">Coordenadas Geográficas:</td>
        <td class="val"><strong>${coordsStr}</strong></td>
      </tr>
      <tr>
        <td class="label">Precisão do GPS:</td>
        <td class="val">${d.coordinates.accuracyMeters ? `± ${d.coordinates.accuracyMeters.toFixed(1)} metros` : 'Conforme dispositivo'}</td>
        <td class="label">Altitude Registrada:</td>
        <td class="val">${d.coordinates.altitudeMeters ? `${d.coordinates.altitudeMeters.toFixed(1)} m` : 'Não informada'}</td>
      </tr>
    </table>
  </div>

  <!-- ======================================================================= -->
  <!-- SEÇÃO 3: USOS DA BARRAGEM E REGULARIZAÇÃO -->
  <!-- ======================================================================= -->
  <div class="secao-bloco">
    <h3 class="secao-titulo">3. USOS DO BARRAMENTO E SITUAÇÃO REGULATÓRIA</h3>
    <table class="tabela-dados">
      <tr>
        <td class="label">Uso Principal:</td>
        <td class="val"><strong>${d.mainWaterUse || 'Acumulação de água / Irrigação / Dessedentação'}</strong></td>
        <td class="label">Usos Secundários:</td>
        <td class="val">${(d.secondaryWaterUses && d.secondaryWaterUses.length > 0) ? d.secondaryWaterUses.join(', ') : 'Sem usos secundários'}</td>
      </tr>
      <tr>
        <td class="label">Outorga de Uso da Água:</td>
        <td class="val">${d.regulatoryStatus.hasWaterPermit ? d.regulatoryStatus.hasWaterPermit.toUpperCase() : 'NÃO INFORMADO'} ${d.regulatoryStatus.permitNumber ? `(Nº ${d.regulatoryStatus.permitNumber})` : ''}</td>
        <td class="label">Licença Ambiental:</td>
        <td class="val">${d.regulatoryStatus.hasEnvironmentalLicense ? d.regulatoryStatus.hasEnvironmentalLicense.toUpperCase() : 'NÃO INFORMADO'} ${d.regulatoryStatus.licenseNumber ? `(Nº ${d.regulatoryStatus.licenseNumber})` : ''}</td>
      </tr>
      <tr>
        <td class="label">Cadastro Ambiental Rural (CAR):</td>
        <td class="val" colspan="3">${d.regulatoryStatus.carNumber || 'Não informado no ato da vistoria'}</td>
      </tr>
    </table>
  </div>

  <!-- ======================================================================= -->
  <!-- SEÇÃO 4: CARACTERÍSTICAS TÉCNICAS E GEOMÉTRICAS -->
  <!-- ======================================================================= -->
  <div class="secao-bloco">
    <h3 class="secao-titulo">4. CARACTERÍSTICAS TÉCNICAS E GEOMÉTRICAS DA ESTRUTURA</h3>
    <table class="tabela-dados">
      <tr>
        <td class="label">Tipologia Construtiva:</td>
        <td class="val"><strong>${d.damType ? d.damType.replace(/_/g, ' ').toUpperCase() : 'BARRAGEM DE TERRA'}</strong></td>
        <td class="label">Altura do Maciço (m):</td>
        <td class="val">${dim.heightMeters ? `≅ ${dim.heightMeters} m` : 'Não informada'}</td>
      </tr>
      <tr>
        <td class="label">Comprimento da Crista (m):</td>
        <td class="val">${dim.crestLengthMeters ? `≅ ${dim.crestLengthMeters} m` : 'Não informado'}</td>
        <td class="label">Largura da Crista (m):</td>
        <td class="val">${dim.crestWidthMeters ? `≅ ${dim.crestWidthMeters} m` : 'Não informada'}</td>
      </tr>
      <tr>
        <td class="label">Volume Estimado (m³):</td>
        <td class="val">${dim.reservoirVolumeM3 ? `≅ ${dim.reservoirVolumeM3} m³` : 'Não informado'}</td>
        <td class="label">Área Inundada (ha):</td>
        <td class="val">${dim.reservoirAreaHectares ? `≅ ${dim.reservoirAreaHectares} ha` : 'Não informada'}</td>
      </tr>
      <tr>
        <td class="label">Borda Livre Estimada:</td>
        <td class="val">${dim.freeboardMeters ? `≅ ${dim.freeboardMeters} m` : 'Não informada'}</td>
        <td class="label">Tipo de Vertedouro:</td>
        <td class="val"><strong>${d.spillwayType ? d.spillwayType.replace(/_/g, ' ').toUpperCase() : 'SOLEIRA LIVRE'}</strong></td>
      </tr>
    </table>
  </div>

  <!-- ======================================================================= -->
  <!-- SEÇÃO 5: COMPONENTES DA BARRAGEM (SUBTÓPICOS 5.1 A 5.7) -->
  <!-- ======================================================================= -->
  <div class="secao-bloco">
    <div class="topico-componentes-header">
      5. COMPONENTES DA BARRAGEM (AVALIAÇÃO ESTRUTURAL E DE ANOMALIAS)
    </div>
    <p class="secao-descricao">
      Avaliação individualizada dos componentes físicos. Anomalias marcadas com "SIM" contêm a classificação de Nível de Perigo e Magnitude de acordo com o padrão de fiscalização da CSB/SEMA-MT.
    </p>

    ${componentesHtml}
  </div>

  <!-- ======================================================================= -->
  <!-- SEÇÃO 6: OUTROS PROBLEMAS E ACOMPANHANTES -->
  <!-- ======================================================================= -->
  <div class="secao-bloco">
    <h3 class="secao-titulo">6. OUTROS PROBLEMAS E ACOMPANHAMENTO DA VISTORIA</h3>
    <table class="tabela-dados">
      <tr>
        <td class="label">Acompanhado por:</td>
        <td class="val" colspan="3">
          ${g.accompaniedBy.hasAccompaniment 
            ? `<strong>${g.accompaniedBy.name || 'Representante identificado'}</strong> (Doc: ${g.accompaniedBy.document || 'N/I'}, Vínculo: ${g.accompaniedBy.relationship || 'Preposto'}, Tel: ${g.accompaniedBy.phone || 'N/I'})`
            : 'Vistoria realizada sem acompanhamento presencial do proprietário ou preposto.'}
        </td>
      </tr>
      ${data.conclusions.generalFindings ? `
        <tr>
          <td class="label">Observações Gerais:</td>
          <td class="val" colspan="3">${data.conclusions.generalFindings}</td>
        </tr>
      ` : ''}
    </table>
  </div>

  <!-- ======================================================================= -->
  <!-- SEÇÃO 7: REGISTRO FOTOGRÁFICO ORGANIZADO -->
  <!-- ======================================================================= -->
  ${registroFotograficoHtml}

  <!-- ======================================================================= -->
  <!-- SEÇÃO 8: SELO DIGITAL DE AUTENTICIDADE E ANTI-PLÁGIO -->
  <!-- ======================================================================= -->
  <div class="selo-autenticidade-bloco">
    <div class="selo-header">
      <strong>🛡️ Selo Digital de Autenticidade e Rastreabilidade (CSB / SEMA-MT)</strong>
      <span class="selo-codigo">${seal.verificationCode}</span>
    </div>
    <div class="selo-grid">
      <div><strong>HASH SHA-256:</strong> ${seal.sha256Hash}</div>
      <div><strong>CHAVE RASTREIO:</strong> ${seal.rastreabilidadeId}</div>
      <div><strong>EMISSÃO DIGITAL:</strong> ${seal.timestampFormatted}</div>
      <div><strong>ÓRGÃO EMISSOR:</strong> SEMA-MT / CSB (Fé Pública)</div>
    </div>
    <div class="selo-aviso">
      ${seal.avisoLegal}
    </div>
  </div>

  <!-- ======================================================================= -->
  <!-- SEÇÃO 9: ENCERRAMENTO E ASSINATURAS -->
  <!-- ======================================================================= -->
  <div class="bloco-assinaturas">
    <div class="assinaturas-grid">
      <div class="assinatura-coluna">
        <div class="linha-assinatura"></div>
        <div class="assinatura-nome">${equipeFiscal[0]?.name || 'ANALISTA AMBIENTAL'}</div>
        <div class="assinatura-cargo">${equipeFiscal[0]?.role || 'Servidor Fiscalizador'} - CSB/SEMA-MT</div>
        <div class="assinatura-cargo">Matrícula: ${equipeFiscal[0]?.registrationNumber || 'N/I'}</div>
      </div>

      <div class="assinatura-coluna">
        <div class="linha-assinatura"></div>
        <div class="assinatura-nome">
          ${g.accompaniedBy.hasAccompaniment ? (g.accompaniedBy.name || 'ACOMPANHANTE / PREPOSTO') : 'EMPREENDEDOR / PROPRIETÁRIO'}
        </div>
        <div class="assinatura-cargo">
          ${g.accompaniedBy.hasAccompaniment ? `Vínculo: ${g.accompaniedBy.relationship || 'Representante Legal'}` : 'Responsável pelo Imóvel / Barramento'}
        </div>
        <div class="assinatura-cargo">CPF / Documento: ${g.accompaniedBy.document || '____________________'}</div>
      </div>
    </div>
  </div>

</body>
</html>`;
}

/**
 * Função principal de exportação: gera o PDF estilizado acionando
 * o motor de renderização e impressão nativa do navegador via iframe isolado,
 * garantindo compatibilidade total com computadores, celulares e tablets,
 * sem recarregar a tela e sem usar window.open.
 */
export function exportInspectionSheetPdf(data: InspectionData): void {
  const htmlContent = generateInspectionSheetHtml(data);
  const damNameClean = (data.damIdentification.damName || 'BARRAGEM')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .toUpperCase();
  const dateClean = (data.generalInfo.inspectionDate || new Date().toISOString().split('T')[0])
    .replace(/-/g, '');
  const fileName = `FICHA_VISTORIA_SEMA_MT_${damNameClean}_${dateClean}.pdf`;

  // Cria um iframe oculto no documento para renderizar a impressão
  const existingFrame = document.getElementById('sema-pdf-export-frame');
  if (existingFrame) {
    existingFrame.remove();
  }

  const iframe = document.createElement('iframe');
  iframe.id = 'sema-pdf-export-frame';
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  iframe.style.visibility = 'hidden';

  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document || iframe.contentDocument;
  if (!doc) {
    console.error('Não foi possível inicializar o documento do iframe para exportação de PDF.');
    // Fallback: imprime a página diretamente se necessário
    window.print();
    return;
  }

  doc.open();
  doc.write(htmlContent);
  doc.close();

  // Altera o título da página do iframe para que o arquivo PDF sugerido no diálogo de salvar seja o nome oficial
  if (iframe.contentWindow) {
    iframe.contentWindow.document.title = fileName;
  }

  // Aguarda o carregamento das imagens antes de acionar a impressão
  const triggerPrint = () => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } catch (err) {
      console.warn('Erro ao disparar impressão via iframe, acionando fallback:', err);
      window.print();
    } finally {
      // Remove o iframe após o diálogo ser fechado
      setTimeout(() => {
        try {
          iframe.remove();
        } catch {
          // ignora
        }
      }, 5000);
    }
  };

  // Se o iframe tiver imagens, espera carregar
  const images = doc.images;
  if (images.length > 0) {
    let loadedCount = 0;
    const totalImages = images.length;
    const onImgLoad = () => {
      loadedCount++;
      if (loadedCount >= totalImages) {
        setTimeout(triggerPrint, 350);
      }
    };

    for (let i = 0; i < totalImages; i++) {
      if (images[i].complete) {
        loadedCount++;
      } else {
        images[i].addEventListener('load', onImgLoad);
        images[i].addEventListener('error', onImgLoad);
      }
    }

    if (loadedCount >= totalImages) {
      setTimeout(triggerPrint, 350);
    }
  } else {
    setTimeout(triggerPrint, 350);
  }
}
