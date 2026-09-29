// ==============================================================================
// ARQUIVO: src/components/DashboardStep.tsx
// Painel de Controle Principal (Página Inicial) - Fiscaliza CSB/SEMA-MT
// Atalhos diretos para "Preencher Ficha de Inspeção", Banco de Dados,
// métricas executivas e gestão de vistorias em andamento.
// ==============================================================================

import React from 'react';
import { 
  FileSpreadsheet, 
  Database, 
  FileCheck, 
  ShieldCheck, 
  PlusCircle, 
  Sparkles, 
  ArrowRight, 
  MapPin, 
  Calendar, 
  Camera, 
  AlertTriangle, 
  CheckCircle2, 
  Bell, 
  Edit3, 
  Eye, 
  FolderOpen,
  Wifi,
  WifiOff,
  Clock,
  Layers,
  FileText,
  Activity
} from 'lucide-react';
import { InspectionData } from '../types/inspection';

interface Props {
  currentInspection: InspectionData;
  allInspections: InspectionData[];
  onGoToSheet: () => void;
  onGoToDatabase: () => void;
  onGoToDocuments: () => void;
  onOpenSecurityModal: () => void;
  onNewInspection: () => void;
  onLoadSample: () => void;
  onSelectAndEdit: (id: string) => void;
  isOnline: boolean;
  lastSavedAt: string | null;
}

