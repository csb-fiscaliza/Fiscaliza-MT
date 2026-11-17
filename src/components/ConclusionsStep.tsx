import React from 'react';
import { 
  ClipboardCheck, 
  AlertCircle, 
  BellRing, 
  ArrowLeft, 
  ArrowRight,
  ShieldAlert,
  Info,
  Plus
} from 'lucide-react';
import { InspectionData } from '../types/inspection';

import { NOTIFICATION_TEMPLATES } from '../config/notificationTemplates';
import { NotificacaoModelType } from '../types/inspection';
import { SpeechTextarea } from './SpeechTextarea';

interface Props {
  data: InspectionData;
  onChange: (updater: (prev: InspectionData) => InspectionData) => void;
  onNext: () => void;
  onPrev: () => void;
}

export const ConclusionsStep: React.FC<Props> = ({ data, onChange, onNext, onPrev }) => {
  const c = data.conclusions;
  const notif = c.notificationDetails;

  const updateConclusions = (field: string, value: any) => {
    onChange(prev => ({
      ...prev,
      conclusions: {
        ...prev.conclusions,
        [field]: value
      }
    }));
  };

  const updateNotificationDetails = (field: string, value: any) => {
    onChange(prev => ({
      ...prev,
      conclusions: {
        ...prev.conclusions,
        notificationDetails: {
          ...prev.conclusions.notificationDetails,
          [field]: value
        }
      }
    }));
  };

  const handleSelectModel = (modelType: NotificacaoModelType) => {
    const tmpl = NOTIFICATION_TEMPLATES[modelType];
    if (!tmpl) return;

    onChange(prev => ({
      ...prev,
      conclusions: {
        ...prev.conclusions,
        notificationDetails: {
          ...prev.conclusions.notificationDetails,
          modelType,
          modelTitle: tmpl.title,
          objetivo: tmpl.defaultObjetivo,
          // Não preenche prazo automaticamente de forma arbitrária; oferece a sugestão
          prazoDias: prev.conclusions.notificationDetails.prazoDias || tmpl.sugestaoPrazoDias,
          solicitacoesTexto: tmpl.defaultSolicitacoes,
          observacoesGeraisTexto: tmpl.defaultObservacoesGerais,
          referenciasNormativas: tmpl.referenciasNormativas.map(r => ({ ...r }))
        }
      }
    }));
  };

  const addPresetDemand = (text: string) => {
    const current = notif.solicitacoesTexto || '';
    const updated = current ? `${current}\n• ${text}` : `• ${text}`;
    updateNotificationDetails('solicitacoesTexto', updated);
  };

  return (
    <div className="space-y-6">
      {/* Top Warning Banner / Non-automatic decision disclaimer */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-amber-950 flex items-start gap-3 shadow-xs">
        <AlertCircle className="w-5 h-5 text-amber-700 mt-0.5 shrink-0" />
        <div className="text-xs sm:text-sm">
          <p className="font-semibold text-amber-950">
            Diretriz Ética e Legal – Não Automatização de Sanções ou Classificações
          </p>
          <p className="text-amber-800 mt-0.5 leading-relaxed">
            O Fiscaliza não decide automaticamente enquadramento na PNSB (Lei 12.334/2010), Dano Potencial Associado (DPA), Categoria de Risco (CRI) ou imposição de sanções. Registre aqui suas constatações fáticas e orientações técnicas de campo para compor as minutas oficiais.
          </p>
        </div>
      </div>

      {/* Card 1: Parecer Técnico Fático e Recomendações */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 shadow-xs space-y-4 transition-colors">
        <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
          <ClipboardCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100 uppercase tracking-wide">
            5.1 Síntese Fática e Recomendações do Servidor
          </h2>
        </div>

        <SpeechTextarea
          label="Síntese das Constatações da Vistoria de Campo:"
          rows={3}
          placeholder="Descreva o panorama geral das condições de segurança e conservação do barramento observadas pela equipe durante a vistoria..."
          value={c.generalFindings}
          onChange={e => updateConclusions('generalFindings', e.target.value)}
        />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <SpeechTextarea
            label="Medidas Imediatas de Segurança Orientadas no Local:"
            rows={3}
            placeholder="ex: Desobstrução imediata do vertedouro; cessar tráfego de maquinário na crista; rebaixamento de nível caso haja risco de galgamento..."
            value={c.immediateSafetyMeasures}
            onChange={e => updateConclusions('immediateSafetyMeasures', e.target.value)}
          />

          <SpeechTextarea
            label="Recomendações Técnicas ao Responsável pelo Empreendimento:"
            rows={3}
            placeholder="ex: Contratação de responsável técnico habilitado para emissão de laudo de estabilidade; protocolo de processo de outorga junto à SEMA-MT..."
            value={c.recommendationsToOwner}
            onChange={e => updateConclusions('recommendationsToOwner', e.target.value)}
          />
        </div>
      </div>

      {/* Card 2: Decisão sobre Emissão da Notificação Técnica */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 shadow-xs space-y-4 transition-colors">
        <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
          <BellRing className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100 uppercase tracking-wide">
            5.2 Necessidade de Emissão de Notificação Técnica
          </h2>
        </div>

        {/* Toggle Box */}
        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 space-y-3">
          <div className="flex items-start gap-3">
            <input
              type="checkbox"
              id="chkNotification"
              checked={c.requiresNotification}
              onChange={e => updateConclusions('requiresNotification', e.target.checked)}
              className="mt-1 w-5 h-5 text-emerald-600 rounded border-slate-300 dark:border-slate-700 focus:ring-emerald-500 cursor-pointer"
            />
            <label htmlFor="chkNotification" className="cursor-pointer">
              <span className="font-bold text-sm text-slate-800 dark:text-slate-100 block">
                Emitir Minuta de Notificação Técnica formal ao responsável
              </span>
              <span className="text-xs text-slate-600 dark:text-slate-400 block mt-0.5">
                Marque apenas quando as anomalias, ausência de outorga ou pendências de manutenção exigirem fixação de prazo formal e comprovação perante a SEMA-MT.
              </span>
            </label>
          </div>
        </div>

        {/* Detalhes da Notificação se ativada */}
        {c.requiresNotification ? (
          <div className="p-4 rounded-xl border border-amber-200 bg-amber-50/40 space-y-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-amber-900 font-bold text-xs uppercase tracking-wide">
                <ShieldAlert className="w-4 h-4 text-amber-700" />
                <span>Configuração Prévia da Minuta de Notificação</span>
              </div>
              <span className="text-[11px] font-semibold text-amber-800 bg-amber-100 px-2.5 py-0.5 rounded-full border border-amber-300">
                Documento Condicional
              </span>
            </div>

            {/* Seleção do Modelo de Finalidade */}
            <div>
              <label className="block text-xs font-bold text-slate-800 mb-2">
                1. Selecione o Modelo de Finalidade da Notificação:
              </label>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {(Object.keys(NOTIFICATION_TEMPLATES) as NotificacaoModelType[]).map(key => {
                  const tmpl = NOTIFICATION_TEMPLATES[key];
                  const isSelected = notif.modelType === key;
                  return (
                    <div
                      key={key}
                      onClick={() => handleSelectModel(key)}
                      className={`p-3 rounded-xl border-2 transition cursor-pointer flex flex-col justify-between ${
                        isSelected 
                          ? 'border-emerald-600 bg-white shadow-xs ring-1 ring-emerald-500' 
                          : 'border-slate-200 bg-white/70 hover:border-slate-300'
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <span className={`text-[11px] font-extrabold uppercase ${isSelected ? 'text-emerald-700' : 'text-slate-600'}`}>
                            {tmpl.title.split(':')[0]}
                          </span>
                          {isSelected && <span className="text-emerald-600 font-bold text-xs">✓ Ativo</span>}
                        </div>
                        <h4 className="text-xs font-bold text-slate-900 leading-snug">
                          {tmpl.title.split(':')[1]?.trim() || tmpl.title}
                        </h4>
                        <p className="text-[11px] text-slate-600 mt-1 leading-relaxed">
                          {tmpl.shortDescription}
                        </p>
                      </div>
                      <div className="mt-2 pt-1 border-t border-slate-100 text-[10px] text-slate-500">
                        Sugestão: {tmpl.sugestaoPrazoDias} dias (revisável)
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Vínculo com Auto e Processo */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-white p-3 rounded-xl border border-slate-200">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Vínculo com Auto de Inspeção Nº:
                </label>
                <input
                  type="text"
                  placeholder="ex: 13503000126"
                  value={notif.vinculoAutoInspecaoNumero || data.generalInfo.recordNumber || ''}
                  onChange={e => updateNotificationDetails('vinculoAutoInspecaoNumero', e.target.value)}
                  className="w-full text-xs p-2 border border-slate-300 rounded-lg bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Nº do Processo SEMA:
                </label>
                <input
                  type="text"
                  placeholder="ex: 3592/2022"
                  value={notif.processoNumero || ''}
                  onChange={e => updateNotificationDetails('processoNumero', e.target.value)}
                  className="w-full text-xs p-2 border border-slate-300 rounded-lg bg-white"
                />
              </div>
            </div>

            {/* Prazo e Objetivo */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-white p-3 rounded-xl border border-slate-200">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Prazo Assinalado (Dias Corridos):
                </label>
                <div className="flex gap-1.5">
                  <input
                    type="number"
                    min="1"
                    max="180"
                    placeholder="ex: 90 ou 30"
                    value={notif.prazoDias || ''}
                    onChange={e => updateNotificationDetails('prazoDias', e.target.value)}
                    className="w-full text-xs p-2 border border-slate-300 rounded-lg bg-white font-bold"
                  />
                  {['15', '30', '60', '90'].map(d => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => updateNotificationDetails('prazoDias', d)}
                      className={`px-2 py-1 text-[11px] rounded border transition cursor-pointer ${
                        notif.prazoDias === d 
                          ? 'bg-emerald-600 text-white border-emerald-600 font-bold' 
                          : 'bg-slate-50 text-slate-700 border-slate-300 hover:bg-slate-100'
                      }`}
                    >
                      {d}d
                    </button>
                  ))}
                </div>
                {!notif.prazoDias && (
                  <span className="text-[10px] text-amber-700 font-semibold mt-1 block">
                    * Fixe o prazo explicitamente
                  </span>
                )}
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Objetivo da Notificação:
                </label>
                <input
                  type="text"
                  placeholder="ex: Notificação para novo cadastro e classificação do Dano Potencial Associado..."
                  value={notif.objetivo || ''}
                  onChange={e => updateNotificationDetails('objetivo', e.target.value)}
                  className="w-full text-xs p-2 border border-slate-300 rounded-lg bg-white font-medium"
                />
              </div>
            </div>

            {/* Determinações e Exigências */}
            <div className="bg-white p-3 rounded-xl border border-slate-200 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="text-xs font-bold text-slate-700">
                  Determinações / Exigências Técnicas da Notificação:
                </label>
                <span className="text-[11px] text-slate-500">
                  Sugestões rápidas de exigências:
                </span>
              </div>

              {/* Quick suggestion buttons */}
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => addPresetDemand('Providenciar novo processo para cadastro e classificação do DPA e CRI da barragem')}
                  className="text-[11px] px-2 py-1 rounded bg-slate-50 hover:bg-slate-100 border border-slate-300 text-slate-700 transition flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3 h-3 text-emerald-600" />
                  <span>Cadastramento e Classificação</span>
                </button>
                <button
                  type="button"
                  onClick={() => addPresetDemand('Promover a imediata desobstrução, limpeza e recomposição do vertedouro/extravasor')}
                  className="text-[11px] px-2 py-1 rounded bg-slate-50 hover:bg-slate-100 border border-slate-300 text-slate-700 transition flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3 h-3 text-emerald-600" />
                  <span>Desobstrução do Vertedouro</span>
                </button>
                <button
                  type="button"
                  onClick={() => addPresetDemand('Apresentar Laudo Técnico de Segurança de Barragem emitido por profissional habilitado com respectiva ART')}
                  className="text-[11px] px-2 py-1 rounded bg-slate-50 hover:bg-slate-100 border border-slate-300 text-slate-700 transition flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3 h-3 text-emerald-600" />
                  <span>Laudo com ART</span>
                </button>
                <button
                  type="button"
                  onClick={() => addPresetDemand('Efetuar a erradicação de formigueiros e recomposição do solo nos taludes')}
                  className="text-[11px] px-2 py-1 rounded bg-slate-50 hover:bg-slate-100 border border-slate-300 text-slate-700 transition flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3 h-3 text-emerald-600" />
                  <span>Combate a Formigueiros</span>
                </button>
              </div>

              <SpeechTextarea
                label="Exigências da Notificação:"
                rows={4}
                placeholder="Insira as exigências que constarão na Notificação..."
                value={notif.solicitacoesTexto || ''}
                onChange={e => updateNotificationDetails('solicitacoesTexto', e.target.value)}
                className="font-mono"
              />
            </div>
          </div>
        ) : (
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-600 flex items-center gap-2">
            <Info className="w-4 h-4 text-slate-400 shrink-0" />
            <span>
              A minuta de Notificação <strong>não será gerada</strong> para esta vistoria. Apenas o Auto de Inspeção e o Relatório Técnico serão emitidos para revisão.
            </span>
          </div>
        )}
      </div>

      {/* Footer Navigation */}
      <div className="flex justify-between items-center pt-2">
        <button
          type="button"
          onClick={onPrev}
          className="flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 text-xs sm:text-sm font-semibold transition cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Voltar: Fotos de Campo</span>
        </button>

        <button
          type="button"
          onClick={onNext}
          className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs sm:text-sm shadow-xs transition cursor-pointer"
        >
          <span>Gerar e Revisar Minutas Oficiais</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
