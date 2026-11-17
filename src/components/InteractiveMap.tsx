// ==============================================================================
// ARQUIVO: src/components/InteractiveMap.tsx
// Mapa Geoespacial Interativo do Estado de Mato Grosso (CSB / SEMA-MT)
// Visual Fiel à Interface Oficial de Monitoramento (Conforme image.png)
// Integrado ao Supabase (Tabela 'notificacoes' em Tempo Real) e Planilhas
// ==============================================================================

import React, { useEffect, useRef, useState, useMemo } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { 
  MapPin, 
  Maximize2, 
  Minimize2, 
  Calendar, 
  ChevronDown, 
  X,
  Layers,
  RefreshCw
} from 'lucide-react';
import { 
  NotificationItem, 
  SnisbItem, 
  AneelItem, 
  GeoJsonMunicipalityCollection,
  fetchNotifications, 
  fetchSnisbDams, 
  fetchAneelDams, 
  fetchMatoGrossoGeoJson,
  parseCoordinate as parseMapCoordinate
} from '../services/mapDataService';
import { 
  fetchNovasNotificacoes, 
  rowToNotificacaoPontoMapa,
  NotificacaoPontoMapa 
} from '../services/notificacoesService';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { InspectionData } from '../types/inspection';
import { decimalToGms } from '../utils/geoCoordinates';

interface InteractiveMapProps {
  inspections?: InspectionData[];
  onSelectInspection?: (id: string) => void;
  className?: string;
}

const MT_CENTER: [number, number] = [-12.90, -56.00];
const MT_INITIAL_ZOOM = 6;

