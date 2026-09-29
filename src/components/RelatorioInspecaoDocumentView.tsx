// ==============================================================================
// ARQUIVO: src/components/RelatorioInspecaoDocumentView.tsx
// Visualização fiel ao modelo aprovado pela CSB/SEMA-MT
// - Folha de Rosto SIGAMT
// - Relatório Técnico de Inspeção com fotos inseridas por componente
// - Omissão estrita de campos em branco (nunca converte em "N/A")
// - Seção 6 de Anomalias com componente, item, observação e classificação
//   (omite a seção se não houver anomalias registradas)
// - Editor de texto livre, restauração da minuta-base e exportação
// ==============================================================================

import React, { useState, useEffect } from 'react';
import { 
  FileCheck2, 
  RotateCcw, 
  Save, 
  Edit3, 
  Eye, 
  Printer, 
  Download, 
  Copy, 
  Check, 
  AlertTriangle, 
  CheckCircle2, 
  Building2, 
  Camera, 
  MapPin, 
  Clock, 
  Layers, 
  ShieldCheck,
  FileText
} from 'lucide-react';
import { InspectionData } from '../types/inspection';
import { generateRelatorioInspecaoData, RelatorioInspecaoGeneratedStructure } from '../utils/relatorioInspecaoGenerator';

interface Props {
  data: InspectionData;
  onChange: (updater: (prev: InspectionData) => InspectionData) => void;
}

