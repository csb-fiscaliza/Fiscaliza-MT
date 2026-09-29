import React from 'react';
import { 
  Calendar, 
  Clock, 
  CloudSun, 
  UserCheck, 
  Users, 
  UserPlus, 
  Trash2, 
  ArrowRight,
  Info,
  Shield
} from 'lucide-react';
import { InspectionData, WeatherCondition } from '../types/inspection';

interface Props {
  data: InspectionData;
  onChange: (updater: (prev: InspectionData) => InspectionData) => void;
  onNext: () => void;
}

export const GeneralInfoStep: React.FC<Props> = ({ data, onChange, onNext }) => {
  const g = data.generalInfo;

  const updateGeneral = (field: string, value: any) => {
    onChange(prev => ({
      ...prev,
      generalInfo: {
        ...prev.generalInfo,
        [field]: value
      }
    }));
  };

  const updateInspector = (index: number, field: string, value: string) => {
    onChange(prev => {
      const nextInspectors = [...prev.generalInfo.inspectors];
      nextInspectors[index] = {
        ...nextInspectors[index],
        [field]: value
      };
      return {
        ...prev,
        generalInfo: {
          ...prev.generalInfo,
          inspectors: nextInspectors
        }
      };
    });
  };

  const addInspector = () => {
    onChange(prev => ({
      ...prev,
      generalInfo: {
        ...prev.generalInfo,
        inspectors: [
          ...prev.generalInfo.inspectors,
          {
            name: '',
            role: 'Técnico / Fiscal da SEMA-MT',
            registrationNumber: '',
            sector: 'CSB / SRH / SEMA-MT'
          }
        ]
      }
    }));
  };

  const removeInspector = (index: number) => {
    if (g.inspectors.length <= 1) return;
    onChange(prev => ({
      ...prev,
      generalInfo: {
        ...prev.generalInfo,
        inspectors: prev.generalInfo.inspectors.filter((_, i) => i !== index)
      }
    }));
  };

  const updateAccompaniedBy = (field: string, value: any) => {
    onChange(prev => ({
      ...prev,
      generalInfo: {
        ...prev.generalInfo,
        accompaniedBy: {
          ...prev.generalInfo.accompaniedBy,
          [field]: value
        }
      }
    }));
  };

  return (
    <div className="space-y-6">
      {/* Top Banner / Guidance */}
      <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-emerald-900 flex items-start gap-3 shadow-xs">
        <Shield className="w-5 h-5 text-emerald-700 mt-0.5 shrink-0" />
        <div className="text-xs sm:text-sm">
          <p className="font-semibold text-emerald-950">
            Coordenadoria de Segurança de Barragens – CSB / SEMA-MT
          </p>
          <p className="text-emerald-800 mt-0.5 leading-relaxed">
            Inicie o preenchimento digital informando os dados da equipe de campo e as condições da vistoria técnica no barramento. Os dados alimentam automaticamente a minuta do Auto de Inspeção e do Relatório Técnico.
          </p>
        </div>
      </div>

      {/* Card 1: Dados do Registro e Horário */}
      <div className="bg-white rounded-xl shadow-xs border border-slate-200 p-5 space-y-4">
        <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
          <Calendar className="w-4 h-4 text-emerald-600" />
          <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wide">
            1.1 Dados da Fiscalização e Momento da Vistoria
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Processo SEMA / Ordem de Serviço / Nº de Controle
            </label>
            <input
              type="text"
              placeholder="ex: PROC-2026/01234-SEMA ou OS-CSB nº 042"
              value={g.recordNumber}
              onChange={e => updateGeneral('recordNumber', e.target.value)}
              className="w-full text-xs sm:text-sm px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 bg-slate-50/50"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Data da Vistoria
            </label>
            <input
              type="date"
              value={g.inspectionDate}
              onChange={e => updateGeneral('inspectionDate', e.target.value)}
              className="w-full text-xs sm:text-sm px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 bg-slate-50/50"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Condições Climáticas no Momento
            </label>
            <select
              value={g.weather}
              onChange={e => updateGeneral('weather', e.target.value as WeatherCondition)}
              className="w-full text-xs sm:text-sm px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 bg-slate-50/50"
            >
              <option value="seco">Seco / Ensolarado</option>
              <option value="nublado">Nublado / Encoberto</option>
              <option value="chuva_fraca">Chuva fraca / Garoa</option>
              <option value="chuva_moderada">Chuva moderada</option>
              <option value="chuva_forte_recente">Chuva forte recente na bacia</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Horário de Início
            </label>
            <div className="relative">
              <input
                type="time"
                value={g.startTime}
                onChange={e => updateGeneral('startTime', e.target.value)}
                className="w-full text-xs sm:text-sm px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 bg-slate-50/50"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Horário de Término
            </label>
            <div className="relative">
              <input
                type="time"
                value={g.endTime}
                onChange={e => updateGeneral('endTime', e.target.value)}
                className="w-full text-xs sm:text-sm px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 bg-slate-50/50"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Card 2: Equipe de Fiscalização */}
      <div className="bg-white rounded-xl shadow-xs border border-slate-200 p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-emerald-600" />
            <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wide">
              1.2 Equipe de Servidores Fiscalizadores
            </h2>
          </div>
          <button
            type="button"
            onClick={addInspector}
            className="flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1 rounded-md transition cursor-pointer"
          >
            <UserPlus className="w-3.5 h-3.5" />
            Adicionar Servidor
          </button>
        </div>

        <div className="space-y-3">
          {g.inspectors.map((inspector, index) => (
            <div
              key={index}
              className="p-3 bg-slate-50 rounded-lg border border-slate-200/80 grid grid-cols-1 sm:grid-cols-12 gap-3 items-end"
            >
              <div className="sm:col-span-5">
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Nome Completo do Servidor {index + 1}
                </label>
                <input
                  type="text"
                  placeholder="Nome do servidor vistoriador"
                  value={inspector.name}
                  onChange={e => updateInspector(index, 'name', e.target.value)}
                  className="w-full text-xs px-2.5 py-1.5 border border-slate-300 rounded bg-white focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div className="sm:col-span-3">
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Cargo / Função
                </label>
                <input
                  type="text"
                  value={inspector.role}
                  onChange={e => updateInspector(index, 'role', e.target.value)}
                  className="w-full text-xs px-2.5 py-1.5 border border-slate-300 rounded bg-white focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div className="sm:col-span-3">
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Matrícula / Registro
                </label>
                <input
                  type="text"
                  placeholder="ex: 123456"
                  value={inspector.registrationNumber}
                  onChange={e => updateInspector(index, 'registrationNumber', e.target.value)}
                  className="w-full text-xs px-2.5 py-1.5 border border-slate-300 rounded bg-white focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div className="sm:col-span-1 flex justify-end">
                {g.inspectors.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeInspector(index)}
                    className="p-1.5 text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded transition cursor-pointer"
                    title="Remover servidor"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Card 3: Acompanhamento da Vistoria */}
      <div className="bg-white rounded-xl shadow-xs border border-slate-200 p-5 space-y-4">
        <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
          <UserCheck className="w-4 h-4 text-emerald-600" />
          <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wide">
            1.3 Acompanhante / Representante no Local
          </h2>
        </div>

        <div className="flex items-center gap-3 py-1">
          <label className="relative flex items-center gap-2 text-xs font-semibold text-slate-800 cursor-pointer">
            <input
              type="checkbox"
              checked={g.accompaniedBy.hasAccompaniment}
              onChange={e => updateAccompaniedBy('hasAccompaniment', e.target.checked)}
              className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500"
            />
            Houve acompanhamento presencial de preposto, responsável técnico ou proprietário
          </label>
        </div>

        {g.accompaniedBy.hasAccompaniment ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 pt-2">
            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Nome do Acompanhante
              </label>
              <input
                type="text"
                placeholder="Nome da pessoa presente no campo"
                value={g.accompaniedBy.name}
                onChange={e => updateAccompaniedBy('name', e.target.value)}
                className="w-full text-xs sm:text-sm px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 bg-slate-50/50"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Vínculo com o Empreendimento
              </label>
              <select
                value={g.accompaniedBy.relationship}
                onChange={e => updateAccompaniedBy('relationship', e.target.value)}
                className="w-full text-xs sm:text-sm px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 bg-slate-50/50"
              >
                <option value="Proprietário">Proprietário</option>
                <option value="Arrendatário / Posseiro">Arrendatário / Posseiro</option>
                <option value="Gerente / Encarregado da Fazenda">Gerente / Encarregado</option>
                <option value="Responsável Técnico (Engenheiro com ART)">Responsável Técnico (com ART)</option>
                <option value="Advogado / Procurador">Advogado / Procurador</option>
                <option value="Funcionário / Colaborador local">Funcionário local</option>
                <option value="Outro">Outro vínculo</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                CPF ou RG ou CREA
              </label>
              <input
                type="text"
                placeholder="Número do documento"
                value={g.accompaniedBy.document}
                onChange={e => updateAccompaniedBy('document', e.target.value)}
                className="w-full text-xs sm:text-sm px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 bg-slate-50/50"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Telefone de Contato / WhatsApp
              </label>
              <input
                type="text"
                placeholder="ex: (65) 99999-0000"
                value={g.accompaniedBy.phone}
                onChange={e => updateAccompaniedBy('phone', e.target.value)}
                className="w-full text-xs sm:text-sm px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 bg-slate-50/50"
              />
            </div>
          </div>
        ) : (
          <div className="p-3 bg-amber-50 rounded-lg border border-amber-200 text-xs text-amber-800 flex items-center gap-2">
            <Info className="w-4 h-4 text-amber-600 shrink-0" />
            <span>
              A vistoria será registrada como realizada sem a presença do responsável ou preposto no local. O Auto de Inspeção fará constar essa informação.
            </span>
          </div>
        )}
      </div>

      {/* Navigation Footer */}
      <div className="flex justify-end pt-2">
        <button
          type="button"
          onClick={onNext}
          className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm shadow-xs transition cursor-pointer"
        >
          <span>Avançar: Barragem & Localização GPS</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