export const DashboardStep: React.FC<Props> = ({
  currentInspection,
  allInspections,
  onGoToSheet,
  onGoToDatabase,
  onGoToDocuments,
  onOpenSecurityModal,
  onNewInspection,
  onLoadSample,
  onSelectAndEdit,
  isOnline,
  lastSavedAt
}) => {
  const d = currentInspection.damIdentification;
  const g = currentInspection.generalInfo;
  const c = currentInspection.conclusions;

  // Cálculo de preenchimento da vistoria ativa
  const totalComponents = Object.keys(currentInspection.componentsData).length;
  const inspectedComponents = Object.values(currentInspection.componentsData).filter(
    comp => comp.condition !== 'nao_inspecionado'
  ).length;
  const hasCoords = !!(d.coordinates.latitude && d.coordinates.longitude);
  const hasName = !!(d.damName || d.propertyOrBusinessName);
  const hasDate = !!g.inspectionDate;
  const hasPhotos = currentInspection.photos.length > 0;

  let checklistPoints = 0;
  if (hasName) checklistPoints += 25;
  if (hasCoords) checklistPoints += 25;
  if (inspectedComponents > 0) checklistPoints += 30;
  if (hasPhotos) checklistPoints += 20;

  // Métricas do Banco de Dados
  const totalInspections = allInspections.length;
  const criticalDamsCount = allInspections.filter(item =>
    Object.values(item.componentsData).some(comp => comp.condition === 'critico')
  ).length;
  const totalPhotosCount = allInspections.reduce((acc, curr) => acc + curr.photos.length, 0);
  const totalNotifsCount = allInspections.filter(item => item.conclusions.requiresNotification).length;

  return (
    <div className="space-y-6">
      {/* 1. Banner Institucional de Boas-Vindas */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-emerald-950 text-white rounded-2xl p-5 sm:p-6 border border-slate-700/60 shadow-md relative overflow-hidden">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5 max-w-2xl">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 uppercase tracking-wider">
                Sistema Oficial de Campo
              </span>
              <span className="text-xs text-slate-400">
                CSB / SALARH / SEMA-MT
              </span>
            </div>

            <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white">
              Painel de Controle – Fiscalização de Barragens
            </h1>

            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
              Coordenadoria de Segurança de Barragens do Estado de Mato Grosso. Registro fático de campo, avaliação de componentes, banco de dados e emissão de minutas regulatórias.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row md:flex-col items-start md:items-end gap-2 shrink-0">
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-semibold ${
              isOnline 
                ? 'bg-emerald-950/80 text-emerald-300 border-emerald-700/60' 
                : 'bg-amber-950/80 text-amber-300 border-amber-700/60'
            }`}>
              {isOnline ? <Wifi className="w-4 h-4 text-emerald-400" /> : <WifiOff className="w-4 h-4 text-amber-400" />}
              <span>{isOnline ? 'Dispositivo Online (Supabase Sincronizado)' : 'Modo Offline (Gravando no Dispositivo)'}</span>
            </div>

            <span className="text-[11px] text-slate-400 flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-slate-500" />
              <span>Último salvamento: {lastSavedAt || 'Agora'}</span>
            </span>
          </div>
        </div>
      </div>

      {/* 2. ATALHOS PRINCIPAIS DE AÇÃO RÁPIDA (HERO SHORTCUTS) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        
        {/* ATALHO 1: PREENCHER FICHA DE INSPEÇÃO (EM DESTAQUE MÁXIMO) */}
        <div className="bg-white rounded-2xl border-2 border-emerald-600/80 p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between group relative overflow-hidden">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="w-12 h-12 rounded-xl bg-emerald-700 text-white flex items-center justify-center font-bold shadow-xs">
                <FileSpreadsheet className="w-6 h-6" />
              </div>
              <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-900 border border-emerald-300">
                Atalho Principal
              </span>
            </div>

            <div>
              <h2 className="text-lg font-black text-slate-900 leading-tight group-hover:text-emerald-800 transition">
                Preencher Ficha de Inspeção
              </h2>
              <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                Acesse o formulário oficial de campo da SEMA-MT para preenchimento de dados gerais, coordenadas, inspeção por componentes estruturais e anexo de fotos.
              </p>
            </div>

            {/* Status da vistoria atualmente carregada */}
            <div className="bg-slate-50 rounded-xl p-3 border border-slate-200 text-xs space-y-1.5">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-slate-500 font-semibold">Vistoria Ativa em Andamento:</span>
                <span className="font-bold text-emerald-800">{checklistPoints}% preenchida</span>
              </div>
              <p className="font-bold text-slate-900 truncate">
                {d.damName || d.propertyOrBusinessName || 'Nova Vistoria (Sem Denominação)'}
              </p>
              <p className="text-[11px] text-slate-500 truncate">
                {d.municipality || 'Mato Grosso'}/MT • {inspectedComponents} de {totalComponents} componentes avaliados
              </p>
              
              {/* Barra de Progresso */}
              <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
                <div 
                  className="bg-emerald-600 h-1.5 rounded-full transition-all duration-300"
                  style={{ width: `${checklistPoints}%` }}
                />
              </div>
            </div>
          </div>

          <div className="pt-4 mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={onGoToSheet}
              className="flex-1 min-h-[44px] py-2.5 px-4 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs sm:text-sm font-bold transition flex items-center justify-center gap-2 shadow-xs cursor-pointer"
            >
              <span>Continuar Preenchimento</span>
              <ArrowRight className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={onNewInspection}
              className="min-h-[44px] px-3 rounded-xl border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-semibold transition cursor-pointer"
              title="Iniciar nova ficha do zero"
            >
              <PlusCircle className="w-4 h-4 text-emerald-700" />
            </button>
          </div>
        </div>

        {/* ATALHO 2: BANCO DE DADOS DE VISTORIAS */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between group">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="w-12 h-12 rounded-xl bg-slate-900 text-white flex items-center justify-center font-bold shadow-xs">
                <Database className="w-6 h-6 text-emerald-400" />
              </div>
              <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                {totalInspections} Vistoria(s)
              </span>
            </div>

            <div>
              <h2 className="text-lg font-black text-slate-900 leading-tight group-hover:text-emerald-800 transition">
                Módulo Banco de Dados
              </h2>
              <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                Consulte o histórico de todas as inspeções realizadas, pesquise por barragem, visualize detalhes completos, edite registros ou exclua vistorias.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200 space-y-0.5">
                <span className="text-[10px] text-slate-500 font-semibold uppercase">Total Cadastrado:</span>
                <span className="font-bold text-slate-900 text-sm block">{totalInspections} inspeções</span>
              </div>
              <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200 space-y-0.5">
                <span className="text-[10px] text-slate-500 font-semibold uppercase">Situação de Risco:</span>
                <span className="font-bold text-rose-700 text-sm block">{criticalDamsCount} barragens</span>
              </div>
            </div>
          </div>

          <div className="pt-4 mt-2">
            <button
              type="button"
              onClick={onGoToDatabase}
              className="w-full min-h-[44px] py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-black text-white text-xs sm:text-sm font-bold transition flex items-center justify-center gap-2 shadow-xs cursor-pointer"
            >
              <Database className="w-4 h-4 text-emerald-400" />
              <span>Acessar Banco de Dados</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>

      </div>

      {/* 3. Atalhos Secundários: Minutas Oficiais & Governança */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5 text-xs">
        {/* Minutas Oficiais */}
        <div 
          onClick={onGoToDocuments}
          className="bg-white p-4 rounded-xl border border-slate-200 hover:border-emerald-500 transition shadow-2xs hover:shadow-sm cursor-pointer space-y-2 group"
        >
          <div className="flex items-center justify-between">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold">
              <FileCheck className="w-4 h-4 text-emerald-700" />
            </div>
            <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-emerald-600 transition" />
          </div>
          <h3 className="font-bold text-slate-900 group-hover:text-emerald-800">
            Minutas de Documentos Oficiais
          </h3>
          <p className="text-[11px] text-slate-500 leading-tight">
            Emita o Auto de Inspeção, Relatório Técnico de 15 seções e Notificação Técnica (SIGA Autuação).
          </p>
        </div>

        {/* Auditoria & LGPD */}
        <div 
          onClick={onOpenSecurityModal}
          className="bg-white p-4 rounded-xl border border-slate-200 hover:border-emerald-500 transition shadow-2xs hover:shadow-sm cursor-pointer space-y-2 group"
        >
          <div className="flex items-center justify-between">
            <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-800 flex items-center justify-center font-bold">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
            </div>
            <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-emerald-600 transition" />
          </div>
          <h3 className="font-bold text-slate-900 group-hover:text-emerald-800">
            Auditoria SEMA, LGPD & RLS
          </h3>
          <p className="text-[11px] text-slate-500 leading-tight">
            Verifique as 6 prioridades de homologação, exporte dados 100% anonimizados e confira status do Supabase.
          </p>
        </div>

        {/* Exemplo de Teste */}
        <div 
          onClick={onLoadSample}
          className="bg-white p-4 rounded-xl border border-amber-200/80 bg-amber-50/30 hover:border-amber-400 transition shadow-2xs hover:shadow-sm cursor-pointer space-y-2 group"
        >
          <div className="flex items-center justify-between">
            <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-800 flex items-center justify-center font-bold">
              <Sparkles className="w-4 h-4 text-amber-600" />
            </div>
            <span className="text-[10px] text-amber-800 font-bold px-1.5 py-0.5 rounded bg-amber-100">
              Didático
            </span>
          </div>
          <h3 className="font-bold text-slate-900 group-hover:text-amber-900">
            Carregar Exemplo de Teste
          </h3>
          <p className="text-[11px] text-slate-500 leading-tight">
            Carregue uma vistoria completa de demonstração (Fazenda Alvorada - Poconé/MT) com anomalias e fotos.
          </p>
        </div>
      </div>

      {/* 4. Vistorias Recentes no Banco de Dados */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-xs space-y-3">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-emerald-600" />
            <h3 className="text-sm font-bold text-slate-900">
              Vistorias Recentes Cadastradas ({allInspections.length})
            </h3>
          </div>

          <button
            type="button"
            onClick={onGoToDatabase}
            className="text-xs text-emerald-700 font-bold hover:underline flex items-center gap-1 cursor-pointer"
          >
            <span>Ver Todas no Banco</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="divide-y divide-slate-100">
          {allInspections.slice(0, 4).map(item => {
            const isItemActive = item.id === currentInspection.id;
            const crit = Object.values(item.componentsData).filter(c => c.condition === 'critico').length;
            const itemPhotos = item.photos.length;

            return (
              <div key={item.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-900">
                      {item.damIdentification.damName || item.damIdentification.propertyOrBusinessName || 'Vistoria sem título'}
                    </span>
                    {isItemActive && (
                      <span className="text-[10px] font-bold px-2 py-0.2 rounded-full bg-emerald-100 text-emerald-800">
                        Ativa
                      </span>
                    )}
                    {crit > 0 && (
                      <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-full bg-rose-100 text-rose-800">
                        {crit} anomalia(s) crítica(s)
                      </span>
                    )}
                  </div>

                  <p className="text-[11px] text-slate-500">
                    {item.damIdentification.municipality || 'Mato Grosso'}/MT • Data: {item.generalInfo.inspectionDate || 'Não informada'} • {itemPhotos} foto(s)
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => onSelectAndEdit(item.id)}
                    className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-black text-white text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer shadow-2xs"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span>Editar na Ficha</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