export const RelatorioInspecaoDocumentView: React.FC<Props> = ({ data, onChange }) => {
  const [activeTab, setActiveTab] = useState<'relatorio_completo' | 'folha_rosto' | 'editor'>('relatorio_completo');
  const [editorText, setEditorText] = useState<string>('');
  const [editorAuthor, setEditorAuthor] = useState<string>(
    data.generalInfo.inspectors[0]?.name || 'Servidor Fiscalizador CSB'
  );
  const [lastSavedInfo, setLastSavedInfo] = useState<{ timestamp: string; author: string } | null>(null);
  const [copyFeedback, setCopyFeedback] = useState(false);

  // Gera dados estruturados fiéis ao modelo
  const report: RelatorioInspecaoGeneratedStructure = generateRelatorioInspecaoData(data);

  // Inicializa o texto no editor
  useEffect(() => {
    if (data.drafts.technicalReport && data.drafts.technicalReport.trim() !== '') {
      setEditorText(data.drafts.technicalReport);
    } else {
      setEditorText(report.textoCompletoFormatado);
    }
  }, [data.id]);

  const handleRestoreBase = () => {
    if (confirm('Deseja recarregar o texto-base do Relatório de Inspeção a partir dos dados atuais do formulário? Edições manuais não salvas no editor serão descartadas.')) {
      const fresh = generateRelatorioInspecaoData(data);
      setEditorText(fresh.textoCompletoFormatado);
      onChange(prev => ({
        ...prev,
        drafts: {
          ...prev.drafts,
          technicalReport: fresh.textoCompletoFormatado
        }
      }));
    }
  };

  const handleSaveFinal = () => {
    const nowStr = new Date().toLocaleString('pt-BR');
    onChange(prev => ({
      ...prev,
      drafts: {
        ...prev.drafts,
        technicalReport: editorText
      }
    }));

    setLastSavedInfo({
      timestamp: nowStr,
      author: editorAuthor
    });
    alert('Minuta do Relatório de Inspeção salva e associada com sucesso ao registro da vistoria!');
  };

  const handlePrint = () => {
    window.print();
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(editorText);
    setCopyFeedback(true);
    setTimeout(() => setCopyFeedback(false), 2000);
  };

  const handleDownloadTxt = () => {
    const filename = `RELATORIO_INSPECAO_CSB_${data.damIdentification.damName || 'BARRAGEM'}_${report.numeroRelatorio}.txt`;
    const blob = new Blob([editorText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Barra de Status e Controles Superiores */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs print:hidden">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-900 border border-emerald-300">
                <FileCheck2 className="w-3 h-3 text-emerald-700" />
                Modelo Oficial CSB / SEMA-MT
              </span>
              <span className="text-xs text-slate-500 font-mono">
                {report.numeroRelatorio}
              </span>
            </div>
            <h2 className="text-base sm:text-lg font-black text-slate-900 mt-1">
              Relatório de Inspeção – Segurança de Barragem
            </h2>
          </div>

          {/* Botões de Ação */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleRestoreBase}
              className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-100 font-medium transition flex items-center gap-1.5 cursor-pointer"
              title="Restaurar dados do formulário"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Restaurar Base</span>
            </button>

            <button
              type="button"
              onClick={handleCopy}
              className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-100 font-medium transition flex items-center gap-1.5 cursor-pointer"
            >
              {copyFeedback ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copyFeedback ? 'Copiado!' : 'Copiar'}</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadTxt}
              className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-100 font-medium transition flex items-center gap-1.5 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Baixar .TXT</span>
            </button>

            <button
              type="button"
              onClick={handlePrint}
              className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-100 font-medium transition flex items-center gap-1.5 cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Imprimir / PDF</span>
            </button>

            <button
              type="button"
              onClick={handleSaveFinal}
              className="text-xs px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold transition flex items-center gap-1.5 shadow-xs cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Salvar Minuta</span>
            </button>
          </div>
        </div>

        {/* Abas de Navegação Interna */}
        <div className="flex border-b border-slate-200 mt-4 gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('relatorio_completo')}
            className={`flex items-center gap-2 pb-2.5 px-3 text-xs sm:text-sm font-bold border-b-2 transition cursor-pointer ${
              activeTab === 'relatorio_completo'
                ? 'border-emerald-600 text-emerald-800'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Eye className="w-4 h-4" />
            <span>Relatório Completo com Fotos</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-100 text-slate-700 font-normal">
              {report.todasFotosComFigura.length} foto(s)
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('folha_rosto')}
            className={`flex items-center gap-2 pb-2.5 px-3 text-xs sm:text-sm font-bold border-b-2 transition cursor-pointer ${
              activeTab === 'folha_rosto'
                ? 'border-emerald-600 text-emerald-800'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>Folha de Rosto (SIGAMT)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('editor')}
            className={`flex items-center gap-2 pb-2.5 px-3 text-xs sm:text-sm font-bold border-b-2 transition cursor-pointer ${
              activeTab === 'editor'
                ? 'border-emerald-600 text-emerald-800'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Edit3 className="w-4 h-4" />
            <span>Editor de Texto da Minuta</span>
          </button>
        </div>
      </div>

      {/* Alerta de Auditoria / Último Salvamento */}
      {lastSavedInfo && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2.5 text-xs text-emerald-800 flex items-center justify-between print:hidden">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>
              Última versão salva e associada à vistoria em <strong>{lastSavedInfo.timestamp}</strong> por <strong>{lastSavedInfo.author}</strong>.
            </span>
          </div>
          <span className="text-[11px] text-emerald-700">Rastreabilidade CSB/SEMA</span>
        </div>
      )}

      {/* ========================================================================= */}
      {/* ABA 1: RELATÓRIO COMPLETO COM FOTOS (ESTRUTURA OFICIAL CSB)               */}
      {/* ========================================================================= */}
      {activeTab === 'relatorio_completo' && (
        <div className="bg-white border border-slate-300 shadow-md p-6 sm:p-12 font-sans text-slate-900 space-y-8 max-w-4xl mx-auto rounded-lg">
          {/* Cabeçalho Oficial do Relatório */}
          <div className="flex flex-col items-center justify-center text-center border-b border-slate-300 pb-4">
            <div className="w-12 h-12 mb-2 flex items-center justify-center text-slate-800">
              <Building2 className="w-10 h-10 text-slate-800" />
            </div>
            <h1 className="text-xs sm:text-sm font-bold tracking-tight uppercase text-black">
              Governo do Estado de Mato Grosso
            </h1>
            <h2 className="text-xs font-semibold text-slate-800 uppercase">
              SEMA – Secretaria de Estado de Meio Ambiente
            </h2>
            <h3 className="text-[11px] text-slate-600">
              Secretaria Adjunta de Licenciamento e Recursos Hídricos - SALARH
            </h3>
            <h3 className="text-[11px] text-slate-600">
              Coordenadoria de Controle de Recursos Hídricos - CCRH
            </h3>
            <h3 className="text-[11px] font-bold text-slate-800">
              Coordenadoria de Segurança de Barragem - CSB
            </h3>
            <div className="text-[10px] text-slate-500 mt-1 border-t border-slate-200 pt-1 font-mono">
              Rua C esquina com rua F, Centro Político Administrativo • CEP: 78.049-913 • Cuiabá • Mato Grosso • www.sema.mt.gov.br
            </div>
          </div>

          {/* TÍTULO PRINCIPAL DO RELATÓRIO */}
          <div className="text-center py-2">
            <h2 className="text-base sm:text-lg font-black tracking-wide text-black uppercase">
              RELATÓRIO DE INSPEÇÃO - SEGURANÇA DE BARRAGEM
            </h2>
          </div>

          {/* 1. DADOS GERAIS */}
          <div className="space-y-2">
            <h3 className="text-sm font-bold uppercase tracking-wide text-black border-b border-slate-200 pb-1">
              1. DADOS GERAIS
            </h3>
            <div className="text-xs leading-relaxed space-y-1 pl-2">
              <p><strong>Empreendedor/Proprietário:</strong> {report.dadosGerais.empreendedorNome}</p>
              <p><strong>CPF/CNPJ:</strong> {report.dadosGerais.cpfCnpj}</p>
              {report.dadosGerais.coordenadasTexto && (
                <p><strong>Coordenadas:</strong> {report.dadosGerais.coordenadasTexto}</p>
              )}
              <p><strong>Endereço:</strong> {report.dadosGerais.enderecoEmpreendimento}</p>
              <p><strong>Endereço para correspondência:</strong> {report.dadosGerais.enderecoCorrespondencia}</p>
              {report.dadosGerais.email && (
                <p><strong>E-mail:</strong> {report.dadosGerais.email}</p>
              )}
              {report.dadosGerais.telefone && (
                <p><strong>Telefone:</strong> {report.dadosGerais.telefone}</p>
              )}
              <p><strong>Atividade (uso da barragem):</strong> <span className="underline font-bold">{report.dadosGerais.atividadeUso}</span></p>
              {report.dadosGerais.corpoDagua && (
                <p><strong>Corpo d’agua utilizado:</strong> {report.dadosGerais.corpoDagua};</p>
              )}
              <p><strong>Equipe técnica:</strong> {report.dadosGerais.equipeTecnicaStr}</p>
              <p><strong>Data da vistoria:</strong> {report.dadosGerais.dataVistoria}.</p>
            </div>
          </div>

          {/* 2. INTRODUÇÃO */}
          <div className="space-y-2">
            <h3 className="text-sm font-bold uppercase tracking-wide text-black border-b border-slate-200 pb-1">
              2. INTRODUÇÃO
            </h3>
            <div className="text-xs leading-relaxed text-justify space-y-2 pl-2">
              <p>
                A partir da Lei Federal nº 12.334/2010, foi estabelecida a Política Nacional de Segurança de 
                Barragens destinadas à acumulação de água para quaisquer usos, à disposição final ou temporária de 
                rejeitos e à acumulação de resíduos industriais, que enquadra e regula, barragens que apresentem pelo 
                menos uma das características definidas no art. 1º da Lei ou que apresentem alguma característica de 
                CRI alto, conforme classificação do órgão fiscalizatório.
              </p>
              <p>
                Foi realizada uma vistoria técnica, dia {report.dataVistoriaFormatada}, {report.constatacoesGeraisIntro.includes('sem relato') ? 'sem relato de chuva' : 'conforme condições meteorológicas registradas'}, 
                no barramento localizado no município de {data.damIdentification.municipality || 'Mato Grosso'}/MT.
              </p>
            </div>
          </div>

          {/* 3. CARACTERÍSTICAS PRINCIPAIS DO BARRAMENTO (OMITE CAMPOS VAZIOS, NUNCA GERA N/A) */}
          <div className="space-y-2">
            <h3 className="text-sm font-bold uppercase tracking-wide text-black border-b border-slate-200 pb-1">
              3. CARACTERÍSTICAS PRINCIPAIS DO BARRAMENTO
            </h3>
            <div className="text-xs leading-relaxed space-y-1.5 pl-2">
              <h4 className="font-bold text-slate-800">3.1 Informações gerais:</h4>
              {report.caracteristicasGeraisLinhas.length > 0 ? (
                <ul className="space-y-1 pl-2">
                  {report.caracteristicasGeraisLinhas.map((item, idx) => (
                    <li key={idx} className="flex items-baseline gap-2">
                      <span className="text-slate-700">- {item.rotulo}:</span>
                      <strong className="text-black">{item.valor}</strong>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-slate-500 italic pl-2">
                  (Dados de dimensões não informados na inspeção)
                </p>
              )}
            </div>
          </div>

          {/* 4. CONSTATAÇÕES */}
          <div className="space-y-6">
            <h3 className="text-sm font-bold uppercase tracking-wide text-black border-b border-slate-200 pb-1">
              4. CONSTATAÇÕES
            </h3>
            <p className="text-xs text-justify leading-relaxed pl-2">
              {report.constatacoesGeraisIntro}
            </p>

            {/* Subseções dos Componentes */}
            {report.secoesComponentes.map((secao) => (
              <div key={secao.id} className="space-y-3 pl-2">
                <h4 className="text-xs font-bold text-black uppercase tracking-wide">
                  {secao.numeroSecao} {secao.titulo}
                </h4>

                <p className="text-xs text-justify leading-relaxed text-slate-800">
                  {secao.descricaoTexto}
                </p>

                {/* Exibição de Anomalias observadas no componente */}
                {secao.itensConstatados && secao.itensConstatados.length > 0 && (
                  <div className="bg-amber-50/60 border-l-2 border-amber-500 p-2 text-xs text-amber-950">
                    <span className="font-bold block mb-0.5">Constatações fáticas no componente:</span>
                    <ul className="list-disc list-inside space-y-0.5 text-[11px]">
                      {secao.itensConstatados.map((it, idx) => (
                        <li key={idx}>{it}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Fotos Associadas ao Componente com Numeração Sequencial */}
                {secao.fotosVinculadas && secao.fotosVinculadas.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                    {secao.fotosVinculadas.map((foto) => (
                      <div key={foto.id} className="border border-slate-300 rounded-lg overflow-hidden bg-slate-50 shadow-xs">
                        {/* Imagem */}
                        <div className="relative aspect-4/3 bg-slate-200">
                          <img
                            src={foto.dataUrl}
                            alt={foto.caption || foto.componentName}
                            className="w-full h-full object-cover"
                          />
                          {/* Carimbo de dados de captura na foto */}
                          <div className="absolute top-1 right-1 bg-black/75 text-white text-[9px] p-1.5 rounded font-mono leading-tight text-right backdrop-blur-xs">
                            <div>{foto.timestamp ? new Date(foto.timestamp).toLocaleString('pt-BR') : report.dataVistoriaFormatada}</div>
                            {foto.latitude && foto.longitude ? (
                              <div>{foto.latitude.toFixed(5)}°, {foto.longitude.toFixed(5)}°</div>
                            ) : null}
                            <div>{data.damIdentification.municipality || 'MT'}</div>
                          </div>
                        </div>
                        {/* Legenda Oficial (Figura X – ...) */}
                        <div className="p-2 text-center text-xs font-semibold text-slate-900 border-t border-slate-200 bg-white">
                          Figura {foto.figuraNumero} – {foto.caption || foto.componentName || 'Vista do componente'}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* 5. CONSIDERAÇÕES E OBSERVAÇÕES GERAIS */}
          <div className="space-y-2">
            <h3 className="text-sm font-bold uppercase tracking-wide text-black border-b border-slate-200 pb-1">
              5. CONSIDERAÇÕES E OBSERVAÇÕES GERAIS
            </h3>
            <div className="text-xs leading-relaxed text-justify space-y-2 pl-2 text-slate-800">
              <p>{report.consideracoesGeraisTexto}</p>
            </div>
          </div>

          {/* 6. PRINCIPAIS ANOMALIAS OBSERVADAS (NÃO PRODUZ SEÇÃO SE VAZIA) */}
          {report.possuiAnomalias ? (
            <div className="space-y-3">
              <h3 className="text-sm font-bold uppercase tracking-wide text-black border-b border-slate-200 pb-1 flex items-center justify-between">
                <span>6. PRINCIPAIS ANOMALIAS OBSERVADAS</span>
                <span className="text-[11px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded border border-amber-300">
                  {report.anomaliasValidadas.length} anomalia(s) validada(s)
                </span>
              </h3>
              <p className="text-xs text-justify leading-relaxed pl-2 text-slate-800">
                Em atenção ao disposto no §3º, do art. 7, da Lei nº 14.066, de 30 de setembro de 2020, o 
                empreendedor deverá promover medidas e intervenções para reparações imediatas quanto às 
                anomalias verificadas que levem à redução do risco associado a barragem, de forma a promover 
                melhorias na segurança da barragem. Assim, segue a relação das principais anomalias constatadas:
              </p>
              <div className="space-y-2 pl-4">
                {report.anomaliasValidadas.map((anom) => (
                  <div key={anom.numero} className="text-xs leading-snug border-l-2 border-red-500 pl-2 py-0.5">
                    <p className="font-bold text-slate-900">
                      {anom.numero}. {anom.componenteNome}
                      {anom.itemAvaliado ? ` – ${anom.itemAvaliado}` : ''}:
                    </p>
                    <p className="text-slate-700 mt-0.5">{anom.observacao}</p>
                    {anom.nivelSeveridade && (
                      <span className={`inline-block mt-1 text-[10px] font-bold px-1.5 py-0.2 rounded uppercase ${
                        anom.nivelSeveridade === 'Crítico' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'
                      }`}>
                        Nível: {anom.nivelSeveridade}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="bg-emerald-50/70 border border-emerald-200 rounded-lg p-3 text-xs text-emerald-900 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>
                <strong>Sem anomalias críticas registradas:</strong> Durante a inspeção visual de campo não foram constatadas anomalias com nível de alerta ou crítico nos componentes avaliados. A seção 6 é omitida no texto oficial.
              </span>
            </div>
          )}

          {/* 7. CONCLUSÃO */}
          <div className="space-y-2">
            <h3 className="text-sm font-bold uppercase tracking-wide text-black border-b border-slate-200 pb-1">
              7. CONCLUSÃO
            </h3>
            <div className="text-xs leading-relaxed text-justify space-y-2 pl-2 text-slate-800">
              <p>{report.conclusaoTexto}</p>
            </div>
          </div>

          {/* FORMALIZAÇÃO / EQUIPE TÉCNICA */}
          <div className="pt-8 space-y-6">
            <span className="text-[10px] uppercase font-bold text-slate-600 block text-center">
              EQUIPE TÉCNICA DE FISCALIZAÇÃO RESPONSÁVEL (CSB/SEMA-MT):
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 pt-4">
              {report.equipeTecnica.map((eq, idx) => (
                <div key={idx} className="text-center space-y-1">
                  <div className="border-b border-black w-4/5 mx-auto pb-0.5">
                    <span className="text-xs font-bold text-black">{eq.nome}</span>
                  </div>
                  <span className="text-[10px] uppercase text-slate-700 font-semibold block">{eq.cargo}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* ABA 2: FOLHA DE ROSTO SIGAMT (CONFERÊNCIA DA CAPA OFICIAL)                */}
      {/* ========================================================================= */}
      {activeTab === 'folha_rosto' && (
        <div className="bg-white border border-slate-300 shadow-md p-6 sm:p-10 font-sans text-slate-900 space-y-4 max-w-4xl mx-auto rounded-lg">
          {/* Cabeçalho Oficial SIGAMT */}
          <div className="flex flex-col items-center justify-center text-center border-b border-slate-300 pb-3">
            <div className="w-10 h-10 mb-1 flex items-center justify-center text-slate-700">
              <Building2 className="w-8 h-8 text-slate-800" />
            </div>
            <h1 className="text-xs font-bold uppercase text-slate-800">SEMA - SECRETARIA DE ESTADO DE MEIO AMBIENTE</h1>
            <h2 className="text-sm font-extrabold uppercase text-black">GOVERNO DO ESTADO DE MATO GROSSO</h2>
          </div>

          {/* Caixa Título RELATÓRIO TÉCNICO | Nº | DATA */}
          <div className="grid grid-cols-12 border-2 border-black divide-x-2 divide-black text-center font-bold">
            <div className="col-span-7 py-2.5 text-base sm:text-lg tracking-wider uppercase flex items-center justify-center">
              RELATÓRIO TÉCNICO
            </div>
            <div className="col-span-3 py-1 flex flex-col justify-center">
              <span className="text-[9px] uppercase font-bold text-slate-600">Nº:</span>
              <span className="text-xs sm:text-sm font-extrabold text-black">{report.folhaRostoSigamt.numeroRelatorioTecnico}</span>
            </div>
            <div className="col-span-2 py-1 flex flex-col justify-center">
              <span className="text-[9px] uppercase font-bold text-slate-600">DATA:</span>
              <span className="text-xs font-extrabold text-black">{report.folhaRostoSigamt.dataEmissao}</span>
            </div>
          </div>

          {/* Bloco 1: Notificado / Correspondência */}
          <div className="border border-black text-[11px] leading-tight divide-y divide-black">
            <div className="grid grid-cols-12 divide-x divide-black p-1 bg-slate-50">
              <div className="col-span-8 px-1.5 py-0.5">
                <span className="block font-bold text-[9px] uppercase text-slate-600">NOME / RAZÃO SOCIAL:</span>
                <span className="font-bold text-black">{report.folhaRostoSigamt.nomeRazaoSocial}</span>
              </div>
              <div className="col-span-4 px-1.5 py-0.5">
                <span className="block font-bold text-[9px] uppercase text-slate-600">CNPJ / CPF:</span>
                <span className="font-bold text-black">{report.folhaRostoSigamt.cpfCnpj}</span>
              </div>
            </div>

            <div className="p-1 px-1.5 font-bold uppercase text-[9px] text-slate-700 bg-slate-100">
              ENDEREÇO PARA CORRESPONDÊNCIAS:
            </div>
            <div className="p-1 px-1.5">
              {report.folhaRostoSigamt.enderecoCorrespondencia}
            </div>

            <div className="grid grid-cols-12 divide-x divide-black p-1 text-[10px]">
              <div className="col-span-3 px-1.5 py-0.5">
                <span className="block font-bold text-[9px] text-slate-600 uppercase">NÚMERO:</span>
                <span>{report.folhaRostoSigamt.numero}</span>
              </div>
              <div className="col-span-5 px-1.5 py-0.5">
                <span className="block font-bold text-[9px] text-slate-600 uppercase">COMPLEMENTO:</span>
                <span>{report.folhaRostoSigamt.complemento}</span>
              </div>
              <div className="col-span-4 px-1.5 py-0.5">
                <span className="block font-bold text-[9px] text-slate-600 uppercase">BAIRRO:</span>
                <span>{report.folhaRostoSigamt.bairro}</span>
              </div>
            </div>

            <div className="grid grid-cols-12 divide-x divide-black p-1 text-[10px]">
              <div className="col-span-2 px-1.5 py-0.5">
                <span className="block font-bold text-[9px] text-slate-600 uppercase">UF:</span>
                <span>{report.folhaRostoSigamt.uf}</span>
              </div>
              <div className="col-span-4 px-1.5 py-0.5">
                <span className="block font-bold text-[9px] text-slate-600 uppercase">MUNICÍPIO:</span>
                <span className="font-bold">{report.folhaRostoSigamt.municipio}</span>
              </div>
              <div className="col-span-3 px-1.5 py-0.5">
                <span className="block font-bold text-[9px] text-slate-600 uppercase">CEP:</span>
                <span>{report.folhaRostoSigamt.cep}</span>
              </div>
              <div className="col-span-3 px-1.5 py-0.5">
                <span className="block font-bold text-[9px] text-slate-600 uppercase">TELEFONE:</span>
                <span>{report.folhaRostoSigamt.telefone}</span>
              </div>
            </div>
          </div>

          {/* Bloco 2: Local da Ocorrência */}
          <div className="border border-black text-[11px] leading-tight divide-y divide-black">
            <div className="grid grid-cols-12 divide-x divide-black p-1">
              <div className="col-span-8 px-1.5 py-0.5">
                <span className="block font-bold text-[9px] uppercase text-slate-600">NOME FANTASIA:</span>
                <span className="font-bold">{report.folhaRostoSigamt.nomeFantasia}</span>
              </div>
              <div className="col-span-4 px-1.5 py-0.5">
                <span className="block font-bold text-[9px] uppercase text-slate-600">ATIVIDADE:</span>
                <span className="font-bold">{report.folhaRostoSigamt.atividade}</span>
              </div>
            </div>

            <div className="grid grid-cols-12 divide-x divide-black p-1 text-[10px]">
              <div className="col-span-4 px-1.5 py-0.5">
                <span className="block font-bold text-[9px] uppercase text-slate-600">COORDENADAS GEOGRÁFICAS:</span>
                <span>{report.folhaRostoSigamt.coordenadasDatum}</span>
              </div>
              <div className="col-span-4 px-1.5 py-0.5">
                <span className="block font-bold text-[9px] uppercase text-slate-600">LATITUDE:</span>
                <span className="font-mono">{report.folhaRostoSigamt.latitudeDecimal}</span>
              </div>
              <div className="col-span-4 px-1.5 py-0.5">
                <span className="block font-bold text-[9px] uppercase text-slate-600">LONGITUDE:</span>
                <span className="font-mono">{report.folhaRostoSigamt.longitudeDecimal}</span>
              </div>
            </div>

            <div className="grid grid-cols-12 divide-x divide-black p-1">
              <div className="col-span-8 px-1.5 py-0.5">
                <span className="block font-bold text-[9px] uppercase text-slate-600">ENDEREÇO DO EMPREENDIMENTO:</span>
                <span>{report.folhaRostoSigamt.enderecoEmpreendimento}</span>
              </div>
              <div className="col-span-4 px-1.5 py-0.5">
                <span className="block font-bold text-[9px] uppercase text-slate-600">ÁREA DO EMPREENDIMENTO:</span>
                <span>{report.folhaRostoSigamt.areaEmpreendimento}</span>
              </div>
            </div>
          </div>

          {/* Processo e Interessados */}
          <div className="border border-black text-[11px] divide-y divide-black">
            <div className="p-1 px-2">
              <span className="block font-bold text-[9px] uppercase text-slate-600">NÚMERO DO PROCESSO:</span>
              <span className="font-bold">{report.folhaRostoSigamt.numeroProcesso}</span>
            </div>
            <div className="p-1 px-2">
              <span className="block font-bold text-[9px] uppercase text-slate-600">INTERESSADOS:</span>
              <span className="font-bold">{report.folhaRostoSigamt.interessados}</span>
            </div>
          </div>

          {/* Objetivo */}
          <div className="border border-black p-2 text-[11px] text-justify leading-relaxed">
            <span className="block font-bold text-[9px] uppercase text-slate-600 mb-1">OBJETIVO:</span>
            <p className="whitespace-pre-line text-slate-900">{report.folhaRostoSigamt.objetivoTexto}</p>
          </div>

          {/* Autos/Termos Lavrados */}
          <div className="border border-black text-[11px] divide-y divide-black">
            <div className="p-1 px-2 bg-slate-100 font-bold uppercase text-[9px] text-slate-800">
              AUTOS/TERMOS LAVRADOS:
            </div>
            <div className="grid grid-cols-12 divide-x divide-black p-1 text-[10px]">
              <div className="col-span-4 px-1.5"><strong>NÚMERO:</strong> {report.folhaRostoSigamt.autosLavrados[0]?.numero}</div>
              <div className="col-span-4 px-1.5"><strong>TIPO:</strong> {report.folhaRostoSigamt.autosLavrados[0]?.tipo}</div>
              <div className="col-span-4 px-1.5"><strong>DATA:</strong> {report.folhaRostoSigamt.autosLavrados[0]?.data}</div>
            </div>
          </div>

          {/* Equipe Técnica SIGAMT */}
          <div className="border border-black text-[11px] divide-y divide-black">
            <div className="p-1 px-2 bg-slate-100 font-bold uppercase text-[9px] text-slate-800">
              EQUIPE TÉCNICA:
            </div>
            {report.folhaRostoSigamt.equipeTecnica.map((m, idx) => (
              <div key={idx} className="grid grid-cols-12 divide-x divide-black p-1 text-[10px]">
                <div className="col-span-7 px-1.5"><strong>NOME:</strong> {m.nome}</div>
                <div className="col-span-5 px-1.5"><strong>CARGO:</strong> {m.cargo}</div>
              </div>
            ))}
          </div>

          {/* Rodapé da Capa */}
          <div className="flex justify-between items-center text-[9px] text-slate-500 pt-2 border-t border-slate-200 font-mono">
            <span>Relatório Técnico nº {report.folhaRostoSigamt.numeroRelatorioTecnico}</span>
            <span>SIGAMT</span>
            <span className="font-bold text-black">Página 1 de 1</span>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* ABA 3: EDITOR DE TEXTO DA MINUTA (EDIÇÃO LIVRE DO SERVIDOR)               */}
      {/* ========================================================================= */}
      {activeTab === 'editor' && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <label className="text-xs font-bold text-slate-700">
                Servidor Responsável pela Edição/Revisão:
              </label>
              <input
                type="text"
                value={editorAuthor}
                onChange={e => setEditorAuthor(e.target.value)}
                className="text-xs p-1.5 border border-slate-300 rounded-lg bg-white font-medium"
              />
            </div>
            <div className="text-xs text-slate-500">
              {editorText.length} caracteres | {editorText.split(/\s+/).filter(Boolean).length} palavras
            </div>
          </div>

          <textarea
            rows={28}
            value={editorText}
            onChange={e => setEditorText(e.target.value)}
            className="w-full font-mono text-xs sm:text-sm p-4 border border-slate-300 rounded-xl bg-white shadow-xs leading-relaxed focus:ring-2 focus:ring-emerald-500"
          />
        </div>
      )}
    </div>
  );
};
