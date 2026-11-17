import {
  BarragemEntity,
  EmpreendedorEntity,
  ResponsavelTecnicoEntity
} from '../types/inspection';
import { searchEcosystemEntrepreneursAndDams } from './administraEcosystemService';

export interface SemaCarImovelResult {
  codImovel: string;
  statusImovel: string;
  statusLabel: string;
  condicao: string;
  municipio: string;
  codMunicipioIbge: number | null;
  uf: string;
  areaHectares: number | null;
  modulosFiscais: number | null;
  tipoImovel: string;
  tipoImovelLabel: string;
  dataCriacao: string | null;
  dataAtualizacao: string | null;
  consultaPublicaUrl: string;
}

export interface CoordinateCarLookupResponse {
  latitudeDecimal: number;
  longitudeDecimal: number;
  imoveisCar: SemaCarImovelResult[];
  matchedEmpreendedores: EmpreendedorEntity[];
  matchedBarragens: BarragemEntity[];
  matchedResponsaveisTecnicos: ResponsavelTecnicoEntity[];
  sourceError?: string;
}

const SICAR_MT_WFS_ENDPOINT = 'https://geoserver.car.gov.br/geoserver/sicar/wfs';
const SIMCAR_PUBLIC_URL = 'https://monitoramento.sema.mt.gov.br/simcar/tecnico.app/publico/car';
const CAR_PROPERTY_NAMES =
  'cod_imovel,status_imovel,dat_criacao,data_atualizacao,area,condicao,uf,municipio,cod_municipio_ibge,m_fiscal,tipo_imovel';

function mapStatusLabel(status?: string): string {
  switch ((status || '').toUpperCase()) {
    case 'AT':
      return 'Ativo';
    case 'PE':
      return 'Pendente';
    case 'SU':
      return 'Suspenso';
    case 'CA':
      return 'Cancelado';
    default:
      return status || 'Não informado';
  }
}

function mapTipoImovelLabel(tipo?: string): string {
  switch ((tipo || '').toUpperCase()) {
    case 'IRU':
      return 'Imóvel Rural (IRU)';
    case 'AST':
      return 'Assentamento (AST)';
    case 'PCT':
      return 'Povos e Comunidades Tradicionais (PCT)';
    default:
      return tipo || 'Imóvel Rural';
  }
}

function mapWfsFeatureToCarResult(feature: any): SemaCarImovelResult | null {
  const props = feature?.properties;
  if (!props || !props.cod_imovel) return null;
  return {
    codImovel: String(props.cod_imovel).trim(),
    statusImovel: String(props.status_imovel || ''),
    statusLabel: mapStatusLabel(props.status_imovel),
    condicao: String(props.condicao || 'Sem condição informada'),
    municipio: String(props.municipio || ''),
    codMunicipioIbge: props.cod_municipio_ibge ? Number(props.cod_municipio_ibge) : null,
    uf: String(props.uf || 'MT'),
    areaHectares:
      props.area !== null && props.area !== undefined && !isNaN(Number(props.area))
        ? Number(props.area)
        : null,
    modulosFiscais:
      props.m_fiscal !== null && props.m_fiscal !== undefined && !isNaN(Number(props.m_fiscal))
        ? Number(props.m_fiscal)
        : null,
    tipoImovel: String(props.tipo_imovel || 'IRU'),
    tipoImovelLabel: mapTipoImovelLabel(props.tipo_imovel),
    dataCriacao: props.dat_criacao ? String(props.dat_criacao) : null,
    dataAtualizacao: props.data_atualizacao ? String(props.data_atualizacao) : null,
    consultaPublicaUrl: SIMCAR_PUBLIC_URL
  };
}

async function fetchWfsFeatures(cqlFilter: string, maxFeatures = 10): Promise<SemaCarImovelResult[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 14000);
  try {
    const url =
      `${SICAR_MT_WFS_ENDPOINT}?service=WFS&version=1.0.0&request=GetFeature` +
      `&typeName=sicar:sicar_imoveis_mt&outputFormat=application/json` +
      `&maxFeatures=${maxFeatures}` +
      `&propertyName=${CAR_PROPERTY_NAMES}` +
      `&cql_filter=${encodeURIComponent(cqlFilter)}`;

    const res = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const json = await res.json();
    const features = Array.isArray(json?.features) ? json.features : [];
    return features
      .map(mapWfsFeatureToCarResult)
      .filter((item: SemaCarImovelResult | null): item is SemaCarImovelResult => item !== null);
  } finally {
    clearTimeout(timer);
  }
}