function escapeHtml(val: unknown): string {
  return String(val ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function sanitizeHexColor(val: string | undefined, fallback = '#8B5CF6'): string {
  return val && /^#[0-9A-Fa-f]{3,8}$/.test(val.trim()) ? val.trim() : fallback;
}

function formatLiveGms(lat: number, lng: number): string {
  const gmsLat = decimalToGms(lat, true);
  const gmsLng = decimalToGms(lng, false);
  if (!gmsLat || !gmsLng) return '';

  const sLat = gmsLat.segundos.toFixed(2).replace('.', ',').padStart(5, '0');
  const sLng = gmsLng.segundos.toFixed(2).replace('.', ',').padStart(5, '0');

  const latStr = `${String(gmsLat.graus).padStart(2, '0')}° ${String(gmsLat.minutos).padStart(2, '0')}' ${sLat}" S`;
  const lngStr = `${String(gmsLng.graus).padStart(2, '0')}° ${String(gmsLng.minutos).padStart(2, '0')}' ${sLng}" W`;
  return `${latStr} | ${lngStr}`;
}

export const InteractiveMap: React.FC<InteractiveMapProps> = ({
  inspections = [],
  onSelectInspection,
  className = ''
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);

  // Layer groups refs
  const baseSatelliteRef = useRef<L.TileLayer | null>(null);
  const baseOsmRef = useRef<L.TileLayer | null>(null);
  const geoJsonLayerRef = useRef<L.GeoJSON | null>(null);
  const notificationsLayerRef = useRef<L.LayerGroup | null>(null);
  const snisbLayerRef = useRef<L.LayerGroup | null>(null);
  const aneelLayerRef = useRef<L.LayerGroup | null>(null);
  const fiscalizadasLayerRef = useRef<L.LayerGroup | null>(null);
  const searchMarkerRef = useRef<L.Marker | null>(null);

  // Estados de dados
  const [loading, setLoading] = useState<boolean>(true);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [novasNotificacoes, setNovasNotificacoes] = useState<NotificacaoPontoMapa[]>([]);
  const [snisbDams, setSnisbDams] = useState<SnisbItem[]>([]);
  const [aneelDams, setAneelDams] = useState<AneelItem[]>([]);
  const [geoJsonData, setGeoJsonData] = useState<GeoJsonMunicipalityCollection | null>(null);

  // Estados de controles do topo (fiel à imagem)
  const [latInput, setLatInput] = useState<string>('');
  const [longInput, setLongInput] = useState<string>('');
  const [coordError, setCoordError] = useState<string | null>(null);

  // Checkboxes superiores da imagem: [x] NOVAS  [x] ANTIGAS  [ ] SNISB  [ ] ANEEL
  const [showNovas, setShowNovas] = useState<boolean>(true);
  const [showAntigas, setShowAntigas] = useState<boolean>(true);
  const [showSnisb, setShowSnisb] = useState<boolean>(false);
  const [showAneel, setShowAneel] = useState<boolean>(false);
  const showFiscalizadas = true;

  // Filtros inferiores da imagem: MÊS/ANO, MUNICÍPIOS, ATENDIDA (ANTIGAS) [SIM] [NÃO]
  const [selectedMesAno, setSelectedMesAno] = useState<string>('todos');
  const [isMesAnoOpen, setIsMesAnoOpen] = useState<boolean>(false);
  const [selectedMunicipality, setSelectedMunicipality] = useState<string>('todos');
  const [isMunDropdownOpen, setIsMunDropdownOpen] = useState<boolean>(false);
  const [munSearchTerm, setMunSearchTerm] = useState<string>('');

  // Atendida (Antigas) Toggle: SIM / NÃO (ambos podem estar ativos ou inativos)
  const [filtroAtendidaSim, setFiltroAtendidaSim] = useState<boolean>(true);
  const [filtroAtendidaNao, setFiltroAtendidaNao] = useState<boolean>(true);

  // Legenda flutuante interior do mapa (Checkboxes individuais)
  const [legendFilters, setLegendFilters] = useState({
    notifEmAberto: true,
    notifCumprida: true,
    notifAtrasada: true,
    notifArquivada: true,
    notifAntigaPendente: true,
    notifAntigaAtendida: true,
    cadastradasSnisb: true,
    cadastradasAneel: true,
    fiscalizadasSistema: true
  });

  // Base map & coord display
  const [baseMap, setBaseMap] = useState<'satellite' | 'osm'>('satellite');
  const [liveCoords, setLiveCoords] = useState<string>('');
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  // Carregamento de dados das planilhas e do Supabase
  const loadData = async () => {
    setLoading(true);
    try {
      const [notifs, snisb, aneel, geo, novas] = await Promise.all([
        fetchNotifications().catch(() => []),
        fetchSnisbDams().catch(() => []),
        fetchAneelDams().catch(() => []),
        fetchMatoGrossoGeoJson().catch(() => null),
        fetchNovasNotificacoes().catch(() => [])
      ]);
      setNotifications(notifs);
      setSnisbDams(snisb);
      setAneelDams(aneel);
      setGeoJsonData(geo);
      setNovasNotificacoes(novas);
    } catch (err) {
      console.error('[Map] Erro ao carregar dados:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Inscrição em tempo real (Realtime) no canal Supabase para tabela 'notificacoes'
  const [isRealtimeConnected, setIsRealtimeConnected] = useState<boolean>(false);
  const [realtimeToast, setRealtimeToast] = useState<string | null>(null);

  useEffect(() => {
    // 1. Carga inicial das novas notificações do Supabase
    fetchNovasNotificacoes().then((novas) => {
      if (novas && novas.length > 0) {
        setNovasNotificacoes(novas);
      }
    });

    const client = supabase;
    if (!isSupabaseConfigured || !client) return;

    // 2. Inscrição no canal Realtime (postgres_changes na tabela 'notificacoes')
    // Sempre que um analista inserir, editar ou deletar uma notificação, o mapa atualiza automaticamente sem recarregar
    const channel = client
      .channel('notificacoes-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notificacoes' },
        (payload: any) => {

          if (payload.eventType === 'INSERT' && payload.new) {
            const ponto = rowToNotificacaoPontoMapa(payload.new);
            if (ponto) {
              setNovasNotificacoes((prev) => [ponto, ...prev.filter((p) => p.id !== ponto.id)]);
              setRealtimeToast(`Nova notificação inserida: ${ponto.numNotificacao}`);
            } else {
              fetchNovasNotificacoes().then((novas) => setNovasNotificacoes(novas));
            }
          } else if (payload.eventType === 'UPDATE' && payload.new) {
            const ponto = rowToNotificacaoPontoMapa(payload.new);
            if (ponto) {
              setNovasNotificacoes((prev) =>
                prev.map((p) => (p.id === ponto.id ? ponto : p))
              );
              setRealtimeToast(`Notificação atualizada: ${ponto.numNotificacao}`);
            } else {
              fetchNovasNotificacoes().then((novas) => setNovasNotificacoes(novas));
            }
          } else if (payload.eventType === 'DELETE' && payload.old) {
            const deletedId = String(payload.old.id);
            setNovasNotificacoes((prev) => prev.filter((p) => p.id !== deletedId));
            setRealtimeToast('Notificação removida do banco');
          }

          // Reconciliação imediata com o banco Supabase
          fetchNovasNotificacoes().then((novas) => {
            if (novas && novas.length > 0) {
              setNovasNotificacoes(novas);
            }
          });
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setIsRealtimeConnected(true);
        } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setIsRealtimeConnected(false);
        }
      });

    // 3. Ouvinte de evento local para sincronização instantânea entre componentes/abas
    const handleLocalUpdate = () => {
      fetchNovasNotificacoes().then((novas) => {
        if (novas && novas.length > 0) setNovasNotificacoes(novas);
      });
    };
    window.addEventListener('csb:notificacao_changed', handleLocalUpdate);

    return () => {
      client.removeChannel(channel);
      window.removeEventListener('csb:notificacao_changed', handleLocalUpdate);
    };
  }, []);

  // Limpeza automática do aviso de evento Realtime após 5 segundos
  useEffect(() => {
    if (!realtimeToast) return;
    const timer = setTimeout(() => {
      setRealtimeToast(null);
    }, 5000);
    return () => clearTimeout(timer);
  }, [realtimeToast]);

  // Junção das Notificações do Supabase com notificações locais das vistorias em andamento
  const allNovasNotificacoes = useMemo(() => {
    const list: NotificacaoPontoMapa[] = [...novasNotificacoes];
    const existingIds = new Set(list.map((item) => item.id));

    inspections.forEach((insp) => {
      const concl = insp.conclusions;
      if (concl?.requiresNotification || (insp as any).conclusoes?.requerNotificacao) {
        const id = `insp-notif-${insp.id}`;
        if (!existingIds.has(id)) {
          const lat = parseMapCoordinate(insp.damIdentification.coordinates.latitude, true);
          const lng = parseMapCoordinate(insp.damIdentification.coordinates.longitude, false);
          if (lat && lng && lat >= -19 && lat <= -6 && lng >= -63 && lng <= -49) {
            list.push({
              id,
              numNotificacao: insp.generalInfo.recordNumber || `Notif. ${insp.id.slice(-6)}`,
              empreendedor: insp.damIdentification.propertyOrBusinessName || 'Empreendedor Notificado',
              cpfCnpj: '',
              municipio: insp.damIdentification.municipality || 'Mato Grosso',
              lat,
              long: lng,
              situacao: 'Em aberto',
              dataEmissao: insp.generalInfo.inspectionDate || new Date().toISOString().split('T')[0],
              prazo: concl?.notificationDetails?.prazoDias ? `${concl.notificationDetails.prazoDias} dias` : '30 dias',
              respostaFinal: concl?.notificationDetails?.objetivo || concl?.generalFindings || 'Notificação expedida pela equipe técnica',
              origem: 'Nova'
            });
          }
        }
      }
    });

    return list;
  }, [novasNotificacoes, inspections]);

  // Lista única de municípios para o dropdown
  const municipalityList = useMemo(() => {
    const set = new Set<string>();
    notifications.forEach(n => n.municipio && set.add(n.municipio.trim()));
    allNovasNotificacoes.forEach(n => n.municipio && set.add(n.municipio.trim()));
    snisbDams.forEach(s => s.municipio && set.add(s.municipio.trim()));
    aneelDams.forEach(a => a.municipio && set.add(a.municipio.trim()));
    inspections.forEach(i => i.damIdentification.municipality && set.add(i.damIdentification.municipality.trim()));
    if (geoJsonData) {
      geoJsonData.features.forEach(f => f.properties.name && set.add(f.properties.name.trim()));
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [notifications, allNovasNotificacoes, snisbDams, aneelDams, inspections, geoJsonData]);

  // Lista de Mês/Ano disponíveis
  const mesAnoList = useMemo(() => {
    const set = new Set<string>();
    notifications.forEach(n => {
      if (n.dataEmissaoDate) {
        const m = String(n.dataEmissaoDate.getMonth() + 1).padStart(2, '0');
        const y = n.dataEmissaoDate.getFullYear();
        set.add(`${m}/${y}`);
      } else if (n.anoPlanilha) {
        set.add(n.anoPlanilha);
      }
    });
    allNovasNotificacoes.forEach(n => {
      if (n.dataEmissao) {
        const parts = n.dataEmissao.split(/[-/]/);
        if (parts.length >= 2) {
          set.add(`${parts[1]}/${parts[0]}`);
        }
      }
    });
    return Array.from(set).sort().reverse();
  }, [notifications, allNovasNotificacoes]);

  // Municípios filtrados na pesquisa do dropdown
  const filteredMunicipalities = useMemo(() => {
    if (!munSearchTerm.trim()) return municipalityList;
    return municipalityList.filter(m => m.toLowerCase().includes(munSearchTerm.toLowerCase()));
  }, [municipalityList, munSearchTerm]);

  // Inicialização do Leaflet
  useEffect(() => {
    if (!mapContainerRef.current) return;
    if (mapInstanceRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: MT_CENTER,
      zoom: MT_INITIAL_ZOOM,
      zoomControl: false,
      attributionControl: true
    });

    L.control.zoom({ position: 'topleft' }).addTo(map);

    const satelliteLayer = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      {
        maxZoom: 19,
        attribution: 'Leaflet | Tiles © Esri'
      }
    );

    const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: 'Leaflet | © OpenStreetMap'
    });

    satelliteLayer.addTo(map);
    baseSatelliteRef.current = satelliteLayer;
    baseOsmRef.current = osmLayer;

    notificationsLayerRef.current = L.layerGroup().addTo(map);
    snisbLayerRef.current = L.layerGroup().addTo(map);
    aneelLayerRef.current = L.layerGroup().addTo(map);
    fiscalizadasLayerRef.current = L.layerGroup().addTo(map);

    map.on('mousemove', (e: L.LeafletMouseEvent) => {
      const gms = formatLiveGms(e.latlng.lat, e.latlng.lng);
      setLiveCoords(gms);
    });

    map.on('mouseout', () => {
      setLiveCoords('');
    });

    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Alternador Satélite / OSM
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !baseSatelliteRef.current || !baseOsmRef.current) return;

    if (baseMap === 'satellite') {
      if (map.hasLayer(baseOsmRef.current)) map.removeLayer(baseOsmRef.current);
      if (!map.hasLayer(baseSatelliteRef.current)) baseSatelliteRef.current.addTo(map);
    } else {
      if (map.hasLayer(baseSatelliteRef.current)) map.removeLayer(baseSatelliteRef.current);
      if (!map.hasLayer(baseOsmRef.current)) baseOsmRef.current.addTo(map);
    }
  }, [baseMap]);

  // GeoJSON dos Municípios (bordas brancas semitransparentes como na imagem)
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (geoJsonLayerRef.current) {
      map.removeLayer(geoJsonLayerRef.current);
      geoJsonLayerRef.current = null;
    }

    if (!geoJsonData) return;

    const layer = L.geoJSON(geoJsonData as any, {
      style: (feature) => {
        const munName = feature?.properties?.name || '';
        const isSelected = selectedMunicipality !== 'todos' && 
          munName.toLowerCase() === selectedMunicipality.toLowerCase();

        return {
          color: isSelected ? '#10B981' : 'rgba(255, 255, 255, 0.55)',
          weight: isSelected ? 2.5 : 1,
          fillColor: isSelected ? '#10B981' : '#ffffff',
          fillOpacity: isSelected ? 0.22 : 0.04
        };
      },
      onEachFeature: (feature, fLayer) => {
        const name = feature?.properties?.name || 'Município';
        fLayer.bindTooltip(escapeHtml(name), {
          sticky: true,
          direction: 'center',
          className: 'px-2 py-0.5 bg-slate-900/90 text-white text-xs font-semibold rounded shadow-md pointer-events-none'
        });

        fLayer.on({
          mouseover: (e) => {
            const target = e.target as L.Path;
            target.setStyle({ weight: 2, fillOpacity: 0.2, color: '#38BDF8' });
          },
          mouseout: (e) => {
            const munName = feature?.properties?.name || '';
            const isSelected = selectedMunicipality !== 'todos' && 
              munName.toLowerCase() === selectedMunicipality.toLowerCase();
            const target = e.target as L.Path;
            target.setStyle({
              color: isSelected ? '#10B981' : 'rgba(255, 255, 255, 0.55)',
              weight: isSelected ? 2.5 : 1,
              fillOpacity: isSelected ? 0.22 : 0.04
            });
          },
          click: () => {
            setSelectedMunicipality(name);
            if (fLayer instanceof L.Polygon) {
              map.fitBounds(fLayer.getBounds(), { maxZoom: 11, padding: [30, 30] });
            }
          }
        });
      }
    });

    layer.addTo(map);
    geoJsonLayerRef.current = layer;
  }, [geoJsonData, selectedMunicipality]);

  // Ícones customizados idênticos à imagem:
  // - roxa_aberto / roxa_cumprida: Notificações em aberto / cumpridas
  // - vermelha_atrasada: Notificação atrasada
  // - antiga_pendente: Triângulo amarelo/laranja
  // - antiga_atendida: Triângulo verde
  // - snisb: Ponto azul
  // - aneel: Ponto verde-esmeralda
  // - fiscalizada: Ponto ciano com anel
  const createCustomIcon = (type: 'roxa_aberto' | 'roxa_cumprida' | 'vermelha_atrasada' | 'cinza_arquivada' | 'antiga_pendente' | 'antiga_atendida' | 'snisb' | 'aneel' | 'fiscalizada' | 'nova_sistema') => {
    let html = '';
    let size: [number, number] = [20, 20];
    let anchor: [number, number] = [10, 10];

    switch (type) {
      case 'nova_sistema':
        html = `
          <div style="width:22px;height:22px;border-radius:50%;background:#F59E0B;border:2.5px solid #ffffff;box-shadow:0 2px 6px rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;color:#ffffff;font-size:12px;font-weight:900;font-family:sans-serif;">
            !
          </div>
        `;
        size = [22, 22];
        anchor = [11, 11];
        break;
      case 'roxa_aberto':
        html = `
          <div style="width:20px;height:20px;border-radius:50%;background:#7B3FE4;border:2px solid #ffffff;box-shadow:0 2px 4px rgba(0,0,0,0.35);display:flex;align-items:center;justify-content:center;color:#ffffff;font-size:11px;font-weight:900;font-family:sans-serif;">
            !
          </div>
        `;
        break;
      case 'roxa_cumprida':
        html = `
          <div style="width:20px;height:20px;border-radius:50%;background:#10B981;border:2px solid #ffffff;box-shadow:0 2px 4px rgba(0,0,0,0.35);display:flex;align-items:center;justify-content:center;color:#ffffff;font-size:11px;font-weight:900;">
            ✓
          </div>
        `;
        break;
      case 'vermelha_atrasada':
        html = `
          <div style="width:20px;height:20px;border-radius:50%;background:#EF4444;border:2px solid #ffffff;box-shadow:0 2px 4px rgba(0,0,0,0.35);display:flex;align-items:center;justify-content:center;color:#ffffff;font-size:11px;font-weight:900;font-family:sans-serif;">
            !
          </div>
        `;
        break;
      case 'cinza_arquivada':
        html = `
          <div style="width:18px;height:18px;border-radius:50%;background:#64748B;border:2px solid #ffffff;box-shadow:0 2px 4px rgba(0,0,0,0.35);display:flex;align-items:center;justify-content:center;color:#ffffff;font-size:10px;font-weight:900;">
            !
          </div>
        `;
        size = [18, 18];
        anchor = [9, 9];
        break;
      case 'antiga_pendente':
        html = `
          <div style="width:20px;height:20px;display:flex;align-items:center;justify-content:center;filter:drop-shadow(0 2px 3px rgba(0,0,0,0.4));">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="#F59E0B" stroke="#ffffff" stroke-width="1.8" stroke-linejoin="round">
              <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
              <line x1="12" y1="9" x2="12" y2="13" stroke="#000" stroke-width="2" />
              <circle cx="12" cy="17" r="1" fill="#000" />
            </svg>
          </div>
        `;
        break;
      case 'antiga_atendida':
        html = `
          <div style="width:20px;height:20px;display:flex;align-items:center;justify-content:center;filter:drop-shadow(0 2px 3px rgba(0,0,0,0.4));">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="#10B981" stroke="#ffffff" stroke-width="1.8" stroke-linejoin="round">
              <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
              <polyline points="9 13 11 15 15 10" stroke="#fff" stroke-width="2" fill="none" />
            </svg>
          </div>
        `;
        break;
      case 'snisb':
        html = `
          <div style="width:10px;height:10px;border-radius:50%;background:#1D4ED8;border:1.5px solid #ffffff;box-shadow:0 1px 3px rgba(0,0,0,0.4);"></div>
        `;
        size = [10, 10];
        anchor = [5, 5];
        break;
      case 'aneel':
        html = `
          <div style="width:10px;height:10px;border-radius:2px;background:#059669;border:1.5px solid #ffffff;box-shadow:0 1px 3px rgba(0,0,0,0.4);"></div>
        `;
        size = [10, 10];
        anchor = [5, 5];
        break;
      case 'fiscalizada':
        html = `
          <div style="width:16px;height:16px;border-radius:50%;background:#06B6D4;border:2px solid #ffffff;box-shadow:0 2px 4px rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;">
            <div style="width:6px;height:6px;border-radius:50%;background:#ffffff;"></div>
          </div>
        `;
        size = [16, 16];
        anchor = [8, 8];
        break;
    }

    return L.divIcon({
      className: 'custom-map-pin',
      html,
      iconSize: size,
      iconAnchor: anchor
    });
  };

  // Formata coordenadas especificamente para o card informativo fiel à imagem de monitoramento
  // Ex: "16°  28'  54,70"  S" e "54°  54'  44,08"  W"
  const formatGmsCard = (decimal: number | null | undefined, isLat: boolean): string => {
    if (decimal === null || decimal === undefined || isNaN(decimal)) return '-';
    const gms = decimalToGms(decimal, isLat);
    if (!gms) return '-';
    const g = String(gms.graus).padStart(2, '0');
    const m = String(gms.minutos).padStart(2, '0');
    const s = gms.segundos.toFixed(2).replace('.', ',').padStart(5, '0');
    const h = isLat ? 'S' : 'W';
    return `${g}°  ${m}'  ${s}"  ${h}`;
  };

  // Popup com design limpo e fiel à imagem anexa do sistema de monitoramento CSB/SEMA-MT
  const createCleanPopup = (options: {
    origem: string;
    origemCor?: string;
    identificador: string;
    empreendedor: string;
    propriedade?: string;
    data?: string;
    prazo?: string;
    municipio?: string;
    situacaoResposta?: string;
    lat: number;
    lng: number;
    actionId?: string;
  }): HTMLElement => {
    const latGms = escapeHtml(formatGmsCard(options.lat, true));
    const lngGms = escapeHtml(formatGmsCard(options.lng, false));
    const safeOrigemCor = sanitizeHexColor(options.origemCor);

    const div = document.createElement('div');
    div.className = 'sema-info-card';
    div.style.width = '330px';
    div.style.padding = '18px 20px';
    div.style.fontFamily = "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    div.style.color = '#0F172A';
    div.style.textAlign = 'left';
    div.style.boxSizing = 'border-box';

    div.innerHTML = `
      <!-- CABEÇALHO: LOCALIZAÇÃO (GMS) E BOTÃO FECHAR -->
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
        <span style="font-size:11px;font-weight:800;color:#64748B;text-transform:uppercase;letter-spacing:0.05em;">
          LOCALIZAÇÃO (GMS)
        </span>
        <button type="button" class="sema-popup-close-btn" style="background:none;border:none;font-size:16px;line-height:1;color:#94A3B8;cursor:pointer;padding:2px 4px;border-radius:6px;display:flex;align-items:center;justify-content:center;transition:color 0.15s;" title="Fechar">
          ✕
        </button>
      </div>

      <!-- BOXES DE LATITUDE E LONGITUDE (AZUL SUAVE) -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px;">
        <div style="background:#F0F9FF;border:1px solid #E0F2FE;border-radius:12px;padding:8px 10px;">
          <div style="font-size:9px;font-weight:800;color:#64748B;text-transform:uppercase;letter-spacing:0.04em;">
            LATITUDE
          </div>
          <div style="font-size:12px;font-weight:700;color:#0F172A;font-family:ui-monospace, monospace;margin-top:3px;white-space:nowrap;">
            ${latGms}
          </div>
        </div>
        <div style="background:#F0F9FF;border:1px solid #E0F2FE;border-radius:12px;padding:8px 10px;">
          <div style="font-size:9px;font-weight:800;color:#64748B;text-transform:uppercase;letter-spacing:0.04em;">
            LONGITUDE
          </div>
          <div style="font-size:12px;font-weight:700;color:#0F172A;font-family:ui-monospace, monospace;margin-top:3px;white-space:nowrap;">
            ${lngGms}
          </div>
        </div>
      </div>

      <!-- TAG DE CATEGORIA E NÚMERO IDENTIFICADOR -->
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:3px;">
        <span style="font-size:12px;font-weight:800;color:${safeOrigemCor};text-transform:uppercase;letter-spacing:0.02em;">
          ${escapeHtml(options.origem)}
        </span>
        <span style="font-size:11px;font-weight:700;color:#94A3B8;font-family:ui-monospace, monospace;">
          #${escapeHtml(options.identificador)}
        </span>
      </div>

      <!-- EMPREENDEDOR / NOME PRINCIPAL -->
      <div style="font-size:16px;font-weight:900;color:#0F172A;line-height:1.25;margin-bottom:2px;">
        ${escapeHtml(options.empreendedor || 'Não informado')}
      </div>

      <!-- PROPRIEDADE -->
      ${options.propriedade ? `
        <div style="font-size:11.5px;font-weight:700;color:#64748B;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:12px;">
          ${escapeHtml(options.propriedade)}
        </div>
      ` : '<div style="margin-bottom:10px;"></div>'}

      <!-- DATA E PRAZO (2 COLUNAS) -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px;">
        <div>
          <div style="font-size:10px;font-weight:800;color:#94A3B8;text-transform:uppercase;letter-spacing:0.03em;">
            DATA
          </div>
          <div style="font-size:12px;font-weight:700;color:#1E293B;margin-top:2px;">
            ${escapeHtml(options.data || '-')}
          </div>
        </div>
        <div>
          <div style="font-size:10px;font-weight:800;color:#94A3B8;text-transform:uppercase;letter-spacing:0.03em;">
            PRAZO
          </div>
          <div style="font-size:12px;font-weight:700;color:#1E293B;margin-top:2px;">
            ${escapeHtml(options.prazo || '-')}
          </div>
        </div>
      </div>

      <!-- MUNICÍPIO -->
      <div style="margin-bottom:10px;">
        <div style="font-size:10px;font-weight:800;color:#94A3B8;text-transform:uppercase;letter-spacing:0.03em;">
          MUNICÍPIO
        </div>
        <div style="font-size:12.5px;font-weight:700;color:#1E293B;margin-top:2px;">
          ${escapeHtml(options.municipio || 'Mato Grosso')}
        </div>
      </div>

      <!-- SITUAÇÃO / RESPOSTA -->
      <div>
        <div style="font-size:10px;font-weight:800;color:#94A3B8;text-transform:uppercase;letter-spacing:0.03em;">
          SITUAÇÃO/RESPOSTA
        </div>
        <div style="font-size:11.5px;font-style:italic;color:#334155;line-height:1.45;margin-top:3px;max-height:85px;overflow-y:auto;">
          ${escapeHtml(options.situacaoResposta || 'Sem observações adicionais.')}
        </div>
      </div>

      <!-- BOTÃO DE AÇÃO OPCIONAL (SE HOUVER FICHA VINCULADA) -->
      ${options.actionId ? `
        <button type="button" data-action-btn="1" style="width:100%;margin-top:12px;padding:8px 12px;background:#059669;color:#ffffff;border:none;border-radius:10px;font-size:11px;font-weight:800;cursor:pointer;transition:background 0.15s ease;">
          Abrir Ficha no Sistema
        </button>
      ` : ''}
    `;

    const closeBtn = div.querySelector('.sema-popup-close-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        mapInstanceRef.current?.closePopup();
      });
    }

    if (options.actionId && onSelectInspection) {
      const targetActionId = options.actionId;
      const actionBtn = div.querySelector('[data-action-btn="1"]');
      if (actionBtn) {
        actionBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          onSelectInspection(targetActionId);
        });
      }
    }

    return div;
  };

  // Renderização e Filtragem Unificada dos Marcadores (Supabase + Planilhas)
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    notificationsLayerRef.current?.clearLayers();
    snisbLayerRef.current?.clearLayers();
    aneelLayerRef.current?.clearLayers();
    fiscalizadasLayerRef.current?.clearLayers();

    const matchMun = (mun: string) => {
      if (selectedMunicipality === 'todos') return true;
      return mun.trim().toLowerCase() === selectedMunicipality.trim().toLowerCase();
    };

    const matchMesAnoSheet = (item: NotificationItem) => {
      if (selectedMesAno === 'todos') return true;
      if (item.dataEmissaoDate) {
        const m = String(item.dataEmissaoDate.getMonth() + 1).padStart(2, '0');
        const y = item.dataEmissaoDate.getFullYear();
        if (`${m}/${y}` === selectedMesAno) return true;
      }
      return item.anoPlanilha === selectedMesAno;
    };

    const popupOptions: L.PopupOptions = {
      className: 'sema-custom-popup',
      maxWidth: 360,
      minWidth: 320,
      autoPan: true,
      autoPanPadding: [25, 25],
      closeButton: false,
      offset: [0, -10]
    };

    // --------------------------------------------------------------------------
    // 1. NOTIFICAÇÕES NOVAS EM TEMPO REAL DO SUPABASE
    // Cores baseadas na situação:
    // - "Em aberto": Âmbar / Laranja (#F59E0B)
    // - "Cumprida" / "Atendida": Verde (#10B981) ou Roxo (#7B3FE4)
    // - "Atrasada": Vermelho (#EF4444)
    // --------------------------------------------------------------------------
    if (showNovas) {
      allNovasNotificacoes.forEach((item) => {
        if (!matchMun(item.municipio)) return;

        const sitLower = (item.situacao || '').toLowerCase();
        let iconType: 'roxa_aberto' | 'roxa_cumprida' | 'vermelha_atrasada' = 'roxa_aberto';

        if (sitLower.includes('cumprid') || sitLower.includes('atendid')) {
          if (!legendFilters.notifCumprida) return;
          iconType = 'roxa_cumprida';
        } else if (sitLower.includes('atrasad') || sitLower.includes('vencid')) {
          if (!legendFilters.notifAtrasada) return;
          iconType = 'vermelha_atrasada';
        } else {
          // Em aberto / pendente
          if (!legendFilters.notifEmAberto) return;
          iconType = 'roxa_aberto';
        }

        const marker = L.marker([item.lat, item.long], {
          icon: createCustomIcon(iconType)
        });

        const popup = createCleanPopup({
          origem: 'NOTIFICAÇÃO (NOVA)',
          origemCor: '#8B5CF6',
          identificador: item.numNotificacao.replace(/^Notif\.?\s*/i, ''),
          empreendedor: item.empreendedor,
          propriedade: (item as any).propriedade || '',
          data: item.dataEmissao,
          prazo: item.prazo,
          municipio: item.municipio,
          situacaoResposta: item.respostaFinal || item.situacao || 'Em aberto',
          lat: item.lat,
          lng: item.long
        });

        marker.bindPopup(popup, popupOptions);
        marker.on('mouseover', () => {
          marker.setZIndexOffset(1000);
          marker.openPopup();
        });
        marker.on('mouseout', () => {
          marker.setZIndexOffset(0);
        });
        marker.on('click', () => {
          marker.setZIndexOffset(1000);
          marker.openPopup();
        });
        notificationsLayerRef.current?.addLayer(marker);
      });
    }

    // --------------------------------------------------------------------------
    // 2. NOTIFICAÇÕES HISTÓRICAS DAS PLANILHAS (2023-2027)
    // --------------------------------------------------------------------------
    notifications.forEach((item) => {
      if (!matchMun(item.municipio)) return;
      if (!matchMesAnoSheet(item)) return;

      const isAntiga = item.anoPlanilha === '2023' || item.anoPlanilha === '2024';
      const isNova = !isAntiga;

      // Filtro de Topo: [x] NOVAS e [x] ANTIGAS
      if (isNova && !showNovas) return;
      if (isAntiga && !showAntigas) return;

      // Filtro de Atendida (Antigas) SIM/NÃO
      if (isAntiga) {
        if (item.atendidoStatus === 'SIM' && !filtroAtendidaSim) return;
        if (item.atendidoStatus !== 'SIM' && !filtroAtendidaNao) return;
      }

      let iconType: 'roxa_aberto' | 'roxa_cumprida' | 'vermelha_atrasada' | 'cinza_arquivada' | 'antiga_pendente' | 'antiga_atendida' = 'roxa_aberto';

      if (isNova) {
        if (item.status === 'pendente') {
          if (!legendFilters.notifEmAberto) return;
          iconType = 'roxa_aberto';
        } else if (item.status === 'cumprida') {
          if (!legendFilters.notifCumprida) return;
          iconType = 'roxa_cumprida';
        } else if (item.status === 'atrasada') {
          if (!legendFilters.notifAtrasada) return;
          iconType = 'vermelha_atrasada';
        } else if (item.status === 'arquivada') {
          if (!legendFilters.notifArquivada) return;
          iconType = 'cinza_arquivada';
        }
      } else {
        // Antiga
        if (item.atendidoStatus === 'SIM') {
          if (!legendFilters.notifAntigaAtendida) return;
          iconType = 'antiga_atendida';
        } else {
          if (!legendFilters.notifAntigaPendente) return;
          iconType = 'antiga_pendente';
        }
      }

      const marker = L.marker([item.lat, item.lng], {
        icon: createCustomIcon(iconType)
      });

      const popup = createCleanPopup({
        origem: isAntiga ? 'NOTIFICAÇÃO (ANTIGA)' : 'NOTIFICAÇÃO (HISTÓRICO)',
        origemCor: isAntiga ? (item.atendidoStatus === 'SIM' ? '#10B981' : '#F59E0B') : '#8B5CF6',
        identificador: item.numero || 'S/N',
        empreendedor: item.empreendedor || 'Não informado',
        propriedade: item.propriedade || '',
        data: item.dataEmissao || item.anoPlanilha || '',
        prazo: item.prazoDias ? String(item.prazoDias) : (item.atendidoStatus === 'SIM' ? 'Atendida' : 'Pendente'),
        municipio: item.municipio || '',
        situacaoResposta: item.resposta || item.obs || (item.atendidoStatus === 'SIM' ? 'Notificação atendida pelo empreendedor.' : 'Notificação em aberto aguardando atendimento.'),
        lat: item.lat,
        lng: item.lng
      });

      marker.bindPopup(popup, popupOptions);
      marker.on('mouseover', () => {
        marker.setZIndexOffset(1000);
        marker.openPopup();
      });
      marker.on('mouseout', () => {
        marker.setZIndexOffset(0);
      });
      marker.on('click', () => {
        marker.setZIndexOffset(1000);
        marker.openPopup();
      });
      notificationsLayerRef.current?.addLayer(marker);
    });

    // --------------------------------------------------------------------------
    // 3. BARRAGENS SNISB (ANA)
    // --------------------------------------------------------------------------
    if (showSnisb && legendFilters.cadastradasSnisb) {
      snisbDams.forEach((item) => {
        if (!matchMun(item.municipio)) return;

        const marker = L.marker([item.lat, item.lng], {
          icon: createCustomIcon('snisb')
        });

        const popup = createCleanPopup({
          origem: 'BARRAGEM SNISB',
          origemCor: '#1D4ED8',
          identificador: item.codigoSnisb,
          empreendedor: item.empreendedor,
          propriedade: item.nome,
          data: item.codEntidadeFiscal || 'SNISB',
          prazo: item.dpa ? `DPA: ${item.dpa}` : 'Não Classificado',
          municipio: item.municipio,
          situacaoResposta: item.usoPrincipal ? `Uso Principal: ${item.usoPrincipal}` : 'Cadastrada no Sistema Nacional de Informações sobre Segurança de Barragens (SNISB/ANA)',
          lat: item.lat,
          lng: item.lng
        });

        marker.bindPopup(popup, popupOptions);
        marker.on('mouseover', () => {
          marker.setZIndexOffset(1000);
          marker.openPopup();
        });
        marker.on('mouseout', () => {
          marker.setZIndexOffset(0);
        });
        marker.on('click', () => {
          marker.setZIndexOffset(1000);
          marker.openPopup();
        });
        snisbLayerRef.current?.addLayer(marker);
      });
    }

    // --------------------------------------------------------------------------
    // 4. BARRAGENS ANEEL
    // --------------------------------------------------------------------------
    if (showAneel && legendFilters.cadastradasAneel) {
      aneelDams.forEach((item) => {
        if (!matchMun(item.municipio)) return;

        const marker = L.marker([item.lat, item.lng], {
          icon: createCustomIcon('aneel')
        });

        const popup = createCleanPopup({
          origem: 'BARRAGEM ANEEL',
          origemCor: '#059669',
          identificador: item.codigoSnisb,
          empreendedor: item.empreendedor,
          propriedade: item.nome,
          data: 'ANEEL',
          prazo: item.dpa ? `DPA: ${item.dpa}` : 'UHE / PCH / CGH',
          municipio: item.municipio,
          situacaoResposta: item.usoPrincipal ? `Uso Energético: ${item.usoPrincipal}` : 'Barragem regulada pela Agência Nacional de Energia Elétrica (ANEEL)',
          lat: item.lat,
          lng: item.lng
        });

        marker.bindPopup(popup, popupOptions);
        marker.on('mouseover', () => {
          marker.setZIndexOffset(1000);
          marker.openPopup();
        });
        marker.on('mouseout', () => {
          marker.setZIndexOffset(0);
        });
        marker.on('click', () => {
          marker.setZIndexOffset(1000);
          marker.openPopup();
        });
        aneelLayerRef.current?.addLayer(marker);
      });
    }

    // --------------------------------------------------------------------------
    // 5. FISCALIZADAS NO SISTEMA
    // --------------------------------------------------------------------------
    if (showFiscalizadas && legendFilters.fiscalizadasSistema) {
      inspections.forEach((insp) => {
        const d = insp.damIdentification;
        const g = insp.generalInfo;
        const mun = d.municipality || 'Mato Grosso';
        if (!matchMun(mun)) return;

        const lat = parseMapCoordinate(d.coordinates.latitude, true);
        const lng = parseMapCoordinate(d.coordinates.longitude, false);
        if (!lat || !lng || lat > -6 || lat < -19 || lng > -49 || lng < -63) return;

        const marker = L.marker([lat, lng], {
          icon: createCustomIcon('fiscalizada')
        });

        const popup = createCleanPopup({
          origem: 'FISCALIZADA CSB',
          origemCor: '#06B6D4',
          identificador: g.recordNumber || insp.id.slice(-6),
          empreendedor: d.propertyOrBusinessName || 'Empreendedor Notificado',
          propriedade: d.damName || 'Estrutura Fiscalizada',
          data: g.inspectionDate || insp.createdAt.split('T')[0],
          prazo: insp.conclusions?.requiresNotification ? 'Notificada' : 'Regular',
          municipio: mun,
          situacaoResposta: g.weather ? `Condições climáticas: ${g.weather} • Relatório de campo emitido pela CSB/SEMA-MT` : 'Inspeção técnica cadastrada no sistema Fiscaliza CSB',
          lat,
          lng,
          actionId: insp.id
        });

        marker.bindPopup(popup, popupOptions);
        marker.on('mouseover', () => {
          marker.setZIndexOffset(1000);
          marker.openPopup();
        });
        marker.on('mouseout', () => {
          marker.setZIndexOffset(0);
        });
        marker.on('click', () => {
          marker.setZIndexOffset(1000);
          marker.openPopup();
        });
        fiscalizadasLayerRef.current?.addLayer(marker);
      });
    }

  }, [
    notifications,
    allNovasNotificacoes,
    snisbDams,
    aneelDams,
    inspections,
    showNovas,
    showAntigas,
    showSnisb,
    showAneel,
    selectedMesAno,
    selectedMunicipality,
    filtroAtendidaSim,
    filtroAtendidaNao,
    legendFilters
  ]);

  // Busca e centralização por coordenada (LAT e LONG em inputs separados)
  const handleLocalizar = () => {
    setCoordError(null);
    if (!latInput.trim() || !longInput.trim()) {
      setCoordError('Preencha os campos LAT e LONG');
      return;
    }

    const lat = parseMapCoordinate(latInput, true);
    const lng = parseMapCoordinate(longInput, false);

    if (!lat || !lng || isNaN(lat) || isNaN(lng)) {
      setCoordError('Coordenada inválida. Ex: 15° 35\' 55" S');
      return;
    }

    const map = mapInstanceRef.current;
    if (!map) return;

    if (searchMarkerRef.current) {
      map.removeLayer(searchMarkerRef.current);
      searchMarkerRef.current = null;
    }

    const marker = L.marker([lat, lng], {
      icon: L.divIcon({
        className: 'search-pin',
        html: `
          <div style="width:28px;height:28px;border-radius:50%;background:#EF4444;border:3px solid #ffffff;box-shadow:0 3px 6px rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;color:#ffffff;font-weight:bold;font-size:12px;">
            📍
          </div>
        `,
        iconSize: [28, 28],
        iconAnchor: [14, 14]
      })
    });

    marker.bindPopup(`
      <div style="padding:4px;font-family:sans-serif;font-size:11px;">
        <strong style="color:#EF4444;">Ponto Localizado</strong><br/>
        GMS: ${formatLiveGms(lat, lng)}<br/>
        DEC: ${lat.toFixed(5)}, ${lng.toFixed(5)}
      </div>
    `);

    marker.on('mouseover', () => {
      marker.setZIndexOffset(1000);
      marker.openPopup();
    });
    marker.on('mouseout', () => {
      marker.setZIndexOffset(0);
    });
    marker.on('click', () => {
      marker.setZIndexOffset(1000);
      marker.openPopup();
    });

    marker.addTo(map);
    marker.openPopup();
    searchMarkerRef.current = marker;

    map.flyTo([lat, lng], 13, { duration: 1.2 });
  };

  const handleLimpar = () => {
    setLatInput('');
    setLongInput('');
    setCoordError(null);
    setSelectedMunicipality('todos');
    setSelectedMesAno('todos');
    if (searchMarkerRef.current && mapInstanceRef.current) {
      mapInstanceRef.current.removeLayer(searchMarkerRef.current);
      searchMarkerRef.current = null;
    }
    mapInstanceRef.current?.flyTo(MT_CENTER, MT_INITIAL_ZOOM, { duration: 1 });
  };

  // Alternador "TUDO / NADA" na Legenda
  const handleLegendTudo = () => {
    setLegendFilters({
      notifEmAberto: true,
      notifCumprida: true,
      notifAtrasada: true,
      notifArquivada: true,
      notifAntigaPendente: true,
      notifAntigaAtendida: true,
      cadastradasSnisb: true,
      cadastradasAneel: true,
      fiscalizadasSistema: true
    });
  };

  const handleLegendNada = () => {
    setLegendFilters({
      notifEmAberto: false,
      notifCumprida: false,
      notifAtrasada: false,
      notifArquivada: false,
      notifAntigaPendente: false,
      notifAntigaAtendida: false,
      cadastradasSnisb: false,
      cadastradasAneel: false,
      fiscalizadasSistema: false
    });
  };

  return (
    <div className={`space-y-4 font-sans text-slate-800 ${isFullscreen ? 'fixed inset-0 z-50 bg-slate-100 p-4 overflow-y-auto' : ''} ${className}`}>
      {/* ===================================================================== */}
      {/* 1. BARRA SUPERIOR DE FILTROS & COORDENADAS (EXATAMENTE COMO NA IMAGEM) */}
      {/* ===================================================================== */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs p-4 sm:p-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          {/* Linhas de Campos da Esquerda */}
          <div className="space-y-3.5 flex-1">
            {/* Linha 1: LAT, LONG, BOTAO LOCALIZAR, BOTAO LIMPAR */}
            <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">
                  LAT:
                </span>
                <input
                  type="text"
                  placeholder="Ex: 15° 35' 55&quot; S"
                  value={latInput}
                  onChange={(e) => setLatInput(e.target.value)}
                  className="w-36 sm:w-44 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 placeholder-slate-400 font-mono shadow-2xs focus:outline-none focus:border-slate-800"
                />
              </div>

              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">
                  LONG:
                </span>
                <input
                  type="text"
                  placeholder="Ex: 56° 05' 47&quot; W"
                  value={longInput}
                  onChange={(e) => setLongInput(e.target.value)}
                  className="w-36 sm:w-44 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 placeholder-slate-400 font-mono shadow-2xs focus:outline-none focus:border-slate-800"
                />
              </div>

              <button
                type="button"
                onClick={handleLocalizar}
                className="px-4 py-1.5 bg-slate-900 hover:bg-black active:scale-95 text-white font-extrabold text-xs rounded-full shadow-xs transition flex items-center gap-1.5 cursor-pointer"
              >
                <MapPin className="w-3.5 h-3.5" />
                <span>LOCALIZAR</span>
              </button>

              <button
                type="button"
                onClick={handleLimpar}
                className="px-3.5 py-1.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 font-extrabold text-xs rounded-full shadow-2xs transition cursor-pointer"
              >
                LIMPAR
              </button>
            </div>

            {/* Linha 2: MÊS/ANO, MUNICÍPIOS, ATENDIDA (ANTIGAS) [SIM] [NÃO] */}
            <div className="flex flex-wrap items-center gap-3 pt-1 border-t border-slate-100">
              {/* Dropdown MÊS/ANO */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setIsMesAnoOpen(!isMesAnoOpen)}
                  className="px-3.5 py-1.5 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 flex items-center gap-2 cursor-pointer shadow-2xs"
                >
                  <Calendar className="w-3.5 h-3.5 text-slate-500" />
                  <span>{selectedMesAno === 'todos' ? 'MÊS/ANO' : selectedMesAno}</span>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                </button>

                {isMesAnoOpen && (
                  <div className="absolute left-0 top-full mt-1.5 w-44 bg-white border border-slate-200 rounded-xl shadow-xl p-1.5 z-40 max-h-56 overflow-y-auto">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedMesAno('todos');
                        setIsMesAnoOpen(false);
                      }}
                      className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                        selectedMesAno === 'todos' ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      Todos os Anos / Meses
                    </button>
                    {mesAnoList.map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => {
                          setSelectedMesAno(m);
                          setIsMesAnoOpen(false);
                        }}
                        className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                          selectedMesAno === m ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Dropdown MUNICÍPIOS */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setIsMunDropdownOpen(!isMunDropdownOpen)}
                  className="px-3.5 py-1.5 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 flex items-center gap-2 cursor-pointer shadow-2xs min-w-[150px] justify-between"
                >
                  <div className="flex items-center gap-1.5 truncate">
                    <MapPin className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                    <span className="truncate">
                      {selectedMunicipality === 'todos' ? 'MUNICÍPIOS' : selectedMunicipality}
                    </span>
                  </div>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                </button>

                {isMunDropdownOpen && (
                  <div className="absolute left-0 top-full mt-1.5 w-60 bg-white border border-slate-200 rounded-xl shadow-xl p-2 z-40 flex flex-col">
                    <input
                      type="text"
                      placeholder="Buscar município..."
                      value={munSearchTerm}
                      onChange={(e) => setMunSearchTerm(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 placeholder-slate-400 focus:outline-none mb-1.5"
                      autoFocus
                    />
                    <div className="max-h-48 overflow-y-auto space-y-0.5">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedMunicipality('todos');
                          setIsMunDropdownOpen(false);
                        }}
                        className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                          selectedMunicipality === 'todos' ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        Todos os Municípios
                      </button>
                      {filteredMunicipalities.map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => {
                            setSelectedMunicipality(m);
                            setIsMunDropdownOpen(false);
                          }}
                          className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                            selectedMunicipality === m ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100'
                          }`}
                        >
                          {m}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* ATENDIDA (ANTIGAS) [SIM] [NÃO] */}
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">
                  ATENDIDA (ANTIGAS)
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setFiltroAtendidaSim(!filtroAtendidaSim)}
                    className={`px-3 py-1 rounded-full text-[11px] font-black transition cursor-pointer ${
                      filtroAtendidaSim
                        ? 'bg-emerald-500 text-white shadow-xs'
                        : 'bg-slate-100 text-slate-400 border border-slate-200'
                    }`}
                  >
                    SIM
                  </button>
                  <button
                    type="button"
                    onClick={() => setFiltroAtendidaNao(!filtroAtendidaNao)}
                    className={`px-3 py-1 rounded-full text-[11px] font-black transition cursor-pointer ${
                      filtroAtendidaNao
                        ? 'bg-rose-500 text-white shadow-xs'
                        : 'bg-slate-100 text-slate-400 border border-slate-200'
                    }`}
                  >
                    NÃO
                  </button>
                </div>
              </div>
            </div>

            {coordError && (
              <p className="text-rose-600 text-xs font-bold pt-1">{coordError}</p>
            )}
          </div>

          {/* Lado Direito: Linha Divisória + Checkboxes de Camadas Principais */}
          <div className="flex items-center gap-4 lg:pl-6 lg:border-l border-slate-200 self-start lg:self-center">
            <div className="flex flex-wrap lg:flex-col gap-2.5 text-xs font-bold text-slate-700">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={showNovas}
                  onChange={(e) => setShowNovas(e.target.checked)}
                  className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
                />
                <span className="flex items-center gap-1.5 flex-wrap">
                  <span>NOVAS</span>
                  {allNovasNotificacoes.length > 0 && (
                    <span className="text-[10px] bg-purple-100 text-purple-700 px-1.5 py-0.2 rounded-full font-bold">
                      {allNovasNotificacoes.length}
                    </span>
                  )}
                  <span
                    className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-extrabold tracking-wider ${
                      isRealtimeConnected
                        ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                        : 'bg-slate-100 text-slate-500 border border-slate-200'
                    }`}
                    title={isRealtimeConnected ? 'Tempo Real Ativo: notificações sincronizadas instantaneamente' : 'Monitoramento em Tempo Real aguardando eventos'}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${isRealtimeConnected ? 'bg-emerald-500 animate-ping' : 'bg-slate-400'}`} />
                    <span>{isRealtimeConnected ? 'AO VIVO' : 'REALTIME'}</span>
                  </span>
                </span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={showAntigas}
                  onChange={(e) => setShowAntigas(e.target.checked)}
                  className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
                />
                <span>ANTIGAS</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={showSnisb}
                  onChange={(e) => setShowSnisb(e.target.checked)}
                  className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
                />
                <span>SNISB</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={showAneel}
                  onChange={(e) => setShowAneel(e.target.checked)}
                  className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
                />
                <span>ANEEL</span>
              </label>
            </div>
          </div>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* 2. ÁREA PRINCIPAL: MAPA GEOESPACIAL LEAFLET                           */}
      {/* ===================================================================== */}
      <div className="bg-white rounded-3xl border border-slate-200/90 shadow-md p-3 sm:p-4">
        {/* MAPA LEAFLET EM LARGURA TOTAL COM LEGENDA FLUTUANTE */}
        <div className="w-full relative rounded-2xl overflow-hidden border border-slate-200 min-h-[560px] lg:min-h-[640px]">
          <div ref={mapContainerRef} className="w-full h-full min-h-[560px] lg:min-h-[640px] z-10" />

            {/* Barra de Coordenadas Flutuante no Topo (Fiel à Imagem de Monitoramento) */}
            {liveCoords && (
              <div className="absolute top-3.5 left-1/2 -translate-x-1/2 z-20 bg-slate-900/90 backdrop-blur-md text-white text-xs font-mono font-bold px-4 py-1.5 rounded-full shadow-xl border border-slate-700/80 pointer-events-none tracking-wide select-none">
                {liveCoords}
              </div>
            )}

            {/* Aviso Toast Flutuante de Evento Realtime no Topo do Mapa */}
            {realtimeToast && (
              <div className="absolute top-14 left-1/2 -translate-x-1/2 z-30 animate-bounce-short bg-slate-900/95 backdrop-blur-md text-white px-4 py-2 rounded-2xl shadow-2xl border border-slate-700/80 flex items-center gap-2.5 text-xs font-semibold">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                <span className="text-emerald-400 font-extrabold uppercase text-[10px] tracking-wider">
                  Tempo Real Institucional:
                </span>
                <span className="text-slate-100 font-medium">{realtimeToast}</span>
                <button
                  type="button"
                  onClick={() => setRealtimeToast(null)}
                  className="ml-2 text-slate-400 hover:text-white p-0.5 transition cursor-pointer"
                  title="Fechar"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Ações Rápidas do Mapa (Topo Direito): Sincronizar, Alternar Satélite/OSM, Fullscreen */}
            <div className="absolute top-3 right-3 z-20 flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  loadData();
                  fetchNovasNotificacoes().then((novas) => {
                    if (novas && novas.length > 0) setNovasNotificacoes(novas);
                  });
                }}
                className="w-10 h-10 rounded-xl bg-white/95 hover:bg-white text-slate-800 shadow-md border border-slate-200 flex items-center justify-center transition cursor-pointer"
                title="Sincronizar dados das planilhas e monitoramento em tempo real"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-emerald-600' : 'text-slate-700'}`} />
              </button>
              <button
                type="button"
                onClick={() => setBaseMap(baseMap === 'satellite' ? 'osm' : 'satellite')}
                className="w-10 h-10 rounded-xl bg-white/95 hover:bg-white text-slate-800 shadow-md border border-slate-200 flex items-center justify-center transition cursor-pointer"
                title={baseMap === 'satellite' ? 'Alternar para Mapa de Ruas' : 'Alternar para Satélite'}
              >
                <Layers className="w-5 h-5" />
              </button>
              <button
                type="button"
                onClick={() => setIsFullscreen(!isFullscreen)}
                className="w-10 h-10 rounded-xl bg-white/95 hover:bg-white text-slate-800 shadow-md border border-slate-200 flex items-center justify-center transition cursor-pointer"
                title={isFullscreen ? 'Sair da tela cheia' : 'Expandir mapa'}
              >
                {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              </button>
            </div>

            {/* LEGENDA FLUTUANTE NO CANTO INFERIOR ESQUERDO (IDÊNTICA À IMAGEM) */}
            <div className="absolute bottom-4 left-4 z-20 bg-white/95 backdrop-blur-md rounded-2xl border border-slate-200/90 p-3 shadow-xl max-w-[240px] text-xs font-semibold text-slate-700 select-none">
              <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100">
                <span className="font-extrabold text-[11px] uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                  🗺️ LEGENDA
                </span>
                <div className="flex items-center gap-2 text-[10px] font-black">
                  <button
                    type="button"
                    onClick={handleLegendTudo}
                    className="text-emerald-600 hover:underline cursor-pointer"
                  >
                    TUDO
                  </button>
                  <button
                    type="button"
                    onClick={handleLegendNada}
                    className="text-rose-500 hover:underline cursor-pointer"
                  >
                    NADA
                  </button>
                </div>
              </div>

              {/* Lista de Checkboxes da Legenda */}
              <div className="space-y-1.5">
                <label className="flex items-center gap-2 cursor-pointer hover:text-slate-950">
                  <input
                    type="checkbox"
                    checked={legendFilters.notifEmAberto}
                    onChange={(e) => setLegendFilters({ ...legendFilters, notifEmAberto: e.target.checked })}
                    className="w-3.5 h-3.5 rounded text-purple-600"
                  />
                  <span className="w-4 h-4 rounded-full bg-purple-600 text-white text-[9px] font-black flex items-center justify-center shrink-0">
                    !
                  </span>
                  <span className="text-[11px] truncate">NOTIF. (EM ABERTO)</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer hover:text-slate-950">
                  <input
                    type="checkbox"
                    checked={legendFilters.notifCumprida}
                    onChange={(e) => setLegendFilters({ ...legendFilters, notifCumprida: e.target.checked })}
                    className="w-3.5 h-3.5 rounded text-purple-600"
                  />
                  <span className="w-4 h-4 rounded-full bg-purple-600 text-white text-[9px] font-black flex items-center justify-center shrink-0">
                    ✓
                  </span>
                  <span className="text-[11px] truncate">NOTIF. (CUMPRIDA)</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer hover:text-slate-950">
                  <input
                    type="checkbox"
                    checked={legendFilters.notifAtrasada}
                    onChange={(e) => setLegendFilters({ ...legendFilters, notifAtrasada: e.target.checked })}
                    className="w-3.5 h-3.5 rounded text-rose-500"
                  />
                  <span className="w-4 h-4 rounded-full bg-rose-500 text-white text-[9px] font-black flex items-center justify-center shrink-0">
                    !
                  </span>
                  <span className="text-[11px] truncate">NOTIF. (ATRASADA)</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer hover:text-slate-950">
                  <input
                    type="checkbox"
                    checked={legendFilters.notifArquivada}
                    onChange={(e) => setLegendFilters({ ...legendFilters, notifArquivada: e.target.checked })}
                    className="w-3.5 h-3.5 rounded text-slate-500"
                  />
                  <span className="w-4 h-4 rounded-full bg-slate-500 text-white text-[9px] font-black flex items-center justify-center shrink-0">
                    !
                  </span>
                  <span className="text-[11px] truncate">NOTIF. (ARQUIVADA)</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer hover:text-slate-950">
                  <input
                    type="checkbox"
                    checked={legendFilters.notifAntigaPendente}
                    onChange={(e) => setLegendFilters({ ...legendFilters, notifAntigaPendente: e.target.checked })}
                    className="w-3.5 h-3.5 rounded text-amber-500"
                  />
                  <span className="w-4 h-4 text-amber-500 font-black flex items-center justify-center shrink-0 text-sm">
                    ⚠️
                  </span>
                  <span className="text-[11px] truncate">NOTIF. ANTIGA (PENDENTE)</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer hover:text-slate-950">
                  <input
                    type="checkbox"
                    checked={legendFilters.notifAntigaAtendida}
                    onChange={(e) => setLegendFilters({ ...legendFilters, notifAntigaAtendida: e.target.checked })}
                    className="w-3.5 h-3.5 rounded text-emerald-500"
                  />
                  <span className="w-4 h-4 text-emerald-500 font-black flex items-center justify-center shrink-0 text-xs">
                    ▲
                  </span>
                  <span className="text-[11px] truncate">NOTIF. ANTIGA (ATENDIDA)</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer hover:text-slate-950">
                  <input
                    type="checkbox"
                    checked={legendFilters.cadastradasSnisb}
                    onChange={(e) => setLegendFilters({ ...legendFilters, cadastradasSnisb: e.target.checked })}
                    className="w-3.5 h-3.5 rounded text-blue-600"
                  />
                  <span className="w-3.5 h-3.5 rounded-full bg-blue-600 shrink-0 border border-white" />
                  <span className="text-[11px] truncate">CADASTRADAS NO SNISB</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer hover:text-slate-950">
                  <input
                    type="checkbox"
                    checked={legendFilters.cadastradasAneel}
                    onChange={(e) => setLegendFilters({ ...legendFilters, cadastradasAneel: e.target.checked })}
                    className="w-3.5 h-3.5 rounded text-emerald-600"
                  />
                  <span className="w-3.5 h-3.5 rounded-xs bg-emerald-600 shrink-0 border border-white" />
                  <span className="text-[11px] truncate">CADASTRADAS NA ANEEL</span>
                </label>
              </div>
            </div>
          </div>
        </div>
      </div>
  );
};
