import React, { useEffect, useState } from 'react';
import {
  Search,
  Server,
  CheckCircle2,
  AlertTriangle,
  WifiOff,
  Building2,
  Landmark,
  Download,
  RefreshCw,
  X
} from 'lucide-react';
import {
  BarragemEntity,
  EmpreendedorEntity,
  ResponsavelTecnicoEntity
} from '../types/inspection';
import {
  checkEcosystemServerConnections,
  getSistemaLabel,
  ServerConnectivityResult
} from '../services/ecosystemConfig';
import { searchEcosystemEntrepreneursAndDams } from '../services/administraEcosystemService';

interface EcosystemTopic2LookupProps {
  initialQuery?: string;
  onExportSelection: (payload: {
    empreendedor: EmpreendedorEntity;
    barragem?: BarragemEntity | null;
    responsavelTecnico?: ResponsavelTecnicoEntity | null;
  }) => void;
}

export const EcosystemTopic2Lookup: React.FC<EcosystemTopic2LookupProps> = ({
  initialQuery = '',
  onExportSelection
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState(initialQuery);
  const [isSearching, setIsSearching] = useState(false);
  const [networkError, setNetworkError] = useState<string | null>(null);
  const [results, setResults] = useState<{
    empreendedores: EmpreendedorEntity[];
    barragens: BarragemEntity[];
    responsaveisTecnicos: ResponsavelTecnicoEntity[];
    queriedRemote: boolean;
  }>({
    empreendedores: [],
    barragens: [],
    responsaveisTecnicos: [],
    queriedRemote: false
  });
  const [selectedEmpId, setSelectedEmpId] = useState<string | null>(null);
  const [selectedDamId, setSelectedDamId] = useState<string | null>(null);

  const [serverChecks, setServerChecks] = useState<ServerConnectivityResult[] | null>(null);
  const [checkingServers, setCheckingServers] = useState(false);

  const runServerCheck = async () => {
    setCheckingServers(true);
    try {
      const res = await checkEcosystemServerConnections();
      setServerChecks(res);
    } finally {
      setCheckingServers(false);
    }
  };

  useEffect(() => {
    runServerCheck();
  }, []);

  const handleSearch = async (customQuery?: string) => {
    const q = customQuery !== undefined ? customQuery : query;
    const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
    setIsOpen(true);
    setIsSearching(true);
    setNetworkError(
      !isOnline
        ? 'Dispositivo sem conexão de rede. Exibindo apenas cadastros sincronizados previamente no cache local.'
        : null
    );
    try {
      const res = await searchEcosystemEntrepreneursAndDams(q);
      setResults(res);
      if (res.empreendedores.length === 1) {
        setSelectedEmpId(res.empreendedores[0].id);
      }
    } finally {
      setIsSearching(false);
    }
  };

  const selectedEmp = results.empreendedores.find(e => e.id === selectedEmpId) || null;
  const empDams = selectedEmp
    ? results.barragens.filter(b => b.empreendedorId === selectedEmp.id)
    : [];

  return (
    <div className="p-3.5 rounded-xl border border-indigo-200 bg-indigo-50/60 space-y-3">
      {/* Barra de Confirmação de Servidores + Lupinha de Consulta ao Ecossistema */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center gap-1 text-[11px] font-extrabold text-indigo-950">
            <Server className="w-3.5 h-3.5 text-indigo-600" />
            <span>Servidores do Ecossistema:</span>
          </span>
          {serverChecks?.map(s => (
            <span
              key={s.sistema}
              title={s.statusText}
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                s.reachable
                  ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                  : s.configured
                  ? 'bg-rose-100 text-rose-900 border-rose-300'
                  : 'bg-amber-100 text-amber-900 border-amber-300'
              }`}
            >
              {s.reachable ? (
                <CheckCircle2 className="w-3 h-3 text-emerald-700" />
              ) : (
                <AlertTriangle className="w-3 h-3 text-amber-700" />
              )}
              <span>
                {s.sistema === 'administra'
                  ? 'Administra'
                  : s.sistema === 'fiscaliza'
                  ? 'Fiscaliza'
                  : s.sistema === 'classifica'
                  ? 'Classifica'
                  : 'Notifica'}
                : {s.reachable ? `OK${s.latencyMs ? ` (${s.latencyMs}ms)` : ''}` : s.configured ? 'Falha' : 'Sem chave .env'}
              </span>
            </span>
          ))}
          <button
            type="button"
            onClick={runServerCheck}
            disabled={checkingServers}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white hover:bg-slate-100 border border-slate-300 text-[10px] font-bold text-slate-700 cursor-pointer"
            title="Testar conexão real com os servidores Administra, Fiscaliza, Classifica e Notifica"
          >
            <RefreshCw className={`w-3 h-3 ${checkingServers ? 'animate-spin' : ''}`} />
            <span>Confirmar Servidores</span>
          </button>
        </div>

        <button
          type="button"
          onClick={() => {
            if (isOpen) setIsOpen(false);
            else handleSearch(query);
          }}
          className="inline-flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-extrabold shadow-xs cursor-pointer shrink-0"
          title="Buscar e consultar empreendedores e barragens na base do Administra / Ecossistema"
        >
          <Search className="w-4 h-4" />
          <span>Consultar Base do Ecossistema (Administra)</span>
        </button>
      </div>

      {/* Painel Expansível da Lupinha */}
      {isOpen && (
        <div className="p-3.5 rounded-xl bg-white border border-indigo-200 shadow-sm space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-xs font-black text-slate-900 uppercase tracking-wide flex items-center gap-1.5">
              <Search className="w-4 h-4 text-indigo-600" />
              <span>Busca no Banco de Dados do Ecossistema (Empreendedores e Barragens)</span>
            </h4>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="p-1 rounded-lg hover:bg-slate-100 text-slate-500 cursor-pointer"
              aria-label="Fechar busca"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {networkError && (
            <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-300 text-amber-900 text-[11px] flex items-center gap-2">
              <WifiOff className="w-4 h-4 shrink-0 text-amber-700" />
              <span>{networkError}</span>
            </div>
          )}

          <div className="flex gap-2">
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleSearch();
                }
              }}
              placeholder="Digite nome do empreendedor, CPF/CNPJ, CAR, município ou nome da barragem..."
              className="flex-1 px-3 py-2 text-xs sm:text-sm rounded-lg border border-slate-300 bg-slate-50"
            />
            <button
              type="button"
              onClick={() => handleSearch()}
              disabled={isSearching}
              className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
            >
              <Search className="w-3.5 h-3.5" />
              <span>{isSearching ? 'Consultando...' : 'Buscar'}</span>
            </button>
          </div>

          {results.empreendedores.length === 0 ? (
            <p className="text-xs text-slate-500 py-2">
              Nenhum empreendedor localizado para o termo informado.
              {!results.queriedRemote &&
                ' Configure VITE_ADMINISTRA_SUPABASE_URL e VITE_ADMINISTRA_SUPABASE_ANON_KEY no .env para consultar registros remotos do Administra.'}
            </p>
          ) : (
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {results.empreendedores.map(emp => {
                const isSelected = selectedEmpId === emp.id;
                const damsForThisEmp = results.barragens.filter(b => b.empreendedorId === emp.id);
                return (
                  <div
                    key={emp.id}
                    className={`p-3 rounded-xl border transition space-y-2 ${
                      isSelected
                        ? 'border-indigo-500 bg-indigo-50/70'
                        : 'border-slate-200 bg-slate-50/50 hover:border-indigo-300'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div>
                        <div className="flex items-center flex-wrap gap-1.5">
                          <Building2 className="w-3.5 h-3.5 text-indigo-600" />
                          <span className="text-xs sm:text-sm font-bold text-slate-900">
                            {emp.nomeRazaoSocial}
                          </span>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-100 text-orange-900 border border-orange-300">
                            Fonte: {getSistemaLabel(emp.sistemaOrigem)}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-600 mt-0.5">
                          CPF/CNPJ: <strong>{emp.cpfCnpj || 'Não informado'}</strong> · Barragens vinculadas:{' '}
                          <strong>{damsForThisEmp.length}</strong>
                          {emp.criadoPorEmail ? ` · Analista: ${emp.criadoPorEmail}` : ''}
                        </p>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedEmpId(emp.id);
                            setSelectedDamId(damsForThisEmp[0]?.id || null);
                          }}
                          className="px-2.5 py-1.5 rounded-lg bg-white hover:bg-indigo-100 border border-indigo-300 text-indigo-900 text-xs font-bold cursor-pointer"
                        >
                          {isSelected ? 'Selecionado' : 'Selecionar'}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const linkedDam =
                              damsForThisEmp.find(d => d.id === selectedDamId) ||
                              damsForThisEmp[0] ||
                              null;
                            const linkedRt =
                              results.responsaveisTecnicos.find(
                                rt =>
                                  (linkedDam && rt.barragemId === linkedDam.id) ||
                                  rt.empreendedorId === emp.id
                              ) || null;
                            onExportSelection({
                              empreendedor: emp,
                              barragem: linkedDam,
                              responsavelTecnico: linkedRt
                            });
                            setIsOpen(false);
                          }}
                          className="px-3 py-1.5 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold flex items-center gap-1 cursor-pointer"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>Exportar Empreendedor{damsForThisEmp.length > 0 ? ' + Barragem' : ''}</span>
                        </button>
                      </div>
                    </div>

                    {/* Lista de barragens do empreendedor selecionado */}
                    {isSelected && empDams.length > 0 && (
                      <div className="pt-2 border-t border-indigo-200 space-y-1.5">
                        <span className="text-[11px] font-extrabold text-indigo-950 block">
                          Barragens encontradas para este Empreendedor (selecione a barragem para exportar junto):
                        </span>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {empDams.map(bar => {
                            const chosen = (selectedDamId || empDams[0]?.id) === bar.id;
                            return (
                              <button
                                key={bar.id}
                                type="button"
                                onClick={() => setSelectedDamId(bar.id)}
                                className={`p-2 rounded-lg border text-left text-xs flex items-center justify-between gap-2 cursor-pointer ${
                                  chosen
                                    ? 'border-orange-500 bg-orange-50 text-orange-950 font-bold'
                                    : 'border-slate-200 bg-white text-slate-700 hover:border-indigo-300'
                                }`}
                              >
                                <div className="flex items-center gap-1.5 min-w-0">
                                  <Landmark className="w-3.5 h-3.5 text-orange-600 shrink-0" />
                                  <div className="truncate">
                                    <div className="truncate">{bar.nome}</div>
                                    <div className="text-[10px] font-normal text-slate-500 truncate">
                                      {bar.municipio || 'MT'} · {getSistemaLabel(bar.sistemaOrigem)}
                                    </div>
                                  </div>
                                </div>
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-100 text-orange-900 shrink-0">
                                  {chosen ? 'Exportar' : 'Usar'}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