export async function lookupCarMtByCode(carCode: string): Promise<SemaCarImovelResult[]> {
  const clean = (carCode || '').trim().toUpperCase().replace(/[^A-Z0-9-]/g, '');
  if (clean.length < 6) return [];
  try {
    return await fetchWfsFeatures(`cod_imovel ILIKE '%${clean}%'`, 10);
  } catch {
    return [];
  }
}

export async function lookupCarAndEcosystemByCoordinates(
  latDecimal: number,
  lngDecimal: number
): Promise<CoordinateCarLookupResponse> {
  if (
    typeof navigator !== 'undefined' &&
    navigator.onLine === false
  ) {
    return {
      latitudeDecimal: latDecimal,
      longitudeDecimal: lngDecimal,
      imoveisCar: [],
      matchedEmpreendedores: [],
      matchedBarragens: [],
      matchedResponsaveisTecnicos: [],
      sourceError: 'Sem conexão com a internet para consultar a base pública da SEMA/MT.'
    };
  }

  let imoveisCar: SemaCarImovelResult[] = [];
  let sourceError: string | undefined;

  try {
    imoveisCar = await fetchWfsFeatures(
      `INTERSECTS(geo_area_imovel,POINT(${lngDecimal} ${latDecimal}))`,
      10
    );
    if (imoveisCar.length === 0) {
      imoveisCar = await fetchWfsFeatures(
        `DWITHIN(geo_area_imovel,POINT(${lngDecimal} ${latDecimal}),0.0005,degrees)`,
        10
      );
    }
  } catch (err: any) {
    sourceError =
      err?.name === 'AbortError'
        ? 'Tempo esgotado ao consultar a base pública espacial do CAR/MT.'
        : 'Base pública espacial do CAR/MT temporariamente indisponível.';
  }

  // Ordena imóveis ativos primeiro
  imoveisCar.sort((a, b) => {
    const priority = (s: string) => (s === 'AT' ? 0 : s === 'PE' ? 1 : s === 'SU' ? 2 : 3);
    return priority(a.statusImovel) - priority(b.statusImovel);
  });

  const empMap = new Map<string, EmpreendedorEntity>();
  const barMap = new Map<string, BarragemEntity>();
  const rtMap = new Map<string, ResponsavelTecnicoEntity>();

  // Busca dados já cadastrados na base institucional pelo código CAR encontrado
  for (const imovel of imoveisCar) {
    try {
      const eco = await searchEcosystemEntrepreneursAndDams(imovel.codImovel);
      eco.empreendedores.forEach(e => empMap.set(e.id, e));
      eco.barragens.forEach(b => barMap.set(b.id, b));
      eco.responsaveisTecnicos.forEach(r => rtMap.set(r.id, r));
    } catch {}
  }

  // Busca também barragens cadastradas próximas às coordenadas informadas (~1,5 km)
  try {
    const allEco = await searchEcosystemEntrepreneursAndDams('');
    allEco.barragens.forEach(bar => {
      const bLat = bar.coordenadas?.latitude;
      const bLng = bar.coordenadas?.longitude;
      if (bLat !== null && bLat !== undefined && bLng !== null && bLng !== undefined) {
        const dist = Math.hypot(bLat - latDecimal, bLng - lngDecimal);
        if (dist <= 0.015) {
          barMap.set(bar.id, bar);
          const owner = allEco.empreendedores.find(e => e.id === bar.empreendedorId);
          if (owner) empMap.set(owner.id, owner);
        }
      }
    });
    allEco.responsaveisTecnicos.forEach(rt => {
      if (
        (rt.barragemId && barMap.has(rt.barragemId)) ||
        (rt.empreendedorId && empMap.has(rt.empreendedorId))
      ) {
        rtMap.set(rt.id, rt);
      }
    });
  } catch {}

  return {
    latitudeDecimal: latDecimal,
    longitudeDecimal: lngDecimal,
    imoveisCar,
    matchedEmpreendedores: Array.from(empMap.values()),
    matchedBarragens: Array.from(barMap.values()),
    matchedResponsaveisTecnicos: Array.from(rtMap.values()),
    sourceError
  };
}
