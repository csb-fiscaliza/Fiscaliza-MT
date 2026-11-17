// ==============================================================================
// ARQUIVO: src/components/AutoInspecaoDocumentView.tsx
// Visualização fiel ao modelo SEMA-MT (SIGA AUTUAÇÃO), edição e citações legais
// ==============================================================================

import React, { useState, useEffect, useRef } from 'react';
import { 
  Printer, 
  RotateCcw, 
  Save, 
  Edit3, 
  Eye, 
  Scale, 
  Download, 
  ShieldCheck, 
  FileText,
  UserCheck
} from 'lucide-react';
import { InspectionData } from '../types/inspection';
import { generateAutoInspecaoData, AutoInspecaoGeneratedStructure } from '../utils/autoInspecaoGenerator';
import { DEFAULT_LEGAL_REFERENCES, LegalReferenceConfig } from '../config/legalReferences';

interface Props {
  data: InspectionData;
  onChange: (updater: (prev: InspectionData) => InspectionData) => void;
}

export const AutoInspecaoDocumentView: React.FC<Props> = ({ data, onChange }) => {
  const [activeTab, setActiveTab] = useState<'visual' | 'editor' | 'juridico'>('visual');
  const [legalRefs, setLegalRefs] = useState<Record<string, LegalReferenceConfig>>(DEFAULT_LEGAL_REFERENCES);
  const [editorText, setEditorText] = useState<string>('');
  const [editorAuthor, setEditorAuthor] = useState<string>(
    data.generalInfo.inspectors[0]?.name || 'Servidor Fiscalizador CSB'
  );
  const [lastSavedInfo, setLastSavedInfo] = useState<{ timestamp: string; author: string } | null>(null);
  const [confirmRestore, setConfirmRestore] = useState(false);
  const [saveFeedback, setSaveFeedback] = useState<string | null>(null);
  const timersRef = useRef<number[]>([]);

  useEffect(() => {
    return () => {
      timersRef.current.forEach(t => window.clearTimeout(t));
    };
  }, []);

  // Inicializar o texto base a partir dos dados do formulário
  const autoData: AutoInspecaoGeneratedStructure = generateAutoInspecaoData(data, legalRefs);

  useEffect(() => {
    if (data.drafts.inspectionNotice) {
      setEditorText(data.drafts.inspectionNotice);
    } else {
      setEditorText(autoData.textoCompletoFormatado);
    }
  }, [data.id]);

  const handleRestoreBase = () => {
    if (!confirmRestore) {
      setConfirmRestore(true);
      const t = window.setTimeout(() => setConfirmRestore(false), 4000);
      timersRef.current.push(t);
      return;
    }
    setConfirmRestore(false);
    const fresh = generateAutoInspecaoData(data, legalRefs);
    setEditorText(fresh.textoCompletoFormatado);
    onChange(prev => ({
      ...prev,
      drafts: {
        ...prev.drafts,
        inspectionNotice: fresh.textoCompletoFormatado
      }
    }));
  };

  const handleSaveFinal = () => {
    onChange(prev => ({
      ...prev,
      drafts: {
        ...prev.drafts,
        inspectionNotice: editorText
      }
    }));
    setLastSavedInfo({
      timestamp: new Date().toLocaleString('pt-BR'),
      author: editorAuthor
    });
    setSaveFeedback('Minuta do Auto de Inspeção salva e associada com sucesso ao registro da vistoria.');
    const t = window.setTimeout(() => setSaveFeedback(null), 4500);
    timersRef.current.push(t);
  };

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadTxt = () => {
    const filename = `AUTO_INSPECAO_SEMA_${data.damIdentification.damName || 'BARRAGEM'}_${data.generalInfo.inspectionDate || 'DATA'}.txt`;
    const blob = new Blob([editorText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const updateLegalRef = (id: string, text: string) => {
    setLegalRefs(prev => ({
      ...prev,
      [id]: {
        ...prev[id],
        conteudoTexto: text
      }
    }));
  };

  return (
    <div className="space-y-4">
      {/* Barra de Ferramentas Superior */}
      <div className="bg-slate-900 text-white rounded-xl p-4 shadow-sm flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-emerald-600 flex items-center justify-center font-bold text-white">
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-extrabold tracking-tight">
              Auto de Inspeção • SIGA AUTUAÇÃO (SEMA-MT)
            </h2>
            <p className="text-[11px] text-slate-300">
              Minuta oficial com diferenciação estrita de dados não informados e não observados
            </p>
          </div>
        </div>

        {/* Abas e Ações */}
        <div className="flex items-center flex-wrap gap-2 text-xs">
          <div className="inline-flex rounded-lg border border-slate-700 bg-slate-800 p-0.5">
            <button
              type="button"
              onClick={() => setActiveTab('visual')}
              className={`px-3 py-1.5 rounded-md font-semibold flex items-center gap-1.5 transition cursor-pointer ${
                activeTab === 'visual' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-300 hover:text-white'
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
              <span>Modelo SIGA</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('editor')}
              className={`px-3 py-1.5 rounded-md font-semibold flex items-center gap-1.5 transition cursor-pointer ${
                activeTab === 'editor' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-300 hover:text-white'
              }`}
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>Editor de Texto</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('juridico')}
              className={`px-3 py-1.5 rounded-md font-semibold flex items-center gap-1.5 transition cursor-pointer ${
                activeTab === 'juridico' ? 'bg-amber-600 text-white shadow-xs' : 'text-slate-300 hover:text-white'
              }`}
            >
              <Scale className="w-3.5 h-3.5" />
              <span>Citações Legais</span>
            </button>
          </div>

          <button
            type="button"
            onClick={handleRestoreBase}
            className={`px-3 py-1.5 rounded-lg border font-semibold flex items-center gap-1.5 cursor-pointer transition ${
              confirmRestore
                ? 'border-amber-500 bg-amber-600 hover:bg-amber-700 text-white'
                : 'border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200'
            }`}
            title="Restaura o texto gerado a partir do formulário de campo"
          >
            <RotateCcw className={`w-3.5 h-3.5 ${confirmRestore ? 'text-white' : 'text-slate-400'}`} />
            <span className={confirmRestore ? 'inline' : 'hidden sm:inline'}>
              {confirmRestore ? 'Confirmar Restauração?' : 'Restaurar Base'}
            </span>
          </button>

          <button
            type="button"
            onClick={handlePrint}
            className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold flex items-center gap-1.5 shadow-xs cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Imprimir / PDF</span>
          </button>
        </div>
      </div>

      {/* Identificação de Edição e Autoria */}
      <div className="bg-slate-50 border border-slate-200 px-4 py-2.5 rounded-xl text-xs flex flex-wrap items-center justify-between gap-2 print:hidden">
        <div className="flex items-center gap-2">
          <UserCheck className="w-4 h-4 text-emerald-600" />
          <span className="text-slate-600">Autoria da Revisão Técnica:</span>
          <input
            type="text"
            value={editorAuthor}
            onChange={e => setEditorAuthor(e.target.value)}
            className="px-2 py-1 rounded border border-slate-300 bg-white font-semibold text-slate-800 max-w-xs"
            placeholder="Nome do servidor responsável"
          />
        </div>

        <div className="flex items-center gap-3">
          {lastSavedInfo && (
            <span className="text-[11px] text-emerald-700 font-medium">
              Salvo em {lastSavedInfo.timestamp} por {lastSavedInfo.author}
            </span>
          )}
          <button
            type="button"
            onClick={handleSaveFinal}
            className="px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white font-semibold flex items-center gap-1.5 cursor-pointer"
          >
            <Save className="w-3.5 h-3.5" />
            <span>Salvar Versão Final da Minuta</span>
          </button>
        </div>
      </div>

      {saveFeedback && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-2 rounded-xl text-xs font-semibold print:hidden">
          {saveFeedback}
        </div>
      )}

      {/* ABA 1: MODELO VISUAL OFICIAL (SIGA AUTUAÇÃO SEMA-MT) */}
      {activeTab === 'visual' && (
        <div className="document-sheet-scroll rounded-xl print:overflow-visible">
        <div className="bg-white text-black p-4 xs:p-6 sm:p-10 rounded-xl border border-slate-300 shadow-sm printable-document font-sans text-xs leading-relaxed min-w-[600px] sm:min-w-0 max-w-4xl mx-auto">
          {/* Cabeçalho do Estado */}
          <div className="border border-black mb-3">
            <div className="grid grid-cols-12 border-b border-black text-center items-center p-2">
              <div className="col-span-2 font-bold text-center">
                <div className="w-12 h-12 mx-auto border border-black rounded-full flex items-center justify-center font-bold text-[10px]">
                  SEMA
                </div>
              </div>
              <div className="col-span-6 font-bold text-center uppercase">
                <p className="text-xs">Governo do Estado de Mato Grosso</p>
                <p className="text-[11px]">SEMA - Secretaria de Estado de Meio Ambiente</p>
              </div>
              <div className="col-span-2 border-l border-black p-1 text-[10px] font-bold">
                <p>Nº:</p>
                <p className="text-xs text-rose-800 font-mono">{autoData.numeroAuto}</p>
              </div>
              <div className="col-span-2 border-l border-black p-1 text-[10px] font-bold">
                <p>DATA:</p>
                <p className="text-xs font-mono">{autoData.dataEmissao}</p>
              </div>
            </div>

            <div className="bg-slate-100 text-center font-bold text-sm uppercase py-1 border-b border-black">
              AUTO DE INSPEÇÃO
            </div>

            {/* Identificação do Empreendedor */}
            <div className="grid grid-cols-12 text-[11px] divide-y divide-black">
              <div className="col-span-8 p-1.5 border-r border-black">
                <span className="font-bold block uppercase text-[10px]">Nome / Razão Social:</span>
                <span>{autoData.empreendedor.nomeRazaoSocial}</span>
              </div>
              <div className="col-span-4 p-1.5">
                <span className="font-bold block uppercase text-[10px]">CNPJ / CPF:</span>
                <span className="font-mono">{autoData.empreendedor.cpfCnpj}</span>
              </div>
            </div>

            <div className="p-1 bg-slate-50 border-t border-black font-bold uppercase text-[10px]">
              Endereço para Correspondências:
            </div>
            <div className="grid grid-cols-12 text-[11px] border-t border-black p-1.5 gap-2">
              <div className="col-span-12">
                <span className="font-semibold">{autoData.empreendedor.endereco}, {autoData.empreendedor.numero}</span>
              </div>
              <div className="col-span-2 font-semibold">UF: {autoData.empreendedor.uf}</div>
              <div className="col-span-4 font-semibold">Município: {autoData.empreendedor.municipio}</div>
              <div className="col-span-3 font-semibold">CEP: {autoData.empreendedor.cep}</div>
              <div className="col-span-3 font-semibold">Telefone: {autoData.empreendedor.telefone}</div>
            </div>

            {/* Local da Ocorrência */}
            <div className="p-1 bg-slate-100 border-t border-black font-bold uppercase text-[11px]">
              Local da Ocorrência
            </div>
            <div className="grid grid-cols-12 text-[11px] divide-y divide-black border-t border-black">
              <div className="col-span-8 p-1.5 border-r border-black">
                <span className="font-bold block uppercase text-[10px]">Nome Fantasia / Barramento:</span>
                <span>{autoData.localOcorrencia.nomeFantasia}</span>
              </div>
              <div className="col-span-4 p-1.5">
                <span className="font-bold block uppercase text-[10px]">Atividade:</span>
                <span>{autoData.localOcorrencia.atividade}</span>
              </div>
            </div>

            <div className="grid grid-cols-12 text-[11px] border-t border-black p-1.5">
              <div className="col-span-4 font-semibold">Datum: {autoData.localOcorrencia.datum}</div>
              <div className="col-span-4 font-semibold font-mono">Latitude (S): {autoData.localOcorrencia.latitudeGms}</div>
              <div className="col-span-4 font-semibold font-mono">Longitude (W): {autoData.localOcorrencia.longitudeGms}</div>
            </div>

            <div className="grid grid-cols-12 text-[11px] border-t border-black p-1.5 gap-2">
              <div className="col-span-3 font-semibold">Município: {autoData.localOcorrencia.municipio}</div>
              <div className="col-span-3 font-semibold">Telefone: {autoData.localOcorrencia.telefone}</div>
              <div className="col-span-6 font-semibold font-mono">Nº do Processo: {autoData.localOcorrencia.numeroProcesso}</div>
            </div>
          </div>

          {/* 1. OBJETIVO */}
          <div className="mb-4">
            <h3 className="font-bold text-xs uppercase mb-1 border-b border-black pb-0.5">
              1. OBJETIVO:
            </h3>
            <p className="whitespace-pre-wrap leading-relaxed text-justify">
              {autoData.objetivoTexto}
            </p>
          </div>

          {/* 3. CARACTERÍSTICAS PRINCIPAIS DO BARRAMENTO */}
          <div className="mb-4">
            <h3 className="font-bold text-xs uppercase mb-1 border-b border-black pb-0.5">
              3. CARACTERÍSTICAS PRINCIPAIS DO BARRAMENTO
            </h3>
            <p className="font-bold text-[11px] mb-1">3.1 Informações obtidas em vistoria:</p>
            <ul className="list-disc pl-5 space-y-0.5 text-[11px]">
              <li>Altura do talude: <strong>{autoData.caracteristicasPrincipais.alturaTalude}</strong></li>
              <li>Comprimento da crista: <strong>{autoData.caracteristicasPrincipais.comprimento}</strong></li>
              <li>Largura do coroamento: <strong>{autoData.caracteristicasPrincipais.larguraCoroamento}</strong></li>
              <li>Volume total aproximado: <strong>{autoData.caracteristicasPrincipais.volumeTotal}</strong></li>
              <li>Área de inundação estimada: <strong>{autoData.caracteristicasPrincipais.areaInundacao}</strong></li>
              <li>Capacidade / Tipo do vertedouro: <strong>{autoData.caracteristicasPrincipais.capacidadeVertedouro}</strong></li>
              <li>Material utilizado: <strong>{autoData.caracteristicasPrincipais.materialUtilizado}</strong></li>
              <li>Uso da água: <strong>{autoData.caracteristicasPrincipais.usoAgua}</strong></li>
              <li>Código SNISB: <strong>{autoData.caracteristicasPrincipais.codigoSnisb}</strong></li>
            </ul>
          </div>

          {/* 4. CONSTATAÇÕES POR COMPONENTE */}
          <div className="mb-4 space-y-3">
            <h3 className="font-bold text-xs uppercase mb-1 border-b border-black pb-0.5">
              4. CONSTATAÇÕES
            </h3>

            <div>
              <h4 className="font-bold text-[11px]">4.1 Usos e características técnicas</h4>
              <p className="text-justify whitespace-pre-wrap">{autoData.constatacoesPorComponente.usosECaracteristicas}</p>
            </div>

            <div>
              <h4 className="font-bold text-[11px]">4.2 Talude de montante</h4>
              <p className="text-justify whitespace-pre-wrap">{autoData.constatacoesPorComponente.taludeMontante}</p>
            </div>

            <div>
              <h4 className="font-bold text-[11px]">4.3 Coroamento</h4>
              <p className="text-justify whitespace-pre-wrap">{autoData.constatacoesPorComponente.coroamento}</p>
            </div>

            <div>
              <h4 className="font-bold text-[11px]">4.4 Talude de jusante</h4>
              <p className="text-justify whitespace-pre-wrap">{autoData.constatacoesPorComponente.taludeJusante}</p>
            </div>

            <div>
              <h4 className="font-bold text-[11px]">4.5 Região à jusante da barragem (Faixa de 10m)</h4>
              <p className="text-justify whitespace-pre-wrap">{autoData.constatacoesPorComponente.regiaoJusante}</p>
            </div>

            <div>
              <h4 className="font-bold text-[11px]">4.6 Instrumentação e monitoramento</h4>
              <p className="text-justify whitespace-pre-wrap">{autoData.constatacoesPorComponente.instrumentacao}</p>
            </div>

            <div>
              <h4 className="font-bold text-[11px]">4.7 Estruturas extravasoras</h4>
              <p className="text-justify whitespace-pre-wrap">{autoData.constatacoesPorComponente.estruturasExtravasoras}</p>
            </div>

            <div>
              <h4 className="font-bold text-[11px]">4.8 Reservatório</h4>
              <p className="text-justify whitespace-pre-wrap">{autoData.constatacoesPorComponente.reservatorio}</p>
            </div>
          </div>

          {/* 5. CONSIDERAÇÕES E OBSERVAÇÕES GERAIS */}
          <div className="mb-4">
            <h3 className="font-bold text-xs uppercase mb-1 border-b border-black pb-0.5">
              5. CONSIDERAÇÕES E OBSERVAÇÕES GERAIS
            </h3>
            <p className="whitespace-pre-wrap text-justify">{autoData.consideracoesGerais}</p>
          </div>

          {/* 6. PRINCIPAIS ANOMALIAS OBSERVADAS */}
          <div className="mb-4">
            <h3 className="font-bold text-xs uppercase mb-1 border-b border-black pb-0.5">
              6. PRINCIPAIS ANOMALIAS OBSERVADAS
            </h3>
            <p className="text-justify italic mb-2">
              {autoData.citacaoLegalAnomalias}
            </p>
            {autoData.anomaliasObservadas.length > 0 ? (
              <ol className="list-decimal pl-5 space-y-1 font-semibold text-rose-950">
                {autoData.anomaliasObservadas.map((anomalia, idx) => (
                  <li key={idx}>{anomalia}</li>
                ))}
              </ol>
            ) : (
              <p className="italic">Não foram constatadas anomalias visuais severas no momento da vistoria.</p>
            )}
          </div>

          {/* 7. CONCLUSÃO */}
          <div className="mb-6">
            <h3 className="font-bold text-xs uppercase mb-1 border-b border-black pb-0.5">
              7. CONCLUSÃO
            </h3>
            <p className="whitespace-pre-wrap text-justify leading-relaxed">
              {autoData.conclusaoTexto}
            </p>
          </div>

          {/* ASSINATURAS DA EQUIPE */}
          <div className="mt-8 pt-4 border-t border-black">
            <p className="font-bold text-[11px] uppercase mb-4 text-center">EQUIPE DE FISCALIZAÇÃO CSB / SEMA-MT:</p>
            <div className="grid grid-cols-2 gap-8 text-center text-[10px]">
              {autoData.equipeFiscalizacao.map((fiscal, idx) => (
                <div key={idx} className="space-y-1">
                  <div className="border-b border-black w-4/5 mx-auto"></div>
                  <p className="font-bold">{fiscal.nome}</p>
                  <p>{fiscal.cargo} • Matrícula: {fiscal.matricula}</p>
                </div>
              ))}
            </div>
          </div>

          {/* CONFIRMAÇÃO DE RECEBIMENTO */}
          <div className="mt-8 border border-black p-3 text-[10px]">
            <p className="font-bold uppercase text-[11px] mb-2">Confirmação de Recebimento:</p>
            <div className="grid grid-cols-2 gap-2 mb-2">
              <div><strong>Nome do Responsável:</strong> {autoData.confirmacaoRecebimento.nomeResponsavel}</div>
              <div><strong>CPF/RG:</strong> {autoData.confirmacaoRecebimento.documento}</div>
              <div><strong>Vínculo/Cargo:</strong> {autoData.confirmacaoRecebimento.cargo}</div>
              <div><strong>Local e Data:</strong> {autoData.confirmacaoRecebimento.localData}</div>
            </div>
            <div className="pt-3 border-t border-black flex justify-between items-center">
              <span>Assinatura: _____________________________________________</span>
              <label className="flex items-center gap-1.5 font-bold cursor-pointer">
                <input type="checkbox" className="w-3.5 h-3.5" />
                <span>Recusou-se a assinar</span>
              </label>
            </div>
          </div>

          {/* Rodapé SIGA */}
          <div className="mt-6 pt-2 border-t border-slate-300 flex justify-between text-[9px] text-slate-500">
            <span>Versão do sistema: {autoData.versaoSistema}</span>
            <span>Auto de Inspeção Nº {autoData.numeroAuto}</span>
            <span>SIGA AUTUAÇÃO • SEMA-MT</span>
          </div>
        </div>
        </div>
      )}

      {/* ABA 2: EDITOR LIVRE DE TEXTO */}
      {activeTab === 'editor' && (
        <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-5 shadow-xs space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div>
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                Edição Integral da Minuta do Auto de Inspeção
              </h3>
              <p className="text-[11px] text-slate-500">
                Ajuste os textos, complemente fundamentações e personalize observações antes de finalizar.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleDownloadTxt}
                className="px-3 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-slate-500" />
                <span>Baixar .TXT</span>
              </button>
            </div>
          </div>

          <textarea
            rows={26}
            value={editorText}
            onChange={e => setEditorText(e.target.value)}
            className="w-full font-mono text-xs sm:text-sm p-4 border border-slate-300 rounded-lg bg-slate-50/40 leading-relaxed focus:ring-2 focus:ring-emerald-500 focus:outline-none"
          />
        </div>
      )}

      {/* ABA 3: CONFIGURAÇÃO DE CITAÇÕES LEGAIS (CSB & JURÍDICO) */}
      {activeTab === 'juridico' && (
        <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-5 shadow-xs space-y-5">
          <div className="border-b border-slate-100 pb-3">
            <h3 className="text-xs sm:text-sm font-bold text-slate-800 uppercase tracking-wide flex items-center gap-2">
              <Scale className="w-4 h-4 text-amber-600" />
              <span>Referências Legais Configuráveis do Auto de Inspeção</span>
            </h3>
            <p className="text-xs text-slate-600 mt-1">
              Conforme determinação, os textos de citações legais permanecem configuráveis e parametrizáveis para aprovação formal da Coordenadoria de Segurança de Barragens (CSB) e da área jurídica da SEMA-MT.
            </p>
          </div>

          <div className="space-y-4">
            {Object.values(legalRefs).map(ref => (
              <div key={ref.id} className="p-4 rounded-xl border border-slate-200 bg-slate-50/60 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-xs text-slate-800">{ref.titulo}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-semibold">
                      {ref.dispositivoLegal}
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-500">Editável pelo fiscal</span>
                </div>

                <textarea
                  rows={4}
                  value={ref.conteudoTexto}
                  onChange={e => updateLegalRef(ref.id, e.target.value)}
                  className="w-full text-xs p-3 border border-slate-300 rounded-lg bg-white focus:ring-1 focus:ring-emerald-500"
                />
              </div>
            ))}
          </div>

          <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>
              Qualquer alteração efetuada nos blocos acima reflete imediatamente na recomposição da minuta visual e impressa do Auto de Inspeção.
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
